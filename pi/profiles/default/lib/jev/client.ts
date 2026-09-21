import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
	TypeSafeClient,
	type EntryType,
	type Fetch,
	type Question,
	type Questions,
	type SystemOneResult,
} from "@typesafe-ai/sdk";

export const JEV_API_KEY_NAME = "JEV_API_KEY" as const;
export const JEV_API_KEY_ID = "78faf76c-7df9-4ece-9c9a-b4cc01203215" as const;
export const JEV_ENDPOINT = "https://api.typesafe.ai" as const;
export const DEFAULT_JEV_MODEL = "jev-1.13.0" as const;

const execFileAsync = promisify(execFile);
type Exec = (command: string, args: string[], options: { timeout: number; signal?: AbortSignal }) => Promise<{ stdout: string; stderr: string }>;
export type JevCredentialResolver = (signal?: AbortSignal) => Promise<string>;
export type JevQuestions = Questions;
export type JevResult<Q extends Questions> = SystemOneResult<Q>;

export class JevClientError extends Error {
	readonly code: "credential" | "request" | "response" | "cancelled" | "timeout";

	constructor(code: JevClientError["code"], message: string) {
		super(message);
		this.name = "JevClientError";
		this.code = code;
	}
}

async function defaultExec(command: string, args: string[], options: { timeout: number; signal?: AbortSignal }): Promise<{ stdout: string; stderr: string }> {
	return execFileAsync(command, args, { ...options, windowsHide: true, maxBuffer: 64 * 1024 });
}

function parseCredential(stdout: string): string {
	let record: unknown;
	try { record = JSON.parse(stdout); } catch { throw new JevClientError("credential", "Jev credential response was invalid"); }
	if (!record || typeof record !== "object") throw new JevClientError("credential", "Jev credential response was invalid");
	const value = record as { key?: unknown; value?: unknown };
	if (value.key !== JEV_API_KEY_NAME || typeof value.value !== "string" || value.value.length === 0)
		throw new JevClientError("credential", "Jev credential record was not the expected record");
	return value.value;
}

export function createJevCredentialResolver(exec: Exec = defaultExec): JevCredentialResolver {
	return async (signal) => {
		const environmentKey = process.env[JEV_API_KEY_NAME]?.trim();
		if (environmentKey) return environmentKey;
		if (!process.env.BITWARDEN_ACCESS_KEY) throw new JevClientError("credential", "Jev credential is unavailable");
		try {
			const result = await exec("uv", ["run", "--with", "bitwarden-sdk==2.1.0", "python", fileURLToPath(new URL("../../extensions/web-tools/credential.py", import.meta.url)), JEV_API_KEY_ID], { timeout: 20_000, signal });
			return parseCredential(result.stdout);
		} catch (error) {
			if (error instanceof JevClientError) throw error;
			if (signal?.aborted) throw new JevClientError("cancelled", "Jev credential lookup was cancelled");
			throw new JevClientError("credential", "Jev credential lookup failed");
		}
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: object, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(value, key);
}

function sameValue(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) return true;
	if (Array.isArray(left) || Array.isArray(right)) {
		return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => sameValue(item, right[index]));
	}
	if (isRecord(left) && isRecord(right)) {
		const leftKeys = Object.keys(left);
		const rightKeys = Object.keys(right);
		return leftKeys.length === rightKeys.length && leftKeys.every((key) => hasOwn(right, key) && sameValue(left[key], right[key]));
	}
	return false;
}

function isProbability(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function validateAnswer(question: Question, answer: unknown): Record<string, unknown> {
	if (!isRecord(answer) || answer.type !== question.type) throw new JevClientError("response", "Jev returned an answer with the wrong type");
	if (question.type === "noul") {
		if (!isProbability(answer.noul)) throw new JevClientError("response", "Jev returned an invalid Noul answer");
		return { type: "noul", noul: answer.noul };
	}
	if (typeof answer.confidence !== "number" || !isProbability(answer.confidence) || !isRecord(answer.probabilities))
		throw new JevClientError("response", "Jev returned invalid answer metadata");
	const labels = question.type === "choice" ? Object.keys(question.criteria) : question.criteria.map((_entry, index) => String(index));
	const probabilities = answer.probabilities;
	if (Object.keys(probabilities).length !== labels.length || labels.some((label) => !hasOwn(probabilities, label) || !isProbability(probabilities[label])))
		throw new JevClientError("response", "Jev returned invalid probabilities");
	if (question.type === "choice") {
		if (typeof answer.choice !== "string" || !labels.includes(answer.choice)) throw new JevClientError("response", "Jev returned an unknown choice");
		return { type: "choice", choice: answer.choice, confidence: answer.confidence, probabilities: Object.fromEntries(labels.map((label) => [label, probabilities[label]])) };
	}
	if (typeof answer.score !== "number" || !Number.isFinite(answer.score) || answer.score < 0 || answer.score > labels.length - 1)
		throw new JevClientError("response", "Jev returned an invalid score");
	const legend = answer.legend;
	if (!isRecord(legend) || Object.keys(legend).length !== labels.length || labels.some((label, index) => !hasOwn(legend, label) || !sameValue(legend[label], question.criteria[index])))
		throw new JevClientError("response", "Jev returned an invalid score legend");
	return { type: "score", score: answer.score, confidence: answer.confidence, legend: Object.fromEntries(labels.map((label, index) => [label, question.criteria[index]])), probabilities: Object.fromEntries(labels.map((label) => [label, probabilities[label]])) };
}

function validateResult<Q extends Questions>(questions: Q, result: unknown): JevResult<Q> {
	if (!isRecord(result) || typeof result.model !== "string" || !result.model || !isRecord(result.answers) || !isRecord(result.usage))
		throw new JevClientError("response", "Jev returned an invalid result");
	const answerNames = Object.keys(result.answers);
	const questionNames = Object.keys(questions);
	if (answerNames.length !== questionNames.length || questionNames.some((name) => !hasOwn(result.answers as object, name)))
		throw new JevClientError("response", "Jev returned answers for the wrong questions");
	const answers: Record<string, Record<string, unknown>> = Object.create(null);
	for (const name of questionNames) answers[name] = validateAnswer(questions[name], result.answers[name]);
	const usage = result.usage;
	const inputTokens = usage.input_tokens;
	const outputTokens = usage.output_tokens;
	if (![inputTokens, outputTokens].every((value) => typeof value === "number" && Number.isInteger(value) && value >= 0))
		throw new JevClientError("response", "Jev returned invalid usage metadata");
	const validated = { model: result.model, answers, usage: { input_tokens: inputTokens, output_tokens: outputTokens } };
	return validated as unknown as JevResult<Q>;
}

export interface JevClientOptions {
	readonly apiKey?: string;
	readonly credentialResolver?: JevCredentialResolver;
	readonly fetch?: Fetch;
	readonly timeoutMs?: number;
	readonly model?: string;
}

export interface JevClient {
	evaluate<Q extends Questions>(state: EntryType, questions: Q, options?: { signal?: AbortSignal; timeoutMs?: number; model?: string }): Promise<JevResult<Q>>;
}

export function createJevClient(options: JevClientOptions = {}): JevClient {
	const resolveCredential = options.credentialResolver ?? createJevCredentialResolver();
	let client: TypeSafeClient | undefined;
	let resolvedApiKey: string | undefined;
	let credentialLookup: Promise<string> | undefined;
	const getApiKey = (signal?: AbortSignal): Promise<string> => {
		const configuredKey = options.apiKey?.trim() || process.env[JEV_API_KEY_NAME]?.trim();
		if (configuredKey) return Promise.resolve(configuredKey);
		if (resolvedApiKey) return Promise.resolve(resolvedApiKey);
		credentialLookup ??= resolveCredential(signal).then((key) => {
			resolvedApiKey = key;
			return key;
		}).finally(() => { credentialLookup = undefined; });
		return credentialLookup;
	};
	return {
		evaluate: async (state, questions, requestOptions = {}) => {
			if (!isRecord(questions) || Object.keys(questions).length === 0) throw new JevClientError("request", "Jev requires at least one question");
			const signal = requestOptions.signal;
			if (signal?.aborted) throw new JevClientError("cancelled", "Jev request was cancelled");
			try {
				const apiKey = await getApiKey(signal);
				client ??= new TypeSafeClient({ apiKey, baseURL: JEV_ENDPOINT, defaultModel: options.model ?? DEFAULT_JEV_MODEL, fetch: options.fetch, timeout: options.timeoutMs ?? 10_000, retry: { maxRetries: 2 }, logLevel: "off" });
				const request = requestOptions.model === undefined ? { state, questions } : { state, questions, model: requestOptions.model };
				const result = await client.systemOne(request, { signal, timeout: requestOptions.timeoutMs ?? options.timeoutMs ?? 10_000, retry: { maxRetries: 2 } });
				return validateResult(questions, result);
			} catch (error) {
				if (error instanceof JevClientError) throw error;
				if (signal?.aborted) throw new JevClientError("cancelled", "Jev request was cancelled");
				if (error instanceof Error && error.name === "APITimeoutError") throw new JevClientError("timeout", "Jev request timed out");
				throw new JevClientError("request", "Jev request failed");
			}
		},
	};
}

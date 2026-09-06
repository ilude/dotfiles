import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { getBuiltinModels } from "@earendil-works/pi-ai/providers/all";
import type {
	ExecResult,
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	awsProfileRegions,
	type BedrockAuthEnvironment,
	type BedrockTarget,
	parseAwsIni,
	resolveBedrockTarget,
} from "./bedrock-auth.ts";
import {
	CLAUDE_FAMILIES,
	selectLatestClaudeModelIds,
} from "./bedrock-model-policy.js";
import {
	getSettingsPath,
	updateJsonObjectAtomic,
} from "./settings-file.ts";

const POLL_TIMEOUT_MS = 60_000;
const AWS_OUTPUT_MAX_BYTES = 10 * 1024 * 1024;
const execFileAsync = promisify(execFile);

interface AwsExecutionOptions {
	env?: NodeJS.ProcessEnv;
	signal?: AbortSignal;
}

type AwsExecutor = (
	args: string[],
	options: AwsExecutionOptions,
) => Promise<ExecResult>;

export interface BedrockModelMetadata {
	id: string;
	kind: "foundation" | "inference-profile";
	[key: string]: unknown;
}

export interface BedrockRefreshResult {
	profile: string;
	region: string;
	settingsFile: string;
	current: string[];
	latest: Record<string, string | null>;
	recommended: string[];
	missing: string[];
	stale: string[];
	catalog: BedrockModelMetadata[];
}

function resolveHomePath(filePath: string): string {
	if (filePath === "~") return os.homedir();
	if (filePath.startsWith("~/") || filePath.startsWith("~\\"))
		return path.join(os.homedir(), filePath.slice(2));
	return filePath;
}

function configuredProfileRegions(): Record<string, string> {
	const configPath = resolveHomePath(
		process.env.AWS_CONFIG_FILE ?? path.join(os.homedir(), ".aws", "config"),
	);
	if (!fs.existsSync(configPath)) return {};
	return awsProfileRegions(parseAwsIni(fs.readFileSync(configPath, "utf-8")));
}

async function providerEnvironment(
	ctx: ExtensionContext,
): Promise<BedrockAuthEnvironment | undefined> {
	const model = ctx.modelRegistry
		.getAll()
		.find((candidate) => candidate.provider === "amazon-bedrock");
	if (!model) return undefined;
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok) throw new Error(auth.error);
	return auth.env as BedrockAuthEnvironment | undefined;
}

function awsArgs(target: BedrockTarget, commandArgs: string[]): string[] {
	return [
		...(target.profile ? ["--profile", target.profile] : []),
		...commandArgs,
	];
}

function scopedAwsEnvironment(
	target: BedrockTarget,
	providerEnv: BedrockAuthEnvironment | undefined,
): NodeJS.ProcessEnv | undefined {
	if (target.credentialSource !== "non-profile" || !providerEnv)
		return undefined;
	const env: NodeJS.ProcessEnv = { ...process.env };
	delete env.AWS_PROFILE;
	delete env.AWS_DEFAULT_PROFILE;
	for (const [key, value] of Object.entries(providerEnv)) {
		if (key === "AWS_PROFILE" || key === "AWS_DEFAULT_PROFILE") continue;
		if (value) env[key] = value;
	}
	return env;
}

function createAwsExecutor(pi: ExtensionAPI): AwsExecutor {
	return async (args, options) => {
		if (!options.env)
			return pi.exec("aws", args, {
				timeout: POLL_TIMEOUT_MS,
				signal: options.signal,
			});
		try {
			const result = await execFileAsync("aws", args, {
				env: options.env,
				maxBuffer: AWS_OUTPUT_MAX_BYTES,
				signal: options.signal,
				timeout: POLL_TIMEOUT_MS,
				windowsHide: true,
			});
			return {
				stdout: result.stdout,
				stderr: result.stderr,
				code: 0,
				killed: false,
			};
		} catch (error) {
			const failure = error as Error & {
				code?: number;
				killed?: boolean;
				stdout?: string;
				stderr?: string;
			};
			return {
				stdout: failure.stdout ?? "",
				stderr: failure.stderr ?? failure.message,
				code: typeof failure.code === "number" ? failure.code : 1,
				killed: failure.killed ?? false,
			};
		}
	};
}

async function awsJson(
	executeAws: AwsExecutor,
	target: BedrockTarget,
	commandArgs: string[],
	options: AwsExecutionOptions,
): Promise<Record<string, unknown>> {
	const result = await executeAws(awsArgs(target, commandArgs), options);
	if (result.code !== 0) {
		const output = [result.stdout.trim(), result.stderr.trim()]
			.filter(Boolean)
			.join("\n");
		throw new Error(output || `aws ${commandArgs.join(" ")} failed`);
	}
	return JSON.parse(result.stdout) as Record<string, unknown>;
}

const SENSITIVE_METADATA_KEYS = /(?:credential|header|token|secret|password|authorization|api.?key)/i;

function safeMetadata(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(safeMetadata);
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.entries(value)
			.filter(([key]) => !SENSITIVE_METADATA_KEYS.test(key))
			.map(([key, nested]) => [key, safeMetadata(nested)]),
	);
}

function metadataEntries(
	payload: Record<string, unknown>,
	listKey: string,
	idKey: string,
	kind: BedrockModelMetadata["kind"],
): BedrockModelMetadata[] {
	const rawList = payload[listKey];
	if (!Array.isArray(rawList)) return [];
	return rawList.flatMap((item) => {
		if (item === null || typeof item !== "object") return [];
		const safe = safeMetadata(item) as Record<string, unknown>;
		const id = safe[idKey];
		return typeof id === "string" ? [{ ...safe, id, kind }] : [];
	});
}

async function runPoll(
	ctx: ExtensionContext,
	executeAws: AwsExecutor,
): Promise<BedrockRefreshResult> {
	const providerEnv = await providerEnvironment(ctx);
	const target = resolveBedrockTarget({
		providerEnv,
		processEnv: process.env as BedrockAuthEnvironment,
		profileRegions: configuredProfileRegions(),
	});
	const executionOptions: AwsExecutionOptions = {
		env: scopedAwsEnvironment(target, providerEnv),
		signal: ctx.signal,
	};
	const [foundation, profiles] = await Promise.all([
		awsJson(
			executeAws,
			target,
			[
				"bedrock",
				"list-foundation-models",
				"--region",
				target.region,
				"--by-provider",
				"Anthropic",
				"--output",
				"json",
			],
			executionOptions,
		),
		awsJson(
			executeAws,
			target,
			[
				"bedrock",
				"list-inference-profiles",
				"--region",
				target.region,
				"--type-equals",
				"SYSTEM_DEFINED",
				"--output",
				"json",
			],
			executionOptions,
		),
	]);
	const foundationCatalog = metadataEntries(
		foundation,
		"modelSummaries",
		"modelId",
		"foundation",
	);
	const profileCatalog = metadataEntries(
		profiles,
		"inferenceProfileSummaries",
		"inferenceProfileId",
		"inference-profile",
	);
	const catalog = [...foundationCatalog, ...profileCatalog].sort((left, right) =>
		left.id.localeCompare(right.id),
	);
	const modelIds = new Set(catalog.map((entry) => entry.id));
	const allModelIds = [...modelIds].sort();
	const settingsFile = getSettingsPath();
	const settings = JSON.parse(fs.readFileSync(settingsFile, "utf-8")) as Record<
		string,
		unknown
	>;
	const refreshSettings =
		settings.bedrockRefresh !== null &&
		typeof settings.bedrockRefresh === "object" &&
		!Array.isArray(settings.bedrockRefresh)
			? (settings.bedrockRefresh as Record<string, unknown>)
			: {};
	const current = Array.isArray(refreshSettings.models)
		? refreshSettings.models.filter(
				(value): value is string =>
					typeof value === "string" && value.startsWith("us.anthropic.claude-"),
			)
		: [];

	const knownBedrockIds = new Set([
		...getBuiltinModels("amazon-bedrock").map((model) => model.id),
		...ctx.modelRegistry
			.getAll()
			.filter((model) => model.provider === "amazon-bedrock")
			.map((model) => model.id),
	]);
	const recommended = selectLatestClaudeModelIds(
		allModelIds.filter((modelId) => knownBedrockIds.has(modelId)),
		"us.anthropic",
	);
	const latest: Record<string, string | null> = {};
	for (const family of CLAUDE_FAMILIES) {
		latest[family] =
			recommended.find((modelId) =>
				modelId.startsWith(`us.anthropic.claude-${family}-`),
			) ?? null;
	}

	const missing = recommended.filter((modelId) => !current.includes(modelId));
	const stale = current.filter((modelId) => !recommended.includes(modelId));
	return {
		profile: target.profile ?? "default credential chain",
		region: target.region,
		settingsFile,
		current,
		latest,
		recommended,
		missing,
		stale,
		catalog,
	};
}

export async function refreshBedrockModelInventory(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
): Promise<BedrockRefreshResult & { changed: boolean }> {
	const result = await runPoll(ctx, createAwsExecutor(pi));
	const changed = await updateJsonObjectAtomic(getSettingsPath(), (settings) => {
		const refreshSettings =
			settings.bedrockRefresh !== null &&
				typeof settings.bedrockRefresh === "object" &&
				!Array.isArray(settings.bedrockRefresh)
				? (settings.bedrockRefresh as Record<string, unknown>)
				: {};
		const existingModels = Array.isArray(refreshSettings.models)
			? refreshSettings.models
			: [];
		const existingCatalog = Array.isArray(refreshSettings.catalog)
			? refreshSettings.catalog
			: [];
		if (
			JSON.stringify(existingModels) === JSON.stringify(result.recommended) &&
			JSON.stringify(existingCatalog) === JSON.stringify(result.catalog)
		)
			return settings;
		return {
			...settings,
			bedrockRefresh: {
				...refreshSettings,
				models: result.recommended,
				catalog: result.catalog,
			},
		};
	});
	return { ...result, changed };
}

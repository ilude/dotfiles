import { asString, asStringArray, asNumber, asReasoningLevelArray } from "./values.ts";
import type { InputKind, ThinkingLevelMap, RemoteModelInfo } from "./types.ts";

function normalizeBaseUrl(raw: string): string {
	return raw.replace(/\/+$/, "");
}

const PI_THINKING_LEVELS = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
] as const;

function buildThinkingLevelMap(
	supportedLevels: string[],
): ThinkingLevelMap | undefined {
	const supported = new Set(supportedLevels.filter(Boolean));
	if (supported.size === 0) return undefined;
	return Object.fromEntries(
		PI_THINKING_LEVELS.map((level) => [
			level,
			supported.has(level) ? level : null,
		]),
	) as ThinkingLevelMap;
}

function extractModelIds(payload: unknown): string[] {
	const extractFromArray = (arr: unknown[]): string[] => {
		const ids: string[] = [];
		for (const item of arr) {
			if (typeof item === "string" && item.trim()) {
				ids.push(item.trim());
				continue;
			}
			if (!item || typeof item !== "object") continue;
			const record = item as Record<string, unknown>;
			const id =
				asString(record.id) ?? asString(record.model) ?? asString(record.slug);
			if (id) ids.push(id);
		}
		return ids;
	};

	if (Array.isArray(payload))
		return Array.from(new Set(extractFromArray(payload)));
	if (!payload || typeof payload !== "object") return [];

	const record = payload as Record<string, unknown>;
	const listCandidates = [record.models, record.data, record.items].filter(
		Array.isArray,
	) as unknown[][];
	for (const list of listCandidates) {
		const ids = extractFromArray(list);
		if (ids.length > 0) return Array.from(new Set(ids));
	}
	return [];
}

async function fetchJson(
	url: string,
	headers: Record<string, string>,
): Promise<unknown> {
	const response = await fetch(url, { method: "GET", headers });
	const text = await response.text().catch(() => "");
	const snippet = text.replace(/\s+/g, " ").trim().slice(0, 120);
	if (!response.ok) {
		const detail = /^<!doctype html|^<html/i.test(snippet)
			? "HTML response"
			: snippet;
		throw new Error(
			`${url} returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
		);
	}
	if (!text) return {};
	try {
		return JSON.parse(text) as unknown;
	} catch {
		throw new Error(
			`${url} returned non-JSON response${snippet ? `: ${snippet}` : ""}`,
		);
	}
}

async function fetchAnthropicCatalog(
	baseUrl: string,
	apiKey: string,
	headers?: Record<string, string>,
) {
	const normalized = normalizeBaseUrl(baseUrl);
	const requestHeaders: Record<string, string> = {
		Accept: "application/json",
		...(headers ?? {}),
		"x-api-key": apiKey,
		"anthropic-version": "2023-06-01",
		"anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
		"user-agent": "claude-cli/2.1.75",
		"x-app": "cli",
	};
	return fetchJson(`${normalized}/v1/models?limit=100`, requestHeaders);
}

export async function fetchProviderCatalog(params: {
	provider: string;
	baseUrl: string;
	apiKey: string;
	headers?: Record<string, string>;
}): Promise<unknown> {
	if (params.provider === "openai") {
		throw new Error("OpenAI model discovery is owned by the native provider; use modelRegistry.refresh");
	}
	if (params.provider === "openai-codex") {
		throw new Error("The historic openai-codex catalog transport is not used by the default profile");
	}
	if (params.provider === "anthropic") {
		return fetchAnthropicCatalog(params.baseUrl, params.apiKey, params.headers);
	}

	const normalized = normalizeBaseUrl(params.baseUrl);
	const catalogUrl =
		params.provider === "opencode" || params.provider === "opencode-go"
			? `${normalized}/v1/models`
			: `${normalized}/models`;
	const headers: Record<string, string> = {
		Accept: "application/json",
		Authorization: `Bearer ${params.apiKey}`,
		...(params.headers ?? {}),
	};
	return fetchJson(catalogUrl, headers);
}

function parseOpenAICodexRemoteModels(payload: unknown): RemoteModelInfo[] {
	if (!payload || typeof payload !== "object") return [];
	const models = (payload as Record<string, unknown>).models;
	if (!Array.isArray(models)) return [];

	const parsed: RemoteModelInfo[] = [];
	for (const item of models) {
		if (!item || typeof item !== "object") continue;
		const record = item as Record<string, unknown>;
		const id =
			asString(record.slug) ?? asString(record.id) ?? asString(record.model);
		if (!id) continue;

		const visibility = asString(record.visibility)?.toLowerCase();
		if (visibility === "hide" || visibility === "hidden") continue;
		if (record.supported_in_api === false) continue;

		const inputModalities = asStringArray(record.input_modalities);
		const input: InputKind[] = inputModalities.includes("image")
			? ["text", "image"]
			: ["text"];
		const supportedReasoning = asReasoningLevelArray(
			record.supported_reasoning_levels,
		);
		const reasoning =
			supportedReasoning.length > 0 ||
			!!asString(record.default_reasoning_level);

		parsed.push({
			id,
			name: asString(record.display_name) ?? asString(record.name),
			api: "openai-codex-responses",
			reasoning,
			input,
			contextWindow:
				asNumber(record.context_window) ?? asNumber(record.max_context_window),
			thinkingLevelMap: buildThinkingLevelMap(supportedReasoning),
		});
	}
	return parsed;
}

function parseAnthropicRemoteModels(payload: unknown): RemoteModelInfo[] {
	if (!payload || typeof payload !== "object") return [];
	const data = (payload as Record<string, unknown>).data;
	if (!Array.isArray(data)) return [];

	const parsed: RemoteModelInfo[] = [];
	for (const item of data) {
		if (!item || typeof item !== "object") continue;
		const record = item as Record<string, unknown>;
		const id =
			asString(record.id) ?? asString(record.model) ?? asString(record.slug);
		if (!id) continue;

		const capabilities =
			record.capabilities && typeof record.capabilities === "object"
				? (record.capabilities as Record<string, unknown>)
				: undefined;
		const effort =
			capabilities?.effort && typeof capabilities.effort === "object"
				? (capabilities.effort as Record<string, unknown>)
				: undefined;
		const effortSupported =
			typeof effort?.supported === "boolean" ? effort.supported : undefined;

		parsed.push({
			id,
			name: asString(record.display_name) ?? asString(record.name),
			api: "anthropic-messages",
			reasoning: effortSupported,
			contextWindow: asNumber(record.max_input_tokens),
			maxTokens: asNumber(record.max_tokens),
		});
	}
	return parsed;
}

function parseGenericRemoteModels(payload: unknown): RemoteModelInfo[] {
	const ids = extractModelIds(payload);
	return ids.map((id) => ({ id }));
}

export function parseRemoteModels(
	provider: string,
	payload: unknown,
): RemoteModelInfo[] {
	if (provider === "openai-codex") return parseOpenAICodexRemoteModels(payload);
	if (provider === "anthropic") return parseAnthropicRemoteModels(payload);
	return parseGenericRemoteModels(payload);
}


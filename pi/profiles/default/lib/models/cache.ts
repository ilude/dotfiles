import * as fs from "node:fs";
import * as path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { writeJsonObjectAtomic } from "../settings-file.ts";
import { asString, asStringArray, asNumber } from "./values.ts";
import type { InputKind, ThinkingLevelMap, RemoteModelInfo, ProviderCatalogCache } from "./types.ts";
const MODEL_CACHE_SCHEMA_VERSION = 2;

function refreshCacheDir(): string {
	return path.join(getAgentDir(), "model-cache", "refresh-models");
}

function cachePath(provider: string): string {
	return path.join(refreshCacheDir(), `${provider}.json`);
}

export async function writeProviderCache(
	provider: string,
	models: RemoteModelInfo[],
): Promise<void> {
	await writeJsonObjectAtomic(cachePath(provider), {
		schemaVersion: MODEL_CACHE_SCHEMA_VERSION,
		provider,
		fetchedAt: new Date().toISOString(),
		models,
	});
}

function legacyCacheModels(models: unknown[]): RemoteModelInfo[] {
	return models.flatMap((model) => {
		if (!model || typeof model !== "object") return [];
		const record = model as Record<string, unknown>;
		const id = asString(record.id);
		if (!id) return [];
		return [
			{
				id,
				name: asString(record.name),
				api: asString(record.api),
				reasoning:
					typeof record.reasoning === "boolean" ? record.reasoning : undefined,
				input: asStringArray(record.input).filter(
					(value): value is InputKind => value === "text" || value === "image",
				),
				contextWindow: asNumber(record.contextWindow),
				maxTokens: asNumber(record.maxTokens),
				thinkingLevelMap:
					record.thinkingLevelMap &&
					typeof record.thinkingLevelMap === "object" &&
					!Array.isArray(record.thinkingLevelMap)
						? (record.thinkingLevelMap as ThinkingLevelMap)
						: undefined,
			},
		];
	});
}

export function loadProviderCache(provider: string): ProviderCatalogCache | undefined {
	const filePath = cachePath(provider);
	if (!fs.existsSync(filePath)) return undefined;
	const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<
		string,
		unknown
	>;
	if (!Array.isArray(parsed.models)) {
		throw new Error(`Invalid cached model catalog: ${filePath}`);
	}
	if (parsed.schemaVersion === MODEL_CACHE_SCHEMA_VERSION) {
		if (
			parsed.provider !== provider ||
			typeof parsed.fetchedAt !== "string"
		) {
			throw new Error(`Invalid cached model catalog: ${filePath}`);
		}
		return parsed as ProviderCatalogCache;
	}
	return {
		schemaVersion: MODEL_CACHE_SCHEMA_VERSION,
		provider,
		fetchedAt: "legacy",
		models: legacyCacheModels(parsed.models),
	};
}


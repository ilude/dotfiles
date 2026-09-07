import fs from "node:fs/promises";
import path from "node:path";
import { canonicalWithin, checkCancelled, isMissing, selectedProfiles, type ProfileId, type ProfileRegistry } from "./profiles.js";
import { discoverSessions, selectSessions, type SessionRef } from "./sessions.js";

export type SourceColumn = { name: string; type: "VARCHAR" | "BIGINT" | "DOUBLE" | "BOOLEAN"; paths: readonly string[] };
const column = (name: string, type: SourceColumn["type"], ...paths: string[]): SourceColumn => ({ name, type, paths });
export const SOURCE_IDS = ["session_entries", "bedrock_usage", "codex_cache_observations"] as const;
export type AnalyticsSourceId = (typeof SOURCE_IDS)[number];
export type SourceDefinition = { name: AnalyticsSourceId; profiles: readonly ProfileId[]; columns: readonly SourceColumn[]; file?: string };
export const registeredSources: readonly SourceDefinition[] = [
	{ name: "session_entries", profiles: ["default", "legacy"], columns: [
		column("entry_type", "VARCHAR", "$.type"), column("parent_id", "VARCHAR", "$.parentId"),
		column("message_role", "VARCHAR", "$.message.role"), column("tool_name", "VARCHAR", "$.message.toolName"),
		column("tool_call_id", "VARCHAR", "$.message.toolCallId"), column("is_error", "BOOLEAN", "$.message.isError"),
		column("provider", "VARCHAR", "$.message.provider", "$.provider"), column("model", "VARCHAR", "$.message.model", "$.modelId"),
		column("input_tokens", "BIGINT", "$.message.usage.input"), column("output_tokens", "BIGINT", "$.message.usage.output"),
		column("cache_read_tokens", "BIGINT", "$.message.usage.cacheRead"), column("cache_write_tokens", "BIGINT", "$.message.usage.cacheWrite"),
		column("cost_usd", "DOUBLE", "$.message.usage.cost.total"),
	] },
	{ name: "bedrock_usage", profiles: ["default"], file: "bedrock-usage.jsonl", columns: [
		column("provider", "VARCHAR", "$.provider"), column("model", "VARCHAR", "$.model"),
		column("target", "VARCHAR", "$.target"), column("transport", "VARCHAR", "$.transport"), column("region", "VARCHAR", "$.region"),
		column("input_tokens", "BIGINT", "$.usage.input"), column("output_tokens", "BIGINT", "$.usage.output"),
		column("cache_read_tokens", "BIGINT", "$.usage.cacheRead"), column("cache_write_tokens", "BIGINT", "$.usage.cacheWrite"),
		column("cost_usd", "DOUBLE", "$.pricing.total"), column("pricing_status", "VARCHAR", "$.pricing.status"),
	] },
	{ name: "codex_cache_observations", profiles: ["default"], file: "codex-cache.jsonl", columns: [
		column("model", "VARCHAR", "$.model"), column("input_tokens", "BIGINT", "$.input"), column("cache_read_tokens", "BIGINT", "$.cacheRead"),
	] },
];
export const commonColumns = [
	{ name: "_profile", type: "VARCHAR" }, { name: "_source_file", type: "VARCHAR" },
	{ name: "_record_key", type: "VARCHAR" }, { name: "_timestamp", type: "TIMESTAMPTZ" },
	{ name: "session_id", type: "VARCHAR" }, { name: "record", type: "JSON" },
];
export function analyticsCatalog() {
	return registeredSources.map(source => ({ source: source.name, view: source.name, profiles: source.profiles,
		columns: [...commonColumns, ...source.columns.map(({ name, type }) => ({ name, type }))],
		hint: `SELECT _profile, _source_file, _record_key FROM ${source.name} WHERE _timestamp >= $since::TIMESTAMPTZ ORDER BY _timestamp`,
	}));
}
export type SelectedFile = { file: string; root: string; profile: ProfileId; sessionId: string | null };
export type SelectedSource = { definition: SourceDefinition; files: SelectedFile[] };
export type SourceSelection = { registry: ProfileRegistry; profiles?: readonly ProfileId[]; sources: readonly AnalyticsSourceId[]; sessionRefs?: readonly SessionRef[]; signal?: AbortSignal };

export async function selectSources(options: SourceSelection): Promise<SelectedSource[]> {
	const profiles = selectedProfiles(options.registry, options.profiles);
	if (!options.sources.length) throw new Error("analytics sources must not be empty");
	if (options.sessionRefs && !options.sources.includes("session_entries")) throw new Error("analytics sessionRefs requires session_entries");
	const definitions = [...new Set(options.sources)].map(name => {
		const definition = registeredSources.find(source => source.name === name);
		if (!definition) throw new Error(`unknown analytics source: ${name}`);
		for (const profile of profiles) if (!definition.profiles.includes(profile)) throw new Error(`unsupported analytics profile/source: ${profile}/${name}`);
		return definition;
	});
	const roots = new Map<ProfileId, string>();
	for (const profile of profiles) roots.set(profile, await fs.realpath(options.registry.roots[profile]));
	const result: SelectedSource[] = [];
	for (const definition of definitions) {
		checkCancelled(options.signal);
		const files: SelectedFile[] = [];
		if (definition.name === "session_entries") {
			const all = await discoverSessions(options.registry, profiles, options.signal);
			for (const item of options.sessionRefs ? selectSessions(all, options.sessionRefs, profiles) : all) {
				files.push({ file: item.file, root: roots.get(item.ref.profile)!, profile: item.ref.profile, sessionId: item.ref.sessionId });
			}
		} else {
			for (const profile of profiles) {
				const root = roots.get(profile)!;
				let file: string;
				try { file = await canonicalWithin(root, path.join(root, definition.file!)); }
				catch (error) { if (isMissing(error)) continue; throw error; }
				if (!(await fs.stat(file)).isFile()) throw new Error(`analytics input is not a regular file: ${file}`);
				if (!files.some(item => item.file === file)) files.push({ file, root, profile, sessionId: null });
			}
		}
		result.push({ definition, files });
	}
	return result;
}

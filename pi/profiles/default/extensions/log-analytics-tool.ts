import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { Check } from "typebox/value";
import { analyticsCatalog, queryAnalytics, sessionAnalytics, type AnalyticsRequest } from "../lib/log-analytics/api.js";
import { PROFILE_IDS, runtimeProfiles, type ProfileRegistry } from "../lib/log-analytics/profiles.js";
import { SOURCE_IDS } from "../lib/log-analytics/registry.js";
import { renderAnalyticsCall, renderAnalyticsResult } from "../lib/log-analytics/render.js";

export const analyticsSchema = Type.Object({
	operation: StringEnum(["catalog", "sessions", "query"] as const),
	profiles: Type.Optional(Type.Array(StringEnum(PROFILE_IDS), { minItems: 1, maxItems: 2, uniqueItems: true })),
	sources: Type.Optional(Type.Array(StringEnum(SOURCE_IDS), { minItems: 1, maxItems: 3, uniqueItems: true })),
	sessionRefs: Type.Optional(Type.Array(Type.Object({
		profile: StringEnum(PROFILE_IDS), sessionId: Type.String({ minLength: 1, maxLength: 256 }),
		fileKey: Type.Optional(Type.String({ pattern: "^[a-f0-9]{64}$" })),
	}, { additionalProperties: false }), { minItems: 1, maxItems: 1000 })),
	sql: Type.Optional(Type.String({ minLength: 1, maxLength: 32_000 })),
	parameters: Type.Optional(Type.Record(Type.String(), Type.Union([Type.String(), Type.Number(), Type.Boolean(), Type.Null()]))),
	maxRows: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
	cwd: Type.Optional(Type.String({ maxLength: 32_000 })),
	sessionIds: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 256 }), { minItems: 1, maxItems: 1000 })),
	cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 1024 })),
}, { additionalProperties: false });
export type LogAnalyticsInput = Static<typeof analyticsSchema>;

/** Injection is extension-owned and used by offline fixtures, never a tool argument. */
export function registerLogAnalytics(pi: ExtensionAPI, resolveProfiles: () => Promise<ProfileRegistry> = runtimeProfiles): void {
	pi.registerTool({
		name: "log_analytics", label: "Log Analytics",
		description: "Search Pi session history and existing usage logs with bounded read-only DuckDB SQL. Catalog schemas, list session metadata, or query default, legacy, or both profiles. Exact sessionRefs reduce scans; SQL time filters do not. At most 1000 rows and 256 KiB encoded rows; corpus bounds fail explicitly.",
		parameters: analyticsSchema,
		renderCall: renderAnalyticsCall,
		renderResult: renderAnalyticsResult,
		async execute(_id, params, signal) {
			// Hooks may mutate tool arguments after Pi validation.
			if (!Check(analyticsSchema, params)) throw new Error("invalid log_analytics arguments");
			const allowed: Record<LogAnalyticsInput["operation"], readonly string[]> = {
				catalog: ["operation"],
				sessions: ["operation", "profiles", "cwd", "sessionIds", "maxRows", "cursor"],
				query: ["operation", "profiles", "sources", "sessionRefs", "sql", "parameters", "maxRows"],
			};
			if (Object.keys(params).some(key => !allowed[params.operation].includes(key))) throw new Error(`invalid fields for log_analytics ${params.operation}`);
			let details: unknown;
			if (params.operation === "catalog") details = { sources: analyticsCatalog(),
				defaults: { profiles: "active registered profile", timeoutMs: 5000, maxInputBytes: 536870912, threads: 2, memoryLimit: "1GB", maxRows: 1000, maxRowBytes: 262144 },
				limits: "Resource defaults have PI_ANALYTICS_* overrides. No arbitrary roots, new telemetry, or persistent index. Identical ID-less records are counted separately; record hashes are not unique occurrence IDs." };
			else if (params.operation === "sessions") details = await sessionAnalytics(await resolveProfiles(), params, signal);
			else {
				if (!params.sources || !params.sql) throw new Error("log_analytics query requires sources and sql");
				details = await queryAnalytics(await resolveProfiles(), params as AnalyticsRequest, signal);
			}
			return { content: [{ type: "text", text: JSON.stringify(details) }], details };
		},
	});
}
export default function logAnalyticsTool(pi: ExtensionAPI): void { registerLogAnalytics(pi); }

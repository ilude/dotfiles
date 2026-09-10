import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { Check } from "typebox/value";
import { analyticsCatalog, followUpAnalytics, queryAnalytics, searchAnalytics, sessionAnalytics, type AnalyticsRequest } from "../lib/log-analytics/api.js";
import { PROFILE_IDS, runtimeProfiles, type ProfileRegistry } from "../lib/log-analytics/profiles.js";
import { SOURCE_IDS } from "../lib/log-analytics/registry.js";
import type { OccurrenceRef } from "../lib/log-analytics/search.js";
import { renderAnalyticsCall, renderAnalyticsResult } from "../lib/log-analytics/render.js";

const profiles = Type.Optional(Type.Array(StringEnum(PROFILE_IDS), { minItems: 1, maxItems: 2, uniqueItems: true }));
const sessionRefs = Type.Optional(Type.Array(Type.Object({
	profile: StringEnum(PROFILE_IDS), sessionId: Type.String({ minLength: 1, maxLength: 256 }),
	fileKey: Type.Optional(Type.String({ pattern: "^[a-f0-9]{64}$" })),
}, { additionalProperties: false }), { minItems: 1, maxItems: 1000 }));
const filters = Type.Optional(Type.Object({
	entryTypes: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 256 }), { minItems: 1, maxItems: 100, uniqueItems: true })),
	messageRoles: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 256 }), { minItems: 1, maxItems: 100, uniqueItems: true })),
	toolNames: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 256 }), { minItems: 1, maxItems: 100, uniqueItems: true })),
	isError: Type.Optional(Type.Boolean()),
	text: Type.Optional(Type.String({ maxLength: 4096 })),
}, { additionalProperties: false }));
const interval = Type.Optional(Type.Object({ since: Type.String({ minLength: 1, maxLength: 128 }), until: Type.String({ minLength: 1, maxLength: 128 }) }, { additionalProperties: false }));
const occurrence = Type.Object({
	profile: StringEnum(PROFILE_IDS),
	session: Type.Object({
		profile: StringEnum(PROFILE_IDS), sessionId: Type.String({ minLength: 1, maxLength: 256 }),
		fileKey: Type.Optional(Type.String({ pattern: "^[a-f0-9]{64}$" })),
	}, { additionalProperties: false }),
	fileKey: Type.String({ pattern: "^[a-f0-9]{64}$" }), byteOffset: Type.Integer({ minimum: 0 }), byteLength: Type.Integer({ minimum: 1 }),
	recordOrdinal: Type.Integer({ minimum: 0 }), recordKey: Type.Union([Type.String({ minLength: 1, maxLength: 256 }), Type.Null()]),
}, { additionalProperties: false });
const commonQuery = {
	profiles, sources: Type.Array(StringEnum(SOURCE_IDS), { minItems: 1, maxItems: 3, uniqueItems: true }), sessionRefs,
	sql: Type.String({ minLength: 1, maxLength: 32_000 }),
	parameters: Type.Optional(Type.Record(Type.String(), Type.Union([Type.String(), Type.Number(), Type.Boolean(), Type.Null()]))),
	execution: Type.Optional(StringEnum(["standard", "large"] as const)),
	maxRows: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
	maxBytes: Type.Optional(Type.Integer({ minimum: 1, maximum: 256 * 1024 })),
};

/** Operation-specific schemas keep model-generated fields from crossing operation boundaries. */
export const analyticsSchema = Type.Union([
	Type.Object({ operation: Type.Literal("catalog") }, { additionalProperties: false }),
	Type.Object({ operation: Type.Literal("sessions"), profiles, cwd: Type.Optional(Type.String({ maxLength: 32_000 })), sessionIds: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 256 }), { minItems: 1, maxItems: 1000 })), maxRows: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })), cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 1024 })) }, { additionalProperties: false }),
	Type.Object({ operation: Type.Literal("query"), ...commonQuery }, { additionalProperties: false }),
	Type.Object({ operation: Type.Literal("search"), profiles, sessionRefs, cwd: Type.Optional(Type.String({ maxLength: 32_000 })), interval, filters, maxResults: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })), cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 1024 })) }, { additionalProperties: false }),
	Type.Object({ operation: Type.Literal("follow_up"), occurrence, before: Type.Optional(Type.Integer({ minimum: 0, maximum: 20 })), after: Type.Optional(Type.Integer({ minimum: 0, maximum: 20 })) }, { additionalProperties: false }),
]);
export type LogAnalyticsInput = Static<typeof analyticsSchema>;

const DESCRIPTION = `Read-only Pi history analytics. Choose catalog for source schemas; sessions for cheap metadata-only listing; search for bounded literal/native-field lookup without DuckDB; follow_up for bounded context around a search occurrence; query for one SELECT with joins/aggregates. Targeted recipe: search by exact profile/project/session and stop when enough examples answer the question, then follow_up only returned occurrences. Last-week tool-call failures: freeze a seven-day [since,until) interval, search messageRoles=["toolResult"] and isError=true across the required profiles, follow nextCursor until complete, retain profile/session/file/occurrence coordinates, then follow_up relevant calls; recorded error flags are not automatically product defects. Complete three-month reviews require paging exhaustive search/traversal over both profiles and disclosing exclusions and gaps. Use query execution="large" for deliberate broad SQL/global joins; standard SQL is the cheap in-memory path. Results report selected/examined coverage, exclusions, truncation, resource costs, and temporary-storage cleanup. Expansion only renders returned bounded details; it never fetches more.`;

/** Injection is extension-owned and used by offline fixtures, never a tool argument. */
export function registerLogAnalytics(pi: ExtensionAPI, resolveProfiles: () => Promise<ProfileRegistry> = runtimeProfiles): void {
	pi.registerTool({
		name: "log_analytics", label: "Log Analytics", description: DESCRIPTION, parameters: analyticsSchema,
		renderCall: renderAnalyticsCall, renderResult: renderAnalyticsResult,
		async execute(_id, params, signal) {
			// Hooks may mutate tool arguments after Pi validation.
			if (!Check(analyticsSchema, params)) throw new Error("invalid log_analytics arguments");
			let details: unknown;
			switch (params.operation) {
				case "catalog":
					details = { sources: analyticsCatalog(),
						defaults: { execution: "standard", profiles: "active registered profile", timeoutMs: 5000, maxInputBytes: 536870912, threads: 2, memoryLimit: "1GB", maxRows: 1000, maxRowBytes: 262144,
							searchPageBytes: 8388608, searchPageRecords: 10000, searchMaxResults: 100, largeTimeoutMs: 120000, largeDiskBudgetBytes: 4294967296 },
						limits: "Standard SQL is invocation-local in-memory with a 512 MiB selected-input bound and no spill. Explicit large SQL uses invocation-owned disk staging/spill with a 120 s deadline and 4 GiB disk budget while retaining the 1 GB DuckDB and two-thread ceilings. Search cursors are process-local, bounded and expire; cache state is disposable metadata only. No arbitrary roots, telemetry, or persistent transcript index." };
					break;
				case "sessions":
					details = await sessionAnalytics(await resolveProfiles(), params, signal);
					break;
				case "query":
					details = await queryAnalytics(await resolveProfiles(), params as AnalyticsRequest, signal);
					break;
				case "search":
					details = await searchAnalytics(await resolveProfiles(), params, signal);
					break;
				case "follow_up":
					details = await followUpAnalytics(await resolveProfiles(), params as { operation: "follow_up"; occurrence: OccurrenceRef; before?: number; after?: number }, signal);
					break;
			}
			return { content: [{ type: "text", text: JSON.stringify(details) }], details };
		},
	});
}
export default function logAnalyticsTool(pi: ExtensionAPI): void { registerLogAnalytics(pi); }

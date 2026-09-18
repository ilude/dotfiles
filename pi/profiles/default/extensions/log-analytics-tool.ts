import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { Check } from "typebox/value";
import { analyticsCatalog } from "../lib/log-analytics/api.js";
import { PROFILE_IDS, runtimeProfiles, type ProfileRegistry } from "../lib/log-analytics/profiles.js";
import { SOURCE_IDS } from "../lib/log-analytics/registry.js";
import { renderAnalyticsCall, renderAnalyticsResult } from "../lib/log-analytics/render.js";
import { AnalyticsWorker } from "../lib/log-analytics/worker-client.js";

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
	subagentBlocking: Type.Optional(Type.Boolean({ description: "Match recorded subagent tool calls by whether they block the orchestrator. Matching rows include structured blocking decisions and reasons." })),
	subagentBlockingReasonSources: Type.Optional(Type.Array(StringEnum(["model", "role-contract", "missing"] as const), { minItems: 1, maxItems: 3, uniqueItems: true, description: "With subagentBlocking=true, restrict blocking decisions by reason source. Use model and missing to exclude role-mandated Strategists from behavioral reviews." })),
	subagentExtensionVersion: Type.Optional(Type.String({ minLength: 1, maxLength: 64, description: "With subagentBlocking set, restrict decisions to the subagent extension version active when each call was recorded." })),
}, { additionalProperties: false }));
const interval = Type.Optional(Type.Object({ since: Type.String({ minLength: 1, maxLength: 128 }), until: Type.String({ minLength: 1, maxLength: 128 }) }, { additionalProperties: false }));
const locationScope = { cwd: Type.Optional(Type.String({ maxLength: 32_000 })), repository: Type.Optional(Type.String({ maxLength: 32_000 })) };
const occurrence = Type.Object({
	profile: StringEnum(PROFILE_IDS),
	session: Type.Object({
		profile: StringEnum(PROFILE_IDS), sessionId: Type.String({ minLength: 1, maxLength: 256 }),
		fileKey: Type.Optional(Type.String({ pattern: "^[a-f0-9]{64}$" })),
	}, { additionalProperties: false }),
	fileKey: Type.String({ pattern: "^[a-f0-9]{64}$" }), byteOffset: Type.Integer({ minimum: 0 }), byteLength: Type.Integer({ minimum: 1 }),
	recordOrdinal: Type.Integer({ minimum: 0 }), recordKey: Type.Union([Type.String({ minLength: 1, maxLength: 256 }), Type.Null()]),
}, { additionalProperties: false });
const lineage = {
	profiles, sessionId: Type.String({ minLength: 1, maxLength: 256 }),
	maxRows: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
};
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
	Type.Object({ operation: Type.Literal("sessions"), profiles, ...locationScope, sessionIds: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 256 }), { minItems: 1, maxItems: 1000 })), maxRows: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })), cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 1024 })) }, { additionalProperties: false }),
	Type.Object({ operation: Type.Literal("query"), ...commonQuery }, { additionalProperties: false }),
	Type.Object({ operation: Type.Literal("search"), profiles, sessionRefs, ...locationScope, interval, filters, maxResults: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })), cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 1024 })) }, { additionalProperties: false }),
	Type.Object({ operation: Type.Literal("follow_up"), occurrence, before: Type.Optional(Type.Integer({ minimum: 0, maximum: 20 })), after: Type.Optional(Type.Integer({ minimum: 0, maximum: 20 })) }, { additionalProperties: false }),
	Type.Object({ operation: Type.Literal("session_lineage"), ...lineage }, { additionalProperties: false }),
]);
export type LogAnalyticsInput = Static<typeof analyticsSchema>;

const DESCRIPTION = `Read-only Pi history analytics. Choose catalog for source schemas; sessions for cheap metadata-only listing; search for bounded literal/native-field lookup without DuckDB, including subagentBlocking decisions, reasons, and active extension versions; follow_up for bounded context around a search occurrence; session_lineage for historical parent/child subagent lineage by native session ID (recorded ancestors and descendants, not live status); query for one SELECT with joins/aggregates. Targeted recipe: retain every operator-supplied bound across retries and cursor pages; use cwd for one exact checkout or repository to include that Git checkout and its linked worktrees, combine it with a fixed event-time interval when supplied, and stop when enough examples answer the question. cwd/repository normalize platform-equivalent path spellings and are mutually exclusive. Then follow_up only returned occurrences. Last-week tool-call failures: freeze a seven-day [since,until) interval, search messageRoles=["toolResult"] and isError=true across the required profiles, follow nextCursor with identical scope until complete, retain profile/session/file/occurrence coordinates, then follow_up relevant calls; recorded error flags are not automatically product defects. Complete three-month reviews require paging exhaustive search/traversal over both profiles and disclosing exclusions and gaps. Use query execution="large" for deliberate broad SQL/global joins; standard SQL is the cheap in-memory path. Results report selected/examined coverage, exclusions, truncation, resource costs, and temporary-storage cleanup. Expansion only renders returned bounded details; it never fetches more.`;

/** Injection is extension-owned and used by offline fixtures, never a tool argument. */
export function registerLogAnalytics(pi: ExtensionAPI, resolveProfiles: () => Promise<ProfileRegistry> = runtimeProfiles): void {
	const worker = new AnalyticsWorker();
	pi.on("session_shutdown", () => worker.close());
	pi.registerTool({
		name: "log_analytics", label: "Log Analytics", description: DESCRIPTION, parameters: analyticsSchema,
		renderCall: renderAnalyticsCall, renderResult: renderAnalyticsResult,
		async execute(_id, params, signal) {
			// Hooks may mutate tool arguments after Pi validation.
			if (!Check(analyticsSchema, params)) throw new Error("invalid log_analytics arguments");
			let details: unknown;
			if (params.operation === "catalog") details = { sources: analyticsCatalog(),
				defaults: { execution: "standard", profiles: "active registered profile", threads: 2, memoryLimit: "2GB", maxRows: 1000, maxRowBytes: 262144,
					searchMaxResults: 100, largeDiskBudgetBytes: 8589934592 },
				limits: "Analytics filesystem and native database work runs in a session-owned child process so a worker crash returns exit evidence without terminating Pi. Queries, discovery, and search have no internal deadline or selected-input ceiling and remain caller-cancellable. Standard SQL is invocation-local in-memory with no spill. Explicit large SQL uses invocation-owned disk staging/spill with an 8 GiB disk budget while retaining the 2 GB DuckDB and two-thread ceilings. Search cursors are process-local and bounded by retained metadata size; cache state is disposable metadata only. SQL remains read-only over registered sources, with extension loading and arbitrary filesystem access disabled. Results and follow-up context remain bounded for model context." };
			else details = await worker.execute(await resolveProfiles(), params, signal);
			return { content: [{ type: "text", text: JSON.stringify(details) }], details };
		},
	});
}
export default function logAnalyticsTool(pi: ExtensionAPI): void { registerLogAnalytics(pi); }

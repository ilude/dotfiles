import { analyticsCatalog } from "./registry.js";
import { checkCancelled, selectedProfiles, type ProfileId, type ProfileRegistry } from "./profiles.js";
import { discoveryCoverage, listSessions, type SessionRef, type SessionsRequest } from "./sessions.js";
import type { AnalyticsSourceId } from "./registry.js";
import { followUp, searchLogs, type FollowUpRequest, type SearchRequest } from "./search.js";
export type { FollowUpRequest, OccurrenceRef, SearchFilters, SearchMatch, SearchRequest, SearchResult } from "./search.js";
import type { AnalyticsExecution, AnalyticsParameter } from "./store.js";
export { analyticsCatalog };
export type AnalyticsRequest = {
	operation: "query"; profiles?: ProfileId[]; sources: AnalyticsSourceId[]; sessionRefs?: SessionRef[];
	execution?: AnalyticsExecution; sql: string; parameters?: Record<string, AnalyticsParameter>; maxRows?: number; maxBytes?: number;
};

export async function searchAnalytics(registry: ProfileRegistry, request: SearchRequest, signal?: AbortSignal) {
	return await searchLogs(registry, request, signal);
}

export async function followUpAnalytics(registry: ProfileRegistry, request: FollowUpRequest, signal?: AbortSignal) {
	checkCancelled(signal);
	return await followUp(registry, request, signal);
}

export async function queryAnalytics(registry: ProfileRegistry, request: AnalyticsRequest, signal?: AbortSignal) {
	const profiles = selectedProfiles(registry, request.profiles);
	checkCancelled(signal);
	// Catalog and metadata discovery do not load native DuckDB or create a database.
	const { withAnalyticsSession } = await import("./store.js");
	const discovery = discoveryCoverage();
	const result = await withAnalyticsSession({ registry, profiles, sources: request.sources, sessionRefs: request.sessionRefs, execution: request.execution, signal, discovery },
		session => session.query(request));
	return { ...result, profiles, sources: [...new Set(request.sources)], coverage: {
		...(request.sources.includes("session_entries") ? { discovery } : {}),
		files: "all selected files staged", records: "valid JSON only; malformed lines excluded; live files are not a snapshot",
	} };
}

export async function sessionAnalytics(registry: ProfileRegistry, request: SessionsRequest, signal?: AbortSignal) {
	return await listSessions(registry, request, signal);
}

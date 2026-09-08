import { analyticsCatalog } from "./registry.js";
import { checkCancelled, selectedProfiles, type ProfileId, type ProfileRegistry } from "./profiles.js";
import { discoveryCoverage, listSessions, type SessionRef, type SessionsRequest } from "./sessions.js";
import type { AnalyticsSourceId } from "./registry.js";
import type { AnalyticsParameter } from "./store.js";
export { analyticsCatalog };
export type AnalyticsRequest = {
	operation: "query"; profiles?: ProfileId[]; sources: AnalyticsSourceId[]; sessionRefs?: SessionRef[];
	sql: string; parameters?: Record<string, AnalyticsParameter>; maxRows?: number;
};

export async function queryAnalytics(registry: ProfileRegistry, request: AnalyticsRequest, signal?: AbortSignal) {
	const profiles = selectedProfiles(registry, request.profiles);
	checkCancelled(signal);
	// Catalog and metadata discovery do not load native DuckDB or create a database.
	const { withAnalyticsSession } = await import("./store.js");
	const discovery = discoveryCoverage();
	const result = await withAnalyticsSession({ registry, profiles, sources: request.sources, sessionRefs: request.sessionRefs, signal, discovery },
		session => session.query(request));
	return { ...result, profiles, sources: [...new Set(request.sources)], coverage: {
		...(request.sources.includes("session_entries") ? { discovery } : {}),
		files: "all selected files staged", records: "valid JSON only; malformed lines excluded; live files are not a snapshot",
	} };
}

export async function sessionAnalytics(registry: ProfileRegistry, request: SessionsRequest, signal?: AbortSignal) {
	const raw = process.env.PI_ANALYTICS_TIMEOUT_MS ?? "5000";
	const timeoutMs = /^\d+$/.test(raw) ? Number(raw) : NaN;
	if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error("invalid analytics PI_ANALYTICS_TIMEOUT_MS");
	const deadline = new AbortController();
	const timer = setTimeout(() => deadline.abort(), timeoutMs);
	timer.unref();
	try { return await listSessions(registry, request, signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal); }
	catch (error) {
		if (deadline.signal.aborted) throw new Error(`analytics session discovery exceeded ${timeoutMs} ms`);
		throw error;
	} finally { clearTimeout(timer); }
}

import { analyticsCatalog as catalog, withAnalyticsSession, type AnalyticsParameter, type AnalyticsQueryResult } from "./store.ts";
import { registeredSources, type AnalyticsSourceId } from "./registry.ts";

export type { AnalyticsParameter, AnalyticsQueryResult };
export type AnalyticsCatalogEntry = ReturnType<typeof catalog>[number];
export type AnalyticsRequest = {
	operation: "query";
	sources: AnalyticsSourceId[];
	sql: string;
	parameters?: Record<string, AnalyticsParameter>;
	maxRows?: number;
};

export { withAnalyticsSession };
export function analyticsCatalog(): AnalyticsCatalogEntry[] { return catalog(); }

function resolveMaxInputBytes(): number {
	const raw = process.env.PI_ANALYTICS_MAX_INPUT_BYTES;
	if (raw === undefined) return 512 * 1024 * 1024;
	if (!/^\d+$/.test(raw)) throw new Error("invalid analytics PI_ANALYTICS_MAX_INPUT_BYTES");
	const value = Number(raw);
	if (!Number.isSafeInteger(value)) throw new Error("invalid analytics PI_ANALYTICS_MAX_INPUT_BYTES");
	return value;
}

const maxInputBytes = resolveMaxInputBytes();

export async function queryAnalytics(root: string, request: AnalyticsRequest, signal?: AbortSignal): Promise<AnalyticsQueryResult> {
	return withAnalyticsSession({ root, sources: request.sources, signal, maxInputBytes }, (session) => session.query({ sql: request.sql, parameters: request.parameters, maxRows: request.maxRows }));
}

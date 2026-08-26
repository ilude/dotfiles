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

export async function queryAnalytics(root: string, request: AnalyticsRequest, signal?: AbortSignal): Promise<AnalyticsQueryResult> {
	return withAnalyticsSession({ root, sources: request.sources, signal }, (session) => session.query({ sql: request.sql, parameters: request.parameters, maxRows: request.maxRows }));
}

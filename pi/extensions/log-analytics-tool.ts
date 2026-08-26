import { Type } from "@earendil-works/pi-ai";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	aggregateAnalytics,
	analyticsCatalog,
	defaultAnalyticsDatabase,
	openAnalyticsStore,
	refreshRegisteredAnalytics,
	selectAnalytics,
	type AnalyticsAggregateRequest,
	type AnalyticsSelectRequest,
} from "../lib/log-analytics/api.ts";
import { getAgentDir } from "../lib/extension-utils.ts";
import { registerLogAnalyticsLifecycle } from "../lib/log-analytics/store.ts";

const requestSchema = Type.Union([
	Type.Object({
		operation: Type.Literal("catalog"),
	}),
	Type.Object({
		operation: Type.Literal("select"),
		source: Type.String(),
		columns: Type.Array(Type.String(), { minItems: 1, maxItems: 32 }),
		filters: Type.Optional(
			Type.Array(
				Type.Object({
					column: Type.String(),
					op: Type.Union([
						Type.Literal("eq"),
						Type.Literal("neq"),
						Type.Literal("lt"),
						Type.Literal("lte"),
						Type.Literal("gt"),
						Type.Literal("gte"),
					]),
					value: Type.Union([
						Type.String(),
						Type.Number(),
						Type.Boolean(),
						Type.Null(),
					]),
				}),
				{ maxItems: 16 },
			),
		),
		orderBy: Type.Optional(
			Type.Array(
				Type.Object({
					column: Type.String(),
					direction: Type.Optional(
						Type.Union([Type.Literal("asc"), Type.Literal("desc")]),
					),
				}),
				{ maxItems: 8 },
			),
		),
		limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
	}),
	Type.Object({
		operation: Type.Literal("aggregate"),
		source: Type.String(),
		groupBy: Type.Optional(Type.Array(Type.String(), { maxItems: 16 })),
		measures: Type.Array(
			Type.Object({
				kind: Type.Union([Type.Literal("count"), Type.Literal("sum")]),
				column: Type.Optional(Type.String()),
				as: Type.Optional(Type.String()),
			}),
			{ minItems: 1, maxItems: 16 },
		),
		filters: Type.Optional(
			Type.Array(
				Type.Object({
					column: Type.String(),
					op: Type.Union([
						Type.Literal("eq"),
						Type.Literal("neq"),
						Type.Literal("lt"),
						Type.Literal("lte"),
						Type.Literal("gt"),
						Type.Literal("gte"),
					]),
					value: Type.Union([
						Type.String(),
						Type.Number(),
						Type.Boolean(),
						Type.Null(),
					]),
				}),
				{ maxItems: 16 },
			),
		),
		limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
	}),
]);

export default function logAnalyticsTool(pi: ExtensionAPI): void {
	registerLogAnalyticsLifecycle(pi as never);
	pi.registerTool({
		name: "log_analytics",
		label: "Log Analytics",
		description:
			"Inspect registered structural Pi analytics sources using catalog, typed select, or typed aggregate operations. No SQL, paths, content fields, or external access are accepted.",
		parameters: requestSchema,
		async execute(
			_toolCallId,
			params,
			signal,
			_onUpdate,
			_ctx: ExtensionContext,
		) {
			const root = process.env.PI_ANALYTICS_SOURCE_ROOT ?? getAgentDir();
			const database = defaultAnalyticsDatabase(getAgentDir());
			if (params.operation === "catalog") {
				const catalog = { sources: analyticsCatalog() };
				return {
					content: [{ type: "text", text: JSON.stringify(catalog) }],
					details: catalog,
				};
			}
			const store = await openAnalyticsStore(database);
			try {
				await refreshRegisteredAnalytics(store, root, {
					signal,
					maxElapsedMs: 5000,
				});
				const options = {
					signal,
					maxRows: 1000,
					maxBytes: 256 * 1024,
					maxElapsedMs: 5000,
				};
				const rows =
					params.operation === "select"
						? await selectAnalytics(
								store,
								params as AnalyticsSelectRequest,
								options,
							)
						: await aggregateAnalytics(
								store,
								params as AnalyticsAggregateRequest,
								options,
							);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify({ rows }, (_key, value) =>
								typeof value === "bigint" ? Number(value) : value,
							),
						},
					],
					details: { rows },
				};
			} finally {
				await store.close();
			}
		},
	});
}

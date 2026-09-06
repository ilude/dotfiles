import fs from "node:fs/promises";
import { StringEnum, Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { analyticsCatalog, queryAnalytics, type AnalyticsRequest } from "../lib/log-analytics/api.ts";
import { registeredSources, type AnalyticsSourceId } from "../lib/log-analytics/registry.ts";
import { getAgentDir } from "../lib/extension-utils.ts";

const sourceIds = registeredSources.map((source) => Type.Literal(source.name));
const requestSchema = Type.Object({
	operation: StringEnum(["catalog", "query"] as const),
	sources: Type.Optional(
		Type.Array(Type.Union(sourceIds), { minItems: 1, uniqueItems: true }),
	),
	sql: Type.Optional(Type.String({ minLength: 1, maxLength: 32_000 })),
	parameters: Type.Optional(
		Type.Record(
			Type.String(),
			Type.Union([Type.String(), Type.Number(), Type.Boolean(), Type.Null()]),
		),
	),
	maxRows: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
});

export default function logAnalyticsTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "log_analytics",
		label: "Log Analytics",
		description: "Inspect the registered catalog for same-named views and concise DuckDB hints, or query selected canonical Pi session and log records.",
		parameters: requestSchema,
		async execute(_toolCallId, params, signal, _onUpdate, _ctx: ExtensionContext) {
			if (params.operation === "catalog") {
				const details = { sources: analyticsCatalog() };
				return { content: [{ type: "text", text: JSON.stringify(details) }], details };
			}
			if (!params.sources || !params.sql) {
				throw new Error("log_analytics query requires sources and sql");
			}
			const root = await fs.realpath(process.env.PI_ANALYTICS_SOURCE_ROOT ?? getAgentDir());
			const request = params as AnalyticsRequest;
			const result = await queryAnalytics(root, request, signal);
			return {
				content: [{ type: "text", text: JSON.stringify(result) }],
				details: result,
			};
		},
	});
}

export type { AnalyticsSourceId };

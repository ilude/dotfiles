/**
 * ToolSearch Tool -- Discover available tools by searching descriptions
 *
 * As the tool count grows, this lets the caller find the right tool
 * without needing all descriptions in the system prompt.
 */
// Convention exception: no extension-utils helpers apply directly.
// Risk: helper API drifts and this file is not visited by future refactors;
//   tool-search.ts has its own dedicated test file (tool-search.test.ts,
//   103 lines) covering registration, search, include_params, and
//   renderCall.
// Why shared helper is inappropriate: the file's only output is a tool
//   result envelope carrying matching tool descriptions. formatToolError
//   does not apply because no operation is fallible at the search-text
//   layer. canonicalize and uiNotify are not relevant -- the file does
//   not handle filesystem paths or UI notifications.

import type { ExtensionAPI, ToolInfo } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";
import { activateTools } from "../lib/tool-activation.js";

/** Score a tool against search terms. Higher = better match. */
export function scoreTool(
	tool: { name: string; description: string },
	terms: string[],
): number {
	const name = tool.name.toLowerCase();
	const desc = tool.description.toLowerCase();
	let score = 0;

	for (const term of terms) {
		// Exact name match is strongest signal
		if (name === term) score += 10;
		// Name contains term
		else if (name.includes(term)) score += 5;
		// Description contains term
		if (desc.includes(term)) score += 2;
	}

	return score;
}

/** Format a tool for display. */
export function formatToolEntry(
	tool: { name: string; description: string; source?: string },
	index: number,
): string {
	const lines = [`${index}. ${tool.name}`];
	// Truncate description to ~120 chars
	const desc =
		tool.description.length > 120
			? `${tool.description.slice(0, 120)}...`
			: tool.description;
	lines.push(`   ${desc}`);
	if (tool.source) lines.push(`   [source: ${tool.source}]`);
	return lines.join("\n");
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "tool_search",
		label: "Tool Search",
		description:
			"Search available tools by keyword and activate matching inactive tools. Returns tool names, descriptions, and optional parameter schemas.",
		promptSnippet:
			"Search available tools by keyword and activate matching inactive capabilities",
		promptGuidelines: [
			"Use tool_search when the needed capability is not currently available.",
			"Search with descriptive capability keywords; matching inactive tools are activated by default.",
			"Use list mode without a query only to inspect all tools; it does not activate them.",
		],
		parameters: Type.Object({
			query: Type.Optional(
				Type.String({
					description: "Search keywords. Omit to list all tools.",
				}),
			),
			include_params: Type.Optional(
				Type.Boolean({
					description: "Include parameter schemas in results (default: false)",
				}),
			),
			activate: Type.Optional(
				Type.Boolean({
					description:
						"Activate matching inactive tools. Defaults to true for a non-empty query.",
				}),
			),
		}),

		execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const allTools = pi.getAllTools();
			const activeNames = new Set(pi.getActiveTools());
			const includeParams = params.include_params ?? false;

			let results: Array<ToolInfo & { score: number }>;

			if (!params.query || params.query.trim() === "") {
				// List all tools
				results = allTools.map((t) => ({ ...t, score: 0 }));
			} else {
				const terms = params.query.toLowerCase().split(/\s+/).filter(Boolean);
				results = allTools
					.map((t) => ({ ...t, score: scoreTool(t, terms) }))
					.filter((t) => t.score > 0)
					.sort((a, b) => b.score - a.score);
			}

			if (results.length === 0) {
				return Promise.resolve({
					content: [
						{
							type: "text" as const,
							text: `No tools found matching "${params.query}".`,
						},
					],
					details: { total: allTools.length, matched: 0 },
				});
			}

			const hasQuery = Boolean(params.query?.trim());
			const shouldActivate = hasQuery && (params.activate ?? true);
			const activated = shouldActivate
				? results
						.map((tool) => tool.name)
						.filter((name) => !activeNames.has(name))
				: [];
			if (activated.length > 0) {
				activateTools(pi, activated);
				for (const name of activated) activeNames.add(name);
			}

			const lines: string[] = [];

			if (params.query) {
				lines.push(
					`Found ${results.length} tool(s) matching "${params.query}":\n`,
				);
			} else {
				lines.push(`All ${results.length} available tools:\n`);
			}

			if (activated.length > 0)
				lines.push(`Activated ${activated.join(", ")} for the next tool call.\n`);

			for (let i = 0; i < results.length; i++) {
				const t = results[i];
				const active = activeNames.has(t.name) ? "" : " (inactive)";
				const source =
					t.sourceInfo?.source === "builtin"
						? `built-in${active}`
						: `extension${active}`;

				lines.push(
					formatToolEntry(
						{ name: t.name, description: t.description, source },
						i + 1,
					),
				);

				if (includeParams && t.parameters) {
					try {
						const schema = JSON.stringify(t.parameters, null, 2);
						lines.push(`   Parameters: ${schema}`);
					} catch {
						lines.push("   Parameters: (unable to serialize)");
					}
				}

				lines.push(""); // blank line between entries
			}

			return Promise.resolve({
				content: [{ type: "text" as const, text: lines.join("\n").trimEnd() }],
				details: {
					total: allTools.length,
					matched: results.length,
					activated,
					query: params.query,
				},
			});
		},

		renderCall(args, theme, _context) {
			if (!args.query) {
				return new Text(`${theme.fg("accent", "🔍  ")}list all tools`, 0, 0);
			}
			return new Text(
				theme.fg("accent", "🔍  ") + theme.fg("toolTitle", args.query),
				0,
				0,
			);
		},

		renderResult(result, _options, theme, _context) {
			const details = result.details as
				| { matched?: number; total?: number; query?: string }
				| undefined;
			const matched = details?.matched ?? 0;
			const total = details?.total ?? 0;
			const summary = details?.query
				? `${matched}/${total} tools match "${details.query}"`
				: `${total} tools available`;
			return new Text(theme.fg("dim", summary), 0, 0);
		},
	});
}

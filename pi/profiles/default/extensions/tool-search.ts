import { stripVTControlCharacters } from "node:util";
import type { ExtensionAPI, ToolInfo, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { activateTools } from "../lib/tool-activation.js";

export function scoreTool(tool: { name: string; description: string }, terms: string[]): number {
	const name = tool.name.toLowerCase();
	const description = tool.description.toLowerCase();
	let score = 0;
	for (const term of terms) {
		if (name === term) score += 10;
		else if (name.includes(term)) score += 5;
		if (description.includes(term)) score += 2;
	}
	return score;
}

export function formatToolEntry(tool: { name: string; description: string; source?: string }, index: number): string {
	const description = tool.description.length > 120 ? `${tool.description.slice(0, 120)}...` : tool.description;
	return [`${index}. ${tool.name}`, `   ${description}`, ...(tool.source ? [`   [source: ${tool.source}]`] : [])].join("\n");
}

const toolSearchParameters = Type.Object({
	query: Type.Optional(Type.String({ description: "Search keywords. Omit to list all tools." })),
	include_params: Type.Optional(Type.Boolean({ description: "Include parameter schemas in results." })),
	activate: Type.Optional(Type.Boolean({ description: "Activate matching inactive tools. Defaults to true for a non-empty query." })),
}, { additionalProperties: false });

type ToolSearchDetails = { total: number; matched: number; activated: string[]; query?: string };
type ToolSearchDefinition = ToolDefinition<typeof toolSearchParameters, ToolSearchDetails>;

function clean(value: string): string {
	return stripVTControlCharacters(value).replace(/[\x00-\x1f\x7f-\x9f]/g, " ").replace(/\s+/g, " ").trim();
}

function resultNames(text: string): string[] {
	return [...text.matchAll(/^\d+\. ([^\s]+)$/gm)].map(match => clean(match[1]));
}

function compactComponent(build: (width: number) => string[]): Component {
	return { render: width => build(width).map(line => truncateToWidth(line, width)), invalidate() {} };
}

export const renderToolSearchResult: NonNullable<ToolSearchDefinition["renderResult"]> = (result, { expanded }, theme) => {
	const text = result.content.filter(part => part.type === "text").map(part => part.text).join("\n");
	if (expanded) return new Text(text, 0, 0);
	const details = result.details;
	if (!details) return compactComponent(width => [truncateToWidth(clean(text) || "(no output)", width)]);
	const query = details.query?.trim();
	const label = query ? `query ${JSON.stringify(clean(query))}` : "all tools";
	const names = resultNames(text);
	const namePreview = names.length ? ` · ${names.slice(0, 6).join(", ")}${names.length > 6 ? ", …" : ""}` : "";
	return compactComponent(width => [
		theme.bold(`${label} · ${details.matched} result${details.matched === 1 ? "" : "s"} · ${details.activated.length} activated${namePreview}`),
	]);
};

export default function registerToolSearch(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "tool_search",
		label: "Tool Search",
		description: "Find available tools by capability keyword.",
		promptSnippet: "Find tools by capability and activate matching inactive tools",
		promptGuidelines: [
			"Use tool_search when the needed capability is not currently available.",
			"Search with descriptive capability keywords; matching inactive tools are activated by default for a non-empty query.",
			"List without a query only to inspect available tools; list mode does not activate them.",
		],
		parameters: toolSearchParameters,
		renderResult: renderToolSearchResult,
		execute(_id, params) {
			const allTools = pi.getAllTools();
			const activeBefore = pi.getActiveTools();
			const activeNames = new Set(activeBefore);
			const query = params.query?.trim();
			let results: Array<ToolInfo & { score: number }>;
			if (!query) results = allTools.map((tool) => ({ ...tool, score: 0 }));
			else {
				const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
				results = allTools.map((tool) => ({ ...tool, score: scoreTool(tool, terms) })).filter((tool) => tool.score > 0).sort((left, right) => right.score - left.score);
			}
			if (results.length === 0) return Promise.resolve({ content: [{ type: "text" as const, text: `No tools found matching "${params.query}".` }], details: { total: allTools.length, matched: 0, activated: [] as string[], query: params.query } });
			const activated = query && (params.activate ?? true) ? results.map((tool) => tool.name).filter((name) => !activeNames.has(name)) : [];
			if (activated.length) activateTools(pi, activated);
			const nowActive = new Set([...activeBefore, ...activated]);
			const lines = [query ? `Found ${results.length} tool(s) matching "${params.query}":\n` : `All ${results.length} available tools:\n`];
			if (activated.length) lines.push(`Activated ${activated.join(", ")} for the next tool call.\n`);
			for (const [index, tool] of results.entries()) {
				const inactive = nowActive.has(tool.name) ? "" : " (inactive)";
				const source = `${tool.sourceInfo?.source === "builtin" ? "built-in" : "extension"}${inactive}`;
				lines.push(formatToolEntry({ name: tool.name, description: tool.description, source }, index + 1));
				if (params.include_params && tool.parameters) lines.push(`   Parameters: ${JSON.stringify(tool.parameters, null, 2)}`);
				lines.push("");
			}
			return Promise.resolve({ content: [{ type: "text" as const, text: lines.join("\n").trimEnd() }], details: { total: allTools.length, matched: results.length, activated, query: params.query } });
		},
	});
}

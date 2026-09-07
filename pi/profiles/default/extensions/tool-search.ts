import type { ExtensionAPI, ToolInfo } from "@earendil-works/pi-coding-agent";
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
		parameters: Type.Object({
			query: Type.Optional(Type.String({ description: "Search keywords. Omit to list all tools." })),
			include_params: Type.Optional(Type.Boolean({ description: "Include parameter schemas in results." })),
			activate: Type.Optional(Type.Boolean({ description: "Activate matching inactive tools. Defaults to true for a non-empty query." })),
		}, { additionalProperties: false }),
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

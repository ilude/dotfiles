/**
 * ToolSearch Tool — Discover available tools by searching descriptions
 *
 * As the tool count grows, this lets the LLM find the right tool
 * without needing all descriptions in the system prompt.
 */
import { Type } from "@sinclair/typebox";
import { Text } from "@mariozechner/pi-tui";
import type { ExtensionAPI, ToolInfo } from "@mariozechner/pi-coding-agent";

/** Score a tool against search terms. Higher = better match. */
export function scoreTool(tool: { name: string; description: string }, terms: string[]): number {
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
  index: number
): string {
  const lines = [`${index}. ${tool.name}`];
  // Truncate description to ~120 chars
  const desc = tool.description.length > 120
    ? tool.description.slice(0, 120) + "…"
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
      "Search available tools by keyword. Returns matching tool names, descriptions, and parameter schemas. " +
      "Use when unsure which tool to use for a task, or to discover available capabilities.",
    promptSnippet: "Search available tools by keyword to discover capabilities",
    promptGuidelines: [
      "Use tool_search when you're unsure which tool handles a specific task.",
      "Search with descriptive keywords, not tool names (e.g., 'powershell' not 'pwsh').",
      "Use list mode (no query) to see all available tools when starting a new kind of task.",
    ],
    parameters: Type.Object({
      query: Type.Optional(
        Type.String({ description: "Search keywords. Omit to list all tools." })
      ),
      include_params: Type.Optional(
        Type.Boolean({ description: "Include parameter schemas in results (default: false)" })
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
          content: [{ type: "text" as const, text: `No tools found matching "${params.query}".` }],
          details: { total: allTools.length, matched: 0 },
        });
      }

      const lines: string[] = [];

      if (params.query) {
        lines.push(`Found ${results.length} tool(s) matching "${params.query}":\n`);
      } else {
        lines.push(`All ${results.length} available tools:\n`);
      }

      for (let i = 0; i < results.length; i++) {
        const t = results[i];
        const active = activeNames.has(t.name) ? "" : " (inactive)";
        const source = t.sourceInfo?.type === "extension"
          ? `extension${active}`
          : `built-in${active}`;

        lines.push(formatToolEntry({ name: t.name, description: t.description, source }, i + 1));

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
        details: { total: allTools.length, matched: results.length, query: params.query },
      });
    },

    renderCall(args, theme, _context) {
      if (!args.query) {
        return new Text(theme.fg("accent", "🔍 ") + "list all tools", 0, 0);
      }
      return new Text(
        theme.fg("accent", "🔍 ") + theme.fg("toolTitle", args.query),
        0, 0
      );
    },

    renderResult(result, _options, theme, _context) {
      const matched = result.details?.matched ?? 0;
      const total = result.details?.total ?? 0;
      const summary = result.details?.query
        ? `${matched}/${total} tools match "${result.details.query}"`
        : `${total} tools available`;
      return new Text(theme.fg("dim", summary), 0, 0);
    },
  });
}

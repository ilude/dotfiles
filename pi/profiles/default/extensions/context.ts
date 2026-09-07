import { Text } from "@earendil-works/pi-tui";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { CONTEXT_REPORT_MESSAGE_TYPE, type AnyEntry, type ContextUsage } from "../lib/context-analysis.ts";
import { formatContextReport } from "../lib/context-report.ts";
// Preserve existing analysis exports for consumers of this extension.
export { buildContextBuckets, buildContextFileDetailBuckets, buildSkillPromptDetailBuckets,
	buildInjectedContextDetailBuckets, buildToolSchemaBuckets, type Bucket } from "../lib/context-analysis.ts";

function buildReport(pi: ExtensionAPI, ctx: ExtensionCommandContext): string[] {
	const branch = ctx.sessionManager.getBranch() as AnyEntry[];
	const entries = (ctx.sessionManager.buildContextEntries() as AnyEntry[]).flatMap(entry =>
		entry.type === "compaction" && Array.isArray(entry.retainedTail)
			? [entry, ...entry.retainedTail.map((message: unknown) => ({ type: "message", message }))]
			: [entry],
	);
	const allEntries = ctx.sessionManager.getEntries() as AnyEntry[];
	const usage = ctx.getContextUsage() as ContextUsage;
	const systemPrompt = ctx.getSystemPrompt() ?? "";
	const systemPromptOptions = typeof ctx.getSystemPromptOptions === "function"
		? ctx.getSystemPromptOptions()
		: undefined;
	const activeToolNames = new Set(pi.getActiveTools());
	const activeTools = pi
		.getAllTools()
		.filter((tool) => activeToolNames.has(tool.name));
	return formatContextReport({
		branch, entries, allEntries, usage, systemPrompt, systemPromptOptions, activeTools,
		model: ctx.model, sessionFile: ctx.sessionManager.getSessionFile() ?? "in-memory",
	});
}

export default function registerContextCommand(pi: ExtensionAPI) {
	pi.registerEntryRenderer(CONTEXT_REPORT_MESSAGE_TYPE, entry =>
		new Text((entry.data as { text: string }).text, 0, 0),
	);

	pi.registerCommand("context", {
		description: "Show Pi context usage, token spend, and component breakdown",
		getArgumentCompletions: (prefix) => {
			const options = ["clear", "hide", "widget"];
			const matches = options.filter((option) => option.startsWith(prefix.trim().toLowerCase()));
			return matches.length > 0 ? matches.map((value) => ({ value, label: value })) : null;
		},
		handler: async (args, ctx) => {
			const trimmed = args.trim().toLowerCase();
			if (trimmed === "clear" || trimmed === "hide") {
				ctx.ui.setWidget("context", undefined);
				ctx.ui.notify("Context widget hidden.", "info");
				return;
			}

			if (trimmed && trimmed !== "widget") throw new Error("Usage: /context [widget|hide|clear]");
			await ctx.waitForIdle();
			const report = buildReport(pi, ctx);
			if (trimmed === "widget") {
				ctx.ui.setWidget("context", report, { placement: "aboveEditor" });
				ctx.ui.notify("Context widget shown above the editor. It may truncate; run /context for the full report.", "info");
				return;
			}

			ctx.ui.setWidget("context", undefined);
			const text = report.join("\n");
			pi.appendEntry(CONTEXT_REPORT_MESSAGE_TYPE, { text });
			if (ctx.mode !== "tui") ctx.ui.notify(text, "info");
		},
	});
}

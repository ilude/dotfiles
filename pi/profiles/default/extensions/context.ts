import { Text } from "@earendil-works/pi-tui";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { CONTEXT_REPORT_MESSAGE_TYPE, type AnyEntry, type ContextUsage } from "../lib/context-analysis.ts";
import { formatContextReport } from "../lib/context-report.ts";
import { completePartialArgument } from "../lib/argument-completions.ts";
import { registerProfileCommand } from "../lib/profile-command.ts";
import { createHostPresentation } from "../lib/host-presentation.ts";
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

	registerProfileCommand(pi, "context", {
		description: "Show Pi context usage, token spend, and component breakdown",
		getArgumentCompletions: (prefix) => completePartialArgument(prefix, ["clear", "hide", "widget"]),
		handler: async (args, ctx) => {
			const trimmed = args.trim().toLowerCase();
			const presentation = createHostPresentation(ctx);
			if (trimmed === "clear" || trimmed === "hide") {
				if (presentation.widgets) {
					ctx.ui.setWidget("context", undefined);
					presentation.notify("Context widget hidden.");
				} else presentation.notify("Context widgets are unavailable in this client; there is no widget to hide.");
				return;
			}

			if (trimmed && trimmed !== "widget") throw new Error("Usage: /context [widget|hide|clear]");
			await ctx.waitForIdle();
			const report = buildReport(pi, ctx);
			if (trimmed === "widget") {
				if (presentation.widgets) {
					ctx.ui.setWidget("context", report, { placement: "aboveEditor" });
					presentation.notify("Context widget shown above the editor. It may truncate; run /context for the full report.");
					return;
				}
				presentation.notify("Context widgets are unavailable in this client; showing the full report instead.");
			}

			if (presentation.widgets) ctx.ui.setWidget("context", undefined);
			const text = report.join("\n");
			pi.appendEntry(CONTEXT_REPORT_MESSAGE_TYPE, { text });
			if (!presentation.nativeTranscript) presentation.notify(text);
		},
	});
}

// Convention exception: 2 direct ctx.ui.notify calls for /context widget
//   visibility toggles ("widget hidden" / "widget shown above the editor").
// Risk: notification wording could drift from the rest of the extension set
//   if helper format changes; today uiNotify only adds an extension prefix
//   that would echo the slash command name back to the user.
// Why shared helper is inappropriate: a `[context]` prefix on a 1-line
//   widget toggle status is visual noise for a flow the user just initiated
//   by typing /context. The extension also self-filters its own report
//   messages out of future LLM context via CONTEXT_REPORT_MESSAGE_TYPE,
//   which is the file-internal mechanism that makes this extension safe to
//   run in the conversation log.

import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";

const CONTEXT_REPORT_MESSAGE_TYPE = "context-report";

type AnyEntry = Record<string, any>;
type ContextUsage = {
	tokens: number | null;
	contextWindow: number;
	percent: number | null;
} | undefined;
export type Bucket = {
	label: string;
	tokens: number;
	details: string;
};

const TOKEN_APPROX_DIVISOR = 4;

function estimateTokens(value: unknown): number {
	const text = textFrom(value);
	return Math.ceil(text.length / TOKEN_APPROX_DIVISOR);
}

function textFrom(value: unknown): string {
	if (value === undefined || value === null) return "";
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	if (Array.isArray(value)) return value.map(textFrom).join("\n");
	if (typeof value === "object") {
		const block = value as Record<string, any>;
		if (block.type === "image") return "[image]";
		if (typeof block.text === "string") return block.text;
		if (typeof block.thinking === "string") return block.thinking;
		if (block.type === "toolCall") return `${block.name ?? "tool"} ${JSON.stringify(block.arguments ?? {})}`;
		return Object.values(block).map(textFrom).join("\n");
	}
	return "";
}

function formatTokens(tokens: number | null | undefined): string {
	if (tokens === null || tokens === undefined) return "unknown";
	if (tokens < 1_000) return String(tokens);
	if (tokens < 10_000) return `${(tokens / 1_000).toFixed(1)}k`;
	if (tokens < 1_000_000) return `${Math.round(tokens / 1_000)}k`;
	return `${(tokens / 1_000_000).toFixed(1)}M`;
}

function formatCost(cost: number): string {
	return `$${cost.toFixed(cost >= 1 ? 2 : 4)}`;
}

function pct(part: number, total: number | null | undefined): string {
	if (!total) return "?";
	return `${((part / total) * 100).toFixed(1)}%`;
}

function line(label: string, value: string, detail = ""): string {
	const padded = label.padEnd(23, " ");
	const alignedValue = value.padStart(10, " ");
	return detail ? `${padded} ${alignedValue}  ${detail}` : `${padded} ${alignedValue}`;
}

function bucket(label: string, tokens: number, details: string): Bucket {
	return { label, tokens, details };
}

function collectSessionUsage(entries: AnyEntry[]) {
	let input = 0;
	let output = 0;
	let cacheRead = 0;
	let cacheWrite = 0;
	let cost = 0;
	let assistantMessages = 0;

	for (const entry of entries) {
		const message = entry.message;
		if (entry.type === "message" && message?.role === "assistant" && message.usage) {
			assistantMessages += 1;
			input += message.usage.input ?? 0;
			output += message.usage.output ?? 0;
			cacheRead += message.usage.cacheRead ?? 0;
			cacheWrite += message.usage.cacheWrite ?? 0;
			cost += message.usage.cost?.total ?? 0;
		}
	}

	return { input, output, cacheRead, cacheWrite, cost, assistantMessages };
}

function entriesThatContributeToContext(branch: AnyEntry[]): AnyEntry[] {
	let compactionIndex = -1;
	for (let index = branch.length - 1; index >= 0; index -= 1) {
		if (branch[index]?.type === "compaction") {
			compactionIndex = index;
			break;
		}
	}
	if (compactionIndex === -1) return branch;

	const compaction = branch[compactionIndex];
	const keptStartIndex = branch.findIndex((entry, index) => index < compactionIndex && entry.id === compaction.firstKeptEntryId);
	const keptBeforeCompaction = keptStartIndex === -1 ? [] : branch.slice(keptStartIndex, compactionIndex);
	const afterCompaction = branch.slice(compactionIndex + 1);

	// Mirrors Pi's buildSessionContext(): compaction summary first, then kept messages before
	// the compaction entry, then entries after the compaction entry. Older entries are not
	// part of the active LLM context except through the compaction summary.
	return [compaction, ...keptBeforeCompaction, ...afterCompaction];
}

export function buildContextBuckets(entries: AnyEntry[], systemPrompt: string): Bucket[] {
	let userTokens = 0;
	let assistantTokens = 0;
	let toolCallTokens = 0;
	let thinkingTokens = 0;
	let toolResultTokens = 0;
	let expertiseTokens = 0;
	let bashTokens = 0;
	let customTokens = 0;
	let summaryTokens = 0;
	let userCount = 0;
	let assistantCount = 0;
	let toolResultCount = 0;
	let expertiseCallCount = 0;
	let expertiseResultCount = 0;
	let bashCount = 0;
	let customCount = 0;
	let summaryCount = 0;

	for (const entry of entries) {
		if (entry.type === "message") {
			const message = entry.message;
			if (message?.role === "user") {
				userCount += 1;
				userTokens += estimateTokens(message.content);
			} else if (message?.role === "assistant") {
				assistantCount += 1;
				for (const block of message.content ?? []) {
					if (block?.type === "toolCall") {
						if (block.name === "read_expertise") {
							expertiseCallCount += 1;
							expertiseTokens += estimateTokens(block);
						} else {
							toolCallTokens += estimateTokens(block);
						}
					} else if (block?.type === "thinking") thinkingTokens += estimateTokens(block.thinking);
					else assistantTokens += estimateTokens(block);
				}
			} else if (message?.role === "toolResult") {
				if (message.toolName === "read_expertise") {
					expertiseResultCount += 1;
					expertiseTokens += estimateTokens(message.content);
				} else {
					toolResultCount += 1;
					toolResultTokens += estimateTokens(message.content);
				}
			} else if (message?.role === "bashExecution" && !message.excludeFromContext) {
				bashCount += 1;
				bashTokens += estimateTokens(`${message.command ?? ""}\n${message.output ?? ""}`);
			}
		} else if (entry.type === "custom_message" && entry.customType !== CONTEXT_REPORT_MESSAGE_TYPE) {
			customCount += 1;
			customTokens += estimateTokens(entry.content);
		} else if (entry.type === "branch_summary") {
			summaryCount += 1;
			summaryTokens += estimateTokens(entry.summary);
		} else if (entry.type === "compaction") {
			summaryCount += 1;
			summaryTokens += estimateTokens(entry.summary);
		}
	}

	return [
		bucket("System prompt", estimateTokens(systemPrompt), "Pi instructions, tool docs, AGENTS.md, extension guidance"),
		bucket("User messages", userTokens, `${userCount} message(s)`),
		bucket("Assistant text", assistantTokens, `${assistantCount} message(s)`),
		bucket("Assistant thinking", thinkingTokens, "reasoning blocks in session history"),
		bucket("Tool calls", toolCallTokens, "assistant tool-call arguments"),
		bucket("Tool results", toolResultTokens, `${toolResultCount} result(s)`),
		bucket("Expertise", expertiseTokens, `${expertiseResultCount} read_expertise result(s), ${expertiseCallCount} call(s)`),
		bucket("Bash executions", bashTokens, `${bashCount} captured command output(s)`),
		bucket("Injected context", customTokens, `${customCount} custom message(s)`),
		bucket("Summaries", summaryTokens, `${summaryCount} branch/compaction summary item(s)`),
	].filter((item) => item.tokens > 0 || item.label === "System prompt");
}

function buildReport(ctx: any): string[] {
	const branch = ctx.sessionManager.getBranch() as AnyEntry[];
	const entries = entriesThatContributeToContext(branch);
	const allEntries = ctx.sessionManager.getEntries() as AnyEntry[];
	const usage = ctx.getContextUsage() as ContextUsage;
	const systemPrompt = ctx.getSystemPrompt() ?? "";
	const sessionUsage = collectSessionUsage(allEntries);
	const buckets = buildContextBuckets(entries, systemPrompt);
	const estimatedTotal = buckets.reduce((sum, item) => sum + item.tokens, 0);
	const displayTotal = usage?.tokens ?? estimatedTotal;
	const modelName = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "no model selected";
	const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow;
	const percent = usage?.percent;
	const sessionFile = ctx.sessionManager.getSessionFile?.() ?? "in-memory";

	return [
		"Pi Context Usage",
		"────────────────",
		line("Model", modelName),
		line("Session", sessionFile),
		line(
			"Current context",
			`${formatTokens(displayTotal)} / ${formatTokens(contextWindow)}`,
			percent === null || percent === undefined ? "exact usage unknown; component totals are estimates" : `${percent.toFixed(1)}%`,
		),
		line("Estimated breakdown", formatTokens(estimatedTotal), "~1 token per 4 chars for component buckets"),
		"",
		"Breakdown",
		...buckets
			.sort((a, b) => b.tokens - a.tokens)
			.map((item) => line(item.label, formatTokens(item.tokens), `${pct(item.tokens, displayTotal)} · ${item.details}`)),
		"",
		"Session spend",
		line("Input", formatTokens(sessionUsage.input), `${sessionUsage.assistantMessages} assistant response(s)`),
		line("Output", formatTokens(sessionUsage.output)),
		line("Cache read", formatTokens(sessionUsage.cacheRead)),
		line("Cache write", formatTokens(sessionUsage.cacheWrite)),
		line("Cost", formatCost(sessionUsage.cost)),
	];
}

export default function registerContextCommand(pi: ExtensionAPI) {
	pi.on("context", (event: any) => ({
		messages: event.messages.filter(
			(message: any) => !(message.role === "custom" && message.customType === CONTEXT_REPORT_MESSAGE_TYPE),
		),
	}));

	pi.registerCommand("context", {
		description: "Show Pi context usage, token spend, and component breakdown",
		getArgumentCompletions: (prefix) => {
			const options = ["clear", "hide", "widget"];
			const matches = options.filter((option) => option.startsWith(prefix.trim().toLowerCase()));
			return matches.length > 0 ? matches.map((value) => ({ value, label: value })) : null;
		},
		handler: async (args, ctx) => {
			await ctx.waitForIdle();
			const trimmed = args.trim().toLowerCase();
			if (trimmed === "clear" || trimmed === "hide") {
				ctx.ui.setWidget("context", undefined);
				ctx.ui.notify("Context widget hidden.", "info");
				return;
			}

			const report = buildReport(ctx);
			if (trimmed === "widget") {
				ctx.ui.setWidget("context", report, { placement: "aboveEditor" });
				ctx.ui.notify("Context widget shown above the editor. It may truncate; run /context for the full report.", "info");
				return;
			}

			ctx.ui.setWidget("context", undefined);
			pi.sendMessage(
				{
					customType: CONTEXT_REPORT_MESSAGE_TYPE,
					content: report.join("\n"),
					display: true,
					details: { excludeFromContext: true },
				},
				{ triggerTurn: false },
			);
		},
	});
}

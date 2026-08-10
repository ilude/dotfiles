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

import {
	formatSkillsForPrompt,
	type ExtensionAPI,
	type Skill,
} from "@earendil-works/pi-coding-agent";

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

type ActiveToolSchema = {
	name: string;
	description?: string;
	parameters?: unknown;
};

type SystemPromptOptions = {
	customPrompt?: string;
	selectedTools?: string[];
	toolSnippets?: Record<string, string>;
	promptGuidelines?: string[];
	appendSystemPrompt?: string;
	cwd?: string;
	contextFiles?: Array<{ path: string; content: string }>;
	skills?: Skill[];
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

const BUCKET_MARKS = ["█", "▓", "▒", "░", "■", "●", "◆", "▲", "◇", "○"];

function buildTokenMap(buckets: Bucket[], total: number | null | undefined): string[] {
	const estimatedTotal = buckets.reduce((sum, item) => sum + item.tokens, 0);
	const denominator = Math.max(total ?? 0, estimatedTotal);
	if (!denominator) return [];
	const sorted = buckets.filter((item) => item.tokens > 0).sort((a, b) => b.tokens - a.tokens);
	const width = 48;
	const segments = sorted.map((item, index) => {
		const cells = Math.max(1, Math.round((item.tokens / denominator) * width));
		return BUCKET_MARKS[index % BUCKET_MARKS.length].repeat(cells);
	});
	const bar = segments.join("").slice(0, width).padEnd(width, "·");
	return [
		"Token map",
		bar,
		...sorted.map((item, index) => `${BUCKET_MARKS[index % BUCKET_MARKS.length]} ${item.label}: ${formatTokens(item.tokens)} (${pct(item.tokens, denominator)})`),
	];
}

function bucket(label: string, tokens: number, details: string): Bucket {
	return { label, tokens, details };
}

const CONTEXT_FILES_PREFIX =
	"\n\n<project_context>\n\nProject-specific instructions and guidelines:\n\n";
const CONTEXT_FILES_SUFFIX = "</project_context>\n";

function formatContextFileForPrompt(file: { path: string; content: string }): string {
	return `<project_instructions path="${file.path}">\n${file.content}\n</project_instructions>\n\n`;
}

function formatContextFilesForPrompt(contextFiles: Array<{ path: string; content: string }>): string {
	if (contextFiles.length === 0) return "";
	return `${CONTEXT_FILES_PREFIX}${contextFiles.map(formatContextFileForPrompt).join("")}${CONTEXT_FILES_SUFFIX}`;
}

export function buildContextFileDetailBuckets(
	contextFiles: Array<{ path: string; content: string }>,
): Bucket[] {
	if (contextFiles.length === 0) return [];
	const files = contextFiles.map((file) => {
		const renderedTokens = Math.floor(
			formatContextFileForPrompt(file).length / TOKEN_APPROX_DIVISOR,
		);
		const contentTokens = Math.floor(
			file.content.length / TOKEN_APPROX_DIVISOR,
		);
		return bucket(
			file.path,
			renderedTokens,
			`content ${formatTokens(contentTokens)}, wrapper ${formatTokens(Math.max(0, renderedTokens - contentTokens))}`,
		);
	});
	const totalTokens = Math.floor(
		formatContextFilesForPrompt(contextFiles).length / TOKEN_APPROX_DIVISOR,
	);
	const fileTokens = files.reduce((sum, item) => sum + item.tokens, 0);
	return [
		...files,
		bucket(
			"Shared section wrapper",
			Math.max(0, totalTokens - fileTokens),
			"project_context heading and container",
		),
	].filter((item) => item.tokens > 0);
}

function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

export function buildSkillPromptDetailBuckets(
	skills: Skill[],
	readIsActive: boolean,
): Bucket[] {
	if (!readIsActive) return [];
	const visible = skills.filter((skill) => !skill.disableModelInvocation);
	const rendered = formatSkillsForPrompt(visible);
	if (!rendered) return [];
	const nameTokens = Math.floor(
		visible.reduce((sum, skill) => sum + escapeXml(skill.name).length, 0) /
			TOKEN_APPROX_DIVISOR,
	);
	const descriptionTokens = Math.floor(
		visible.reduce(
			(sum, skill) => sum + escapeXml(skill.description).length,
			0,
		) / TOKEN_APPROX_DIVISOR,
	);
	const locationTokens = Math.floor(
		visible.reduce(
			(sum, skill) => sum + escapeXml(skill.filePath).length,
			0,
		) / TOKEN_APPROX_DIVISOR,
	);
	const totalTokens = Math.floor(rendered.length / TOKEN_APPROX_DIVISOR);
	const wrapperTokens = Math.max(
		0,
		totalTokens - nameTokens - descriptionTokens - locationTokens,
	);
	return [
		bucket("Names", nameTokens, `${visible.length} model-visible skill name(s)`),
		bucket("Descriptions", descriptionTokens, "skill routing descriptions"),
		bucket("Locations", locationTokens, "rendered SKILL.md paths"),
		bucket("Wrappers", wrapperTokens, "shared guidance and XML structure"),
	].filter((item) => item.tokens > 0);
}

function customMessageContributes(entry: AnyEntry): boolean {
	return (
		entry.type === "custom_message" &&
		entry.customType !== CONTEXT_REPORT_MESSAGE_TYPE
	);
}

export function buildInjectedContextDetailBuckets(entries: AnyEntry[]): Bucket[] {
	const byType = new Map<string, { tokens: number; count: number }>();
	for (const entry of entries) {
		if (!customMessageContributes(entry)) continue;
		const label = entry.customType || "(unspecified)";
		const current = byType.get(label) ?? { tokens: 0, count: 0 };
		current.tokens += estimateTokens(entry.content);
		current.count += 1;
		byType.set(label, current);
	}
	return [...byType.entries()]
		.map(([label, value]) =>
			bucket(label, value.tokens, `${value.count} custom message(s)`),
		)
		.sort((a, b) => b.tokens - a.tokens || a.label.localeCompare(b.label));
}

function formatToolInstructionsForPrompt(options: SystemPromptOptions): {
	text: string;
	visibleToolCount: number;
	guidelineCount: number;
} {
	if (options.customPrompt) return { text: "", visibleToolCount: 0, guidelineCount: 0 };

	const selectedTools = options.selectedTools ?? ["read", "bash", "edit", "write"];
	const toolSnippets = options.toolSnippets ?? {};
	const visibleTools = selectedTools.filter((name) => Boolean(toolSnippets[name]));
	const toolsList = visibleTools.length > 0
		? visibleTools.map((name) => `- ${name}: ${toolSnippets[name]}`).join("\n")
		: "(none)";
	const guidelines: string[] = [];
	const seenGuidelines = new Set<string>();
	const addGuideline = (value: string) => {
		const normalized = value.trim();
		if (!normalized || seenGuidelines.has(normalized)) return;
		seenGuidelines.add(normalized);
		guidelines.push(normalized);
	};
	if (
		selectedTools.includes("bash") &&
		!selectedTools.includes("grep") &&
		!selectedTools.includes("find") &&
		!selectedTools.includes("ls")
	) {
		addGuideline("Use bash for file operations like ls, rg, find");
	}
	for (const guideline of options.promptGuidelines ?? []) addGuideline(guideline);
	addGuideline("Be concise in your responses");
	addGuideline("Show file paths clearly when working with files");

	return {
		text: `${toolsList}\n${guidelines.map((guideline) => `- ${guideline}`).join("\n")}`,
		visibleToolCount: visibleTools.length,
		guidelineCount: guidelines.length,
	};
}

function buildSystemPromptBuckets(systemPrompt: string, options?: SystemPromptOptions): Bucket[] {
	const totalTokens = estimateTokens(systemPrompt);
	if (!options) {
		return [bucket("System prompt", totalTokens, "Pi instructions, tool docs, AGENTS.md, extension guidance")];
	}

	const buckets: Bucket[] = [];
	let attributedTokens = 0;
	const addRenderedBucket = (label: string, rendered: string, details: string) => {
		const tokens = Math.floor(rendered.length / TOKEN_APPROX_DIVISOR);
		if (tokens <= 0) return;
		attributedTokens += tokens;
		buckets.push(bucket(label, tokens, details));
	};

	addRenderedBucket("Custom prompt", options.customPrompt ?? "", "--system-prompt or configured custom prompt");

	const toolInstructions = formatToolInstructionsForPrompt(options);
	addRenderedBucket(
		"Tool instructions",
		toolInstructions.text,
		`${toolInstructions.visibleToolCount} visible tool snippet(s), ${toolInstructions.guidelineCount} rendered guideline(s)`,
	);

	const contextFiles = options.contextFiles ?? [];
	addRenderedBucket(
		"Context files",
		formatContextFilesForPrompt(contextFiles),
		`${contextFiles.length} loaded AGENTS/context file(s), including rendered wrappers and paths`,
	);

	const skills = options.skills ?? [];
	const modelVisibleSkills = skills.filter((skill) => !skill.disableModelInvocation);
	const selectedTools = options.selectedTools ?? ["read", "bash", "edit", "write"];
	addRenderedBucket(
		"Skills",
		selectedTools.includes("read") ? formatSkillsForPrompt(skills) : "",
		`${modelVisibleSkills.length} model-visible skill(s), including rendered guidance, wrappers, and locations`,
	);

	addRenderedBucket(
		"Appended prompt",
		options.appendSystemPrompt ? `\n\n${options.appendSystemPrompt}` : "",
		"--append-system-prompt and appended extension text",
	);

	const remainder = Math.max(0, totalTokens - attributedTokens);
	if (remainder > 0 || buckets.length === 0) {
		buckets.unshift(
			bucket(
				options.customPrompt ? "Prompt wrapper" : "Pi prompt framework",
				remainder,
				options.customPrompt
					? "cwd line and residual prompt formatting"
					: "fixed Pi instructions, documentation index, section headings, cwd, and residual formatting",
			),
		);
	}

	return buckets;
}

function toolSchemaValue(tool: ActiveToolSchema) {
	return {
		name: tool.name,
		description: tool.description ?? "",
		parameters: tool.parameters ?? {},
	};
}

export function buildToolSchemaBuckets(activeTools: ActiveToolSchema[]): Bucket[] {
	return activeTools
		.map((tool) => {
			const descriptionTokens = estimateTokens(tool.description ?? "");
			const parameterTokens = estimateTokens(JSON.stringify(tool.parameters ?? {}));
			return bucket(
				tool.name,
				estimateTokens(JSON.stringify(toolSchemaValue(tool))),
				`parameters ${formatTokens(parameterTokens)}, description ${formatTokens(descriptionTokens)}`,
			);
		})
		.sort((a, b) => b.tokens - a.tokens || a.label.localeCompare(b.label));
}

function hasProviderBasedContextUsage(branch: AnyEntry[]): boolean {
	let startIndex = 0;
	for (let index = branch.length - 1; index >= 0; index -= 1) {
		if (branch[index]?.type === "compaction") {
			startIndex = index + 1;
			break;
		}
	}

	return branch.slice(startIndex).some((entry) => {
		if (entry.type !== "message" || entry.message?.role !== "assistant") return false;
		const message = entry.message;
		if (message.stopReason === "aborted" || message.stopReason === "error" || !message.usage) return false;
		const usage = message.usage;
		return (usage.totalTokens || usage.input + usage.output + usage.cacheRead + usage.cacheWrite) > 0;
	});
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

export function buildContextBuckets(
	entries: AnyEntry[],
	systemPrompt: string,
	systemPromptOptions?: SystemPromptOptions,
	activeTools: ActiveToolSchema[] = [],
): Bucket[] {
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
		} else if (customMessageContributes(entry)) {
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

	const toolSchemaTokens =
		activeTools.length === 0
			? 0
			: estimateTokens(JSON.stringify(activeTools.map(toolSchemaValue)));

	return [
		...buildSystemPromptBuckets(systemPrompt, systemPromptOptions),
		bucket(
			"Tool schemas",
			toolSchemaTokens,
			`${activeTools.length} active tool description(s) and parameter schema(s)`,
		),
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

function buildReport(pi: ExtensionAPI, ctx: any): string[] {
	const branch = ctx.sessionManager.getBranch() as AnyEntry[];
	const entries = entriesThatContributeToContext(branch);
	const allEntries = ctx.sessionManager.getEntries() as AnyEntry[];
	const usage = ctx.getContextUsage() as ContextUsage;
	const systemPrompt = ctx.getSystemPrompt() ?? "";
	const systemPromptOptions = typeof ctx.getSystemPromptOptions === "function"
		? ctx.getSystemPromptOptions()
		: undefined;
	const sessionUsage = collectSessionUsage(allEntries);
	const activeToolNames = new Set(pi.getActiveTools());
	const activeTools = pi
		.getAllTools()
		.filter((tool) => activeToolNames.has(tool.name));
	const buckets = buildContextBuckets(
		entries,
		systemPrompt,
		systemPromptOptions,
		activeTools,
	);
	const toolSchemaBuckets = buildToolSchemaBuckets(activeTools);
	const contextFileBuckets = buildContextFileDetailBuckets(
		systemPromptOptions?.contextFiles ?? [],
	);
	const selectedTools = systemPromptOptions?.selectedTools ?? [
		"read",
		"bash",
		"edit",
		"write",
	];
	const skillPromptBuckets = buildSkillPromptDetailBuckets(
		systemPromptOptions?.skills ?? [],
		selectedTools.includes("read"),
	);
	const injectedContextBuckets = buildInjectedContextDetailBuckets(entries);
	const estimatedTotal = buckets.reduce((sum, item) => sum + item.tokens, 0);
	const providerBasedTotal = hasProviderBasedContextUsage(branch)
		? usage?.tokens
		: null;
	const hasProviderBasedUsage =
		providerBasedTotal !== null && providerBasedTotal !== undefined;
	const displayTotal = providerBasedTotal ?? estimatedTotal;
	const breakdownTotal = Math.max(displayTotal, estimatedTotal);
	const modelName = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "no model selected";
	const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow;
	const percent = contextWindow > 0 ? (displayTotal / contextWindow) * 100 : null;
	const percentDetail = percent === null
		? "context usage unknown; component totals are estimates"
		: hasProviderBasedUsage
			? `${percent.toFixed(1)}% - provider usage plus trailing estimate`
			: `~${percent.toFixed(1)}% - provider usage unavailable`;
	const sessionFile = ctx.sessionManager.getSessionFile?.() ?? "in-memory";

	const tokenMap = buildTokenMap(buckets, breakdownTotal);
	const toolSchemaTotal = Math.max(
		toolSchemaBuckets.reduce((sum, schema) => sum + schema.tokens, 0),
		buckets.find((item) => item.label === "Tool schemas")?.tokens ?? 0,
	);
	const estimateDelta = displayTotal - estimatedTotal;

	return [
		"Pi Context Usage",
		"────────────────",
		line("Model", modelName),
		line("Session", sessionFile),
		line(
			"Current context",
			`${formatTokens(displayTotal)} / ${formatTokens(contextWindow)}`,
			percentDetail,
		),
		line("Estimated breakdown", formatTokens(estimatedTotal), "~1 token per 4 chars for component buckets"),
		...(tokenMap.length ? ["", ...tokenMap] : []),
		"",
		"Breakdown",
		...buckets
			.sort((a, b) => b.tokens - a.tokens)
			.map((item) => line(item.label, formatTokens(item.tokens), `${pct(item.tokens, breakdownTotal)} · ${item.details}`)),
		...(toolSchemaBuckets.length > 0
			? [
					"",
					"Tool schema detail",
					...toolSchemaBuckets.map((item) =>
						line(
							item.label,
							formatTokens(item.tokens),
							`${pct(item.tokens, toolSchemaTotal)} · ${item.details}`,
						),
					),
				]
			: []),
		...(contextFileBuckets.length > 0
			? [
					"",
					"Context file detail",
					...contextFileBuckets.map((item) =>
						line(item.label, formatTokens(item.tokens), item.details),
					),
				]
			: []),
		...(skillPromptBuckets.length > 0
			? [
					"",
					"Skill prompt detail",
					...skillPromptBuckets.map((item) =>
						line(item.label, formatTokens(item.tokens), item.details),
					),
				]
			: []),
		...(injectedContextBuckets.length > 0
			? [
					"",
					"Injected context detail",
					...injectedContextBuckets.map((item) =>
						line(item.label, formatTokens(item.tokens), item.details),
					),
				]
			: []),
		"",
		"Estimate reconciliation",
		line("Pi context estimate", formatTokens(displayTotal)),
		line("Component estimate", formatTokens(estimatedTotal)),
		...(estimateDelta > 0
			? [
					line(
						"Unattributed remainder",
						formatTokens(estimateDelta),
						"tokenizer, message structure, and provider protocol overhead",
					),
				]
			: estimateDelta < 0
				? [
						line(
							"Component overage",
							formatTokens(Math.abs(estimateDelta)),
							"character estimates exceed Pi context estimate",
						),
					]
				: []),
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

			const report = buildReport(pi, ctx);
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

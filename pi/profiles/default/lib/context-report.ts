import {
	buildContextBuckets, buildToolSchemaBuckets, buildContextFileDetailBuckets,
	buildSkillPromptDetailBuckets, buildInjectedContextDetailBuckets,
	collectSessionUsage, hasProviderBasedContextUsage, formatTokens,
	type AnyEntry, type ContextUsage, type SystemPromptOptions, type ActiveToolSchema, type Bucket,
} from "./context-analysis.ts";

export interface ContextReportInput {
	branch: AnyEntry[];
	entries: AnyEntry[];
	allEntries: AnyEntry[];
	usage: ContextUsage;
	systemPrompt: string;
	systemPromptOptions?: SystemPromptOptions;
	activeTools: ActiveToolSchema[];
	model?: { provider: string; id: string; contextWindow: number };
	sessionFile: string;
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

export function formatContextReport(input: ContextReportInput): string[] {
	const { branch, entries, allEntries, usage, systemPrompt, systemPromptOptions, activeTools, model, sessionFile } = input;
	const sessionUsage = collectSessionUsage(allEntries);
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
	const modelName = model ? `${model.provider}/${model.id}` : "no model selected";
	const contextWindow = usage?.contextWindow ?? model?.contextWindow;
	const percent = contextWindow !== undefined && contextWindow > 0 ? (displayTotal / contextWindow) * 100 : null;
	const percentDetail = percent === null
		? "context usage unknown; component totals are estimates"
		: hasProviderBasedUsage
			? `${percent.toFixed(1)}% - provider usage plus trailing estimate`
			: `~${percent.toFixed(1)}% - provider usage unavailable`;

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
		"Estimates describe Pi's stored context, not final provider serialization or later extension rewrites. Images and hidden reasoning may not be fully attributable.",
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
		line("Cost", formatCost(sessionUsage.cost), sessionUsage.unpricedBedrockMessages ? `${sessionUsage.unpricedBedrockMessages} unpriced Bedrock response(s) excluded` : ""),
	];
}


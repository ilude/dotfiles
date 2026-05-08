# Provider Spike Archive Preflight

- command: git status --short + raw prompt/secret scan
- exit_code: 0

## git status --short
 M .specs/prompt-router-control-plane/plan.md
 M pi/extensions/prompt-router.ts
 M pi/extensions/workflow-commands.ts
 M pi/tests/prompt-router.test.ts
?? .specs/prompt-router-control-plane/evidence/
?? .specs/prompt-router-control-plane/provider-architecture-spike.md
?? .specs/prompt-router-control-plane/review-2/

## scan triage
.specs/prompt-router-control-plane/evidence/provider-spike-vitest.md:13: [32m✓[39m tests/task-registry.test.ts [2m([22m[2m24 tests[22m[2m)[22m[33m 405[2mms[22m[39m
.specs/prompt-router-control-plane/evidence/provider-spike-vitest.md:29:     [33m[2m✓[22m[39m a single turn with routing + tool call produces all expected event families with redacted secrets [33m 467[2mms[22m[39m
.specs/prompt-router-control-plane/evidence/provider-spike-vitest.md:70:     [33m[2m✓[22m[39m commit_stage rejects missing token and never stages unsafe ignored paths [33m 10751[2mms[22m[39m
.specs/prompt-router-control-plane/evidence/worktree-preflight.md:8:- Worktree path: <private-path>
pi/extensions/agent-chain.ts:33:import { createTask, transitionTask } from "../lib/task-registry.js";
pi/extensions/agent-chain.ts:197:	return normalizeRetrievalText(value).split(" ").filter((token) => token.length > 1 && !STOPWORDS.has(token));
pi/extensions/agent-chain.ts:276:	for (const token of retrievalTokens(query)) {
pi/extensions/agent-chain.ts:277:		if (haystack.includes(token)) score += 5;
pi/extensions/agent-team.ts:17:import { createTask, transitionTask } from "../lib/task-registry.js";
pi/extensions/codex-status.ts:2:// `pi-codex-status` project: https://github.com/lhl/pi-codex-status
pi/extensions/codex-status.ts:12:// it does not refresh tokens, write cache files, or register a CLI. The command
pi/extensions/codex-status.ts:63:export const USAGE_ENDPOINT = "https://chatgpt.com/backend-api/wham/usage";
pi/extensions/codex-status.ts:64:const OFFICIAL_USAGE_PAGE = "https://chatgpt.com/codex/settings/usage";
pi/extensions/codex-status.ts:88:function decodeJwtPayload(token: string): Record<string, unknown> | undefined {
pi/extensions/codex-status.ts:89:	const payload = token.split(".")[1];
pi/extensions/codex-status.ts:103:export function accountIdFromToken(token: string): string | undefined {
pi/extensions/codex-status.ts:104:	const payload = decodeJwtPayload(token);
pi/extensions/codex-status.ts:105:	const authClaim = objectField(payload?.["https://api.openai.com/auth"]);
pi/extensions/codex-status.ts:137:		const tokens = objectField(raw.tokens);
pi/extensions/codex-status.ts:138:		const access = stringField(tokens?.access_token);
pi/extensions/codex-status.ts:141:			stringField(tokens?.account_id) ?? accountIdFromToken(access);
pi/extensions/commit.ts:79:		description: "Create a commit after token validation, message validation, and final staged-set revalidation. Does not push.",
pi/extensions/context.ts:19:	tokens: number | null;
pi/extensions/context.ts:25:	tokens: number;
pi/extensions/context.ts:52:function formatTokens(tokens: number | null | undefined): string {
pi/extensions/context.ts:53:	if (tokens === null || tokens === undefined) return "unknown";
pi/extensions/context.ts:54:	if (tokens < 1_000) return String(tokens);
pi/extensions/context.ts:55:	if (tokens < 10_000) return `${(tokens / 1_000).toFixed(1)}k`;
pi/extensions/context.ts:56:	if (tokens < 1_000_000) return `${Math.round(tokens / 1_000)}k`;
pi/extensions/context.ts:57:	return `${(tokens / 1_000_000).toFixed(1)}M`;
pi/extensions/context.ts:78:	const denominator = total || buckets.reduce((sum, item) => sum + item.tokens, 0);
pi/extensions/context.ts:80:	const sorted = buckets.filter((item) => item.tokens > 0).sort((a, b) => b.tokens - a.tokens);
pi/extensions/context.ts:83:		const cells = Math.max(1, Math.round((item.tokens / denominator) * width));
pi/extensions/context.ts:90:		...sorted.map((item, index) => `${BUCKET_MARKS[index % BUCKET_MARKS.length]} ${item.label}: ${formatTokens(item.tokens)} (${pct(item.tokens, denominator)})`),
pi/extensions/context.ts:94:function bucket(label: string, tokens: number, details: string): Bucket {
pi/extensions/context.ts:95:	return { label, tokens, details };
pi/extensions/context.ts:215:	].filter((item) => item.tokens > 0 || item.label === "System prompt");
pi/extensions/context.ts:226:	const estimatedTotal = buckets.reduce((sum, item) => sum + item.tokens, 0);
pi/extensions/context.ts:227:	const displayTotal = usage?.tokens ?? estimatedTotal;
pi/extensions/context.ts:233:	const tokenMap = buildTokenMap(buckets, displayTotal);
pi/extensions/context.ts:245:		line("Estimated breakdown", formatTokens(estimatedTotal), "~1 token per 4 chars for component buckets"),
pi/extensions/context.ts:246:		...(tokenMap.length ? ["", ...tokenMap] : []),
pi/extensions/context.ts:250:			.sort((a, b) => b.tokens - a.tokens)
pi/extensions/context.ts:251:			.map((item) => line(item.label, formatTokens(item.tokens), `${pct(item.tokens, displayTotal)} · ${item.details}`)),
pi/extensions/context.ts:270:		description: "Show Pi context usage, token spend, and component breakdown",
pi/extensions/damage-control.ts:50: * paths). Future ask-user integration may emit manual_once.
pi/extensions/damage-control.ts:416:function tokenize(command: string): string[] {
pi/extensions/damage-control.ts:420:function isFlagToken(token: string): boolean {
pi/extensions/damage-control.ts:421:	return token.startsWith("-") && token !== "-";
pi/extensions/damage-control.ts:425:	const tokens = tokenize(command);
pi/extensions/damage-control.ts:426:	if (tokens.length === 0) return [];
pi/extensions/damage-control.ts:429:	const head = tokens[0];
pi/extensions/damage-control.ts:432:		for (const token of tokens.slice(1)) {
pi/extensions/damage-control.ts:433:			if (!isFlagToken(token)) targets.push(token);
pi/extensions/damage-control.ts:437:	if (head === "git" && tokens[1] === "rm") {
pi/extensions/damage-control.ts:438:		for (const token of tokens.slice(2)) {
pi/extensions/damage-control.ts:439:			if (!isFlagToken(token)) targets.push(token);
pi/extensions/damage-control.ts:443:	if (head === "git" && tokens[1] === "clean" && tokens.slice(2).some((t) => /^-[a-z]*f/.test(t))) {
pi/extensions/damage-control.ts:447:	if (head === "find" && tokens.includes("-delete")) {
pi/extensions/damage-control.ts:448:		for (const token of tokens.slice(1)) {
pi/extensions/damage-control.ts:449:			if (token === "-delete") break;
pi/extensions/damage-control.ts:450:			if (!isFlagToken(token) && !token.startsWith("(") && !token.startsWith(")")) {
pi/extensions/damage-control.ts:451:				targets.push(token);
pi/extensions/damage-control.ts:466:	if (head === "cp" && tokens[1] === "/dev/null" && tokens[2]) {
pi/extensions/damage-control.ts:467:		targets.push(tokens[2]);
pi/extensions/damage-control.ts:470:	if (head === "mv" && tokens[2] === "/dev/null" && tokens[1]) {
pi/extensions/damage-control.ts:471:		targets.push(tokens[1]);
pi/extensions/damage-control.ts:496:	const tokens = command.split(/\s+/).filter(Boolean);
pi/extensions/damage-control.ts:497:	for (let i = 0; i < tokens.length; i += 1) {
pi/extensions/damage-control.ts:498:		const cmdlet = tokens[i].toLowerCase();
pi/extensions/damage-control.ts:500:		for (let j = i + 1; j < tokens.length; j += 1) {
pi/extensions/damage-control.ts:501:			const t = tokens[j];
pi/extensions/damage-control.ts:502:			if (t.toLowerCase() === "-path" && tokens[j + 1]) {
pi/extensions/damage-control.ts:503:				targets.push(stripQuotes(tokens[j + 1]));
pi/extensions/extension-stats.ts:5: * https://github.com/w-winter/dot314/blob/main/extensions/extension-stats.ts
pi/extensions/extension-stats.ts:14: * - m: toggle calls vs token-estimate attribution
pi/extensions/extension-stats.ts:31:type MetricMode = "calls" | "tokens";
pi/extensions/extension-stats.ts:40:	tokensByToolKey: Map<string, number>; // "owner/tool"
pi/extensions/extension-stats.ts:42:	tokensByExtension: Map<string, number>; // "owner"
pi/extensions/extension-stats.ts:54:	tokensByToolKey: Map<string, number>;
pi/extensions/extension-stats.ts:56:	tokensByExtension: Map<string, number>;
pi/extensions/extension-stats.ts:68:	tokensByToolKey: Map<string, number>;
pi/extensions/extension-stats.ts:70:	tokensByExtension: Map<string, number>;
pi/extensions/extension-stats.ts:90:	tokens: number;
pi/extensions/extension-stats.ts:556:	tokensByToolKey: Map<string, number>,
pi/extensions/extension-stats.ts:558:	tokensByExtension: Map<string, number>,
pi/extensions/extension-stats.ts:561:	tokens = 0,
pi/extensions/extension-stats.ts:567:	if (tokens > 0) {
pi/extensions/extension-stats.ts:568:		tokensByToolKey.set(commandKey, (tokensByToolKey.get(commandKey) ?? 0) + tokens);
pi/extensions/extension-stats.ts:569:		tokensByExtension.set(owner, (tokensByExtension.get(owner) ?? 0) + tokens);
pi/extensions/extension-stats.ts:623:	const otelInput = toFiniteNumber(usage["gen_ai.usage.input_tokens"]);
pi/extensions/extension-stats.ts:624:	const otelOutput = toFiniteNumber(usage["gen_ai.usage.output_tokens"]);
pi/extensions/extension-stats.ts:625:	const otelCacheRead = toFiniteNumber(usage["gen_ai.usage.cache_read_tokens"]);
pi/extensions/extension-stats.ts:626:	const otelCacheWrite = toFiniteNumber(usage["gen_ai.usage.cache_write_tokens"]);
pi/extensions/extension-stats.ts:659:	const tokensByToolKey = new Map<string, number>();
pi/extensions/extension-stats.ts:661:	const tokensByExtension = new Map<string, number>();
pi/extensions/extension-stats.ts:699:				const tokens = estimateTextTokens(obj.content);
pi/extensions/extension-stats.ts:701:				estimatedToolTokens += tokens;
pi/extensions/extension-stats.ts:706:					tokensByToolKey,
pi/extensions/extension-stats.ts:708:					tokensByExtension,
pi/extensions/extension-stats.ts:711:					tokens,
pi/extensions/extension-stats.ts:723:					tokensByToolKey,
pi/extensions/extension-stats.ts:725:					tokensByExtension,
pi/extensions/extension-stats.ts:747:				const tokensPerCommand = usageTokens / pendingCommandKeys.length;
pi/extensions/extension-stats.ts:750:					estimatedToolTokens += tokensPerCommand;
pi/extensions/extension-stats.ts:751:					tokensByToolKey.set(commandKey, (tokensByToolKey.get(commandKey) ?? 0) + tokensPerCommand);
pi/extensions/extension-stats.ts:752:					tokensByExtension.set(owner, (tokensByExtension.get(owner) ?? 0) + tokensPerCommand);
pi/extensions/extension-stats.ts:755:			const tokensPerToolCall = usageTokens > 0 ? usageTokens / toolNames.length : 0;
pi/extensions/extension-stats.ts:762:				estimatedToolTokens += tokensPerToolCall;
pi/extensions/extension-stats.ts:765:				tokensByToolKey.set(toolKey, (tokensByToolKey.get(toolKey) ?? 0) + tokensPerToolCall);
pi/extensions/extension-stats.ts:768:				tokensByExtension.set(owner, (tokensByExtension.get(owner) ?? 0) + tokensPerToolCall);
pi/extensions/extension-stats.ts:789:		tokensByToolKey,
pi/extensions/extension-stats.ts:791:		tokensByExtension,
pi/extensions/extension-stats.ts:813:			tokensByToolKey: new Map(),
pi/extensions/extension-stats.ts:815:			tokensByExtension: new Map(),
pi/extensions/extension-stats.ts:830:		tokensByToolKey: new Map(),
pi/extensions/extension-stats.ts:832:		tokensByExtension: new Map(),
pi/extensions/extension-stats.ts:854:	for (const [toolKey, tokens] of session.tokensByToolKey.entries()) {
pi/extensions/extension-stats.ts:855:		range.tokensByToolKey.set(toolKey, (range.tokensByToolKey.get(toolKey) ?? 0) + tokens);
pi/extensions/extension-stats.ts:856:		day.tokensByToolKey.set(toolKey, (day.tokensByToolKey.get(toolKey) ?? 0) + tokens);
pi/extensions/extension-stats.ts:864:	for (const [owner, tokens] of session.tokensByExtension.entries()) {
pi/extensions/extension-stats.ts:865:		range.tokensByExtension.set(owner, (range.tokensByExtension.get(owner) ?? 0) + tokens);
pi/extensions/extension-stats.ts:866:		day.tokensByExtension.set(owner, (day.tokensByExtension.get(owner) ?? 0) + tokens);
pi/extensions/extension-stats.ts:880:function addTokensToRange(range: RangeAgg, dayKeyLocal: string, owner: string, toolKey: string, tokens: number): void {
pi/extensions/extension-stats.ts:882:	if (!day || tokens <= 0) return;
pi/extensions/extension-stats.ts:883:	range.estimatedToolTokens += tokens;
pi/extensions/extension-stats.ts:884:	day.estimatedToolTokens += tokens;
pi/extensions/extension-stats.ts:885:	range.tokensByToolKey.set(toolKey, (range.tokensByToolKey.get(toolKey) ?? 0) + tokens);
pi/extensions/extension-stats.ts:886:	day.tokensByToolKey.set(toolKey, (day.tokensByToolKey.get(toolKey) ?? 0) + tokens);
pi/extensions/extension-stats.ts:887:	range.tokensByExtension.set(owner, (range.tokensByExtension.get(owner) ?? 0) + tokens);
pi/extensions/extension-stats.ts:888:	day.tokensByExtension.set(owner, (day.tokensByExtension.get(owner) ?? 0) + tokens);
pi/extensions/extension-stats.ts:897:		const byTurn = new Map<string, { routedAt?: Date; tokens: number }>();
pi/extensions/extension-stats.ts:910:				const current = byTurn.get(turnId) ?? { tokens: 0 };
pi/extensions/extension-stats.ts:916:					current.tokens += extractUsageTokens(obj?.payload?.usage);
pi/extensions/extension-stats.ts:926:		for (const { routedAt, tokens } of byTurn.values()) {
pi/extensions/extension-stats.ts:927:			if (!routedAt || tokens <= 0) continue;
pi/extensions/extension-stats.ts:935:				addTokensToRange(range, dayKey, "prompt-router", "prompt-router/route", tokens);
pi/extensions/extension-stats.ts:1002:				const tokens = extractUsageTokens(extractMessageUsage(obj));
pi/extensions/extension-stats.ts:1003:				if (tokens <= 0) continue;
pi/extensions/extension-stats.ts:1011:					addTokensToRange(range, dayKey, "prompt-router", "prompt-router/route", tokens);
pi/extensions/extension-stats.ts:1050:				tokensByToolKey: new Map(),
pi/extensions/extension-stats.ts:1052:				tokensByExtension: new Map(),
pi/extensions/extension-stats.ts:1074:	if (mode === "tokens" && totalTokens <= 0) return "calls";
pi/extensions/extension-stats.ts:1086:	tokensMap: Map<string, number>,
pi/extensions/extension-stats.ts:1090:	const keys = new Set([...callsMap.keys(), ...tokensMap.keys(), ...sessionsMap.keys()]);
pi/extensions/extension-stats.ts:1092:	const totalTokens = sumValues(tokensMap);
pi/extensions/extension-stats.ts:1094:	const metricTotal = effectiveMetric === "tokens" ? totalTokens : totalCalls;
pi/extensions/extension-stats.ts:1099:		const tokens = tokensMap.get(key) ?? 0;
pi/extensions/extension-stats.ts:1101:		const metricValue = effectiveMetric === "tokens" ? tokens : calls;
pi/extensions/extension-stats.ts:1105:			tokens,
pi/extensions/extension-stats.ts:1153:	const tokensLabel = metric === "tokens" ? "tokens*" : "tokens";
pi/extensions/extension-stats.ts:1155:	const header = `${padRight("name", nameWidth)}  ${padLeft(callsLabel, 9)}  ${padLeft(tokensLabel, 9)}  ${padLeft("sessions", 9)}  ${padLeft("share", 8)}`;
pi/extensions/extension-stats.ts:1162:		const rowText = `${padRight(row.name.slice(0, nameWidth), nameWidth)}  ${padLeft(formatInt(row.calls), 9)}  ${padLeft(formatCompact(row.tokens), 9)}  ${padLeft(formatInt(row.sessions), 9)}  ${padLeft(formatPercent(row.sharePct), 8)}`;
pi/extensions/extension-stats.ts:1178:	return `Last ${days} days: ${range.sessions} sessions · ${range.toolCalls} tool calls · ~${formatCompact(range.estimatedToolTokens)} tool-call tokens · ${extCount} extensions · ${toolCount} extension/tools`;
pi/extensions/extension-stats.ts:1329:			this.metric = this.metric === "calls" ? "tokens" : "calls";
pi/extensions/extension-stats.ts:1376:			range.tokensByExtension,
pi/extensions/extension-stats.ts:1382:			range.tokensByToolKey,
pi/extensions/extension-stats.ts:1406:		lines.push(truncateToWidth(dim(`Metric mode: ${effectiveMetric} ${effectiveMetric === "tokens" ? "(estimated)" : ""}`), width));
pi/extensions/extension-stats.ts:1457:		"| Name | Calls | Est. tool-call tokens | Sessions | Share |",
pi/extensions/extension-stats.ts:1461:				`| ${displayUsageName(row.name)} | ${formatInt(row.calls)} | ${formatInt(row.tokens)} | ${formatInt(row.sessions)} | ${formatPercent(row.sharePct)} |`,
pi/extensions/extension-stats.ts:1482:	const tokens = args
pi/extensions/extension-stats.ts:1485:		.map((token) => token.replace(/^--?/, ""))
pi/extensions/extension-stats.ts:1486:		.filter((token) => token.length > 0);
pi/extensions/extension-stats.ts:1488:	for (const token of tokens) {
pi/extensions/extension-stats.ts:1489:		if (token === "60") requested.add(60);
pi/extensions/extension-stats.ts:1490:		if (token === "90") requested.add(90);
pi/extensions/extension-stats.ts:1491:		if (token === "all") {
pi/extensions/extension-stats.ts:1512:			range.tokensByExtension,
pi/extensions/extension-stats.ts:1518:			range.tokensByToolKey,
pi/extensions/operator-status.ts:12: * Healthy default keeps the bar quiet (no `OK` token, no zero counters). The
pi/extensions/operator-status.ts:29:import { listTasks, type TaskRecordV1 } from "../lib/task-registry.js";
pi/extensions/pnpm-lock.yaml:146:  '@aws-sdk/token-providers@3.1041.0':
pi/extensions/pnpm-lock.yaml:522:  '@tokenizer/inflate@0.4.1':
pi/extensions/pnpm-lock.yaml:526:  '@tokenizer/token@0.3.0':
pi/extensions/pnpm-lock.yaml:982:  token-types@6.1.2:
pi/extensions/pnpm-lock.yaml:1120:      '@aws-sdk/token-providers': 3.1041.0
pi/extensions/pnpm-lock.yaml:1258:      '@aws-sdk/token-providers': 3.1041.0
pi/extensions/pnpm-lock.yaml:1418:  '@aws-sdk/token-providers@3.1041.0':
pi/extensions/pnpm-lock.yaml:1959:  '@tokenizer/inflate@0.4.1':
pi/extensions/pnpm-lock.yaml:1962:      token-types: 6.1.2
pi/extensions/pnpm-lock.yaml:1966:  '@tokenizer/token@0.3.0': {}
pi/extensions/pnpm-lock.yaml:2121:      '@tokenizer/inflate': 0.4.1
pi/extensions/pnpm-lock.yaml:2123:      token-types: 6.1.2
pi/extensions/pnpm-lock.yaml:2418:      '@tokenizer/token': 0.3.0
pi/extensions/pnpm-lock.yaml:2432:  token-types@6.1.2:
pi/extensions/pnpm-lock.yaml:2435:      '@tokenizer/token': 0.3.0
pi/extensions/provider.ts:13:type ProviderAuthType = "api_key" | "oauth";
pi/extensions/provider.ts:34:	{ id: "openai", label: "OpenAI", auth: "api_key", envVar: "OPENAI_API_KEY" },
pi/extensions/provider.ts:35:	{ id: "azure-openai-responses", label: "Azure OpenAI Responses", auth: "api_key", envVar: "AZURE_OPENAI_API_KEY" },
pi/extensions/provider.ts:36:	{ id: "google", label: "Google Gemini", auth: "api_key", envVar: "GEMINI_API_KEY" },
pi/extensions/provider.ts:37:	{ id: "mistral", label: "Mistral", auth: "api_key", envVar: "MISTRAL_API_KEY" },
pi/extensions/provider.ts:38:	{ id: "groq", label: "Groq", auth: "api_key", envVar: "GROQ_API_KEY" },
pi/extensions/provider.ts:39:	{ id: "cerebras", label: "Cerebras", auth: "api_key", envVar: "CEREBRAS_API_KEY" },
pi/extensions/provider.ts:40:	{ id: "xai", label: "xAI", auth: "api_key", envVar: "XAI_API_KEY" },
pi/extensions/provider.ts:41:	{ id: "openrouter", label: "OpenRouter", auth: "api_key", envVar: "OPENROUTER_API_KEY" },
pi/extensions/provider.ts:42:	{ id: "vercel-ai-gateway", label: "Vercel AI Gateway", auth: "api_key", envVar: "AI_GATEWAY_API_KEY" },
pi/extensions/provider.ts:43:	{ id: "zai", label: "ZAI", auth: "api_key", envVar: "ZAI_API_KEY" },
pi/extensions/provider.ts:44:	{ id: "opencode", label: "OpenCode Zen", auth: "api_key", envVar: "OPENCODE_API_KEY" },
pi/extensions/provider.ts:45:	{ id: "opencode-go", label: "OpenCode Go", auth: "api_key", envVar: "OPENCODE_API_KEY" },
pi/extensions/provider.ts:46:	{ id: "huggingface", label: "Hugging Face", auth: "api_key", envVar: "HF_TOKEN" },

## triage summary
- Matches are known source/test field names or sanitized test fixtures unless otherwise noted.
- No raw synthetic prompt content is stored in operator proof/outcome evidence beyond non-secret fixture labels.

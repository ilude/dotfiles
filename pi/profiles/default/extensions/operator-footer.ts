import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { ReloadMonitor } from "../lib/reload-monitor.ts";

const ANSI = {
	cyan: "\x1b[36m",
	dim: "\x1b[2m",
	green: "\x1b[32m",
	grey: "\x1b[90m",
	orange: "\x1b[38;5;208m",
	pink: "\x1b[38;5;205m",
	red: "\x1b[31m",
	reset: "\x1b[0m",
	white: "\x1b[37m",
	yellow: "\x1b[33m",
} as const;

const BEDROCK_PROVIDERS = new Set(["amazon-bedrock", "bedrock-mantle"]);
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
let bedrockMonthCost = 0;
let cachedPiVersion: string | null | undefined;
let codexRefreshTimer: ReturnType<typeof setTimeout> | null = null;
const reloadMonitor = new ReloadMonitor();
let reloadTimer: ReturnType<typeof setInterval> | undefined;
let requestFooterRender: (() => void) | undefined;
const cachedStatusDirectories = new Map<string, string>();

interface ExtensionAPI {
	on(event: string, handler: (event: any, ctx: ExtensionContext) => void | Promise<void>): void;
	getThinkingLevel?: () => string;
	getCommands: () => { sourceInfo: { path: string } }[];
	getAllTools: () => { sourceInfo: { path: string } }[];
}

interface ExtensionContext {
	cwd: string;
	isProjectTrusted: () => boolean;
	model?: { id?: string; name?: string; provider?: string };
	ui: {
		setFooter?: (factory: (tui: { requestRender: () => void }, theme: unknown, footerData: ReadonlyFooterDataProvider) => FooterComponent) => void;
		getAllThemes: () => { path?: string }[];
		notify: (message: string, type: "warning") => void;
		setStatus: (key: string, value: string | undefined) => void;
	};
	sessionManager: { getEntries: () => unknown[] };
	getContextUsage?: () => ContextUsage | null;
}

interface ReadonlyFooterDataProvider {
	getGitBranch: () => string | null;
	getExtensionStatuses: () => ReadonlyMap<string, string>;
}

interface FooterComponent {
	invalidate: () => void;
	render: (width: number) => string[];
}

interface ContextUsage {
	tokens: number | null;
	contextWindow: number | null;
	percent: number | null;
}

interface UsageLike {
	input?: number;
	output?: number;
	cacheRead?: number;
	cacheWrite?: number;
	cost?: { total?: number };
}

interface CodexWindow {
	used_percent?: number;
	limit_window_seconds?: number;
	reset_after_seconds?: number;
	reset_at?: number;
}

interface CodexUsageResponse {
	rate_limit?: {
		primary_window?: CodexWindow | null;
		secondary_window?: CodexWindow | null;
	} | null;
}

function visibleWidth(text: string): number {
	return text.replace(/\x1b\[[0-9;]*m/g, "").length;
}

function truncateToWidth(text: string, width: number): string {
	if (width <= 0) return "";
	if (visibleWidth(text) <= width) return text;
	let output = "";
	let visible = 0;
	for (let index = 0; index < text.length; index += 1) {
		const ansi = text.slice(index).match(/^\x1b\[[0-9;]*m/);
		if (ansi) {
			output += ansi[0];
			index += ansi[0].length - 1;
			continue;
		}
		if (visible >= width) break;
		output += text[index];
		visible += 1;
	}
	return `${output}${ANSI.reset}`;
}

function compactTokens(tokens: number): string {
	if (tokens < 1_000) return String(Math.round(tokens));
	if (tokens < 1_000_000) return `${Math.round(tokens / 1_000)}k`;
	const millions = tokens / 1_000_000;
	return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`;
}

function money(value: number): string {
	return `$${value.toFixed(2)}`;
}

function runCommand(args: string[], cwd?: string): string {
	try {
		const useWindowsShellShim = process.platform === "win32" && args[0] === "pi";
		const result = useWindowsShellShim
			? childProcess.spawnSync("pi --version", {
					cwd,
					encoding: "utf-8",
					shell: true,
					timeout: 3000,
					windowsHide: true,
				})
			: childProcess.spawnSync(args[0], args.slice(1), {
					cwd,
					encoding: "utf-8",
					timeout: 3000,
					windowsHide: true,
				});
		return result.status === 0 ? `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() : "";
	} catch {
		return "";
	}
}

function normalizePathForDisplay(inputPath: string): string {
	return inputPath
		.replace(/\\/g, "/")
		.replace(/^[A-Za-z]:/, "")
		.replace(/^\/[a-z]\//, "/")
		.replace(/^\/mnt\/[a-z]\//, "/");
}

function formatStatusDirectory(cwd: string): string {
	const cached = cachedStatusDirectories.get(cwd);
	if (cached !== undefined) return cached;
	const normalizedCwd = normalizePathForDisplay(cwd);
	const home = normalizePathForDisplay(process.env.HOME || process.env.USERPROFILE || os.homedir());
	const gitRoot = runCommand(["git", "-C", cwd, "rev-parse", "--show-toplevel"]);
	let directory: string;
	if (gitRoot) {
		const normalizedRoot = normalizePathForDisplay(gitRoot).replace(/\/$/, "");
		const basename = path.basename(normalizedRoot);
		directory = normalizedRoot.startsWith(home) ? `~/${basename}` : basename;
	} else if (normalizedCwd.startsWith(home)) {
		const relative = normalizedCwd.slice(home.length);
		directory = relative ? `~${relative}` : "~";
	} else {
		directory = normalizedCwd;
	}
	cachedStatusDirectories.set(cwd, directory);
	return directory;
}

function resolvePiVersion(): string | null {
	if (cachedPiVersion !== undefined) return cachedPiVersion;
	const output = runCommand(["pi", "--version"]);
	cachedPiVersion = output.match(/\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/)?.[0] ?? null;
	return cachedPiVersion;
}

function formatProviderName(provider: string | undefined): string | null {
	if (!provider) return null;
	if (provider === "openai-codex") return "codex";
	if (provider === "amazon-bedrock" || provider === "bedrock-mantle") return "bedrock";
	return provider;
}

function formatModelName(model: { id?: string; name?: string } | undefined): string {
	const name = model?.id || model?.name;
	if (!name) return "no-model";
	return name
		.replace(/^(?:anthropic|openai)\//, "")
		.replace(/^(?:(?:us|eu|global)\.)?(?:anthropic|openai)\./, "")
		.replace(/^claude-/, "");
}

function colorForThinkingLevel(model: string, thinkingLevel: string): string {
	const normalizedModel = model.toLowerCase();
	const normalizedLevel = thinkingLevel.toLowerCase();
	if (normalizedLevel === "off") return ANSI.yellow;
	if (normalizedModel === "gpt-5.6-sol" && ["medium", "high", "xhigh"].includes(normalizedLevel)) return ANSI.pink;
	if (["high", "xhigh"].includes(normalizedLevel)) return ANSI.pink;
	return ANSI.cyan;
}

function formatContextUsageSegment(contextUsage: ContextUsage | null | undefined): string | null {
	if (!contextUsage || contextUsage.tokens === null || contextUsage.contextWindow === null || contextUsage.contextWindow <= 0) return null;
	const percent = Math.round(contextUsage.percent ?? (contextUsage.tokens / contextUsage.contextWindow) * 100);
	const color = percent >= 90 ? ANSI.red : percent >= 67 ? ANSI.yellow : ANSI.green;
	return `${color}${percent}%${ANSI.reset} ${ANSI.grey}${compactTokens(contextUsage.tokens)}/${compactTokens(contextUsage.contextWindow)}${ANSI.reset}`;
}

function colorBranch(branchName: string | null): string {
	return branchName ? `${ANSI.white}[${ANSI.cyan}${branchName}${ANSI.white}]${ANSI.reset}` : "";
}

function rightAnchor(left: string, right: string | null, width: number): string {
	if (!right) return left;
	const gap = width - visibleWidth(left) - visibleWidth(right);
	return gap < 2 ? left : `${left}${" ".repeat(gap)}${right}`;
}

function rightAlign(text: string, width: number): string {
	const gap = width - visibleWidth(text);
	return gap > 0 ? `${" ".repeat(gap)}${text}` : text;
}

function statusText(value: string | undefined): string {
	return (value ?? "").replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();
}

function profileDir(): string {
	return process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
}

function startReloadMonitor(ctx: ExtensionContext, pi: ExtensionAPI): void {
	if (reloadTimer) clearInterval(reloadTimer);
	reloadMonitor.reset({
		agentDir: profileDir(),
		cwd: ctx.cwd,
		projectTrusted: ctx.isProjectTrusted(),
		projectConfigDir: CONFIG_DIR_NAME,
		loadedPaths: [
			...pi.getCommands().map((command) => command.sourceInfo.path),
			...pi.getAllTools().map((tool) => tool.sourceInfo.path),
			...ctx.ui.getAllThemes().flatMap((theme) => theme.path ? [theme.path] : []),
			path.join(profileDir(), "lib"),
			path.join(profileDir(), "commands"),
		],
	});
	let reportedError: string | undefined;
	const check = () => {
		const before = `${reloadMonitor.needed}:${reloadMonitor.error}`;
		reloadMonitor.check();
		if (reloadMonitor.error && reloadMonitor.error !== reportedError) {
			ctx.ui.notify(`Reload monitor: ${reloadMonitor.error}`, "warning");
		}
		reportedError = reloadMonitor.error;
		if (before !== `${reloadMonitor.needed}:${reloadMonitor.error}`) requestFooterRender?.();
	};
	check();
	reloadTimer = setInterval(check, 2000);
	reloadTimer.unref();
}

function formatReloadIndicator(reloadNeeded: boolean): string {
	if (reloadMonitor.error) return `${ANSI.red}[reload check failed]${ANSI.reset}`;
	return reloadNeeded ? `${ANSI.white}[${ANSI.pink}reload${ANSI.white}]${ANSI.reset}` : "";
}

function formatMainFooter(options: {
	cwd: string;
	branch: string | null;
	model: { id?: string; name?: string; provider?: string } | undefined;
	pi: ExtensionAPI;
	contextUsage: ContextUsage | null;
	reloadNeeded: boolean;
	rightStatus: string | null;
	width: number;
}): string {
	const directory = formatStatusDirectory(options.cwd);
	const branch = colorBranch(options.branch);
	const model = formatModelName(options.model);
	const provider = formatProviderName(options.model?.provider);
	const thinking = options.pi.getThinkingLevel?.() || "off";
	const thinkingLabel = `${ANSI.white}[${colorForThinkingLevel(model, thinking)}${thinking}${ANSI.white}]${ANSI.reset}`;
	const providerLabel = provider ? `${ANSI.dim}${ANSI.grey}${provider}/${ANSI.reset}` : "";
	const contextLabel = formatContextUsageSegment(options.contextUsage);
	const versionLabel = `${ANSI.dim}π v${resolvePiVersion() ?? "?"}${ANSI.reset}${formatReloadIndicator(options.reloadNeeded)}`;
	let left = `${ANSI.green}${directory}${ANSI.reset}${branch} | ${providerLabel}${ANSI.orange}${model}${ANSI.reset}${thinkingLabel}`;
	if (contextLabel) left += ` | ${contextLabel}`;
	left += ` | ${versionLabel}`;
	let composed = rightAnchor(left, options.rightStatus, options.width);
	if (options.rightStatus && composed === left && contextLabel) composed = rightAnchor(contextLabel, options.rightStatus, options.width);
	if (options.rightStatus && composed === contextLabel) composed = rightAlign(options.rightStatus, options.width);
	const reloadIndicator = formatReloadIndicator(options.reloadNeeded);
	if (reloadIndicator && !composed.includes(reloadIndicator)) composed = `${reloadIndicator} ${composed}`;
	if (reloadIndicator && visibleWidth(composed) > options.width) {
		composed = `${reloadIndicator} ${truncateToWidth(left.replace(reloadIndicator, ""), Math.max(0, options.width - visibleWidth(reloadIndicator) - 1))}`;
	}
	return visibleWidth(composed) > options.width ? truncateToWidth(composed, options.width) : composed;
}


function formatBedrockStatus(): string {
	return `bedrock: ${money(bedrockMonthCost)}`;
}

function readJsonObject(filePath: string): Record<string, unknown> | null {
	try {
		const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
	} catch {
		return null;
	}
}

function stringField(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function objectField(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function decodeJwtPayload(token: string): Record<string, unknown> | undefined {
	const payload = token.split(".")[1];
	if (!payload) return undefined;
	try {
		const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
		const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
		return objectField(JSON.parse(Buffer.from(padded, "base64").toString("utf8")));
	} catch {
		return undefined;
	}
}

function accountIdFromToken(token: string): string | undefined {
	const payload = decodeJwtPayload(token);
	const authClaim = objectField(payload?.["https://api.openai.com/auth"]);
	return stringField(authClaim?.chatgpt_account_id);
}

function resolveCodexAuth(): { accessToken: string; accountId?: string } | null {
	const profileAuth = readJsonObject(path.join(profileDir(), "auth.json"));
	const piEntry = objectField(profileAuth?.["openai-codex"]);
	const piAccess = stringField(piEntry?.access);
	if (piAccess) {
		return {
			accessToken: piAccess,
			accountId: stringField(piEntry?.accountId) ?? accountIdFromToken(piAccess),
		};
	}
	const codexAuth = readJsonObject(path.join(os.homedir(), ".codex", "auth.json"));
	const tokens = objectField(codexAuth?.tokens);
	const codexAccess = stringField(tokens?.access_token);
	if (!codexAccess) return null;
	return {
		accessToken: codexAccess,
		accountId: stringField(tokens?.account_id) ?? accountIdFromToken(codexAccess),
	};
}

function usedPercent(window: CodexWindow | null | undefined): number | undefined {
	if (typeof window?.used_percent !== "number" || !Number.isFinite(window.used_percent)) return undefined;
	return Math.max(0, Math.min(100, window.used_percent));
}

function codexWindows(usageResponse: CodexUsageResponse): { fiveHour?: CodexWindow; weekly?: CodexWindow } {
	const windows = [usageResponse.rate_limit?.primary_window, usageResponse.rate_limit?.secondary_window].filter(Boolean) as CodexWindow[];
	return {
		fiveHour: windows.find((item) => item.limit_window_seconds === 5 * 60 * 60),
		weekly: windows.find((item) => item.limit_window_seconds === 7 * 24 * 60 * 60),
	};
}

function formatCodexWindow(label: string, window: CodexWindow | null | undefined): string | undefined {
	const used = usedPercent(window);
	if (used === undefined) return undefined;
	const color = used >= 90 ? ANSI.red : used >= 67 ? ANSI.yellow : ANSI.green;
	return `${label} ${color}${used.toFixed(Number.isInteger(used) ? 0 : 1)}%${ANSI.reset}`;
}

function formatCodexStatus(usageResponse: CodexUsageResponse): string {
	const windows = codexWindows(usageResponse);
	const parts = [formatCodexWindow("5h", windows.fiveHour) ?? `5h ${ANSI.cyan}0%${ANSI.reset}`, formatCodexWindow("wk", windows.weekly)].filter(Boolean);
	return `codex: ${parts.join(" | ")}`;
}

async function refreshCodexStatus(ctx: ExtensionContext): Promise<void> {
	const auth = resolveCodexAuth();
	if (!auth) {
		ctx.ui.setStatus("codex", "codex: login needed");
		return;
	}
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 15_000);
	try {
		const response = await fetch("https://chatgpt.com/backend-api/wham/usage", {
			signal: controller.signal,
			headers: {
				authorization: `Bearer ${auth.accessToken}`,
				...(auth.accountId ? { "chatgpt-account-id": auth.accountId } : {}),
				accept: "application/json",
				"user-agent": "dotfiles-pi-footer/0.1",
			},
		});
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		ctx.ui.setStatus("codex", formatCodexStatus(await response.json() as CodexUsageResponse));
	} catch {
		ctx.ui.setStatus("codex", "codex: unavailable");
	} finally {
		clearTimeout(timeout);
	}
}

function startCodexRefresh(ctx: ExtensionContext): void {
	if (codexRefreshTimer) clearInterval(codexRefreshTimer);
	void refreshCodexStatus(ctx);
	codexRefreshTimer = setInterval(() => void refreshCodexStatus(ctx), 5 * 60 * 1000);
}

function stopCodexRefresh(): void {
	if (!codexRefreshTimer) return;
	clearInterval(codexRefreshTimer);
	codexRefreshTimer = null;
}

function ledgerPath(): string {
	return path.join(profileDir(), "operator-footer-usage.json");
}

function readLedger(): Record<string, number> {
	try {
		const parsed = JSON.parse(fs.readFileSync(ledgerPath(), "utf-8")) as unknown;
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, number> : {};
	} catch {
		return {};
	}
}

function writeLedger(ledger: Record<string, number>): void {
	const file = ledgerPath();
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, `${JSON.stringify(ledger, null, 2)}\n`, "utf-8");
}

function currentMonth(): string {
	const date = new Date();
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function finiteNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function usageFromMessage(message: unknown): UsageLike | null {
	if (!message || typeof message !== "object") return null;
	const raw = (message as { usage?: unknown }).usage;
	return raw && typeof raw === "object" ? raw as UsageLike : null;
}

function addUsage(message: { provider?: string; usage?: UsageLike }, options: { recordLedger?: boolean } = {}): void {
	const item = message.usage;
	if (!item) return;
	usage.input += finiteNumber(item.input);
	usage.output += finiteNumber(item.output);
	usage.cacheRead += finiteNumber(item.cacheRead);
	usage.cacheWrite += finiteNumber(item.cacheWrite);
	usage.cost += finiteNumber(item.cost?.total);
	if (options.recordLedger === false) return;
	if (!message.provider || !BEDROCK_PROVIDERS.has(message.provider)) return;
	const cost = finiteNumber(item.cost?.total);
	if (cost <= 0) return;
	const ledger = readLedger();
	const month = currentMonth();
	ledger[month] = finiteNumber(ledger[month]) + cost;
	bedrockMonthCost = ledger[month];
	writeLedger(ledger);
}

function initializeUsage(ctx: ExtensionContext): void {
	usage.input = 0;
	usage.output = 0;
	usage.cacheRead = 0;
	usage.cacheWrite = 0;
	usage.cost = 0;
	bedrockMonthCost = finiteNumber(readLedger()[currentMonth()]);
	for (const entry of ctx.sessionManager.getEntries()) {
		if (!entry || typeof entry !== "object") continue;
		const message = (entry as { message?: unknown }).message;
		if (!message || typeof message !== "object") continue;
		const role = (message as { role?: unknown }).role;
		if (role !== "assistant") continue;
		addUsage({
			provider: (message as { provider?: string }).provider,
			usage: usageFromMessage(message) ?? undefined,
		}, { recordLedger: false });
	}
}

function formatSecondFooterLine(left: string, right: string, width: number): string | null {
	if (!left && !right) return null;
	if (!left) return rightAlign(right, width);
	if (!right) return visibleWidth(left) > width ? truncateToWidth(left, width) : left;
	const anchored = rightAnchor(left, right, width);
	if (anchored !== left) return anchored;
	return truncateToWidth(left, width);
}

function refreshStatuses(ctx: ExtensionContext): void {
	ctx.ui.setStatus("usage", undefined);
	ctx.ui.setStatus("bedrock", formatBedrockStatus());
}

function installFooter(ctx: ExtensionContext, pi: ExtensionAPI): boolean {
	if (typeof ctx.ui.setFooter !== "function") return false;
	ctx.ui.setFooter((tui, _theme: unknown, footerData: ReadonlyFooterDataProvider) => {
		requestFooterRender = () => tui.requestRender();
		return {
		invalidate: () => {},
		render: (width: number) => {
			const statuses = footerData.getExtensionStatuses();
			const codexStatus = statusText(statuses.get("codex")) || null;
			const main = formatMainFooter({
				cwd: ctx.cwd,
				branch: footerData.getGitBranch(),
				model: ctx.model,
				pi,
				contextUsage: ctx.getContextUsage?.() ?? null,
				reloadNeeded: reloadMonitor.needed,
				rightStatus: codexStatus,
				width,
			});
			const second = formatSecondFooterLine(
				statusText(statuses.get("usage")),
				statusText(statuses.get("bedrock")),
				width,
			);
			return second ? [main, second] : [main];
		},
		};
	});
	return true;
}

export default function operatorFooter(pi: ExtensionAPI): void {
	pi.on("session_start", async (_event: { reason?: string }, ctx: ExtensionContext) => {
		startReloadMonitor(ctx, pi);
		initializeUsage(ctx);
		if (!installFooter(ctx, pi)) ctx.ui.setStatus("pi", `π v${resolvePiVersion() ?? "?"}`);
		refreshStatuses(ctx);
		startCodexRefresh(ctx);
	});

	pi.on("session_shutdown", async () => {
		if (reloadTimer) clearInterval(reloadTimer);
		reloadTimer = undefined;
		requestFooterRender = undefined;
		stopCodexRefresh();
	});

	pi.on("message_end", async (event: { message: { role?: string; provider?: string } }, ctx: ExtensionContext) => {
		if (event.message.role !== "assistant") return;
		addUsage({
			provider: event.message.provider,
			usage: usageFromMessage(event.message) ?? undefined,
		});
		refreshStatuses(ctx);
	});
}

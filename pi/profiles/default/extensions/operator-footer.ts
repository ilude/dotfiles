import * as childProcess from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { RELOAD_CHANGED, requestReloadState, type ReloadState } from "../lib/profile-reload-events.ts";

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

const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
let cachedPiVersion: string | null | undefined;
let requestFooterRender: (() => void) | undefined;
const cachedStatusDirectories = new Map<string, string>();

interface ExtensionAPI {
	events: import("@earendil-works/pi-coding-agent").ExtensionAPI["events"];
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

function formatReloadIndicator(reloadNeeded: boolean, error?: string): string {
	if (error) return `${ANSI.red}[reload check failed]${ANSI.reset}`;
	return reloadNeeded ? `${ANSI.white}[${ANSI.pink}reload${ANSI.white}]${ANSI.reset}` : "";
}

function formatMainFooter(options: {
	cwd: string;
	branch: string | null;
	model: { id?: string; name?: string; provider?: string } | undefined;
	pi: ExtensionAPI;
	contextUsage: ContextUsage | null;
	reloadNeeded: boolean;
	reloadError?: string;
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
	const versionLabel = `${ANSI.dim}π v${resolvePiVersion() ?? "?"}${ANSI.reset}${formatReloadIndicator(options.reloadNeeded, options.reloadError)}`;
	let left = `${ANSI.green}${directory}${ANSI.reset}${branch} | ${providerLabel}${ANSI.orange}${model}${ANSI.reset}${thinkingLabel}`;
	if (contextLabel) left += ` | ${contextLabel}`;
	left += ` | ${versionLabel}`;
	let composed = rightAnchor(left, options.rightStatus, options.width);
	if (options.rightStatus && composed === left && contextLabel) composed = rightAnchor(contextLabel, options.rightStatus, options.width);
	if (options.rightStatus && composed === contextLabel) composed = rightAlign(options.rightStatus, options.width);
	const reloadIndicator = formatReloadIndicator(options.reloadNeeded, options.reloadError);
	if (reloadIndicator && !composed.includes(reloadIndicator)) composed = `${reloadIndicator} ${composed}`;
	if (reloadIndicator && visibleWidth(composed) > options.width) {
		composed = `${reloadIndicator} ${truncateToWidth(left.replace(reloadIndicator, ""), Math.max(0, options.width - visibleWidth(reloadIndicator) - 1))}`;
	}
	return visibleWidth(composed) > options.width ? truncateToWidth(composed, options.width) : composed;
}


function finiteNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function usageFromMessage(message: unknown): UsageLike | null {
	if (!message || typeof message !== "object") return null;
	const raw = (message as { usage?: unknown }).usage;
	return raw && typeof raw === "object" ? raw as UsageLike : null;
}

function addUsage(message: { provider?: string; usage?: UsageLike }): void {
	const item = message.usage;
	if (!item) return;
	usage.input += finiteNumber(item.input);
	usage.output += finiteNumber(item.output);
	usage.cacheRead += finiteNumber(item.cacheRead);
	usage.cacheWrite += finiteNumber(item.cacheWrite);
	usage.cost += finiteNumber(item.cost?.total);
}

function initializeUsage(ctx: ExtensionContext): void {
	usage.input = 0;
	usage.output = 0;
	usage.cacheRead = 0;
	usage.cacheWrite = 0;
	usage.cost = 0;
	for (const entry of ctx.sessionManager.getEntries()) {
		if (!entry || typeof entry !== "object") continue;
		const message = (entry as { message?: unknown }).message;
		if (!message || typeof message !== "object") continue;
		const role = (message as { role?: unknown }).role;
		if (role !== "assistant") continue;
		addUsage({
			provider: (message as { provider?: string }).provider,
			usage: usageFromMessage(message) ?? undefined,
		});
	}
}

function formatSecondFooterLine(left: string, right: string, width: number): string | null {
	if (!left && !right) return null;
	if (!left) return truncateToWidth(rightAlign(right, width), width);
	if (!right) return visibleWidth(left) > width ? truncateToWidth(left, width) : left;
	const anchored = rightAnchor(left, right, width);
	if (anchored !== left) return anchored;
	return truncateToWidth(left, width);
}

function refreshStatuses(ctx: ExtensionContext): void {
	ctx.ui.setStatus("usage", undefined);
}

function installFooter(ctx: ExtensionContext, pi: ExtensionAPI, reloadState: () => ReloadState): boolean {
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
				reloadNeeded: reloadState().needed,
				reloadError: reloadState().error,
				rightStatus: codexStatus,
				width,
			});
			const second = formatSecondFooterLine(
				Array.from(statuses.entries())
					.filter(([key]) => key !== "codex" && key !== "bedrock" && key !== "pi")
					.sort(([a], [b]) => (a === "schedule" ? -1 : b === "schedule" ? 1 : a === "tps" ? -1 : b === "tps" ? 1 : a.localeCompare(b)))
					.map(([, value]) => statusText(value)).filter(Boolean).join(" | "),
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
	let unsubscribeReload: (() => void) | undefined;
	let reloadState: ReloadState = { needed: false };
	pi.on("session_start", async (_event: { reason?: string }, ctx: ExtensionContext) => {
		unsubscribeReload?.();
		unsubscribeReload = pi.events.on(RELOAD_CHANGED, data => {
			reloadState = data as ReloadState;
			requestFooterRender?.();
		});
		reloadState = requestReloadState(pi) ?? { needed: false };
		initializeUsage(ctx);
		if (!installFooter(ctx, pi, () => reloadState)) ctx.ui.setStatus("pi", `π v${resolvePiVersion() ?? "?"}`);
		refreshStatuses(ctx);
	});

	pi.on("session_shutdown", async () => {
		unsubscribeReload?.();
		unsubscribeReload = undefined;
		requestFooterRender = undefined;
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

// Idea source: this local Pi extension is inspired by Leonard Lin's
// `pi-codex-status` project: https://github.com/lhl/pi-codex-status
//
// What was borrowed conceptually:
// - Use Pi/Codex OAuth credentials that already exist on disk instead of adding
//   another login flow.
// - Read ChatGPT Codex quota data from the private ChatGPT usage endpoint.
// - Render 5-hour, weekly, credit, and additional-limit data as a quick Pi
//   slash-command status.
//
// This is intentionally a small dotfiles-native version, not a vendored copy:
// it does not refresh tokens, write cache files, or register a CLI. The command
// owns `/usage` for now; if other providers need status later, extend this to
// parse `/usage <provider>` instead of adding competing usage commands.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	type BedrockMonthSummary,
	getCurrentBedrockMonthSummary,
} from "../lib/bedrock-cost-ledger.js";

type AuthEntry = {
	access: string;
	accountId?: string;
};

type AuthInfo = {
	source: "pi" | "codex";
	path: string;
	accessToken: string;
	accountId?: string;
};

type ApiWindow = {
	used_percent?: number;
	limit_window_seconds?: number;
	reset_after_seconds?: number;
	reset_at?: number;
};

type ApiRateLimit = {
	primary_window?: ApiWindow | null;
	secondary_window?: ApiWindow | null;
};

type ApiUsage = {
	email?: string;
	plan_type?: string;
	rate_limit?: ApiRateLimit | null;
	additional_rate_limits?: Array<{
		limit_name?: string;
		metered_feature?: string;
		rate_limit?: ApiRateLimit | null;
	}> | null;
	credits?: {
		balance?: string | number;
		unlimited?: boolean;
		has_credits?: boolean;
	} | null;
};

export const USAGE_ENDPOINT = "https://chatgpt.com/backend-api/wham/usage";
const OFFICIAL_USAGE_PAGE = "https://chatgpt.com/codex/settings/usage";
const CODEX_FOOTER_REFRESH_MS = 5 * 60 * 1000;
const CODEX_FOOTER_FETCH_TIMEOUT_MS = 15 * 1000;
const CODEX_FOOTER_FAILURE_THRESHOLD = 3;
const FIVE_HOUR_WINDOW_SECONDS = 5 * 60 * 60;
const WEEKLY_WINDOW_SECONDS = 7 * 24 * 60 * 60;

let codexFooterInterval: ReturnType<typeof setInterval> | null = null;
let codexFooterAbortController: AbortController | null = null;
let codexFooterRefreshEpoch = 0;
let codexFooterRefreshInFlightEpoch: number | null = null;
let lastGoodCodexFooterStatus: string | null = null;
let codexFooterFailureCount = 0;

function homePath(...parts: string[]): string {
	return join(process.env.HOME || process.env.USERPROFILE || ".", ...parts);
}

async function readJson(path: string): Promise<Record<string, unknown>> {
	const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error(`${path} is not a JSON object`);
	}
	return parsed as Record<string, unknown>;
}

function stringField(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function objectField(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function decodeJwtPayload(token: string): Record<string, unknown> | undefined {
	const payload = token.split(".")[1];
	if (!payload) return undefined;
	try {
		const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
		const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
		const parsed = JSON.parse(
			Buffer.from(padded, "base64").toString("utf8"),
		) as unknown;
		return objectField(parsed);
	} catch {
		return undefined;
	}
}

export function accountIdFromToken(token: string): string | undefined {
	const payload = decodeJwtPayload(token);
	const authClaim = objectField(payload?.["https://api.openai.com/auth"]);
	return stringField(authClaim?.chatgpt_account_id);
}

async function tryPiAuth(): Promise<AuthInfo | undefined> {
	const path = homePath(".pi", "agent", "auth.json");
	try {
		const raw = await readJson(path);
		const entry = objectField(raw["openai-codex"]);
		const access = stringField(entry?.access);
		if (!access) return undefined;
		const accountId =
			stringField(entry?.accountId) ?? accountIdFromToken(access);
		const auth: AuthEntry = {
			access,
			...(accountId ? { accountId } : {}),
		};
		return {
			source: "pi",
			path,
			accessToken: auth.access,
			...(auth.accountId ? { accountId: auth.accountId } : {}),
		};
	} catch {
		return undefined;
	}
}

async function tryCodexAuth(): Promise<AuthInfo | undefined> {
	const path = homePath(".codex", "auth.json");
	try {
		const raw = await readJson(path);
		const tokens = objectField(raw.tokens);
		const access = stringField(tokens?.access_token);
		if (!access) return undefined;
		const accountId =
			stringField(tokens?.account_id) ?? accountIdFromToken(access);
		return {
			source: "codex",
			path,
			accessToken: access,
			...(accountId ? { accountId } : {}),
		};
	} catch {
		return undefined;
	}
}

export async function resolveAuth(): Promise<AuthInfo> {
	const piAuth = await tryPiAuth();
	if (piAuth) return piAuth;
	const codexAuth = await tryCodexAuth();
	if (codexAuth) return codexAuth;
	throw new Error(
		"No usable Codex OAuth credentials found. Run Pi /login for OpenAI Codex or `codex login` first.",
	);
}

export async function isBedrockProviderConfigured(): Promise<boolean> {
	try {
		const auth = await readJson(homePath(".pi", "agent", "auth.json"));
		return objectField(auth["amazon-bedrock"]) !== undefined;
	} catch {
		return false;
	}
}

function formatClock12(date: Date): string {
	const hour24 = date.getHours();
	const hour12 = hour24 % 12 || 12;
	const minute = String(date.getMinutes()).padStart(2, "0");
	const suffix = hour24 < 12 ? "am" : "pm";
	return `${hour12}:${minute}${suffix}`;
}

function resetDate(window: ApiWindow | null | undefined): Date | undefined {
	const resetAt = window?.reset_at;
	if (typeof resetAt === "number" && Number.isFinite(resetAt)) {
		const seconds =
			resetAt > 10_000_000_000 ? Math.round(resetAt / 1000) : resetAt;
		const date = new Date(seconds * 1000);
		return Number.isFinite(date.getTime()) ? date : undefined;
	}
	const resetAfter = window?.reset_after_seconds;
	if (typeof resetAfter === "number" && Number.isFinite(resetAfter)) {
		return new Date(Date.now() + resetAfter * 1000);
	}
	return undefined;
}

function formatReset(
	label: string,
	window: ApiWindow | null | undefined,
): string {
	const date = resetDate(window);
	if (!date) return "";
	if (label === "weekly") {
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		return ` resets ${month}/${day} ${formatClock12(date)}`;
	}
	return ` resets ${formatClock12(date)}`;
}

const ANSI_LIGHT_BLUE = "\u001b[94m";
const ANSI_LIGHT_GREEN = "\u001b[92m";
const ANSI_YELLOW = "\u001b[33m";
const ANSI_RED = "\u001b[31m";
const ANSI_WHITE = "\u001b[97m";
const ANSI_RESET = "\u001b[0m";
const MIN_PACE_ELAPSED_PERCENT = 2;
const MIN_PACE_USED_PERCENT = 2;

function color(text: string, code: string, enabled: boolean): string {
	return enabled ? `${code}${text}${ANSI_RESET}` : text;
}

function usedPercent(window: ApiWindow | null | undefined): number | undefined {
	if (
		typeof window?.used_percent !== "number" ||
		!Number.isFinite(window.used_percent)
	)
		return undefined;
	return Math.max(0, Math.min(100, window.used_percent));
}

function windowElapsedPercent(
	window: ApiWindow | null | undefined,
): number | undefined {
	const reset = resetDate(window);
	if (!reset) return undefined;
	const windowSeconds =
		typeof window?.limit_window_seconds === "number" &&
		Number.isFinite(window.limit_window_seconds) &&
		window.limit_window_seconds > 0
			? window.limit_window_seconds
			: undefined;
	if (!windowSeconds) return undefined;
	const remainingSeconds = (reset.getTime() - Date.now()) / 1000;
	return Math.max(
		0,
		Math.min(100, ((windowSeconds - remainingSeconds) / windowSeconds) * 100),
	);
}

function windowPaceDelta(
	window: ApiWindow | null | undefined,
	used: number,
): number | undefined {
	const elapsedPercent = windowElapsedPercent(window);
	if (elapsedPercent === undefined) return undefined;
	return used - elapsedPercent;
}

export function pacedPercentColor(
	window: ApiWindow | null | undefined,
	used: number,
): string {
	if (used === 0) return ANSI_LIGHT_GREEN;
	const elapsedPercent = windowElapsedPercent(window);
	if (elapsedPercent === undefined) return ANSI_WHITE;
	if (
		elapsedPercent <= MIN_PACE_ELAPSED_PERCENT ||
		used <= MIN_PACE_USED_PERCENT
	)
		return ANSI_LIGHT_GREEN;
	const delta = windowPaceDelta(window, used);
	if (delta === undefined) return ANSI_WHITE;
	if (delta > 3) return ANSI_RED;
	if (delta >= -3) return ANSI_YELLOW;
	return ANSI_LIGHT_GREEN;
}

function formatWindow(
	label: string,
	window: ApiWindow | null | undefined,
	colorEnabled: boolean,
): string | undefined {
	const used = usedPercent(window);
	if (used === undefined) return undefined;
	const percent = `${used.toFixed(Number.isInteger(used) ? 0 : 1)}%`.padStart(
		6,
	);
	const percentColor = pacedPercentColor(window, used);
	return `${color(label.padEnd(8), ANSI_LIGHT_BLUE, colorEnabled)} ${color(percent, percentColor, colorEnabled)} used${formatReset(label, window)}`;
}

function windowsByDuration(limit: ApiRateLimit | null | undefined): {
	fiveHour?: ApiWindow;
	weekly?: ApiWindow;
	windowCount: number;
} {
	const windows = [limit?.primary_window, limit?.secondary_window].filter(
		(window): window is ApiWindow => Boolean(window),
	);
	return {
		fiveHour: windows.find(
			(window) => window.limit_window_seconds === FIVE_HOUR_WINDOW_SECONDS,
		),
		weekly: windows.find(
			(window) => window.limit_window_seconds === WEEKLY_WINDOW_SECONDS,
		),
		windowCount: windows.length,
	};
}

function formatLimit(
	name: string,
	limit: ApiRateLimit | null | undefined,
	colorEnabled: boolean,
): string[] {
	const lines = [color(`${name}:`, ANSI_LIGHT_GREEN, colorEnabled)];
	const windows = windowsByDuration(limit);
	const fiveHour = formatWindow("5h", windows.fiveHour, colorEnabled);
	const weekly = formatWindow("weekly", windows.weekly, colorEnabled);
	if (fiveHour) lines.push(fiveHour);
	else if (windows.windowCount > 0) lines.push("5h       disabled");
	if (weekly) lines.push(weekly);
	if (lines.length === 1) lines.push("  no window data reported");
	return lines;
}

export function formatUsage(
	usage: ApiUsage,
	_auth: AuthInfo,
	options: { color?: boolean } = {},
): string {
	const colorEnabled = options.color ?? false;
	const lines = [...formatLimit("Codex", usage.rate_limit, colorEnabled)];
	if (usage.credits?.unlimited) lines.push("credits: unlimited");
	else if (usage.credits?.balance !== undefined)
		lines.push(`credits: ${usage.credits.balance}`);
	else if (usage.credits?.has_credits) lines.push("credits: available");

	for (const item of usage.additional_rate_limits ?? []) {
		const name =
			item.limit_name || item.metered_feature || "Additional Codex limit";
		lines.push("", ...formatLimit(name, item.rate_limit, colorEnabled));
	}
	lines.push("", OFFICIAL_USAGE_PAGE);
	return lines.join("\n");
}

function formatCompactMoney(amount: number): string {
	return `$${amount.toFixed(2)}`;
}

function formatCompactTokenCount(tokens: number): string {
	if (tokens < 1_000) return String(tokens);
	if (tokens < 1_000_000) return `${(tokens / 1_000).toFixed(1)}K`;
	return `${(tokens / 1_000_000).toFixed(1)}M`;
}

function shortBedrockModelName(model: string): string {
	const match = model.match(/claude-(opus|fable|sonnet|haiku)-(\d+(?:-\d+)?)/);
	return match ? `${match[1]}-${match[2]}` : model;
}

export function formatBedrockUsageSection(
	summary: BedrockMonthSummary,
): string {
	if (summary.requestCount === 0 || summary.models.length === 0) {
		return "Bedrock: no usage recorded this month.";
	}

	const lines = ["Bedrock:"];
	for (const model of summary.models) {
		const partial = model.unpricedRequestCount > 0 ? ">= " : "";
		lines.push(
			`  ${shortBedrockModelName(model.model)}: ${partial}${formatCompactMoney(model.costTotal)} ${formatCompactTokenCount(model.inputTokens)} in, ${formatCompactTokenCount(model.outputTokens)} out`,
		);
	}
	const partial = summary.unpricedRequestCount > 0 ? ">= " : "";
	lines.push(`  Total:  ${partial}${formatCompactMoney(summary.costTotal)}`);
	return lines.join("\n");
}

export async function formatConfiguredBedrockUsageSection(): Promise<
	string | null
> {
	if (!(await isBedrockProviderConfigured())) return null;
	try {
		return formatBedrockUsageSection(await getCurrentBedrockMonthSummary());
	} catch (error) {
		return `Bedrock: local usage unavailable (${errorMessage(error)})`;
	}
}

export function formatCodexFooterStatus(
	usage: ApiUsage,
	options: { color?: boolean } = {},
): string {
	const colorEnabled = options.color ?? false;
	const windows = windowsByDuration(usage.rate_limit);
	if (windows.windowCount === 0) return "codex: unknown";
	const fiveHour = formatFooterWindow("5h", windows.fiveHour, colorEnabled);
	const weekly = formatFooterWindow("wk", windows.weekly, colorEnabled);
	const parts = [fiveHour ?? "5h disabled", weekly].filter(
		(value): value is string => Boolean(value),
	);
	return `codex ${parts.join(" | ")}`;
}

function formatFooterWindow(
	label: string,
	window: ApiWindow | null | undefined,
	colorEnabled: boolean,
): string | undefined {
	const used = usedPercent(window);
	if (used === undefined) return undefined;
	const text = `${used.toFixed(Number.isInteger(used) ? 0 : 1)}%`;
	return `${label} ${color(text, pacedPercentColor(window, used), colorEnabled)}`;
}

export async function fetchCodexUsage(
	options: { signal?: AbortSignal } = {},
): Promise<{
	auth: AuthInfo;
	usage: ApiUsage;
}> {
	const auth = await resolveAuth();
	const response = await fetch(USAGE_ENDPOINT, {
		signal: options.signal,
		headers: {
			authorization: `Bearer ${auth.accessToken}`,
			...(auth.accountId ? { "chatgpt-account-id": auth.accountId } : {}),
			accept: "application/json",
			"user-agent": "dotfiles-pi-codex-status/0.1",
		},
	});
	if (!response.ok) {
		const body = await response.text().catch(() => "");
		const text = body
			.replace(/<[^>]*>/g, " ")
			.replace(/\s+/g, " ")
			.trim();
		throw new Error(
			`Codex usage request failed (${response.status}): ${text.slice(0, 300) || response.statusText}. Try ${OFFICIAL_USAGE_PAGE} if the private endpoint changed or your auth session expired.`,
		);
	}
	return { auth, usage: (await response.json()) as ApiUsage };
}

export async function showCodexStatus(
	ctx: Pick<ExtensionContext, "ui">,
): Promise<void> {
	try {
		const { auth, usage } = await fetchCodexUsage();
		const sections = [formatUsage(usage, auth, { color: true })];
		const bedrock = await formatConfiguredBedrockUsageSection();
		if (bedrock) sections.push(bedrock);
		ctx.ui.notify(sections.join("\n\n"), "info");
	} catch (error) {
		ctx.ui.notify(errorMessage(error), "error");
	}
}

async function refreshCodexFooterStatus(
	ctx: Pick<ExtensionContext, "ui">,
	epoch: number,
): Promise<void> {
	if (codexFooterRefreshInFlightEpoch === epoch) return;
	codexFooterRefreshInFlightEpoch = epoch;
	const controller = new AbortController();
	codexFooterAbortController = controller;
	const timeout = setTimeout(() => {
		controller.abort();
	}, CODEX_FOOTER_FETCH_TIMEOUT_MS);
	try {
		const { usage } = await fetchCodexUsage({ signal: controller.signal });
		if (controller.signal.aborted || epoch !== codexFooterRefreshEpoch) return;
		const status = formatCodexFooterStatus(usage, { color: true });
		lastGoodCodexFooterStatus = status;
		codexFooterFailureCount = 0;
		ctx.ui.setStatus("codex", status);
	} catch {
		if (controller.signal.aborted || epoch !== codexFooterRefreshEpoch) return;
		codexFooterFailureCount += 1;
		if (codexFooterFailureCount < CODEX_FOOTER_FAILURE_THRESHOLD) return;
		ctx.ui.setStatus(
			"codex",
			lastGoodCodexFooterStatus
				? `${lastGoodCodexFooterStatus} stale`
				: "codex: error",
		);
	} finally {
		clearTimeout(timeout);
		if (codexFooterAbortController === controller) {
			codexFooterAbortController = null;
		}
		if (codexFooterRefreshInFlightEpoch === epoch) {
			codexFooterRefreshInFlightEpoch = null;
		}
	}
}

function clearCodexFooterRefresh(): void {
	codexFooterRefreshEpoch += 1;
	codexFooterAbortController?.abort();
	codexFooterAbortController = null;
	if (!codexFooterInterval) return;
	clearInterval(codexFooterInterval);
	codexFooterInterval = null;
}

function startCodexFooterRefresh(ctx: ExtensionContext): void {
	clearCodexFooterRefresh();
	const epoch = codexFooterRefreshEpoch;
	void refreshCodexFooterStatus(ctx, epoch);
	codexFooterInterval = setInterval(() => {
		void refreshCodexFooterStatus(ctx, epoch);
	}, CODEX_FOOTER_REFRESH_MS);
}

function shouldShowStatusOnSessionStart(reason: string): boolean {
	return reason === "startup";
}

function showCodexStatusAfterInitialRender(ctx: ExtensionContext): void {
	// session_start fires before interactive mode renders the initial transcript.
	// Defer the notification so startup/new-session rendering does not overwrite it.
	setTimeout(() => {
		void showCodexStatus(ctx);
	}, 0);
}

export default function registerCodexStatusCommand(pi: ExtensionAPI) {
	pi.on("session_start", async (event, ctx) => {
		startCodexFooterRefresh(ctx);
		if (shouldShowStatusOnSessionStart(String(event.reason))) {
			showCodexStatusAfterInitialRender(ctx);
		}
	});

	pi.on("session_shutdown", async () => {
		clearCodexFooterRefresh();
	});

	pi.registerCommand("usage", {
		description:
			"Show ChatGPT Codex quota status using existing Pi/Codex OAuth credentials",
		handler: async (_args, ctx) => {
			await showCodexStatus(ctx);
		},
	});
}

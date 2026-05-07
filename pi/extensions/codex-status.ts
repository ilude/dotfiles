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
// owns `/status` for now; if other providers need status later, extend this to
// parse `/status <provider>` instead of adding competing status commands.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@mariozechner/pi-coding-agent";

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
const ANSI_WHITE = "\u001b[97m";
const ANSI_RESET = "\u001b[0m";

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
	return `${color(label.padEnd(8), ANSI_LIGHT_BLUE, colorEnabled)} ${color(percent, ANSI_WHITE, colorEnabled)} used${formatReset(label, window)}`;
}

function formatLimit(
	name: string,
	limit: ApiRateLimit | null | undefined,
	colorEnabled: boolean,
): string[] {
	const lines = [color(`${name}:`, ANSI_LIGHT_GREEN, colorEnabled)];
	const primary = formatWindow("5h", limit?.primary_window, colorEnabled);
	const secondary = formatWindow(
		"weekly",
		limit?.secondary_window,
		colorEnabled,
	);
	if (primary) lines.push(primary);
	if (secondary) lines.push(secondary);
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

export async function fetchCodexUsage(): Promise<{
	auth: AuthInfo;
	usage: ApiUsage;
}> {
	const auth = await resolveAuth();
	const response = await fetch(USAGE_ENDPOINT, {
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

async function showCodexStatus(ctx: ExtensionContext): Promise<void> {
	try {
		const { auth, usage } = await fetchCodexUsage();
		ctx.ui.notify(formatUsage(usage, auth, { color: true }), "info");
	} catch (error) {
		ctx.ui.notify(
			error instanceof Error ? error.message : String(error),
			"error",
		);
	}
}

function shouldShowStatusOnSessionStart(reason: string): boolean {
	return reason === "startup" || reason === "new";
}

function isClearCommand(text: string): boolean {
	return text.trim() === "/clear";
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
		if (shouldShowStatusOnSessionStart(String(event.reason))) {
			showCodexStatusAfterInitialRender(ctx);
		}
	});

	pi.on("input", async (event, ctx) => {
		if (isClearCommand(event.text)) {
			await showCodexStatus(ctx);
		}
		return { action: "continue" };
	});

	pi.registerCommand("status", {
		description:
			"Show ChatGPT Codex quota status using existing Pi/Codex OAuth credentials",
		handler: async (_args, ctx) => {
			await showCodexStatus(ctx);
		},
	});
}

// Quota display adapted from legacy codex-status.ts, inspired by lhl/pi-codex-status.
import { appendFileSync, closeSync, mkdirSync, openSync, readFileSync, readSync, fstatSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getAgentDir as profileDir } from "@earendil-works/pi-coding-agent";

export const USAGE_PAGE = "https://chatgpt.com/codex/settings/usage";
export const USAGE_ENDPOINT = "https://chatgpt.com/backend-api/wham/usage";
export const RESET_CREDITS_ENDPOINT = "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits";
export const REFRESH_MS = 5 * 60_000;
const HIDDEN_ADDITIONAL_LIMITS = new Set(["GPT-5.3-Codex-Spark"]);
export interface Window { used_percent?: number; limit_window_seconds?: number; reset_at?: number; reset_after_seconds?: number }
interface Limit { primary_window?: Window | null; secondary_window?: Window | null }
export interface ResetCredit { status?: string; expires_at?: string }
export interface ResetCredits { available_count?: number; credits?: ResetCredit[] }
export interface CodexUsage {
  rate_limit?: Limit | null;
  credits?: { unlimited?: boolean; balance?: string | number; has_credits?: boolean };
  additional_rate_limits?: { limit_name?: string; metered_feature?: string; rate_limit?: Limit | null }[];
  rate_limit_reset_credits?: { available_count?: number };
  reset_credits?: ResetCredits;
}
export { profileDir };
function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function json(file: string): Record<string, unknown> | undefined {
  try { return object(JSON.parse(readFileSync(file, "utf8"))); } catch { return undefined; }
}
function text(value: unknown): string | undefined { return typeof value === "string" && value ? value : undefined; }
export function resolveCodexAuth(): { accessToken: string; accountId?: string } {
  const pi = object(json(join(profileDir(), "auth.json"))?.["openai-codex"]);
  const cli = object(json(join(homedir(), ".codex", "auth.json"))?.tokens);
  const accessToken = text(pi?.access) || text(cli?.access_token);
  if (!accessToken) throw new Error("Login needed: use Pi /login for OpenAI Codex or codex login.");
  let accountId = text(pi?.access) ? text(pi?.accountId) : text(cli?.account_id);
  if (!accountId) {
    try {
      const payload = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8"));
      accountId = text(payload["https://api.openai.com/auth"]?.chatgpt_account_id);
    } catch { /* An opaque token can still be usable. */ }
  }
  return { accessToken, accountId };
}
export async function fetchCodexUsage(signal: AbortSignal): Promise<CodexUsage> {
  const auth = resolveCodexAuth();
  const headers = {
    authorization: `Bearer ${auth.accessToken}`,
    ...(auth.accountId ? { "chatgpt-account-id": auth.accountId } : {}),
    accept: "application/json",
    "user-agent": "dotfiles-pi-usage/1",
  };
  const [response, resetResponse] = await Promise.all([
    fetch(USAGE_ENDPOINT, { signal, headers }),
    fetch(RESET_CREDITS_ENDPOINT, { signal, headers }).catch(() => undefined),
  ]);
  if (!response.ok) throw new Error(`HTTP ${response.status}; check /login or the usage page.`);
  const value = object(await response.json());
  if (!value) throw new Error("Invalid Codex usage response.");
  // Resolve relative reset times once, not on every cached render.
  const usage = value as CodexUsage;
  if (resetResponse?.ok) {
    try {
      const resetCredits = object(await resetResponse.json());
      if (resetCredits) usage.reset_credits = resetCredits as ResetCredits;
    } catch { /* Keep quota reporting available when reset details are malformed. */ }
  }
  for (const limit of [usage.rate_limit, ...(usage.additional_rate_limits ?? []).map(item => item.rate_limit)]) {
    for (const window of [limit?.primary_window, limit?.secondary_window]) {
      if (window && window.reset_at === undefined && Number.isFinite(window.reset_after_seconds))
        window.reset_at = Date.now() / 1000 + window.reset_after_seconds!;
    }
  }
  return usage;
}
function windows(limit?: Limit | null): Window[] { return [limit?.primary_window, limit?.secondary_window].filter((w): w is Window => !!w); }
function used(window?: Window): number | undefined {
  return typeof window?.used_percent === "number" && Number.isFinite(window.used_percent) ? Math.max(0, Math.min(100, window.used_percent)) : undefined;
}
function reset(window: Window): number | undefined {
  if (Number.isFinite(window.reset_at)) return window.reset_at! > 10_000_000_000 ? window.reset_at : window.reset_at! * 1000;
  if (Number.isFinite(window.reset_after_seconds)) return Date.now() + window.reset_after_seconds! * 1000;
  return undefined;
}
export function paceColor(window: Window): "success" | "warning" | "error" | "muted" {
  const percent = used(window);
  const end = reset(window);
  if (percent === undefined) return "muted";
  if (percent === 0) return "success";
  if (end === undefined || !window.limit_window_seconds) return "muted";
  const elapsed = Math.max(0, Math.min(100, 100 * (1 - (end - Date.now()) / (window.limit_window_seconds * 1000))));
  if (elapsed <= 2 || percent <= 2) return "success";
  return percent - elapsed > 3 ? "error" : percent - elapsed >= -3 ? "warning" : "success";
}
export function formatQuota(usage: CodexUsage, paint: (color: ReturnType<typeof paceColor> | "accent", text: string) => string = (_, text) => text): string {
  const all = windows(usage.rate_limit);
  if (!all.length) return "codex: unknown";
  return "codex: " + [["5h", 18000], ["wk", 604800]].map(([label, seconds]) => {
    const window = all.find(w => w.limit_window_seconds === seconds);
    const percent = used(window);
    return `${label} ${window && percent !== undefined ? paint(paceColor(window), `${percent}%`) : paint("accent", "0%")}`;
  }).join(" | ");
}
export function formatResetCredits(usage: CodexUsage): string | undefined {
  const detail = usage.reset_credits;
  const count = detail?.available_count ?? usage.rate_limit_reset_credits?.available_count;
  if (!Number.isFinite(count) || count! < 1) return count === 0 ? "Banked resets: 0" : undefined;
  const expirations = (detail?.credits ?? [])
    .filter(credit => credit.status === "available" && credit.expires_at && !Number.isNaN(Date.parse(credit.expires_at)))
    .map(credit => {
      const date = new Date(credit.expires_at!);
      const day = date.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" });
      const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
      return `${day.padEnd(8)}  ${time.padStart(12)}`;
    });
  return `Banked resets: ${count}${expirations.length ? `\n${expirations.map(date => `  - ${date}`).join("\n")}` : ""}`;
}
export function formatUsage(usage: CodexUsage): string {
  const section = (name: string, limit?: Limit | null): string[] => {
    const all = windows(limit);
    return [name + ":", ...(all.length ? all.map(window => {
      const seconds = window.limit_window_seconds;
      const label = seconds === 18000 ? "5h" : seconds === 604800 ? "Weekly" : seconds ? `${seconds}s` : "Window";
      const percent = used(window);
      const end = reset(window);
      return `  ${label}: ${percent === undefined ? "unavailable" : `${percent}% used`}${end === undefined ? "" : `; resets ${new Date(end).toLocaleString()}`}`;
    }) : ["  Window data unavailable"])];
  };
  const bankedResets = formatResetCredits(usage);
  return [
    ...section("Codex", usage.rate_limit),
    ...(bankedResets ? [bankedResets.split("\n").map(line => `  ${line}`).join("\n")] : []),
    ...(usage.credits?.unlimited ? ["  Credits: unlimited"] : usage.credits?.balance !== undefined ? [`  Credits: ${usage.credits.balance}`] : usage.credits?.has_credits ? ["  Credits: available"] : []),
    ...(usage.additional_rate_limits ?? [])
      .filter(item => !HIDDEN_ADDITIONAL_LIMITS.has(item.limit_name ?? ""))
      .flatMap(item => ["", ...section(item.limit_name || item.metered_feature || "Additional limit", item.rate_limit)]),
    "", USAGE_PAGE,
  ].join("\n");
}

// Only the data displayed in /usage is retained. No prompts, request-shape flags,
// credentials, or orchestration metadata. Append-only permits concurrent Pi writers.
export interface CacheObservation { model: string; input: number | null; cacheRead: number | null }
function count(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null; }
export function recordCacheUsage(message: { provider: string; model: string; usage?: { input?: number; cacheRead?: number }; stopReason?: string }): void {
  if (message.provider !== "openai-codex") return;
  const failed = message.stopReason === "error" || message.stopReason === "aborted";
  const input = count(message.usage?.input), cacheRead = count(message.usage?.cacheRead);
  const unavailable = failed && !(input || cacheRead);
  const observation: CacheObservation = { model: message.model, input: unavailable ? null : input, cacheRead: unavailable ? null : cacheRead };
  mkdirSync(profileDir(), { recursive: true });
  appendFileSync(join(profileDir(), "codex-cache.jsonl"), JSON.stringify(observation) + "\n", { mode: 0o600 });
}
export function readCacheUsage(): CacheObservation[] {
  let fd: number | undefined;
  try {
    fd = openSync(join(profileDir(), "codex-cache.jsonl"), "r");
    const size = fstatSync(fd).size;
    const start = Math.max(0, size - 128 * 1024);
    const buffer = Buffer.alloc(size - start);
    const bytes = readSync(fd, buffer, 0, buffer.length, start);
    const lines = buffer.subarray(0, bytes).toString("utf8").split("\n");
    if (start) lines.shift();
    return lines.flatMap(line => {
      try {
        const row = object(JSON.parse(line));
        return typeof row?.model === "string" ? [{ model: row.model, input: count(row.input), cacheRead: count(row.cacheRead) }] : [];
      } catch { return []; }
    }).slice(-100);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  } finally { if (fd !== undefined) closeSync(fd); }
}
export function formatCacheUsage(rows: CacheObservation[]): string {
  let total = 0, read = 0;
  for (const row of rows) {
    if (row.input !== null && row.cacheRead !== null) {
      total += row.input + row.cacheRead;
      read += row.cacheRead;
    }
  }
  return [
    "Codex cache:",
    `  Cache-read: ${total > 0 ? `${(read / total * 100).toFixed(1)}%` : "unavailable"}`,
  ].join("\n");
}

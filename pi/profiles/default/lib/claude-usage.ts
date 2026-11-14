import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const CLAUDE_USAGE_PAGE = "https://claude.ai/settings/usage";

export interface ClaudeUsage {
  five_hour_used_percent: number | null;
  five_hour_reset_at: number | null;
  weekly_used_percent: number | null;
  weekly_reset_at: number | null;
  opus_weekly_used_percent: number | null;
  opus_weekly_reset_at: number | null;
  fetched_at: string;
  config_dir: string;
  usage_page: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function window(value: unknown): { used: number | null; reset: number | null } {
  const data = isRecord(value) ? value : {};
  const used = data.utilization;
  const reset = typeof data.resets_at === "string" ? Date.parse(data.resets_at) / 1000 : NaN;
  return {
    used: typeof used === "number" && Number.isFinite(used) && used >= 0 && used <= 100 ? used : null,
    reset: Number.isFinite(reset) ? reset : null,
  };
}

/** Read existing Claude credentials in place; never refresh or persist them. */
export async function fetchClaudeUsage(configDir?: string, signal?: AbortSignal): Promise<ClaudeUsage> {
  const directory = resolve(configDir ?? (process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude")));
  let credentials: unknown;
  try {
    credentials = JSON.parse(await readFile(join(directory, ".credentials.json"), "utf8"));
  } catch {
    throw new Error(`Claude quota credentials could not be read from ${directory}. Use the existing ccyl login.`);
  }
  const oauth = isRecord(credentials) ? credentials.claudeAiOauth : undefined;
  const token = isRecord(oauth) ? oauth.accessToken : undefined;
  if (typeof token !== "string" || !token.trim()) {
    throw new Error(`Claude subscription credentials are unavailable in ${directory}. Use the existing ccyl login.`);
  }
  const response = await fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: {
      authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
      "user-agent": "claude-cli",
    },
    redirect: "error",
    signal,
  });
  if (!response.ok) throw new Error(`Claude quota request failed (HTTP ${response.status}); usage is unavailable.`);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Claude quota response was not valid JSON; usage is unavailable.");
  }
  if (!isRecord(payload)) {
    throw new Error("Claude quota response was not an object; usage is unavailable.");
  }
  const data = payload;
  const fiveHour = window(data.five_hour);
  const weekly = window(data.seven_day);
  const opus = window(data.seven_day_opus);
  return {
    five_hour_used_percent: fiveHour.used,
    five_hour_reset_at: fiveHour.reset,
    weekly_used_percent: weekly.used,
    weekly_reset_at: weekly.reset,
    opus_weekly_used_percent: opus.used,
    opus_weekly_reset_at: opus.reset,
    fetched_at: new Date().toISOString(),
    config_dir: directory,
    usage_page: CLAUDE_USAGE_PAGE,
  };
}

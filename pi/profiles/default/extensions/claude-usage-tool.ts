import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { fetchClaudeUsage } from "../lib/claude-usage.ts";

const percent = Type.Union([Type.Number({ minimum: 0, maximum: 100 }), Type.Null()]);
const reset = Type.Union([Type.Number({ description: "Unix timestamp in seconds" }), Type.Null()]);
const outputSchema = Type.Object({
  five_hour_used_percent: percent,
  five_hour_reset_at: reset,
  weekly_used_percent: percent,
  weekly_reset_at: reset,
  opus_weekly_used_percent: percent,
  opus_weekly_reset_at: reset,
  fetched_at: Type.String(),
  config_dir: Type.String(),
  usage_page: Type.String(),
}, { additionalProperties: false });

export default function claudeUsageTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "claude_usage",
    label: "Claude Subscription Usage",
    description: "Fetch real Claude subscription five-hour, weekly, and available Opus-specific weekly quota usage and resets. Shared account usage, not per-task tokens. Uses existing Claude login in config_dir, otherwise CLAUDE_CONFIG_DIR or ~/.claude. Match the directory to ccyl's account. Null means unavailable, not zero. Does not sign in, refresh credentials, or poll.",
    exposure: "deferred",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    parameters: Type.Object({
      config_dir: Type.Optional(Type.String({ minLength: 1, description: "Existing Claude config directory for the ccyl account. Pass its absolute path when the client's directory differs from this Pi process." })),
    }, { additionalProperties: false }),
    outputSchema,
    async execute(_id, params, signal) {
      const result: Static<typeof outputSchema> = await fetchClaudeUsage(params.config_dir, AbortSignal.any([
        ...(signal ? [signal] : []), AbortSignal.timeout(15_000),
      ]));
      const line = (name: string, used: number | null, at: number | null) =>
        `${name}: ${used === null ? "unavailable" : `${used}% used`}; resets ${at === null ? "unavailable" : new Date(at * 1000).toISOString()}`;
      const text = [
        line("Claude five-hour", result.five_hour_used_percent, result.five_hour_reset_at),
        line("Claude weekly", result.weekly_used_percent, result.weekly_reset_at),
        line("Opus weekly", result.opus_weekly_used_percent, result.opus_weekly_reset_at),
        `Fetched: ${result.fetched_at}`,
        `Claude config: ${result.config_dir}`,
        "Shared subscription across sessions and clients; not a reservation or a per-task allowance.",
        result.usage_page,
      ].join("\n");
      return { content: [{ type: "text", text }], details: result, structuredContent: result };
    },
  });
}

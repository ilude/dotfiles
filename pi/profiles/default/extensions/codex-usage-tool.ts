import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type, type Static } from "typebox";
import { fetchCodexUsage, USAGE_PAGE } from "../lib/codex-usage.ts";

const outputSchema = Type.Object({
  weekly_used_percent: Type.Union([Type.Number(), Type.Null()]),
  weekly_reset_at: Type.Union([Type.Number({ description: "Unix timestamp in seconds" }), Type.Null()]),
  fetched_at: Type.String(),
  usage_page: Type.String(),
}, { additionalProperties: false });

export default function codexUsageTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "codex_usage",
    label: "Codex Usage",
    description: "Fetch the Codex subscription weekly percentage used and reset time. Null means unavailable, not zero. Uses the current profile's separate quota login; does not initiate sign-in.",
    exposure: "deferred",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    parameters: Type.Object({}, { additionalProperties: false }),
    outputSchema,
    renderCall: (_args, theme) => new Text(theme.fg("toolTitle", "Codex weekly usage"), 0, 0),
    renderResult: result => new Text(result.content.filter(part => part.type === "text").map(part => part.text).join("\n"), 0, 0),
    async execute(_id, _params, signal, _onUpdate, ctx) {
      const usage = await fetchCodexUsage(ctx.modelRegistry, AbortSignal.any([
        ...(signal ? [signal] : []), AbortSignal.timeout(15_000),
      ]));
      const weekly = [usage.rate_limit?.primary_window, usage.rate_limit?.secondary_window]
        .find(window => window?.limit_window_seconds === 604800);
      const result: Static<typeof outputSchema> = {
        weekly_used_percent: weekly?.used_percent === undefined ? null : Math.max(0, Math.min(100, weekly.used_percent)),
        weekly_reset_at: weekly?.reset_at === undefined ? null : weekly.reset_at > 10_000_000_000 ? weekly.reset_at / 1000 : weekly.reset_at,
        fetched_at: new Date().toISOString(),
        usage_page: USAGE_PAGE,
      };
      const text = `Codex weekly: ${result.weekly_used_percent === null ? "unavailable" : `${result.weekly_used_percent}% used`}${result.weekly_reset_at === null ? "" : `; reset Unix time ${result.weekly_reset_at}`}\nFetched: ${result.fetched_at}\n${USAGE_PAGE}`;
      return { content: [{ type: "text", text }], details: result, structuredContent: result };
    },
  });
}

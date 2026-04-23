/**
 * probe-thinking-level.ts -- T0 probe for ExtensionAPI.setThinkingLevel (B1).
 *
 * Loaded like any other pi extension: it subscribes to session_start and logs
 * whether `pi.setThinkingLevel` is present and callable, what `getThinkingLevel`
 * returns before and after the call, and what happens when an unsupported
 * `"xhigh"` is passed on a non-xhigh-capable model (clamping observation).
 *
 * Findings recorded in pi/prompt-routing/docs/setThinkingLevel-probe.md.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    const api = pi as unknown as {
      setThinkingLevel?: (level: string) => void;
      getThinkingLevel?: () => string;
    };

    const hasSet = typeof api.setThinkingLevel === "function";
    const hasGet = typeof api.getThinkingLevel === "function";
    const before = hasGet ? api.getThinkingLevel!() : "(no getter)";

    const lines: string[] = [
      `probe: hasSetThinkingLevel=${hasSet}`,
      `probe: hasGetThinkingLevel=${hasGet}`,
      `probe: before=${before}`,
    ];

    if (hasSet) {
      try {
        api.setThinkingLevel!("minimal");
        const afterMinimal = hasGet ? api.getThinkingLevel!() : "(no getter)";
        lines.push(`probe: setThinkingLevel("minimal") OK, now=${afterMinimal}`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        lines.push(`probe: setThinkingLevel("minimal") threw: ${msg}`);
      }

      try {
        api.setThinkingLevel!("xhigh");
        const afterXhigh = hasGet ? api.getThinkingLevel!() : "(no getter)";
        lines.push(`probe: setThinkingLevel("xhigh") OK, clamped_to=${afterXhigh}`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        lines.push(`probe: setThinkingLevel("xhigh") threw: ${msg}`);
      }
    }

    const report = lines.join("\n");
    ctx.ui.setStatus("probe-thinking", hasSet ? "probe: ok" : "probe: missing");
    ctx.ui.notify(report, "info");
  });
}

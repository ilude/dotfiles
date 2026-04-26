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

// Convention exception: probe output is a structured multi-line diagnostic
//   report whose own internal "probe:" line prefix is the recognized format
//   in the probe documentation; it does not need a `[probe-thinking-level]`
//   wrapper, and `ctx.ui.setStatus` has no shared-helper analogue.
// Risk: future readers might assume direct `ctx.ui.notify` is forbidden in all
//   files; the exception block keeps the rationale local to this probe.
// Why shared helper is inappropriate: the helper prefix would double-prefix
//   each probe line and reduce diagnostic readability; setStatus is not a
//   notification surface and is intentionally not wrapped.
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export interface ThinkingLevelProbeResult {
  hasSet: boolean;
  hasGet: boolean;
  before: string;
  afterMinimal: string | null;
  afterXhigh: string | null;
  report: string;
}

export function runThinkingLevelProbe(pi: ExtensionAPI): ThinkingLevelProbeResult {
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

  let afterMinimal: string | null = null;
  let afterXhigh: string | null = null;

  if (hasSet) {
    try {
      api.setThinkingLevel!("minimal");
      afterMinimal = hasGet ? api.getThinkingLevel!() : "(no getter)";
      lines.push(`probe: setThinkingLevel("minimal") OK, now=${afterMinimal}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      lines.push(`probe: setThinkingLevel("minimal") threw: ${msg}`);
    }

    try {
      api.setThinkingLevel!("xhigh");
      afterXhigh = hasGet ? api.getThinkingLevel!() : "(no getter)";
      lines.push(`probe: setThinkingLevel("xhigh") OK, clamped_to=${afterXhigh}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      lines.push(`probe: setThinkingLevel("xhigh") threw: ${msg}`);
    }
  }

  return {
    hasSet,
    hasGet,
    before,
    afterMinimal,
    afterXhigh,
    report: lines.join("\n"),
  };
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    const result = runThinkingLevelProbe(pi);
    ctx.ui.setStatus("probe-thinking", result.hasSet ? "probe: ok" : "probe: missing");
    ctx.ui.notify(result.report, "info");
  });
}

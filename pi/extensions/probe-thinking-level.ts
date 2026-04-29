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

type ThinkingApi = {
  setThinkingLevel?: (level: string) => void;
  getThinkingLevel?: () => string;
};

function readThinkingLevel(api: ThinkingApi): string {
  return api.getThinkingLevel?.() ?? "(no getter)";
}

function probeSetLevel(api: ThinkingApi, level: string): { after: string | null; line: string } {
  try {
    api.setThinkingLevel?.(level);
    const after = readThinkingLevel(api);
    const resultLabel = level === "xhigh" ? "clamped_to" : "now";
    return { after, line: `probe: setThinkingLevel("${level}") OK, ${resultLabel}=${after}` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { after: null, line: `probe: setThinkingLevel("${level}") threw: ${msg}` };
  }
}

export function runThinkingLevelProbe(pi: ExtensionAPI): ThinkingLevelProbeResult {
  const api = pi as unknown as ThinkingApi;
  const hasSet = typeof api.setThinkingLevel === "function";
  const hasGet = typeof api.getThinkingLevel === "function";
  const before = readThinkingLevel(api);
  const lines = [`probe: hasSetThinkingLevel=${hasSet}`, `probe: hasGetThinkingLevel=${hasGet}`, `probe: before=${before}`];

  const minimal = hasSet ? probeSetLevel(api, "minimal") : { after: null, line: "" };
  const xhigh = hasSet ? probeSetLevel(api, "xhigh") : { after: null, line: "" };
  if (hasSet) lines.push(minimal.line, xhigh.line);

  return { hasSet, hasGet, before, afterMinimal: minimal.after, afterXhigh: xhigh.after, report: lines.join("\n") };
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    const api = pi as unknown as {
      getThinkingLevel?: () => string;
      setThinkingLevel?: (level: string) => void;
    };
    const hasSet = typeof api.setThinkingLevel === "function";
    const hasGet = typeof api.getThinkingLevel === "function";
    const current = hasGet ? api.getThinkingLevel!() : "(no getter)";

    ctx.ui.setStatus("probe-thinking", hasSet ? "probe: ok" : "probe: missing");
    ctx.ui.notify(
      [
        `probe: hasSetThinkingLevel=${hasSet}`,
        `probe: hasGetThinkingLevel=${hasGet}`,
        `probe: current=${current}`,
        "probe: non-mutating session_start; runThinkingLevelProbe is test/manual-only",
      ].join("\n"),
      "info",
    );
  });
}

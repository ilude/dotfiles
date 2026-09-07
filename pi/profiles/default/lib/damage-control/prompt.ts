import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Decision } from "./types.ts";

export type PromptContext = Pick<ExtensionContext, "hasUI" | "mode" | "signal"> & {
  ui: Pick<ExtensionContext["ui"], "select"> & { theme: Pick<ExtensionContext["ui"]["theme"], "fg"> };
};
export type PromptResult = { status: "approved" } | { status: "denied"; reason: string };
const clean = (s: string) => {
  const text = s.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "");
  const omitted = "\n[Display truncated; inspect the complete pending tool call before approving.]";
  return text.length <= 4000 ? text : `${text.slice(0, 4000 - omitted.length)}${omitted}`;
};
export async function promptDecision(decision: Extract<Decision, { outcome: "user" }>, operation: string, ctx: PromptContext): Promise<PromptResult> {
  const firm = decision.outcome === "user" && decision.origin !== "review";
  const label = firm ? "POLICY APPROVAL REQUIRED" : "REVIEW NEEDS INPUT";
  const message = clean(`${decision.reason}\n\nPending operation (untrusted data):\n${operation}`);
  if (!ctx.hasUI || ctx.mode === "print" || ctx.mode === "json") return { status: "denied", reason: `needs_approval: ${label}: action not executed. ${message}` };
  if (ctx.signal?.aborted) return { status: "denied", reason: "Pending call cancelled; action not executed" };
  const title = ctx.mode === "tui" ? ctx.ui.theme.fg(firm ? "accent" : "warning", label) : label;
  try {
    const answer = await ctx.ui.select(`${title}\n${message}`, ["Deny", "Allow once"], { signal: ctx.signal });
    if (answer === "Allow once" && !ctx.signal?.aborted) return { status: "approved" };
    return { status: "denied", reason: "Denied or cancelled; action not executed" };
  } catch {
    return { status: "denied", reason: "Approval UI unavailable; action not executed" };
  }
}

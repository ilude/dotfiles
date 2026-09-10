import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { buildApproval, displayText, type Approval, type ApprovalDecision } from "./approval.ts";
import { createApprovalView } from "./approval-view.ts";
import type { Analysis, ToolRequest } from "./types.ts";

export type PromptContext = Pick<ExtensionContext, "hasUI" | "mode" | "signal"> & {
  ui: Pick<ExtensionContext["ui"], "select" | "custom">;
  allowReview?: boolean;
};
export type PromptResult = { status: "approved"; review?: boolean } | { status: "denied"; reason: string };

async function rpcPrompt(approval: Approval, ctx: PromptContext): Promise<"allow" | "review" | "deny"> {
  const summary = `${approval.title}\n${approval.summary.map(line => line.text).join("\n")}`;
  const detailText = approval.details.map(line => line.text).join("\n");
  const pageSize = 3000;
  const count = Math.max(1, Math.ceil(detailText.length / pageSize));
  const trigger = approval.details.findIndex(line => line.trigger);
  const triggerOffset = trigger < 0 ? 0 : approval.details.slice(0, trigger).reduce((length, line) => length + line.text.length + 1, 0);
  while (!ctx.signal?.aborted) {
    const answer = await ctx.ui.select(summary.length > 3000 ? `${summary.slice(0, 2900)}\n[More in Details. Approval covers the whole tool call.]` : summary, ["Allow once", ...(ctx.allowReview ? ["Allow once and review for future use"] : []), "Deny", "Details"], { signal: ctx.signal });
    if (answer !== "Details") {
      if (ctx.signal?.aborted) return "deny";
      if (answer === "Allow once and review for future use") return "review";
      return answer === "Allow once" ? "allow" : "deny";
    }
    let page = Math.floor(triggerOffset / pageSize);
    while (!ctx.signal?.aborted) {
      const choices = ["Back", ...(page > 0 ? ["Previous page"] : []), ...(page < count - 1 ? ["Next page"] : [])];
      const navigation = await ctx.ui.select(`Details ${page + 1}/${count}\n${detailText.slice(page * pageSize, (page + 1) * pageSize)}`, choices, { signal: ctx.signal });
      if (navigation === "Back") break;
      if (navigation === "Next page" && page < count - 1) page++;
      else if (navigation === "Previous page" && page > 0) page--;
      else return "deny";
    }
  }
  return "deny";
}

export async function promptDecision(decision: ApprovalDecision, request: ToolRequest, analysis: Analysis, ctx: PromptContext): Promise<PromptResult> {
  const approval = buildApproval(decision, request, analysis);
  if (!ctx.hasUI || ctx.mode === "print" || ctx.mode === "json") return { status: "denied", reason: `needs_approval: ${approval.title}; action not executed. ${displayText(decision.reason).slice(0, 3000)}` };
  if (ctx.signal?.aborted) return { status: "denied", reason: "Pending call cancelled; action not executed" };
  let removeAbortListener: (() => void) | undefined;
  try {
    const allowed = ctx.mode === "tui"
      ? await ctx.ui.custom<"allow" | "review" | "deny">((tui, theme, keys, done) => {
        let settled = false;
        const finish = (answer: "allow" | "review" | "deny") => { if (!settled) { settled = true; done(answer); } };
        const abort = () => finish("deny");
        const view = createApprovalView(approval, theme, keys, finish, () => tui.terminal.rows, ctx.allowReview);
        ctx.signal?.addEventListener("abort", abort, { once: true });
        removeAbortListener = () => ctx.signal?.removeEventListener("abort", abort);
        if (ctx.signal?.aborted) abort();
        return {
          render: (width: number) => view.render(width),
          invalidate: () => view.invalidate(),
          handleInput: (data: string) => { view.handleInput?.(data); tui.requestRender(); },
          dispose: () => removeAbortListener?.(),
        };
      })
      : await rpcPrompt(approval, ctx);
    if ((allowed === "allow" || allowed === "review") && !ctx.signal?.aborted) return allowed === "review" ? { status: "approved", review: true } : { status: "approved" };
    if (ctx.signal?.aborted) return { status: "denied", reason: "Pending call cancelled; action not executed" };
    return { status: "denied", reason: approval.denial };
  } catch {
    return { status: "denied", reason: "Approval UI unavailable; action not executed" };
  } finally {
    removeAbortListener?.();
  }
}

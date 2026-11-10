import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { T3RoleRuntime } from "./bootstrap.ts";
import { failure, result, text } from "./call.ts";
import { T3_ROLE_OUTCOME_ENTRY, type T3RoleOutcomeReport } from "./contracts.ts";
import { requestId, type T3RoleToolServices } from "./launch.ts";

export function registerT3RoleParent(pi: ExtensionAPI, runtime: T3RoleRuntime, services: T3RoleToolServices): void {
  pi.registerTool({ name: "t3_role_parent", label: "Role parent", exposure: "model-only",
    description: "Ask a blocking T3 user question or save a substantive partial/blocked/completed/failed report for your commissioning parent. A question pauses only this child; T3 notifies the parent, who may answer via t3_role_control or the user may answer in T3. This is not a permission approval, yield protocol, or question cancellation API. Reports do not terminate execution or fabricate a T3 status; include the summary in your normal final reply too. After process loss an unanswered question may need asking again.",
    parameters: Type.Object({ action: Type.Union([Type.Literal("question"), Type.Literal("report")]), message: Type.String(), outcome: Type.Optional(Type.Union(["completed", "partial", "blocked", "failed", "cancelled"].map(value => Type.Literal(value)))) }),
    async execute(id, p, signal, _update, ctx) { try {
      const binding = runtime.binding();
      const authority = runtime.authority();
      if (!binding || !authority?.canonicalTools.includes("subagent_parent")) throw new Error("No bound T3 role parent authority");
      const identity = await services.metadata().currentThread(ctx.cwd);
      if (identity.threadId !== binding.threadId || identity.parentThreadId !== binding.parentThreadId || !identity.runId) throw new Error("T3 role parent identity mismatch");
      const message = text(p.message, "parent message");
      if (p.action === "question") {
        const intentId = requestId(ctx, id);
        pi.appendEntry("t3-role-question", { version: 1, intentId, launchId: binding.launchId, threadId: identity.threadId, runId: identity.runId, question: message, state: "pending" });
        const answer = await ctx.ui.input(message, "Answer for the child", { signal });
        pi.appendEntry("t3-role-question", { version: 1, intentId, launchId: binding.launchId, threadId: identity.threadId, runId: identity.runId, state: answer === undefined ? "unanswered" : "answered" });
        return result(answer === undefined ? { answered: false, message: "Question dismissed or interrupted; no answer received." } : { answered: true, answer });
      }
      const outcome = p.outcome;
      if (outcome !== "completed" && outcome !== "partial" && outcome !== "blocked" && outcome !== "failed" && outcome !== "cancelled") throw new Error("report requires a role outcome");
      const receipts = await services.store.receipts(binding.parentThreadId);
      const receipt = receipts.find(item => item.childThreadId === identity.threadId && item.runId === identity.runId && item.launchId === binding.launchId);
      const report: T3RoleOutcomeReport = { version: 1, launchId: binding.launchId, threadId: identity.threadId, runId: identity.runId, ...(receipt ? { taskId: receipt.taskId } : {}), roleOutcome: outcome, summary: message };
      await services.store.outcome(report); pi.appendEntry(T3_ROLE_OUTCOME_ENTRY, report);
      return result({ recorded: true, runId: report.runId, taskId: report.taskId, roleOutcome: outcome, summary: message, executionStatus: "T3-owned; unchanged by report" });
    } catch (error) { return failure(error); } },
  });
}

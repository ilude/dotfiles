import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { T3RoleRuntime } from "./bootstrap.ts";
import { failure, optionalText, record, result, text } from "./call.ts";
import { T3_ROLE_RECEIPT_ENTRY, type T3RoleOwnershipReceipt } from "./contracts.ts";
import { requestId, roleResult, type T3RoleToolServices } from "./launch.ts";

export function registerT3RoleControl(pi: ExtensionAPI, runtime: T3RoleRuntime, services: T3RoleToolServices): void {
  pi.registerTool({ name: "t3_role_control", label: "Role control", exposure: "model-only",
    description: "Control only your owned Pi-role child. inspect reads saved task results, read reads its thread. No status polling: await automatic completion delivery. wait is a single event-driven terminal rejoin, not a question wake, and requires blockingReason; interruption does not cancel the child. message supports auto/queue/steer/restart, including a completed-child follow-up with a new task ID. message freshContext:true replaces Pi context while retaining frozen role authority. A new review/re-check requires t3_delegate_role instead. questions/answer operate on user questions only, never permission approvals. cancel stops current work, queued turns and descendants through T3, preserving old results and mode-ceiling refusals.",
    parameters: Type.Object({ action: Type.Union(["inspect", "read", "wait", "message", "questions", "answer", "cancel"].map(value => Type.Literal(value))), id: Type.String({ description: "Returned launchId, child threadId, or owned taskId." }), message: Type.Optional(Type.String()), mode: Type.Optional(Type.Union(["auto", "queue", "steer", "restart"].map(value => Type.Literal(value)))), freshContext: Type.Optional(Type.Boolean()), blockingReason: Type.Optional(Type.String()), timeoutMs: Type.Optional(Type.Number({ minimum: 1 })), requestId: Type.Optional(Type.String()), answers: Type.Optional(Type.Record(Type.String(), Type.Unknown())) }),
    reachesTools: () => services.reaches(["task_status", "t3_thread_read", "t3_thread_wait", "t3_thread_send", "t3_pending_request", "task_cancel"]),
    async execute(id, p, signal, update, ctx) { try {
      const authority = runtime.authority();
      if (authority && !authority.canonicalTools.includes("subagent_control")) throw new Error("Role cannot control children");
      const identity = await services.metadata().currentThread(ctx.cwd);
      const receipts = (await services.store.receipts(identity.threadId)).filter(receipt => receipt.launchId === p.id || receipt.childThreadId === p.id || receipt.taskId === p.id);
      if (!receipts.length || new Set(receipts.map(receipt => receipt.childThreadId)).size !== 1) throw new Error("No uniquely owned T3 role child matches id");
      const first = receipts[0];
      const binding = await services.store.binding(first.childThreadId);
      if (binding && (binding.parentThreadId !== identity.threadId || binding.launchId !== first.launchId)) throw new Error("T3 role child binding ownership mismatch");
      const response = record(await services.metadata().thread(first.childThreadId));
      const thread = record(response.thread, "child thread");
      if (thread.threadId !== first.childThreadId || thread.parentThreadId !== identity.threadId) throw new Error("T3 child lineage ownership mismatch");
      if (p.action === "read") return result(await services.call(ctx, id, "t3_thread_read", { threadId: first.childThreadId }, signal, update));
      const historical = p.action === "inspect" ? receipts.find(item => item.taskId === p.id) : undefined;
      if (historical) return result(await roleResult(services.store, historical, await services.call(ctx, id, "task_status", { taskId: historical.taskId }, signal, update)));
      const all = (await services.store.receipts(identity.threadId)).filter(receipt => receipt.childThreadId === first.childThreadId && receipt.launchId === first.launchId);
      const currentRun = optionalText(thread.activeRunId) ?? optionalText(thread.latestRunId);
      const current = currentRun ? all.find(receipt => receipt.runId === currentRun) : undefined;
      // A retained child may run queued turns within the same task, without a new receipt.
      const tasks = new Set(all.map(receipt => receipt.taskId));
      const receipt = current ?? (tasks.size === 1 ? first : undefined);
      if (!receipt) throw new Error("Current owned T3 task identity unavailable");
      if (p.action === "questions" || p.action === "answer") {
        const args: Record<string, unknown> = { threadId: receipt.childThreadId, action: p.action === "answer" ? "respond" : p.requestId ? "read" : "list" };
        if (p.requestId) args.requestId = p.requestId;
        if (p.action === "answer") { args.requestId = text(p.requestId, "question request ID"); args.answers = record(p.answers, "question answers"); }
        return result(await services.call(ctx, id, "t3_pending_request", args, signal, update));
      }
      if (p.action === "cancel") return result(await services.call(ctx, id, "task_cancel", { taskId: receipt.taskId, clientRequestId: requestId(ctx, id), ...(p.message ? { reason: p.message } : {}) }, signal, update));
      if (p.action === "message") {
        const data = await services.call(ctx, id, "t3_thread_send", { threadId: receipt.childThreadId, message: text(p.message, "message"), mode: p.mode ?? "auto", ...(p.freshContext === undefined ? {} : { freshContext: p.freshContext }), clientRequestId: requestId(ctx, id) }, signal, update);
        if (data.threadId !== receipt.childThreadId) throw new Error("T3 follow-up returned a different child thread");
        const taskId = optionalText(data.taskId);
        if (taskId) {
          const followup: T3RoleOwnershipReceipt = { version: 1, launchId: receipt.launchId, ownerThreadId: identity.threadId, ownerPiSessionId: ctx.sessionManager.getSessionId(), childThreadId: receipt.childThreadId, taskId, runId: text(data.runId, "follow-up run"), childLink: optionalText(data.link) ?? receipt.childLink, operation: "follow-up" };
          await services.store.receipt(followup); pi.appendEntry(T3_ROLE_RECEIPT_ENTRY, followup);
          return result(await roleResult(services.store, followup, data));
        }
        return result({ ...data, launchId: receipt.launchId, taskId: receipt.taskId, t3Status: data.status });
      }
      if (p.action === "wait") {
        if (!p.blockingReason?.trim()) throw new Error("wait requires blockingReason");
        const data = await services.call(ctx, id, "t3_thread_wait", { threadId: receipt.childThreadId, ...(currentRun ? { runId: currentRun } : {}), untilDelegatedWorkSettled: true, ...(p.timeoutMs !== undefined ? { timeoutMs: p.timeoutMs } : {}) }, signal, update);
        const settledRun = data.resultRun ? record(data.resultRun, "settled run") : undefined;
        return result(await roleResult(services.store, receipt, { ...data, runId: optionalText(settledRun?.runId) ?? data.runId }));
      }
      return result(await roleResult(services.store, receipt, await services.call(ctx, id, "task_status", { taskId: receipt.taskId }, signal, update)));
    } catch (error) { return failure(error); } },
  });
}

import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { getAgentDir, type ExtensionAPI, type ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { resolveRoleSnapshot } from "../authority.ts";
import { EFFORTS } from "../options.ts";
import type { T3RoleRuntime } from "./bootstrap.ts";
import { callT3, failure, optionalText, record, result, text, t3ToolNames } from "./call.ts";
import { createT3MetadataClient, type T3MetadataReader } from "./context.ts";
import { createHandoffStore, parseT3RoleHandoff, type HandoffStore } from "./handoffs.ts";
import { T3_ROLE_RECEIPT_ENTRY, type RoleGoalScope, type T3RoleHandoff, type T3RoleOwnershipReceipt } from "./contracts.ts";
import { registerT3RoleControl } from "./control.ts";
import { registerT3RoleParent } from "./parent.ts";

export interface T3RoleToolOptions {
  profile?: string;
  store?: HandoffStore;
  metadata?: T3MetadataReader;
  bridgePath?: string;
  captureGoal?: (ctx: ExtensionToolContext, launchId: string, inherited?: RoleGoalScope) => Promise<RoleGoalScope | undefined>;
  prepareHandoff?: (handoff: T3RoleHandoff, ctx: ExtensionToolContext) => Promise<T3RoleHandoff>;
}
export interface T3RoleToolServices {
  profile: string;
  store: HandoffStore;
  metadata(): T3MetadataReader;
  reaches(operations: readonly string[]): string[];
  call(ctx: ExtensionToolContext, id: string, operation: string, args: Record<string, unknown>, signal?: AbortSignal, onUpdate?: Parameters<typeof callT3>[7]): Promise<Record<string, unknown>>;
}
function handoffTitle(instructions: string): string { return instructions.split(/\r?\n/)[0].slice(0, 100); }
export function requestId(ctx: ExtensionToolContext, callId: string): string {
  return createHash("sha256").update(`${ctx.sessionManager.getSessionId()}:${callId}`).digest("hex");
}
export async function roleResult(store: HandoffStore, receipt: T3RoleOwnershipReceipt, data: Record<string, unknown>) {
  const runId = optionalText(data.childRunId) ?? optionalText(data.runId) ?? receipt.runId;
  const reports = await store.outcomes(receipt.childThreadId);
  const report = runId ? reports.filter(item => item.launchId === receipt.launchId && item.runId === runId && (!item.taskId || item.taskId === receipt.taskId)).at(-1) : undefined;
  return { ...data, launchId: receipt.launchId, threadId: receipt.childThreadId, taskId: receipt.taskId, runId,
    childLink: optionalText(data.link) ?? receipt.childLink, piSessionId: receipt.childPiSessionId,
    t3Status: text(data.status, "execution status"), roleOutcome: report?.roleOutcome, roleSummary: report?.summary,
    result: optionalText(data.summary), childWorkContinues: data.hasPendingChildRuns };
}
export function registerT3RoleTools(pi: ExtensionAPI, runtime: T3RoleRuntime, options: T3RoleToolOptions = {}): void {
  const profile = options.profile ?? getAgentDir();
  let metadata = options.metadata;
  const services: T3RoleToolServices = {
    profile, store: options.store ?? createHandoffStore(profile), metadata: () => metadata ??= createT3MetadataClient(),
    reaches: operations => t3ToolNames(pi, operations, options.bridgePath),
    call: async (ctx, id, op, args, signal, update) => {
      try { return await callT3(pi, runtime, ctx, id, op, args, signal, update, options.bridgePath); }
      catch (error) { metadata = options.metadata; throw error; }
    },
  };
  pi.registerTool({ name: "t3_delegate_role", label: "Delegate role", exposure: "model-only",
    description: "Launch a Pi-enforced named role as an app-owned T3 child. Select background:true for automatic result delivery; default foreground and Strategist is always foreground. Other foreground launches require blockingReason. Only shared checkout or a new T3 worktree is supported, not arbitrary cwd or an existing worktree. No hidden native fallback. New reviews/re-checks need a fresh delegation, not a retained-thread message. T3 owns completion delivery; follow its next instruction without polling.",
    parameters: Type.Object({ agent: Type.String(), instructions: Type.String(), model: Type.Optional(Type.String()), effort: Type.Optional(Type.Union(EFFORTS.map(value => Type.Literal(value)))), skills: Type.Optional(Type.Array(Type.String())), background: Type.Optional(Type.Boolean()), blockingReason: Type.Optional(Type.String()), isolation: Type.Optional(Type.Union([Type.Literal("shared"), Type.Literal("worktree")])), title: Type.Optional(Type.String()), timeoutMs: Type.Optional(Type.Number({ minimum: 1 })) }, { additionalProperties: false }),
    reachesTools: () => services.reaches(["delegate_task", "orchestrator_capabilities"]),
    async execute(id, p, signal, update, ctx) { try {
      const authority = runtime.authority();
      if (authority && !authority.canonicalTools.includes("subagent")) throw new Error("Role cannot delegate");
      const snapshot = resolveRoleSnapshot({ agent: p.agent, backend: "t3", profile, cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted(), model: p.model, effort: p.effort, skills: p.skills, parentDelegates: authority?.delegates, modelRegistry: ctx.modelRegistry });
      const strategist = snapshot.definition.name === "strategist";
      const background = strategist ? false : p.background ?? false;
      if (!background && !strategist && !p.blockingReason?.trim()) throw new Error("Non-Strategist foreground launch requires blockingReason");
      const identity = await services.metadata().currentThread(ctx.cwd);
      const sessionFile = ctx.sessionManager.getSessionFile();
      if (!identity.runId || !sessionFile) throw new Error("T3 launch requires an active run and durable Pi session");
      let capabilities = await services.metadata().capabilities();
      function target(caps: Record<string, unknown>) {
        if (!Array.isArray(caps.providers)) return undefined;
        for (const value of caps.providers) {
          const provider = record(value, "provider");
          if (provider.providerInstanceId !== caps.inheritedProviderInstanceId || provider.driverKind !== "pi" || provider.canRunChildTask !== true || !Array.isArray(provider.models)) continue;
          const model = provider.models.map(value => record(value, "model")).find(value => value.id === snapshot.model.qualified);
          if (!model) continue;
          const thinking = Array.isArray(model.options) ? model.options.map(value => record(value, "option")).find(value => value.id === "thinking") : undefined;
          // T3 fallback/custom catalogs omit descriptors. Pi already resolved the
          // setting and bootstrap verifies the exact applied effort before work.
          if (thinking && (!Array.isArray(thinking.values) || !thinking.values.includes(snapshot.effort))) continue;
          return { providerInstanceId: text(provider.providerInstanceId, "Pi provider instance"), model: text(model.id, "catalog model"), ...(thinking ? { options: { thinking: snapshot.effort } } : {}) };
        }
        return undefined;
      }
      let selected = target(capabilities);
      if (!selected) { capabilities = await services.call(ctx, id, "orchestrator_capabilities", { search: snapshot.model.qualified }, signal, update); selected = target(capabilities); }
      if (!selected) throw new Error(`T3 Pi catalog does not offer ${snapshot.model.qualified} with thinking=${snapshot.effort}`);
      const launchId = requestId(ctx, id);
      const taskTitle = `[${snapshot.definition.name}] ${p.title?.trim() || handoffTitle(p.instructions)} [pi-role:${launchId}]`;
      const inheritedGoal = runtime.binding()?.goal;
      const goal = options.captureGoal ? await options.captureGoal(ctx, launchId, inheritedGoal) : inheritedGoal;
      let handoff: T3RoleHandoff = { version: 1, launchId, snapshot, assignment: text(p.instructions, "assignment"), taskTitle, commissioner: { threadId: identity.threadId, runId: identity.runId, piSessionId: ctx.sessionManager.getSessionId(), piSessionFile: sessionFile, profile, cwd: ctx.cwd, parentLaunchId: runtime.binding()?.launchId }, workspace: { isolation: p.isolation ?? "shared", commissioningCwd: ctx.cwd }, goal };
      if (options.prepareHandoff) handoff = await options.prepareHandoff(handoff, ctx);
      try { await services.store.create(handoff); }
      catch (error) {
        if (!(error instanceof Error) || error.message !== "T3 role launch ID already exists") throw error;
        if (!isDeepStrictEqual(await services.store.read(launchId), parseT3RoleHandoff(handoff))) throw new Error("T3 launch retry differs from its stored handoff");
      }
      const data = await services.call(ctx, id, "delegate_task", { task: `/t3-role-bootstrap ${launchId}\n\n${handoff.assignment}`, title: handoff.taskTitle, target: selected, isolation: handoff.workspace.isolation, mode: background ? "async" : "wait", clientRequestId: launchId, ...(!background && p.timeoutMs !== undefined ? { timeoutMs: p.timeoutMs } : {}) }, signal, update);
      const receipt: T3RoleOwnershipReceipt = { version: 1, launchId, ownerThreadId: identity.threadId, ownerPiSessionId: ctx.sessionManager.getSessionId(), childThreadId: text(data.childThreadId, "child thread"), taskId: text(data.taskId, "task ID"), runId: optionalText(data.childRunId), childLink: optionalText(data.link), operation: "launch" };
      await services.store.receipt(receipt); pi.appendEntry(T3_ROLE_RECEIPT_ENTRY, receipt);
      return result(await roleResult(services.store, receipt, data));
    } catch (error) { return failure(error); } },
  });
  registerT3RoleControl(pi, runtime, services);
  registerT3RoleParent(pi, runtime, services);
}

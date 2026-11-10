import { getAgentDir, type ExtensionAPI, type ExtensionContext, type ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { AssistantMessageEventStream } from "@earendil-works/pi-ai/utils/event-stream";
import type { GoalAdmission } from "../../goal/runtime.ts";
import { samePlatformPath } from "../../path-identity.ts";
import { ChildTransport, requestParent, type ChildEndpoint } from "../transport.ts";
import { createHandoffStore, type HandoffStore } from "./handoffs.ts";
import { createT3MetadataClient, type T3MetadataClient } from "./context.ts";
import type { RoleGoalScope, SubagentGoalBinding, SubagentGoalOperations, T3RoleThreadBinding } from "./contracts.ts";

const CAPTURE = "t3-role-goal-capture";
const ADMIT = "t3-role-goal-admit";
const CLEAR = "t3-role-owned-clear";
interface Request<T> { respond: (result: Promise<T>) => void }
interface CaptureRequest extends Request<RoleGoalScope | undefined> { ctx: ExtensionToolContext; launchId: string; inherited?: RoleGoalScope }
interface AdmissionRequest extends Request<GoalAdmission> { ctx: ExtensionContext }
interface ClearRequest extends Request<void> { ctx: ExtensionContext }
function request<T>(pi: Pick<ExtensionAPI, "events">, name: string, fields: object): Promise<T> {
  let response: Promise<T> | undefined;
  pi.events.emit(name, { ...fields, respond: (value: Promise<T>) => { response = value; } });
  return response ?? Promise.reject(new Error("T3 goal policy is unavailable"));
}
/** Passed to T4, never serialized into a task or role snapshot. */
export function captureT3RoleGoal(pi: ExtensionAPI, ctx: ExtensionToolContext, launchId: string, inherited?: RoleGoalScope): Promise<RoleGoalScope | undefined> {
  return request(pi, CAPTURE, { ctx, launchId, inherited });
}
export function clearT3RoleWork(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> { return request(pi, CLEAR, { ctx }); }
export function requestT3GoalAdmission(pi: Pick<ExtensionAPI, "events">, ctx: ExtensionContext): Promise<GoalAdmission> { return request(pi, ADMIT, { ctx }); }
/** Lazily gate every helper attempt, including native compact's retries. Accounting stays outside this wrapper. */
export function gateT3GoalStream(pi: Pick<ExtensionAPI, "events">, ctx: ExtensionContext, start: () => AssistantMessageEventStream): AssistantMessageEventStream {
  let stream: Promise<AssistantMessageEventStream> | undefined;
  const open = () => stream ??= requestT3GoalAdmission(pi, ctx).then(decision => {
    if (!decision.allowed) throw new Error(decision.reason ?? "Goal admission denied");
    return start();
  });
  return new class extends AssistantMessageEventStream {
    override async result() { return (await open()).result(); }
    override async *[Symbol.asyncIterator]() { for await (const event of await open()) yield event; }
  }();
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid goal callback");
  return value as Record<string, unknown>;
}
function sameScope(a: RoleGoalScope | undefined, b: RoleGoalScope): boolean {
  return !!a && a.runId === b.runId && a.ownerSessionId === b.ownerSessionId && samePlatformPath(a.ownerSessionFile, b.ownerSessionFile);
}
const terminal = new Set(["completed", "failed", "cancelled", "interrupted"]);
export interface T3GoalBackend extends SubagentGoalOperations {
  restore(ctx: ExtensionContext): Promise<void>;
  isChild(): boolean;
  admit(ctx: ExtensionContext): Promise<GoalAdmission>;
  close(): Promise<void>;
}
/** Policy callbacks only. T3 owns all execution/lifecycle state. No native manager is created. */
export function createT3GoalBackend(pi: ExtensionAPI, options: { store?: HandoffStore; metadata?: () => T3MetadataClient } = {}): T3GoalBackend {
  const store = options.store ?? createHandoffStore(getAgentDir());
  const metadata = options.metadata ?? (() => createT3MetadataClient());
  let context: ExtensionContext | undefined;
  let child = false;
  let restored = false;
  let session: string | undefined;
  let childBinding: T3RoleThreadBinding | undefined;
  let guidance: string | undefined;
  const bindings = new Map<string, SubagentGoalBinding>();
  const endpoints = new Map<string, Promise<ChildEndpoint>>();
  const inFlight = new Set<string>();
  const stopped = new Set<string>();
  function scope(origin: string, runId: string): RoleGoalScope {
    const file = context?.sessionManager.getSessionFile();
    if (!file || context?.sessionManager.getSessionId() !== origin) throw new Error("Goal owner session is unavailable");
    return { runId, ownerSessionId: origin, ownerSessionFile: file };
  }
  function bindingFor(value: RoleGoalScope): SubagentGoalBinding {
    const binding = bindings.get(value.ownerSessionId);
    if (!context || !sameScope(scope(value.ownerSessionId, value.runId), value) || binding?.runId !== value.runId) throw new Error("Owning goal is paused or unavailable");
    return binding;
  }
  const transport = new ChildTransport(async (identity, message) => {
    const value = object(message.payload);
    const ownedScope: RoleGoalScope = { runId: identity.run, ownerSessionId: identity.origin, ownerSessionFile: String(value.ownerSessionFile ?? "") };
    const binding = bindingFor(ownedScope);
    const member = await store.binding(String(value.threadId ?? ""));
    if (!member || member.launchId !== value.launchId || !sameScope(member.goal, ownedScope)) throw new Error("Goal callback ownership mismatch");
    if (typeof value.session !== "string" || !value.session.trim()) throw new Error("Goal child session is unavailable");
    if (message.type === "goal-enroll-admit") {
      const decision = await binding.admit();
      if (decision.allowed) binding.enroll(value.session);
      else if (stopped.has(ownedScope.runId)) void stop(ownedScope).catch(error => context?.ui.notify(`Goal child cleanup: ${error instanceof Error ? error.message : String(error)}`, "warning"));
      return decision;
    }
    if (message.type === "goal-accounting") { await binding.accounting(value); return {}; }
    throw new Error("Unsupported goal callback");
  });
  async function publish(value: RoleGoalScope): Promise<ChildEndpoint> {
    const key = `${value.ownerSessionId}:${value.runId}`;
    let pending = endpoints.get(key);
    if (!pending) {
      pending = transport.register({ child: key, run: value.runId, origin: value.ownerSessionId }).then(async endpoint => { await store.setGoalEndpoint(value, endpoint); return endpoint; });
      endpoints.set(key, pending);
    }
    return pending;
  }
  async function remote(member: T3RoleThreadBinding, ctx: ExtensionContext, type: string, event?: Record<string, unknown>): Promise<unknown> {
    const value = member.goal;
    const file = ctx.sessionManager.getSessionFile();
    if (!value || !file) throw new Error("Durable goal child session is unavailable");
    const endpoint = await store.goalEndpoint(value);
    if (!endpoint || endpoint.run !== value.runId || endpoint.origin !== value.ownerSessionId) throw new Error("Owning goal admission is unavailable");
    return requestParent(endpoint, { type, payload: { ...event, launchId: member.launchId, threadId: member.threadId, ownerSessionFile: value.ownerSessionFile, session: file, runId: value.runId } });
  }
  async function admit(ctx: ExtensionContext): Promise<GoalAdmission> {
    if (!restored) return { allowed: false, reason: "Goal session restoration is unavailable" };
    try {
      const identity = await metadata().currentThread(ctx.cwd);
      child = !!identity.parentThreadId;
      childBinding = await store.binding(identity.threadId);
      if (childBinding?.goal) {
        session = ctx.sessionManager.getSessionFile();
        const decision = object(await remote(childBinding, ctx, "goal-enroll-admit"));
        guidance = typeof decision.guidance === "string" ? decision.guidance : undefined;
        if (decision.allowed !== true) {
          // Explicit owner stop initiates scope cancellation. Missing/reloaded owner only denies work.
          return { allowed: false, reason: typeof decision.reason === "string" ? decision.reason : "Owning goal paused further work" };
        }
        return { allowed: true, guidance };
      }
      if (child) return { allowed: true };
      const binding = bindings.get(ctx.sessionManager.getSessionId());
      return binding ? binding.admit() : { allowed: true };
    } catch (error) { return { allowed: false, reason: `Goal admission unavailable: ${error instanceof Error ? error.message : String(error)}` }; }
  }
  async function stop(value: RoleGoalScope): Promise<void> {
    const client = metadata(), identity = await client.currentThread(context?.cwd);
    const handoffs = (await store.goalHandoffs(value)).filter(handoff => handoff.commissioner.threadId === identity.threadId);
    await Promise.all(handoffs.map(handoff => client.cancelOwnedLaunch(handoff)));
  }
  const subscriptions = [
    pi.events.on(CAPTURE, (value: unknown) => {
      const event = value as CaptureRequest;
      event.respond((async () => {
        const identity = await metadata().currentThread(event.ctx.cwd);
        const member = await store.binding(identity.threadId);
        if (member?.goal) {
          if (event.inherited && !sameScope(member.goal, event.inherited)) throw new Error("Inherited goal scope mismatch");
          const decision = await admit(event.ctx);
          if (!decision.allowed) throw new Error(decision.reason);
          return member.goal;
        }
        if (event.inherited) throw new Error("Inherited goal has no bound parent");
        const binding = bindings.get(event.ctx.sessionManager.getSessionId());
        if (!binding?.capture()) return undefined;
        const decision = await binding.admit();
        if (!decision.allowed) throw new Error(decision.reason);
        const value = scope(event.ctx.sessionManager.getSessionId(), binding.runId);
        await publish(value);
        return value;
      })());
    }),
    pi.events.on(ADMIT, (value: unknown) => { const event = value as AdmissionRequest; event.respond(admit(event.ctx)); }),
    pi.events.on(CLEAR, (value: unknown) => {
      const event = value as ClearRequest;
      event.respond((async () => {
        const client = metadata(), identity = await client.currentThread(event.ctx.cwd);
        const owned = await store.ownedHandoffs(identity.threadId);
        await Promise.all(owned.map(handoff => client.cancelOwnedLaunch(handoff)));
      })());
    }),
    pi.events.on("goal-run-id", value => {
      const event = object(value);
      if (childBinding?.goal && event.session === session && typeof event.respond === "function") event.respond(childBinding.goal.runId);
    }),
    pi.events.on("goal-accounting", value => {
      const event = object(value);
      if (!childBinding?.goal || !context || event.runId !== childBinding.goal.runId || event.session !== session || !Array.isArray(event.pending)) return;
      const payload = { type: event.type, recordId: event.recordId, timestamp: event.timestamp, persisted: event.persisted };
      event.pending.push(remote(childBinding, context, "goal-accounting", payload).then(() => {}));
    }),
  ];
  pi.on("turn_start", async (_event, ctx) => {
    context = ctx;
    if (!child) return; // Root keeps its existing GoalRuntime turn gate.
    const decision = await admit(ctx);
    if (!decision.allowed) { ctx.ui.notify(decision.reason ?? "Goal admission denied", "warning"); ctx.abort(); }
  });
  pi.on("context", event => {
    if (!childBinding?.goal || !guidance) return;
    return { messages: [...event.messages.filter(message => !(message.role === "custom" && message.customType === "goal-budget")), { role: "custom" as const, customType: "goal-budget", content: guidance, display: false, timestamp: 0 }] };
  });
  pi.on("tool_call", event => { if (event.toolName === "t3_delegate_role" || event.toolName === "t3_role_control") inFlight.add(event.toolCallId); });
  pi.on("tool_execution_end", event => { inFlight.delete(event.toolCallId); });
  return {
    async restore(ctx) { restored = false; context = ctx; session = undefined; guidance = undefined; const identity = await metadata().currentThread(ctx.cwd); child = !!identity.parentThreadId; childBinding = await store.binding(identity.threadId); restored = true; },
    isChild: () => child,
    admit,
    async bindGoal(origin, binding) { bindings.set(origin, binding); await publish(scope(origin, binding.runId)); },
    unbindGoal(origin, binding) { if (bindings.get(origin) === binding) bindings.delete(origin); },
    stopGoal(origin, runId) { stopped.add(runId); return stop(scope(origin, runId)); },
    async goalActive(origin, runId) {
      if (inFlight.size) return true;
      const value = scope(origin, runId), client = metadata();
      const handoffs = await store.goalHandoffs(value);
      for (const handoff of handoffs) { const task = await client.roleLaunch(handoff); if (task && !terminal.has(task.status)) return true; }
      return false;
    },
    async assertGoalControl(id, origin, action) {
      if (action !== "message" && action !== "answer") return;
      const binding = bindings.get(origin);
      if (!binding?.capture()) return;
      const identity = await metadata().currentThread(context?.cwd);
      const receipts = (await store.receipts(identity.threadId)).filter(receipt => receipt.launchId === id || receipt.childThreadId === id || receipt.taskId === id);
      if (!receipts.length) throw new Error("Goal control target is unavailable");
      const handoff = await store.read(receipts[0].launchId);
      if (!sameScope(handoff.goal, scope(origin, binding.runId))) throw new Error("Cannot attach a pre-goal exchange to this goal. Launch a new role child.");
    },
    async close() { for (const unsubscribe of subscriptions) unsubscribe(); bindings.clear(); restored = false; context = undefined; childBinding = undefined; session = undefined; await transport.close(); },
  };
}

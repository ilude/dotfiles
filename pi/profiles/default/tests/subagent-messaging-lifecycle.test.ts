import { afterEach, describe, expect, it, vi } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import subagents from "../extensions/subagents.ts";
import childAuthority from "../extensions/subagent-child.ts";
import { getSubagentRuntime, resetSubagentRuntime } from "../lib/subagents/runtime.ts";
import { ChildTransport, requestParent } from "../lib/subagents/transport.ts";
import { RpcChild, type ChildRecord } from "../lib/subagents/rpc.ts";
import { VisibleChild } from "../lib/subagents/visible.ts";
import type { AgentDefinition } from "../lib/subagents/definitions.ts";

const here = dirname(fileURLToPath(import.meta.url));
const profile = join(here, "..");
const extension = join(profile, "extensions", "subagent-child.ts");
const fixture = join(here, "fixtures", "fake-subagent-rpc.mjs");
const originalAuthority = process.env.PI_SUBAGENT_AUTHORITY;
const originalEndpoint = process.env.PI_SUBAGENT_ENDPOINT;
const originalBin = process.env.PI_SUBAGENT_BIN;
const originalArgs = process.env.PI_SUBAGENT_BIN_ARGS;

const probe: AgentDefinition = {
  name: "probe", description: "deterministic inert worker", tools: ["subagent_parent"],
  delegates: [], skills: [], prompt: "probe", source: "profile", filePath: "probe.md",
  model: "openai-codex/test", effort: "low",
};
const coordinator: AgentDefinition = {
  ...probe, name: "teamlead", tools: ["subagent", "subagent_control", "subagent_parent"], delegates: ["probe"],
};

function restore(name: "PI_SUBAGENT_AUTHORITY" | "PI_SUBAGENT_ENDPOINT" | "PI_SUBAGENT_BIN" | "PI_SUBAGENT_BIN_ARGS", value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function useFixture() {
  process.env.PI_SUBAGENT_BIN = process.execPath;
  process.env.PI_SUBAGENT_BIN_ARGS = JSON.stringify([fixture]);
}

function rootHarness(origin: string, messages: any[]) {
  const handlers: Record<string, Function> = {};
  const tools: Record<string, any> = {};
  const ctx: any = {
    cwd: here, hasUI: false, isProjectTrusted: () => false, isIdle: () => true,
    sessionManager: { getSessionId: () => origin },
    ui: { notify: vi.fn(), setStatus: vi.fn() },
  };
  const pi: any = {
    events: { on: () => () => {} },
    on: (name: string, handler: Function) => { handlers[name] = handler; },
    registerTool: (tool: any) => { tools[tool.name] = tool; },
    registerCommand: () => {}, registerMessageRenderer: () => {},
    sendMessage: (message: any) => messages.push(message),
  };
  subagents(pi);
  return { handlers, tools, ctx };
}

function childAuthorityHarness(endpoint: any, origin: string) {
  process.env.PI_SUBAGENT_AUTHORITY = JSON.stringify({
    id: endpoint.child, agent: "teamlead", tools: coordinator.tools, delegates: ["probe"], cwd: here, skills: [],
  });
  process.env.PI_SUBAGENT_ENDPOINT = JSON.stringify(endpoint);
  const tools: Record<string, any> = {};
  childAuthority({
    registerTool: (tool: any) => { tools[tool.name] = tool; },
    registerCommand: () => {}, registerMessageRenderer: () => {}, on: () => {},
  } as never);
  void origin;
  return tools;
}

async function waitForRecord(runtime: ReturnType<typeof getSubagentRuntime>, id: string, expected: Partial<ChildRecord>) {
  await vi.waitFor(() => expect(runtime.get(id).snapshot()).toMatchObject(expected), { timeout: 7_000, interval: 20 });
  return runtime.get(id).snapshot();
}

afterEach(async () => {
  try { await resetSubagentRuntime(); } finally {
    restore("PI_SUBAGENT_AUTHORITY", originalAuthority);
    restore("PI_SUBAGENT_ENDPOINT", originalEndpoint);
    restore("PI_SUBAGENT_BIN", originalBin);
    restore("PI_SUBAGENT_BIN_ARGS", originalArgs);
  }
});

describe("combined subagent messaging lifecycle", () => {
  it("carries coordinator controls, native deliveries, original results, and cleanup across headless exchanges", async () => {
    useFixture();
    // The test may itself run inside a visible child; make the root extension
    // path explicit rather than inheriting this process's child authority.
    delete process.env.PI_SUBAGENT_AUTHORITY;
    delete process.env.PI_SUBAGENT_ENDPOINT;
    const origin = "lifecycle-origin";
    const runtime = await resetSubagentRuntime();
    const rootMessages: any[] = [];
    const root = rootHarness(origin, rootMessages);
    const rootBinding = { deliver: (record: any) => true };
    runtime.bind(origin, rootBinding);
    await root.handlers.session_start({}, root.ctx);

    // Capture endpoints without replacing the transport: all controls below still
    // cross the authenticated loopback adapter used by real child processes.
    const endpoints = new Map<string, any>();
    const transport = (runtime as any).transport as ChildTransport;
    const nativeRegister = transport.register.bind(transport);
    const register = vi.spyOn(transport, "register").mockImplementation(async identity => {
      const endpoint = await nativeRegister(identity);
      endpoints.set(identity.child, endpoint);
      return endpoint;
    });

    try {
      const parent = await runtime.launch({
        definition: coordinator, instructions: "[hold]", cwd: here, model: "openai-codex/test", effort: "low",
        skills: [], origin, retained: true, surface: "headless", catalog: new Map([[coordinator.name, coordinator], [probe.name, probe]]),
      }, profile, extension, true);
      await waitForRecord(runtime, parent.id, { sessionId: expect.any(String), processState: "running" });
      const parentEndpoint = endpoints.get(parent.id)!;
      const controls = childAuthorityHarness(parentEndpoint, origin);

      const a = await runtime.launch({
        definition: probe, instructions: "[hold]", cwd: here, model: "openai-codex/test", effort: "low",
        skills: [], origin, retained: true, parentId: parent.id, surface: "headless",
      }, profile, extension, true);
      const b = await runtime.launch({
        definition: probe, instructions: "initial retained worker", cwd: here, model: "openai-codex/test", effort: "low",
        skills: [], origin, retained: true, parentId: parent.id, surface: "headless",
      }, profile, extension, true);
      await waitForRecord(runtime, a.id, { processState: "running" });
      await waitForRecord(runtime, b.id, { status: "settled", outcome: "complete", result: "first answer" });

      // B's first result crosses the runtime mailbox through the same authenticated
      // native adapter a coordinator child uses. It is acknowledged exactly once.
      const firstB = await requestParent(parentEndpoint, { type: "heartbeat" }) as any;
      expect(firstB.delivery).toMatchObject({ id: b.id, deliveryKind: "outcome", result: "first answer" });
      const firstDeliveryId = firstB.delivery.deliveryId;
      await requestParent(parentEndpoint, { type: "outcome-ack", payload: firstDeliveryId });
      const afterAck = await requestParent(parentEndpoint, { type: "heartbeat" }) as any;
      expect(afterAck.delivery).toBeUndefined();
      expect(runtime.get(b.id).snapshot()).toMatchObject({ status: "settled", retained: true, processState: "running" });

      // A asks through its real child-side parent protocol, then the coordinator
      // answers by request ID. The answer intentionally contains [hold], proving
      // control acceptance is not a completion or read receipt.
      const question = await requestParent(endpoints.get(a.id), {
        type: "question", payload: { message: "Need the release decision", protocol: "question-answer" },
      }) as any;
      expect(question.id).toEqual(expect.any(String));
      const questionDelivery = await requestParent(parentEndpoint, { type: "heartbeat" }) as any;
      expect(questionDelivery.delivery).toMatchObject({ deliveryKind: "question", requestId: question.id });
      const answered = await controls.subagent_control.execute("answer", {
        action: "answer", id: a.id, message: "[hold]", replyTo: question.id,
      });
      expect(answered.details).toMatchObject({
        id: a.id, status: "running", dispatch: { accepted: true, operation: "answer", completion: "not-reported" },
      });
      const resolution = await requestParent(parentEndpoint, { type: "heartbeat" }) as any;
      expect(resolution.delivery).toMatchObject({ deliveryKind: "question-resolution", questionResolution: { requestId: question.id, outcome: "answered" } });
      await requestParent(parentEndpoint, { type: "outcome-ack", payload: resolution.delivery.deliveryId });

      // A partial report is deferred while A is active. A root-directed queued
      // steer then exercises the real root coordinator control and native result
      // boundary without waiting for A or claiming completion.
      await requestParent(parentEndpoint, { type: "partial", payload: "Earlier work remains active." });
      const directed = await root.tools.subagent_control.execute("message", {
        action: "message", id: parent.id, message: "root direction while A runs", background: false,
      }, undefined, undefined, root.ctx);
      expect(directed.details).toMatchObject({
        id: parent.id, status: "running", outcome: "partial",
        dispatch: { accepted: true, operation: "message", completion: "not-reported" },
      });
      await waitForRecord(runtime, parent.id, { phase: "waiting-children", status: "running", outcome: "partial", result: "Earlier work remains active." });

      // B is followed up through the coordinator control path. Inspection exposes
      // both immutable exchange identities; the new notification carries only F.
      const followUp = await controls.subagent_control.execute("message", {
        action: "message", id: b.id, message: "follow-up", background: true,
      });
      expect(followUp.details).toMatchObject({ id: b.id, dispatch: { accepted: true, operation: "message" } });
      await waitForRecord(runtime, b.id, { status: "settled", result: "second answer", exchangeKind: "follow-up" });
      const inspected = await controls.subagent_control.execute("inspect", { action: "inspect", id: b.id });
      expect(inspected.details).toMatchObject({
        result: "second answer", exchangeKind: "follow-up",
        originalAssignment: { result: "first answer", outcome: "complete", assignment: "initial retained worker" },
      });
      const originalCopy = inspected.details.originalAssignment;
      originalCopy.result = "mutated response copy";
      expect(runtime.get(b.id).snapshot().originalAssignment?.result).toBe("first answer");
      const followDelivery = await requestParent(parentEndpoint, { type: "heartbeat" }) as any;
      expect(followDelivery.delivery).toMatchObject({ id: b.id, result: "second answer", exchangeKind: "follow-up" });
      expect(followDelivery.delivery.originalAssignment).toMatchObject({ result: "first answer" });
      expect(followDelivery.delivery.result).not.toBe("first answer");
      await requestParent(parentEndpoint, { type: "outcome-ack", payload: followDelivery.delivery.deliveryId });
      await controls.subagent_control.execute("finish", { action: "finish", id: b.id });
      expect(runtime.get(b.id).snapshot()).toMatchObject({ retained: false, processState: "exited", result: "second answer", originalAssignment: { result: "first answer" } });

      // Release A through native steering, consume its separate outcome, and only
      // then allow the parent to settle its later final turn.
      const release = await controls.subagent_control.execute("message", { action: "message", id: a.id, message: "release A", background: true });
      expect(release.details).toMatchObject({ id: a.id, dispatch: { accepted: true, completion: "not-reported" } });
      await waitForRecord(runtime, a.id, { status: "settled", outcome: "complete" });
      const aDelivery = await requestParent(parentEndpoint, { type: "heartbeat" }) as any;
      expect(aDelivery.delivery).toMatchObject({ id: a.id, outcome: "complete" });
      await requestParent(parentEndpoint, { type: "outcome-ack", payload: aDelivery.delivery.deliveryId });
      await controls.subagent_control.execute("finish", { action: "finish", id: a.id });

      // This native prompt creates a later settlement cycle. T2a's corrected
      // selection must replace the deferred partial rather than freezing it.
      await runtime.get(parent.id).command("prompt", { message: "follow-up final" });
      await waitForRecord(runtime, parent.id, { status: "settled", outcome: "complete", result: "second answer" });
      const final = runtime.get(parent.id).snapshot();
      expect(final.originalAssignment).toMatchObject({ outcome: "complete", result: "second answer", assignment: "[hold]" });
      expect(final.result).toBe("second answer");
      expect(final.processState).toBe("running");

      // Root's native delivery contains the final result and original snapshot.
      const parentMessage = rootMessages.find(message => message.customType === "subagent-result" && message.details?.id === parent.id);
      expect(parentMessage?.details).toMatchObject({ outcome: "complete", result: "second answer", originalAssignment: { result: "second answer" } });
      expect(parentMessage?.details.result).not.toContain("Earlier work remains active.");
      const pendingBeforeAck = (runtime as any).pending as Map<string, unknown>;
      const parentDeliveryId = parentMessage.details.deliveryId;
      await root.handlers.message_end({ message: { role: "custom", customType: "subagent-result", details: { origin, deliveryId: parentDeliveryId } } }, root.ctx);
      expect(pendingBeforeAck.has(parentDeliveryId)).toBe(false);

      // Explicit finish closes the retained process without replacing either the
      // original terminal evidence or the latest exchange result with an exit ack.
      await root.tools.subagent_control.execute("finish", { action: "finish", id: parent.id }, undefined, undefined, root.ctx);
      expect(runtime.get(parent.id).snapshot()).toMatchObject({
        status: "settled", outcome: "complete", result: "second answer", retained: false,
        processState: "exited", cleanup: { complete: true }, originalAssignment: { result: "second answer" },
      });
    } finally {
      register.mockRestore();
      await root.handlers.session_shutdown({ reason: "quit" }, root.ctx);
    }
  }, 25_000);

  it("uses the visible surface's app-poll and operator-input boundaries without claiming headless coverage", async () => {
    const instance = new VisibleChild({
      definition: probe, instructions: "visible original", cwd: here, model: "openai-codex/test", effort: "low",
      skills: [], origin: "visible-origin", retained: true, surface: "visible",
    }, extension, profile, {} as any);
    (instance as any).appReady = true;
    instance.record.processState = "running";
    await instance.message("queued visible direction", { delivery: "queued" });
    const poll = instance.parentMessage({ type: "app-poll" }) as any;
    expect(poll.commands).toContainEqual(expect.objectContaining({ type: "message", message: "queued visible direction", delivery: "queued" }));

    expect(instance.parentMessage({ type: "turn", payload: { turn: 1, text: "VISIBLE ORIGINAL" } })).toEqual({ accepted: true });
    const original = instance.snapshot();
    expect(original).toMatchObject({ status: "settled", outcome: "complete", result: "VISIBLE ORIGINAL", exchangeKind: "original", originalAssignment: { result: "VISIBLE ORIGINAL" } });
    instance.parentMessage({ type: "operator-input", payload: { text: "visible follow-up" } });
    expect(instance.snapshot()).toMatchObject({ status: "running", exchangeKind: "follow-up", result: undefined, originalAssignment: { result: "VISIBLE ORIGINAL" } });
    expect(instance.parentMessage({ type: "turn", payload: { turn: 2, text: "VISIBLE FOLLOW-UP" } })).toEqual({ accepted: true });
    expect(instance.snapshot()).toMatchObject({ status: "settled", outcome: "complete", result: "VISIBLE FOLLOW-UP", exchangeKind: "follow-up", originalAssignment: { result: "VISIBLE ORIGINAL" } });
    const beforeCleanup = instance.snapshot();
    await instance.finish();
    expect(instance.snapshot()).toMatchObject({ processState: "exited", retained: false, result: "VISIBLE FOLLOW-UP", originalAssignment: beforeCleanup.originalAssignment });
  });
});

void RpcChild;

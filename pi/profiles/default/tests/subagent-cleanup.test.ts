import { afterEach, describe, expect, it, vi } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RpcChild } from "../lib/subagents/rpc.ts";
import { VisibleChild } from "../lib/subagents/visible.ts";
import { SubagentRuntime, getSubagentRuntime, resetSubagentRuntime } from "../lib/subagents/runtime.ts";
import subagents from "../extensions/subagents.ts";
import clearCommand from "../extensions/clear.ts";
import { createEventBus } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/event-bus.js";
import type { AgentDefinition } from "../lib/subagents/definitions.ts";

const here = dirname(fileURLToPath(import.meta.url));
const oldBin = process.env.PI_SUBAGENT_BIN;
const oldArgs = process.env.PI_SUBAGENT_BIN_ARGS;
const children: RpcChild[] = [];
const owners: SubagentRuntime[] = [];
const definition: AgentDefinition = { name: "cleanup-probe", description: "cleanup probe", tools: [], delegates: [], skills: [], prompt: "probe", source: "profile", filePath: "probe.md" };

function rpcChild(instructions: string, retained = false) {
  process.env.PI_SUBAGENT_BIN = process.execPath;
  process.env.PI_SUBAGENT_BIN_ARGS = JSON.stringify([join(here, "fixtures/fake-subagent-rpc.mjs")]);
  const child = new RpcChild({ definition, instructions, cwd: here, model: "openai-codex/test", effort: "low", skills: [], origin: "cleanup-origin", retained, surface: "headless" }, join(here, "../extensions/subagent-child.ts"), join(here, ".."));
  children.push(child);
  return child;
}

function runtime() {
  process.env.PI_SUBAGENT_BIN = process.execPath;
  process.env.PI_SUBAGENT_BIN_ARGS = JSON.stringify([join(here, "fixtures/fake-subagent-rpc.mjs")]);
  const owner = new SubagentRuntime();
  owners.push(owner);
  return owner;
}

async function launch(owner: SubagentRuntime, instructions: string) {
  return owner.launch({ definition, instructions, cwd: here, model: "openai-codex/test", effort: "low", skills: [], origin: "cleanup-origin", retained: false, surface: "headless" }, join(here, ".."), join(here, "../extensions/subagent-child.ts"), true);
}

afterEach(async () => {
  for (const child of children.splice(0)) {
    try { await child.cancel(); } catch { /* failed-cleanup fixtures are repaired by each test */ }
  }
  for (const owner of owners.splice(0)) await owner.shutdown("quit").catch(() => undefined);
  if (oldBin === undefined) delete process.env.PI_SUBAGENT_BIN; else process.env.PI_SUBAGENT_BIN = oldBin;
  if (oldArgs === undefined) delete process.env.PI_SUBAGENT_BIN_ARGS; else process.env.PI_SUBAGENT_BIN_ARGS = oldArgs;
});

describe("subagent cleanup ownership", () => {
  it("keeps cancellation and its cleanup failure separate, then succeeds on retry", async () => {
    const child = rpcChild("[hold]");
    const stop = vi.spyOn(child as any, "stopProcess").mockRejectedValueOnce(new Error("termination denied"));
    const started = child.start();
    await vi.waitFor(() => expect(child.record.processState).toBe("running"));
    await child.cancel();
    expect(await started).toMatchObject({ outcome: "cancelled", cleanup: { complete: false, errors: [expect.stringContaining("termination denied")] }, processState: "running" });
    stop.mockRestore();
    expect((await child.cancel()).complete).toBe(true);
    expect(child.snapshot().outcome).toBe("cancelled");
  });

  it("reports an authenticated visible pane-close failure without touching Herdr", async () => {
    const child = new VisibleChild({ definition, instructions: "pane", cwd: here, model: "openai-codex/test", effort: "low", skills: [], origin: "cleanup-origin", retained: false, surface: "visible" }, join(here, "../extensions/subagent-child.ts"), join(here, ".."));
    const close = vi.fn().mockRejectedValueOnce(new Error("pane close denied"));
    Object.assign((child as any).record, { status: "settled", outcome: "complete", processState: "exited", paneId: "pane-1", paneState: "open" });
    Object.assign(child as any, { hostExited: true, layout: { close } });
    expect(await child.cancel()).toMatchObject({ complete: false, pane: "open", errors: [expect.stringContaining("pane close denied")] });
    close.mockResolvedValue(undefined);
    expect((await child.cancel()).complete).toBe(true);
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("attempts every child and keeps the owner for an explicit retry", async () => {
    const owner = runtime();
    const first = await launch(owner, "[hold]");
    const second = await launch(owner, "[hold]");
    await vi.waitFor(() => expect(owner.list().filter(record => record.processState === "running")).toHaveLength(2));
    for (const id of [first.id, second.id]) Object.assign(owner.get(id).record, { status: "settled", phase: "settled", outcome: "complete", result: "done" });
    const stop = vi.spyOn(owner.get(first.id) as any, "stopProcess").mockRejectedValueOnce(new Error("first termination denied"));
    const failed = await owner.shutdown("clear");
    expect(failed).toMatchObject({ complete: false, attempted: 2, failures: [{ id: first.id }] });
    expect(owner.get(first.id).record.processState).toBe("running");
    expect(owner.get(second.id).record.processState).toBe("exited");
    stop.mockRestore();
    expect(await owner.shutdown("clear")).toMatchObject({ complete: true });
  });

  it("does not replace the runtime or clean session when reset cleanup is unresolved", async () => {
    const fresh = await resetSubagentRuntime();
    const child = rpcChild("[hold]");
    Object.assign(child.record, { status: "settled", phase: "settled", outcome: "complete", processState: "running", process: { pid: 123, exitCode: null, signalCode: null } });
    (fresh as any).children.set(child.record.id, child);
    const stop = vi.spyOn(child as any, "stopProcess").mockRejectedValueOnce(new Error("reset termination denied"));
    const events = createEventBus(), handlers: Record<string, Function> = {}, commands: Record<string, any> = {};
    const pi: any = { events, on: (name: string, handler: Function) => { handlers[name] = handler; }, registerTool: () => {}, registerCommand: (name: string, command: any) => { commands[name] = command; }, sendMessage: () => {} };
    const ctx: any = { cwd: here, hasUI: true, isProjectTrusted: () => false, isIdle: () => true, sessionManager: { getSessionId: () => "cleanup-origin" }, ui: { notify: vi.fn() }, newSession: vi.fn() };
    subagents(pi); clearCommand(pi); await handlers.session_start({}, ctx);
    await commands.clear.handler("", ctx);
    expect(ctx.newSession).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("cleanup"), "error");
    expect(getSubagentRuntime()).toBe(fresh);
    stop.mockImplementation(async () => { child.record.processState = "exited"; });
    await commands.clear.handler("", ctx);
    expect(ctx.newSession).toHaveBeenCalledOnce();
    await handlers.session_shutdown({ reason: "quit" }, ctx);
  });

  it("does not duplicate a cancelled outcome when a later cleanup retry succeeds", async () => {
    const owner = runtime();
    const deliveries: unknown[] = [];
    owner.bind("cleanup-origin", { deliver: record => { deliveries.push(record); return true; } });
    const child = await launch(owner, "[hold]");
    await vi.waitFor(() => expect(owner.get(child.id).record.processState).toBe("running"));
    const stop = vi.spyOn(owner.get(child.id) as any, "stopProcess").mockRejectedValueOnce(new Error("retry later"));
    await owner.get(child.id).cancel();
    expect(deliveries).toHaveLength(1);
    stop.mockRestore();
    await owner.get(child.id).cancel();
    expect(deliveries).toHaveLength(1);
  });

  it("keeps user-owned visible children excluded from quit cleanup", async () => {
    const owner = runtime();
    const child = new VisibleChild({ definition, instructions: "user-owned", cwd: here, model: "openai-codex/test", effort: "low", skills: [], origin: "cleanup-origin", retained: false, surface: "visible" }, join(here, "../extensions/subagent-child.ts"), join(here, ".."));
    Object.assign((child as any).record, { userOwned: true, paneId: "pane-user", paneState: "open", processState: "running" });
    const cancel = vi.spyOn(child, "cancel");
    (owner as any).children.set(child.record.id, child);
    expect(await owner.shutdown("quit")).toMatchObject({ complete: true, attempted: 0 });
    expect(cancel).not.toHaveBeenCalled();
  });
});

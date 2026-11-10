import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createT3RoleRuntime } from "../lib/subagents/t3/bootstrap.ts";
import { getSubagentAuthority, resolveRoleSnapshot, SUBAGENT_AUTHORITY_EVENT } from "../lib/subagents/authority.ts";
import { createHandoffStore } from "../lib/subagents/t3/handoffs.ts";
import { createMockPi } from "./helpers/mock-pi.ts";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createEventBus } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/event-bus.js";
import { T3_ROLE_SNAPSHOT_ENTRY } from "../lib/subagents/t3/contracts.ts";
import { harness as damageControl } from "./damage-control/fixtures/fake-pi.ts";

const temporary: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true }); });
async function fixture(agent = "reader", tools = "read, subagent_parent") {
  vi.stubEnv("PI_SUBAGENT_AUTHORITY", "");
  const profile = mkdtempSync(join(tmpdir(), "pi-t3-bootstrap-")); temporary.push(profile);
  const cwd = join(profile, "project"); mkdirSync(cwd); mkdirSync(join(profile, "agents")); mkdirSync(join(profile, "skills", "testing"), { recursive: true });
  writeFileSync(join(profile, "skills", "testing", "SKILL.md"), "SELECTED_TESTING_SKILL");
  writeFileSync(join(profile, "agents", `${agent}.md`), `---\nname: ${agent}\ndescription: Inspect\ntools: [${tools}]\nmodel: fixture/reader\neffort: low\nskills: [testing]\n---\nFROZEN_ROLE_PROMPT`);
  const snapshot = resolveRoleSnapshot({ agent, backend: "t3", profile, cwd, projectTrusted: false });
  const store = createHandoffStore(profile);
  await store.create({ version: 1, launchId: "launch", snapshot, commissioner: { threadId: "parent", runId: "run", piSessionId: "parent-session", piSessionFile: "parent.jsonl", profile, cwd }, assignment: "/literal-assignment must not expand", workspace: { isolation: "shared", commissioningCwd: cwd } });
  let identity = { threadId: "child", parentThreadId: "parent", cwd };
  const metadata = { currentThread: vi.fn(async () => identity), capabilities: async () => ({}), thread: async () => ({}) };
  const mock = createMockPi();
  const events = createEventBus();
  const branch: Array<{ type: "custom"; customType: string; data: unknown }> = [];
  const pi = { ...mock, events, sendUserMessage: vi.fn(), setModel: vi.fn(async () => true), setThinkingLevel: vi.fn(), getThinkingLevel: () => "low", appendEntry: vi.fn((customType: string, data: unknown) => { branch.push({ type: "custom", customType, data }); }) };
  const ctx = { cwd, isIdle: () => true, isProjectTrusted: () => false, modelRegistry: { find: () => ({ provider: "fixture", id: "reader" }) }, sessionManager: { getSessionId: () => "session", getBranch: () => branch }, ui: { notify: vi.fn() }, abort: vi.fn() };
  mock.getAllTools.mockImplementation(() => ["read", "write", "codemode", "deferred_escape", "t3_role_parent", "mcp__t3__delegate_task"].map(name => ({ name, sourceInfo: { path: name.startsWith("mcp__") ? "/bridge.ts" : "/other.ts" }, exposure: name === "deferred_escape" ? "deferred" : "direct" })) as never);
  const runtime = createT3RoleRuntime(pi as unknown as ExtensionAPI, { profile, store, metadata, bridgePath: "/bridge.ts" });
  const emit = async (event: string, input: unknown = {}) => {
    let result: unknown;
    for (const hook of mock._getHook(event)) { const value = await hook.handler(input, ctx); if (value !== undefined) result = value; }
    return result;
  };
  const bootstrap = (id = "launch") => mock._commands.find(command => command.name === "t3-role-bootstrap")!.handler(id, ctx);
  await emit("session_start");
  return { pi, ctx, branch, runtime, emit, bootstrap, metadata, store, profile, cwd, setIdentity: (value: typeof identity) => { identity = value; } };
}
it("binds and persists before dispatch, with literal assignment and selected prompt/tools", async () => {
  const f = await fixture();
  await f.bootstrap();
  expect(f.pi.sendUserMessage).toHaveBeenCalledWith("/literal-assignment must not expand");
  expect(f.branch[0].customType).toBe(T3_ROLE_SNAPSHOT_ENTRY);
  expect(getSubagentAuthority(f.pi.events)?.agent).toBe("reader");
  const event = { systemPromptOptions: { sections: { caller: "UNRELATED_CALLER_CATALOG" }, skills: [{ name: "unrelated" }], selectedTools: ["write"] } };
  await f.emit("before_agent_start", event);
  expect(event.systemPromptOptions.selectedTools).toEqual(["read", "t3_role_parent"]);
  expect(event.systemPromptOptions.skills).toEqual([]);
  expect(JSON.stringify(event.systemPromptOptions.sections)).toContain("FROZEN_ROLE_PROMPT");
  expect(JSON.stringify(event.systemPromptOptions.sections)).toContain("SELECTED_TESTING_SKILL");
  expect(JSON.stringify(event.systemPromptOptions.sections)).not.toContain("UNRELATED_CALLER_CATALOG");
  expect(f.ctx.abort).not.toHaveBeenCalled();
});
it("denies undeclared, deferred, codemode and raw T3 calls independently of active loadout", async () => {
  const f = await fixture(); await f.bootstrap();
  for (const toolName of ["write", "deferred_escape", "codemode", "mcp__t3__delegate_task", "subagent"]) expect(await f.emit("tool_call", { toolName, toolCallId: toolName, input: {} })).toMatchObject({ block: true });
  expect(await f.emit("tool_call", { toolName: "read", toolCallId: "read", input: {} })).toBeUndefined();
  f.pi.setActiveTools(["read", "deferred_escape", "write"]);
  await f.emit("tool_result");
  expect(f.pi.getActiveTools()).toEqual(["read"]);
});
it("keeps generic raw T3 composition available to an unbound orchestrator", async () => {
  const f = await fixture();
  expect(await f.emit("tool_call", { toolName: "mcp__t3__delegate_task", toolCallId: "root/1", parentToolCallId: "root-codemode", input: { task: "generic delegation" } })).toBeUndefined();
});
it("grants only the exact nested operation, issued wrapper ID and arguments once", async () => {
  const f = await fixture(); await f.bootstrap();
  await expect(f.runtime.withOperation("forged", "delegate_task", {}, async () => {})).rejects.toThrow("scope");
  await f.emit("tool_call", { toolName: "t3_role_parent", toolCallId: "issued", input: {} });
  await f.runtime.withOperation("issued", "delegate_task", { task: "exact" }, async () => {
    const event = { toolName: "mcp__t3__delegate_task", toolCallId: "issued/1", parentToolCallId: "issued", input: { task: "other" } };
    expect(await f.emit("tool_call", event)).toMatchObject({ block: true });
    event.input.task = "exact";
    expect(await f.emit("tool_call", event)).toBeUndefined();
    expect(await f.emit("tool_call", event)).toMatchObject({ block: true });
  });
  expect(await f.emit("tool_call", { toolName: "mcp__t3__delegate_task", toolCallId: "issued/2", parentToolCallId: "issued", input: { task: "exact" } })).toMatchObject({ block: true });
});
it("restores durable authority in a fresh context and rejects copied history on an unrelated thread", async () => {
  const f = await fixture(); await f.bootstrap();
  // A restarted Pi reads JSON, unlike same-process reload which retains undefined keys.
  for (const entry of f.branch) entry.data = JSON.parse(JSON.stringify(entry.data));
  await f.emit("session_shutdown");
  expect(getSubagentAuthority(f.pi.events)).toBeUndefined();
  await f.emit("session_start");
  expect(getSubagentAuthority(f.pi.events)?.agent).toBe("reader");
  f.branch.splice(0);
  await f.emit("session_tree");
  expect(f.runtime.authority()?.agent).toBe("reader");
  expect(f.branch[0].customType).toBe(T3_ROLE_SNAPSHOT_ENTRY);
  f.setIdentity({ threadId: "unrelated", parentThreadId: "parent", cwd: f.cwd });
  await f.emit("session_tree");
  expect(f.runtime.authority()).toBeUndefined();
  expect(await f.emit("input", { text: "continue" })).toEqual({ action: "handled" });
  expect(await f.emit("tool_call", { toolName: "write", toolCallId: "w", input: {} })).toMatchObject({ block: true });
});
it("enforces Explorer inspection when Damage Control was initialized before bootstrap", async () => {
  vi.stubEnv("PI_SUBAGENT_AUTHORITY", "");
  const gate = await damageControl();
  const f = await fixture("explorer", "read, bash");
  gate.api.events.on(SUBAGENT_AUTHORITY_EVENT, (request: unknown) => {
    if (request && typeof request === "object" && "respond" in request && typeof request.respond === "function") request.respond(f.runtime.authority());
  });
  await f.bootstrap();
  gate.gate.setBypass(true);
  expect(await gate.emit("tool_call", { toolName: "bash", toolCallId: "inspect", input: { command: "git status --short" } })).toBeUndefined();
  expect(await gate.emit("tool_call", { toolName: "bash", toolCallId: "mutate", input: { command: "touch fixture" } })).toMatchObject({ block: true, reason: expect.stringContaining("mutation") });
});
it("dispatches no assignment for unknown handoff, metadata failure or unsupported settings", async () => {
  const f = await fixture(); await f.bootstrap("unknown"); expect(f.pi.sendUserMessage).not.toHaveBeenCalled();
  f.metadata.currentThread.mockRejectedValue(new Error("unavailable")); await f.bootstrap();
  expect(f.pi.sendUserMessage).not.toHaveBeenCalled();
  const g = await fixture(); g.pi.setModel.mockResolvedValue(false); await g.bootstrap();
  expect(g.pi.sendUserMessage).not.toHaveBeenCalled();
});

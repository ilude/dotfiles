import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getPlanRunRuntime, registerPlanRunTracking } from "../lib/plan-run-runtime.ts";

const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const completed = "---\nstatus: completed\n---\n# Plan\n\n- [x] work\n";
const command = "/do-it .specs/demo/plan.md";
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "plan-runtime-")); roots.push(root);
  const file = join(root, ".specs", "demo", "plan.md");
  mkdirSync(join(root, ".specs", "demo"), { recursive: true }); writeFileSync(file, "---\nstatus: active\n---\n# Plan\n\n- [ ] work\n");
  const runtime = getPlanRunRuntime(join(root, "profile"));
  const hooks = new Map<string, Function>();
  const pi = { on: (name: string, handler: Function) => hooks.set(name, handler) } as any;
  const ctx: any = { cwd: root, isIdle: () => true, sessionManager: { getSessionId: () => "session" }, ui: { notify: vi.fn() } };
  registerPlanRunTracking(pi, runtime);
  const emit = (name: string, event: any = {}) => hooks.get(name)?.(event, ctx);
  const deliver = () => emit("message_start", { message: { role: "user", content: [{ type: "text", text: "Execute the selected plan.\n\nInvocation arguments: .specs/demo/plan.md\n\nDo the work." }] } });
  return { root, file, runtime, ctx, emit, deliver };
}

it.each(["launching", "unknown"] as const)("adopts a %s reservation, reports the destination, and waits for actual delivery", state => {
  const f = fixture(); const run = f.runtime.store.claim(f.file, { pid: process.pid, state });
  vi.stubEnv("PI_PLANS_LAUNCH_TOKEN", run.token); vi.stubEnv("PI_PLANS_LAUNCH_PLAN", f.file);
  vi.stubEnv("HERDR_TAB_ID", "new-tab"); vi.stubEnv("HERDR_PANE_ID", "new-pane");
  f.emit("session_start", { reason: "startup" });
  expect(f.runtime.store.get(f.file)).toMatchObject({ token: run.token, state: "waiting", tabId: "new-tab", paneId: "new-pane" });
  expect(process.env.PI_PLANS_LAUNCH_TOKEN).toBeUndefined();
  f.emit("input", { text: command }); f.emit("agent_start");
  expect(f.runtime.store.get(f.file)?.state).toBe("waiting");
  f.deliver(); expect(f.runtime.store.get(f.file)?.state).toBe("running");
});

it.each([false, true])("blocks startup if adoption cannot be verified (storage failure=%s)", storageFailure => {
  const f = fixture(); vi.stubEnv("PI_PLANS_LAUNCH_TOKEN", "wrong"); vi.stubEnv("PI_PLANS_LAUNCH_PLAN", f.file);
  if (storageFailure) vi.spyOn(f.runtime.store, "get").mockImplementation(() => { throw new Error("Unreadable registry"); });
  f.emit("session_start", { reason: "startup" });
  expect(f.emit("input", { text: command })).toEqual({ action: "handled" });
  expect(f.ctx.ui.notify).toHaveBeenCalled();
});

it("keeps queued work reserved across unrelated retries and marks delivery within the same loop running", () => {
  const f = fixture(); const run = f.runtime.store.claim(f.file, { pid: process.pid, state: "waiting" }); f.runtime.track(run);
  f.emit("input", { text: command, streamingBehavior: "followUp", source: "extension" });
  f.emit("agent_start"); f.emit("message_start", { message: { role: "user", content: "Unrelated current prompt" } });
  f.emit("agent_settled"); expect(f.runtime.store.get(f.file)?.state).toBe("waiting");
  // Native follow-ups deliver user messages without another agent_start.
  f.deliver(); expect(f.runtime.store.get(f.file)?.state).toBe("running");
  f.emit("ui_prompt_start"); expect(f.runtime.store.get(f.file)?.state).toBe("blocked");
  f.emit("ui_prompt_end"); expect(f.runtime.store.get(f.file)?.state).toBe("running");
  f.ctx.isIdle = () => false; f.emit("agent_settled"); expect(f.runtime.store.get(f.file)?.state).toBe("running");
  f.ctx.isIdle = () => true; f.emit("agent_settled"); expect(f.runtime.store.get(f.file)).toBeUndefined();
  f.emit("agent_start"); expect(f.runtime.store.get(f.file)).toBeUndefined();
});

it.each([false, true])("releases delivered work regardless of saved plan status, including archived plans (archived=%s)", archived => {
  const f = fixture(); f.emit("input", { text: command });
  writeFileSync(f.file, completed); f.emit("agent_settled");
  expect(f.runtime.store.get(f.file)).toBeDefined(); // Not yet delivered.
  f.deliver();
  if (archived) { mkdirSync(join(f.root, ".specs", "archive")); renameSync(join(f.root, ".specs", "demo"), join(f.root, ".specs", "archive", "demo")); }
  f.emit("agent_settled"); expect(f.runtime.store.get(f.file)).toBeUndefined();
});

it("keeps ownership across reload and releases it on session replacement", () => {
  const f = fixture(); f.emit("input", { text: command }); f.deliver();
  f.emit("session_shutdown", { reason: "reload" });
  f.ctx.isIdle = () => false; f.emit("session_start", { reason: "reload" });
  expect(f.runtime.store.get(f.file)?.state).toBe("running");
  f.emit("session_shutdown", { reason: "new" }); expect(f.runtime.store.get(f.file)).toBeUndefined();
});

it("observes explicit manual invocations with either flag position without stealing another owner", () => {
  const f = fixture(); f.emit("input", { text: "/do-it --no-merge .specs/demo/plan.md" });
  const first = f.runtime.store.get(f.file)!; expect(first.state).toBe("waiting");
  f.emit("session_shutdown", { reason: "quit" });
  f.emit("input", { text: "/do-it .specs/demo/plan.md --no-merge" });
  expect(f.runtime.store.get(f.file)?.token).not.toBe(first.token);
  f.emit("session_shutdown", { reason: "quit" });
  const other = f.runtime.store.claim(f.file, { pid: process.pid, state: "running", tabId: "other-tab" });
  expect(f.emit("input", { text: command })).toBeUndefined();
  expect(f.runtime.store.get(f.file)?.token).toBe(other.token);
  f.emit("session_shutdown", { reason: "quit" }); expect(f.runtime.store.get(f.file)?.token).toBe(other.token);
});

it("retires superseded tracking without stale lifecycle errors", () => {
  const f = fixture(); const first = f.runtime.store.claim(f.file, { pid: process.pid, state: "running" }); f.runtime.track(first);
  const replacement = f.runtime.store.claim(f.file, { pid: process.pid, state: "running" }, { replace: true });
  expect(() => f.emit("agent_start")).not.toThrow();
  expect(f.runtime.store.get(f.file)?.token).toBe(replacement.token);
  expect(() => f.emit("agent_settled")).not.toThrow();
  expect(f.runtime.store.get(f.file)?.token).toBe(replacement.token);
});

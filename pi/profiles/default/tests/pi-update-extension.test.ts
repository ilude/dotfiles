import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

const mocks = vi.hoisted(() => ({ active: false, install: vi.fn(), peers: vi.fn(), restart: vi.fn(), release: vi.fn(), lock: vi.fn(), compatibility: vi.fn() }));
vi.mock("../lib/subagents/runtime.ts", () => ({ getSubagentRuntime: () => ({ hasActiveResources: () => mocks.active }) }));
vi.mock("../lib/profile-command.ts", () => ({ registerProfileCommand: (pi: ExtensionAPI, name: string, definition: Parameters<ExtensionAPI["registerCommand"]>[1]) => pi.registerCommand(name, definition) }));
vi.mock("../lib/pi-update.ts", async importOriginal => {
  const actual = await importOriginal<typeof import("../lib/pi-update.ts")>();
  return { ...actual, acquireUpdateLock: mocks.lock, runPiUpdatePass: mocks.install, restartConnectedSessions: mocks.peers, requestCooperativeRestart: mocks.restart };
});
vi.mock("../lib/pi-update-compat.ts", () => ({ createCompatibilityEndpoint: mocks.compatibility }));
import register from "../extensions/update.ts";

type Handler = (event: unknown, ctx: ExtensionContext) => unknown;
let shutdown: (() => unknown) | undefined;
const roots: string[] = [];
const originalSend = Object.getOwnPropertyDescriptor(process, "send");
const originalConnected = Object.getOwnPropertyDescriptor(process, "connected");
beforeEach(() => {
  vi.clearAllMocks(); mocks.active = false;
  mocks.install.mockResolvedValue({ installed: true, linked: true, version: "2.0.0" });
  mocks.peers.mockResolvedValue([{ label: "peer", status: "restarted" }]);
  mocks.restart.mockResolvedValue({ status: "skipped", reason: "fixture leaves the caller alive" });
  mocks.release.mockResolvedValue(undefined); mocks.lock.mockResolvedValue(mocks.release);
  Object.defineProperty(process, "send", { configurable: true, writable: true, value: vi.fn() });
  Object.defineProperty(process, "connected", { configurable: true, value: true });
  vi.stubEnv("PI_SUBAGENT_AUTHORITY", ""); vi.stubEnv("PI_HERDR_SUBAGENT", ""); vi.stubEnv("PI_HERDR_CLOSEOUT_SUCCESSOR", "");
  vi.stubEnv("HERDR_ENV", "");
  vi.stubEnv("PI_UPDATE_HOST_PID", String(process.ppid));
  vi.stubEnv("PI_UPDATE_ENDPOINT", JSON.stringify({ port: 1234, token: "a".repeat(64), pid: process.ppid, profile: resolve("fixture"), server: "", pane: "" }));
});
afterEach(() => {
  shutdown?.(); shutdown = undefined;
  if (originalSend) Object.defineProperty(process, "send", originalSend); else Reflect.deleteProperty(process, "send");
  if (originalConnected) Object.defineProperty(process, "connected", originalConnected); else Reflect.deleteProperty(process, "connected");
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "pi-update-extension-")); roots.push(root);
  const file = join(root, "session.jsonl"); writeFileSync(file, '{}\n');
  const handlers = new Map<string, Handler>();
  let command: Parameters<ExtensionAPI["registerCommand"]>[1] | undefined;
  const state = { idle: true, pending: false, editor: "", file: file as string | undefined, session: "exact-session" };
  const ctx = {
    mode: "tui", cwd: root, isIdle: () => state.idle, hasPendingMessages: () => state.pending,
    sessionManager: { getSessionFile: () => state.file, getSessionId: () => state.session, getLeafId: () => "selected-leaf" },
    ui: { getEditorText: () => state.editor, notify: vi.fn(), setStatus: vi.fn() }, shutdown: vi.fn(),
  };
  const api = {
    on: (name: string, handler: Handler) => handlers.set(name, handler),
    registerCommand: (_name: string, definition: Parameters<ExtensionAPI["registerCommand"]>[1]) => { command = definition; },
    registerEntryRenderer: vi.fn(), appendEntry: vi.fn(), events: { emit: vi.fn() },
  };
  register(api as unknown as ExtensionAPI);
  const event = (name: string, data: unknown = {}) => handlers.get(name)?.(data, ctx as unknown as ExtensionContext);
  const started = event("session_start");
  shutdown = () => event("session_shutdown");
  return { api, ctx, state, event, started, command: () => command!.handler("", ctx as unknown as ExtensionCommandContext) };
}

it.each(["busy", "queued", "unsent", "prompt", "subagents", "unsaved"])("skips %s sessions without requesting shutdown", async kind => {
  const f = fixture();
  if (kind === "busy") f.state.idle = false;
  if (kind === "queued") f.state.pending = true;
  if (kind === "unsent") f.state.editor = "draft";
  if (kind === "prompt") f.event("ui_prompt_start");
  if (kind === "subagents") mocks.active = true;
  if (kind === "unsaved") f.state.file = undefined;
  process.emit("message", { type: "pi-update:request", id: "request", version: "2.0.0" }, undefined);
  await vi.waitFor(() => expect(process.send).toHaveBeenCalledWith(expect.objectContaining({ type: "pi-update:skip", id: "request" }), undefined, undefined, expect.any(Function)));
  expect(f.ctx.shutdown).not.toHaveBeenCalled();
});

it("saves the branch marker and waits for host acceptance before orderly shutdown", async () => {
  const f = fixture();
  process.emit("message", { type: "pi-update:request", id: "request", version: "2.0.0" }, undefined);
  await vi.waitFor(() => expect(process.send).toHaveBeenCalledWith({ type: "pi-update:restart", id: "request", sessionFile: f.state.file, cwd: f.ctx.cwd }, undefined, undefined, expect.any(Function)));
  expect(f.api.events.emit).toHaveBeenCalledWith("default:update:prepare", undefined);
  expect(f.api.appendEntry).toHaveBeenCalledWith("pi-update-restart", { version: "2.0.0" });
  expect(f.ctx.shutdown).not.toHaveBeenCalled();
  process.emit("message", { type: "pi-update:accepted", id: "request" }, undefined);
  expect(f.ctx.shutdown).toHaveBeenCalledOnce();
});

it("rechecks eligibility when acceptance arrives and leaves a newly busy session untouched", async () => {
  const f = fixture();
  process.emit("message", { type: "pi-update:request", id: "request", version: "2.0.0" }, undefined);
  await vi.waitFor(() => expect(f.api.appendEntry).toHaveBeenCalled());
  f.state.editor = "new draft";
  process.emit("message", { type: "pi-update:accepted", id: "request" }, undefined);
  expect(f.ctx.shutdown).not.toHaveBeenCalled();
  expect(process.send).toHaveBeenLastCalledWith(expect.objectContaining({ type: "pi-update:skip" }), undefined, undefined, expect.any(Function));
});

it("reports peers before requesting the invoking session last and releases the update lock first", async () => {
  const f = fixture(); await f.command();
  expect(mocks.install).toHaveBeenCalledOnce(); expect(mocks.peers).toHaveBeenCalledOnce(); expect(mocks.restart).toHaveBeenCalledOnce();
  const summaryOrder = f.api.appendEntry.mock.invocationCallOrder[0];
  expect(summaryOrder).toBeGreaterThan(mocks.peers.mock.invocationCallOrder[0]);
  expect(mocks.release.mock.invocationCallOrder[0]).toBeLessThan(mocks.restart.mock.invocationCallOrder[0]);
  expect(summaryOrder).toBeLessThan(mocks.restart.mock.invocationCallOrder[0]);
});

it("does not restart any sessions when installation or linking fails", async () => {
  mocks.install.mockResolvedValue({ installed: true, linked: false, error: "link failed" });
  const f = fixture(); await f.command();
  expect(mocks.peers).not.toHaveBeenCalled(); expect(mocks.restart).not.toHaveBeenCalled(); expect(mocks.release).toHaveBeenCalledOnce();
});

it("does not mutate the installation for an unsupervised native launch", async () => {
  vi.stubEnv("PI_UPDATE_ENDPOINT", "");
  const f = fixture(); await f.command();
  expect(mocks.install).not.toHaveBeenCalled(); expect(mocks.restart).not.toHaveBeenCalled();
  expect(f.ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Outside Herdr"), "warning");
});

it("loads migration support in an existing Herdr process without a supervisor", async () => {
  vi.stubEnv("PI_UPDATE_ENDPOINT", ""); vi.stubEnv("HERDR_ENV", "1");
  vi.stubEnv("HERDR_SOCKET_PATH", "isolated-fixture"); vi.stubEnv("HERDR_PANE_ID", "old-pane");
  const close = vi.fn().mockResolvedValue(undefined);
  mocks.compatibility.mockResolvedValue({ endpoint: { port: 1234, token: "a".repeat(64), pid: process.pid, profile: resolve("fixture"), server: "", pane: "old-pane" }, close });
  const f = fixture(); await f.started;
  expect(mocks.compatibility).toHaveBeenCalledOnce();
  expect(process.send).not.toHaveBeenCalled();
  await f.command();
  expect(mocks.install).toHaveBeenCalledOnce(); expect(mocks.restart).toHaveBeenCalledOnce();
  await f.event("session_shutdown", { reason: "reload" });
  expect(close).toHaveBeenCalledOnce();
});

it("removes IPC listeners on shutdown or reload", () => {
  const before = process.listenerCount("message"), f = fixture();
  expect(process.listenerCount("message")).toBe(before + 1);
  f.event("session_shutdown", { reason: "reload" });
  expect(process.listenerCount("message")).toBe(before);
});

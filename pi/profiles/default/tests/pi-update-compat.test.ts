import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";
import { afterEach, expect, it, vi } from "vitest";
import { createCompatibilityEndpoint, restartCurrentPiSession } from "../lib/pi-update-compat.ts";
import type { UpdateEndpoint } from "../lib/pi-update.ts";
// @ts-expect-error Executable JS is outside this TS project.
import { admitMigration, waitForOriginExit } from "../../../scripts/pi-update-migration.mjs";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
function exchange(endpoint: UpdateEndpoint, message: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((accept, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: endpoint.port });
    let buffer = "";
    socket.setTimeout(5000, () => socket.destroy(new Error("Fixture exchange timed out")));
    socket.once("error", reject);
    socket.once("connect", () => socket.write(JSON.stringify({ token: endpoint.token, ...message }) + "\n"));
    socket.on("data", chunk => { buffer += String(chunk); });
    socket.once("end", () => { try { accept(JSON.parse(buffer)); } catch { reject(new Error("Invalid fixture response")); } });
  });
}

async function fixture(reason?: string) {
  const root = await mkdtemp(join(tmpdir(), "pi-compat-test-"));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const sessionFile = join(root, "session.jsonl");
  await writeFile(sessionFile, JSON.stringify({ type: "session", id: "exact-session", cwd: root }) + "\n");
  const state = { reason };
  const cli = vi.fn(async (args: string[]) => {
    if (args[0] === "pane" && args[1] === "current") return JSON.stringify({ result: { pane: { pane_id: "old-pane", tab_id: "same-tab", workspace_id: "same-workspace", terminal_id: "old-terminal" } } });
    if (args[0] === "pane" && args[1] === "get") return JSON.stringify({ result: { pane: { pane_id: "old-pane", label: "my pane" } } });
    if (args[0] === "plugin") return JSON.stringify({ result: { pane: { pane_id: "new-pane", tab_id: args.includes("tab") ? "new-tab" : "same-tab", workspace_id: "same-workspace" } } });
    throw new Error("Unexpected CLI operation");
  });
  const shutdown = vi.fn();
  const prepare = vi.fn(async () => ({ sessionFile, sessionId: "exact-session", cwd: root }));
  const controller = await createCompatibilityEndpoint({ profile: root, env: { HERDR_SOCKET_PATH: "fixture-server", HERDR_PANE_ID: "old-pane" }, sessionId: "exact-session", cli,
    eligibility: () => state.reason, prepare, shutdown, directory: root });
  cleanup.push(controller.close);
  return { root, controller, cli, shutdown, prepare, sessionFile, state };
}

it("requests a new-tab restart using the installed global version without running an update", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-installed-version-")); cleanup.push(() => rm(root, { recursive: true, force: true }));
  const packageDir = join(root, "node_modules", "@earendil-works", "pi-coding-agent");
  await mkdir(packageDir, { recursive: true });
  await writeFile(join(packageDir, "package.json"), JSON.stringify({ version: "9.8.7" }));
  const received: Record<string, unknown>[] = [];
  const server = net.createServer(socket => {
    let input = "";
    socket.on("data", chunk => { input += String(chunk); if (input.includes("\n")) {
      received.push(JSON.parse(input)); socket.end(JSON.stringify({ status: "restarted", version: "9.8.7" }) + "\n");
    } });
  });
  await new Promise<void>(accept => server.listen(0, "127.0.0.1", accept));
  cleanup.push(() => new Promise<void>(accept => server.close(() => accept())));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Fixture endpoint unavailable");
  const result = await restartCurrentPiSession({ PI_CODING_AGENT_DIR: root, PI_UPDATE_ENDPOINT: JSON.stringify({ port: address.port, token: "a".repeat(64), pid: process.pid, profile: root, server: "fixture-server", pane: "" }) }, async () => "9.8.7");
  expect(result).toEqual({ status: "restarted", version: "9.8.7" });
  expect(received[0]).toMatchObject({ action: "restart", mode: "new-tab", version: "9.8.7" });
});

it("creates a new-tab replacement without opening the conversation until bootstrap admission", async () => {
  const f = await fixture();
  const request = exchange(f.controller.endpoint, { action: "restart", version: "2.0.0", mode: "new-tab" });
  await vi.waitFor(() => expect(f.cli).toHaveBeenCalledWith(expect.arrayContaining(["plugin", "pane", "open"])));
  expect(f.shutdown).not.toHaveBeenCalled();
  const args = f.cli.mock.calls.find(call => call[0][0] === "plugin")![0];
  expect(args).toEqual(expect.arrayContaining(["--placement", "tab", "--workspace", "same-workspace", "PI_HERDR_SESSION_FILE=", "PI_UPDATE_PANE_LABEL=my pane"]));
  expect(args.some(arg => arg.includes(f.sessionFile))).toBe(false);
  const replacement = { ...f.controller.endpoint, pid: process.pid + 1, pane: "new-pane" };
  const admission = await exchange(f.controller.endpoint, { action: "admit", endpoint: replacement });
  expect(admission).toMatchObject({ sessionFile: f.sessionFile, sessionId: "exact-session", cwd: f.root, version: "2.0.0", originPid: process.pid, origin: { pane_id: "old-pane", tab_id: "same-tab" } });
  await expect(request).resolves.toMatchObject({ status: "handoff", endpoint: { ...replacement, sessionId: "exact-session" } });
  await vi.waitFor(() => expect(f.shutdown).toHaveBeenCalledOnce());
});

it("skips a busy old session without creating a replacement or shutting down", async () => {
  const f = await fixture("subagents are active or retained");
  await expect(exchange(f.controller.endpoint, { action: "restart", version: "2.0.0" })).resolves.toMatchObject({ status: "skipped", reason: "subagents are active or retained" });
  expect(f.prepare).not.toHaveBeenCalled(); expect(f.cli).not.toHaveBeenCalled(); expect(f.shutdown).not.toHaveBeenCalled();
});

it("retains the old session if eligibility changes before the replacement admits itself", async () => {
  const f = await fixture();
  const request = exchange(f.controller.endpoint, { action: "restart", version: "2.0.0" });
  await vi.waitFor(() => expect(f.cli).toHaveBeenCalledTimes(3));
  f.state.reason = "editor contains unsent text";
  const replacement = { ...f.controller.endpoint, pid: process.pid + 1, pane: "new-pane" };
  await expect(exchange(f.controller.endpoint, { action: "admit", endpoint: replacement })).resolves.toMatchObject({ error: "editor contains unsent text" });
  await expect(request).resolves.toMatchObject({ status: "skipped" });
  expect(f.shutdown).not.toHaveBeenCalled();
});

it("rejects a wrong session file before opening a replacement", async () => {
  const f = await fixture(); await writeFile(f.sessionFile, JSON.stringify({ type: "session", id: "other-session" }) + "\n");
  await expect(exchange(f.controller.endpoint, { action: "restart", version: "2.0.0" })).resolves.toMatchObject({ status: "failed", reason: "Saved session identity does not match" });
  expect(f.cli).not.toHaveBeenCalled(); expect(f.shutdown).not.toHaveBeenCalled();
});

it("does not begin replacement while the original process remains alive", async () => {
  let alive = true;
  const delay = vi.fn(async () => { alive = false; });
  await waitForOriginExit(1234, { alive: () => alive, delay });
  expect(delay).toHaveBeenCalledOnce();
  await expect(waitForOriginExit(1234, { alive: () => true, timeoutMs: 0 })).rejects.toThrow("Original Pi did not exit");
});

it("waits for original exit before retiring its old pane and returning exact resume arguments", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-migration-admit-")); cleanup.push(() => rm(root, { recursive: true, force: true }));
  const originPid = process.pid + 100;
  const server = net.createServer(socket => socket.once("data", () => socket.end(JSON.stringify({ sessionFile: join(root, "session.jsonl"), sessionId: "exact-session", cwd: root, version: "2.0.0", originPid,
    origin: { pane_id: "old-pane", tab_id: "same-tab", workspace_id: "same-workspace", terminal_id: "old-terminal" } }) + "\n")));
  await new Promise<void>(accept => server.listen(0, "127.0.0.1", accept));
  cleanup.push(() => new Promise<void>(accept => server.close(() => accept())));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Fixture endpoint unavailable");
  const old = { port: address.port, token: "a".repeat(64), pid: originPid };
  const events: string[] = [];
  const run = vi.fn((_bin: string, args: string[]) => {
    events.push(args[1]);
    return { status: 0, stdout: args[1] === "list" ? JSON.stringify({ result: { panes: [{ pane_id: "old-pane", tab_id: "same-tab", terminal_id: "old-terminal" }] } }) : "" };
  });
  const wait = vi.fn(async (pid: number) => { expect(pid).toBe(originPid); events.push("exit-observed"); });
  const resumed = await admitMigration(JSON.stringify(old), { pane: "new-pane" }, { PI_UPDATE_PANE_LABEL: "my pane" }, { run, wait });
  expect(events).toEqual(["exit-observed", "list", "close", "rename"]);
  expect(resumed).toEqual({ args: ["--session", join(root, "session.jsonl")], cwd: root, sessionId: "exact-session" });
});

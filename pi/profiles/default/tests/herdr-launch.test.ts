import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
// @ts-expect-error The repository bootstrap is executable JavaScript outside this TS project.
import { reportInitialAgentPresence } from "../../../scripts/pi-herdr-launch.mjs";
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

it("reports a newly bootstrapped plugin pane to Herdr's agent list", async () => {
  const socket = Object.assign(new EventEmitter(), { write: vi.fn(), destroy: vi.fn() });
  const connect = vi.fn(() => socket);
  const pending = reportInitialAgentPresence({ HERDR_ENV: "1", HERDR_PLUGIN_ID: "local.pi", HERDR_SOCKET_PATH: "fixture.sock", HERDR_PANE_ID: "w1:p2" }, connect);
  expect(connect).toHaveBeenCalledOnce();
  socket.emit("connect");
  const request = JSON.parse(String(socket.write.mock.calls[0][0]).trim());
  expect(request).toMatchObject({ method: "pane.report_agent", params: { pane_id: "w1:p2", source: "herdr:pi", agent: "pi", state: "idle" } });
  socket.emit("data", Buffer.from(JSON.stringify({ id: request.id, result: { type: "ok" } }).slice(0, 20)));
  socket.emit("data", Buffer.from(`${JSON.stringify({ id: request.id, result: { type: "ok" } }).slice(20)}\n`));
  await expect(pending).resolves.toBe(true);
  expect(socket.destroy).toHaveBeenCalledOnce();
});

it("rejects API errors and keeps initial Herdr registration best-effort", async () => {
  let calls = 0;
  const connect = vi.fn(() => {
    calls++;
    if (calls === 1) {
      const socket = Object.assign(new EventEmitter(), { write: vi.fn(), destroy: vi.fn() });
      queueMicrotask(() => {
        socket.emit("connect");
        const request = JSON.parse(String(socket.write.mock.calls[0][0]).trim());
        socket.emit("data", Buffer.from(`${JSON.stringify({ id: request.id, error: { code: "not_ready" } })}\n`));
      });
      return socket;
    }
    throw new Error("invalid socket");
  });
  await expect(reportInitialAgentPresence({ HERDR_ENV: "1", HERDR_PLUGIN_ID: "local.pi", HERDR_SOCKET_PATH: "bad", HERDR_PANE_ID: "w1:p2" }, connect)).resolves.toBe(false);
  await expect(reportInitialAgentPresence({ HERDR_ENV: "0" }, connect)).resolves.toBe(false);
  expect(connect).toHaveBeenCalledTimes(4);
});
it.each([true, false])("real Node bootstrap preserves argv/env and preflight (valid=%s)", valid => {
  const root = mkdtempSync(join(tmpdir(), "herdr launch ")); roots.push(root);
  const profile = join(root, "default"); mkdirSync(join(profile, "extensions/damage-control"), { recursive: true });
  writeFileSync(join(profile, "extensions/damage-control/index.js"), valid ? "export default function() {}" : "export default { broken");
  const session = join(root, "branch session.jsonl"); writeFileSync(session, "{}");
  const entry = join(root, "fixture.mjs");
  writeFileSync(entry, "console.log(JSON.stringify({args:process.argv.slice(2),profile:process.env.PI_CODING_AGENT_DIR,pane:process.env.HERDR_PANE_ID,leaked:process.env.PI_HERDR_SESSION_FILE}))");
  const run = spawnSync(process.execPath, [resolve("../../../scripts/pi-herdr-launch.mjs"), entry], { env: { ...process.env, PI_HERDR_PROFILE_DIR: profile, PI_HERDR_SESSION_FILE: session, HERDR_PANE_ID: "new-pane", HERDR_PLUGIN_ID: "" }, encoding: "utf8" });
  expect(run.status, run.stderr).toBe(0);
  const data = JSON.parse(run.stdout);
  expect(data.args).toEqual([...(valid ? [] : ["--no-tools", "--no-extensions"]), "--session", session]);
  expect(data.profile).toBe(profile); expect(data.pane).toBe("new-pane"); expect(data.leaked).toBeUndefined();
});
it("constructs a constrained do-it message for a direct-child plan", () => {
  const root = mkdtempSync(join(tmpdir(), "herdr plan ")); roots.push(root);
  const profile = join(root, "fixture"); mkdirSync(profile);
  mkdirSync(join(root, ".specs", "space-plan"), { recursive: true }); writeFileSync(join(root, ".specs", "space-plan", "plan.md"), "# Plan");
  const entry = join(root, "entry.mjs"); writeFileSync(entry, "console.log(JSON.stringify({args:process.argv.slice(2),leaked:process.env.PI_HERDR_PLAN_PATH}))");
  const run = spawnSync(process.execPath, [resolve("../../../scripts/pi-herdr-launch.mjs"), entry], { cwd: root, env: { ...process.env, PI_HERDR_PROFILE_DIR: profile, PI_HERDR_SESSION_FILE: "", PI_HERDR_PLAN_PATH: ".specs/space-plan/plan.md", HERDR_PLUGIN_ID: "" }, encoding: "utf8" });
  expect(run.status, run.stderr).toBe(0); expect(JSON.parse(run.stdout)).toEqual({ args: ["/do-it .specs/space-plan/plan.md"] });
});
it.each(["../plan.md", ".specs/archive/old/plan.md", ".specs/missing/plan.md"])("rejects unsafe plan launch input: %s", plan => {
  const root = mkdtempSync(join(tmpdir(), "herdr unsafe ")); roots.push(root); const profile = join(root, "fixture"); mkdirSync(profile);
  const entry = join(root, "entry.mjs"); writeFileSync(entry, "");
  const run = spawnSync(process.execPath, [resolve("../../../scripts/pi-herdr-launch.mjs"), entry], { cwd: root, env: { ...process.env, PI_HERDR_PROFILE_DIR: profile, PI_HERDR_PLAN_PATH: plan, HERDR_PLUGIN_ID: "" }, encoding: "utf8" });
  expect(run.status).toBe(1);
});
it("rejects arbitrary launch flags and nonabsolute session inputs", () => {
  const run = spawnSync(process.execPath, [resolve("../../../scripts/pi-herdr-launch.mjs"), "--extension", "bad"], { encoding: "utf8" });
  expect(run.status).toBe(1);
  expect(run.stderr).toContain("setup-owned");
});
it.each(["local.pi", "unrelated"])("retires only its plugin pane on exit (%s)", plugin => {
  const root = mkdtempSync(join(tmpdir(), "herdr exit ")); roots.push(root);
  const profile = join(root, "fixture"); mkdirSync(profile);
  const calls = join(root, "calls.json"); const entry = join(root, "entry.mjs");
  // Intercept only the external CLI boundary in the disposable child. No
  // request can reach a real Herdr session, even if interception fails.
  writeFileSync(entry, `import cp from 'node:child_process';import{syncBuiltinESMExports}from'node:module';import{writeFileSync}from'node:fs';cp.spawnSync=(bin,args)=>{writeFileSync(${JSON.stringify(calls)},JSON.stringify({bin,args}));return {status:0};};syncBuiltinESMExports();`);
  const run = spawnSync(process.execPath, [resolve("../../../scripts/pi-herdr-launch.mjs"), entry], { env: { ...process.env, PI_HERDR_PROFILE_DIR: profile, PI_HERDR_SESSION_FILE: "", HERDR_PLUGIN_ID: plugin, HERDR_SOCKET_PATH: "fixture-only", HERDR_PANE_ID: "fixture-pane", HERDR_BIN_PATH: "nonexistent-fixture-cli" }, encoding: "utf8" });
  expect(run.status, run.stderr).toBe(0);
  if (plugin === "local.pi") expect(JSON.parse(readFileSync(calls, "utf8")).args).toEqual(["plugin", "pane", "close", "fixture-pane"]);
  else expect(existsSync(calls)).toBe(false);
});

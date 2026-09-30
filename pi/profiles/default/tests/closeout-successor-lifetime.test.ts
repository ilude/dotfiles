import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { loadDefinitions } from "../lib/subagents/definitions.ts";
import type { LaunchSpec } from "../lib/subagents/rpc.ts";
import { requestParent, type ChildEndpoint } from "../lib/subagents/transport.ts";
import { admitSuccessor, successorLaunch } from "../lib/subagents/successor-launch.ts";
import { successorSystemPrompt } from "../lib/subagents/successor-surface.ts";

const profile = resolve(import.meta.dirname, "..");
const fixtures = resolve(import.meta.dirname, "fixtures");
const scratch: string[] = [];
const processes = new Set<number>();
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function until<T>(read: () => T | undefined | Promise<T | undefined>, timeout = 45_000): Promise<T> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await read(); if (value !== undefined) return value; await delay(25); }
  throw new Error("Process fixture deadline exceeded");
}
function json<T>(path: string): T | undefined { try { return JSON.parse(readFileSync(path, "utf8")); } catch { return undefined; } }
function spec(cwd: string): LaunchSpec {
  const definition = loadDefinitions(profile, false, profile).agents.get("integrator")!;
  return { definition, instructions: "fixture initial assignment", cwd, model: "fixture/model", effort: "high", skills: [resolve(profile, "skills/plan-integration/SKILL.md")], origin: "fixture-origin", retained: true, surface: "visible", closeoutParentSessionId: "fixture-origin", closeoutManifest: { repositoryRoot: cwd, targetCheckout: cwd, targetBranch: "origin", taskWorktree: join(cwd, ".worktrees/task"), taskBranch: "task/task", taskCommit: "a".repeat(40), archivedPlanPath: ".specs/archive/task/plan.md", activeSpecStub: "task", noMerge: false, completedDate: "2026-09-30", integrationEvidence: "fixture" } };
}
function directory() { const path = realpathSync(mkdtempSync(join(tmpdir(), "pi-successor-lifetime-"))); scratch.push(path); return path; }
function exited(child: ChildProcess) { return new Promise<number | null>((resolveExit, reject) => { child.once("error", reject); child.once("close", resolveExit); }); }
afterEach(async () => {
  for (const pid of processes) if (alive(pid)) {
    if (process.platform === "win32") { try { execFileSync("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore", timeout: 5000 }); } catch { /* Already exited. */ } }
    else { try { process.kill(pid, "SIGTERM"); } catch { /* Already exited. */ } }
  }
  processes.clear();
  for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

async function fixture(mode: "successor" | "ordinary") {
  const cwd = directory(), input = join(cwd, "spec.json"), hostFile = join(cwd, "host.json"), appFile = join(cwd, "app.json");
  writeFileSync(input, JSON.stringify(spec(cwd)));
  const env: NodeJS.ProcessEnv = { ...process.env };
  // These process fixtures have no Herdr pane. Inherited live identities would
  // let the ordinary host's genuine parent-loss cleanup retire the test runner.
  for (const key of Object.keys(env)) {
    if (key.startsWith("HERDR_") || key.startsWith("PI_HERDR_") || key.startsWith("PI_SUBAGENT_") || key.startsWith("PI_CLOSEOUT_")) delete env[key];
  }
  const origin = spawn(process.execPath, [join(fixtures, "successor-process-origin.mjs"), profile, input, hostFile, appFile, mode], { env, stdio: ["ignore", "pipe", "pipe"], shell: false });
  let diagnostic = ""; origin.stderr!.on("data", chunk => diagnostic += String(chunk));
  const originExit = exited(origin);
  processes.add(origin.pid!);
  void originExit.then(() => processes.delete(origin.pid!));
  const host = await until(() => {
    const launched = json<{ hostPid: number }>(`${hostFile}.launch`);
    if (launched) processes.add(launched.hostPid);
    const found = json<{ hostPid: number; appEndpoint: ChildEndpoint; controlEndpoint: ChildEndpoint }>(hostFile);
    if (found) return found;
    let stderr = ""; try { stderr = readFileSync(`${hostFile}.stderr`, "utf8"); } catch { /* Not started. */ }
    if (stderr) throw new Error(stderr);
    return undefined;
  });
  processes.add(host.hostPid);
  const app = await until(() => json<{ pid: number; authority: { agent: string; delegates: string[] }; endpoint: ChildEndpoint; admissionEnv?: string }>(appFile));
  processes.add(app.pid);
  expect(await originExit, diagnostic).toBe(0);
  expect(alive(origin.pid!)).toBe(false);
  return { host, app, diagnostic: readFileSync(`${hostFile}.stderr`, "utf8") + JSON.stringify({ hostExit: json(`${appFile}.host-exit`), appExit: json(`${appFile}.app-exit`), hostAlive: alive(host.hostPid), appPid: app.pid }) };
}

describe("restricted closeout successor process ownership", () => {
  it("retains authenticated authority and direct input after the real origin exits; successor exit closes its host endpoint", async () => {
    const { host, app, diagnostic } = await fixture("successor");
    expect(alive(app.pid), diagnostic).toBe(true);
    expect(alive(host.hostPid)).toBe(true);
    expect(app.authority.agent).toBe("integrator");
    expect(app.authority.delegates).toEqual([]);
    expect(app.admissionEnv).toBeUndefined();
    expect(app.endpoint).toEqual(host.appEndpoint);
    await requestParent(host.controlEndpoint, { type: "message", payload: "fixture-input" });
    await until(async () => {
      const state = await requestParent(host.controlEndpoint, { type: "inspect" }) as { phase: string; result?: string };
      return state.phase === "settled" && state.result === "fixture accepted input" ? true : undefined;
    });
    expect(alive(app.pid)).toBe(true); // Settlement does not retire the successor.
    await requestParent(host.controlEndpoint, { type: "message", payload: "fixture-exit" });
    await until(() => !alive(app.pid) ? true : undefined);
    await until(() => !alive(host.hostPid) ? true : undefined);
    await expect(requestParent(host.controlEndpoint, { type: "inspect" })).rejects.toThrow();
  }, 75_000);

  it("ordinary visible host still terminates its actual child on origin loss", async () => {
    const { host, app } = await fixture("ordinary");
    await until(() => !alive(app.pid) ? true : undefined);
    await until(() => !alive(host.hostPid) ? true : undefined);
  }, 75_000);

  it("admits only bounded Integrator authority and loads the dedicated application instead of ordinary child semantics", () => {
    const cwd = directory(), launch = spec(cwd);
    const endpoint: ChildEndpoint = { child: "successor", run: "run", origin: launch.origin, token: "a".repeat(64), port: 1 };
    const admitted = admitSuccessor({ profile, spec: launch }, profile, endpoint);
    const config = successorLaunch(admitted, profile, endpoint);
    expect(config.args.some(arg => arg.endsWith("closeout-successor.ts"))).toBe(true);
    expect(config.args.some(arg => arg.endsWith("subagent-child.ts"))).toBe(false);
    expect(config.args).toContain("--no-extensions");
    expect(config.args).not.toContain("--mode");
    expect(() => admitSuccessor({ profile, spec: { ...launch, definition: { ...launch.definition, name: "developer" } } }, profile, endpoint)).toThrow();
    expect(() => admitSuccessor({ profile, spec: { ...launch, closeoutManifest: { ...launch.closeoutManifest, noMerge: true } } }, profile, endpoint)).toThrow();
    expect(() => admitSuccessor({ profile, spec: { ...launch, definition: { ...launch.definition, tools: [...launch.definition.tools, "subagent"] } } }, profile, endpoint)).toThrow();
    const prompt = successorSystemPrompt("base", admitted.definition.tools, "successor role guidance", admitted.closeoutManifest!);
    expect(prompt).toContain("ask consequential questions here");
    expect(prompt).not.toContain("do not prompt the user directly");
    expect(prompt).not.toContain("Report consequential decisions to the parent");
    expect(prompt).toBe(successorSystemPrompt("base", admitted.definition.tools, "successor role guidance", admitted.closeoutManifest!));
    expect(Buffer.byteLength(prompt)).toBeLessThan(4000);
  });
});

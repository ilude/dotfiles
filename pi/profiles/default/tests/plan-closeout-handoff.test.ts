import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { CloseoutSuccessorHandoff, observeOriginRetirement, type OriginRetirementIdentity } from "../lib/subagents/closeout-handoff.ts";
import { ChildTransport, requestParent, type ChildEndpoint } from "../lib/subagents/transport.ts";
import type { HerdrCli } from "../lib/herdr-cli.ts";
import { loadDefinitions } from "../lib/subagents/definitions.ts";
import type { LaunchSpec } from "../lib/subagents/rpc.ts";

const profile = fileURLToPath(new URL("../", import.meta.url));
const root = resolve(profile, "../../..");
const origin: OriginRetirementIdentity = { sessionId: "origin-session", pid: process.pid, paneId: "w1:p1", tabId: "w1:t1", workspaceId: "w1", terminalId: "terminal-1" };
const json = (result: unknown) => JSON.stringify({ result });
const closes: Array<() => Promise<void>> = [];
afterEach(async () => { await Promise.all(closes.splice(0).map(close => close())); });
function spec(): LaunchSpec {
  return { definition: loadDefinitions(profile, false, profile).agents.get("integrator")!, instructions: "Perform staged authorized closeout.", cwd: root, model: "openai-codex/gpt-5.6-luna", effort: "high", skills: [resolve(profile, "skills/plan-integration/SKILL.md")], origin: origin.sessionId, retained: true, surface: "visible", closeoutParentSessionId: origin.sessionId,
    closeoutManifest: { repositoryRoot: root, targetCheckout: root, targetBranch: "main", taskWorktree: resolve(root, ".worktrees/fixture"), taskBranch: "task/fixture", taskCommit: "a".repeat(40), archivedPlanPath: ".specs/archive/fixture/plan.md", activeSpecStub: "fixture", noMerge: false, completedDate: "2026-09-30", integrationEvidence: "checks passed" } };
}
function fixture() {
  let admission: ChildEndpoint | undefined;
  let released = false, integrationReady = false;
  const calls: string[][] = [];
  const control = new ChildTransport(async (_identity, message) => {
    if (message.type === "inspect") return { integrationReady, released };
    if (message.type === "message") return { accepted: true };
    if (message.type === "release") { if (!integrationReady) throw new Error("Integration-ready successor required"); released = true; return { accepted: true }; }
    throw new Error("unsupported");
  });
  closes.push(() => control.close());
  const cli: HerdrCli = async args => {
    calls.push(args);
    if (args[0] === "plugin" && args[1] === "list") return json({ plugins: [{ plugin_id: "local.pi", panes: [{ id: "pi", command: [process.execPath, resolve(root, "scripts/pi-herdr-launch.mjs"), "pi"] }] }] });
    if (args[0] === "pane" && args[1] === "current") return json({ pane: { pane_id: origin.paneId, tab_id: origin.tabId, workspace_id: origin.workspaceId, terminal_id: origin.terminalId } });
    if (args[0] === "plugin") {
      const raw = args.find(arg => arg.startsWith("PI_HERDR_SUCCESSOR_ADMISSION_ENDPOINT="))!;
      admission = JSON.parse(raw.slice(raw.indexOf("=") + 1));
      const bootstrap = await requestParent(admission!, { type: "bootstrap" });
      expect(bootstrap).toMatchObject({ originRetirement: origin, profile: resolve(profile) });
      const controlEndpoint = await control.register({ child: "control", run: "run", origin: origin.sessionId });
      const appEndpoint = await control.register({ child: "app", run: "run", origin: origin.sessionId });
      await requestParent(admission!, { type: "successor-host-started", payload: { hostPid: process.pid, controlEndpoint, appEndpoint } });
      return json({ plugin_pane: { pane: { pane_id: "w1:p2", tab_id: origin.tabId, workspace_id: origin.workspaceId } } });
    }
    return "";
  };
  return { cli, calls, admission: () => admission!, ready: () => { integrationReady = true; }, released: () => released };
}

describe("same-tab closeout handoff", () => {
  it("uses parent cwd and a nonfocused same-tab split, never the ordinary overflow layout or tab naming", async () => {
    const f = fixture(); const notices: unknown[] = [];
    const handoff = new CloseoutSuccessorHandoff(f.cli, (_owner, kind, evidence) => notices.push({ kind, evidence })); closes.push(() => handoff.close());
    const record = await handoff.launch(spec(), profile, origin.sessionId);
    expect(record).toMatchObject({ paneId: "w1:p2", tabId: origin.tabId, cwd: root, phase: "available" });
    const launch = f.calls.find(args => args[0] === "plugin" && args[1] === "pane")!;
    expect(launch).toContain("--no-focus"); expect(launch).toContain("PI_HERDR_CLOSEOUT_SUCCESSOR=1");
    expect(launch.slice(launch.indexOf("--target-pane"), launch.indexOf("--target-pane") + 4)).toEqual(["--target-pane", origin.paneId, "--cwd", root]);
    expect(f.calls.some(args => args[0] === "tab")).toBe(false);
    await requestParent(f.admission(), { type: "successor-integration-ready", payload: { outcome: "INTEGRATION READY" } });
    expect(notices).toEqual([{ kind: "successor-integration-ready", evidence: { outcome: "INTEGRATION READY" } }]);
    f.ready(); await handoff.release(origin.sessionId);
    expect(f.released()).toBe(true); expect(handoff.retirementRequested(origin.sessionId)).toBe(true);
    await handoff.close(); // Closing origin-owned admission does not close independent control.
    expect(await handoff.inspect(origin.sessionId)).toMatchObject({ host: { released: true } });
  });
  it("keeps the origin and successor before readiness, rejects wrong origin and duplicate launch", async () => {
    const f = fixture(); const handoff = new CloseoutSuccessorHandoff(f.cli); closes.push(() => handoff.close());
    await handoff.launch(spec(), profile, origin.sessionId);
    await expect(handoff.release(origin.sessionId)).rejects.toThrow("Integration-ready");
    expect(handoff.retirementRequested(origin.sessionId)).toBe(false);
    expect(f.calls.some(args => args.includes("close"))).toBe(false);
    await expect(handoff.release("another-session")).rejects.toThrow("another originating");
    await expect(handoff.launch(spec(), profile, origin.sessionId)).rejects.toThrow("already launched");
  });
  it("does not retire an origin whose exact terminal identity changed", async () => {
    const f = fixture(); let changed = false;
    const cli: HerdrCli = args => changed && args[1] === "current" ? Promise.resolve(json({ pane: { pane_id: "w1:p9", tab_id: origin.tabId, workspace_id: origin.workspaceId, terminal_id: "other" } })) : f.cli(args);
    const handoff = new CloseoutSuccessorHandoff(cli); closes.push(() => handoff.close());
    await handoff.launch(spec(), profile, origin.sessionId); f.ready(); changed = true;
    await expect(handoff.release(origin.sessionId)).rejects.toThrow("identity changed"); expect(f.released()).toBe(false);
  });
  it("waits for both process exit and pane retirement before allowing cleanup", async () => {
    const child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" });
    await once(child, "spawn");
    const identity = { ...origin, pid: child.pid! };
    const absent: HerdrCli = async () => json({ panes: [] });
    try { await expect(observeOriginRetirement(identity, { cli: absent, timeoutMs: 1 })).rejects.toThrow("worktree retained"); }
    finally { child.kill(); await once(child, "exit"); }
    await observeOriginRetirement(identity, { cli: absent });
    const livePane: HerdrCli = async () => json({ panes: [{ pane_id: origin.paneId, tab_id: origin.tabId, terminal_id: origin.terminalId }] });
    await expect(observeOriginRetirement(identity, { cli: livePane, timeoutMs: 1 })).rejects.toThrow("shutdown was not observed");
  });
});

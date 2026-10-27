import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatUpdateResults, parseUpdateEndpoint, requestCooperativeRestart, restartConnectedSessions, runPiUpdatePass, type UpdateEndpoint } from "../lib/pi-update.ts";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const endpoint = (overrides: Partial<UpdateEndpoint> = {}): UpdateEndpoint => ({ port: 1234, token: "a".repeat(64), pid: 42, profile: resolve("fixture"), server: "connected-server", pane: "w1:p1", sessionId: "self", ...overrides });

describe("Pi update endpoints", () => {
  it("constructs a validated descriptor and rejects malformed boundaries", () => {
    expect(parseUpdateEndpoint(JSON.stringify(endpoint()))).toEqual(endpoint());
    for (const value of [undefined, "bad-json", JSON.stringify(endpoint({ port: 70000 })), JSON.stringify(endpoint({ token: "" })), JSON.stringify(endpoint({ profile: "default" }))]) expect(parseUpdateEndpoint(value)).toBeUndefined();
  });
  it("returns a skipped result when a supervisor is unavailable", async () => {
    await expect(requestCooperativeRestart(endpoint({ port: 1 }), "2.0.0")).resolves.toMatchObject({ status: "skipped" });
  });
});

describe("installation ordering", () => {
  async function options() {
    const root = await mkdtemp(join(tmpdir(), "pi-update-test-")); roots.push(root);
    const pkg = join(root, "node_modules/@earendil-works/pi-coding-agent");
    await mkdir(pkg, { recursive: true }); await writeFile(join(pkg, "package.json"), JSON.stringify({ version: "2.0.0" }));
    return { cwd: root, env: { PI_CODING_AGENT_DIR: root }, platform: "linux" as const };
  }
  it("installs first, refreshes the default link second, and reads the actual new version", async () => {
    const input = await options(), run = vi.fn().mockResolvedValue(undefined);
    await expect(runPiUpdatePass(input, run)).resolves.toEqual({ installed: true, linked: true, version: "2.0.0" });
    expect(run.mock.calls.map(call => call.slice(0, 2))).toEqual([
      ["pnpm", ["add", "-g", "@earendil-works/pi-coding-agent@latest"]],
      ["bash", ["scripts/pi-deps-link-setup", "--profile", "default"]],
    ]);
  });
  it("stops on installation failure without refreshing links", async () => {
    const run = vi.fn().mockRejectedValue(new Error("install failed"));
    await expect(runPiUpdatePass(await options(), run)).resolves.toEqual({ installed: false, linked: false, error: "install failed" });
    expect(run).toHaveBeenCalledOnce();
  });
  it("distinguishes installation success from failed link refresh", async () => {
    const run = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("link failed"));
    await expect(runPiUpdatePass(await options(), run)).resolves.toEqual({ installed: true, linked: false, error: "link failed" });
  });
  it("resolves pnpm through PowerShell on Windows without CMD", async () => {
    const input = await options(), run = vi.fn().mockResolvedValue(undefined);
    await runPiUpdatePass({ ...input, platform: "win32" }, run);
    expect(run.mock.calls[0][0]).toBe("pwsh");
    expect(run.mock.calls[0][1]).toContain("$ErrorActionPreference = 'Stop'; & pnpm add -g '@earendil-works/pi-coding-agent@latest'; exit $LASTEXITCODE");
    expect(run.mock.calls[1][0]).toBe("pwsh");
    expect(run.mock.calls[1][1].at(-1)).toContain("path-utils.ps1");
    expect(run.mock.calls[1][1].at(-1)).toContain("& (Get-GitBash) 'scripts/pi-deps-link-setup' --profile default");
  });
});

describe("connected Herdr pass", () => {
  const agent = (sessionId: string, pane: string, state = "idle") => ({ agent: "pi", name: sessionId, pane_id: pane, agent_status: state, agent_session: { value: sessionId } });
  it("covers other workspaces, skips working/blocked/unsupported sessions, excludes another server, and handles moved panes by session identity", async () => {
    const self = endpoint();
    const ready = endpoint({ pid: 43, pane: "old-pane-before-move", sessionId: "ready" });
    const busy = endpoint({ pid: 44, pane: "w2:p2", sessionId: "busy" });
    const blocked = endpoint({ pid: 45, pane: "w3:p1", sessionId: "blocked" });
    const elsewhere = endpoint({ pid: 46, pane: "w4:p1", sessionId: "elsewhere", server: "different-server" });
    const cli = vi.fn().mockResolvedValue(JSON.stringify({ result: { agents: [agent("self", self.pane), agent("ready", "w2:p8"), agent("busy", busy.pane, "working"), agent("blocked", blocked.pane, "blocked"), agent("unsupported", "w5:p1"), agent("elsewhere", elsewhere.pane)] } }));
    const restart = vi.fn().mockResolvedValue({ status: "restarted", version: "2.0.0" });
    const results = await restartConnectedSessions(self, "2.0.0", { cli, endpoints: async () => [self, ready, busy, blocked, elsewhere], restart });
    expect(cli).toHaveBeenCalledExactlyOnceWith(["agent", "list"]);
    expect(restart).toHaveBeenCalledExactlyOnceWith(ready, "2.0.0");
    expect(results.map(result => [result.label, result.status])).toEqual([["ready", "restarted"], ["busy", "skipped"], ["blocked", "skipped"], ["unsupported", "skipped"], ["elsewhere", "skipped"]]);
    expect(formatUpdateResults("2.0.0", results)).toContain("1 restarted, 4 skipped, 0 unconfirmed");
  });
  it("does not discover or restart peers outside Herdr", async () => {
    const cli = vi.fn(), restart = vi.fn(), endpoints = vi.fn();
    await expect(restartConnectedSessions(endpoint({ server: "" }), "2.0.0", { cli, restart, endpoints })).resolves.toEqual([]);
    expect(cli).not.toHaveBeenCalled(); expect(endpoints).not.toHaveBeenCalled(); expect(restart).not.toHaveBeenCalled();
  });
});

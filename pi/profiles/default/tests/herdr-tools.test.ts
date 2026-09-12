import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import tools, { checkedCommand } from "../extensions/herdr-tools.ts";
import { resumeHerdrSession } from "../lib/herdr-resume.ts";
vi.mock("../lib/herdr-resume.ts", () => ({ resumeHerdrSession: vi.fn() }));
import { createHerdrCli, inspectShell, result, type HerdrCli } from "../lib/herdr-cli.ts";
const json = (data: object) => JSON.stringify({ result: data });
const shell = (cwd = process.cwd(), pid = 10, name = "pwsh.exe") => json({ process_info: { pane_id: "p2", shell_pid: pid, foreground_processes: [{ pid, cwd, name }] } });
const ctx = { cwd: process.cwd(), mode: "tui" } as ExtensionContext;
afterEach(() => vi.unstubAllEnvs());
describe("CLI transport", () => {
  it("accepts silent success and parses structured queries separately", async () => {
    const cli = createHerdrCli({ ...process.env, HERDR_BIN_PATH: process.execPath });
    expect(await cli(["-e", "process.exit(0)"])).toBe("");
    expect(result(await cli(["-e", "console.log(JSON.stringify({result:{ok:true}}))"]))).toEqual({ ok: true });
  });
  it("bounds deadlines and propagates errors without retrying", async () => {
    const cli = createHerdrCli({ ...process.env, HERDR_BIN_PATH: process.execPath });
    await expect(cli(["-e", "setInterval(()=>{},1000)"], { timeoutMs: 50 })).rejects.toThrow("deadline");
    await expect(cli(["-e", "console.error('fixture-error');process.exit(1)"])).rejects.toThrow("fixture-error");
    await expect(cli(["-e", "process.stdout.write('x'.repeat(300000))"])).rejects.toThrow("limit");
    await expect(cli([], { signal: AbortSignal.abort() })).rejects.toThrow("cancelled");
  });
});
describe("command safety boundary", () => {
  it("uses verified shell/cwd and submits exactly once after gate approval", async () => {
    const cli = vi.fn<HerdrCli>().mockResolvedValueOnce(shell()).mockResolvedValueOnce(shell()).mockResolvedValueOnce("");
    const emit = vi.fn((_name, request) => {
      expect(request.event.toolName).toBe("powershell");
      expect(request.event.input).toEqual({ command: "echo ready" });
      expect(request.ctx.cwd).toBe(process.cwd());
      request.accept(Promise.resolve(undefined));
    });
    await checkedCommand({ events: { emit } } as unknown as ExtensionAPI, cli, "p2", "echo ready", "id", ctx);
    expect(cli.mock.calls.filter(call => call[0][1] === "run")).toHaveLength(1);
  });
  it("fails closed without a gate, after denial, or on changed shell identity", async () => {
    const cli = vi.fn<HerdrCli>().mockResolvedValue(shell());
    await expect(checkedCommand({ events: { emit() {} } } as unknown as ExtensionAPI, cli, "p2", "echo x", "id", ctx)).rejects.toThrow("gate unavailable");
    const api = (decision: unknown) => ({ events: { emit(_name: string, request: any) { request.accept(Promise.resolve(decision)); } } }) as ExtensionAPI;
    await expect(checkedCommand(api({ block: true, reason: "denied" }), cli, "p2", "echo x", "id", ctx)).rejects.toThrow("denied");
    cli.mockReset().mockResolvedValueOnce(shell()).mockResolvedValueOnce(shell(process.cwd(), 11));
    await expect(checkedCommand(api(undefined), cli, "p2", "echo x", "id", ctx)).rejects.toThrow("changed");
    expect(cli.mock.calls.some(call => call[0][1] === "run")).toBe(false);
  });
  it("rejects unknown interpreters and non-shell foreground processes", async () => {
    await expect(inspectShell(async () => shell(process.cwd(), 10, "cmd.exe"), "p2")).rejects.toThrow("Bash or PowerShell");
    await expect(inspectShell(async () => json({ process_info: { pane_id: "p2", shell_pid: 10, foreground_processes: [{ pid: 11, name: "node" }] } }), "p2")).rejects.toThrow("idle");
  });
});
it("resumes from only action and session with focused launch defaults", async () => {
  vi.stubEnv("HERDR_ENV", "1"); vi.stubEnv("HERDR_SOCKET_PATH", "fixture"); vi.stubEnv("HERDR_PANE_ID", "p1"); vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
  const registered: Record<string, any> = {};
  const cli = vi.fn<HerdrCli>();
  vi.mocked(resumeHerdrSession).mockResolvedValue({ session: "saved-id", workspace: undefined, tab: "w1:t2", pane: "w1:p2", cwd: ctx.cwd, focused: true, cleanupIssue: undefined, ready: true, state: "idle" });
  tools({ registerTool(t: any) { registered[t.name] = t; }, on() {} } as unknown as ExtensionAPI, cli);
  const answer = await registered.herdr_layout.execute("id", { action: "resume", session: "saved-id" }, undefined, undefined, ctx);
  expect(resumeHerdrSession).toHaveBeenCalledWith("saved-id", expect.stringMatching(/[\\/]sessions$/), cli, undefined, "tab");
  expect(JSON.parse(answer.content[0].text)).toMatchObject({ focused: true, ready: true, tab: "w1:t2", pane: "w1:p2" });
  await expect(registered.herdr_layout.execute("id", { action: "resume" }, undefined, undefined, ctx)).rejects.toThrow("session required");
  expect(cli).not.toHaveBeenCalled();
});

it("creates a workspace with captured identities and requested focus", async () => {
  vi.stubEnv("HERDR_ENV", "1"); vi.stubEnv("HERDR_SOCKET_PATH", "fixture"); vi.stubEnv("HERDR_PANE_ID", "p1"); vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
  const registered: Record<string, any> = {};
  const cli = vi.fn<HerdrCli>().mockResolvedValue(json({ workspace: { workspace_id: "w2" }, tab: { tab_id: "w2:t1" }, root_pane: { pane_id: "w2:p1", tab_id: "w2:t1", workspace_id: "w2" } }));
  tools({ registerTool(t: any) { registered[t.name] = t; }, on() {} } as unknown as ExtensionAPI, cli);
  const answer = await registered.herdr_layout.execute("id", { action: "workspace", cwd: "C:/project", label: "project", focus: true }, undefined, undefined, ctx);
  expect(cli).toHaveBeenCalledWith(["workspace", "create", "--cwd", "C:/project", "--label", "project", "--focus"], { signal: undefined });
  expect(JSON.parse(answer.content[0].text)).toMatchObject({ workspace: "w2", tab: "w2:t1", pane: "w2:p1", focused: true });
});

it("defends ownership and own pane, bounds reads and accepts silent close", async () => {
  vi.stubEnv("HERDR_ENV", "1"); vi.stubEnv("HERDR_SOCKET_PATH", "fixture"); vi.stubEnv("HERDR_PANE_ID", "p1"); vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
  const registered: Record<string, any> = {}; const handlers: Record<string, () => void> = {};
  const cli = vi.fn<HerdrCli>(async args => {
    if (args[1] === "split") return json({ pane: { pane_id: "p2" } });
    if (args[1] === "get") return json({ pane: { pane_id: args[2] } });
    if (args[1] === "read") return "x".repeat(20000);
    return "";
  });
  tools({ registerTool(t: any) { registered[t.name] = t; }, on(n: string, h: () => void) { handlers[n] = h; } } as unknown as ExtensionAPI, cli);
  const pane = (p: any) => registered.herdr_pane.execute("id", p, undefined, undefined, ctx);
  await expect(pane({ action: "close", pane: "p1", confirm: true })).rejects.toThrow("own pane");
  await expect(pane({ action: "close", pane: "p2", confirm: true })).rejects.toThrow("not created");
  await registered.herdr_layout.execute("id", { action: "split" }, undefined, undefined, ctx);
  await expect(pane({ action: "close", pane: "p2" })).rejects.toThrow("confirm");
  expect((await pane({ action: "read", pane: "p2" })).content[0].text.length).toBe(16000);
  await expect(pane({ action: "close", pane: "p2", confirm: true })).resolves.toBeDefined();
  await registered.herdr_layout.execute("id", { action: "split" }, undefined, undefined, ctx);
  handlers.session_start();
  await expect(pane({ action: "interrupt", pane: "p2" })).rejects.toThrow("not created");
});

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

it("moves an existing pane to a new tab in another workspace without focusing it", async () => {
  vi.stubEnv("HERDR_ENV", "1"); vi.stubEnv("HERDR_SOCKET_PATH", "fixture"); vi.stubEnv("HERDR_PANE_ID", "p1"); vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
  const registered: Record<string, any> = {};
  const cli = vi.fn<HerdrCli>(async args => {
    if (args[1] === "get") return json({ pane: { pane_id: args[2], workspace_id: "w1" } });
    if (args[1] === "move") return json({ move_result: { previous_pane_id: "p2", previous_tab_id: "w1:t2", pane: { pane_id: "w2:p3", tab_id: "w2:t4", workspace_id: "w2", label: "Pi", cwd: "C:/project" } } });
    return "";
  });
  tools({ registerTool(t: any) { registered[t.name] = t; }, on() {} } as unknown as ExtensionAPI, cli);
  const definition = registered.herdr_pane;
  expect(definition.parameters.properties.action.anyOf.map((entry: any) => entry.const)).toContain("move");
  const answer = await definition.execute("id", { action: "move", pane: "p2", workspace: "w2", label: "monorepo" }, undefined, undefined, ctx);
  expect(cli).toHaveBeenCalledWith(["pane", "move", "p2", "--new-tab", "--workspace", "w2", "--label", "monorepo", "--no-focus"], { signal: undefined });
  expect(JSON.parse(answer.content[0].text)).toMatchObject({ pane: "w2:p3", tab: "w2:t4", workspace: "w2", previousPane: "p2", previousTab: "w1:t2", focused: false });
  await expect(definition.execute("id", { action: "move", pane: "p2" }, undefined, undefined, ctx)).rejects.toThrow("workspace required");
  await expect(definition.execute("id", { action: "move", pane: "p2", workspace: "w1" }, undefined, undefined, ctx)).rejects.toThrow("different workspace");
  await expect(definition.execute("id", { action: "move", pane: "p1", workspace: "w2" }, undefined, undefined, ctx)).rejects.toThrow("own pane");
});

describe("structured Herdr agent control", () => {
  function setup(cli: HerdrCli) {
    vi.stubEnv("HERDR_ENV", "1"); vi.stubEnv("HERDR_SOCKET_PATH", "fixture"); vi.stubEnv("HERDR_PANE_ID", "p1"); vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
    const registered: Record<string, any> = {};
    tools({ registerTool(t: any) { registered[t.name] = t; }, on() {} } as unknown as ExtensionAPI, cli);
    return registered.herdr_agent;
  }

  it("lists all recognized agents and caps the returned inventory", async () => {
    const agents = Array.from({ length: 82 }, (_, i) => ({ agent: `agent-${i}`, pane_id: `w1:p${i + 1}`, agent_session: { kind: "path" }, agent_status: "idle" }));
    const cli = vi.fn<HerdrCli>().mockResolvedValue(json({ agents }));
    const tool = setup(cli);
    const answer = await tool.execute("id", { action: "list" }, undefined, undefined, ctx);
    expect(cli).toHaveBeenCalledWith(["agent", "list"], { signal: undefined });
    const output = JSON.parse(answer.content[0].text);
    expect(output).toMatchObject({ total: 82, truncated: true });
    expect(output.agents[0]).toMatchObject({ name: "agent-0", pane_id: "w1:p1", status: "idle" });
    expect(output.agents).toHaveLength(80);
  });

  it("gets the exact target and rejects a mismatched identity", async () => {
    const cli = vi.fn<HerdrCli>().mockResolvedValue(json({ agent: { name: "reviewer", pane_id: "w1:p3", kind: "pi", status: "working" } }));
    const tool = setup(cli);
    const answer = await tool.execute("id", { action: "get", target: "reviewer" }, undefined, undefined, ctx);
    expect(cli).toHaveBeenCalledWith(["agent", "get", "reviewer"], { signal: undefined });
    expect(JSON.parse(answer.content[0].text)).toMatchObject({ name: "reviewer", pane_id: "w1:p3", status: "working" });
    await expect(tool.execute("id", { action: "get", target: "w1:p4" }, undefined, undefined, ctx)).rejects.toThrow("exact target");
  });

  it("reads a bounded recent unwrapped snapshot", async () => {
    const cli = vi.fn<HerdrCli>().mockResolvedValueOnce("agent output").mockResolvedValueOnce("x".repeat(9000));
    const tool = setup(cli);
    const answer = await tool.execute("id", { action: "read", target: "w1:p3", lines: 200 }, undefined, undefined, ctx);
    expect(cli).toHaveBeenCalledWith(["agent", "read", "w1:p3", "--source", "recent-unwrapped", "--lines", "200"], { signal: undefined });
    expect(JSON.parse(answer.content[0].text)).toEqual({ target: "w1:p3", lines: 200, output: "agent output" });
    const bounded = await tool.execute("id", { action: "read", target: "reviewer" }, undefined, undefined, ctx);
    expect(JSON.parse(bounded.content[0].text).output).toHaveLength(6000);
    await expect(tool.execute("id", { action: "read", target: "reviewer", lines: 201 }, undefined, undefined, ctx)).rejects.toThrow("between 1 and 200");
  });

  it("prompts by exact target and optionally waits with a bounded timeout", async () => {
    const cli = vi.fn<HerdrCli>().mockResolvedValueOnce(json({ status: "idle" })).mockResolvedValueOnce("");
    const tool = setup(cli);
    const signal = new AbortController().signal;
    await tool.execute("id", { action: "prompt", target: "reviewer", message: "Check the fixture", wait: true, timeoutSeconds: 15 }, signal, undefined, ctx);
    expect(cli).toHaveBeenNthCalledWith(1, ["agent", "prompt", "reviewer", "Check the fixture", "--wait", "--timeout", "15000"], { timeoutMs: 17000, signal });
    const submitted = await tool.execute("id", { action: "prompt", target: "w1:p4", message: "hello" }, undefined, undefined, ctx);
    expect(cli).toHaveBeenNthCalledWith(2, ["agent", "prompt", "w1:p4", "hello"], { signal: undefined });
    expect(JSON.parse(submitted.content[0].text)).toEqual({ target: "w1:p4", submitted: true, waited: false });
    await expect(tool.execute("id", { action: "prompt", target: "reviewer", message: "hello", wait: true, timeoutSeconds: 121 }, undefined, undefined, ctx)).rejects.toThrow("between 1 and 120");
    expect(cli.mock.calls).toHaveLength(2);
  });

  it("waits for lifecycle states under a bounded CLI deadline", async () => {
    const cli = vi.fn<HerdrCli>().mockResolvedValue(json({ state: "blocked" }));
    const tool = setup(cli);
    const signal = new AbortController().signal;
    const answer = await tool.execute("id", { action: "wait", target: "w1:p5", until: "blocked", timeoutSeconds: 9 }, signal, undefined, ctx);
    expect(cli).toHaveBeenCalledWith(["agent", "wait", "w1:p5", "--until", "blocked", "--timeout", "9000"], { timeoutMs: 11000, signal });
    expect(JSON.parse(answer.content[0].text)).toEqual({ target: "w1:p5", response: "blocked" });
  });

  it("sends logical keys as positional arguments and reports submission", async () => {
    const cli = vi.fn<HerdrCli>().mockResolvedValue("");
    const tool = setup(cli);
    const answer = await tool.execute("id", { action: "sendKeys", target: "reviewer", keys: ["esc", "ctrl+c"] }, undefined, undefined, ctx);
    expect(cli).toHaveBeenCalledWith(["agent", "send-keys", "reviewer", "esc", "ctrl+c"], { signal: undefined });
    expect(JSON.parse(answer.content[0].text)).toEqual({ target: "reviewer", keys: ["esc", "ctrl+c"], submitted: true });
  });

  it("surfaces cancellation, timeout, missing targets and malformed responses", async () => {
    const aborted = AbortSignal.abort();
    const cancelledCli = vi.fn<HerdrCli>().mockRejectedValue(new Error("Herdr request cancelled"));
    const cancelledTool = setup(cancelledCli);
    await expect(cancelledTool.execute("id", { action: "read", target: "reviewer" }, aborted, undefined, ctx)).rejects.toThrow("cancelled");

    const timeoutCli = vi.fn<HerdrCli>().mockRejectedValue(new Error("Herdr deadline exceeded"));
    const timeoutTool = setup(timeoutCli);
    await expect(timeoutTool.execute("id", { action: "wait", target: "reviewer", timeoutSeconds: 2 }, undefined, undefined, ctx)).rejects.toThrow("deadline");

    const missingCli = vi.fn<HerdrCli>().mockRejectedValue(new Error("agent_not_found"));
    const missingTool = setup(missingCli);
    await expect(missingTool.execute("id", { action: "get", target: "missing" }, undefined, undefined, ctx)).rejects.toThrow("agent_not_found");

    const malformedTool = setup(vi.fn<HerdrCli>().mockResolvedValue(json({ agents: "not-an-array" })));
    await expect(malformedTool.execute("id", { action: "list" }, undefined, undefined, ctx)).rejects.toThrow("omitted agent list");
    const malformedEntry = setup(vi.fn<HerdrCli>().mockResolvedValue(json({ agents: [{ agent: "broken", pane_id: "w1:p9" }] })));
    await expect(malformedEntry.execute("id", { action: "list" }, undefined, undefined, ctx)).rejects.toThrow("lifecycle state");
  });
});

it("shows a bounded complete connected-layout inventory", async () => {
  vi.stubEnv("HERDR_ENV", "1"); vi.stubEnv("HERDR_SOCKET_PATH", "fixture"); vi.stubEnv("HERDR_PANE_ID", "p1"); vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
  const registered: Record<string, any> = {};
  const panes = Array.from({ length: 83 }, (_, i) => ({ pane_id: `w${i + 1}:p1`, tab_id: `w${i + 1}:t1`, workspace_id: `w${i + 1}`, label: `pane-${i}`, agent: "validator", agent_kind: "pi", agent_status: "working", foreground_process: "pi.exe" }));
  const cli = vi.fn<HerdrCli>().mockResolvedValue(json({ panes }));
  tools({ registerTool(t: any) { registered[t.name] = t; }, on() {} } as unknown as ExtensionAPI, cli);
  const answer = await registered.herdr_layout.execute("id", { action: "list" }, undefined, undefined, ctx);
  expect(cli).toHaveBeenCalledWith(["pane", "list"], { signal: undefined });
  const output = JSON.parse(answer.content[0].text);
  expect(output).toMatchObject({ total: 83, truncated: true });
  expect(output.panes[0]).toMatchObject({ pane: "w1:p1", tab: "w1:t1", workspace: "w1", agent: "validator", kind: "pi", state: "working", process: "pi.exe" });
  expect(output.panes).toHaveLength(80);
});

it("recovers across coordinator sessions while preserving active agents and closing exact stale panes", async () => {
  vi.stubEnv("HERDR_ENV", "1"); vi.stubEnv("HERDR_SOCKET_PATH", "fixture"); vi.stubEnv("HERDR_PANE_ID", "current-orchestrator"); vi.stubEnv("HERDR_WORKSPACE_ID", "current-workspace");
  const registered: Record<string, any> = {};
  const closed: string[] = [];
  const panes = [
    { pane_id: "current-orchestrator", tab_id: "current-tab", workspace_id: "current-workspace", agent_name: "orchestrator", agent_status: "working" },
    { pane_id: "old-coordinator-pane", tab_id: "old-tab", workspace_id: "earlier-workspace", agent_name: "earlier-coordinator", agent_status: "idle" },
    { pane_id: "validator-pane", tab_id: "validator-tab", workspace_id: "validation-workspace", agent_name: "validator", agent_status: "working" },
    { pane_id: "stale-worker-1", tab_id: "old-tab", workspace_id: "earlier-workspace", foreground_process: "python" },
    { pane_id: "stale-worker-2", tab_id: "old-tab", workspace_id: "earlier-workspace", foreground_process: "node" },
  ];
  const cli = vi.fn<HerdrCli>(async args => {
    if (args[0] === "pane" && args[1] === "list") return json({ panes });
    if (args[0] === "api" && args[1] === "snapshot") return json({ snapshot: { focused_pane_id: "current-orchestrator" } });
    if (args[0] === "agent" && args[1] === "list") return json({ agents: [
      { name: "earlier-coordinator", pane_id: "old-coordinator-pane", kind: "pi", status: "idle" },
      { name: "validator", pane_id: "validator-pane", kind: "pi", status: "working" },
    ] });
    if (args[0] === "agent" && args[1] === "prompt") return json({ status: "working" });
    if (args[0] === "agent" && args[1] === "read") return "Coordinator is done; worker panes are abandoned.";
    if (args[0] === "pane" && args[1] === "get") {
      const pane = panes.find(item => item.pane_id === args[2]);
      return pane ? json({ pane }) : json({ pane: { pane_id: "different-pane" } });
    }
    if (args[0] === "pane" && args[1] === "close") { closed.push(args[2]); return ""; }
    return "";
  });
  tools({ registerTool(t: any) { registered[t.name] = t; }, on() {} } as unknown as ExtensionAPI, cli);

  const layout = JSON.parse((await registered.herdr_layout.execute("id", { action: "list" }, undefined, undefined, ctx)).content[0].text);
  const agents = JSON.parse((await registered.herdr_agent.execute("id", { action: "list" }, undefined, undefined, ctx)).content[0].text);
  expect(layout.panes.map((pane: any) => pane.pane)).toContain("old-coordinator-pane");
  expect(layout.panes.map((pane: any) => pane.pane)).toContain("stale-worker-2");
  expect(agents.agents).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "earlier-coordinator", pane_id: "old-coordinator-pane" }),
    expect.objectContaining({ name: "validator", pane_id: "validator-pane", status: "working" }),
  ]));

  await registered.herdr_agent.execute("id", { action: "prompt", target: "earlier-coordinator", message: "Reconcile your workers and report which panes are abandoned." }, undefined, undefined, ctx);
  await registered.herdr_agent.execute("id", { action: "read", target: "old-coordinator-pane", lines: 40 }, undefined, undefined, ctx);
  expect(cli).toHaveBeenCalledWith(["agent", "prompt", "earlier-coordinator", "Reconcile your workers and report which panes are abandoned."], { signal: undefined });
  expect(cli).toHaveBeenCalledWith(["agent", "read", "old-coordinator-pane", "--source", "recent-unwrapped", "--lines", "40"], { signal: undefined });

  await registered.herdr_pane.execute("id", { action: "close", pane: "stale-worker-2" }, undefined, undefined, ctx);
  await registered.herdr_pane.execute("id", { action: "close", pane: "stale-worker-1" }, undefined, undefined, ctx);
  expect(closed).toEqual(["stale-worker-2", "stale-worker-1"]);
  expect(closed).not.toContain("validator-pane");
  expect(cli).toHaveBeenCalledWith(["pane", "close", "stale-worker-2"], { signal: undefined });
});

it("uses live focused pane identity instead of inherited pane environment for destructive actions", async () => {
  vi.stubEnv("HERDR_ENV", "1"); vi.stubEnv("HERDR_SOCKET_PATH", "fixture"); vi.stubEnv("HERDR_PANE_ID", "stale-inherited-pane"); vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
  const registered: Record<string, any> = {};
  const cli = vi.fn<HerdrCli>(async args => {
    if (args[0] === "pane" && args[1] === "get") return json({ pane: { pane_id: args[2] } });
    if (args[0] === "api" && args[1] === "snapshot") return json({ snapshot: { focused_pane_id: "live-caller-pane" } });
    return "";
  });
  tools({ registerTool(t: any) { registered[t.name] = t; }, on() {} } as unknown as ExtensionAPI, cli);
  const pane = (name: string) => registered.herdr_pane.execute("id", { action: "close", pane: name }, undefined, undefined, ctx);
  await expect(pane("stale-inherited-pane")).resolves.toBeDefined();
  await expect(pane("live-caller-pane")).rejects.toThrow("own pane");
  expect(cli).toHaveBeenCalledWith(["pane", "close", "stale-inherited-pane"], { signal: undefined });
  expect(cli).not.toHaveBeenCalledWith(["pane", "close", "live-caller-pane"], { signal: undefined });
});

it("requires an existing exact pane but permits non-caller interrupt/close without confirmation", async () => {
  vi.stubEnv("HERDR_ENV", "1"); vi.stubEnv("HERDR_SOCKET_PATH", "fixture"); vi.stubEnv("HERDR_PANE_ID", "p1"); vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
  const registered: Record<string, any> = {};
  const cli = vi.fn<HerdrCli>(async args => {
    if (args[0] === "pane" && args[1] === "get" && args[2] === "missing") return json({ pane: { pane_id: "other" } });
    if (args[0] === "pane" && args[1] === "get") return json({ pane: { pane_id: args[2] } });
    if (args[0] === "api" && args[1] === "snapshot") return json({ snapshot: { focused_pane_id: "p1" } });
    if (args[0] === "pane" && args[1] === "read") return "x".repeat(20000);
    return "";
  });
  tools({ registerTool(t: any) { registered[t.name] = t; }, on() {} } as unknown as ExtensionAPI, cli);
  const pane = (params: any) => registered.herdr_pane.execute("id", params, undefined, undefined, ctx);
  await expect(pane({ action: "close", pane: "p1" })).rejects.toThrow("own pane");
  await expect(pane({ action: "close", pane: "missing" })).rejects.toThrow("identity changed");
  await expect(pane({ action: "close", pane: "older-session-pane" })).resolves.toBeDefined();
  await expect(pane({ action: "interrupt", pane: "older-session-pane" })).resolves.toBeDefined();
  expect(cli).toHaveBeenCalledWith(["pane", "close", "older-session-pane"], { signal: undefined });
  expect(cli).toHaveBeenCalledWith(["pane", "send-keys", "older-session-pane", "ctrl+c"], { signal: undefined });
  expect((await pane({ action: "read", pane: "older-session-pane" })).content[0].text.length).toBe(16000);
});

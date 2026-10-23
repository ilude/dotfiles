import { afterEach, describe, expect, it, vi } from "vitest";
import { Value } from "typebox/value";
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
    const agents = Array.from({ length: 82 }, (_, i) => ({ agent: "pi", pane_id: `w1:p${i + 1}`, agent_session: { kind: "path" }, agent_status: "idle" }));
    const cli = vi.fn<HerdrCli>(async args => json(args[0] === "pane" ? { panes: [] } : { agents }));
    const tool = setup(cli);
    const answer = await tool.execute("id", { action: "list" }, undefined, undefined, ctx);
    expect(cli).toHaveBeenCalledWith(["agent", "list"], { signal: undefined });
    expect(tool.exposure).toBe("deferred");
    expect(Value.Check(tool.outputSchema, answer.structuredContent)).toBe(true);
    expect(answer.structuredContent).toMatchObject({ action: "list", total: 82, truncated: true });
    const output = JSON.parse(answer.content[0].text);
    expect(output).toMatchObject({ total: 82, truncated: true });
    expect(output.agents[0]).toEqual({ kind: "pi", pane_id: "w1:p1", status: "idle" });
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
    const waitedPrompt = await tool.execute("id", { action: "prompt", target: "reviewer", message: "Check the fixture", wait: true, timeoutSeconds: 15 }, signal, undefined, ctx);
    expect(Value.Check(tool.outputSchema, waitedPrompt.structuredContent)).toBe(true);
    expect(cli).toHaveBeenNthCalledWith(1, ["agent", "prompt", "reviewer", "Check the fixture", "--wait", "--timeout", "15000"], { timeoutMs: 17000, signal });
    const submitted = await tool.execute("id", { action: "prompt", target: "w1:p4", message: "hello" }, undefined, undefined, ctx);
    expect(Value.Check(tool.outputSchema, submitted.structuredContent)).toBe(true);
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
    expect(Value.Check(tool.outputSchema, answer.structuredContent)).toBe(true);
    expect(cli).toHaveBeenCalledWith(["agent", "wait", "w1:p5", "--until", "blocked", "--timeout", "9000"], { timeoutMs: 11000, signal });
    expect(JSON.parse(answer.content[0].text)).toEqual({ target: "w1:p5", response: "blocked" });
  });

  const uuid = "01a14143-5678-7abc-9def-a123456789ab";
  const fullId = `pi-${uuid}`;
  const alias = "pi-a1234567";
  const liveAgent = (pane = "w2:p7", session = uuid, name?: string) => ({
    agent: "pi", agent_name: name, pane_id: pane, agent_status: "idle",
    agent_session: { kind: "path", value: `C:\\sessions\\2026-10-23T10-00-00_${session}.jsonl` },
  });
  const paneContext = { pane_id: "w2:p7", tab_id: "w2:t4", workspace_id: "w2", label: "Communications", cwd: "C:/project" };
  function identityCli(agents: Record<string, unknown>[] = [liveAgent()]) {
    return vi.fn<HerdrCli>(async args => {
      if (args[0] === "pane") return json({ panes: [paneContext] });
      if (args[1] === "list") return json({ agents });
      if (args[1] === "get") return json({ agent: { ...liveAgent(), ...paneContext } });
      if (args[1] === "read") return "actual answer";
      if (args[1] === "wait") return json({ agent: liveAgent() });
      return "";
    });
  }

  it("discovers native unnamed and named agents with optional context and derived default identities", async () => {
    const cli = identityCli([liveAgent(), liveAgent("w3:p1", uuid, "reviewer"), { agent: "claude", pane_id: "w4:p1", agent_status: "working", agent_session: { kind: "path", value: uuid } }]);
    const tool = setup(cli);
    const answer = await tool.execute("id", { action: "list" }, undefined, undefined, ctx);
    expect(Value.Check(tool.outputSchema, answer.structuredContent)).toBe(true);
    expect(answer.structuredContent.agents[0]).toEqual({ kind: "pi", pane_id: "w2:p7", status: "idle", label: "Communications", tab_id: "w2:t4", workspace_id: "w2", cwd: "C:/project", pi_session_uuid: uuid, onclave_default_id: fullId, onclave_alias: alias });
    expect(answer.structuredContent.agents[1]).toMatchObject({ name: "reviewer", kind: "pi" });
    expect(answer.structuredContent.agents[2]).toEqual({ kind: "claude", pane_id: "w4:p1", status: "working" });
  });

  it.each([fullId, alias])("resolves %s for all targeted actions to the exact native pane", async target => {
    const cli = identityCli();
    const tool = setup(cli);
    for (const action of ["get", "read", "prompt", "wait", "sendKeys"]) {
      cli.mockClear();
      const answer = await tool.execute("id", { action, target, message: "Brief", keys: ["esc"] }, undefined, undefined, ctx);
      expect(Value.Check(tool.outputSchema, answer.structuredContent)).toBe(true);
      expect(answer.structuredContent).toMatchObject({ requested_target: target, resolved_agent: { pane_id: "w2:p7", tab_id: "w2:t4", workspace_id: "w2", onclave_default_id: fullId } });
      expect(cli.mock.calls[2]![0].slice(0, 3)).toEqual(["agent", action === "sendKeys" ? "send-keys" : action, "w2:p7"]);
    }
  });

  it("resolves against full inventory before the display cap and deduplicates name/alias matches", async () => {
    const agents = Array.from({ length: 80 }, (_, i) => ({ ...liveAgent(`w1:p${i}`), agent_session: { kind: "path", value: "unknown" } }));
    const cli = identityCli([...agents, liveAgent("w2:p7", uuid, alias)]);
    await setup(cli).execute("id", { action: "prompt", target: alias, message: "Brief" }, undefined, undefined, ctx);
    expect(cli.mock.calls[2]![0]).toEqual(["agent", "prompt", "w2:p7", "Brief"]);
  });

  it.each([
    { agents: [liveAgent(), liveAgent("w3:p1")], target: fullId },
    { agents: [liveAgent(), liveAgent("w3:p1", "01a14143-5678-7abc-9def-a1234567ffff")], target: alias },
    { agents: [liveAgent(), liveAgent("w3:p1", "01a14143-5678-7abc-9def-b123456789ab", alias)], target: alias },
    { agents: [liveAgent()], target: "pi-absent" },
  ])("rejects ambiguous or absent references without submitting a prompt: $target", async ({ agents, target }) => {
    const cli = identityCli(agents);
    await expect(setup(cli).execute("id", { action: "prompt", target, message: "Brief" }, undefined, undefined, ctx)).rejects.toThrow(target === "pi-absent" ? "No local Herdr match" : /Ambiguous.*tab_id.*pane_id/);
    expect(cli.mock.calls.some(([args]) => args[1] === "prompt")).toBe(false);
  });

  it("preserves exact pi-form native names but rejects incomplete or unavailable identity inventories", async () => {
    const namedCli = identityCli([liveAgent("w2:p7", uuid, "pi-custom-name")]);
    await setup(namedCli).execute("id", { action: "prompt", target: "pi-custom-name", message: "Brief" }, undefined, undefined, ctx);
    expect(namedCli.mock.calls[2]![0][2]).toBe("w2:p7");
    for (const response of [{ agents: [liveAgent()], truncated: true }, { agents: [], total: 1 }]) {
      const cli = vi.fn<HerdrCli>().mockResolvedValue(json(response));
      await expect(setup(cli).execute("id", { action: "prompt", target: alias, message: "Brief" }, undefined, undefined, ctx)).rejects.toThrow("incomplete");
      expect(cli).toHaveBeenCalledTimes(1);
    }
    const cli = vi.fn<HerdrCli>().mockRejectedValue(new Error("inventory unavailable"));
    await expect(setup(cli).execute("id", { action: "prompt", target: alias, message: "Brief" }, undefined, undefined, ctx)).rejects.toThrow("inventory unavailable");
    expect(cli).toHaveBeenCalledTimes(1);
  });

  it("renders nested native wait state and describes waited prompts as submission, not answers", async () => {
    const cli = vi.fn<HerdrCli>().mockResolvedValue(json({ agent: liveAgent() }));
    const tool = setup(cli);
    const theme = { fg: (_name: string, value: string) => value, bold: (value: string) => value };
    const render = (answer: any, action: string) => tool.renderResult(answer, { expanded: false }, theme, { args: { action } }).render(200).join("\n").trim();
    const waited = await tool.execute("id", { action: "wait", target: "w2:p7" }, undefined, undefined, ctx);
    expect(Value.Check(tool.outputSchema, waited.structuredContent)).toBe(true);
    expect(render(waited, "wait")).toBe("observed idle");
    const prompted = await tool.execute("id", { action: "prompt", target: "w2:p7", message: "Brief", wait: true }, undefined, undefined, ctx);
    expect(render(prompted, "prompt")).toBe("prompt submitted · settled state observed · idle");
    expect(render(prompted, "prompt")).not.toMatch(/completed|Object/);
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
  const panes = Array.from({ length: 83 }, (_, i) => ({ pane_id: `w${i + 1}:p1`, tab_id: `w${i + 1}:t1`, workspace_id: `w${i + 1}`, label: `pane-${i}`, agent_name: i === 0 ? undefined : "validator", agent: "pi", agent_status: "working", foreground_process: "pi.exe" }));
  const cli = vi.fn<HerdrCli>().mockResolvedValue(json({ panes }));
  tools({ registerTool(t: any) { registered[t.name] = t; }, on() {} } as unknown as ExtensionAPI, cli);
  const answer = await registered.herdr_layout.execute("id", { action: "list" }, undefined, undefined, ctx);
  expect(cli).toHaveBeenCalledWith(["pane", "list"], { signal: undefined });
  expect(registered.herdr_layout.exposure).toBe("deferred");
  expect(Value.Check(registered.herdr_layout.outputSchema, answer.structuredContent)).toBe(true);
  expect(answer.structuredContent).toMatchObject({ action: "list", total: 83, truncated: true });
  const output = JSON.parse(answer.content[0].text);
  expect(output).toMatchObject({ total: 83, truncated: true });
  expect(output.panes[0]).toMatchObject({ pane: "w1:p1", tab: "w1:t1", workspace: "w1", label: "pane-0", kind: "pi", state: "working", process: "pi.exe" });
  expect(output.panes[0]).not.toHaveProperty("agent");
  expect(output.panes[1]).toMatchObject({ agent: "validator", kind: "pi" });
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

it("renders human-readable collapsed Herdr results and keeps internal IDs in expanded details", async () => {
  vi.stubEnv("HERDR_ENV", "1"); vi.stubEnv("HERDR_SOCKET_PATH", "fixture"); vi.stubEnv("HERDR_PANE_ID", "p1"); vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
  const registered: Record<string, any> = {};
  tools({ registerTool(t: any) { registered[t.name] = t; }, on() {} } as unknown as ExtensionAPI, vi.fn<HerdrCli>());
  const theme = { fg: (_name: string, value: string) => value, bold: (value: string) => value };
  const lines = (component: any) => component.render(200).map((line: string) => line.trimEnd()).join("\n");
  const context = (args: Record<string, unknown>, isError = false) => ({ args, isError });

  const agentResult = { content: [{ type: "text", text: JSON.stringify({ name: "claude", pane_id: "w27:pKH", workspace_id: "W27", cwd: "C:/Users/mglenn/.dotfiles", status: "idle" }) }], details: {} };
  const agentCall = registered.herdr_agent.renderCall({ action: "get", target: "claude" }, theme, context({}));
  expect(lines(agentCall)).toBe("herdr agent · get · claude");
  expect(agentCall.render(20).every((line: string) => line.length <= 20)).toBe(true);
  expect(lines(registered.herdr_agent.renderResult(agentResult, { expanded: false }, theme, context({ action: "get", target: "claude" })))).toBe("claude · idle\nC:/Users/mglenn/.dotfiles");
  expect(lines(registered.herdr_agent.renderResult(agentResult, { expanded: true }, theme, context({ action: "get", target: "claude" })))).toContain("w27:pKH");

  const inventoryResult = (fields: object) => ({ content: [{ type: "text", text: JSON.stringify(fields) }], details: {} });
  const unnamed = { pane: "w27:pKH", tab: "w27:t1", workspace: "w27", kind: "pi", state: "idle", label: "Communications", cwd: "C:/project" };
  const layoutResult = inventoryResult({ panes: [unnamed, { ...unnamed, agent: "reviewer", label: "Other label" }, { pane: "p2", tab: "t2", workspace: "w2", cwd: "C:\\repo\\fallback", kind: "pi" }], total: 3 });
  expect(lines(registered.herdr_layout.renderResult(layoutResult, { expanded: false }, theme, context({ action: "list" })))).toBe("3 panes\nCommunications · idle\nreviewer · idle\nfallback");
  expect(lines(registered.herdr_layout.renderResult(layoutResult, { expanded: true }, theme, context({ action: "list" })))).toContain("w27:pKH");
  const listResult = inventoryResult({ agents: [{ pane_id: "w27:pKH", label: "Communications", kind: "pi", status: "idle" }, { pane_id: "p2", cwd: "C:/repo/worker", kind: "pi", status: "working" }, { pane_id: "p3", kind: "claude", status: "idle" }], total: 3 });
  expect(lines(registered.herdr_agent.renderResult(listResult, { expanded: false }, theme, context({ action: "list" })))).toBe("3 agents\nCommunications · idle\nworker · working\nclaude · idle");
  expect(lines(registered.herdr_agent.renderResult(listResult, { expanded: true }, theme, context({ action: "list" })))).toContain("w27:pKH");

  const waitResult = { content: [{ type: "text", text: JSON.stringify({ pane: "w27:pKR", matched: "~/.dotfiles[main]>", output: "ready" }) }], details: {} };
  const collapsed = lines(registered.herdr_pane.renderResult(waitResult, { expanded: false }, theme, context({ action: "wait", pane: "w27:pKR", match: "~/.dotfiles[main]>" })));
  expect(collapsed).toBe("matched “~/.dotfiles[main]>”\nready");
  expect(collapsed).not.toContain("w27:pKR");

  const error = { content: [{ type: "text", text: JSON.stringify({ error: { code: "timeout", message: "timed out waiting for output match", id: "cli:pane:wait-output" } }) }], details: {} };
  expect(lines(registered.herdr_pane.renderResult(error, { expanded: false }, theme, context({ action: "wait", pane: "w27:pKR" }, true)))).toBe("timed out waiting for output match");
  expect(lines(registered.herdr_pane.renderResult(error, { expanded: true }, theme, context({ action: "wait", pane: "w27:pKR" }, true)))).toContain("cli:pane:wait-output");
});

it("validates pane wait and run output against the declared schema", async () => {
  vi.stubEnv("HERDR_ENV", "1"); vi.stubEnv("HERDR_SOCKET_PATH", "fixture"); vi.stubEnv("HERDR_PANE_ID", "p1"); vi.stubEnv("HERDR_WORKSPACE_ID", "w1");
  const registered: Record<string, any> = {};
  const cli = vi.fn<HerdrCli>(async args => {
    if (args[0] === "pane" && args[1] === "get") return json({ pane: { pane_id: args[2] } });
    if (args[0] === "pane" && args[1] === "wait-output") return json({ matched_line: "ready>", read: { text: "ready>" } });
    if (args[0] === "pane" && args[1] === "process-info") return shell();
    return "";
  });
  tools({ registerTool(t: any) { registered[t.name] = t; }, events: { emit(_name: string, request: any) { request.accept(Promise.resolve(undefined)); } } } as unknown as ExtensionAPI, cli);
  const pane = registered.herdr_pane;
  const waited = await pane.execute("id", { action: "wait", pane: "p2", match: "ready>" }, undefined, undefined, ctx);
  expect(Value.Check(pane.outputSchema, waited.structuredContent)).toBe(true);
  const ran = await pane.execute("id", { action: "run", pane: "p2", command: "echo ready" }, undefined, undefined, ctx);
  expect(Value.Check(pane.outputSchema, ran.structuredContent)).toBe(true);
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
  const readResult = await pane({ action: "read", pane: "older-session-pane" });
  expect(readResult.structuredContent.output).toHaveLength(16000);
  expect(Value.Check(registered.herdr_pane.outputSchema, readResult.structuredContent)).toBe(true);
});

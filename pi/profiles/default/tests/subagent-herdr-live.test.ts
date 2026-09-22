import { describe, expect, it, vi } from "vitest";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SubagentRuntime } from "../lib/subagents/runtime.ts";
import { VisibleChild } from "../lib/subagents/visible.ts";
import { loadDefinitions } from "../lib/subagents/definitions.ts";
import type { AgentDefinition } from "../lib/subagents/definitions.ts";

const profile = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(profile, "../../..");
const executable = process.env.HERDR_BIN_PATH || "herdr";
const exec = promisify(execFile);
const childExtension = join(profile, "extensions/subagent-child.ts");
const timeout = 320_000;

type Cli = (args: string[]) => Promise<any>;
type LiveHarness = {
 scratch: string;
 runtime: SubagentRuntime;
 cli: Cli;
 pane: { pane_id: string };
 input: {
  definition: AgentDefinition;
  instructions: string;
  cwd: string;
  model: string;
  effort: "low";
  skills: never[];
  origin: string;
  retained: boolean;
  surface: "visible";
 };
 listedAgents: () => Promise<Array<Record<string, any>>>;
};

async function withLiveHarness(run: (harness: LiveHarness) => Promise<void>): Promise<void> {
 const scratch = mkdtempSync(join(tmpdir(), "subagent-herdr-live-"));
 const name = `subagents-${process.pid}-${Date.now()}`;
 const env = { ...process.env, APPDATA: join(scratch, "roaming"), LOCALAPPDATA: join(scratch, "local"), HERDR_CONFIG_PATH: join(scratch, "config.toml") };
 for (const key of ["HERDR_ENV", "HERDR_SOCKET_PATH", "HERDR_WORKSPACE_ID", "HERDR_TAB_ID", "HERDR_PANE_ID", "HERDR_PLUGIN_ID"]) delete env[key as keyof typeof env];
 mkdirSync(env.APPDATA, { recursive: true });
 mkdirSync(env.LOCALAPPDATA, { recursive: true });
 writeFileSync(env.HERDR_CONFIG_PATH, '[ui.sound]\nenabled = false\n[ui.toast]\ndelivery = "off"\n[session]\nresume_agents_on_restore = false\n');
 const server = spawn(executable, ["--session", name, "server"], { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
 const serverClosed = new Promise<void>(resolveClosed => server.once("close", () => resolveClosed()));
 let logs = "";
 server.stdout.on("data", chunk => logs = (logs + chunk).slice(-8000));
 server.stderr.on("data", chunk => logs = (logs + chunk).slice(-8000));
 const cli: Cli = async args => {
  const { stdout } = await exec(executable, ["--session", name, ...args], { env, windowsHide: true, timeout: 15_000, maxBuffer: 256 * 1024 });
  return stdout.trim().startsWith("{") ? JSON.parse(stdout) : stdout;
 };
 const previous = { ...process.env };
 const runtime = new SubagentRuntime();
 let linked = false;
 try {
  await exec("git", ["init", "--quiet", scratch], { windowsHide: true, timeout: 10_000 });
  let session: { socket_path: string } | undefined;
  await vi.waitFor(async () => {
   const listed = await cli(["session", "list", "--json"]);
   session = listed.sessions.find((candidate: any) => candidate.name === name && candidate.running);
   expect(session, logs).toBeDefined();
  }, { timeout: 15_000, interval: 250 });
  const plugins = await cli(["plugin", "list", "--json"]);
  expect(plugins.result.plugins).toEqual([]);
  expect(session!.socket_path.toLowerCase()).toContain(scratch.toLowerCase());
  const plugin = join(scratch, "plugin");
  mkdirSync(plugin);
  const manifestPath = join(profile, "node_modules/@earendil-works/pi-coding-agent/package.json");
  const entry = resolve(dirname(manifestPath), JSON.parse(readFileSync(manifestPath, "utf8")).bin.pi);
  writeFileSync(join(plugin, "herdr-plugin.toml"), readFileSync(join(root, "pi/herdr/herdr-plugin.toml.in"), "utf8").replace("@COMMAND@", JSON.stringify([process.execPath, join(root, "scripts/pi-herdr-launch.mjs"), entry])));
  await cli(["plugin", "link", plugin]);
  linked = true;
  const workspace = await cli(["workspace", "create", "--cwd", scratch, "--label", "subagent acceptance", "--no-focus"]);
  const pane = workspace.result.root_pane;
  Object.assign(process.env, env, { HERDR_ENV: "1", HERDR_SOCKET_PATH: session!.socket_path, HERDR_WORKSPACE_ID: workspace.result.workspace.workspace_id, HERDR_TAB_ID: workspace.result.tab.tab_id, HERDR_PANE_ID: pane.pane_id });
  const definition: AgentDefinition = { name: "probe", description: "Restricted parity", tools: ["read"], delegates: [], skills: [], prompt: "Follow instructions precisely. Do not use other tools.", source: "profile", filePath: "probe.md" };
  writeFileSync(join(scratch, "marker.txt"), "cedar-417");
  const input = { definition, instructions: "Read marker.txt and reply only with its contents. Remember them for later.", cwd: scratch, model: "openai-codex/gpt-5.6-luna", effort: "low" as const, skills: [], origin: "visible-live", retained: true, surface: "visible" as const };
  const listedAgents = async () => (await cli(["agent", "list"])).result.agents as Array<Record<string, any>>;
  await run({ scratch, runtime, cli, pane, input, listedAgents });
 } finally {
  try {
   await runtime.shutdown("quit");
  } finally {
   for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
   Object.assign(process.env, previous);
   if (linked) await cli(["plugin", "unlink", "local.pi"]);
   try {
    await cli(["server", "stop"]);
   } finally {
    if (server.exitCode === null) server.kill();
    await serverClosed;
   }
   rmSync(scratch, { recursive: true, force: true });
  }
 }
}

async function launchRetainedVisible(harness: LiveHarness): Promise<VisibleChild> {
 const started = await harness.runtime.launch(harness.input, profile, childExtension, true);
 await vi.waitFor(() => expect(harness.runtime.get(started.id).snapshot().status, JSON.stringify(harness.runtime.get(started.id).snapshot())).toBe("settled"), { timeout: 50_000, interval: 100 });
 const first = harness.runtime.get(started.id).snapshot();
 expect(first.outcome, first.error).toBe("complete");
 expect(first.result).toContain("cedar-417");
 return harness.runtime.get(first.id) as VisibleChild;
}

describe.skipIf(process.env.PI_SUBAGENT_HERDR_LIVE !== "1")("isolated visible subagent acceptance", () => {
 it("registers visible agents with state and session across reload, excludes headless agents, and cleans its exact pane", async () => withLiveHarness(async ({ runtime, cli, pane, input, listedAgents }) => {
  const beforeHeadless = await listedAgents();
  const headless = await runtime.launch({ ...input, surface: "headless" }, profile, childExtension, false);
  expect(headless.outcome, headless.error).toBe("complete");
  expect(headless.result).toContain("cedar-417");
  expect(await listedAgents()).toEqual(beforeHeadless);
  await runtime.get(headless.id).finish();

  const beforeLayout = await cli(["pane", "layout", "--pane", pane.pane_id]);
  const launching = runtime.launch(input, profile, childExtension, true);
  let visibleId = "";
  await vi.waitFor(async () => {
   const record = runtime.list().find(candidate => candidate.surface === "visible" && candidate.origin === "visible-live");
   visibleId = record?.id ?? "";
   expect(record?.paneId).toBeTruthy();
   const agent = (await listedAgents()).find(candidate => candidate.pane_id === record!.paneId);
   expect(agent).toBeDefined();
   expect(["idle", "working"]).toContain(agent!.agent_status ?? agent!.state);
   expect(agent!.agent_session?.value ?? agent!.agent_session_path ?? agent!.session_path).toMatch(process.platform === "win32" ? /^[A-Za-z]:\\/ : /^\//);
  }, { timeout: 30_000, interval: 100 });
  await vi.waitFor(async () => expect((await listedAgents()).find(candidate => candidate.pane_id === runtime.get(visibleId).snapshot().paneId)?.agent_status).toBe("working"), { timeout: 15_000, interval: 25 });
  const started = await launching;
  await vi.waitFor(() => expect(runtime.get(started.id).snapshot().status, JSON.stringify(runtime.get(started.id).snapshot())).toBe("settled"), { timeout: 50_000, interval: 100 });
  const first = runtime.get(started.id).snapshot();
  expect(first.outcome, first.error).toBe("complete");
  expect(first.result).toContain("cedar-417");
  const registeredBeforeReload = (await listedAgents()).find(candidate => candidate.pane_id === first.paneId);
  expect(registeredBeforeReload?.agent_status ?? registeredBeforeReload?.state).toBe("idle");
  const registeredSession = registeredBeforeReload?.agent_session?.value ?? registeredBeforeReload?.agent_session_path ?? registeredBeforeReload?.session_path;
  expect(registeredSession).toBeTruthy();
  const afterLayout = await cli(["pane", "layout", "--pane", pane.pane_id]);
  expect(afterLayout.result.layout.focused_pane_id).toBe(beforeLayout.result.layout.focused_pane_id);

  const child = runtime.get(first.id) as VisibleChild;
  await cli(["agent", "prompt", first.paneId!, "/reload"]);
  await vi.waitFor(() => expect(child.record.readyCount).toBe(2), { timeout: 10_000 });
  await vi.waitFor(async () => expect(String(await cli(["agent", "read", first.paneId!, "--source", "recent-unwrapped", "--lines", "60"]))).toContain("Reloaded keybindings"), { timeout: 10_000, interval: 100 });
  await vi.waitFor(async () => {
   const registered = (await listedAgents()).find(candidate => candidate.pane_id === first.paneId);
   expect(registered?.agent_status ?? registered?.state).toBe("idle");
   expect(registered?.agent_session?.value ?? registered?.agent_session_path ?? registered?.session_path).toBe(registeredSession);
  }, { timeout: 10_000, interval: 100 });

  const paneId = child.record.paneId!;
  await cli(["pane", "zoom", "--pane", pane.pane_id, "--on"]);
  await child.finish();
  await expect(cli(["pane", "get", paneId])).rejects.toThrow();
  const focused = await cli(["pane", "get", pane.pane_id]);
  expect(focused.result.pane.pane_id).toBe(pane.pane_id);
 }), timeout);

 it("hands direct-user intervention back and retains conversational context", async () => withLiveHarness(async harness => {
  const child = await launchRetainedVisible(harness);
  await harness.cli(["agent", "prompt", child.record.paneId!, "/reload"]);
  await vi.waitFor(() => expect(child.record.readyCount).toBe(2), { timeout: 10_000 });
  await vi.waitFor(async () => expect(String(await harness.cli(["agent", "read", child.record.paneId!, "--source", "recent-unwrapped", "--lines", "60"]))).toContain("Reloaded keybindings"), { timeout: 10_000, interval: 100 });
  await child.intervene();
  await harness.cli(["pane", "send-text", child.record.paneId!, "Reply only: user help active. Keep the earlier marker in context."]);
  await harness.cli(["pane", "send-keys", child.record.paneId!, "enter"]);
  await vi.waitFor(() => {
   expect(child.record.userOwned).toBe(true);
   expect(child.record.turns).toBe(2);
  }, { timeout: 30_000 }).catch(async error => {
   throw new Error(`${String(error)}\n${JSON.stringify(child.snapshot())}\n${await harness.cli(["agent", "read", child.record.paneId!, "--source", "recent-unwrapped", "--lines", "120"])}`);
  });
  await expect(child.message("competing parent steering")).rejects.toThrow(/intervention/);
  child.handback();
  await vi.waitFor(() => expect(child.record.userOwned).toBe(false), { timeout: 5000 });
  await child.message("Recall the marker from the previous exchange without reading it again. Reply only with the marker.");
  await vi.waitFor(() => expect(child.snapshot().turns).toBe(3), { timeout: 40_000, interval: 100 });
  expect(child.snapshot().result).toContain("cedar-417");
  await child.finish();
 }), timeout);

 it("completes a bounded visible lead and worker recovery smoke", async () => withLiveHarness(async ({ scratch, runtime, input }) => {
  const catalog = loadDefinitions(scratch, false, profile);
  const definition: AgentDefinition = {
   name: "probe-lead", description: "Bounded coordinator smoke",
   tools: ["subagent", "subagent_control"], delegates: ["developer"], skills: [],
   prompt: "You coordinate one worker. Launch a developer to write proof.txt with exactly leaf write ok, no shell commands. Use background:true, retain:false. Return control while it works. After its automatic completion, report the result. Do not ask the parent questions or report partial completion.",
   source: "profile", filePath: "probe-lead.md",
  };
  const started = await runtime.launch({ ...input, definition, instructions: "Run the one-worker smoke now.", retained: false, catalog: catalog.agents }, profile, childExtension, true);
  await vi.waitFor(() => expect(runtime.get(started.id).snapshot().status).toBe("settled"), { timeout: 120_000, interval: 250 });
  const result = runtime.get(started.id).snapshot();
  expect(result.outcome, result.error ?? result.result).toBe("complete");
  const members = runtime.list().filter(record => record.parentId === result.id);
  expect(members.map(record => record.agent)).toEqual(["developer"]);
  expect(members[0].outcome, JSON.stringify(members)).toBe("complete");
  expect(readFileSync(join(scratch, "proof.txt"), "utf8")).toBe("leaf write ok");
 }), timeout);

 it("runs a nested teamlead and its developer and explorer members", async () => withLiveHarness(async ({ scratch, runtime, input }) => {
  const catalog = loadDefinitions(scratch, false, profile);
  expect(catalog.errors).toEqual([]);
  const definition = catalog.agents.get("teamlead")!;
  const result = await runtime.launch({ ...input, definition, model: definition.model!, effort: definition.effort!, instructions: 'Commission developer to write proof.txt containing exactly "leaf write ok", with no shell commands. Then commission explorer to read and confirm it. Wait for both results and integrate them briefly. Do not retain either leaf.', retained: false, catalog: catalog.agents }, profile, childExtension, false);
  expect(result.outcome, result.error ?? result.result).toBe("complete");
  const members = runtime.list().filter(record => record.parentId === result.id);
  expect(members.map(record => record.agent).sort()).toEqual(["developer", "explorer"]);
  expect(members.every(record => record.outcome === "complete" && record.turns >= 1), JSON.stringify(members)).toBe(true);
  expect(readFileSync(join(scratch, "proof.txt"), "utf8")).toContain("leaf write ok");
 }), timeout);

 it("runs a nested council with retained multi-turn members", async () => withLiveHarness(async ({ scratch, runtime, input }) => {
  const catalog = loadDefinitions(scratch, false, profile);
  expect(catalog.errors).toEqual([]);
  const definition = catalog.agents.get("council")!;
  const result = await runtime.launch({ ...input, definition, model: definition.model!, effort: definition.effort!, instructions: "The user explicitly requests a tiny council on JSON versus YAML for a local CLI config. This is hypothetical; do not browse or read files. Commission advisor, researcher, reviewer with retain=true for independent one-sentence openings from distinct perspectives. Use subagent_control message to ask EACH SAME member a focused rebuttal based on another opening and to recall its earlier position. Wait for all replies, then synthesize disagreements and evidence gaps. Do not implement anything. Leave members retained for inspection.", retained: false, catalog: catalog.agents }, profile, childExtension, false);
  expect(result.outcome, result.error ?? result.result).toBe("complete");
  const members = runtime.list().filter(record => record.parentId === result.id);
  expect(members.map(record => record.agent).sort()).toEqual(["advisor", "researcher", "reviewer"]);
  expect(members.every(record => record.outcome === "complete" && record.turns >= 2), JSON.stringify(members)).toBe(true);
  for (const member of members) if (member.retained) await runtime.get(member.id).finish();
 }), timeout);

 it("closes ordinary children on shutdown while a user-owned child survives for manual exit", async () => withLiveHarness(async ({ runtime, cli, input }) => {
  const helped = await runtime.launch({ ...input, instructions: "Reply only: survival ready" }, profile, childExtension, false);
  const helpedChild = runtime.get(helped.id) as VisibleChild;
  await helpedChild.intervene();
  const ordinary = await runtime.launch({ ...input, instructions: "Reply only: ordinary ready" }, profile, childExtension, false);
  await runtime.shutdown("quit");
  await expect(cli(["pane", "get", ordinary.paneId!])).rejects.toThrow();
  await vi.waitFor(async () => {
   const output = await cli(["agent", "read", helped.paneId!, "--source", "recent-unwrapped", "--lines", "60"]);
   expect(JSON.stringify(output)).toContain("Parent unavailable");
  }, { timeout: 15_000, interval: 250 });
  await cli(["agent", "prompt", helped.paneId!, "/exit"]).catch(() => undefined);
  await vi.waitFor(async () => {
   await expect(cli(["pane", "get", helped.paneId!])).rejects.toThrow();
  }, { timeout: 15_000, interval: 250 });
 }), timeout);
});

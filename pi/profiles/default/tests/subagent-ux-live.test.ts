import { describe, expect, it, vi } from "vitest";
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectPane, result, type HerdrCli } from "../lib/herdr-cli.ts";
import { SubagentLayout } from "../lib/subagents/layout.ts";
import { SubagentRuntime } from "../lib/subagents/runtime.ts";
import type { AgentDefinition } from "../lib/subagents/definitions.ts";

const exec = promisify(execFile);
const profile = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(profile, "../../..");
const executable = process.env.HERDR_BIN_PATH || "herdr";
const childExtension = join(profile, "extensions/subagent-child.ts");

type Fixture = {
  scratch: string;
  env: NodeJS.ProcessEnv;
  name: string;
  server: ChildProcess;
  serverClosed: Promise<void>;
  cli: HerdrCli;
  caller: any;
  unrelated: any;
  linked: string[];
};

async function isolatedFixture(): Promise<Fixture> {
  const scratch = mkdtempSync(join(tmpdir(), "subagent-ux-live-"));
  const name = `subagent-ux-${process.pid}-${Date.now()}`;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    APPDATA: join(scratch, "roaming"),
    LOCALAPPDATA: join(scratch, "local"),
    HERDR_CONFIG_PATH: join(scratch, "config.toml"),
  };
  for (const key of Object.keys(env)) if (key.startsWith("HERDR_") && key !== "HERDR_CONFIG_PATH") delete env[key];
  mkdirSync(env.APPDATA!, { recursive: true });
  mkdirSync(env.LOCALAPPDATA!, { recursive: true });
  writeFileSync(env.HERDR_CONFIG_PATH!, '[ui.sound]\nenabled = false\n[ui.toast]\ndelivery = "off"\n[session]\nresume_agents_on_restore = false\n');
  const server = spawn(executable, ["--session", name, "server"], { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  const serverClosed = new Promise<void>(resolve => server.once("close", () => resolve()));
  let logs = "";
  server.stdout?.on("data", chunk => logs = (logs + chunk).slice(-8000));
  server.stderr?.on("data", chunk => logs = (logs + chunk).slice(-8000));
  const cli: HerdrCli = async args => {
    const { stdout } = await exec(executable, ["--session", name, ...args], { env, windowsHide: true, timeout: 15_000, maxBuffer: 256 * 1024 });
    return stdout;
  };
  const linked: string[] = [];
  try {
    await vi.waitFor(async () => {
      const sessions = JSON.parse((await exec(executable, ["--session", name, "session", "list", "--json"], { env, windowsHide: true })).stdout);
      expect(sessions.sessions.some((session: any) => session.name === name && session.running), logs).toBe(true);
    }, { timeout: 15_000, interval: 250 });

    const template = readFileSync(join(root, "pi/herdr/herdr-plugin.toml.in"), "utf8");
    const inert = join(scratch, "layout-inert-plugin");
    mkdirSync(inert);
    writeFileSync(join(inert, "herdr-plugin.toml"), template
      .replace('id = "local.pi"', 'id = "layout.inert"')
      .replace('name = "Repository Pi launcher"', 'name = "T5 inert layout fixture"')
      .replace("@COMMAND@", JSON.stringify([process.execPath, "-e", "setInterval(() => {}, 1000)"])));
    await exec(executable, ["--session", name, "plugin", "link", inert], { env, windowsHide: true });
    linked.push("layout.inert");

    const manifestPath = join(profile, "node_modules/@earendil-works/pi-coding-agent/package.json");
    const entry = resolve(dirname(manifestPath), JSON.parse(readFileSync(manifestPath, "utf8")).bin.pi);
    const bundled = join(scratch, "bundled-pi-plugin");
    mkdirSync(bundled);
    writeFileSync(join(bundled, "herdr-plugin.toml"), template.replace("@COMMAND@", JSON.stringify([
      process.execPath, join(root, "scripts/pi-herdr-launch.mjs"), entry,
    ])));
    await exec(executable, ["--session", name, "plugin", "link", bundled], { env, windowsHide: true });
    linked.push("local.pi");

    const caller = result(await cli(["workspace", "create", "--cwd", scratch, "--label", "T5 caller", "--no-focus"])).root_pane;
    const unrelated = result(await cli(["workspace", "create", "--cwd", scratch, "--label", "T5 unrelated", "--focus"])).root_pane;
    return { scratch, env, name, server, serverClosed, cli, caller, unrelated, linked };
  } catch (error) {
    if (server.exitCode === null) server.kill();
    await serverClosed;
    rmSync(scratch, { recursive: true, force: true });
    throw error;
  }
}

async function closeFixture(fixture: Fixture) {
  for (const plugin of fixture.linked.reverse()) await fixture.cli(["plugin", "unlink", plugin]).catch(() => undefined);
  try { await fixture.cli(["server", "stop"]); } catch { /* The server may already have exited after a failed setup. */ }
  if (fixture.server.exitCode === null) fixture.server.kill();
  await fixture.serverClosed;
  rmSync(fixture.scratch, { recursive: true, force: true });
}

const inertRequest = (callerPane: string, cwd: string, index: number) => ({
  childId: `inert-${index}`,
  callerPane,
  cwd,
  title: `T5 inert ${index}`,
  plugin: "layout.inert",
  entrypoint: "pi",
});

describe.skipIf(process.env.PI_SUBAGENT_UX_LIVE !== "1")("bounded integrated subagent UX acceptance", () => {
  it("uses the production layout adapter against isolated inert panes", async () => {
    const fixture = await isolatedFixture();
    const layout = new SubagentLayout(fixture.cli);
    try {
      const before = result(await fixture.cli(["pane", "current"])).pane;
      expect(before.pane_id).toBe(fixture.unrelated.pane_id);
      const placements: Array<Awaited<ReturnType<SubagentLayout["place"]>>> = [];
      for (let index = 1; index <= 17; index++) {
        const placement = await layout.place("t5-geometry", inertRequest(fixture.caller.pane_id, fixture.scratch, index));
        placements.push(placement);
        expect(result(await fixture.cli(["pane", "current"])).pane.pane_id).toBe(fixture.unrelated.pane_id);
      }

      expect(placements[0]).toMatchObject({ tabIndex: 0, row: 0, column: 0 });
      expect(placements[3]).toMatchObject({ tabIndex: 0, row: 0, column: 3 });
      expect(placements[4]).toMatchObject({ tabIndex: 0, row: 1, column: 0 });
      expect(placements[7]).toMatchObject({ tabIndex: 0, row: 1, column: 3 });
      expect(placements[8]).toMatchObject({ tabIndex: 1, row: 0, column: 0 });
      expect(placements[16]).toMatchObject({ tabIndex: 2, row: 0, column: 0 });

      // Rectangles are exposed for the focused tab only, so inspect the owned
      // main tab explicitly and then restore the unrelated operator focus.
      await fixture.cli(["workspace", "focus", fixture.caller.workspace_id]);
      await fixture.cli(["tab", "focus", placements[0].tabId]);
      const panes = await Promise.all(placements.map(placement => inspectPane(fixture.cli, placement.paneId)));
      expect(panes.every((pane: any) => pane.label?.startsWith("T5 inert"))).toBe(true);
      // `pane get` omits rectangles; use the server-side layout query for the
      // focused main tab. Overflow identities above prove the extra tabs.
      const geometry = result(await fixture.cli(["pane", "layout", "--pane", placements[0].paneId])).layout.panes as any[];
      expect(geometry).toHaveLength(9);
      expect(geometry.every((pane: any) => pane.rect.width > 0 && pane.rect.height > 0)).toBe(true);
      const main = geometry.filter((pane: any) => pane.pane_id !== fixture.caller.pane_id);
      const row0 = main.filter((pane: any) => placements.find(placement => placement.paneId === pane.pane_id)?.row === 0);
      const row1 = main.filter((pane: any) => placements.find(placement => placement.paneId === pane.pane_id)?.row === 1);
      expect(row0.length).toBe(4);
      expect(row1.length).toBe(4);
      expect(Math.min(...row1.map((pane: any) => pane.rect.y))).toBeGreaterThan(Math.min(...row0.map((pane: any) => pane.rect.y)));
      const caller = await inspectPane(fixture.cli, fixture.caller.pane_id);
      expect(caller.pane_id).toBe(fixture.caller.pane_id);
      const callerGeometry = geometry.find((pane: any) => pane.pane_id === fixture.caller.pane_id);
      expect(callerGeometry.rect.y).toBeGreaterThan(Math.max(...main.map((pane: any) => pane.rect.y + pane.rect.height)) - 2);
      await fixture.cli(["workspace", "focus", fixture.unrelated.workspace_id]);
      expect(result(await fixture.cli(["pane", "current"])).pane.pane_id).toBe(fixture.unrelated.pane_id);
    } finally {
      for (const child of layout.snapshot("t5-geometry").reverse()) await layout.close("t5-geometry", child.childId, child.paneId).catch(() => undefined);
      expect(layout.snapshot("t5-geometry")).toHaveLength(0);
      await closeFixture(fixture);
    }
  }, 120_000);

  // Keep the model-backed case separately opt-in: the geometry acceptance is
  // safe to run with only Herdr, while this case requires working provider
  // credentials and can otherwise leave a bounded, inspectable child.
  it.skipIf(process.env.PI_SUBAGENT_UX_LIVE_REAL !== "1")("launches one bundled Pi visibly, preserves its identity for a follow-up, and cleans its pane", async () => {
    const fixture = await isolatedFixture();
    const previous = { ...process.env };
    const runtime = new SubagentRuntime();
    try {
      Object.assign(process.env, fixture.env, {
        HERDR_BIN_PATH: executable,
        HERDR_ENV: "1",
        HERDR_SOCKET_PATH: (await JSON.parse((await exec(executable, ["--session", fixture.name, "session", "list", "--json"], { env: fixture.env, windowsHide: true })).stdout)).sessions.find((session: any) => session.name === fixture.name).socket_path,
        HERDR_WORKSPACE_ID: fixture.caller.workspace_id,
        HERDR_TAB_ID: fixture.caller.tab_id,
        HERDR_PANE_ID: fixture.caller.pane_id,
      });
      writeFileSync(join(fixture.scratch, "marker.txt"), "t5-visible-marker");
      const definition: AgentDefinition = {
        name: "probe", description: "Read the T5 marker", tools: ["read"], delegates: [], skills: [],
        prompt: "Read the assigned marker and answer exactly as requested. Do not use other tools.", source: "profile", filePath: "probe.md",
      };
      const input = {
        definition,
        instructions: "Read marker.txt and reply only with its contents. Remember the marker for the follow-up.",
        cwd: fixture.scratch,
        model: "openai-codex/gpt-5.6-luna",
        effort: "low" as const,
        skills: [],
        origin: "t5-visible",
        retained: true,
        surface: "visible" as const,
      };
      let launchTimer: ReturnType<typeof setTimeout> | undefined;
      const first = await Promise.race([
        runtime.launch(input, profile, childExtension, false),
        new Promise<never>((_, reject) => { launchTimer = setTimeout(() => reject(new Error(`Bundled Pi did not complete; snapshot=${JSON.stringify(runtime.list("t5-visible"))}`)), 100_000); }),
      ]);
      if (launchTimer) clearTimeout(launchTimer);
      expect(first).toMatchObject({ surface: "visible", agent: "probe", outcome: "complete", turns: 1, paneState: "open" });
      expect(first.displayName).toMatch(/^[A-Za-z]+/);
      expect(first.assignment).toContain("marker.txt");
      expect(first.model).toBe(input.model);
      expect(first.effort).toBe("low");
      expect(first.cwd?.toLowerCase()).toBe(fixture.scratch.toLowerCase());
      expect(first.paneId).toBeTruthy();
      expect(first.result).toContain("t5-visible-marker");
      const visiblePane = await inspectPane(fixture.cli, first.paneId!);
      expect(visiblePane.label).toContain(first.displayName!);
      expect(visiblePane.label).toContain("probe");
      expect(result(await fixture.cli(["pane", "current"])).pane.pane_id).toBe(fixture.unrelated.pane_id);

      const child = runtime.get(first.id, input.origin);
      await child.message("Recall the marker from the previous exchange without reading it again. Reply only with the marker.");
      let followUpTimer: ReturnType<typeof setTimeout> | undefined;
      const followUp = await Promise.race([
        child.wait(undefined, false),
        new Promise<never>((_, reject) => { followUpTimer = setTimeout(() => reject(new Error(`Bundled Pi follow-up did not complete; snapshot=${JSON.stringify(child.snapshot())}`)), 60_000); }),
      ]);
      if (followUpTimer) clearTimeout(followUpTimer);
      expect(followUp).toMatchObject({ outcome: "complete", turns: 2, displayName: first.displayName, paneState: "open" });
      expect(followUp.assignment).toContain("Recall the marker");
      expect(followUp.result).toContain("t5-visible-marker");
      await child.finish();
      await expect(fixture.cli(["pane", "get", first.paneId!])).rejects.toThrow();
      expect(result(await fixture.cli(["pane", "get", fixture.caller.pane_id])).pane.pane_id).toBe(fixture.caller.pane_id);
      expect(result(await fixture.cli(["pane", "current"])).pane.pane_id).toBe(fixture.unrelated.pane_id);
    } finally {
      await runtime.shutdown("quit").catch(() => undefined);
      for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
      Object.assign(process.env, previous);
      await closeFixture(fixture);
    }
  }, 180_000);
});

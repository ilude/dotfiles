import { describe, expect, it, vi } from "vitest";
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectPane, result, type HerdrCli } from "../lib/herdr-cli.ts";
import { SubagentLayout } from "../lib/subagents/layout.ts";
import { createPaneFocus, currentPaneIdentity } from "../lib/subagents/herdr-layout-api.ts";
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
  let name = `subagent-ux-${process.pid}-${Date.now()}`;
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
    // Match the production caller context for mutations. Focus observation
    // must omit inherited IDs, as in herdr-background-focus.test.ts, so
    // pane current reports actual UI focus rather than the caller pane.
    const callEnv = { ...env };
    if (args[0] === "pane" && args[1] === "current" && !args.includes("--current")) {
      for (const key of ["HERDR_PANE_ID", "HERDR_TAB_ID", "HERDR_WORKSPACE_ID"]) delete callEnv[key];
    }
    const { stdout } = await exec(executable, ["--session", name, ...args], { env: callEnv, windowsHide: true, timeout: 15_000, maxBuffer: 256 * 1024 });
    return stdout;
  };
  const linked: string[] = [];
  try {
    await vi.waitFor(async () => {
      const sessions = JSON.parse((await exec(executable, ["--session", name, "session", "list", "--json"], { env, windowsHide: true })).stdout);
      const running = sessions.sessions.find((session: any) => session.running);
      expect(running, logs).toBeTruthy();
      name = running.name;
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
    const sessions = JSON.parse((await exec(executable, ["--session", name, "session", "list", "--json"], { env, windowsHide: true })).stdout).sessions;
    const socket = sessions.find((session: any) => session.name === name)?.socket_path;
    if (typeof socket !== "string") throw new Error("Isolated Herdr socket path unavailable");
    Object.assign(env, {
      HERDR_ENV: "1",
      HERDR_SOCKET_PATH: socket,
      HERDR_PANE_ID: caller.pane_id,
      HERDR_TAB_ID: caller.tab_id,
      HERDR_WORKSPACE_ID: caller.workspace_id,
    });
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
  it("preserves live pane identity while a team migrates to a dedicated tab and returns", async () => {
    const fixture = await isolatedFixture();
    try {
      const lead = result(await fixture.cli(["pane", "split", fixture.caller.pane_id, "--direction", "right", "--cwd", fixture.scratch, "--no-focus"])).pane;
      const first = result(await fixture.cli(["pane", "split", lead.pane_id, "--direction", "right", "--cwd", fixture.scratch, "--no-focus"])).pane;
      const second = result(await fixture.cli(["pane", "split", first.pane_id, "--direction", "right", "--cwd", fixture.scratch, "--no-focus"])).pane;
      const before = await Promise.all([lead, first, second].map(pane => inspectPane(fixture.cli, pane.pane_id)));
      const focusedBefore = result(await fixture.cli(["api", "snapshot"])).snapshot.focused_pane_id;

      const leadMove = result(await fixture.cli(["pane", "move", lead.pane_id, "--new-tab", "--workspace", fixture.caller.workspace_id, "--label", "isolated team", "--no-focus"])).move_result.pane;
      const dedicatedTab = leadMove.tab_id;
      const firstMove = result(await fixture.cli(["pane", "move", first.pane_id, "--tab", dedicatedTab, "--split", "right", "--target-pane", leadMove.pane_id, "--no-focus"])).move_result.pane;
      const secondMove = result(await fixture.cli(["pane", "move", second.pane_id, "--tab", dedicatedTab, "--split", "right", "--target-pane", firstMove.pane_id, "--no-focus"])).move_result.pane;
      const dedicated = await Promise.all([leadMove, firstMove, secondMove].map(pane => inspectPane(fixture.cli, pane.pane_id)));
      expect(dedicated.map(pane => pane.tab_id)).toEqual([dedicatedTab, dedicatedTab, dedicatedTab]);
      expect(dedicated.map(pane => pane.terminal_id)).toEqual(before.map(pane => pane.terminal_id));

      const leadReturn = result(await fixture.cli(["pane", "move", leadMove.pane_id, "--tab", fixture.caller.tab_id, "--split", "right", "--target-pane", fixture.caller.pane_id, "--no-focus"])).move_result.pane;
      const firstReturn = result(await fixture.cli(["pane", "move", firstMove.pane_id, "--tab", fixture.caller.tab_id, "--split", "right", "--target-pane", leadReturn.pane_id, "--no-focus"])).move_result.pane;
      const secondReturn = result(await fixture.cli(["pane", "move", secondMove.pane_id, "--tab", fixture.caller.tab_id, "--split", "right", "--target-pane", firstReturn.pane_id, "--no-focus"])).move_result.pane;
      const returned = await Promise.all([leadReturn, firstReturn, secondReturn].map(pane => inspectPane(fixture.cli, pane.pane_id)));
      expect(returned.map(pane => pane.tab_id)).toEqual([fixture.caller.tab_id, fixture.caller.tab_id, fixture.caller.tab_id]);
      expect(returned.map(pane => pane.terminal_id)).toEqual(before.map(pane => pane.terminal_id));
      expect(result(await fixture.cli(["api", "snapshot"])).snapshot.focused_pane_id).toBe(focusedBefore);
    } finally {
      await closeFixture(fixture);
    }
  }, 120_000);

  it("resolves a moved caller before launching another owned pane", async () => {
    const fixture = await isolatedFixture();
    let layout: SubagentLayout | undefined;
    try {
      const before = await inspectPane(fixture.cli,fixture.caller.pane_id);
      const response = result(await fixture.cli(["pane","move",fixture.caller.pane_id,"--new-workspace","--label","moved caller","--no-focus"]));
      const moved = response.move_result.pane;
      expect(moved.pane_id).not.toBe(fixture.caller.pane_id);
      const current = await currentPaneIdentity(fixture.cli);
      expect(current).toMatchObject({pane_id:moved.pane_id,tab_id:moved.tab_id,workspace_id:moved.workspace_id,terminal_id:before.terminal_id});
      layout = new SubagentLayout(fixture.cli,createPaneFocus(fixture.env));
      const child = await layout.place("moved-caller",inertRequest(current.pane_id,fixture.scratch,40));
      expect(child.workspaceId).toBe(current.workspace_id);
      expect((await inspectPane(fixture.cli,current.pane_id)).terminal_id).toBe(before.terminal_id);
    } finally {
      if (layout) for (const child of layout.snapshot("moved-caller").reverse()) await layout.close("moved-caller",child.childId,child.paneId).catch(()=>undefined);
      await closeFixture(fixture);
    }
  }, 120_000);

  it("migrates a growing team into readable team tabs and returns it after shrinkage", async () => {
    const fixture = await isolatedFixture();
    const layout = new SubagentLayout(fixture.cli,createPaneFocus(fixture.env));
    try {
      const lead = await layout.place("team-live",{...inertRequest(fixture.caller.pane_id,fixture.scratch,30),role:"teamlead"});
      const first = await layout.place("team-live",{...inertRequest(fixture.caller.pane_id,fixture.scratch,31),parentId:lead.childId,role:"developer"});
      const before = new Map(await Promise.all(layout.snapshot("team-live").map(async child => [child.childId,(await inspectPane(fixture.cli,child.paneId)).terminal_id] as const)));
      const descendants = [];
      for (let index=0;index<4;index++) descendants.push(await layout.place("team-live",{
        ...inertRequest(fixture.caller.pane_id,fixture.scratch,32+index),parentId:lead.childId,role:"developer",
      }));
      const migrated = layout.snapshot("team-live");
      expect(new Set(migrated.map(child => child.tabId)).size).toBe(3);
      expect(migrated.every(child => child.workspaceId !== fixture.caller.workspace_id)).toBe(true);
      expect(new Set(migrated.map(child => child.workspaceId)).size).toBe(1);
      expect((await inspectPane(fixture.cli,fixture.caller.pane_id)).workspace_id).toBe(fixture.caller.workspace_id);
      for (const tabId of new Set(migrated.map(child => child.tabId))) {
        const children = migrated.filter(child => child.tabId === tabId);
        const geometry = result(await fixture.cli(["pane","layout","--pane",children[0].paneId])).layout;
        expect(children.filter(child => child.row === 0).length).toBeLessThanOrEqual(2);
        for (const pane of geometry.panes) {
          expect(pane.rect.width).toBeGreaterThanOrEqual(50);
          expect(pane.rect.height).toBeGreaterThanOrEqual(14);
        }
        const title = result(await fixture.cli(["tab","get",tabId])).tab.label;
        expect(title).toContain("T5 inert 30 · team");
      }
      for (const child of descendants.reverse()) {
        const live = layout.snapshot("team-live").find(value => value.childId === child.childId)!;
        await layout.close("team-live",live.childId,live.paneId);
      }
      const returned = layout.snapshot("team-live");
      expect(returned).toHaveLength(2);
      expect(returned.every(child => child.tabId === fixture.caller.tab_id && child.row === 0)).toBe(true);
      for (const child of returned) expect((await inspectPane(fixture.cli,child.paneId)).terminal_id).toBe(before.get(child.childId));
      expect(returned.find(child => child.childId === first.childId)?.paneId).not.toBe(first.paneId);
      expect(returned.every(child => child.workspaceId === fixture.caller.workspace_id)).toBe(true);
      expect(result(await fixture.cli(["workspace","list"])).workspaces.some((workspace: {workspace_id:string}) => workspace.workspace_id === migrated[0].workspaceId)).toBe(false);
      expect(result(await fixture.cli(["api","snapshot"])).snapshot.focused_pane_id).toBe(fixture.unrelated.pane_id);
    } finally {
      for (const child of layout.snapshot("team-live").reverse()) await layout.close("team-live",child.childId,child.paneId).catch(()=>undefined);
      await closeFixture(fixture);
    }
  },90_000);

  it("keeps a readable single row, stable caller height, overflow names and exact live identities", async () => {
    const fixture = await isolatedFixture();
    const layout = new SubagentLayout(fixture.cli,createPaneFocus(fixture.env));
    try {
      await fixture.cli(["tab","rename",fixture.caller.tab_id,"drift"]);
      const callerBefore = await inspectPane(fixture.cli,fixture.caller.pane_id);
      const processBefore = result(await fixture.cli(["pane","process-info","--pane",fixture.caller.pane_id])).process_info;
      const placements = [];
      for (let index=1;index<=7;index++) {
        placements.push(await layout.place("geometry",inertRequest(fixture.caller.pane_id,fixture.scratch,index)));
        const snapshot = layout.snapshot("geometry");
        expect(snapshot.filter(child => child.tabIndex === 0).every(child => child.workspaceId === fixture.caller.workspace_id)).toBe(true);
        expect(snapshot.filter(child => child.tabIndex !== 0).every(child => child.workspaceId !== fixture.caller.workspace_id)).toBe(true);
        expect(new Set(snapshot.filter(child => child.tabIndex !== 0).map(child => child.workspaceId)).size).toBe(index > 2 ? 1 : 0);
        const main = result(await fixture.cli(["pane","layout","--pane",fixture.caller.pane_id])).layout;
        const caller = main.panes.find((pane: any) => pane.pane_id === fixture.caller.pane_id).rect;
        const children = main.panes.filter((pane: any) => pane.pane_id !== fixture.caller.pane_id);
        expect(children).toHaveLength(Math.min(index,2));
        expect(Math.abs(caller.height-main.area.height/2)).toBeLessThanOrEqual(1);
        expect(children.every((pane: any) => pane.rect.y+pane.rect.height <= caller.y+1)).toBe(true);
        expect(children.every((pane: any) => pane.rect.width >= 50 && pane.rect.height >= 14)).toBe(true);
        if (children.length === 2) expect(Math.abs(children[0].rect.width-children[1].rect.width)).toBeLessThanOrEqual(1);
        for (const tabId of new Set(snapshot.filter(child => child.tabIndex !== 0).map(child => child.tabId))) {
          const owned = snapshot.filter(child => child.tabId === tabId);
          expect(owned.length).toBeLessThanOrEqual(2);
          const overflow = result(await fixture.cli(["pane","layout","--pane",owned[0].paneId])).layout;
          expect(overflow.panes.every((pane: any) => pane.rect.width >= 50 && pane.rect.height >= 14)).toBe(true);
          expect(new Set(overflow.panes.map((pane: any) => pane.rect.y)).size).toBe(1);
        }
        expect(result(await fixture.cli(["api","snapshot"])).snapshot.focused_pane_id).toBe(fixture.unrelated.pane_id);
      }
      const singleton = placements.at(-1)!;
      expect(result(await fixture.cli(["tab","get",singleton.tabId])).tab.label).toBe("T5 inert 7");
      const overflow = placements[2];
      expect(result(await fixture.cli(["tab","get",overflow.tabId])).tab.label).toBe("drift · agents 2");
      await fixture.cli(["tab","rename",overflow.tabId,"Manual overflow"]);
      await layout.place("geometry",inertRequest(fixture.caller.pane_id,fixture.scratch,8));
      expect(result(await fixture.cli(["tab","get",overflow.tabId])).tab.label).toBe("Manual overflow");
      const terminals = new Map(await Promise.all(layout.snapshot("geometry").map(async child => [child.childId,(await inspectPane(fixture.cli,child.paneId)).terminal_id] as const)));
      await layout.close("geometry",placements[0].childId,placements[0].paneId);
      for (const child of layout.snapshot("geometry")) expect((await inspectPane(fixture.cli,child.paneId)).terminal_id).toBe(terminals.get(child.childId));
      expect((await inspectPane(fixture.cli,fixture.caller.pane_id)).terminal_id).toBe(callerBefore.terminal_id);
      const after = result(await fixture.cli(["pane","process-info","--pane",fixture.caller.pane_id])).process_info;
      expect(after.shell_pid).toBe(processBefore.shell_pid);
      expect(result(await fixture.cli(["api","snapshot"])).snapshot.focused_pane_id).toBe(fixture.unrelated.pane_id);
    } finally {
      for (const child of layout.snapshot("geometry").reverse()) await layout.close("geometry",child.childId,child.paneId).catch(()=>undefined);
      await closeFixture(fixture);
    }
  },120_000);

  it("preserves a manually moved divider and opens overflow instead of splitting it again", async () => {
    const fixture = await isolatedFixture();
    const layout = new SubagentLayout(fixture.cli,createPaneFocus(fixture.env));
    try {
      const first = await layout.place("manual",inertRequest(fixture.caller.pane_id,fixture.scratch,1));
      await fixture.cli(["pane","resize","--direction","up","--amount","0.15","--pane",fixture.caller.pane_id]);
      const before = result(await fixture.cli(["pane","layout","--pane",fixture.caller.pane_id])).layout;
      const next = await layout.place("manual",inertRequest(fixture.caller.pane_id,fixture.scratch,2));
      expect(next.tabId).not.toBe(first.tabId);
      const after = result(await fixture.cli(["pane","layout","--pane",fixture.caller.pane_id])).layout;
      expect(after.panes.map((pane: any) => [pane.pane_id,pane.rect])).toEqual(before.panes.map((pane: any) => [pane.pane_id,pane.rect]));
    } finally {
      for (const child of layout.snapshot("manual").reverse()) await layout.close("manual",child.childId,child.paneId).catch(()=>undefined);
      await closeFixture(fixture);
    }
  },60_000);

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
        retained: false,
        surface: "visible" as const,
      };
      let launchTimer: ReturnType<typeof setTimeout> | undefined;
      const first = await Promise.race([
        runtime.launch(input, profile, childExtension, false),
        new Promise<never>((_, reject) => { launchTimer = setTimeout(async () => {
          const snapshot = runtime.list("t5-visible");
          const paneId = snapshot[0]?.paneId;
          const pane = paneId ? await fixture.cli(["pane", "read", paneId, "--lines", "80"]).catch(error => ({ error: String(error) })) : undefined;
          reject(new Error(`Bundled Pi did not complete; snapshot=${JSON.stringify(snapshot)}; pane=${JSON.stringify(pane)}`));
        }, 100_000); }),
      ]);
      if (launchTimer) clearTimeout(launchTimer);
      expect(first).toMatchObject({ surface: "visible", agent: "probe", outcome: "complete", turns: 1, paneState: "closed" });
      expect(first.displayName).toMatch(/^[A-Za-z]+/);
      expect(first.assignment).toContain("marker.txt");
      expect(first.model).toBe(input.model);
      expect(first.effort).toBe("low");
      expect(first.cwd?.toLowerCase()).toBe(fixture.scratch.toLowerCase());
      expect(first.paneId).toBeTruthy();
      expect(first.result).toContain("t5-visible-marker");
      await expect(fixture.cli(["pane", "get", first.paneId!])).rejects.toThrow();
      expect(result(await fixture.cli(["pane", "current"])).pane.pane_id).toBe(fixture.unrelated.pane_id);

      await runtime.message(first.id, input.origin, "Recall the marker from the previous exchange without reading it again. Reply only with the marker.");
      const child = runtime.get(first.id, input.origin);
      let followUpTimer: ReturnType<typeof setTimeout> | undefined;
      const followUp = await Promise.race([
        child.wait(undefined, false),
        new Promise<never>((_, reject) => { followUpTimer = setTimeout(() => reject(new Error(`Bundled Pi follow-up did not complete; snapshot=${JSON.stringify(child.snapshot())}`)), 60_000); }),
      ]);
      if (followUpTimer) clearTimeout(followUpTimer);
      expect(followUp).toMatchObject({ outcome: "complete", turns: 2, displayName: first.displayName, paneState: "closed" });
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

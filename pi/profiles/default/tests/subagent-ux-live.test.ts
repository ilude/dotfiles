import { describe, expect, it, vi } from "vitest";
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectPane, result, type HerdrCli } from "../lib/herdr-cli.ts";
import { SubagentLayout } from "../lib/subagents/layout.ts";
import { createPaneFocus } from "../lib/subagents/herdr-layout-api.ts";
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
    // Match the production caller context for mutations. Focus observation
    // must omit inherited IDs, as in herdr-background-focus.test.ts, so
    // pane current reports actual UI focus rather than the caller pane.
    const callEnv = { ...env };
    if (args[0] === "pane" && args[1] === "current") {
      for (const key of ["HERDR_PANE_ID", "HERDR_TAB_ID", "HERDR_WORKSPACE_ID"]) delete callEnv[key];
    }
    const { stdout } = await exec(executable, ["--session", name, ...args], { env: callEnv, windowsHide: true, timeout: 15_000, maxBuffer: 256 * 1024 });
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
  it("uses the production layout adapter against isolated inert panes", async () => {
    const fixture = await isolatedFixture();
    let switchAfterOpen = false;
    const layoutCli: HerdrCli = async args => {
      const response = await fixture.cli(args);
      if (switchAfterOpen && args[0] === "plugin" && args[1] === "pane" && args[2] === "open") {
        switchAfterOpen = false;
        await fixture.cli(["workspace", "focus", fixture.unrelated.workspace_id]);
      }
      return response;
    };
    const layout = new SubagentLayout(layoutCli, createPaneFocus(fixture.env));
    try {
      await fixture.cli(["tab", "rename", fixture.caller.tab_id, "drift"]);
      const namedOrigin = result(await fixture.cli(["tab", "get", fixture.caller.tab_id])).tab;
      const unrelatedBefore = result(await fixture.cli(["tab", "get", fixture.unrelated.tab_id])).tab;
      expect(namedOrigin.label).toBe("drift");
      const before = result(await fixture.cli(["pane", "current"])).pane;
      expect(before.pane_id).toBe(fixture.unrelated.pane_id);
      const processIdentity = async (paneId: string) => {
        const info = result(await fixture.cli(["pane", "process-info", "--pane", paneId])).process_info;
        return {
          pane_id: info.pane_id,
          shell_pid: info.shell_pid,
          foreground_processes: (info.foreground_processes ?? []).map((process: any) => ({ pid: process.pid, name: process.name, argv: process.argv })),
        };
      };
      const callerBefore = await inspectPane(fixture.cli, fixture.caller.pane_id);
      const callerProcessBefore = await processIdentity(fixture.caller.pane_id);
      const placements: Array<Awaited<ReturnType<SubagentLayout["place"]>>> = [];
      const geometryAt: Record<number, { main: any[]; overflow?: any[] }> = {};
      const callerIdentityAt: Record<number, { pane: any; process: any }> = {};
      for (let index = 1; index <= 17; index++) {
        if (index === 2) switchAfterOpen = true;
        const placement = await layout.place("t5-geometry", inertRequest(fixture.caller.pane_id, fixture.scratch, index));
        placements.push(placement);
        if (placement.tabIndex > 0) {
          const title = result(await fixture.cli(["tab", "get", placement.tabId])).tab.label;
          const singleton = placement.row === 0 && placement.column === 0;
          expect(title).toBe(singleton ? `T5 inert ${index}` : `drift · agents ${placement.tabIndex + 1}`);
        }
        expect(result(await fixture.cli(["pane", "current"])).pane.pane_id).toBe(fixture.unrelated.pane_id);
        if ([1, 4, 5, 8, 9].includes(index)) {
          const mainSnapshot = result(await fixture.cli(["pane", "layout", "--pane", placements[0].paneId])).layout;
          const main = mainSnapshot.panes.filter((pane: any) => placements.some(item => item.tabIndex === 0 && item.paneId === pane.pane_id) || pane.pane_id === fixture.caller.pane_id);
          const overflow = index === 9
            ? result(await fixture.cli(["pane", "layout", "--pane", placement.paneId])).layout.panes
            : undefined;
          geometryAt[index] = { main, overflow };
          callerIdentityAt[index] = {
            pane: await inspectPane(fixture.cli, fixture.caller.pane_id),
            process: await processIdentity(fixture.caller.pane_id),
          };
        }
      }

      const assertMainRows = (count: number, expectedUpper: number, expectedLower: number) => {
        const panes = geometryAt[count].main;
        const owned = panes.filter((pane: any) => placements.some(placement => placement.paneId === pane.pane_id && placement.tabIndex === 0));
        const callerPane = panes.find((pane: any) => pane.pane_id === fixture.caller.pane_id);
        expect(callerPane).toBeTruthy();
        const caller = callerPane.rect;
        const row = (rowIndex: number) => owned
          .filter((pane: any) => placements.find(item => item.paneId === pane.pane_id)?.row === rowIndex)
          .sort((left: any, right: any) => left.rect.x - right.rect.x);
        for (const [rowIndex, expected] of [[0, expectedUpper], [1, expectedLower]] as const) {
          const members = row(rowIndex);
          expect(members).toHaveLength(expected);
          expect(members.every((pane: any) => pane.rect.width > 0 && pane.rect.height > 0)).toBe(true);
          if (!members.length) continue;
          expect(Math.max(...members.map((pane: any) => pane.rect.y)) - Math.min(...members.map((pane: any) => pane.rect.y))).toBeLessThanOrEqual(1);
          expect(Math.max(...members.map((pane: any) => pane.rect.y + pane.rect.height))).toBeLessThanOrEqual(caller.y + 1);
          const expectedIds = placements.filter(placement => placement.tabIndex === 0 && placement.row === rowIndex).slice(0, expected).map(placement => placement.paneId);
          expect(members.map((pane: any) => pane.pane_id)).toEqual(expectedIds);
        }
        const upperTop = Math.min(...owned.map((pane: any) => pane.rect.y));
        const ownedLeft = Math.min(...owned.map((pane: any) => pane.rect.x));
        const ownedRight = Math.max(...owned.map((pane: any) => pane.rect.x + pane.rect.width));
        const totalHeight = caller.y + caller.height - upperTop;
        expect(caller.x).toBe(ownedLeft);
        expect(caller.x + caller.width).toBe(ownedRight);
        expect(Math.abs(caller.height - totalHeight / 3)).toBeLessThanOrEqual(1);
        expect(callerIdentityAt[count].pane).toMatchObject({
          pane_id: callerBefore.pane_id,
          tab_id: callerBefore.tab_id,
          workspace_id: callerBefore.workspace_id,
        });
        expect(callerIdentityAt[count].process).toEqual(callerProcessBefore);
        return { owned, caller, row };
      };
      expect(assertMainRows(1, 1, 0).owned[0].pane_id).toBe(placements[0].paneId);
      assertMainRows(4, 4, 0);
      const five = assertMainRows(5, 4, 1);
      expect(five.row(1)[0].rect.y).toBeGreaterThan(five.row(0)[0].rect.y);
      expect(Math.abs(five.row(1)[0].rect.x - five.row(0)[0].rect.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(five.row(1)[0].rect.width - five.row(0)[0].rect.width)).toBeLessThanOrEqual(1);
      const eight = assertMainRows(8, 4, 4);
      for (const members of [eight.row(0), eight.row(1)]) {
        const widths = members.map((pane: any) => pane.rect.width);
        const left = Math.min(...members.map((pane: any) => pane.rect.x));
        const right = Math.max(...members.map((pane: any) => pane.rect.x + pane.rect.width));
        expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
        expect(left).toBe(eight.caller.x);
        expect(right).toBe(eight.caller.x + eight.caller.width);
      }
      for (let column = 0; column < 4; column++) {
        expect(Math.abs(eight.row(0)[column].rect.x - eight.row(1)[column].rect.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(eight.row(0)[column].rect.width - eight.row(1)[column].rect.width)).toBeLessThanOrEqual(1);
        expect(eight.row(0)[column].rect.y + eight.row(0)[column].rect.height).toBeLessThanOrEqual(eight.row(1)[column].rect.y + 1);
      }
      assertMainRows(9, 4, 4);
      const nineOverflow = geometryAt[9].overflow!;
      expect(nineOverflow).toHaveLength(1);
      expect(nineOverflow[0].pane_id).toBe(placements[8].paneId);
      expect(nineOverflow[0].rect.width).toBeGreaterThan(0);
      expect(nineOverflow[0].rect.height).toBeGreaterThan(0);
      expect(placements[0]).toMatchObject({ tabIndex: 0, row: 0, column: 0 });
      expect(placements[3]).toMatchObject({ tabIndex: 0, row: 0, column: 3 });
      expect(placements[4]).toMatchObject({ tabIndex: 0, row: 1, column: 0 });
      expect(placements[7]).toMatchObject({ tabIndex: 0, row: 1, column: 3 });
      expect(placements[8]).toMatchObject({ tabIndex: 1, row: 0, column: 0 });
      expect(placements[15]).toMatchObject({ tabIndex: 1, row: 1, column: 3 });
      expect(placements[16]).toMatchObject({ tabIndex: 2, row: 0, column: 0 });

      const panes = await Promise.all(placements.map(placement => inspectPane(fixture.cli, placement.paneId)));
      expect(panes.every((pane: any) => pane.label?.startsWith("T5 inert"))).toBe(true);
      const geometry = result(await fixture.cli(["pane", "layout", "--pane", placements[0].paneId])).layout.panes as any[];
      expect(geometry).toHaveLength(9);
      expect(geometry.every((pane: any) => pane.rect.width > 0 && pane.rect.height > 0)).toBe(true);
      const overflowGeometry = result(await fixture.cli(["pane", "layout", "--pane", placements[8].paneId])).layout.panes as any[];
      expect(overflowGeometry).toHaveLength(8);
      for (const rowIndex of [0, 1]) {
        const rowPanes = overflowGeometry.filter((pane: any) => placements.find(placement => placement.paneId === pane.pane_id)?.row === rowIndex);
        expect(rowPanes).toHaveLength(4);
        expect(Math.max(...rowPanes.map((pane: any) => pane.rect.y)) - Math.min(...rowPanes.map((pane: any) => pane.rect.y))).toBeLessThanOrEqual(1);
        const widths = rowPanes.map((pane: any) => pane.rect.width);
        expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
      }
      expect(placements.filter(placement => placement.tabIndex === 1)).toHaveLength(8);
      expect(new Set(placements.slice(8, 16).map(placement => placement.tabId)).size).toBe(1);
      expect(placements[8].tabId).not.toBe(placements[0].tabId);
      expect(placements.filter(placement => placement.tabIndex === 2)).toHaveLength(1);
      expect(placements[16].tabId).not.toBe(placements[8].tabId);
      const overflowTabs = new Map<number, string>();
      for (const placement of placements) if (placement.tabIndex > 0) overflowTabs.set(placement.tabIndex, placement.tabId);
      expect([...overflowTabs.keys()]).toEqual([1, 2]);
      for (const [tabIndex, tabId] of overflowTabs) {
        const tab = result(await fixture.cli(["tab", "get", tabId])).tab;
        expect(tab.label).toBe(tabIndex === 2 ? "T5 inert 17" : `drift · agents ${tabIndex + 1}`);
      }
      const manualTabId = placements[8].tabId;
      await fixture.cli(["tab", "rename", manualTabId, "Manual overflow"]);
      const additional = await layout.place("t5-geometry", inertRequest(fixture.caller.pane_id, fixture.scratch, 18));
      expect(additional).toMatchObject({ tabIndex: 2, row: 0, column: 1 });
      expect(result(await fixture.cli(["tab", "get", additional.tabId])).tab.label).toBe("drift · agents 3");
      await layout.close("t5-geometry", placements[16].childId, placements[16].paneId);
      expect(result(await fixture.cli(["tab", "get", additional.tabId])).tab.label).toBe("T5 inert 18");
      for (const child of placements.slice(8, 11)) {
        await layout.close("t5-geometry", child.childId, child.paneId);
        expect(result(await fixture.cli(["tab", "get", manualTabId])).tab.label).toBe("Manual overflow");
      }
      const manualJoin = await layout.place("t5-geometry", inertRequest(fixture.caller.pane_id, fixture.scratch, 20));
      expect(manualJoin.tabId).toBe(manualTabId);
      expect(result(await fixture.cli(["tab", "get", manualTabId])).tab.label).toBe("Manual overflow");
      expect(result(await fixture.cli(["tab", "get", fixture.caller.tab_id])).tab.label).toBe("drift");
      expect(result(await fixture.cli(["tab", "get", fixture.unrelated.tab_id])).tab.label).toBe(unrelatedBefore.label);
      expect(result(await fixture.cli(["pane", "current"])).pane.pane_id).toBe(fixture.unrelated.pane_id);
      const row0 = geometry.filter((pane: any) => placements.find(placement => placement.paneId === pane.pane_id)?.row === 0);
      expect(row0.length).toBe(4);
      const caller = await inspectPane(fixture.cli, fixture.caller.pane_id);
      expect(caller.pane_id).toBe(fixture.caller.pane_id);
      const callerGeometry = geometry.find((pane: any) => pane.pane_id === fixture.caller.pane_id);
      expect(Math.max(...row0.map((pane: any) => pane.rect.y + pane.rect.height))).toBeLessThanOrEqual(callerGeometry.rect.y + 1);
      const upperTop = Math.min(...geometry.filter((pane: any) => placements.find(placement => placement.paneId === pane.pane_id)?.tabIndex === 0).map((pane: any) => pane.rect.y));
      const totalHeight = callerGeometry.rect.y + callerGeometry.rect.height - upperTop;
      expect(Math.abs(callerGeometry.rect.height - totalHeight / 3)).toBeLessThanOrEqual(1);

      // Remove one upper pane from the complete 2x4 main grid while its lower
      // partner survives, then refill that exact row-major slot.
      const vacated = placements[1];
      const survivingLower = placements[5];
      const survivingProcess = await processIdentity(survivingLower.paneId);
      await layout.close("t5-geometry", vacated.childId, vacated.paneId);
      expect(await processIdentity(survivingLower.paneId)).toEqual(survivingProcess);
      const vacancyReplacement = await layout.place("t5-geometry", inertRequest(fixture.caller.pane_id, fixture.scratch, 19));
      expect(vacancyReplacement).toMatchObject({ tabIndex: 0, row: 0, column: 1, tabId: survivingLower.tabId });
      const refilled = result(await fixture.cli(["pane", "layout", "--pane", vacancyReplacement.paneId])).layout.panes as any[];
      const refilledChildren = layout.snapshot("t5-geometry").filter(child => child.tabIndex === 0);
      for (let column = 0; column < 4; column++) {
        const upperChild = refilledChildren.find(child => child.row === 0 && child.column === column)!;
        const lowerChild = refilledChildren.find(child => child.row === 1 && child.column === column)!;
        const upperRect = refilled.find(pane => pane.pane_id === upperChild.paneId).rect;
        const lowerRect = refilled.find(pane => pane.pane_id === lowerChild.paneId).rect;
        expect(Math.abs(upperRect.x - lowerRect.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(upperRect.width - lowerRect.width)).toBeLessThanOrEqual(1);
        expect(upperRect.y + upperRect.height).toBeLessThanOrEqual(lowerRect.y + 1);
      }
      expect(await processIdentity(survivingLower.paneId)).toEqual(survivingProcess);
      expect(await processIdentity(fixture.caller.pane_id)).toEqual(callerProcessBefore);
      expect((await inspectPane(fixture.cli, fixture.caller.pane_id)).pane_id).toBe(callerBefore.pane_id);
      expect(result(await fixture.cli(["pane", "current"])).pane.pane_id).toBe(fixture.unrelated.pane_id);

      // Remove both panes from one complete column, then refill both slots.
      // The surviving six processes must keep their identities while the new
      // pair restores one physical row-major column rather than nesting inside
      // the previous upper half.
      const completeBeforeClose = result(await fixture.cli(["pane", "layout", "--pane", vacancyReplacement.paneId])).layout.panes as any[];
      const columnUpper = layout.snapshot("t5-geometry").find(child => child.tabIndex === 0 && child.row === 0 && child.column === 1)!;
      const columnLower = layout.snapshot("t5-geometry").find(child => child.tabIndex === 0 && child.row === 1 && child.column === 1)!;
      const columnSurvivors = layout.snapshot("t5-geometry").filter(child => child.tabIndex === 0 && child.column !== 1);
      const survivorProcesses = new Map(await Promise.all(columnSurvivors.map(async child => [child.paneId, await processIdentity(child.paneId)] as const)));
      await layout.close("t5-geometry", columnUpper.childId, columnUpper.paneId);
      await layout.close("t5-geometry", columnLower.childId, columnLower.paneId);
      const afterCompleteClose = result(await fixture.cli(["pane", "layout", "--pane", columnSurvivors[0].paneId])).layout.panes as any[];
      const upperRefill = await layout.place("t5-geometry", inertRequest(fixture.caller.pane_id, fixture.scratch, 22));
      const afterUpperRefill = result(await fixture.cli(["pane", "layout", "--pane", upperRefill.paneId])).layout.panes as any[];
      const lowerRefill = await layout.place("t5-geometry", inertRequest(fixture.caller.pane_id, fixture.scratch, 23));
      const afterLowerRefill = result(await fixture.cli(["pane", "layout", "--pane", lowerRefill.paneId])).layout.panes as any[];
      expect(upperRefill).toMatchObject({ tabIndex: 0, row: 0, column: 3 });
      expect(lowerRefill).toMatchObject({ tabIndex: 0, row: 1, column: 3 });
      for (const child of columnSurvivors) expect(await processIdentity(child.paneId)).toEqual(survivorProcesses.get(child.paneId));
      expect(await processIdentity(fixture.caller.pane_id)).toEqual(callerProcessBefore);
      expect(result(await fixture.cli(["pane", "current"])).pane.pane_id).toBe(fixture.unrelated.pane_id);
      const completeRefillChildren = layout.snapshot("t5-geometry").filter(child => child.tabIndex === 0);
      const completeRows = [0, 1].map(row => completeRefillChildren
        .filter(child => child.row === row)
        .sort((left, right) => left.column - right.column)
        .map(child => afterLowerRefill.find(pane => pane.pane_id === child.paneId)));
      const completeCaller = afterLowerRefill.find(pane => pane.pane_id === fixture.caller.pane_id).rect;
      const fullColumnEvidence = { completeBeforeClose, afterCompleteClose, afterUpperRefill, afterLowerRefill };
      expect(completeRows.every(row => row.length === 4 && row.every(pane => pane?.rect)), JSON.stringify(fullColumnEvidence)).toBe(true);
      expect(completeRows.every(row => {
        const widths = row.map(pane => pane.rect.width);
        const tops = row.map(pane => pane.rect.y);
        const bottoms = row.map(pane => pane.rect.y + pane.rect.height);
        return Math.max(...widths) - Math.min(...widths) <= 1
          && Math.max(...tops) - Math.min(...tops) <= 1
          && Math.max(...bottoms) - Math.min(...bottoms) <= 1;
      }), JSON.stringify(fullColumnEvidence)).toBe(true);
      expect(completeRows[0].every((upperPane, column) => {
        const lowerPane = completeRows[1][column];
        return Math.abs(upperPane.rect.x - lowerPane.rect.x) <= 1
          && Math.abs(upperPane.rect.width - lowerPane.rect.width) <= 1
          && upperPane.rect.y + upperPane.rect.height <= lowerPane.rect.y + 1;
      }), JSON.stringify(fullColumnEvidence)).toBe(true);
      expect(Math.min(...completeRows[0].map(pane => pane.rect.x))).toBe(completeCaller.x);
      expect(Math.max(...completeRows[0].map(pane => pane.rect.x + pane.rect.width))).toBe(completeCaller.x + completeCaller.width);
      const completeTop = Math.min(...completeRows.flat().map(pane => pane.rect.y));
      const completeHeight = completeCaller.y + completeCaller.height - completeTop;
      expect(Math.abs(completeCaller.height - completeHeight / 3)).toBeLessThanOrEqual(1);
      expect((await inspectPane(fixture.cli, fixture.caller.pane_id)).pane_id).toBe(callerBefore.pane_id);

      await layout.close("t5-geometry", placements[0].childId, placements[0].paneId);
      expect(result(await fixture.cli(["pane", "current"])).pane.pane_id).toBe(fixture.unrelated.pane_id);
      // Recreate the upper region while overflow survives, this time with the
      // orchestrator itself focused. Its exact pane must remain the caller.
      for (const child of layout.snapshot("t5-geometry").filter(child => child.tabIndex === 0)) await layout.close("t5-geometry", child.childId, child.paneId);
      await createPaneFocus(fixture.env)(fixture.caller.pane_id);
      const replacement = await layout.place("t5-geometry", inertRequest(fixture.caller.pane_id, fixture.scratch, 21));
      expect(replacement.tabIndex).toBe(0);
      expect(result(await fixture.cli(["pane", "current"])).pane.pane_id).toBe(fixture.caller.pane_id);
      const recreated = result(await fixture.cli(["pane", "layout", "--pane", replacement.paneId])).layout.panes;
      const upper = recreated.find((pane: any) => pane.pane_id === replacement.paneId).rect;
      const lower = recreated.find((pane: any) => pane.pane_id === fixture.caller.pane_id).rect;
      expect(upper.y + upper.height).toBeLessThanOrEqual(lower.y + 1);
      expect((await inspectPane(fixture.cli, fixture.caller.pane_id)).pane_id).toBe(callerBefore.pane_id);
      expect(await processIdentity(fixture.caller.pane_id)).toEqual(callerProcessBefore);
    } finally {
      try {
        for (const child of layout.snapshot("t5-geometry").reverse()) await layout.close("t5-geometry", child.childId, child.paneId);
        expect(layout.snapshot("t5-geometry")).toHaveLength(0);
      } finally { await closeFixture(fixture); }
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
        new Promise<never>((_, reject) => { launchTimer = setTimeout(async () => {
          const snapshot = runtime.list("t5-visible");
          const paneId = snapshot[0]?.paneId;
          const pane = paneId ? await fixture.cli(["pane", "read", paneId, "--lines", "80"]).catch(error => ({ error: String(error) })) : undefined;
          reject(new Error(`Bundled Pi did not complete; snapshot=${JSON.stringify(snapshot)}; pane=${JSON.stringify(pane)}`));
        }, 100_000); }),
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

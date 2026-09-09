import { describe, expect, it, vi } from "vitest";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { executePlans } from "../extensions/plans.ts";
import { getThemeByName } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import { stripTerminalSequences } from "@earendil-works/pi-tui";

const exec = promisify(execFile);

describe.skipIf(process.env.PI_PLANS_HERDR_LIVE !== "1")("isolated plan-tab focus acceptance", () => {
  it("focuses one real plugin tab and delivers the plan command through the real bootstrap", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "plans-herdr-live-"));
    const name = `plans-${process.pid}-${Date.now()}`;
    const executable = process.env.HERDR_BIN_PATH || "herdr";
    const previous = { ...process.env };
    const env: NodeJS.ProcessEnv = { ...process.env,
      APPDATA: join(scratch, "roaming"), LOCALAPPDATA: join(scratch, "local"),
      XDG_CONFIG_HOME: join(scratch, "config"), XDG_DATA_HOME: join(scratch, "data"), XDG_STATE_HOME: join(scratch, "state"),
      HERDR_CONFIG_PATH: join(scratch, "config.toml"),
    };
    for (const key of ["HERDR_ENV", "HERDR_SOCKET_PATH", "HERDR_WORKSPACE_ID", "HERDR_TAB_ID", "HERDR_PANE_ID", "HERDR_PLUGIN_ID", "PI_HERDR_CWD", "PI_HERDR_SESSION_FILE", "PI_HERDR_PLAN_PATH"]) delete env[key];
    mkdirSync(env.APPDATA!, { recursive: true }); mkdirSync(env.LOCALAPPDATA!, { recursive: true });
    writeFileSync(env.HERDR_CONFIG_PATH!, '[ui.sound]\nenabled = false\n[ui.toast]\ndelivery = "off"\n[session]\nresume_agents_on_restore = false\n');
    const server = spawn(executable, ["--session", name, "server"], { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const serverClosed = new Promise<void>(resolve => server.once("close", () => resolve()));
    let logs = "";
    server.stdout.on("data", chunk => { logs = (logs + chunk).slice(-8000); });
    server.stderr.on("data", chunk => { logs = (logs + chunk).slice(-8000); });
    const cli = async (args: string[]) => {
      const { stdout } = await exec(executable, ["--session", name, ...args], { env, windowsHide: true, timeout: 15_000, maxBuffer: 256 * 1024 });
      return stdout.trim().startsWith("{") ? JSON.parse(stdout) : stdout;
    };
    try {
      let socket = "";
      await vi.waitFor(async () => {
        const listed = await cli(["session", "list", "--json"]);
        socket = listed.sessions.find((session: any) => session.name === name && session.running)?.socket_path ?? "";
        expect(socket, logs).not.toBe("");
      }, { timeout: 15_000, interval: 250 });
      expect(socket.toLowerCase()).toContain(scratch.toLowerCase());
      env.HERDR_SOCKET_PATH = socket;
      expect((await cli(["plugin", "list", "--json"])).result.plugins).toEqual([]);
      const profile = join(scratch, "fixture"); const plugin = join(scratch, "plugin");
      mkdirSync(profile); mkdirSync(plugin); mkdirSync(join(scratch, ".specs", "inert"), { recursive: true });
      writeFileSync(join(scratch, ".specs", "inert", "plan.md"), "# Inert acceptance fixture\n");
      const entry = join(scratch, "entry.mjs");
      const receiptFile = join(scratch, "started.json");
      // This is not Pi: it records argv and stays alive. No model, tools, or plan execution.
      writeFileSync(entry, `import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(receiptFile)},JSON.stringify(process.argv.slice(2)));console.log('INERT PLAN TAB READY');setInterval(()=>{},1000);`);
      writeFileSync(join(plugin, "herdr-plugin.toml"), readFileSync(resolve("../../../pi/herdr/herdr-plugin.toml.in"), "utf8")
        .replace("@COMMAND@", JSON.stringify([process.execPath, resolve("../../../scripts/pi-herdr-launch.mjs"), entry])));
      await cli(["plugin", "link", plugin]);
      const origin = await cli(["workspace", "create", "--cwd", scratch, "--label", "plan focus acceptance", "--no-focus"]);
      const workspace = origin.result.workspace.workspace_id;
      await cli(["tab", "focus", origin.result.tab.tab_id]);
      for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
      Object.assign(process.env, env, { PI_CODING_AGENT_DIR: profile, HERDR_ENV: "1", HERDR_WORKSPACE_ID: workspace,
        HERDR_TAB_ID: origin.result.tab.tab_id, HERDR_PANE_ID: origin.result.root_pane.pane_id });
      const frames: string[] = [];
      const custom = vi.fn((factory: any) => new Promise(resolve => {
        let picker: any;
        const tui = { terminal: { rows: 35 }, requestRender() { frames.push(picker.render(100).map(stripTerminalSequences).join("\n")); } };
        picker = factory(tui, getThemeByName("dark"), {}, resolve);
        picker.handleInput("d"); picker.handleInput("d"); picker.handleInput("r");
      }));
      await executePlans({ mode: "tui", cwd: scratch, ui: { custom, notify: vi.fn() } } as any, { sendUserMessage: vi.fn() });
      expect(custom).toHaveBeenCalledOnce();
      expect(frames.some(frame => frame.includes("Launching new tab..."))).toBe(true);
      expect(frames.some(frame => frame.includes("Plans · Details"))).toBe(false);
      const focused = (await cli(["workspace", "get", workspace])).result.workspace;
      expect(focused.active_tab_id).not.toBe(origin.result.tab.tab_id);
      expect(focused.tab_count).toBe(2);
      await vi.waitFor(() => expect(JSON.parse(readFileSync(receiptFile, "utf8"))).toEqual(["/do-it .specs/inert/plan.md"]), { timeout: 10_000, interval: 100 });
    } finally {
      for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
      Object.assign(process.env, previous);
      try { await cli(["server", "stop"]); }
      finally { if (server.exitCode === null) server.kill(); await serverClosed; rmSync(scratch, { recursive: true, force: true }); }
    }
  }, 60_000);
});

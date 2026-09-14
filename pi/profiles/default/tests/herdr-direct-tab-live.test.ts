import { describe, expect, it, vi } from "vitest";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const profile = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(profile, "../../..");

describe.skipIf(process.env.PI_HERDR_DIRECT_LIVE !== "1")("isolated ordinary Pi plugin tab acceptance", () => {
  it("registers the exact tab pane and preserves its lifecycle and Windows session across reload", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "pi-herdr-direct-live-"));
    const name = `direct-${process.pid}-${Date.now()}`;
    const executable = process.env.HERDR_BIN_PATH || "herdr";
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      APPDATA: join(scratch, "registry"), LOCALAPPDATA: join(scratch, "local"),
      XDG_CONFIG_HOME: join(scratch, "xdg-config"), XDG_DATA_HOME: join(scratch, "xdg-data"), XDG_STATE_HOME: join(scratch, "xdg-state"),
      HERDR_CONFIG_PATH: join(scratch, `${name}.toml`),
    };
    for (const key of Object.keys(env)) if (key.startsWith("HERDR_") && key !== "HERDR_CONFIG_PATH" && key !== "HERDR_BIN_PATH") delete env[key];
    mkdirSync(env.APPDATA!, { recursive: true }); mkdirSync(env.LOCALAPPDATA!, { recursive: true });
    writeFileSync(env.HERDR_CONFIG_PATH!, '[ui.sound]\nenabled = false\n[ui.toast]\ndelivery = "off"\n[session]\nresume_agents_on_restore = false\n');
    const server = spawn(executable, ["--session", name, "server"], { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const closed = new Promise<void>(done => server.once("close", () => done()));
    let logs = ""; server.stdout.on("data", c => { logs = (logs + c).slice(-12000); }); server.stderr.on("data", c => { logs = (logs + c).slice(-12000); });
    const cli = async (args: string[]) => {
      const { stdout } = await exec(executable, ["--session", name, ...args], { env, windowsHide: true, timeout: 20_000, maxBuffer: 256 * 1024 });
      return stdout.trim().startsWith("{") ? JSON.parse(stdout) : stdout;
    };
    const agents = async () => (await cli(["agent", "list"])).result.agents as Array<Record<string, unknown>>;
    try {
      let socket = "";
      await vi.waitFor(async () => {
        const sessions = await cli(["session", "list", "--json"]);
        socket = sessions.sessions.find((s: any) => s.name === name && s.running)?.socket_path ?? "";
        expect(socket, logs).not.toBe("");
      }, { timeout: 15_000, interval: 250 });
      expect(env.HERDR_CONFIG_PATH).toContain(name);
      expect(socket.toLowerCase()).toContain(scratch.toLowerCase());
      expect((await cli(["plugin", "list", "--json"])).result.plugins).toEqual([]);
      const plugin = join(scratch, "plugin"); mkdirSync(plugin);
      const fixtureProfile = join(scratch, "fixture-profile"); mkdirSync(join(fixtureProfile, "extensions"), { recursive: true });
      writeFileSync(join(fixtureProfile, "extensions", "herdr-agent-state.ts"), readFileSync(join(profile, "extensions/herdr-agent-state.ts"), "utf8"));
      copyFileSync(join(profile, "auth.json"), join(fixtureProfile, "auth.json"));
      writeFileSync(join(fixtureProfile, "settings.json"), JSON.stringify({ defaultProvider: "openai-codex", defaultModel: "gpt-5.6-luna", defaultThinkingLevel: "low", defaultProjectTrust: "trust" }));
      const manifestPath = join(profile, "node_modules/@earendil-works/pi-coding-agent/package.json");
      const entry = resolve(dirname(manifestPath), JSON.parse(readFileSync(manifestPath, "utf8")).bin.pi);
      writeFileSync(join(plugin, "herdr-plugin.toml"), readFileSync(join(root, "pi/herdr/herdr-plugin.toml.in"), "utf8")
        .replace("@COMMAND@", JSON.stringify([process.execPath, join(root, "scripts/pi-herdr-launch.mjs"), entry])));
      await cli(["plugin", "link", plugin]);
      const workspace = (await cli(["workspace", "create", "--cwd", root, "--label", "direct Pi acceptance", "--no-focus"])).result;
      const opened = (await cli(["plugin", "pane", "open", "--plugin", "local.pi", "--entrypoint", "pi", "--placement", "tab", "--workspace", workspace.workspace.workspace_id, "--cwd", root, "--env", `PI_HERDR_PROFILE_DIR=${fixtureProfile}`, "--no-focus"])).result.plugin_pane.pane;
      const paneId = opened.pane_id as string;
      const tabId = opened.tab_id as string;
      const paneList = (await cli(["pane", "list", "--workspace", workspace.workspace.workspace_id])).result.panes;
      expect(paneList.filter((p: any) => p.tab_id === tabId).map((p: any) => p.pane_id)).toEqual([paneId]);
      let sessionPath = "";
      await vi.waitFor(async () => {
        const currentAgents = await agents();
        const agent = currentAgents.find(a => a.pane_id === paneId) as any;
        const paneOutput = await cli(["pane", "read", paneId, "--source", "recent-unwrapped", "--lines", "80"]).catch(error => String(error));
        expect(agent, `${logs}\n${JSON.stringify(currentAgents)}\n${JSON.stringify(paneOutput)}`).toBeDefined(); expect(agent.agent_status ?? agent.state ?? agent.status, JSON.stringify(agent)).toBe("idle");
        sessionPath = agent.agent_session?.value ?? agent.agent_session_path ?? agent.session_path ?? "";
        expect(isAbsolute(sessionPath)).toBe(true);
        if (process.platform === "win32") expect(sessionPath).toMatch(/^[A-Za-z]:\\/);
      }, { timeout: 30_000, interval: 200 }).catch(async error => {
        throw new Error(`${String(error)}\nplugin logs: ${JSON.stringify(await cli(["plugin", "log", "list", "--plugin", "local.pi", "--limit", "20"]))}`);
      });
      const turn = cli(["agent", "prompt", paneId, "Reply only: direct registration settled.", "--wait", "--timeout", "40000"]);
      await vi.waitFor(async () => { const agent = (await agents()).find((a: any) => a.pane_id === paneId) as any; expect(agent?.agent_status ?? agent?.state ?? agent?.status, JSON.stringify(agent)).toBe("working"); }, { timeout: 10_000, interval: 25 });
      await turn;
      await vi.waitFor(async () => { const agent = (await agents()).find((a: any) => a.pane_id === paneId) as any; expect(agent?.agent_status ?? agent?.state ?? agent?.status, JSON.stringify(agent)).toBe("done"); }, { timeout: 40_000, interval: 100 });
      await cli(["agent", "prompt", paneId, "/reload"]);
      await vi.waitFor(async () => {
        const agent = (await agents()).find((a: any) => a.pane_id === paneId) as any;
        expect(agent?.agent_status ?? agent?.state ?? agent?.status, JSON.stringify(agent)).toBe("done"); expect(agent?.agent_session?.value ?? agent?.agent_session_path ?? agent?.session_path).toBe(sessionPath);
      }, { timeout: 15_000, interval: 100 });
      const processInfo = await cli(["pane", "process-info", "--pane", paneId]);
      const piProcess = processInfo.result.process_info.foreground_processes.find((candidate: any) => candidate.argv?.includes(entry));
      expect(piProcess?.pid).toBeTypeOf("number");
      process.kill(piProcess.pid);
      await vi.waitFor(async () => expect((await agents()).some((a: any) => a.pane_id === paneId)).toBe(false), { timeout: 15_000, interval: 200 }).catch(async error => {
        throw new Error(`${String(error)}\npane: ${JSON.stringify(await cli(["pane", "get", paneId]).catch(failure => String(failure)))}\nprocess: ${JSON.stringify(await cli(["pane", "process-info", "--pane", paneId]).catch(failure => String(failure)))}\noutput: ${JSON.stringify(await cli(["pane", "read", paneId, "--source", "recent-unwrapped", "--lines", "40"]).catch(failure => String(failure)))}`);
      });
    } finally {
      try { await cli(["server", "stop"]); } finally { if (server.exitCode === null) server.kill(); await closed; rmSync(scratch, { recursive: true, force: true }); }
    }
  }, 120_000);
});

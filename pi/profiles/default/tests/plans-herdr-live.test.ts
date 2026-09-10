import { describe, expect, it, vi } from "vitest";
import { execFile, spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { promisify } from "node:util";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { getPlanRunRuntime } from "../lib/plan-run-runtime.ts";
import { executePlans } from "../extensions/plans.ts";
import { getThemeByName } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import { stripTerminalSequences } from "@earendil-works/pi-tui";

const exec = promisify(execFile);

describe.skipIf(process.env.PI_PLANS_HERDR_LIVE !== "1")("isolated plan-tab focus acceptance", () => {
  it("tracks real Pi execution in one focused tab and blocks duplicate launches across pickers", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "plans-herdr-live-"));
    const name = `plans-${process.pid}-${Date.now()}`;
    const executable = process.env.HERDR_BIN_PATH || "herdr";
    const previous = { ...process.env };
    const env: NodeJS.ProcessEnv = { ...process.env,
      APPDATA: join(scratch, "roaming"), LOCALAPPDATA: join(scratch, "local"),
      XDG_CONFIG_HOME: join(scratch, "config"), XDG_DATA_HOME: join(scratch, "data"), XDG_STATE_HOME: join(scratch, "state"),
      HERDR_CONFIG_PATH: join(scratch, "config.toml"),
    };
    for (const key of ["HERDR_ENV", "HERDR_SOCKET_PATH", "HERDR_WORKSPACE_ID", "HERDR_TAB_ID", "HERDR_PANE_ID", "HERDR_PLUGIN_ID", "PI_HERDR_CWD", "PI_HERDR_SESSION_FILE", "PI_HERDR_PLAN_PATH", "PI_HERDR_PLAN_RUN_TOKEN", "PI_PLANS_LAUNCH_TOKEN", "PI_PLANS_LAUNCH_PLAN"]) delete env[key];
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
    let api: Server | undefined;
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
      const manifest = resolve("node_modules/@earendil-works/pi-coding-agent/package.json");
      const pkg = JSON.parse(readFileSync(manifest, "utf8"));
      const entry = resolve(dirname(manifest), pkg.bin.pi);
      let reply: (() => void) | undefined; const requests: any[] = [];
      // Only the model boundary is replaced. Native Pi, templates, lifecycle,
      // bootstrap, filesystem ownership, and Herdr all run for real.
      api = createServer((request, response) => {
        let body = ""; request.on("data", chunk => { body += chunk; });
        request.on("end", () => {
          requests.push(JSON.parse(body));
          reply = () => {
            response.writeHead(200, { "Content-Type": "text/event-stream" });
            response.write(`data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", model: "inert", choices: [{ index: 0, delta: { role: "assistant", content: "Inert fixture response." }, finish_reason: null }] })}\n\n`);
            response.end(`data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", model: "inert", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 } })}\n\ndata: [DONE]\n\n`);
          };
        });
      });
      await new Promise<void>(resolve => api!.listen(0, "127.0.0.1", resolve));
      const port = (api.address() as { port: number }).port;
      writeFileSync(join(profile, "models.json"), JSON.stringify({ providers: { "plans-fixture": {
        baseUrl: `http://127.0.0.1:${port}/v1`, api: "openai-completions", apiKey: "fixture", models: [{ id: "inert" }],
      } } }));
      writeFileSync(join(profile, "settings.json"), JSON.stringify({ defaultProvider: "plans-fixture", defaultModel: "inert", quietStartup: true, lastChangelogVersion: pkg.version,
        extensions: [resolve("extensions/plans.ts")],
      }));
      mkdirSync(join(profile, "prompts"));
      writeFileSync(join(profile, "prompts", "do-it.md"), readFileSync(resolve("prompts/do-it.md"), "utf8"));
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
      const runtime = getPlanRunRuntime(profile); const file = join(scratch, ".specs", "inert", "plan.md");
      await vi.waitFor(() => {
        expect(runtime.store.get(file)?.state).toBe("running"); expect(requests).toHaveLength(1);
      }, { timeout: 20_000, interval: 100 });
      const run = runtime.store.get(file)!;
      expect(run.pid).not.toBe(process.pid); expect(run.tabId).toBe(focused.active_tab_id);
      expect(JSON.stringify(requests[0].messages)).toContain("Invocation arguments: .specs/inert/plan.md");
      const sendUserMessage = vi.fn();
      const blockedPicker = vi.fn((factory: any) => new Promise(resolve => {
        const picker = factory({ requestRender() {} }, getThemeByName("dark"), {}, resolve);
        const output = picker.render(100).map(stripTerminalSequences).join("\n");
        expect(output).toContain("running");
        expect(output).not.toContain("Disabled");
        picker.handleInput("q");
      }));
      for (let count = 0; count < 2; count++) await executePlans({ mode: "tui", cwd: scratch, ui: { custom: blockedPicker, notify: vi.fn() } } as any, { sendUserMessage });
      expect(sendUserMessage).not.toHaveBeenCalled();
      expect((await cli(["workspace", "get", workspace])).result.workspace.tab_count).toBe(2);
      reply!();
      await vi.waitFor(() => expect(runtime.store.get(file)?.state).toBe("waiting"), { timeout: 10_000, interval: 100 });
      await executePlans({ mode: "tui", cwd: scratch, ui: { custom: blockedPicker, notify: vi.fn() } } as any, { sendUserMessage });
      expect(sendUserMessage).not.toHaveBeenCalled();
      // Close only the exact plugin pane created by this test. Registry liveness
      // does not depend on Herdr recognizing an agent kind or scraping its title.
      await cli(["plugin", "pane", "close", run.paneId!]);
      await vi.waitFor(() => expect(runtime.store.get(file)).toBeUndefined(), { timeout: 10_000, interval: 100 });
    } finally {
      for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
      Object.assign(process.env, previous);
      try { await cli(["server", "stop"]); }
      finally {
        if (server.exitCode === null) server.kill(); await serverClosed;
        api?.closeAllConnections(); if (api) await new Promise<void>(resolve => api!.close(() => resolve()));
        rmSync(scratch, { recursive: true, force: true });
      }
    }
  }, 60_000);
});

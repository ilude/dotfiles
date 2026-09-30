import { execFile, execFileSync, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, symlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, vi } from "vitest";

const exec = promisify(execFile);
export const profile = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const root = resolve(profile, "../../..");
export const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true }).trim();
export interface Pane { pane_id: string; tab_id: string; workspace_id: string }
export interface Agent { pane_id: string; agent_status: string; agent_session?: { value: string } }
export interface Workspace { workspace_id: string; active_tab_id: string; tab_count: number }

/** All mutating commands use the isolated server's verified socket, never the inherited socket. */
export async function isolatedPlanHerdr() {
  const scratch = mkdtempSync(join(tmpdir(), "plan-herdr-live-"));
  const name = `plan-${process.pid}-${Date.now()}`;
  const executable = process.env.HERDR_BIN_PATH || "herdr";
  const env: NodeJS.ProcessEnv = { ...process.env,
    APPDATA: join(scratch, "registry"), LOCALAPPDATA: join(scratch, "local"),
    XDG_CONFIG_HOME: join(scratch, "config"), XDG_DATA_HOME: join(scratch, "data"), XDG_STATE_HOME: join(scratch, "state"),
    HERDR_CONFIG_PATH: join(scratch, `${name}.toml`),
  };
  for (const key of Object.keys(env)) if ((key.startsWith("HERDR_") && key !== "HERDR_CONFIG_PATH" && key !== "HERDR_BIN_PATH") || key.startsWith("PI_HERDR_") || key.startsWith("PI_SUBAGENT_") || key.startsWith("PI_CLOSEOUT_")) delete env[key];
  mkdirSync(env.APPDATA!, { recursive: true }); mkdirSync(env.LOCALAPPDATA!, { recursive: true });
  writeFileSync(env.HERDR_CONFIG_PATH!, '[ui.sound]\nenabled = false\n[ui.toast]\ndelivery = "off"\n[session]\nresume_agents_on_restore = false\n');
  const diagnostics = join(scratch, 'node-stderr.log');
  const preload = join(scratch, 'capture-stderr.mjs');
  writeFileSync(preload, `import {appendFileSync} from 'node:fs';const original=process.stderr.write.bind(process.stderr);process.stderr.write=(...args)=>{appendFileSync(${JSON.stringify(diagnostics)},String(process.pid)+': '+String(args[0]));return original(...args)};`);
  env.NODE_OPTIONS = `${env.NODE_OPTIONS || ''} --import=${pathToFileURL(preload).href}`.trim();
  const server = spawn(executable, ["--session", name, "server"], { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  const closed = new Promise<void>(done => server.once("close", () => done()));
  let logs = "";
  server.stdout.on("data", c => { logs = (logs + c).slice(-12000); });
  server.stderr.on("data", c => { logs = (logs + c).slice(-12000); });
  const cli = async <T>(args: string[]): Promise<T> => {
    const { stdout } = await exec(executable, ["--session", name, ...args], { env, windowsHide: true, timeout: 20_000, maxBuffer: 256 * 1024 });
    return (stdout.trim().startsWith("{") ? JSON.parse(stdout) : stdout.trim() || undefined) as T;
  };
  const close = async () => {
    try { if (env.HERDR_SOCKET_PATH) await cli(["server", "stop"]); }
    finally { if (server.exitCode === null) server.kill(); await closed; rmSync(scratch, { recursive: true, force: true }); }
  };
  try {
    await vi.waitFor(async () => {
      const result = await cli<{ sessions: { name: string; running: boolean; socket_path: string }[] }>(["session", "list", "--json"]);
      // Some previews name an isolated config's server default, regardless of --session.
      const running = result.sessions.filter(s => s.running && s.socket_path.toLowerCase().includes(scratch.toLowerCase()));
      expect(running, logs).toHaveLength(1);
      env.HERDR_SOCKET_PATH = running[0]!.socket_path;
    }, { timeout: 15_000, interval: 250 });
    expect((await cli<{ result: { plugins: unknown[] } }>(["plugin", "list", "--json"])).result.plugins).toEqual([]);
    const repo = join(scratch, "repo"); mkdirSync(repo);
    git(repo, "init", "-b", "acceptance-target"); git(repo, "config", "user.name", "Live acceptance"); git(repo, "config", "user.email", "acceptance@example.invalid");
    writeFileSync(join(repo, ".gitignore"), ".worktrees/\n"); writeFileSync(join(repo, "baseline.txt"), "baseline\n");
    git(repo, "add", "."); git(repo, "commit", "-m", "fixture baseline");
    const fixtureProfile = join(scratch, "runtime/pi/profiles/live"); mkdirSync(join(fixtureProfile, "extensions"), { recursive: true });
    symlinkSync(join(root, "scripts"), join(scratch, "runtime/scripts"), "junction");
    symlinkSync(join(profile, "node_modules"), join(fixtureProfile, "node_modules"), "junction");
    writeFileSync(join(fixtureProfile, "settings.json"), JSON.stringify({ defaultProjectTrust: "trust" }));
    writeFileSync(join(fixtureProfile, "extensions/herdr-agent-state.ts"), readFileSync(join(profile, "extensions/herdr-agent-state.ts"), "utf8"));
    const manifest = join(profile, "node_modules/@earendil-works/pi-coding-agent/package.json");
    const pkg: { version: string; bin: { pi: string } } = JSON.parse(readFileSync(manifest, "utf8"));
    expect(pkg.version).toBe("0.99.1");
    const entry = resolve(dirname(manifest), pkg.bin.pi);
    const plugin = join(scratch, "plugin"); mkdirSync(plugin);
    writeFileSync(join(plugin, "herdr-plugin.toml"), readFileSync(join(root, "pi/herdr/herdr-plugin.toml.in"), "utf8").replace("@COMMAND@", JSON.stringify([process.execPath, join(root, "scripts/pi-herdr-launch.mjs"), entry])));
    await cli(["plugin", "link", plugin]);
    return { scratch, repo, env, entry, fixtureProfile, cli, close, logs: () => logs + (existsSync(diagnostics) ? readFileSync(diagnostics, 'utf8').slice(-16000) : '') };
  } catch (error) { await close(); throw error; }
}

#!/usr/bin/env node
import { existsSync, realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import net from "node:net";
import { fileURLToPath, pathToFileURL } from "node:url";

function herdrSocketEndpoint(socketPath) {
  return process.platform === "win32" ? `\\\\.\\pipe\\${socketPath}` : socketPath;
}

export function reportInitialAgentPresence(env = process.env, connect = endpoint => net.createConnection(endpoint)) {
  if (env.HERDR_ENV !== "1" || env.HERDR_PLUGIN_ID !== "local.pi" || !env.HERDR_SOCKET_PATH || !env.HERDR_PANE_ID) return false;
  const retryDelays = [100, 250, 500];
  const attempt = retry => {
    const request = {
      id: `herdr:pi:bootstrap:${Date.now()}:${Math.random().toString(36).slice(2)}`,
      method: "pane.report_agent",
      params: { pane_id: env.HERDR_PANE_ID, source: "herdr:pi", agent: "pi", state: "idle", seq: Date.now() * 1000 + retry },
    };
    let settled = false;
    const retryLater = () => {
      if (settled) return;
      settled = true;
      const delay = retryDelays[retry];
      if (delay === undefined) return;
      const timer = setTimeout(() => attempt(retry + 1), delay);
      timer.unref?.();
    };
    try {
      const socket = connect(herdrSocketEndpoint(env.HERDR_SOCKET_PATH));
      const timer = setTimeout(() => { socket.destroy(); retryLater(); }, 500);
      timer.unref?.();
      socket.on("connect", () => socket.write(`${JSON.stringify(request)}\n`));
      socket.on("data", data => {
        clearTimeout(timer);
        socket.destroy();
        if (String(data).includes('"error"')) retryLater();
        else settled = true;
      });
      socket.on("error", () => { clearTimeout(timer); retryLater(); });
      socket.on("close", () => clearTimeout(timer));
    } catch {
      retryLater();
    }
  };
  attempt(0);
  return true;
}

// Only the setup-owned manifest supplies the entrypoint. Per-launch input is
// deliberately not an arbitrary argv or environment serialization surface.
export function launchArguments(env = process.env) {
  const profile = env.PI_HERDR_PROFILE_DIR;
  if (!profile || !isAbsolute(profile) || !statSync(profile).isDirectory()) throw new Error("Absolute Pi profile directory required");
  const session = env.PI_HERDR_SESSION_FILE;
  if (session && (!isAbsolute(session) || !statSync(session).isFile())) throw new Error("Absolute existing branch session file required");
  const plan = env.PI_HERDR_PLAN_PATH;
  if (session && plan) throw new Error("Session and plan launch inputs are mutually exclusive");
  let initialMessage;
  if (plan) {
    if (!/^\.specs\/[A-Za-z0-9][A-Za-z0-9._-]*\/plan\.md$/.test(plan)) throw new Error("Direct-child .specs plan path required");
    const root = realpathSync(resolve(env.PI_HERDR_CWD || process.cwd()));
    const file = resolve(root, plan);
    if (!statSync(file).isFile()) throw new Error("Existing plan file required");
    const resolved = realpathSync(file);
    const inside = relative(root, resolved);
    if (!inside || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) throw new Error("Plan path escapes launch cwd");
    initialMessage = `/do-it ${plan}`;
  }
  const args = session ? ["--session", session] : initialMessage ? [initialMessage] : [];
  const preflight = fileURLToPath(new URL("./pi-damage-control-preflight.mjs", import.meta.url));
  if (basename(resolve(profile)) === "default") {
    const checked = spawnSync(process.execPath, [preflight, resolve(profile, "extensions/damage-control/index.js")], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true, timeout: 10_000 });
    if (checked.status !== 0 || checked.error) {
      process.stderr.write("Pi Damage Control preflight failed; tools-disabled, extensions-disabled repair mode. Repair, exit, then relaunch normally. Recovery is never automatic.\n");
      args.unshift("--no-tools", "--no-extensions");
    }
  }
  return { profile: resolve(profile), args };
}
export async function main() {
  const entry = process.argv[2];
  if (process.argv.length !== 3 || !entry || !isAbsolute(entry) || !existsSync(entry)) throw new Error("Expected setup-owned absolute Pi entrypoint");
  const { profile, args } = launchArguments();
  process.env.PI_CODING_AGENT_DIR = profile;
  if (process.env.PI_HERDR_SUBAGENT) {
    if (args.length) throw new Error("Restricted subagent launch cannot enter repair mode or resume an external session");
    const { hostSubagent } = await import("./pi-subagent-host.mjs");
    await hostSubagent(entry, profile, process.env.PI_HERDR_SUBAGENT);
    return;
  }
  delete process.env.PI_HERDR_PROFILE_DIR;
  delete process.env.PI_HERDR_SESSION_FILE;
  delete process.env.PI_HERDR_PLAN_PATH;
  if (process.platform !== "win32") process.env.TMPDIR = "/tmp";
  // Register the plugin pane immediately. Fresh Pi sessions may not have a
  // session reference when the generated lifecycle extension first runs.
  // That extension subsequently attaches the session and owns live state.
  reportInitialAgentPresence();
  // Herdr's preview can replace an exited focused terminal with a shell.
  // Explicitly retire only this plugin-owned pane at process exit instead.
  if (process.env.HERDR_PLUGIN_ID === "local.pi" && process.env.HERDR_PANE_ID && process.env.HERDR_SOCKET_PATH) {
    const pane = process.env.HERDR_PANE_ID;
    const env = { ...process.env };
    process.once("exit", () => {
      spawnSync(env.HERDR_BIN_PATH || "herdr", ["plugin", "pane", "close", pane], { env, stdio: "ignore", windowsHide: true, timeout: 2000 });
    });
  }
  process.argv = [process.execPath, entry, ...args];
  await import(pathToFileURL(entry).href);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

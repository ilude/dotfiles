#!/usr/bin/env node
import { existsSync, realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";

function herdrSocketEndpoint(socketPath) {
  return process.platform === "win32" ? `\\\\.\\pipe\\${socketPath}` : socketPath;
}

function sendAgentReport(request, endpoint, connect, timeoutMs = 500) {
  return new Promise(resolve => {
    let settled = false;
    let buffer = "";
    let socket;
    const finish = delivered => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket?.destroy();
      resolve(delivered);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    timer.unref?.();
    try {
      socket = connect(endpoint);
      socket.on("connect", () => socket.write(`${JSON.stringify(request)}\n`));
      socket.on("data", data => {
        buffer += String(data);
        const newline = buffer.indexOf("\n");
        if (newline < 0) return;
        try {
          const response = JSON.parse(buffer.slice(0, newline));
          finish(response?.id === request.id && response?.error === undefined && response?.result !== undefined);
        } catch {
          finish(false);
        }
      });
      socket.on("error", () => finish(false));
      socket.on("end", () => finish(false));
    } catch {
      finish(false);
    }
  });
}

export async function reportInitialAgentPresence(env = process.env, connect = endpoint => net.createConnection(endpoint)) {
  if (env.HERDR_ENV !== "1" || env.HERDR_PLUGIN_ID !== "local.pi" || !env.HERDR_SOCKET_PATH || !env.HERDR_PANE_ID) return false;
  const retryDelays = [0, 100, 250, 500];
  for (let retry = 0; retry < retryDelays.length; retry++) {
    const delay = retryDelays[retry];
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    const request = {
      id: `herdr:pi:bootstrap:${Date.now()}:${Math.random().toString(36).slice(2)}`,
      method: "pane.report_agent",
      params: { pane_id: env.HERDR_PANE_ID, source: "herdr:pi", agent: "pi", state: "idle", seq: Date.now() * 1000 + retry },
    };
    if (await sendAgentReport(request, herdrSocketEndpoint(env.HERDR_SOCKET_PATH), connect)) return true;
  }
  return false;
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
export function retirePluginPane(env = process.env, run = spawnSync) {
  if (env.HERDR_PLUGIN_ID !== "local.pi" || !env.HERDR_PANE_ID || !env.HERDR_SOCKET_PATH) return;
  run(env.HERDR_BIN_PATH || "herdr", ["plugin", "pane", "close", env.HERDR_PANE_ID], { env, stdio: "ignore", windowsHide: true, timeout: 2000 });
}

function forwardSignal(child, signal) {
  if (child.exitCode === null && child.signalCode === null) child.kill(signal);
}

async function runPi(entry, args, env) {
  const child = spawn(process.execPath, [entry, ...args], { cwd: process.cwd(), env, stdio: "inherit", shell: false });
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"];
  const handlers = new Map(signals.map(signal => [signal, () => forwardSignal(child, signal)]));
  for (const [signal, handler] of handlers) process.once(signal, handler);
  try {
    return await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
  } finally {
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
  }
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
  await reportInitialAgentPresence();
  // Herdr's preview can replace an exited focused terminal with a shell.
  // Explicitly retire only this plugin-owned pane at process exit instead.
  const launchEnv = { ...process.env };
  let outcome;
  try {
    outcome = await runPi(entry, args, launchEnv);
  } finally {
    retirePluginPane(launchEnv);
  }
  if (outcome.signal) {
    try { process.kill(process.pid, outcome.signal); } catch { process.exitCode = 128; }
  } else {
    process.exitCode = outcome.code ?? 1;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

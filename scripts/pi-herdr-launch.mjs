#!/usr/bin/env node
import { existsSync, realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

// Only the setup-owned manifest supplies the entrypoint. Per-launch input is
// deliberately not an arbitrary argv or environment serialization surface.
export function launchArguments(env = process.env) {
  const profile = env.PI_HERDR_PROFILE_DIR;
  if (!profile || !isAbsolute(profile) || !statSync(profile).isDirectory()) throw new Error("Absolute Pi profile directory required");
  const session = env.PI_HERDR_SESSION_FILE;
  if (session && (!isAbsolute(session) || !statSync(session).isFile())) throw new Error("Absolute existing branch session file required");
  const plan = env.PI_HERDR_PLAN_PATH;
  const planToken = env.PI_HERDR_PLAN_RUN_TOKEN;
  if (planToken && (!plan || !/^[a-f0-9-]{36}$/i.test(planToken))) throw new Error("A plan reservation requires a plan path and UUID token");
  let planFile;
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
    planFile = resolved;
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
  return { profile: resolve(profile), args, planFile, planToken };
}
export async function main() {
  const entry = process.argv[2];
  if (process.argv.length !== 3 || !entry || !isAbsolute(entry) || !existsSync(entry)) throw new Error("Expected setup-owned absolute Pi entrypoint");
  const { profile, args, planFile, planToken } = launchArguments();
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
  delete process.env.PI_HERDR_PLAN_RUN_TOKEN;
  delete process.env.PI_PLANS_LAUNCH_PLAN;
  delete process.env.PI_PLANS_LAUNCH_TOKEN;
  if (planFile && planToken) {
    // Private one-use handoff consumed by the plan lifecycle extension at startup.
    process.env.PI_PLANS_LAUNCH_PLAN = planFile;
    process.env.PI_PLANS_LAUNCH_TOKEN = planToken;
  }
  if (process.platform !== "win32") process.env.TMPDIR = "/tmp";
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

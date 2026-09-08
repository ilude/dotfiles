#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

// Only the setup-owned manifest supplies the entrypoint. Per-launch input is
// deliberately not an arbitrary argv or environment serialization surface.
export function launchArguments(env = process.env) {
  const profile = env.PI_HERDR_PROFILE_DIR;
  if (!profile || !isAbsolute(profile) || !statSync(profile).isDirectory()) throw new Error("Absolute Pi profile directory required");
  const session = env.PI_HERDR_SESSION_FILE;
  if (session && (!isAbsolute(session) || !statSync(session).isFile())) throw new Error("Absolute existing branch session file required");
  const args = session ? ["--session", session] : [];
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
  delete process.env.PI_HERDR_PROFILE_DIR;
  delete process.env.PI_HERDR_SESSION_FILE;
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

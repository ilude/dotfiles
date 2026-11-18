#!/usr/bin/env node
// T3 owns sessions; this adapter only forwards Pi and completes provider updates.
import { execFile, spawn } from "node:child_process";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { resolvePiEntry } from "./pi-update-host.mjs";
import { acquireUpdateLock, runPiUpdatePass } from "./pi-runtime-update.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const defaultProfile = join(root, "pi/profiles/default");
const execute = promisify(execFile);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);

export async function resolveInstalledPiEntry(env = process.env, run = execute, platform = process.platform) {
  // Run from our checkout, not the user's project with a potentially different pnpm.
  const command = platform === "win32" ? "pwsh" : "pnpm";
  const args = platform === "win32"
    ? ["-NoProfile", "-NonInteractive", "-Command", "& pnpm list -g --json --depth -1; exit $LASTEXITCODE"]
    : ["list", "-g", "--json", "--depth", "-1"];
  const { stdout } = await run(command, args, { cwd: root, env, encoding: "utf8", windowsHide: true, timeout: 15_000 });
  const entries = JSON.parse(stdout);
  if (!Array.isArray(entries)) throw new Error("Expected pnpm's global package list");
  const packages = entries.flatMap(entry => {
    if (!object(entry) || !object(entry.dependencies)) return [];
    const pkg = entry.dependencies["@earendil-works/pi-coding-agent"];
    return object(pkg) && typeof pkg.path === "string" && isAbsolute(pkg.path) ? [pkg.path] : [];
  });
  if (packages.length !== 1) throw new Error("Cannot resolve the installed global Pi; install Pi with pnpm first");
  return resolvePiEntry(packages[0]);
}

export async function runPiAdapter(args, {
  env = process.env, cwd = process.cwd(), resolveEntry = resolveInstalledPiEntry,
  update = runPiUpdatePass, lock = acquireUpdateLock,
} = {}) {
  const childEnv = { ...env, PI_CODING_AGENT_DIR: env.PI_CODING_AGENT_DIR || defaultProfile };
  // This is the native maintenance argv used by T3's Pi provider. Other argv is Pi's.
  if (args.length === 2 && args[0] === "update" && args[1] === "--self") {
    const release = await lock(childEnv.PI_CODING_AGENT_DIR);
    try {
      console.error("Updating Pi and refreshing default-profile runtime links...");
      const result = await update({ cwd: root, env: childEnv });
      if (!result.installed || !result.linked || !result.version || result.error) throw new Error(result.error || "Pi installation/link refresh did not complete");
      console.error(`Pi ${result.version} installed; default-profile runtime links refreshed. T3 owns existing session lifetimes.`);
      return { code: 0, signal: null };
    } finally { await release(); }
  }

  const entry = await resolveEntry(childEnv);
  const child = spawn(process.execPath, [entry, ...args], { cwd, env: childEnv, stdio: "inherit", shell: false });
  const forwarders = new Map(["SIGINT", "SIGTERM", "SIGHUP"].map(signal => [signal, () => {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  }]));
  for (const [signal, handler] of forwarders) process.on(signal, handler);
  try {
    return await new Promise((accept, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => accept({ code, signal }));
    });
  } finally {
    for (const [signal, handler] of forwarders) process.removeListener(signal, handler);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPiAdapter(process.argv.slice(2)).then(outcome => {
    if (outcome.signal) { try { process.kill(process.pid, outcome.signal); } catch { process.exitCode = 128; } }
    else process.exitCode = outcome.code ?? 1;
  }).catch(error => { console.error(`T3 Pi: ${error.message}`); process.exitCode = 1; });
}

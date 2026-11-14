// Shared installation/link refresh for terminal /update and T3 provider maintenance.
import { spawn, execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { updateRegistryDirectory } from "./pi-update-host.mjs";

const defaultProfile = fileURLToPath(new URL("../pi/profiles/default/", import.meta.url));
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);

export async function acquireUpdateLock(profile = defaultProfile) {
  const require = createRequire(join(profile, "package.json"));
  const lockfile = require("proper-lockfile");
  return lockfile.lock(updateRegistryDirectory(), { realpath: false, retries: 0, stale: 30 * 60_000 });
}

export const runUpdateCommand = (command, args, options) => new Promise((accept, reject) => {
  const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, shell: false, detached: process.platform !== "win32" });
  let output = "", failure;
  for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => { output = (output + String(chunk)).slice(-16_000); });
  const timer = setTimeout(() => {
    failure = new Error(`${command} timed out`);
    if (!child.pid) return;
    if (process.platform === "win32") execFile("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true, timeout: 5000 }, () => {});
    else { try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill(); } }
  }, 10 * 60_000);
  child.once("error", error => { failure = error; });
  child.once("close", code => {
    clearTimeout(timer);
    if (failure) reject(failure);
    else if (code !== 0) reject(new Error(`${command} exited ${code}: ${output.trim()}`));
    else accept();
  });
});

export async function runPiUpdatePass(options, run = runUpdateCommand) {
  let installed = false, linked = false;
  try {
    if ((options.platform ?? process.platform) === "win32") await run("pwsh", ["-NoProfile", "-NonInteractive", "-Command", "$ErrorActionPreference = 'Stop'; & pnpm add -g '@earendil-works/pi-coding-agent@latest'; exit $LASTEXITCODE"], options);
    else await run("pnpm", ["add", "-g", "@earendil-works/pi-coding-agent@latest"], options);
    installed = true;
    if ((options.platform ?? process.platform) === "win32") {
      const helper = join(options.cwd, "powershell/lib/path-utils.ps1").replace(/'/g, "''");
      await run("pwsh", ["-NoProfile", "-NonInteractive", "-Command",
        `$ErrorActionPreference = 'Stop'; . '${helper}'; & (Get-GitBash) 'scripts/pi-deps-link-setup' --profile default; exit $LASTEXITCODE`], options);
    } else await run("bash", ["scripts/pi-deps-link-setup", "--profile", "default"], options);
    linked = true;
    const pkg = JSON.parse(await readFile(join(options.env.PI_CODING_AGENT_DIR ?? "", "node_modules/@earendil-works/pi-coding-agent/package.json"), "utf8"));
    if (!object(pkg) || typeof pkg.version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(pkg.version)) throw new Error("Updated Pi version unavailable from refreshed runtime link");
    return { installed, linked, version: pkg.version };
  } catch (error) { return { installed, linked, error: error instanceof Error ? error.message : String(error) }; }
}

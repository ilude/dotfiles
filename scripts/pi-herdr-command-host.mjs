import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { dirname, join, isAbsolute } from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

const execute = promisify(execFile);

export function commandShell(command, platform = process.platform, env = process.env) {
  // Profile modules can keep background runspaces alive after PowerShell's
  // `exit`. A dedicated host ends this shell only after its command returns.
  if (platform === "win32") return { executable: "pwsh", args: ["-NoLogo", "-Command", `$global:LASTEXITCODE = 0; try { & {\n${command}\n}; $ok = $?; if (!$ok -and !$LASTEXITCODE) { [Environment]::Exit(1) }; [Environment]::Exit($LASTEXITCODE) } catch { Write-Error -ErrorRecord $_ -ErrorAction Continue; [Environment]::Exit(1) }`] };
  const executable = /(?:^|\/)(?:bash|zsh)$/.test(env.SHELL || "") ? env.SHELL : "/bin/bash";
  return { executable, args: ["-lic", command] };
}

/** Runs inside the exact command pane, independently of the originating Pi. */
export async function runCommandHost(file, env = process.env, dependencies = {}) {
  const run = dependencies.run || ((args) => execute(env.HERDR_BIN_PATH || "herdr", args, { env, timeout: 10_000, maxBuffer: 256 * 1024, windowsHide: true }).then(result => result.stdout));
  const launch = dependencies.launch || ((shell, cwd, childEnv) => new Promise((resolve, reject) => {
    const child = spawn(shell.executable, shell.args, { cwd, env: childEnv, shell: false, stdio: "inherit" });
    const interrupt = () => child.kill("SIGINT");
    const terminate = () => child.kill("SIGTERM");
    process.on("SIGINT", interrupt); process.on("SIGTERM", terminate);
    child.once("error", reject);
    child.once("close", (code, signal) => {
      process.off("SIGINT", interrupt); process.off("SIGTERM", terminate);
      resolve({ code, signal });
    });
  }));
  if (!isAbsolute(file) || env.HERDR_PLUGIN_ID !== "local.pi") throw new Error("Command host requires an absolute launch file and its local.pi pane");
  const config = JSON.parse(readFileSync(file, "utf8"));
  if (config.version !== 1 || typeof config.command !== "string" || !config.command.trim() || typeof config.cwd !== "string" || !isAbsolute(config.cwd) || !["task", "agent", "service"].includes(config.lifetime)) throw new Error("Invalid command launch file");
  const directory = dirname(file), ready = join(directory, "ready.json"), resultFile = join(directory, "result.json");
  const save = value => {
    writeFileSync(`${resultFile}.tmp`, JSON.stringify(value));
    renameSync(`${resultFile}.tmp`, resultFile);
  };
  // Placement owns admission. A fast command must not exit while its pane is still being arranged.
  const deadline = Date.now() + 30_000;
  while (!existsSync(ready)) {
    if (Date.now() >= deadline) throw new Error("Command pane was not admitted; command not started");
    await delay(50);
  }
  const admission = JSON.parse(readFileSync(ready, "utf8"));
  const childEnv = { ...env };
  delete childEnv.PI_HERDR_COMMAND_FILE;
  let outcome;
  try { outcome = await launch(commandShell(config.command, process.platform, childEnv), config.cwd, childEnv); }
  catch (error) { outcome = { code: null, signal: null, error: String(error) }; }
  const result = { state: "exited", exitCode: outcome.code, signal: outcome.signal, ...(outcome.error ? { error: outcome.error } : {}) };
  try {
    // Current caller context follows cross-workspace moves; initial public IDs do not.
    const current = JSON.parse(await run(["pane", "current", "--current"])).result?.pane;
    if (!current?.pane_id || !admission.terminalId || current.terminal_id !== admission.terminalId) throw new Error("Command pane terminal identity changed");
    result.pane = current.pane_id;
    result.output = await run(["pane", "read", current.pane_id, "--source", "recent-unwrapped", "--lines", "200"]);
    save(result);
    if (config.lifetime !== "service") await run(["plugin", "pane", "close", current.pane_id]);
  } catch (error) {
    result.cleanupError = String(error);
    save(result);
    process.stderr.write(`Command completed but pane capture/retirement failed: ${error}\nResult: ${resultFile}\n`);
    return { ...result, keepOpen: true };
  }
  return { ...result, keepOpen: config.lifetime === "service" };
}

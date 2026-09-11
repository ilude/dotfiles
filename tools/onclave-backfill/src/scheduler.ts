import { execFile } from "node:child_process";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { homedir } from "node:os";
import { normalizeEndpoint } from "./config.js";

const execFileAsync = promisify(execFile);

export type SchedulerPlatform = "windows" | "macos" | "linux";
export type SchedulerPaths = {
  executablePath: string;
  artifactPath: string;
  configPath: string;
  logPath: string;
  definitionPath?: string;
};
export type Command = { command: string; args: string[]; allowFailure?: boolean };
export type SchedulerPlan = {
  platform: SchedulerPlatform;
  label: string;
  definitionPath: string;
  definition: string;
  setup: Command[];
  disable: Command[];
  uninstall: Command[];
  query: Command[];
};
export type SchedulerRunner = {
  run(command: string, args: string[]): Promise<{ stdout?: string; stderr?: string; status?: number }>;
  writeFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<string>;
  removeFile(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
};

export const TASK_NAME = "\\Dotfiles\\OnclaveBackfill";
export const LAUNCHD_LABEL = "com.dotfiles.onclave.backfill";
export const SYSTEMD_SERVICE = "dotfiles-onclave-backfill.service";
export const SYSTEMD_TIMER = "dotfiles-onclave-backfill.timer";
const OWNER_MARKER = "Managed by dotfiles Onclave backfill; do not edit.";

function xml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function plist(value: string): string { return xml(value); }
function assertAbsolute(paths: SchedulerPaths): void {
  for (const [name, value] of Object.entries(paths)) {
    if (value !== undefined && !isAbsolute(value)) throw new Error(`Scheduler ${name} must be an absolute path`);
  }
}
function defaultDefinition(platform: SchedulerPlatform, configPath: string): string {
  if (platform === "windows") return `${configPath}.task.xml`;
  if (platform === "macos") return join(homedir(), "Library", "LaunchAgents", `${LAUNCHD_LABEL}.plist`);
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "systemd", "user", SYSTEMD_SERVICE);
}
function shellArgs(paths: SchedulerPaths): string[] { return [paths.artifactPath, "--config", paths.configPath]; }
function timerPath(servicePath: string): string { return servicePath.endsWith(".service") ? servicePath.replace(/\.service$/, ".timer") : `${servicePath}.timer`; }

export function renderWindowsTaskXml(paths: SchedulerPaths, userId: string, startBoundary = "2025-01-01T00:00:00"): string {
  assertAbsolute(paths);
  if (!userId.trim() || /^(?:NT AUTHORITY\\)?SYSTEM$/i.test(userId.trim())) throw new Error("Windows scheduler requires the intended interactive user, not SYSTEM");
  const [command, artifact, config] = [paths.executablePath, paths.artifactPath, paths.configPath];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">\n  <RegistrationInfo><Author>${xml(userId)}</Author><Description>${OWNER_MARKER}</Description><URI>${TASK_NAME}</URI></RegistrationInfo>\n  <Triggers>\n    <CalendarTrigger><StartBoundary>${xml(startBoundary)}</StartBoundary><Enabled>true</Enabled><ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay></CalendarTrigger>\n    <LogonTrigger><Enabled>true</Enabled><UserId>${xml(userId)}</UserId></LogonTrigger>\n  </Triggers>\n  <Principals><Principal id="Author"><UserId>${xml(userId)}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>\n  <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><StartWhenAvailable>true</StartWhenAvailable><ExecutionTimeLimit>PT5M</ExecutionTimeLimit><AllowStartOnDemand>true</AllowStartOnDemand><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries></Settings>\n  <Actions Context="Author"><Exec><Command>${xml(command)}</Command><Arguments>${xml(`"${artifact}" --config "${config}"`)}</Arguments><WorkingDirectory>${xml(dirname(artifact))}</WorkingDirectory></Exec></Actions>\n</Task>\n`;
}

export function renderLaunchAgentPlist(paths: SchedulerPaths): string {
  assertAbsolute(paths);
  const args = [paths.executablePath, ...shellArgs(paths)].map((arg) => `    <string>${plist(arg)}</string>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n  <key>Label</key><string>${LAUNCHD_LABEL}</string>\n  <key>ProgramArguments</key><array>\n${args}\n  </array>\n  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>3</integer><key>Minute</key><integer>0</integer></dict>\n  <key>RunAtLoad</key><true/>\n  <key>ProcessType</key><string>Background</string>\n  <key>StandardOutPath</key><string>${plist(paths.logPath)}</string>\n  <key>StandardErrorPath</key><string>${plist(paths.logPath)}</string>\n  <!-- ${OWNER_MARKER} -->\n</dict></plist>\n`;
}

function systemdArg(value: string): string { return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\\"')}"`; }

export function renderSystemdService(paths: SchedulerPaths): string {
  assertAbsolute(paths);
  return `[Unit]\nDescription=Onclave daily local transcript backfill\n# ${OWNER_MARKER}\n\n[Service]\nType=oneshot\nExecStart=${[paths.executablePath, ...shellArgs(paths)].map(systemdArg).join(" ")}\n`;
}
export function renderSystemdTimer(): string {
  return `[Unit]\nDescription=Daily Onclave local transcript backfill\n# ${OWNER_MARKER}\n\n[Timer]\nOnCalendar=daily\nPersistent=true\nUnit=${SYSTEMD_SERVICE}\n\n[Install]\nWantedBy=default.target\n`;
}

export function schedulerPlan(platform: SchedulerPlatform, paths: SchedulerPaths, userId = ""): SchedulerPlan {
  assertAbsolute(paths);
  const definitionPath = paths.definitionPath ?? defaultDefinition(platform, paths.configPath);
  if (platform === "windows") {
    const definition = renderWindowsTaskXml({ ...paths, definitionPath }, userId);
    const setup = [{ command: "schtasks.exe", args: ["/Create", "/TN", TASK_NAME, "/XML", definitionPath, "/F"] }];
    return { platform, label: TASK_NAME, definitionPath, definition, setup, disable: [{ command: "schtasks.exe", args: ["/Change", "/TN", TASK_NAME, "/Disable"] }], uninstall: [{ command: "schtasks.exe", args: ["/Delete", "/TN", TASK_NAME, "/F"] }], query: [{ command: "schtasks.exe", args: ["/Query", "/TN", TASK_NAME, "/XML"] }] };
  }
  if (platform === "macos") {
    // macOS always supplies getuid in production. The deterministic fallback keeps
    // rendering and injected-runner tests platform-independent on Windows.
    const uid = process.env.DOTFILES_SCHEDULER_UID ?? (typeof process.getuid === "function" ? String(process.getuid()) : "501");
    const definition = renderLaunchAgentPlist({ ...paths, definitionPath });
    const target = `gui/${uid}`;
    return { platform, label: LAUNCHD_LABEL, definitionPath, definition, setup: [{ command: "launchctl", args: ["bootout", target, definitionPath], allowFailure: true }, { command: "launchctl", args: ["bootstrap", target, definitionPath] }], disable: [{ command: "launchctl", args: ["bootout", target, definitionPath], allowFailure: true }], uninstall: [{ command: "launchctl", args: ["bootout", target, definitionPath], allowFailure: true }], query: [{ command: "launchctl", args: ["print", `${target}/${LAUNCHD_LABEL}`] }] };
  }
  if (platform === "linux") {
    const servicePath = definitionPath;
    const definition = `${renderSystemdService(paths)}\n---TIMER---\n${renderSystemdTimer()}`;
    const userArgs = ["--user"];
    return { platform, label: SYSTEMD_TIMER, definitionPath: servicePath, definition, setup: [{ command: "systemctl", args: [...userArgs, "daemon-reload"] }, { command: "systemctl", args: [...userArgs, "enable", "--now", SYSTEMD_TIMER] }], disable: [{ command: "systemctl", args: [...userArgs, "disable", "--now", SYSTEMD_TIMER] }], uninstall: [{ command: "systemctl", args: [...userArgs, "disable", "--now", SYSTEMD_TIMER], allowFailure: true }, { command: "systemctl", args: [...userArgs, "daemon-reload"] }], query: [{ command: "systemctl", args: [...userArgs, "is-enabled", SYSTEMD_TIMER] }] };
  }
  throw new Error(`Unsupported scheduler platform: ${platform}`);
}

export function resolveConfiguredEndpoint(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const explicit = env.ONCLAVE_API_BASE?.trim();
  if (explicit) return explicit;
  const domain = env.HOST_DOMAIN?.trim();
  return domain ? `https://onclave.${domain}/api/v1` : undefined;
}

export function defaultSchedulerPaths(root: string, configPath: string): SchedulerPaths {
  const absoluteRoot = resolve(root);
  return { executablePath: resolve(process.execPath), artifactPath: resolve(absoluteRoot, "tools", "onclave-backfill", "dist", "tools", "onclave-backfill", "src", "main.js"), configPath: resolve(configPath), logPath: resolve(dirname(configPath), "onclave-backfill.log") };
}

export function renderBackfillConfig(endpoint: string, paths: SchedulerPaths, keyPath = join(homedir(), ".ssh", "id_ed25519"), cacheRoot = join(homedir(), ".dotfiles", "yt")): string {
  assertAbsolute(paths);
  const config = { endpoint: normalizeEndpoint(endpoint), key_path: resolve(keyPath), cache_root: resolve(cacheRoot), state_path: join(resolve(cacheRoot), "onclave-backfill-state.json"), lock_path: join(resolve(cacheRoot), "onclave-backfill.lock"), log_path: paths.logPath, executable_path: paths.executablePath, artifact_path: paths.artifactPath };
  return `${JSON.stringify(config, null, 2)}\n`;
}

export async function writeBackfillConfig(path: string, endpoint: string, paths: SchedulerPaths, keyPath = join(homedir(), ".ssh", "id_ed25519"), cacheRoot = join(homedir(), ".dotfiles", "yt")): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, renderBackfillConfig(endpoint, paths, keyPath, cacheRoot), { encoding: "utf8", mode: 0o600 });
}

export const nodeRunner: SchedulerRunner = {
  async run(command, args) { const result = await execFileAsync(command, args, { windowsHide: true, maxBuffer: 1024 * 1024 }); return { stdout: result.stdout, stderr: result.stderr, status: 0 }; },
  async writeFile(path, content) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, content, { encoding: "utf8", mode: 0o600 }); },
  async readFile(path) { return readFile(path, "utf8"); },
  async removeFile(path) { await rm(path, { force: true }); },
  async exists(path) { try { await access(path); return true; } catch { return false; } },
};

export async function applySchedulerPlan(plan: SchedulerPlan, runner: SchedulerRunner = nodeRunner): Promise<void> {
  if (plan.platform === "linux") {
    const separator = "\n---TIMER---\n";
    const [service, timer] = plan.definition.split(separator);
    await runner.writeFile(plan.definitionPath, service ?? plan.definition);
    await runner.writeFile(timerPath(plan.definitionPath), timer ?? "");
  } else await runner.writeFile(plan.definitionPath, plan.definition);
  for (const command of plan.setup) {
    try { const result = await runner.run(command.command, command.args); if (result.status !== undefined && result.status !== 0) throw new Error(result.stderr ?? `${command.command} failed`); }
    catch (error) { if (!command.allowFailure) throw error; }
  }
}

export async function runSchedulerCommands(commands: Command[], runner: SchedulerRunner = nodeRunner): Promise<void> {
  for (const command of commands) {
    try { const result = await runner.run(command.command, command.args); if (result.status !== undefined && result.status !== 0) throw new Error(result.stderr ?? `${command.command} failed`); }
    catch (error) { if (!command.allowFailure) throw error; }
  }
}

export async function uninstallScheduler(plan: SchedulerPlan, runner: SchedulerRunner = nodeRunner): Promise<boolean> {
  const definition = await runner.readFile(plan.definitionPath).catch(() => "");
  const timerFile = timerPath(plan.definitionPath);
  const timer = plan.platform === "linux" ? await runner.readFile(timerFile).catch(() => "") : "";
  // Both user units must carry our marker. This prevents a later unrelated unit
  // at the conventional timer path from being removed during cleanup.
  if (!definition.includes(OWNER_MARKER) || (plan.platform === "linux" && !timer.includes(OWNER_MARKER))) return false;
  await runSchedulerCommands(plan.uninstall, runner);
  await runner.removeFile(plan.definitionPath);
  if (plan.platform === "linux") await runner.removeFile(timerFile);
  return true;
}

export async function setupScheduler(platform: SchedulerPlatform, paths: SchedulerPaths, userId: string, endpoint: string, runner: SchedulerRunner = nodeRunner, fileExists: (path: string) => Promise<boolean> = runner.exists): Promise<SchedulerPlan> {
  if (!endpoint) throw new Error("Onclave endpoint is not configured; set ONCLAVE_API_BASE=https://onclave.<domain>/api/v1 or HOST_DOMAIN=<domain>, then rerun the installer");
  if (!(await fileExists(paths.executablePath))) throw new Error(`Node executable is unavailable: ${paths.executablePath}`);
  if (!(await fileExists(paths.artifactPath))) throw new Error(`Backfill build artifact is unavailable: ${paths.artifactPath}`);
  const plan = schedulerPlan(platform, paths, userId);
  await runner.writeFile(paths.configPath, renderBackfillConfig(endpoint, paths));
  await applySchedulerPlan(plan, runner);
  return plan;
}

export function detectSchedulerPlatform(value = process.platform): SchedulerPlatform {
  if (value === "win32") return "windows";
  if (value === "darwin") return "macos";
  if (value === "linux") return "linux";
  throw new Error(`Unsupported scheduler platform: ${value}`);
}

export { OWNER_MARKER };

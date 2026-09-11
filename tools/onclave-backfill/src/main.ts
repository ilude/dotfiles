#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { DEFAULT_CACHE_ROOT, DEFAULT_CONFIG_PATH, DEFAULT_LOCK_PATH, DEFAULT_LOG_PATH, DEFAULT_STATE_PATH, defaultConfig, loadConfig, type BackfillConfig } from "./config.js";
import { defaultSchedulerPaths, detectSchedulerPlatform, schedulerPlan, resolveConfiguredEndpoint, setupScheduler, uninstallScheduler, runSchedulerCommands, nodeRunner, type SchedulerPaths } from "./scheduler.js";
import { scanCache } from "./cache.js";
import { readState } from "./state.js";
import { runBackfill, status } from "./worker.js";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function fallbackConfig(): BackfillConfig {
  return { ...defaultConfig(), cacheRoot: DEFAULT_CACHE_ROOT, statePath: DEFAULT_STATE_PATH, lockPath: DEFAULT_LOCK_PATH, logPath: DEFAULT_LOG_PATH };
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function schedulerPaths(root: string, configPath: string): SchedulerPaths {
  const defaults = defaultSchedulerPaths(root, configPath);
  return {
    ...defaults,
    executablePath: resolve(option("--executable") ?? defaults.executablePath),
    artifactPath: resolve(option("--artifact") ?? defaults.artifactPath),
    configPath: resolve(configPath),
    logPath: resolve(option("--log") ?? defaults.logPath),
    ...(option("--definition") ? { definitionPath: resolve(option("--definition")!) } : {}),
  };
}

function intendedUser(): string {
  if (process.platform !== "win32") return "";
  const explicit = process.env.DOTFILES_SCHEDULER_USER?.trim();
  if (explicit) return explicit;
  const name = process.env.USERNAME?.trim();
  if (!name) throw new Error("Windows scheduler requires DOTFILES_SCHEDULER_USER or USERNAME");
  const domain = process.env.USERDOMAIN?.trim();
  return domain ? `${domain}\\${name}` : name;
}

async function printStatus(configPath: string, root: string): Promise<number> {
  const config = await loadConfig(configPath).catch(() => fallbackConfig());
  const worker = await status(config);
  let scheduler: Record<string, unknown>;
  try {
    const plan = schedulerPlan(detectSchedulerPlatform(), schedulerPaths(root, configPath), intendedUser());
    let native: Record<string, unknown> = {};
    try {
      const result = await nodeRunner.run(plan.query[0]!.command, plan.query[0]!.args);
      native = { query: result.stdout?.trim() || "available" };
    } catch (error) {
      native = { queryError: error instanceof Error ? error.message : String(error) };
    }
    scheduler = { platform: plan.platform, label: plan.label, definitionPath: plan.definitionPath, definitionPresent: await nodeRunner.exists(plan.definitionPath), ...native };
  } catch (error) {
    scheduler = { configured: false, error: error instanceof Error ? error.message : String(error) };
  }
  console.log(JSON.stringify({ ...worker, configPath, scheduler }, null, 2));
  return 0;
}

async function manageScheduler(action: "setup" | "disable" | "uninstall", configPath: string, root: string): Promise<number> {
  const platform = detectSchedulerPlatform();
  const paths = schedulerPaths(root, configPath);
  const user = intendedUser();
  if (action === "setup") {
    const endpoint = resolveConfiguredEndpoint();
    if (!endpoint) throw new Error("Onclave endpoint is not configured; set ONCLAVE_API_BASE=https://onclave.<domain>/api/v1 or HOST_DOMAIN=<domain>, then rerun the installer");
    const plan = await setupScheduler(platform, paths, user, endpoint);
    console.log(JSON.stringify({ action, platform, label: plan.label, definitionPath: plan.definitionPath }));
    return 0;
  }
  const plan = schedulerPlan(platform, paths, user);
  if (action === "disable") await runSchedulerCommands(plan.disable);
  else {
    const removed = await uninstallScheduler(plan);
    if (!removed) throw new Error(`Refusing to remove an unmanaged scheduler definition: ${plan.definitionPath}`);
  }
  console.log(JSON.stringify({ action, platform, label: plan.label }));
  return 0;
}

async function main(): Promise<number> {
  const configPath = resolve(argument("--config") ?? process.env.ONCLAVE_BACKFILL_CONFIG ?? DEFAULT_CONFIG_PATH);
  const root = resolve(option("--root") ?? process.env.DOTFILES_ROOT ?? resolve(fileURLToPath(new URL("../../../../", import.meta.url))));
  for (const action of ["setup", "disable", "uninstall"] as const) {
    if (process.argv.includes(`--${action}`)) return manageScheduler(action, configPath, root);
  }
  if (process.argv.includes("--status")) return printStatus(configPath, root);
  let config: BackfillConfig;
  try {
    config = await loadConfig(configPath);
  } catch (error) {
    // The worker still performs the local scan and records an actionable bounded failure.
    config = fallbackConfig();
    const result = await runBackfill(config, { logger: () => undefined });
    console.error(JSON.stringify({ ...result, error: error instanceof Error ? error.message : String(error) }));
    return 0;
  }
  const result = await runBackfill(config);
  console.log(JSON.stringify(result));
  return 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().then((code) => process.exitCode = code).catch((error) => { console.error(`Onclave scheduler warning: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
}

export { main };

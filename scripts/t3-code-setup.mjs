#!/usr/bin/env node
// T3 Code v0.1.7 provider-instance settings. Merge user state, never link it.
import { accessSync, constants, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);

function findPiBinary() {
  // T3's Windows spawner supports .cmd, not PowerShell functions or .ps1 shims.
  const names = process.platform === "win32" ? ["pi.exe", "pi.cmd"] : ["pi"];
  const directories = (process.env.PATH || "").split(delimiter).filter(Boolean);
  if (process.env.PNPM_HOME) directories.push(process.env.PNPM_HOME);
  for (const directory of directories) {
    for (const name of names) {
      const candidate = resolve(directory.replace(/^"|"$/g, ""), name);
      try {
        if (!statSync(candidate).isFile()) continue;
        accessSync(candidate, process.platform === "win32" ? constants.F_OK : constants.X_OK);
        return candidate;
      } catch { /* Try the next PATH entry. */ }
    }
  }
  throw new Error("Pi executable is unavailable on PATH; install default Pi first");
}

export function configureT3({ baseDir = process.env.T3CODE_HOME || join(homedir(), ".t3"), piBinary } = {}) {
  const profile = join(root, "pi", "profiles", "default");
  if (!statSync(profile).isDirectory()) throw new Error(`Default Pi profile is unavailable: ${profile}`);
  const binary = piBinary ? resolve(piBinary) : findPiBinary();
  if (!isAbsolute(binary) || !statSync(binary).isFile()) throw new Error("Pi binary must be an existing file");
  const settingsPath = resolve(baseDir, "userdata", "settings.json");
  let settings;
  try { settings = JSON.parse(readFileSync(settingsPath, "utf8")); }
  catch (error) {
    if (error.code !== "ENOENT") throw new Error(`Cannot read T3 settings, left unchanged: ${error.message}`);
    settings = {};
  }
  if (!object(settings) || (settings.providerInstances !== undefined && !object(settings.providerInstances))) {
    throw new Error("Invalid T3 settings object, left unchanged");
  }
  const instances = settings.providerInstances ?? {};
  const previous = instances.pi ?? {};
  if (!object(previous) || (previous.driver !== undefined && previous.driver !== "pi") ||
      (previous.config !== undefined && !object(previous.config)) ||
      (previous.environment !== undefined && (!Array.isArray(previous.environment) ||
        !previous.environment.every(variable => object(variable) && typeof variable.name === "string")))) {
    throw new Error("Invalid or conflicting T3 Pi instance, left unchanged");
  }
  const managedEnvironment = new Map([
    ["PI_CODING_AGENT_DIR", profile],
    // Launching T3 from a Herdr shell must not claim that shell's panes.
    ["HERDR_ENV", "0"],
  ]);
  const environment = (previous.environment ?? []).filter(variable => !managedEnvironment.has(variable.name));
  for (const [name, value] of managedEnvironment) environment.push({ name, value, sensitive: false });
  settings.providerInstances = {
    ...instances,
    pi: {
      ...previous,
      driver: "pi",
      displayName: previous.displayName ?? "Pi",
      enabled: true,
      environment,
      config: { ...previous.config, binaryPath: binary },
    },
  };
  // Let Pi choose its own current model and thinking default. Preserve an explicit T3 choice.
  if (settings.defaultModelSelection === undefined) {
    settings.defaultModelSelection = { instanceId: "pi", model: "default" };
  }
  const serialized = `${JSON.stringify(settings, null, 2)}\n`;
  let current;
  try { current = readFileSync(settingsPath, "utf8"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if (current !== serialized) {
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, serialized, { mode: 0o600 });
  }
  console.log(`T3 Code Pi configured: ${settingsPath}`);
  console.log(`Pi binary: ${binary}\nPi profile: ${profile}`);
  console.log("Refresh Pi in T3 Settings > Providers, then start a new thread. Authentication is not verified by setup.");
  return settingsPath;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = {};
  const args = process.argv.slice(2);
  try {
    for (let index = 0; index < args.length; index += 2) {
      const key = args[index] === "--base-dir" ? "baseDir" : args[index] === "--pi-binary" ? "piBinary" : undefined;
      if (!key || !args[index + 1]) throw new Error("Usage: node scripts/t3-code-setup.mjs [--base-dir <T3 home>] [--pi-binary <executable>]");
      options[key] = args[index + 1];
    }
    configureT3(options);
  } catch (error) {
    console.error(`T3 Code setup failed: ${error.message}`);
    process.exitCode = 1;
  }
}

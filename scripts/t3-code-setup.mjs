#!/usr/bin/env node
// Merge portable preferences and the default Pi integration, never link runtime state.
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);

function piAdapterLauncher(baseDir) {
  const adapter = join(root, "scripts", "t3-pi.mjs");
  if (!statSync(adapter).isFile()) throw new Error("T3 Pi adapter is unavailable");
  // Keep this real file outside pnpm: T3 then uses Pi's native update --self route.
  if (process.platform === "win32") return {
    path: resolve(baseDir, "bin", "t3-pi.cmd"),
    content: `@echo off\r\n"${process.execPath}" "${adapter}" %*\r\n`,
  };
  const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
  return {
    path: resolve(baseDir, "bin", "t3-pi"),
    content: `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(adapter)} "$@"\n`,
  };
}

function readJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT" && fallback !== undefined) return fallback;
    throw new Error(`Cannot read T3 configuration, left unchanged: ${path}`);
  }
}

function writeLocalFile(path, serialized, mode = 0o600) {
  let current;
  try { current = readFileSync(path, "utf8"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if (current !== serialized) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, serialized, { mode });
  }
}

function writeJson(path, value) {
  writeLocalFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function installPiAdapterLauncher(baseDir = process.env.T3CODE_HOME || join(homedir(), ".t3")) {
  const launcher = piAdapterLauncher(baseDir);
  writeLocalFile(launcher.path, launcher.content, 0o700);
  if (process.platform !== "win32") chmodSync(launcher.path, 0o700);
  return launcher.path;
}

const validBindings = value => Array.isArray(value) && value.every(binding =>
  object(binding) && typeof binding.key === "string" && typeof binding.command === "string" &&
  (binding.when === undefined || typeof binding.when === "string"));
const bindingSlot = binding => JSON.stringify([binding.key, binding.when ?? ""]);
const privateEnvironmentNames = [
  "BITWARDEN_ACCESS_KEY",
  "BITWARDEN_API_SERVER",
  "BITWARDEN_IDENTITY_SERVER",
  "BITWARDEN_ORG_ID",
  "ONCLAVE_BWS_PROJECT_ID",
];

function readPrivateEnvironment(path) {
  let content;
  try { content = readFileSync(path, "utf8"); }
  catch (error) {
    if (error.code !== "ENOENT") throw new Error("Cannot read T3 Pi private environment, left unchanged");
    console.warn("T3 Pi private environment unavailable; restore private/secrets.env with Dolos and rerun setup. Existing entries are preserved.");
    return {};
  }
  try { return parseEnv(content); }
  catch { throw new Error("Cannot parse T3 Pi private environment, left unchanged"); }
}

export function configureT3({
  baseDir = process.env.T3CODE_HOME || join(homedir(), ".t3"),
  piBinary,
  secretsFile = join(root, "private", "secrets.env"),
} = {}) {
  const profile = join(root, "pi", "profiles", "default");
  if (!statSync(profile).isDirectory()) throw new Error(`Default Pi profile is unavailable: ${profile}`);
  const launcher = piBinary ? undefined : piAdapterLauncher(baseDir);
  const binary = piBinary ? resolve(piBinary) : launcher.path;
  if (!isAbsolute(binary) || (piBinary && !statSync(binary).isFile())) throw new Error("Pi binary must be an existing file");
  const preferencesDir = join(root, "config", "t3-code");
  const settingsPath = resolve(baseDir, "userdata", "settings.json");
  const clientPath = resolve(baseDir, "userdata", "client-settings.json");
  const bindingsPath = resolve(baseDir, "userdata", "keybindings.json");
  const settings = readJson(settingsPath, {});
  const clientDocument = readJson(clientPath, {});
  // T3 also accepts the older { settings: ... } desktop document shape.
  const client = object(clientDocument) && Object.hasOwn(clientDocument, "settings")
    ? clientDocument.settings : clientDocument;
  const bindings = readJson(bindingsPath, []);
  const preferences = readJson(join(preferencesDir, "settings.json"));
  const clientPreferences = readJson(join(preferencesDir, "client-settings.json"));
  const portableBindings = readJson(join(preferencesDir, "keybindings.json"));
  if (!object(client) || !object(preferences) || !object(clientPreferences) ||
      !validBindings(bindings) || !validBindings(portableBindings)) {
    throw new Error("Invalid T3 preferences or keybindings, left unchanged");
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
  const privateEnvironment = readPrivateEnvironment(secretsFile);
  const privateEntries = privateEnvironmentNames
    .filter(name => typeof privateEnvironment[name] === "string" && privateEnvironment[name].trim() !== "")
    .map(name => ({ name, value: privateEnvironment[name], sensitive: true }));
  const privateNames = new Set(privateEntries.map(variable => variable.name));
  const missingNames = privateEnvironmentNames.filter(name => !privateNames.has(name));
  if (missingNames.length > 0) console.warn(`T3 Pi private environment not supplied for: ${missingNames.join(", ")}. Existing entries are preserved.`);
  const environment = (previous.environment ?? []).filter(variable =>
    !managedEnvironment.has(variable.name) && !privateNames.has(variable.name));
  for (const [name, value] of managedEnvironment) environment.push({ name, value, sensitive: false });
  environment.push(...privateEntries);
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
  // Tracked preference keys are authoritative; all other local keys stay local.
  Object.assign(settings, preferences);
  Object.assign(client, clientPreferences);
  const managedSlots = new Set(portableBindings.map(bindingSlot));
  const mergedBindings = [
    ...bindings.filter(binding => !managedSlots.has(bindingSlot(binding))),
    ...portableBindings,
  ];
  // Keep the native Pi fallback if the snapshot does not specify a model.
  if (settings.defaultModelSelection === undefined) {
    settings.defaultModelSelection = { instanceId: "pi", model: "default" };
  }
  if (launcher) installPiAdapterLauncher(baseDir);
  writeJson(settingsPath, settings);
  writeJson(clientPath, clientDocument);
  writeJson(bindingsPath, mergedBindings);
  console.log(`T3 Code preferences and Pi configured: ${settingsPath}`);
  console.log(`Pi binary: ${binary}\nPi profile: ${profile}`);
  console.log(`Pi private environment: ${privateEntries.length} entries applied from the local secrets file; values are not logged.`);
  console.log("Restart T3 when idle to load client preferences. Refresh Pi in Settings > Providers, then start a new thread. Authentication is not verified by setup.");
  return settingsPath;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = {};
  const args = process.argv.slice(2);
  try {
    for (let index = 0; index < args.length; index += 2) {
      const key = args[index] === "--base-dir" ? "baseDir" : args[index] === "--pi-binary" ? "piBinary"
        : args[index] === "--secrets-file" ? "secretsFile" : undefined;
      if (!key || !args[index + 1]) throw new Error("Usage: node scripts/t3-code-setup.mjs [--base-dir <T3 home>] [--pi-binary <executable>] [--secrets-file <local env file>]");
      options[key] = args[index + 1];
    }
    configureT3(options);
  } catch (error) {
    console.error(`T3 Code setup failed: ${error.message}`);
    process.exitCode = 1;
  }
}

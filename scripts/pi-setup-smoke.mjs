#!/usr/bin/env node
// Configuration acceptance only: no model prompt, credential refresh, or service connection.
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

async function stopTree(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => execFile("taskkill", ["/pid", String(child.pid), "/t", "/f"],
      { windowsHide: true, timeout: 5_000 }, () => resolve()));
  } else {
    try { process.kill(-child.pid, "SIGTERM"); }
    catch (error) { if (error.code !== "ESRCH") throw error; }
  }
}

async function inspectLaunch(executable, args, cwd, env) {
  const child = spawn(executable, args, {
    cwd, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
    detached: process.platform !== "win32",
  });
  let stderr = "";
  let buffer = "";
  let state;
  try {
    return await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error("Pi setup probe timed out")), 30_000);
      const fail = (error) => { clearTimeout(deadline); reject(error); };
      child.on("error", fail);
      child.stdin.on("error", fail);
      child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-8_000); });
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        buffer += chunk;
        let newline;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline).replace(/\r$/, "");
          buffer = buffer.slice(newline + 1);
          if (!line) continue;
          let record;
          try { record = JSON.parse(line); }
          catch { fail(new Error(`Unexpected Pi RPC output: ${line.slice(0, 300)}`)); return; }
          if (record.type !== "response" || record.id !== "setup-state") continue;
          if (record.success !== true) { fail(new Error(record.error || "Pi state inspection failed")); return; }
          state = record.data;
          child.stdin.end(); // RPC EOF requests orderly disposal. No prompt is sent.
        }
      });
      child.on("close", (code, signal) => {
        clearTimeout(deadline);
        if (code !== 0) reject(new Error(`Pi probe exited ${code ?? signal}: ${stderr}`));
        else if (!state) reject(new Error(`Pi returned no setup state: ${stderr}`));
        else resolve(state);
      });
      child.stdin.write(JSON.stringify({ id: "setup-state", type: "get_state" }) + "\n");
    });
  } finally {
    await stopTree(child);
  }
}

export async function checkPiSetup(root) {
  root = await realpath(root);
  const profile = path.join(root, "pi", "profiles", "default");
  const nativeAlias = path.join(homedir(), ".pi", "agent");
  assert.equal(await realpath(nativeAlias), await realpath(profile),
    "Native ~/.pi/agent must point to default; run Pi default setup before claiming readiness");
  const settings = JSON.parse(await readFile(path.join(profile, "settings.json"), "utf8"));
  assert.equal(typeof settings.defaultProvider, "string", "Default provider is not configured");
  assert.equal(typeof settings.defaultModel, "string", "Default model is not configured");
  const manifestPath = path.join(profile, "node_modules", "@earendil-works", "pi-coding-agent", "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const entry = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.pi;
  assert.equal(typeof entry, "string", "Installed Pi has no supported bin.pi entry");
  const cli = path.resolve(path.dirname(manifestPath), entry);
  const scratch = await mkdtemp(path.join(tmpdir(), "pi-setup-probe-"));
  try {
    const extension = path.join(scratch, "probe.js");
    await writeFile(extension, `
import { writeFileSync } from 'node:fs';
import { getAgentDir, SettingsManager } from '@earendil-works/pi-coding-agent';
export default function(pi) {
  globalThis.fetch = async () => { throw new Error('Network is disabled in Pi setup acceptance'); };
  pi.on('session_start', (_event, ctx) => {
    const settings = SettingsManager.create(ctx.cwd, getAgentDir());
    const provider = settings.getDefaultProvider();
    const model = settings.getDefaultModel();
    const definition = ctx.modelRegistry.find(provider, model);
    const available = ctx.modelRegistry.getAvailable().some(candidate => candidate.provider === provider && candidate.id === model);
    writeFileSync(process.env.PI_SETUP_PROBE_FILE, JSON.stringify({
      directory: getAgentDir(), override: process.env.PI_CODING_AGENT_DIR ?? null,
      configuredProvider: provider, configuredModel: model,
      definition: definition && { provider: definition.provider, id: definition.id }, available,
    }));
  });
}
`);
    const env = { ...process.env, PI_OFFLINE: "1" };
    // Test native fallback deliberately, not the orchestrator's explicit profile selection.
    delete env.PI_CODING_AGENT_DIR;
    delete env.PI_CODING_AGENT_SESSION_DIR;
    delete env.PI_SUBAGENT_AUTHORITY;
    delete env.PI_HERDR_PLAN_RUN;
    const common = ["--offline", "--mode", "rpc", "--no-session", "--no-tools", "--no-extensions",
      "--no-skills", "--no-prompt-templates", "--no-context-files", "--no-approve", "--extension", extension];
    const nativeMarker = path.join(scratch, "native.json");
    const nativeState = await inspectLaunch(process.execPath, [cli, ...common], scratch,
      { ...env, PI_SETUP_PROBE_FILE: nativeMarker });
    const native = JSON.parse(await readFile(nativeMarker, "utf8"));
    assert.equal(native.override, null, "Native launch was masked by a profile override");
    assert.equal(await realpath(native.directory), await realpath(profile), "Native Pi loaded another profile");

    const wrapperMarker = path.join(scratch, "wrapper.json");
    const launcher = path.join(root, "scripts", process.platform === "win32" ? "pi-profile-launch.ps1" : "pi-profile-launch");
    const executable = process.platform === "win32" ? "pwsh" : "bash";
    const args = process.platform === "win32" ? ["-NoProfile", "-File", launcher, ...common] : [launcher, ...common];
    const wrapperState = await inspectLaunch(executable, args, scratch,
      { ...env, PI_SETUP_PROBE_FILE: wrapperMarker });
    const wrapper = JSON.parse(await readFile(wrapperMarker, "utf8"));
    assert.equal(await realpath(wrapper.directory), await realpath(profile), "Wrapper Pi loaded another profile");
    assert.equal(await realpath(wrapper.override), await realpath(profile), "Wrapper did not select default explicitly");
    for (const probe of [native, wrapper]) {
      assert.equal(probe.configuredProvider, settings.defaultProvider, "Pi loaded another default provider");
      assert.equal(probe.configuredModel, settings.defaultModel, "Pi loaded another default model");
      assert(probe.definition, `Configured default model is absent from the runtime: ${settings.defaultProvider}/${settings.defaultModel}`);
      assert.equal(probe.definition.provider, settings.defaultProvider, "Runtime model uses another provider");
      assert.equal(probe.definition.id, settings.defaultModel, "Runtime returned another model");
    }
    assert.equal(nativeState.model?.provider, wrapperState.model?.provider, "Native and wrapper selected different providers");
    assert.equal(nativeState.model?.id, wrapperState.model?.id, "Native and wrapper selected different models");
    // Pi deliberately falls back when the configured provider has no credentials.
    // A new installation must not require login merely to verify configuration.
    if (native.available && wrapper.available) {
      assert.equal(nativeState.model?.provider, settings.defaultProvider, "Pi did not select the available configured provider");
      assert.equal(nativeState.model?.id, settings.defaultModel, "Pi did not select the available configured model");
    }
    const selection = native.available && wrapper.available ? "selection verified" : "selection deferred until credentials are configured";
    console.log(`Pi ${manifest.version}: native and wrapper load default (${settings.defaultProvider}/${settings.defaultModel}); ${selection}. Authentication unverified; no model request made.`);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--root") {
    console.error("Usage: node scripts/pi-setup-smoke.mjs --root <repository>");
    process.exitCode = 2;
  } else {
    await checkPiSetup(args[1]).catch((error) => {
      console.error(`Pi setup acceptance failed: ${error.message}`);
      process.exitCode = 1;
    });
  }
}

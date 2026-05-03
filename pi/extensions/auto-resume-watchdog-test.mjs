#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const sourcePath = new URL("./auto-resume-watchdog.ts", import.meta.url);
const source = fs.readFileSync(sourcePath, "utf8");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "auto-resume-watchdog-"));
const outPath = path.join(tmpDir, "auto-resume-watchdog.mjs");
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText
  .replace(/from "\.\.\/lib\/extension-utils\.js";/g, 'from "./extension-utils.js";')
  .replace(/from "\.\.\/lib\/settings-loader\.js";/g, 'from "./settings-loader.js";');
fs.writeFileSync(path.join(tmpDir, "extension-utils.js"), "export function uiNotify(){}\n");
fs.writeFileSync(path.join(tmpDir, "settings-loader.js"), "export function getUserSettingsPath(){return ''}\nexport function invalidateSettingsCache(){}\nexport function readMergedSettings(){return {}}\n");
fs.writeFileSync(outPath, transpiled);

const mod = await import(pathToFileURL(outPath));
const {
  DEFAULT_WATCHDOG_CONFIG,
  GUARDED_CONTINUATION_PROMPT,
  createInitialWatchdogState,
  evaluateWatchdog,
  recordWatchdogActivity,
  setBuiltInAutoRetryActive,
} = mod;

function cfg(mode, nowRef) {
  return { ...DEFAULT_WATCHDOG_CONFIG, mode, now: () => nowRef.value };
}

assert.match(source, /extension-observe-only/);
assert.match(source, /WebSocket error event/);
assert.match(source, /observe-only/);
assert.match(source, /90_000|90s/);
assert.match(source, /5 \* 60_000|5m/);
assert.match(source, /auto_retry active/);
assert.match(GUARDED_CONTINUATION_PROMPT, /verify whether the last tool\/file operation completed/i);

let now = { value: 0 };
let state = createInitialWatchdogState(now.value);
recordWatchdogActivity(state, "agent_start", now.value);
now.value = 91_000;
assert.equal(evaluateWatchdog(state, cfg("observe-only", now)).action, "notify", "observe-only detection does not send");
assert.equal(state.autoResumesThisSession, 0);

now = { value: 0 };
state = createInitialWatchdogState(now.value);
recordWatchdogActivity(state, "agent_start", now.value);
now.value = 91_000;
let decision = evaluateWatchdog(state, cfg("auto", now));
assert.equal(decision.action, "resume", "auto mode sends exactly one guarded continuation");
assert.equal(decision.prompt, GUARDED_CONTINUATION_PROMPT);
assert.equal(evaluateWatchdog(state, cfg("auto", now)).action, "notify", "cooldown prevents immediate second resume");

now.value += DEFAULT_WATCHDOG_CONFIG.cooldownMs + 1;
assert.equal(evaluateWatchdog(state, cfg("auto", now)).action, "notify", "max per prompt prevents repeated resumes");

for (let i = 0; i < 3; i++) {
  recordWatchdogActivity(state, "agent_start", now.value);
  now.value += DEFAULT_WATCHDOG_CONFIG.staleMs + DEFAULT_WATCHDOG_CONFIG.cooldownMs + 1;
  evaluateWatchdog(state, cfg("auto", now));
}
recordWatchdogActivity(state, "agent_start", now.value);
now.value += DEFAULT_WATCHDOG_CONFIG.staleMs + DEFAULT_WATCHDOG_CONFIG.cooldownMs + 1;
assert.equal(evaluateWatchdog(state, cfg("auto", now)).reason, "max auto-resumes per session reached", "session max attempts enforced");

now = { value: 0 };
state = createInitialWatchdogState(now.value);
recordWatchdogActivity(state, "agent_start", now.value);
recordWatchdogActivity(state, "tool_start", now.value, { name: "write", id: "t1" });
now.value = 200_000;
assert.equal(evaluateWatchdog(state, cfg("auto", now)).reason, "tool still running", "long-running valid tool not resumed early");

recordWatchdogActivity(state, "tool_end", now.value, { name: "write", id: "t1" });
setBuiltInAutoRetryActive(state, true);
now.value += 100_000;
assert.equal(evaluateWatchdog(state, cfg("auto", now)).reason, "auto_retry active", "built-in auto-retry active prevents resume");

setBuiltInAutoRetryActive(state, false);
recordWatchdogActivity(state, "user_steering", now.value);
now.value += 100_000;
assert.equal(evaluateWatchdog(state, cfg("auto", now)).reason, "user steering/follow-up active", "active steering/follow-up prevents resume");

state = createInitialWatchdogState(0);
now = { value: 500_000 };
assert.equal(evaluateWatchdog(state, cfg("auto", now)).reason, "no active agent run", "provider outage/no activity does not resume without active agent");

recordWatchdogActivity(state, "agent_start", now.value);
recordWatchdogActivity(state, "agent_end", now.value + 1);
now.value += 200_000;
assert.equal(evaluateWatchdog(state, cfg("auto", now)).reason, "no active agent run", "agent_end reset clears active state");

console.log("auto-resume-watchdog tests passed");

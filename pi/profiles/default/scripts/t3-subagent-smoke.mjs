import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, watch, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir, homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const profile = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => { const at = args.indexOf(name); return at < 0 ? fallback : args[at + 1]; };
const t3Path = option("--t3-cli", process.env.T3CODE_CLI_PATH || path.join(homedir(), ".t3", "bin", process.platform === "win32" ? "t3.cmd" : "t3"));
function launcher(file) {
  if (process.platform !== "win32" || !file.endsWith(".cmd")) return { executable: file, prefix: [] };
  const shim = readFileSync(file, "utf8");
  const match = /^"([^"\r\n]+\.exe)" "([^"\r\n]+\.mjs)" %\*/m.exec(shim);
  if (!match) throw new Error("The selected desktop T3 shim does not identify its installed executable/CLI entry");
  return { executable: match[1], prefix: [match[2]] };
}
const t3 = launcher(t3Path);
const scratch = mkdtempSync(path.join(tmpdir(), "pi-t3-role-smoke-"));
const home = path.join(scratch, "t3-home");
const runtimeProfile = path.join(scratch, "profile");
const project = path.join(scratch, "project");
const evidence = path.join(scratch, "evidence.jsonl");
const processEvidence = path.join(scratch, "processes.jsonl");
const preload = path.join(scratch, "capture-pi.cjs");
const env = { ...process.env, ELECTRON_RUN_AS_NODE: "1", T3CODE_HOME: home, T3CODE_TELEMETRY_ENABLED: "false" };
for (const key of Object.keys(env)) {
  if (key.startsWith("PI_SUBAGENT_") || key.startsWith("PI_HERDR_") || key.startsWith("HERDR_") || key.startsWith("HC_") || ["T3_MCP_URL", "T3_MCP_BEARER_TOKEN", "T3_PI_MCP_EXTENSION_PATH", "T3_PI_RUNTIME_MODE", "BITWARDEN_ACCESS_KEY"].includes(key)) delete env[key];
}
const execute = promisify(execFile);
const cli = (...command) => execute(t3.executable, [...t3.prefix, ...command], { env, cwd: project, windowsHide: true, timeout: 240_000, maxBuffer: 2 * 1024 * 1024 });
const git = (...command) => execute("git", ["-C", project, ...command], { env, windowsHide: true, timeout: 15_000 });
const rows = () => existsSync(evidence) ? readFileSync(evidence, "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)) : [];
const redact = text => String(text).replace(/https?:\/\/\S+/g, "[URL redacted]").replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
let server;
let serverLog = "";
let succeeded = false;
try {
  mkdirSync(path.join(home, "userdata"), { recursive: true });
  mkdirSync(project, { recursive: true });
  mkdirSync(runtimeProfile, { recursive: true });
  // Use the real worktree profile code without the unrelated, uninitialized Onclave module.
  cpSync(path.join(profile, "extensions"), path.join(runtimeProfile, "extensions"), { recursive: true, filter: source => path.basename(source) !== "onclave-pi.ts" });
  for (const name of ["lib", "agents", "skills", "commands", "prompts", "scripts", "node_modules"]) {
    symlinkSync(path.join(profile, name), path.join(runtimeProfile, name), process.platform === "win32" ? "junction" : "dir");
  }
  for (const name of ["package.json", "damage-control-rules.yaml", "damage-control-settings.json", "AGENTS.md", "keybindings.json"]) {
    cpSync(path.join(profile, name), path.join(runtimeProfile, name));
  }
  writeFileSync(path.join(runtimeProfile, "settings.json"), JSON.stringify({ ...JSON.parse(readFileSync(path.join(profile, "settings.json"), "utf8")), defaultProvider: "t3-role-fixture", defaultModel: "parent", enabledModels: ["t3-role-fixture/*"] }));
  await git("init", "-b", "main");
  writeFileSync(path.join(project, "proof.txt"), "controlled T3 role fixture\n");
  mkdirSync(path.join(project, ".pi"), { recursive: true });
  writeFileSync(path.join(project, ".pi", "settings.json"), JSON.stringify({
    defaultProvider: "t3-role-fixture", defaultModel: "parent", enabledModels: ["t3-role-fixture/*"],
  }, null, 2));
  await git("add", "proof.txt", ".pi/settings.json");
  await git("-c", "user.name=Fixture", "-c", "user.email=fixture@invalid.test", "commit", "-m", "Fixture baseline");
  writeFileSync(preload, `const fs = require("node:fs"); const file = ${JSON.stringify(processEvidence)}; const record = value => fs.appendFileSync(file, JSON.stringify({pid:process.pid,...value})+"\\n"); record({kind:"start",argv:process.argv,cwd:process.cwd(),profile:process.env.PI_CODING_AGENT_DIR}); const original = process.stderr.write.bind(process.stderr); process.stderr.write = (chunk,...args) => { record({kind:"stderr",text:String(chunk)}); return original(chunk,...args); }; const stdout = process.stdout.write.bind(process.stdout); let pending = ""; process.stdout.write = (chunk,...args) => { pending += String(chunk); let at; while ((at=pending.indexOf("\\n"))>=0) { const line=pending.slice(0,at); pending=pending.slice(at+1); try { const row=JSON.parse(line); if (["response","extension_ui_request","agent_start","agent_end"].includes(row.type)) record({kind:"rpc",type:row.type,command:row.command,success:row.success,error:row.error,method:row.method,message:row.message}); } catch {} } return stdout(chunk,...args); }; process.on("exit",code=>record({kind:"exit",code}));`);
  const pi = option("--pi-binary");
  assert(typeof pi === "string" && existsSync(pi), "Pass --pi-binary with the actual Pi executable configured in T3");
  writeFileSync(path.join(home, "userdata", "settings.json"), JSON.stringify({
    defaultModelSelection: { instanceId: "pi", model: "t3-role-fixture/parent" }, defaultRuntimeMode: "full-access",
    providerInstances: { pi: { driver: "pi", enabled: true, displayName: "Pi fixture", config: { binaryPath: pi, launchArgs: `--offline --extension "${path.join(profile, "tests/fixtures/t3-role-smoke-provider.ts").replace(/\\/g, "/")}"`, customModels: ["t3-role-fixture/parent", "t3-role-fixture/child"] }, environment: [
      { name: "PI_CODING_AGENT_DIR", value: runtimeProfile, sensitive: false },
      { name: "PI_T3_ROLE_SMOKE_EVIDENCE", value: evidence, sensitive: false },
      { name: "NODE_OPTIONS", value: `--require="${preload.replace(/\\/g, "/")}"`, sensitive: false },
      { name: "HERDR_ENV", value: "0", sensitive: false },
    ] } },
  }, null, 2));
  const port = await new Promise((resolve, reject) => { const listener = createServer(); listener.once("error", reject); listener.listen(0, "127.0.0.1", () => { const address = listener.address(); listener.close(error => error ? reject(error) : resolve(address.port)); }); });
  const runtimePath = path.join(home, "userdata", "server-runtime.json");
  const ready = new Promise((resolve, reject) => {
    const watcher = watch(path.dirname(runtimePath), () => { if (existsSync(runtimePath)) { try { JSON.parse(readFileSync(runtimePath, "utf8")); finish(); } catch { /* Atomic replacement may produce another event. */ } } });
    const timer = setTimeout(() => finish(new Error("Isolated T3 did not publish runtime state")), 45_000);
    const finish = error => { watcher.close(); clearTimeout(timer); error ? reject(error) : resolve(); };
    server = spawn(t3.executable, [...t3.prefix, "serve", "--base-dir", home, "--host", "127.0.0.1", "--port", String(port), "--no-browser", project], { env, cwd: project, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    server.stdout.on("data", chunk => { serverLog = (serverLog + chunk).slice(-50_000); });
    server.stderr.on("data", chunk => { serverLog = (serverLog + chunk).slice(-50_000); });
    server.once("error", finish);
    server.once("exit", code => finish(new Error(`Isolated T3 exited before readiness (${code})`)));
  });
  const version = (await cli("--version")).stdout.trim();
  await ready;
  await cli("project", "add", "--base-dir", home, project);
  const result = await cli("thread", "start", "--base-dir", home, "--provider", "pi", "--model", "t3-role-fixture/parent", "--title", "Pi role lifecycle smoke", "--wait", "--json", project, "/t3-smoke-bootstrap parent");
  writeFileSync(path.join(scratch, "parent.json"), result.stdout);
  assert.match(result.stdout, /SMOKE_PARENT_DONE parent/);
  const tool = id => {
    const row = rows().find(row => row.kind === "tool" && row.callId === id);
    assert(row && !row.isError, `Missing/failed ${id}: ${JSON.stringify(row)}`);
    return row.details;
  };
  const original = tool("main-question");
  const followup = tool("main-followup-inspect");
  const owner = JSON.parse(result.stdout).threadId;
  assert.equal(typeof owner, "string", result.stdout);
  assert.equal(followup.t3Status, "completed");
  assert.equal(followup.roleOutcome, "partial");
  assert.notEqual(followup.taskId, original.taskId, "Retained follow-up must have a new task ID");
  const send = async phase => {
    const response = await cli("thread", "send", "--base-dir", home, "--wait", "--json", owner, `/t3-smoke-bootstrap ${phase}`);
    writeFileSync(path.join(scratch, `${phase}.json`), response.stdout);
    assert.match(response.stdout, new RegExp(`SMOKE_PARENT_DONE ${phase}`));
    const inspected = tool(`${phase}-inspect`);
    assert.equal(inspected.t3Status, "completed");
    assert.equal(inspected.roleOutcome, "completed");
    assert.notEqual(inspected.taskId, followup.taskId);
  };
  await send("reload");
  assert.equal(tool("reload-command-wait").t3Status, "completed", "Handled reload command must settle without a model acknowledgment");
  // Kill only this run's completed, idle child. No operator/active process or broad tree kill.
  const candidate = rows().filter(row => row.kind === "request" && row.authorityId === original.launchId).at(-1);
  assert(candidate && candidate.pid !== process.pid);
  const last = rows().filter(row => row.pid === candidate.pid && ["request", "settled"].includes(row.kind)).at(-1);
  assert(last?.kind === "settled" && last.idle && !last.aborted, "Restart target must be an idle completed fixture child");
  assert.equal(tool("reload-inspect").threadId, original.childThreadId);
  const starts = readFileSync(processEvidence, "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  assert(starts.some(row => row.kind === "start" && row.pid === candidate.pid && row.profile === runtimeProfile && row.cwd === project));
  process.kill(candidate.pid);
  appendFileSync(evidence, `${JSON.stringify({ kind: "owned-restart", pid: candidate.pid, childThreadId: original.childThreadId, launchId: original.launchId })}\n`);
  await send("restart");
  const recorded = rows();
  const requests = recorded.filter(row => row.kind === "request");
  assert(requests.some(row => row.model === "t3-role-fixture/parent"));
  assert(requests.some(row => row.model === "t3-role-fixture/child"));
  assert(requests.every(row => row.bound === true), "Every model request must follow its private bootstrap command");
  assert(!recorded.some(row => row.kind === "fixture-error"), "All deterministic fixture transitions must succeed");
  assert(recorded.filter(row => row.kind === "tool").every(row => !row.isError), "Every real role tool must succeed");
  assert.notEqual(original.t3Status, "completed", "Async launch must return before its question completes");
  assert.equal(tool("main-completed-inspect").t3Status, "completed");
  assert.equal(tool("main-completed-inspect").roleOutcome, "completed");
  assert.equal(tool("main-question-wait").timedOut, true, "A detached timed-out wait must leave its child live");
  assert.equal(tool("main-cancel-child").hasPendingQuestion, true, "Cancellation target must be held on its own real UI question");
  assert.equal(tool("main-cancel").status, "cancel_requested");
  assert.equal(tool("main-cancel-wait").timedOut, false);
  assert(["cancelled", "interrupted"].includes(tool("main-cancel-inspect").t3Status), "Accepted cancellation must reach T3's real terminal status, not a fabricated role status");
  assert(recorded.findIndex(row => row.callId === "main-worktree") < recorded.findIndex(row => row.callId === "main-answer"), "Sibling completes while the questioning child alone is paused");
  assert(recorded.some(row => row.callId === "child-QUESTION-question" && row.details?.answer === "SMOKE_APPROVED"));
  const childRequests = requests.filter(row => row.model === "t3-role-fixture/child");
  assert(childRequests.every(row => row.role === "reviewer" && !row.tools.includes("write") && !row.tools.includes("codemode") && !row.tools.includes("t3_delegate_role")));
  assert(childRequests.every(row => row.effort === "low" && row.systemPrompt.includes("Selected skill testing")));
  const retained = childRequests.filter(row => row.authorityId === original.launchId);
  assert.equal(new Set(retained.map(row => row.sessionId)).size >= 2, true, "Fresh context must replace the native Pi session");
  assert(retained.some(row => row.pid !== candidate.pid), "Restart must use a new owned Pi process");
  assert(recorded.some(row => row.kind === "session" && row.reason === "reload" && row.pid === candidate.pid));
  assert(retained.every(row => path.resolve(row.cwd) === path.resolve(project)), "Shared checkout remains the actual cwd");
  const worktree = childRequests.filter(row => row.authorityId === tool("main-worktree").launchId);
  assert(worktree.length && worktree.every(row => path.resolve(row.cwd) !== path.resolve(project)));
  assert(existsSync(path.join(worktree[0].cwd, "proof.txt")), "T3 created a real checkout, not a prompt-only cwd");
  assert(!recorded.some(row => row.kind === "custom-message" && row.customType === "subagent-result"), "No duplicate native profile result injection");
  assert(!recorded.some(row => row.kind === "nested-call" && row.name === "subagent"), "No provider-native duplicate subagent card source");
  assert.equal(recorded.filter(row => row.kind === "nested-call" && row.name.endsWith("__delegate_task")).length, 3, "Exactly one native T3 delegation per production role launch");
  assert.equal(typeof tool("main-completed-inspect").resultContextTransferId, "string", "T3 owns the delivered result context transfer");
  assert(recorded.some(row => row.kind === "tool" && row.name === "read" && !row.isError));
  assert.equal(typeof original.childThreadId, "string");
  assert.equal(typeof original.taskId, "string");
  writeFileSync(path.join(scratch, "server.log"), serverLog);
  succeeded = true;
  const runtimeStart = starts.find(row => row.kind === "start" && row.pid === candidate.pid);
  const piVersion = JSON.parse(readFileSync(path.resolve(path.dirname(runtimeStart.argv[1]), "..", "..", "package.json"), "utf8")).version;
  const summary = { t3: version, piVersion, piBinary: pi, profile: runtimeProfile, sourceProfile: profile, evidence: scratch, scenarios: ["async/question/event wait", "independent worktree sibling", "real question read/answer", "completed result/history", "fresh-context partial follow-up/new task ID", "owned question-held cancellation", "idle resource reload", "owned idle process restart/resume"], requests: requests.length, originalTaskId: original.taskId, followupTaskId: followup.taskId, childThreadId: original.childThreadId, cancelledStatus: tool("main-cancel-inspect").t3Status };
  writeFileSync(path.join(scratch, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
} catch (error) {
  writeFileSync(path.join(scratch, "server.log"), serverLog);
  console.error(redact(error?.stack || error));
  if (error?.stderr) console.error(redact(error.stderr));
  if (error?.stdout) { writeFileSync(path.join(scratch, "failed-cli.json"), error.stdout); console.error(redact(error.stdout)); }
  console.error(`Isolated evidence retained: ${scratch}`);
  process.exitCode = 1;
} finally {
  const processRows = existsSync(processEvidence) ? readFileSync(processEvidence, "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)) : [];
  const exited = new Set(processRows.filter(row => row.kind === "exit").map(row => row.pid));
  const ownedPids = new Set([...rows().filter(row => row.kind === "session").map(row => row.pid), ...processRows.filter(row => row.kind === "start").map(row => row.pid)]);
  for (const pid of ownedPids) {
    if (exited.has(pid)) continue;
    if (pid === process.pid) continue;
    try { process.kill(pid); } catch (error) { if (error.code !== "ESRCH") console.error(`Owned fixture Pi cleanup failed for ${pid}: ${error.code}`); }
  }
  if (server && server.exitCode === null) {
    const closed = new Promise(resolve => server.once("close", resolve));
    server.kill();
    await closed;
  }
  if (succeeded && !args.includes("--keep")) rmSync(scratch, { recursive: true, force: true });
}

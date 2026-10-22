import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, it } from "vitest";

const roots: string[] = [];
const children: ChildProcess[] = [];
afterEach(() => {
  for (const child of children.splice(0)) if (child.exitCode === null) child.kill();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

type Endpoint = { port: number; token: string; pid: number; profile: string; server: string; pane: string };
async function fixture(invalid = false, replacementVersion = "2.0.0", migration = false) {
  const root = mkdtempSync(join(tmpdir(), "pi-update-host-test-")); roots.push(root);
  const profile = join(root, "fixture");
  const pkg = join(profile, "node_modules/@earendil-works/pi-coding-agent");
  mkdirSync(pkg, { recursive: true });
  mkdirSync(join(profile, "extensions/damage-control"), { recursive: true });
  writeFileSync(join(profile, "extensions/damage-control/index.js"), "export default function() {}\n");
  const session = join(root, "session.jsonl");
  writeFileSync(session, JSON.stringify({ type: "session", id: invalid ? "other" : "exact-session", cwd: root }) + "\n");
  writeFileSync(join(pkg, "package.json"), JSON.stringify({ bin: { pi: "cli.mjs" } }));
  writeFileSync(join(pkg, "cli.mjs"), `
process.send({type:'pi-update:ready',version:${JSON.stringify(replacementVersion)},sessionId:'exact-session'});
console.log(JSON.stringify({replacement:true,args:process.argv.slice(2),cwd:process.cwd(),profile:process.env.PI_CODING_AGENT_DIR,pane:process.env.HERDR_PANE_ID,restarted:process.env.PI_UPDATE_RESTART,pid:process.pid}));
setTimeout(()=>process.exit(23),300);
`);
  const initial = join(root, "initial.mjs");
  writeFileSync(initial, `
process.send({type:'pi-update:ready',version:'1.0.0',sessionId:'exact-session'});
console.log(JSON.stringify({endpoint:JSON.parse(process.env.PI_UPDATE_ENDPOINT),pid:process.pid}));
process.on('message',m=>{
 if(m.type==='pi-update:request')process.send({type:'pi-update:restart',id:m.id,sessionFile:${JSON.stringify(session)},cwd:${JSON.stringify(root)}});
 if(m.type==='pi-update:accepted')process.exit(0);
 if(m.type==='pi-update:rejected'){console.log(JSON.stringify({rejected:true}));setTimeout(()=>process.exit(23),100);}
});
setTimeout(()=>process.exit(98),10000).unref();
`);
  const runner = join(root, "runner.mjs");
  const host = pathToFileURL(resolve("../../../scripts/pi-update-host.mjs")).href;
  writeFileSync(runner, `import {runUpdateHost} from ${JSON.stringify(host)};const outcome=await runUpdateHost({target:${JSON.stringify(migration ? pkg : initial)},args:${migration ? "[]" : "['initial-prompt']"}${migration ? `,beforeStart:async endpoint=>{console.log(JSON.stringify({endpoint,pid:process.pid}));await new Promise(accept=>setTimeout(accept,100));console.log(JSON.stringify({admitted:true}));return {args:['--session',${JSON.stringify(session)}],cwd:${JSON.stringify(root)},sessionId:'exact-session'};}` : ""}});console.log(JSON.stringify({outcome}));`);
  const child = spawn(process.execPath, [runner], { env: { ...process.env, PI_CODING_AGENT_DIR: profile, HERDR_ENV: "1", HERDR_SOCKET_PATH: "isolated-fixture", HERDR_PANE_ID: "w2:p4", PI_HERDR_PLAN_RUN: "must-not-replay" }, cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  let stdout = "", stderr = "";
  const lines: Record<string, unknown>[] = [];
  let notify: (() => void) | undefined;
  child.stdout!.on("data", data => {
    stdout += String(data);
    let index: number;
    while ((index = stdout.indexOf("\n")) >= 0) {
      lines.push(JSON.parse(stdout.slice(0, index))); stdout = stdout.slice(index + 1); notify?.();
    }
  });
  child.stderr!.on("data", data => { stderr += String(data); });
  const closed = new Promise<number | null>((accept, reject) => { child.once("error", reject); child.once("close", code => accept(code)); });
  const initialLine = await new Promise<Record<string, unknown>>((accept, reject) => {
    const timer = setTimeout(() => reject(new Error(`Fixture startup timed out: ${stderr}`)), 5000);
    notify = () => { if (lines[0]) { clearTimeout(timer); accept(lines[0]); } };
    notify();
  });
  const endpoint = initialLine.endpoint as Endpoint;
  return { endpoint, lines, closed, root, profile, session, stderr: () => stderr };
}

function request(endpoint: Endpoint, token = endpoint.token, confirm = false): Promise<{ status: string; reason?: string; version?: string }> {
  return new Promise((accept, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: endpoint.port });
    let data = "";
    socket.setTimeout(5000, () => socket.destroy(new Error("Fixture request timed out")));
    socket.once("connect", () => socket.write(JSON.stringify({ token, action: confirm ? "confirm" : "restart", version: "2.0.0", ...(confirm ? { sessionId: "exact-session" } : {}) }) + "\n"));
    socket.on("data", chunk => { data += String(chunk); });
    socket.once("error", reject);
    socket.once("end", () => { try { accept(JSON.parse(data)); } catch { reject(new Error("No authorized response")); } });
  });
}

it("replaces the real child in the same host and resumes exact session/cwd/profile/pane with the newly resolved package", async () => {
  const f = await fixture();
  await expect(request(f.endpoint)).resolves.toEqual({ status: "restarted", version: "2.0.0" });
  await expect(f.closed).resolves.toBe(0);
  const replacement = f.lines.find(line => line.replacement);
  expect(replacement).toMatchObject({ args: ["--session", f.session], cwd: f.root, profile: f.profile, pane: "w2:p4", restarted: "1" });
  expect(replacement?.pid).not.toBe(f.lines[0].pid);
  expect(f.lines.at(-1)).toEqual({ outcome: { code: 23, signal: null } });
  expect(f.stderr()).toBe("");
});

it("admits a migrated session before starting Pi and confirms the first replacement without restarting it again", async () => {
  const f = await fixture(false, "2.0.0", true);
  await expect(request(f.endpoint, f.endpoint.token, true)).resolves.toEqual({ status: "restarted", version: "2.0.0" });
  await f.closed;
  const admission = f.lines.findIndex(line => line.admitted);
  const replacement = f.lines.findIndex(line => line.replacement);
  expect(admission).toBeGreaterThan(0); expect(replacement).toBeGreaterThan(admission);
  expect(f.lines[replacement]).toMatchObject({ args: ["--session", f.session], cwd: f.root, restarted: "1" });
});

it("rejects mismatched saved session identity before allowing the original to exit", async () => {
  const f = await fixture(true);
  await expect(request(f.endpoint)).resolves.toMatchObject({ status: "failed", reason: "Saved session identity does not match" });
  await f.closed;
  expect(f.lines.some(line => line.rejected)).toBe(true);
  expect(f.lines.some(line => line.replacement)).toBe(false);
});

it("keeps the original process alive when restart preflight fails", async () => {
  const f = await fixture();
  writeFileSync(join(f.profile, "extensions/damage-control/index.js"), "export default { broken");
  await expect(request(f.endpoint)).resolves.toMatchObject({ status: "failed", reason: "Pi restart preflight failed; repair the default profile and relaunch" });
  await f.closed;
  expect(f.lines.some(line => line.rejected)).toBe(true);
  expect(f.lines.some(line => line.replacement)).toBe(false);
});

it("does not claim success when the replacement runs the wrong version", async () => {
  const f = await fixture(false, "1.9.0");
  await expect(request(f.endpoint)).resolves.toMatchObject({ status: "failed", reason: "Replacement version or session identity did not match" });
  await f.closed;
});

it("does not authorize unauthenticated restart requests", async () => {
  const f = await fixture();
  await expect(request(f.endpoint, "wrong-token")).rejects.toThrow("No authorized response");
  await expect(request(f.endpoint)).resolves.toMatchObject({ status: "restarted" });
  await f.closed;
});

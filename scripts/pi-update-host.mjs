#!/usr/bin/env node
// Owns the terminal lifetime while an ordinary Pi cooperatively replaces itself.
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, readSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";

export function updateRegistryDirectory() {
  return join(tmpdir(), `pi-update-${createHash("sha256").update(homedir()).digest("hex").slice(0, 16)}`);
}

export function resolvePiEntry(target) {
  let entry = target;
  if (statSync(target).isDirectory()) {
    const metadata = JSON.parse(readFileSync(join(target, "package.json"), "utf8"));
    if (typeof metadata.bin?.pi !== "string" || !metadata.bin.pi) throw new Error("Pi package requires a bin.pi entrypoint");
    entry = resolve(target, metadata.bin.pi);
  }
  if (!isAbsolute(entry) || !statSync(entry).isFile()) throw new Error("Absolute Pi entrypoint required");
  return entry;
}

function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function sessionHeader(file) {
  const fd = openSync(file, "r");
  try {
    const buffer = Buffer.alloc(64 * 1024);
    const length = readSync(fd, buffer, 0, buffer.length, 0);
    const line = buffer.subarray(0, length).toString("utf8").split("\n", 1)[0];
    return JSON.parse(line);
  } finally { closeSync(fd); }
}

export async function runUpdateHost({ target, args, env = process.env, cwd = process.cwd(), beforeStart }) {
  const profile = env.PI_CODING_AGENT_DIR;
  if (!profile || !isAbsolute(profile)) throw new Error("Absolute Pi profile required");
  let child, ready, pending, restart, stopSignal, stopped = false;
  let currentArgs = args, currentCwd = cwd;
  let first = true;
  const connections = new Set();
  const token = randomBytes(32).toString("hex");
  const registry = updateRegistryDirectory();
  mkdirSync(registry, { recursive: true, mode: 0o700 });
  const registryFile = join(registry, `${process.pid}-${randomUUID()}.json`);
  const finishRequest = response => {
    if (!pending) return;
    clearTimeout(pending.timer);
    pending.socket.end(`${JSON.stringify(response)}\n`);
    pending = undefined;
  };
  const server = net.createServer(socket => {
    connections.add(socket);
    socket.setTimeout(45_000, () => socket.destroy());
    socket.on("error", () => {});
    socket.on("close", () => connections.delete(socket));
    let buffer = "", consumed = false;
    socket.on("data", chunk => {
      if (consumed) return;
      buffer += chunk.toString();
      if (buffer.length > 8192) return socket.destroy();
      if (!buffer.includes("\n")) return;
      consumed = true;
      let request;
      try { request = JSON.parse(buffer.slice(0, buffer.indexOf("\n"))); } catch { return socket.destroy(); }
      if (!object(request) || request.token !== token || !["restart", "confirm"].includes(request.action) || typeof request.version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(request.version)) return socket.destroy();
      if (request.action === "confirm") {
        if (typeof request.sessionId !== "string" || !request.sessionId || pending || stopped) return socket.destroy();
        if (ready) return socket.end(`${JSON.stringify(ready.version === request.version && ready.sessionId === request.sessionId ? { status: "restarted", version: ready.version } : { status: "failed", reason: "Replacement version or session identity did not match" })}\n`);
        pending = { socket, version: request.version, sessionId: request.sessionId, awaitingReplacement: true,
          timer: setTimeout(() => finishRequest({ status: "failed", reason: "Migration restart not confirmed; inspect before retrying" }), 40_000) };
        return;
      }
      if (pending || !child?.connected || !ready || stopped) {
        return socket.end(`${JSON.stringify({ status: "skipped", reason: "Session is starting, stopping, or already updating" })}\n`);
      }
      const id = randomUUID();
      pending = { id, socket, version: request.version, sessionId: ready.sessionId, awaitingReplacement: false,
        timer: setTimeout(() => finishRequest({ status: "failed", reason: "Restart not confirmed; inspect this session before retrying" }), 40_000) };
      try { child.send({ type: "pi-update:request", id, version: request.version }); }
      catch { finishRequest({ status: "skipped", reason: "Pi update integration unavailable" }); }
    });
  });
  await new Promise((accept, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", accept); });
  const address = server.address();
  const descriptor = { port: address.port, token, pid: process.pid, profile,
    server: env.HERDR_ENV === "1" ? env.HERDR_SOCKET_PATH || "" : "", pane: env.HERDR_ENV === "1" ? env.HERDR_PANE_ID || "" : "" };
  writeFileSync(registryFile, JSON.stringify(descriptor), { mode: 0o600, flag: "wx" });
  const forwarders = new Map(["SIGINT", "SIGTERM", "SIGHUP"].map(signal => [signal, () => {
    stopped = true; stopSignal = signal;
    restart = undefined;
    if (child && child.exitCode === null && child.signalCode === null) child.kill(signal);
  }]));
  for (const [signal, handler] of forwarders) process.on(signal, handler);
  try {
    if (beforeStart) {
      const admitted = await beforeStart(descriptor);
      currentArgs = admitted.args;
      currentCwd = admitted.cwd;
      descriptor.sessionId = admitted.sessionId;
    }
    for (;;) {
      if (stopped) {
        finishRequest({ status: "failed", reason: "Replacement startup was interrupted" });
        return { code: null, signal: stopSignal };
      }
      ready = undefined;
      restart = undefined;
      const childEnv = { ...env, PI_UPDATE_ENDPOINT: JSON.stringify(descriptor), PI_UPDATE_HOST_PID: String(process.pid) };
      delete childEnv.PI_UPDATE_MIGRATION;
      if (!first || beforeStart) { delete childEnv.PI_HERDR_PLAN_RUN; childEnv.PI_UPDATE_RESTART = "1"; }
      else delete childEnv.PI_UPDATE_RESTART;
      const entry = resolvePiEntry(first ? target : join(profile, "node_modules/@earendil-works/pi-coding-agent"));
      child = spawn(process.execPath, [entry, ...currentArgs], { cwd: currentCwd, env: childEnv, stdio: ["inherit", "inherit", "inherit", "ipc"], shell: false });
      child.on("message", message => {
        if (!object(message)) return;
        if (message.type === "pi-update:ready" && typeof message.version === "string" && typeof message.sessionId === "string") {
          ready = { version: message.version, sessionId: message.sessionId };
          descriptor.sessionId = message.sessionId;
          writeFileSync(registryFile, JSON.stringify(descriptor), { mode: 0o600 });
          if (pending?.awaitingReplacement) {
            finishRequest(ready.version === pending.version && ready.sessionId === pending.sessionId
              ? { status: "restarted", version: ready.version }
              : { status: "failed", reason: "Replacement version or session identity did not match" });
          }
        } else if (message.id === pending?.id && message.type === "pi-update:skip" && typeof message.reason === "string") {
          restart = undefined;
          finishRequest({ status: "skipped", reason: message.reason });
        } else if (message.id === pending?.id && message.type === "pi-update:restart" && !stopped) {
          try {
            if (typeof message.sessionFile !== "string" || !isAbsolute(message.sessionFile) || typeof message.cwd !== "string" || !isAbsolute(message.cwd) || !statSync(message.cwd).isDirectory()) throw new Error("Invalid restart coordinates");
            const header = sessionHeader(message.sessionFile);
            if (header.type !== "session" || header.id !== pending.sessionId) throw new Error("Saved session identity does not match");
            resolvePiEntry(join(profile, "node_modules/@earendil-works/pi-coding-agent"));
            const preflight = fileURLToPath(new URL("./pi-damage-control-preflight.mjs", import.meta.url));
            const checked = spawnSync(process.execPath, [preflight, join(profile, "extensions/damage-control/index.js")], { stdio: "ignore", timeout: 10_000, windowsHide: true });
            if (checked.error || checked.status !== 0) throw new Error("Pi restart preflight failed; repair the default profile and relaunch");
            restart = { sessionFile: message.sessionFile, cwd: message.cwd };
            child.send({ type: "pi-update:accepted", id: pending.id });
          } catch (error) {
            restart = undefined;
            child.send({ type: "pi-update:rejected", id: pending.id, reason: error.message });
            finishRequest({ status: "failed", reason: error.message });
          }
        }
      });
      const outcome = await new Promise((accept, reject) => {
        child.once("error", reject);
        child.once("close", (code, signal) => accept({ code, signal }));
      });
      if (!restart || stopped || outcome.code !== 0 || outcome.signal) {
        finishRequest({ status: "failed", reason: "Pi exited without a completed cooperative restart" });
        return outcome;
      }
      if (pending) pending.awaitingReplacement = true;
      currentArgs = ["--session", restart.sessionFile];
      currentCwd = restart.cwd;
      first = false;
    }
  } catch (error) {
    finishRequest({ status: "failed", reason: error.message });
    throw error;
  } finally {
    for (const [signal, handler] of forwarders) process.removeListener(signal, handler);
    for (const socket of connections) socket.destroy();
    await new Promise(accept => server.close(accept));
    rmSync(registryFile, { force: true });
  }
}

async function main() {
  if (process.argv[2] !== "--") throw new Error("Expected -- followed by Pi arguments");
  const profile = process.env.PI_CODING_AGENT_DIR;
  if (!profile) throw new Error("Pi profile unavailable");
  const outcome = await runUpdateHost({ target: join(profile, "node_modules/@earendil-works/pi-coding-agent"), args: process.argv.slice(3) });
  if (outcome.signal) { try { process.kill(process.pid, outcome.signal); } catch { process.exitCode = 128; } }
  else process.exitCode = outcome.code ?? 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

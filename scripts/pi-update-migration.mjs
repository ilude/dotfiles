import net from "node:net";
import { isAbsolute } from "node:path";
import { spawnSync } from "node:child_process";

function object(value) { return value && typeof value === "object" && !Array.isArray(value); }
function exchange(endpoint, message) {
  return new Promise((accept, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: endpoint.port });
    let buffer = "";
    const timer = setTimeout(() => socket.destroy(new Error("Migration admission timed out")), 35_000);
    socket.once("error", reject);
    socket.once("close", () => clearTimeout(timer));
    socket.once("end", () => { if (!buffer.includes("\n")) reject(new Error("Migration admission disconnected")); });
    socket.once("connect", () => socket.write(`${JSON.stringify({ token: endpoint.token, ...message })}\n`));
    socket.on("data", chunk => {
      buffer += String(chunk);
      if (buffer.length > 8192) return socket.destroy(new Error("Invalid migration admission"));
      if (!buffer.includes("\n")) return;
      try { accept(JSON.parse(buffer.slice(0, buffer.indexOf("\n")))); } catch (error) { reject(error); }
      clearTimeout(timer); socket.destroy();
    });
  });
}

export async function waitForOriginExit(pid, { alive = pid => {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === "ESRCH") return false; throw error; }
}, timeoutMs = 10_000, delay = ms => new Promise(accept => setTimeout(accept, ms)) } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (alive(pid)) {
    if (Date.now() >= deadline) throw new Error("Original Pi did not exit; replacement has not opened its conversation");
    await delay(50);
  }
}

/** The replacement owns this wait, so the original can exit without losing its handoff. */
export async function admitMigration(raw, replacement, env, { run = spawnSync, wait = waitForOriginExit } = {}) {
  let endpoint;
  try { endpoint = JSON.parse(raw); } catch { throw new Error("Invalid migration endpoint"); }
  if (!object(endpoint) || !Number.isInteger(endpoint.port) || endpoint.port < 1 || endpoint.port > 65535 || typeof endpoint.token !== "string" || !/^[a-f0-9]{64}$/.test(endpoint.token) || !Number.isInteger(endpoint.pid) || endpoint.pid <= 0) throw new Error("Invalid migration endpoint");
  const value = await exchange(endpoint, { action: "admit", endpoint: replacement });
  if (!object(value) || value.error || typeof value.sessionFile !== "string" || !isAbsolute(value.sessionFile) || typeof value.cwd !== "string" || !isAbsolute(value.cwd)
    || typeof value.sessionId !== "string" || !value.sessionId || typeof value.version !== "string" || !Number.isInteger(value.originPid) || value.originPid <= 0 || value.originPid === process.pid || value.originPid !== endpoint.pid || (endpoint.sessionId && value.sessionId !== endpoint.sessionId)
    || !object(value.origin) || typeof value.origin.pane_id !== "string" || typeof value.origin.tab_id !== "string" || typeof value.origin.workspace_id !== "string") throw new Error("Migration admission was rejected or incomplete");
  await wait(value.originPid);
  // A pre-feature plugin may retire its pane itself; a plain shell launch leaves it behind.
  const info = run(env.HERDR_BIN_PATH || "herdr", ["pane", "list", "--workspace", value.origin.workspace_id], { env, encoding: "utf8", windowsHide: true, timeout: 5000 });
  if (info.error || info.status !== 0) throw new Error("Cannot verify old pane retirement");
  const snapshot = JSON.parse(info.stdout);
  const panes = snapshot?.result?.panes;
  if (!Array.isArray(panes)) throw new Error("Herdr omitted pane retirement state");
  const old = panes.find(pane => pane.pane_id === value.origin.pane_id);
  if (old) {
    if (old.tab_id !== value.origin.tab_id || (value.origin.terminal_id && old.terminal_id !== value.origin.terminal_id)) throw new Error("Original pane identity changed");
    const closed = run(env.HERDR_BIN_PATH || "herdr", ["pane", "close", value.origin.pane_id], { env, stdio: "ignore", windowsHide: true, timeout: 5000 });
    if (closed.error || closed.status !== 0) throw new Error("Cannot retire old Pi pane");
  }
  if (env.PI_UPDATE_PANE_LABEL) run(env.HERDR_BIN_PATH || "herdr", ["pane", "rename", replacement.pane, env.PI_UPDATE_PANE_LABEL], { env, stdio: "ignore", windowsHide: true, timeout: 2000 });
  return { args: ["--session", value.sessionFile], cwd: value.cwd, sessionId: value.sessionId };
}

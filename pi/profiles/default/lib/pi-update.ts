import { spawn, execFile } from "node:child_process";
import { createConnection } from "node:net";
import { readFile, readdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import lockfile from "proper-lockfile";
import { createHerdrCli, type HerdrCli } from "./herdr-cli.ts";
import { samePlatformPath } from "./path-identity.ts";
// @ts-expect-error Shared executable JavaScript lives outside the profile's TS project.
import { updateRegistryDirectory } from "../../../../scripts/pi-update-host.mjs";

export interface UpdateEndpoint {
  port: number; token: string; pid: number; profile: string; server: string; pane: string;
  sessionId?: string;
}
export interface RestartResult { status: "restarted" | "skipped" | "failed"; reason?: string; version?: string }
export interface SessionUpdateResult extends RestartResult { label: string }
export interface UpdateResult { installed: boolean; linked: boolean; version?: string; error?: string }
export type UpdateRunner = (command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => Promise<void>;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

export function parseUpdateEndpoint(value: string | undefined): UpdateEndpoint | undefined {
  if (!value) return;
  try {
    const v: unknown = JSON.parse(value);
    if (!record(v) || typeof v.port !== "number" || !Number.isInteger(v.port) || v.port < 1 || v.port > 65535
      || typeof v.token !== "string" || !/^[a-f0-9]{64}$/.test(v.token)
      || typeof v.pid !== "number" || !Number.isInteger(v.pid) || v.pid < 1
      || typeof v.profile !== "string" || !isAbsolute(v.profile) || typeof v.server !== "string" || typeof v.pane !== "string"
      || (v.sessionId !== undefined && typeof v.sessionId !== "string")) return;
    return { port: v.port, token: v.token, pid: v.pid, profile: v.profile, server: v.server, pane: v.pane,
      ...(typeof v.sessionId === "string" ? { sessionId: v.sessionId } : {}) };
  } catch { return; }
}

/** One installation/link-refresh/pass at a time, including callers in other panes. */
export async function acquireUpdateLock(): Promise<() => Promise<void>> {
  return lockfile.lock(updateRegistryDirectory(), { realpath: false, retries: 0, stale: 30 * 60_000 });
}

export const runUpdateCommand: UpdateRunner = (command, args, options) => new Promise((accept, reject) => {
  const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, shell: false, detached: process.platform !== "win32" });
  let output = "", failure: Error | undefined;
  for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => { output = (output + String(chunk)).slice(-16_000); });
  const timer = setTimeout(() => {
    failure = new Error(`${command} timed out`);
    if (!child.pid) return;
    if (process.platform === "win32") execFile("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true, timeout: 5000 }, () => {});
    else { try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill(); } }
  }, 10 * 60_000);
  child.once("error", error => { failure = error; });
  child.once("close", code => {
    clearTimeout(timer);
    if (failure) reject(failure);
    else if (code !== 0) reject(new Error(`${command} exited ${code}: ${output.trim()}`));
    else accept();
  });
});

export async function runPiUpdatePass(options: { cwd: string; env: NodeJS.ProcessEnv; platform?: NodeJS.Platform }, run: UpdateRunner = runUpdateCommand): Promise<UpdateResult> {
  let installed = false, linked = false;
  try {
    // Use PowerShell to resolve the Windows pnpm shim without introducing CMD quoting.
    if ((options.platform ?? process.platform) === "win32") await run("pwsh", ["-NoProfile", "-NonInteractive", "-Command", "$ErrorActionPreference = 'Stop'; & pnpm add -g '@earendil-works/pi-coding-agent@latest'; exit $LASTEXITCODE"], options);
    else await run("pnpm", ["add", "-g", "@earendil-works/pi-coding-agent@latest"], options);
    installed = true;
    await run("bash", ["scripts/pi-deps-link-setup", "--profile", "default"], options);
    linked = true;
    const pkg: unknown = JSON.parse(await readFile(join(options.env.PI_CODING_AGENT_DIR ?? "", "node_modules/@earendil-works/pi-coding-agent/package.json"), "utf8"));
    if (!record(pkg) || typeof pkg.version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(pkg.version)) throw new Error("Updated Pi version unavailable from refreshed runtime link");
    return { installed, linked, version: pkg.version };
  } catch (error) { return { installed, linked, error: error instanceof Error ? error.message : String(error) }; }
}

export function requestCooperativeRestart(endpoint: UpdateEndpoint, version: string, mode: "same-tab" | "new-tab" = "same-tab"): Promise<RestartResult> {
  return exchangeRestart(endpoint, version, false, mode);
}

function exchangeRestart(endpoint: UpdateEndpoint, version: string, confirm: boolean, mode: "same-tab" | "new-tab" = "same-tab"): Promise<RestartResult> {
  return new Promise(resolve => {
    const socket = createConnection({ host: "127.0.0.1", port: endpoint.port });
    let response = "", settled = false;
    const finish = (result: RestartResult) => {
      if (settled) return;
      settled = true; clearTimeout(timer); socket.destroy(); resolve(result);
    };
    const timer = setTimeout(() => finish({ status: "failed", reason: "Restart not confirmed; inspect before retrying" }), 45_000);
    socket.once("error", () => finish({ status: "skipped", reason: "Update supervisor unavailable" }));
    socket.once("end", () => finish({ status: "failed", reason: "Update supervisor disconnected without confirming restart" }));
    socket.on("data", chunk => {
      response += String(chunk);
      if (response.length > 8192) return finish({ status: "failed", reason: "Invalid update-host response" });
      const newline = response.indexOf("\n");
      if (newline < 0) return;
      try {
        const v: unknown = JSON.parse(response.slice(0, newline));
        if (record(v) && v.status === "handoff" && !confirm) {
          const replacement = parseUpdateEndpoint(JSON.stringify(v.endpoint));
          if (!replacement || !replacement.sessionId || replacement.server !== endpoint.server || !samePlatformPath(replacement.profile, endpoint.profile)) throw new Error("Invalid migration handoff");
          settled = true; clearTimeout(timer); socket.destroy();
          void exchangeRestart(replacement, version, true).then(resolve);
          return;
        }
        if (!record(v) || (v.status !== "restarted" && v.status !== "skipped" && v.status !== "failed")
          || (v.reason !== undefined && typeof v.reason !== "string") || (v.version !== undefined && typeof v.version !== "string")) throw new Error();
        finish({ status: v.status, ...(typeof v.reason === "string" ? { reason: v.reason } : {}), ...(typeof v.version === "string" ? { version: v.version } : {}) });
      } catch { finish({ status: "failed", reason: "Invalid update-host response" }); }
    });
    socket.once("connect", () => socket.write(`${JSON.stringify({ token: endpoint.token, action: confirm ? "confirm" : "restart", version, ...(!confirm && mode === "new-tab" ? { mode } : {}), ...(confirm ? { sessionId: endpoint.sessionId } : {}) })}\n`));
  });
}

export async function readUpdateEndpoints(directory = updateRegistryDirectory()): Promise<UpdateEndpoint[]> {
  const endpoints: UpdateEndpoint[] = [];
  for (const name of await readdir(directory)) {
    if (!name.endsWith(".json")) continue;
    try { const endpoint = parseUpdateEndpoint(await readFile(join(directory, name), "utf8")); if (endpoint) endpoints.push(endpoint); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  return endpoints;
}

/** Herdr lists the complete connected server, not only the invoking workspace. */
export async function restartConnectedSessions(self: UpdateEndpoint, version: string, dependencies: {
  endpoints?: () => Promise<UpdateEndpoint[]>; cli?: HerdrCli;
  restart?: (endpoint: UpdateEndpoint, version: string) => Promise<RestartResult>;
} = {}): Promise<SessionUpdateResult[]> {
  if (!self.server) return [];
  const cli = dependencies.cli ?? createHerdrCli();
  const response: unknown = JSON.parse(await cli(["agent", "list"]));
  if (!record(response) || response.error || !record(response.result) || !Array.isArray(response.result.agents)) throw new Error("Herdr omitted the connected agent list");
  const agents = response.result.agents.filter(record).filter(agent => agent.agent === "pi");
  const endpoints = (await (dependencies.endpoints ?? readUpdateEndpoints)()).filter(endpoint => endpoint.server === self.server && endpoint.pid !== self.pid && samePlatformPath(endpoint.profile, self.profile));
  const results: SessionUpdateResult[] = [];
  const visited = new Set<number>();
  for (const agent of agents) {
    const sessionId = record(agent.agent_session) && typeof agent.agent_session.value === "string" ? agent.agent_session.value : undefined;
    if (sessionId && sessionId === self.sessionId && agent.pane_id === self.pane) continue;
    const label = typeof agent.name === "string" ? agent.name : typeof agent.pane_id === "string" ? agent.pane_id : "Pi session";
    if (agent.agent_status === "working" || agent.agent_status === "blocked") {
      results.push({ label, status: "skipped", reason: agent.agent_status === "blocked" ? "waiting for input" : "agent is busy" }); continue;
    }
    const matches = endpoints.filter(endpoint => sessionId ? endpoint.sessionId === sessionId : endpoint.pane === agent.pane_id);
    if (matches.length !== 1 || visited.has(matches[0]?.pid ?? -1)) {
      results.push({ label, status: "skipped", reason: "No unique update endpoint; existing ordinary sessions need /reload" }); continue;
    }
    const endpoint = matches[0]!;
    visited.add(endpoint.pid);
    const restarted = await (dependencies.restart ?? requestCooperativeRestart)(endpoint, version);
    results.push({ label, ...restarted });
  }
  return results;
}

export function formatUpdateResults(version: string, results: SessionUpdateResult[]): string {
  const counts = (status: RestartResult["status"]) => results.filter(result => result.status === status).length;
  return [`Pi ${version}: ${counts("restarted")} restarted, ${counts("skipped")} skipped, ${counts("failed")} unconfirmed.`,
    ...results.filter(result => result.status !== "restarted").map(result => `${result.label}: ${result.reason ?? result.status}.`)].join("\n");
}

import { createConnection } from "node:net";
import { readFile, readdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { createHerdrCli, type HerdrCli } from "./herdr-cli.ts";
import { samePlatformPath } from "./path-identity.ts";
// @ts-expect-error Shared executable JavaScript lives outside the profile's TS project.
import { updateRegistryDirectory } from "../../../../scripts/pi-update-host.mjs";
// @ts-expect-error Shared executable JavaScript also runs outside the Pi profile.
import { acquireUpdateLock as sharedAcquireUpdateLock, runUpdateCommand as sharedRunUpdateCommand, runPiUpdatePass as sharedRunPiUpdatePass } from "../../../../scripts/pi-runtime-update.mjs";

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

/** Share installation, link refresh and locking with T3, not session restarts. */
export const acquireUpdateLock: () => Promise<() => Promise<void>> = sharedAcquireUpdateLock;
export const runUpdateCommand: UpdateRunner = sharedRunUpdateCommand;
export const runPiUpdatePass: (
  options: { cwd: string; env: NodeJS.ProcessEnv; platform?: NodeJS.Platform }, run?: UpdateRunner,
) => Promise<UpdateResult> = sharedRunPiUpdatePass;

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

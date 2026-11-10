import { samePlatformPath } from "../../path-identity.ts";
import type { T3RoleHandoff, T3RoleThreadBinding, T3ThreadIdentity } from "./contracts.ts";
import { createHandoffStore } from "./handoffs.ts";

export interface T3Capabilities {
  readonly parentThreadId?: string;
  readonly [key: string]: unknown;
}
export type T3CurrentThread = T3ThreadIdentity;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid T3 metadata response");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Invalid T3 metadata identity");
  return value;
}
function optionalText(value: unknown): string | undefined { return value === undefined || value === null ? undefined : text(value); }
export interface T3MetadataReader {
  capabilities(): Promise<T3Capabilities>;
  currentThread(cwd?: string): Promise<T3CurrentThread>;
  thread(threadId: string): Promise<unknown>;
}
export interface T3RoleLaunchObservation { readonly taskId: string; readonly status: string }
type RoleLaunch = T3RoleHandoff | T3RoleThreadBinding;
export interface T3MetadataClient extends T3MetadataReader {
  roleLaunch(launch: RoleLaunch): Promise<T3RoleLaunchObservation | undefined>;
  cancelOwnedRole(binding: T3RoleThreadBinding): Promise<boolean>;
  cancelOwnedLaunch(handoff: T3RoleHandoff): Promise<boolean>;
}

/** Public metadata plus narrowly owned goal/clear cancellation. Model mutations compose tools. */
export function createT3MetadataClient(options: {
  url?: string;
  bearerToken?: string;
  cwd?: string;
  fetch?: typeof globalThis.fetch;
} = {}): T3MetadataClient {
  const endpoint = options.url ?? process.env.T3_MCP_URL;
  const token = options.bearerToken ?? process.env.T3_MCP_BEARER_TOKEN;
  const fetcher = options.fetch ?? globalThis.fetch;
  if (!endpoint || !token) throw new Error("T3 metadata service unavailable");
  const authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
  const protocol = "2025-06-18";
  let sessionId: string | undefined;
  let nextId = 1;
  let connection: Promise<void> | undefined;
  let capabilities: Promise<T3Capabilities> | undefined;
  const headers = (): Record<string, string> => ({
    authorization, "content-type": "application/json", accept: "application/json, text/event-stream",
    "mcp-protocol-version": protocol, ...(sessionId ? { "mcp-session-id": sessionId } : {}),
  });
  async function post(payload: Record<string, unknown>): Promise<Response> {
    let response: Response;
    try { response = await fetcher(endpoint!, { method: "POST", headers: headers(), body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000) }); }
    catch { throw new Error("T3 metadata service unavailable"); }
    if (!response.ok) throw new Error(`T3 metadata HTTP request failed (${response.status})`);
    sessionId = response.headers.get("mcp-session-id") ?? sessionId;
    return response;
  }
  async function request(method: string, params?: unknown): Promise<unknown> {
    const id = nextId++;
    const response = await post({ jsonrpc: "2.0", id, method, params });
    let envelope: Record<string, unknown> | undefined;
    try {
      if ((response.headers.get("content-type") ?? "").includes("text/event-stream")) {
        for (const event of (await response.text()).split(/\r?\n\r?\n/)) {
          const data = event.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).join("\n");
          if (!data) continue;
          const candidate = record(JSON.parse(data));
          if (candidate.id === id) { envelope = candidate; break; }
        }
      } else {
        envelope = record(await response.json());
      }
    } catch { throw new Error("Invalid T3 metadata response"); }
    if (!envelope || envelope.id !== id) throw new Error("Invalid T3 metadata response identity");
    if (envelope.error) throw new Error("T3 metadata request failed");
    return envelope.result;
  }
  async function initialize(): Promise<void> {
    if (!connection) {
      const opening = (async () => {
        await request("initialize", { protocolVersion: protocol, capabilities: {}, clientInfo: { name: "pi-t3-role-metadata", version: "1" } });
        await post({ jsonrpc: "2.0", method: "notifications/initialized" });
      })();
      connection = opening;
      void opening.catch(() => { if (connection === opening) { connection = undefined; sessionId = undefined; } });
    }
    return connection;
  }
  async function call(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    await initialize();
    const result = record(await request("tools/call", { name, arguments: args }));
    if (result.isError === true) throw new Error(`T3 metadata ${name} lookup failed`);
    if (result.structuredContent !== undefined) return result.structuredContent;
    if (Array.isArray(result.content)) {
      const part = result.content.find(value => value && typeof value === "object" && "text" in value && typeof value.text === "string");
      if (part && typeof part.text === "string") {
        try { return JSON.parse(part.text); } catch { throw new Error("Invalid T3 metadata tool result"); }
      }
    }
    throw new Error("Invalid T3 metadata tool result");
  }
  const readCapabilities = (): Promise<T3Capabilities> => {
    if (!capabilities) {
      const reading = call("orchestrator_capabilities").then(value => Object.freeze({ ...record(value) }));
      capabilities = reading;
      void reading.catch(() => { if (capabilities === reading) capabilities = undefined; });
    }
    return capabilities;
  };
  async function roleLaunch(launch: RoleLaunch): Promise<T3RoleLaunchObservation | undefined> {
    const owner = launch.commissioner.threadId;
    const receipts = await createHandoffStore(launch.commissioner.profile).receipts(owner);
    const receipt = receipts.filter(item => item.launchId === launch.launchId && (!("threadId" in launch) || item.childThreadId === launch.threadId)).at(-1);
    if (!receipt && !launch.taskTitle) return undefined;
    let afterPosition: number | undefined;
    let horizon: number | undefined;
    const matches = new Map<string, T3RoleLaunchObservation>();
    for (;;) {
      const response = record(await call("t3_thread_read", { threadId: owner, view: "activity", limit: 100, maxCharsPerItem: 1, ...(afterPosition === undefined ? {} : { afterPosition }) }));
      const thread = record(response.thread);
      if (thread.threadId !== owner || !Array.isArray(response.items)) throw new Error("Invalid T3 role activity scope");
      if (horizon === undefined) {
        if (typeof thread.itemCount !== "number" || !Number.isSafeInteger(thread.itemCount) || thread.itemCount < 0) throw new Error("Invalid T3 role activity boundary");
        horizon = thread.itemCount;
      }
      for (const item of response.items) {
        const row = record(item);
        if (typeof row.position !== "number" || row.position >= horizon || row.type !== "subagent" || row.visibility === "inherited" || row.sourceThreadId !== owner) continue;
        if (receipt ? row.subagentId !== receipt.taskId : row.title !== launch.taskTitle) continue;
        const taskId = text(row.subagentId);
        matches.set(taskId, Object.freeze({ taskId, status: text(row.status) }));
      }
      if (response.hasMore === false) break;
      const next = response.nextPosition;
      if (response.hasMore !== true || typeof next !== "number" || !Number.isSafeInteger(next) || next <= (afterPosition ?? -1)) throw new Error("Invalid T3 role activity cursor");
      if (next >= horizon - 1) break;
      afterPosition = next;
    }
    if (matches.size > 1) throw new Error("Ambiguous T3 role task correlation");
    return matches.values().next().value;
  }
  async function cancelOwned(launch: RoleLaunch): Promise<boolean> {
    const scope = await readCapabilities();
    if (scope.parentThreadId !== launch.commissioner.threadId || ("parentThreadId" in launch && launch.parentThreadId !== launch.commissioner.threadId)) throw new Error("T3 cancellation requires the actual commissioning parent");
    const task = await roleLaunch(launch);
    if (!task) return false;
    const result = record(await call("task_cancel", { taskId: task.taskId, reason: "The owning Pi goal or session stopped this role" }));
    if (result.taskId !== task.taskId) throw new Error("Invalid T3 cancellation identity");
    return true;
  }
  return {
    capabilities: readCapabilities,
    roleLaunch,
    cancelOwnedRole: cancelOwned,
    cancelOwnedLaunch: cancelOwned,
    currentThread: async (cwd = options.cwd ?? process.cwd()) => {
      const scope = await readCapabilities();
      const threadId = text(scope.parentThreadId);
      const response = record(await call("t3_thread_read", { threadId, limit: 1, runLimit: 1 }));
      const thread = record(response.thread);
      if (thread.threadId !== threadId) throw new Error("T3 metadata thread scope mismatch");
      const worktreePath = optionalText(thread.worktreePath);
      if (worktreePath && !samePlatformPath(worktreePath, cwd)) throw new Error("T3 metadata workspace does not match Pi working directory");
      return Object.freeze({ threadId, parentThreadId: optionalText(thread.parentThreadId), cwd: worktreePath ?? text(cwd), runId: optionalText(thread.activeRunId ?? thread.latestRunId) });
    },
    thread: async threadId => call("t3_thread_read", { threadId: text(threadId), limit: 1, runLimit: 1 }),
  };
}

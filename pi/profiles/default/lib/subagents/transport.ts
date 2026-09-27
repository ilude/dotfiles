import { createServer, createConnection, type Server, type Socket } from "node:net";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { JsonLines } from "./framing.ts";

export interface ChildIdentity { child: string; run: string; origin: string }
export interface ChildEndpoint extends ChildIdentity { port: number; token: string }
export type DeliveryMode = "queued" | "immediate";
export type InteractionMode = "notify" | "request";
export type MessageProtocol = "question-answer";
export interface MessageOptions {
  delivery?: DeliveryMode;
  interaction?: InteractionMode;
  protocol?: MessageProtocol;
  replyTo?: string;
}
export interface ApplicationMessage { type: string; payload?: unknown }
export type ParentEventConsumer = "headless-app" | "visible-app" | "visible-host";
export interface ParentCommand { id: string; type: string; message?: string; delivery?: DeliveryMode }
export interface ParentActivity { phase: "model" | "tool"; toolName?: string }
/** Commands and child deliveries are level-triggered and repeat until app/outcome acknowledgement. */
export type ParentEventBatch =
  | { consumer: "headless-app"; delivery?: unknown }
  | { consumer: "visible-app"; commands: ParentCommand[]; delivery?: unknown }
  | { consumer: "visible-host"; stop: true; force: boolean };
type Handler = (identity: Readonly<ChildIdentity>, message: ApplicationMessage, signal: AbortSignal) => Promise<unknown>;
const FRAME_LIMIT = 256 * 1024;
const DEADLINE = 10_000;
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function isParentCommand(value: unknown): value is ParentCommand {
  if (!object(value) || typeof value.id !== "string" || !value.id.trim() || typeof value.type !== "string" || !value.type.trim()) return false;
  return (value.message === undefined || typeof value.message === "string")
    && (value.delivery === undefined || value.delivery === "queued" || value.delivery === "immediate");
}
function equal(a: string, b: string): boolean {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Process-local transport only. Authority and lifecycle decisions belong to the runtime. */
export class ChildTransport {
  private server?: Server;
  private port?: number;
  private opening?: Promise<void>;
  private sockets = new Set<Socket>();
  private socketChildren = new Map<Socket, string>();
  private children = new Map<string, ChildEndpoint>();
  private readonly handle: Handler;
  constructor(handle: Handler) { this.handle = handle; }
  async register(identity: ChildIdentity): Promise<ChildEndpoint> {
    if (!Object.values(identity).every(value => typeof value === "string" && value.trim())) throw new Error("Child identity must be nonblank");
    await this.listen();
    if (this.children.has(identity.child)) throw new Error("Child already registered");
    const endpoint = Object.freeze({ ...identity, port: this.port!, token: randomBytes(32).toString("hex") });
    this.children.set(identity.child, endpoint);
    return endpoint;
  }
  revoke(child: string): void {
    this.children.delete(child);
    for (const [socket, owner] of this.socketChildren) if (owner === child) socket.destroy();
  }
  private async listen(): Promise<void> {
    if (this.port) return;
    if (this.opening) return this.opening;
    this.opening = new Promise<void>((resolve, reject) => {
      const server = createServer(socket => this.accept(socket));
      this.server = server;
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") { reject(new Error("No loopback address")); return; }
        this.port = address.port;
        server.unref();
        resolve();
      });
    });
    try { await this.opening; } finally { this.opening = undefined; }
  }
  private accept(socket: Socket): void {
    this.sockets.add(socket);
    const controller = new AbortController();
    socket.once("close", () => { this.sockets.delete(socket); this.socketChildren.delete(socket); controller.abort(); });
    socket.on("error", () => socket.destroy());
    const deadline = setTimeout(() => socket.destroy(), DEADLINE);
    deadline.unref();
    socket.once("close", () => clearTimeout(deadline));
    let received = false;
    const respond = (response: unknown) => {
      if (socket.destroyed) return;
      let frame = JSON.stringify(response) + "\n";
      if (Buffer.byteLength(frame) > FRAME_LIMIT) frame = '{"ok":false,"error":"Response exceeds byte limit"}\n';
      socket.end(frame);
    };
    const frames = new JsonLines(value => {
      if (received) throw new Error("Duplicate request frame");
      received = true;
      if (!object(value) || typeof value.child !== "string") throw new Error("Invalid request");
      const owner = this.children.get(value.child);
      if (!owner || typeof value.token !== "string" || !equal(owner.token, value.token) || value.run !== owner.run || value.origin !== owner.origin) throw new Error("Child authentication failed");
      if (!object(value.message) || typeof value.message.type !== "string" || !value.message.type.trim()) throw new Error("Invalid message");
      const identity = Object.freeze({ child: owner.child, run: owner.run, origin: owner.origin });
      this.socketChildren.set(socket, owner.child);
      if (value.message.type === "parent-events") clearTimeout(deadline);
      void Promise.resolve().then(() => {
        if (socket.destroyed || this.children.get(owner.child) !== owner) throw new Error("Child unavailable");
        return this.handle(identity, value.message as unknown as ApplicationMessage, controller.signal);
      }).then(result => respond({ ok: true, result }), error => respond({ ok: false, error: error instanceof Error ? error.message : "Request failed" }));
    }, FRAME_LIMIT);
    socket.on("data", (chunk: Buffer) => { try { frames.push(chunk); } catch { socket.destroy(); } });
    socket.on("end", () => { try { frames.end(); } catch { socket.destroy(); } });
  }
  async close(): Promise<void> {
    if (this.opening) await this.opening;
    this.children.clear();
    for (const socket of this.sockets) socket.destroy();
    const server = this.server;
    this.server = undefined;
    this.port = undefined;
    if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

class ParentConnectionError extends Error {
  readonly reason: string;
  constructor(reason: string) { super(`Parent connection failed: ${reason}`); this.reason = reason; }
}

// Only idempotent reads are safe to replay. Commands, bootstrap and final turns
// may have been accepted before their response was lost; never retry them implicitly.
export async function requestParent(endpoint: ChildEndpoint, message: ApplicationMessage): Promise<unknown> {
  return requestWithRetry(endpoint, message, {
    attempts: ["host-poll", "app-poll", "heartbeat"].includes(message.type) ? 3 : 1,
    timeout: DEADLINE,
  });
}

/** Hold one authenticated request per consumer until state is ready; abort it on session/process end. */
export async function waitForParentEvents(
  endpoint: ChildEndpoint,
  consumer: ParentEventConsumer,
  signal?: AbortSignal,
): Promise<ParentEventBatch> {
  const result = await requestWithRetry(endpoint, { type: "parent-events", payload: { consumer } }, {
    attempts: 3, timeout: undefined, signal,
  });
  if (!object(result) || result.consumer !== consumer) throw new Error("Invalid parent event response");
  if (consumer === "headless-app") return { consumer, delivery: result.delivery };
  if (consumer === "visible-app") {
    if (!Array.isArray(result.commands) || !result.commands.every(isParentCommand)) throw new Error("Invalid parent command batch");
    return { consumer, commands: result.commands, delivery: result.delivery };
  }
  if (result.stop !== true || typeof result.force !== "boolean") throw new Error("Invalid parent host-stop event");
  return { consumer, stop: true, force: result.force };
}

/** Report visible-child activity on change instead of attaching it to recurring polls. */
export async function reportParentActivity(endpoint: ChildEndpoint, activity: ParentActivity): Promise<void> {
  await requestParent(endpoint, { type: "app-activity", payload: activity });
}

interface RequestOptions { attempts: number; timeout?: number; signal?: AbortSignal }
async function requestWithRetry(endpoint: ChildEndpoint, message: ApplicationMessage, options: RequestOptions): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    try { return await requestParentOnce(endpoint, message, options.timeout, options.signal); }
    catch (error) {
      const aborted = options.signal?.aborted === true;
      if (aborted) throw error;
      const retry = error instanceof ParentConnectionError && attempt < options.attempts;
      // Do not publish endpoints, payloads or arbitrary server error text.
      const kind = error instanceof ParentConnectionError ? error.reason : "rejected-or-invalid-response";
      const type = /^[a-z-]{1,32}$/.test(message.type) ? message.type : "unknown";
      process.stderr.write(`[subagent-parent] ${type} attempt=${attempt}/${options.attempts} reason=${kind} action=${retry ? "retry" : "fail"}\n`);
      if (!retry) throw error;
      await delay(250 * attempt, undefined, options.signal ? { signal: options.signal } : undefined);
    }
  }
}

function requestParentOnce(endpoint: ChildEndpoint, message: ApplicationMessage, timeoutMs?: number, signal?: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason ?? new Error("Parent event wait aborted")); return; }
    const socket = createConnection({ host: "127.0.0.1", port: endpoint.port });
    let settled = false;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const onAbort = () => finish(signal?.reason instanceof Error ? signal.reason : new Error("Parent event wait aborted"));
    const finish = (error?: Error, value?: unknown) => {
      if (settled) return;
      settled = true;
      if (deadline) clearTimeout(deadline);
      signal?.removeEventListener("abort", onAbort);
      socket.destroy();
      error ? reject(error) : resolve(value);
    };
    if (timeoutMs !== undefined) deadline = setTimeout(() => finish(new ParentConnectionError("timeout")), timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    const frames = new JsonLines(value => {
      if (!object(value) || typeof value.ok !== "boolean") { finish(new Error("Invalid parent response")); return; }
      value.ok ? finish(undefined, value.result) : finish(new Error(typeof value.error === "string" ? value.error : "Parent rejected request"));
    }, FRAME_LIMIT);
    socket.once("connect", () => {
      const frame = JSON.stringify({ ...endpoint, message }) + "\n";
      if (Buffer.byteLength(frame) > FRAME_LIMIT) { finish(new Error("Request exceeds byte limit")); return; }
      socket.write(frame);
    });
    socket.on("data", (chunk: Buffer) => { try { frames.push(chunk); } catch (error) { finish(error as Error); } });
    socket.once("error", error => {
      const code = (error as NodeJS.ErrnoException).code;
      finish(new ParentConnectionError(code && /^[A-Z0-9_]{1,32}$/.test(code) ? code : "socket-error"));
    });
    socket.once("close", () => finish(new ParentConnectionError("connection-closed")));
  });
}

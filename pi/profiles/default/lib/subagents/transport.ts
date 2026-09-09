import { createServer, createConnection, type Server, type Socket } from "node:net";
import { randomBytes, timingSafeEqual } from "node:crypto";
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
type Handler = (identity: Readonly<ChildIdentity>, message: ApplicationMessage) => Promise<unknown>;
const FRAME_LIMIT = 256 * 1024;
const DEADLINE = 10_000;
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
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
  revoke(child: string): void { this.children.delete(child); }
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
    socket.once("close", () => this.sockets.delete(socket));
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
      void Promise.resolve().then(() => {
        if (socket.destroyed || this.children.get(owner.child) !== owner) throw new Error("Child unavailable");
        return this.handle(identity, value.message as unknown as ApplicationMessage);
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

export function requestParent(endpoint: ChildEndpoint, message: ApplicationMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port: endpoint.port });
    let settled = false;
    const finish = (error?: Error, value?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      socket.destroy();
      error ? reject(error) : resolve(value);
    };
    const deadline = setTimeout(() => finish(new Error("Parent request timed out")), DEADLINE);
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
    socket.once("error", error => finish(error));
    socket.once("close", () => finish(new Error("Parent unavailable")));
  });
}

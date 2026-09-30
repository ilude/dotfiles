import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { ChildTransport, requestParent, type ApplicationMessage, type ChildEndpoint, type ParentCommand } from "./transport.ts";
import { admitSuccessor, successorLaunch } from "./successor-launch.ts";
import type { LaunchSpec } from "./rpc.ts";
import type { OriginRetirementIdentity } from "./closeout-handoff.ts";

export const SUCCESSOR_HANDOFF_TOOL = "closeout_successor_handoff";
interface HandoffCommand extends ParentCommand { cleanupError?: string }

export interface SuccessorSnapshot {
  hostPid: number;
  childPid?: number;
  sessionId?: string;
  sessionFile?: string;
  released: boolean;
  ready: boolean;
  integrationReady?: unknown;
  retired?: boolean;
  cleanupError?: string;
  phase: "starting" | "model" | "tool" | "settled" | "exited";
  result?: string;
  error?: string;
}

/** The pane bootstrap, not the orchestrator, owns this endpoint and process handle. */
export class SuccessorHost {
  private readonly transport: ChildTransport;
  private app?: ChildEndpoint;
  private controller?: ChildEndpoint;
  private child?: ChildProcess;
  private commands: HandoffCommand[] = [];
  private wakes = new Set<() => void>();
  private state: SuccessorSnapshot = { hostPid: process.pid, released: false, ready: false, phase: "starting" };
  private authority = "";
  private initialDelivered = false;
  private readonly spec: LaunchSpec;
  private readonly profile: string;
  private readonly originRetirement: OriginRetirementIdentity;
  private readonly admission?: ChildEndpoint;
  constructor(spec: LaunchSpec, profile: string, originRetirement: OriginRetirementIdentity, admission?: ChildEndpoint) {
    this.spec = spec; this.profile = profile; this.originRetirement = originRetirement; this.admission = admission;
    this.transport = new ChildTransport((identity, message, signal) => this.handle(identity.child, message, signal));
  }
  async open(): Promise<{ appEndpoint: ChildEndpoint; controlEndpoint: ChildEndpoint }> {
    this.app = await this.transport.register({ child: randomUUID(), run: randomUUID(), origin: this.spec.origin });
    this.controller = await this.transport.register({ child: randomUUID(), run: this.app.run, origin: this.spec.origin });
    this.authority = successorLaunch(this.spec, this.profile, this.app).env.PI_SUBAGENT_AUTHORITY;
    return { appEndpoint: this.app, controlEndpoint: this.controller };
  }
  snapshot(): SuccessorSnapshot { return JSON.parse(JSON.stringify(this.state)); }
  private enqueue(message: string): void {
    this.commands.push({ id: randomUUID(), type: "message", message });
    for (const wake of this.wakes) wake();
  }
  private async handle(child: string, message: ApplicationMessage, signal: AbortSignal): Promise<unknown> {
    if (child === this.controller?.child) {
      if (message.type === "inspect") return this.snapshot();
      if (message.type === "message") {
        if (this.state.released) throw new Error("Successor already owns final reporting");
        if (typeof message.payload !== "string" || !message.payload.trim()) throw new Error("Message required");
        this.enqueue(message.payload); return { accepted: true };
      }
      if (message.type === "release") {
        if (!this.state.ready || !this.state.integrationReady) throw new Error("Integration-ready successor required");
        if (!this.state.released) {
          this.state.released = true;
          void this.retireOrigin();
        }
        return { accepted: true };
      }
      throw new Error("Unsupported successor controller request");
    }
    if (child !== this.app?.child) throw new Error("Unknown successor application");
    if (message.type === "bootstrap") return { authority: this.authority, instructions: this.spec.instructions, prompt: this.spec.prompt ?? "", parentSessionId: this.spec.origin, released: this.state.released };
    if (message.type === "app-ready") {
      const tools = (message.payload as { tools?: unknown })?.tools;
      if (!Array.isArray(tools) || JSON.stringify([...tools].sort()) !== JSON.stringify([...this.spec.definition.tools, SUCCESSOR_HANDOFF_TOOL].sort())) throw new Error("Successor tool ceiling mismatch");
      this.state.ready = true;
      if (!this.initialDelivered) { this.initialDelivered = true; this.enqueue(this.spec.instructions); }
      return { accepted: true };
    }
    if (message.type === "session-identity") {
      const payload = message.payload as { sessionId?: unknown; sessionFile?: unknown };
      if (typeof payload?.sessionId !== "string" || !payload.sessionId.trim() || typeof payload.sessionFile !== "string" || !payload.sessionFile.trim()) throw new Error("Durable successor identity required");
      if (this.state.sessionId && this.state.sessionId !== payload.sessionId) throw new Error("Successor session replacement is not allowed");
      this.state.sessionId = payload.sessionId; this.state.sessionFile = payload.sessionFile;
      return { parentSessionId: this.spec.origin };
    }
    if (message.type === "integration-ready") {
      const payload = message.payload as { outcome?: unknown; taskCommit?: unknown; archivedPlanVerified?: unknown; activeSpecAbsent?: unknown; metadata?: unknown; targetCommit?: unknown };
      if (payload?.outcome !== "INTEGRATION READY" || payload.taskCommit !== this.spec.closeoutManifest?.taskCommit
        || payload.archivedPlanVerified !== true || payload.activeSpecAbsent !== true
        || !["committed", "already-committed"].includes(String(payload.metadata)) || typeof payload.targetCommit !== "string" || !payload.targetCommit.trim()) throw new Error("Verified integration-ready result required");
      this.state.integrationReady = JSON.parse(JSON.stringify(payload));
      this.notifyOrigin("successor-integration-ready", this.state.integrationReady);
      return { accepted: true };
    }
    if (message.type === "app-activity") {
      const phase = (message.payload as { phase?: unknown })?.phase;
      if (phase !== "model" && phase !== "tool") throw new Error("Invalid successor activity");
      this.state.phase = phase; return { accepted: true };
    }
    if (message.type === "turn") {
      const payload = message.payload as { text?: unknown; error?: unknown };
      if (typeof payload?.text !== "string") throw new Error("Invalid successor turn");
      this.state.phase = "settled"; this.state.result = payload.text.slice(0,24_000);
      this.state.error = typeof payload.error === "string" ? payload.error.slice(0,4000) : undefined;
      this.notifyOrigin("successor-turn", { text: this.state.result, error: this.state.error });
      return { accepted: true }; // Never closes the pane or sends a result to the parent.
    }
    if (message.type === "app-ack") { this.commands = this.commands.filter(command => command.id !== message.payload); return { accepted: true }; }
    if (message.type === "parent-events") {
      if ((message.payload as { consumer?: unknown })?.consumer !== "visible-app") throw new Error("Successor app consumer required");
      if (!this.commands.length) await new Promise<void>(resolve => {
        const finish = () => { this.wakes.delete(finish); signal.removeEventListener("abort", finish); resolve(); };
        this.wakes.add(finish); signal.addEventListener("abort", finish, { once: true });
        if (signal.aborted) finish();
      });
      return { consumer: "visible-app", commands: this.commands };
    }
    throw new Error("Unsupported successor application request");
  }
  private notifyOrigin(type: string, payload: unknown): void {
    if (this.admission && !this.state.retired) void requestParent(this.admission, { type, payload }).catch(() => { /* Origin exit cannot revoke successor authority. */ });
  }
  private async retireOrigin(): Promise<void> {
    try {
      const { observeOriginRetirement } = await import("./closeout-handoff.ts");
      await observeOriginRetirement(this.originRetirement);
      this.state.retired = true;
      this.commands.push({ id: randomUUID(), type: "final-handoff" });
    } catch (failure) {
      this.state.cleanupError = failure instanceof Error ? failure.message : String(failure);
      this.commands.push({ id: randomUUID(), type: "cleanup-pending", cleanupError: this.state.cleanupError });
    }
    for (const wake of this.wakes) wake();
  }
  async run(entry: string): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
    if (!this.app) throw new Error("Successor host is not open");
    const config = successorLaunch(this.spec, this.profile, this.app);
    const env: NodeJS.ProcessEnv = { ...process.env, ...config.env };
    delete env.PI_SUBAGENT_INTERVENTION_FILE;
    delete env.PI_CLOSEOUT_SUCCESSOR_RELEASED;
    delete env.PI_HERDR_SUCCESSOR_ADMISSION_ENDPOINT;
    // Inherited terminal handles make this a real interactive Pi process. No
    // listener or pipe from the originating orchestrator is retained.
    this.child = spawn(process.execPath, [entry, ...config.args], { cwd: this.spec.cwd, env, stdio: "inherit", shell: false });
    this.state.childPid = this.child.pid;
    try {
      return await new Promise((resolve, reject) => {
        this.child!.once("error", reject);
        this.child!.once("close", (code, signal) => resolve({ code, signal }));
      });
    } finally { this.state.phase = "exited"; await this.transport.close(); }
  }
  async close(): Promise<void> { await this.transport.close(); }
}

export async function hostCloseoutSuccessor(entry: string, profile: string, endpoint: ChildEndpoint): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  const bootstrap = await requestParent(endpoint, { type: "bootstrap" });
  const spec = admitSuccessor(bootstrap, profile, endpoint);
  const origin = (bootstrap as { originRetirement?: OriginRetirementIdentity }).originRetirement;
  if (!origin || origin.sessionId !== endpoint.origin || !Number.isSafeInteger(origin.pid) || origin.pid <= 0
    || ![origin.paneId, origin.tabId, origin.workspaceId].every(value => typeof value === "string" && value.trim())) throw new Error("Exact origin retirement identity required");
  const host = new SuccessorHost(spec, profile, JSON.parse(JSON.stringify(origin)), endpoint);
  try {
    const { appEndpoint, controlEndpoint } = await host.open();
    await requestParent(endpoint, { type: "successor-host-started", payload: { hostPid: process.pid, appEndpoint, controlEndpoint } });
    return await host.run(entry);
  } finally { await host.close(); }
}

import type { CloseoutManifest } from "../plan-integration/contracts.ts";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createHerdrCli, result, type HerdrCli } from "../herdr-cli.ts";
import { currentPaneIdentity } from "./herdr-layout-api.ts";
import { ChildTransport, requestParent, type ChildEndpoint } from "./transport.ts";
import type { LaunchSpec } from "./rpc.ts";
import { validateCloseoutManifest } from "../plan-integration/closeout.ts";
import { samePlatformPath } from "../path-identity.ts";

const OPEN = "<pi-closeout-manifest>";
const CLOSE = "</pi-closeout-manifest>";

export interface CloseoutHandoff {
  manifest: CloseoutManifest;
  instructions: string;
}

export function extractCloseoutHandoff(instructions: string): CloseoutHandoff | undefined {
  const start = instructions.indexOf(OPEN);
  const endMarker = instructions.indexOf(CLOSE);
  if (start < 0 && endMarker < 0) return undefined;
  if (start < 0 || endMarker < 0 || endMarker < start || instructions.indexOf(OPEN, start + OPEN.length) >= 0 || instructions.indexOf(CLOSE, endMarker + CLOSE.length) >= 0) {
    throw new Error("Invalid closeout manifest handoff envelope");
  }

  const jsonStart = start + OPEN.length;
  const json = instructions.slice(jsonStart, endMarker).trim();
  let manifest: CloseoutManifest;
  try {
    manifest = JSON.parse(json) as CloseoutManifest;
  } catch {
    throw new Error("Closeout manifest handoff must contain valid JSON");
  }

  const cleanInstructions = `${instructions.slice(0, start)}${instructions.slice(endMarker + CLOSE.length)}`.trim();
  if (!cleanInstructions) throw new Error("Integrator assignment instructions are required outside the manifest envelope");
  return { manifest, instructions: cleanInstructions };
}

/** Captured by the originating runtime, never supplied by the model. */
export interface OriginRetirementIdentity {
  sessionId: string;
  pid: number;
  paneId: string;
  tabId: string;
  workspaceId: string;
  terminalId?: string;
}

/** Cleanup may begin only after both the real Pi and its bootstrap pane retire. */
export async function observeOriginRetirement(origin: OriginRetirementIdentity, options: {
  cli?: HerdrCli; timeoutMs?: number; processAlive?: (pid: number) => boolean;
} = {}): Promise<void> {
  if (!origin.sessionId || !Number.isSafeInteger(origin.pid) || origin.pid <= 0 || !origin.paneId || !origin.tabId || !origin.workspaceId) throw new Error("Invalid exact origin retirement identity");
  const cli = options.cli ?? createHerdrCli();
  const alive = options.processAlive ?? (pid => {
    try { process.kill(pid, 0); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return false; throw error; }
  });
  const deadline = Date.now() + (options.timeoutMs ?? 10_000);
  do {
    const panes: unknown = result(await cli(["pane", "list", "--workspace", origin.workspaceId])).panes;
    if (!Array.isArray(panes)) throw new Error("Cannot observe exact origin pane retirement");
    const pane = panes.find(value => value?.pane_id === origin.paneId);
    if (pane && (pane.tab_id !== origin.tabId || (origin.terminalId && pane.terminal_id !== origin.terminalId))) throw new Error("Origin pane identity changed; cleanup retained");
    if (!pane && !alive(origin.pid)) return;
    if (Date.now() >= deadline) break;
    await delay(100);
  } while (true);
  throw new Error(`Origin shutdown was not observed; task worktree retained (session ${origin.sessionId}, pane ${origin.paneId})`);
}

function endpoint(value: unknown, origin: string): ChildEndpoint {
  if (!value || typeof value !== "object") throw new Error("Invalid successor controller endpoint");
  const v = value as Record<string, unknown>;
  if (v.origin !== origin || typeof v.child !== "string" || !v.child || typeof v.run !== "string" || !v.run || typeof v.token !== "string" || !v.token || !Number.isInteger(v.port) || Number(v.port) < 1 || Number(v.port) > 65535) throw new Error("Invalid successor controller endpoint");
  return { origin, child: v.child, run: v.run, token: v.token, port: Number(v.port) };
}

export interface CloseoutSuccessorRecord {
  id: string; origin: string; paneId?: string; tabId?: string; cwd: string;
  phase: "starting" | "available" | "released";
}

/** Independent host admission. This is intentionally not an ordinary child. */
export class CloseoutSuccessorHandoff {
  private transport: ChildTransport;
  private control?: ChildEndpoint;
  private admitted = false;
  private hostStarted?: () => void;
  private startup?: Promise<void>;
  private record?: CloseoutSuccessorRecord;
  private originIdentity?: OriginRetirementIdentity;
  private readonly cli: HerdrCli;
  private readonly notice: (origin: string, kind: string, evidence: unknown) => void;
  constructor(cli: HerdrCli = createHerdrCli(), notice: (origin: string, kind: string, evidence: unknown) => void = () => {}) {
    this.cli = cli; this.notice = notice;
    this.transport = new ChildTransport(async (identity, message) => {
      if (identity.origin !== this.record?.origin) throw new Error("Successor origin unavailable");
      if (message.type === "bootstrap") {
        if (this.admitted || !this.spec || !this.originIdentity) throw new Error("Successor admission already consumed");
        this.admitted = true;
        return { spec: this.spec, profile: this.profile, originRetirement: this.originIdentity };
      }
      if (message.type === "successor-host-started") {
        const value = message.payload as { hostPid?: unknown; controlEndpoint?: unknown; appEndpoint?: unknown } | undefined;
        if (this.control || !Number.isSafeInteger(value?.hostPid) || Number(value?.hostPid) <= 0) throw new Error("Invalid successor host identity");
        this.control = endpoint(value?.controlEndpoint, identity.origin);
        endpoint(value?.appEndpoint, identity.origin);
        this.record.phase = "available";
        this.hostStarted?.();
        return { accepted: true };
      }
      if (message.type === "successor-integration-ready" || message.type === "successor-turn") {
        if (!this.control || this.record.phase === "released") throw new Error("Origin no longer owns successor handoff");
        this.notice(identity.origin, message.type, message.payload);
        return { accepted: true };
      }
      throw new Error("Unsupported successor admission request");
    });
  }
  private spec?: LaunchSpec;
  private profile = "";
  async launch(spec: LaunchSpec, profile: string, sessionId: string): Promise<CloseoutSuccessorRecord> {
    if (this.record) throw new Error("Closeout successor already launched; inspect the retained pane instead of relaunching");
    if (spec.definition.name !== "integrator" || spec.definition.delegates.length || spec.parentId || spec.origin !== sessionId || spec.surface !== "visible" || !spec.closeoutManifest || spec.closeoutManifest.noMerge) throw new Error("Restricted originating Integrator manifest required");
    validateCloseoutManifest(spec.closeoutManifest);
    if (!samePlatformPath(spec.cwd, spec.closeoutManifest.targetCheckout)) throw new Error("Successor cwd must be the recorded parent checkout");
    const plugins = result(await this.cli(["plugin", "list", "--plugin", "local.pi", "--json"])).plugins;
    const command = plugins?.find((v: { plugin_id?: string }) => v.plugin_id === "local.pi")?.panes?.find((v: { id?: string }) => v.id === "pi")?.command;
    const expected = resolve(profile, "../../../scripts/pi-herdr-launch.mjs");
    if (!Array.isArray(command) || command.length !== 3 || typeof command[1] !== "string" || realpathSync.native(command[1]) !== realpathSync.native(expected)) throw new Error("local.pi bootstrap does not belong to the active profile");
    const current = await currentPaneIdentity(this.cli);
    this.originIdentity = { sessionId, pid: process.pid, paneId: current.pane_id, tabId: current.tab_id, workspaceId: current.workspace_id, terminalId: current.terminal_id };
    this.spec = JSON.parse(JSON.stringify(spec)); this.profile = resolve(profile);
    this.record = { id: randomUUID(), origin: sessionId, cwd: spec.cwd, tabId: current.tab_id, phase: "starting" };
    const admission = await this.transport.register({ child: this.record.id, run: randomUUID(), origin: sessionId });
    this.startup = new Promise<void>(resolve => { this.hostStarted = resolve; });
    const value = result(await this.cli(["plugin", "pane", "open", "--plugin", "local.pi", "--entrypoint", "pi", "--placement", "split", "--direction", "down", "--target-pane", current.pane_id, "--cwd", spec.cwd, "--env", `PI_HERDR_PROFILE_DIR=${this.profile}`, "--env", "PI_HERDR_CLOSEOUT_SUCCESSOR=1", "--env", `PI_HERDR_SUCCESSOR_ADMISSION_ENDPOINT=${JSON.stringify(admission)}`, "--env", "PI_HERDR_TAB_LABEL=", "--no-focus"]));
    const pane = value.plugin_pane?.pane ?? value.pane ?? value.root_pane;
    if (typeof pane?.pane_id !== "string") throw new Error("Successor launch uncertain; inspect before retrying");
    this.record.paneId = pane.pane_id;
    if (pane.tab_id !== current.tab_id || pane.workspace_id !== current.workspace_id) throw new Error(`Successor pane not in origin tab; retained ${pane.pane_id}`);
    await this.cli(["pane", "rename", pane.pane_id, `${spec.displayName ?? "Integrator"} · integrator`]);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([this.startup, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Successor host startup unconfirmed; retained pane ${pane.pane_id}`)), 30_000); })]);
    } finally { if (timer) clearTimeout(timer); }
    return { ...this.record };
  }
  async inspect(origin: string): Promise<unknown> { this.requireOrigin(origin); return { ...this.record, host: this.control ? await requestParent(this.control, { type: "inspect" }) : undefined }; }
  async message(origin: string, message: string): Promise<unknown> { this.requireOrigin(origin); if (!this.control) throw new Error("Successor host startup unconfirmed"); return requestParent(this.control, { type: "message", payload: message }); }
  private requireOrigin(origin: string): void { if (!this.record || this.record.origin !== origin) throw new Error("Closeout successor belongs to another originating session"); }
  async release(origin: string): Promise<void> {
    this.requireOrigin(origin);
    if (!this.control || !this.originIdentity) throw new Error("Successor host unavailable");
    const current = await currentPaneIdentity(this.cli);
    if (current.pane_id !== this.originIdentity.paneId || current.tab_id !== this.originIdentity.tabId || current.workspace_id !== this.originIdentity.workspaceId || current.terminal_id !== this.originIdentity.terminalId) throw new Error("Exact originating pane identity changed; handoff retained");
    await requestParent(this.control, { type: "release" });
    this.record!.phase = "released";
  }
  retirementRequested(origin: string): boolean { return this.record?.origin === origin && this.record.phase === "released"; }
  async close(): Promise<void> { await this.transport.close(); }
}

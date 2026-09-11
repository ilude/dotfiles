import { existsSync, realpathSync } from "node:fs";
import * as path from "node:path";
import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { PlanRunStore, type PlanRun, type PlanRunState } from "./plan-runs.ts";

export interface PlanRunRuntime {
  readonly store: PlanRunStore;
  track(run: PlanRun): void;
  forget(run: PlanRun): void;
}

type Owned = { run: PlanRun; pending: boolean; command?: string; args?: string; blockedFrom?: PlanRunState };
type SharedOwned = Omit<Owned, "run"> & { run: PlanRun };
type SharedState = { owned: SharedOwned[]; current?: string };
type LegacyRuntime = { owned?: Map<string, Owned>; current?: string };
const legacyKey = Symbol.for("dotfiles.pi.default.plan-run-runtime.v1");
const MAX_MIGRATED_OWNED = 1000;

function canonical(file: string): string {
  let resolved: string;
  try { resolved = realpathSync.native(file); }
  catch { resolved = path.resolve(file); }
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function planInput(text: string, cwd: string): { file: string; args: string } | undefined {
  const match = /^\/do-it\s+(.+)$/.exec(text.trim());
  if (!match) return;
  const args = match[1]!.trim().split(/\s+/);
  const selectors = args.filter(arg => arg !== "--no-merge");
  if (selectors.length !== 1 || !/^\.specs\/[A-Za-z0-9][A-Za-z0-9._-]*\/plan\.md$/.test(selectors[0]!)) return;
  return { file: canonical(path.resolve(cwd, selectors[0]!)), args: args.join(" ") };
}

class Runtime implements PlanRunRuntime {
  readonly store: PlanRunStore;
  private owned = new Map<string, Owned>();
  private current: string | undefined;
  private invalidStartup: string | undefined;
  private readonly shared: SharedState;

  constructor(profileDir: string, shared: SharedState) {
    this.store = new PlanRunStore(path.join(profileDir, "plan-runs"));
    this.shared = shared;
    for (const item of shared.owned) this.owned.set(canonical(item.run.planPath), { ...item, run: { ...item.run } });
    this.current = shared.current;
  }

  private save(key: string): void {
    const item = this.owned.get(key);
    const index = this.shared.owned.findIndex(value => canonical(value.run.planPath) === key);
    if (!item) { if (index >= 0) this.shared.owned.splice(index, 1); return; }
    const value = { ...item, run: { ...item.run } };
    if (index >= 0) this.shared.owned[index] = value;
    else this.shared.owned.push(value);
  }

  track(run: PlanRun): void {
    const key = canonical(run.planPath);
    const previous = this.owned.get(key);
    if (previous && previous.run.token !== run.token && this.current === key) {
      this.current = undefined;
      if (this.shared.current === key) this.shared.current = undefined;
    }
    this.owned.set(key, { run, pending: true });
    this.save(key);
  }

  forget(run: PlanRun): void {
    const key = canonical(run.planPath);
    if (this.owned.get(key)?.run.token !== run.token) return;
    this.store.release(key, run.token);
    this.owned.delete(key);
    this.save(key);
    if (this.current === key) { this.current = undefined; if (this.shared.current === key) this.shared.current = undefined; }
  }

  install(pi: ExtensionAPI): void {
    pi.on("session_start", (_event, ctx) => this.start(ctx));
    pi.on("session_shutdown", event => {
      if (event.reason === "reload") return;
      for (const item of [...this.owned.values()]) this.forget(item.run);
      this.invalidStartup = undefined;
    });
    pi.on("input", (event, ctx) => this.input(event.text, ctx));
    // Input fires BEFORE queueing. A follow-up can enter the SAME agent loop,
    // without a new agent_start. Match actual delivered user messages instead.
    pi.on("message_start", event => {
      if (event.message.role !== "user") return;
      const content = event.message.content;
      const text = typeof content === "string" ? content : content.filter(part => part.type === "text").map(part => part.text).join("\n");
      for (const [key, item] of this.owned) {
        if (!item.pending || !item.command) continue;
        // The marker belongs to our native do-it template. It only correlates a
        // previously observed invocation, never discovers plans from chat text.
        if (text.trim() === item.command || text.split(/\r?\n/).includes(`Invocation arguments: ${item.args}`)) {
          if (this.current && this.current !== key) this.setState(this.current, "waiting");
          item.pending = false; this.current = key; this.shared.current = key; this.save(key); this.setState(key, "running");
          break;
        }
      }
    });
    pi.on("agent_start", () => { if (this.current) this.setState(this.current, "running"); });
    pi.on("ui_prompt_start", () => {
      const item = this.current ? this.owned.get(this.current) : undefined;
      if (item?.run.state !== "running") return;
      item.blockedFrom = item.run.state;
      this.setState(this.current!, "blocked");
    });
    pi.on("ui_prompt_end", () => {
      const item = this.current ? this.owned.get(this.current) : undefined;
      if (!item?.blockedFrom) return;
      this.setState(this.current!, item.blockedFrom); item.blockedFrom = undefined;
    });
    pi.on("agent_settled", (_event, ctx) => {
      if (!ctx.isIdle()) return;
      // The registry tracks an invocation's active loop, not the semantic
      // completion of its markdown plan. Once delivered work settles idle,
      // retire it; a later unrelated turn must not inherit this ownership.
      for (const [, item] of [...this.owned]) {
        if (!item.pending) this.forget(item.run);
      }
    });
  }

  private setState(key: string, state: PlanRunState): void {
    const item = this.owned.get(key);
    if (!item) return;
    // A /plans replacement may supersede this runtime's token. Lifecycle
    // events from the old invocation are harmless and must not touch the new
    // owner or surface a stale-token error.
    let current: PlanRun | undefined;
    try { current = this.store.get(key); } catch { return; }
    if (!current || current.token !== item.run.token) {
      this.owned.delete(key);
      this.save(key);
      if (this.current === key) {
        this.current = undefined;
        if (this.shared.current === key) this.shared.current = undefined;
      }
      return;
    }
    if (item.run.state !== state) item.run = this.store.update(key, item.run.token, { state });
    this.save(key);
  }

  private start(ctx: ExtensionContext): void {
    const token = process.env.PI_PLANS_LAUNCH_TOKEN;
    const inputPath = process.env.PI_PLANS_LAUNCH_PLAN;
    delete process.env.PI_PLANS_LAUNCH_TOKEN;
    delete process.env.PI_PLANS_LAUNCH_PLAN;
    if (token && inputPath) {
      const file = canonical(inputPath);
      // Event errors are logged and do not stop Pi. Block the startup input
      // before touching storage, including on unreadable reservation state.
      this.invalidStartup = file;
      try {
        const found = this.store.get(file);
        if (!found || found.token !== token || !["launching", "unknown"].includes(found.state)) throw new Error("Reservation is missing or already adopted");
        this.track(this.store.update(file, token, {
          pid: process.pid, sessionId: ctx.sessionManager.getSessionId(), state: "waiting",
          tabId: process.env.HERDR_TAB_ID, paneId: process.env.HERDR_PANE_ID,
        }));
        this.invalidStartup = undefined;
      } catch (error) { ctx.ui.notify(`Plan startup blocked: ${String(error)}`, "error"); }
    }
    if (ctx.isIdle()) {
      for (const item of [...this.owned.values()]) if (!item.pending) this.forget(item.run);
    } else if (this.current) this.setState(this.current, "running");
    if (this.current && !this.owned.has(this.current)) {
      if (this.shared.current === this.current) this.shared.current = undefined;
      this.current = undefined;
    }
  }

  private input(text: string, ctx: ExtensionContext): { action: "handled" } | undefined {
    const input = planInput(text, ctx.cwd);
    if (!input) return;
    if (this.invalidStartup === input.file) {
      this.invalidStartup = undefined;
      ctx.ui.notify("Blocked /do-it: this launch reservation could not be verified.", "error");
      return { action: "handled" };
    }
    let item = this.owned.get(input.file);
    if (!item) {
      // Observe explicit manual invocations without imposing a new command
      // policy outside /plans or stealing another process's reservation.
      try {
        if (!existsSync(input.file) || this.store.get(input.file)) return;
        this.track(this.store.claim(input.file, {
          pid: process.pid, state: "waiting", sessionId: ctx.sessionManager.getSessionId(),
          tabId: process.env.HERDR_TAB_ID, paneId: process.env.HERDR_PANE_ID,
        }));
        item = this.owned.get(input.file);
      } catch { return; }
    }
    if (item) { item.command = text.trim(); item.args = input.args; item.pending = true; this.save(input.file); }
  }
}

// Keep only serializable execution data across source reloads. Runtime instances
// contain module-owned methods and listeners, so caching one globally would pin
// the pre-reload implementation forever.
const sharedKey = Symbol.for("dotfiles.pi.default.plan-run-runtime.state.v2");
const runtimes = new Map<string, Runtime>();

function migrateLegacy(all: typeof globalThis & { [legacyKey]?: Map<string, LegacyRuntime> }, key: string, shared: SharedState): void {
  const legacy = all[legacyKey];
  const legacyEntry = legacy && [...legacy.entries()].find(([profile]) => canonical(profile) === key);
  const old = legacyEntry?.[1];
  if (!old?.owned) return;
  let count = 0;
  for (const item of old.owned.values()) {
    if (count++ >= MAX_MIGRATED_OWNED || !item?.run?.planPath) break;
    shared.owned.push({
      pending: item.pending,
      ...(item.command === undefined ? {} : { command: item.command }),
      ...(item.args === undefined ? {} : { args: item.args }),
      ...(item.blockedFrom === undefined ? {} : { blockedFrom: item.blockedFrom }),
      run: { ...item.run },
    });
  }
  if (old.current) shared.current = old.current;
  // Do not repeatedly inspect or retain the old module's methods/listeners.
  legacy!.delete(legacyEntry![0]);
  if (legacy!.size === 0) delete all[legacyKey];
}

export function getPlanRunRuntime(profileDir = getAgentDir()): PlanRunRuntime {
  const all = globalThis as typeof globalThis & {
    [sharedKey]?: Map<string, SharedState>;
    [legacyKey]?: Map<string, LegacyRuntime>;
  };
  const states = all[sharedKey] ??= new Map();
  const key = canonical(profileDir);
  let value = runtimes.get(key);
  if (!value) {
    const shared = states.get(key) ?? { owned: [] };
    if (!shared.owned.length && shared.current === undefined) migrateLegacy(all, key, shared);
    states.set(key, shared);
    value = new Runtime(key, shared);
    runtimes.set(key, value);
  }
  return value;
}

export function registerPlanRunTracking(pi: ExtensionAPI, runtime = getPlanRunRuntime()): void {
  (runtime as Runtime).install(pi);
}

import { existsSync, realpathSync } from "node:fs";
import * as path from "node:path";
import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { parsePlan } from "./plans.ts";
import { PlanRunStore, type PlanRun, type PlanRunState } from "./plan-runs.ts";

export interface PlanRunRuntime {
  readonly store: PlanRunStore;
  track(run: PlanRun): void;
  forget(run: PlanRun): void;
}

type Owned = { run: PlanRun; pending: boolean; command?: string; args?: string; blockedFrom?: PlanRunState };

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

function complete(file: string): boolean {
  try {
    const plan = parsePlan(file, path.basename(path.dirname(file)), path.dirname(path.dirname(path.dirname(file))));
    return plan.status === "completed" && plan.tasks.checked === plan.tasks.total;
  } catch { return false; }
}

function completedRun(file: string): boolean {
  if (existsSync(file)) return complete(file);
  const specs = path.dirname(path.dirname(file));
  if (path.basename(specs) !== ".specs") return false;
  return complete(path.join(specs, "archive", path.basename(path.dirname(file)), "plan.md"));
}

class Runtime implements PlanRunRuntime {
  readonly store: PlanRunStore;
  private owned = new Map<string, Owned>();
  private current: string | undefined;
  private invalidStartup: string | undefined;

  constructor(profileDir: string) { this.store = new PlanRunStore(path.join(profileDir, "plan-runs")); }

  track(run: PlanRun): void {
    const key = canonical(run.planPath);
    this.owned.set(key, { run, pending: true });
  }

  forget(run: PlanRun): void {
    const key = canonical(run.planPath);
    if (this.owned.get(key)?.run.token !== run.token) return;
    this.store.release(key, run.token);
    this.owned.delete(key);
    if (this.current === key) this.current = undefined;
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
          item.pending = false; this.current = key; this.setState(key, "running");
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
      for (const [key, item] of [...this.owned]) {
        if (item.pending) continue;
        if (completedRun(item.run.planPath)) this.forget(item.run);
        else { item.blockedFrom = undefined; this.setState(key, "waiting"); }
      }
    });
  }

  private setState(key: string, state: PlanRunState): void {
    const item = this.owned.get(key);
    if (item && item.run.state !== state) item.run = this.store.update(key, item.run.token, { state });
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
    if (this.current) this.setState(this.current, ctx.isIdle() ? "waiting" : "running");
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
    if (item) { item.command = text.trim(); item.args = input.args; item.pending = true; }
  }
}

const globalKey = Symbol.for("dotfiles.pi.default.plan-run-runtime.v1");
export function getPlanRunRuntime(profileDir = getAgentDir()): PlanRunRuntime {
  const all = globalThis as typeof globalThis & { [globalKey]?: Map<string, Runtime> };
  const map = all[globalKey] ??= new Map();
  const key = canonical(profileDir);
  let value = map.get(key);
  if (!value) { value = new Runtime(key); map.set(key, value); }
  return value;
}

export function registerPlanRunTracking(pi: ExtensionAPI, runtime = getPlanRunRuntime()): void {
  (runtime as Runtime).install(pi);
}

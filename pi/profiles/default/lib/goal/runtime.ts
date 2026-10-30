import { randomUUID } from "node:crypto";
import type { GoalAuthority, GoalBudgetConfig, GoalOutcome, GoalState } from "./contract.ts";
import { createGoalState, restoreGoalState, withGoalOperational, withGoalOutcome } from "./state.ts";
import type { GoalCodexCheckpoint } from "./budget.ts";

export const GOAL_RUNTIME_ENTRY = "goal-runtime";
export type GoalControlAction = "checkpoint" | "complete" | "question" | "blocker" | "pause";
export interface GoalControl {
  action: GoalControlAction;
  summary: string;
  /** Evidence/next work only. Never authority. */
  findings?: string[];
  restoringBuildability?: boolean;
}
export interface GoalEnrollment { session: string; from: string; until?: string }
export interface GoalRuntimeData {
  version: 1;
  runId: string;
  sessionId: string;
  sessions: GoalEnrollment[];
  attributionComplete: boolean;
  baseline?: unknown;
  previousCodex?: GoalCodexCheckpoint;
  reason?: string;
  restoringBuildability: boolean;
}
export interface GoalAdmission { allowed: boolean; reason?: string; guidance?: string }
export interface GoalRuntimeOptions {
  persistState: (state: GoalState) => void;
  persistRuntime: (data: GoalRuntimeData) => void;
  admit: (state: GoalState, data: GoalRuntimeData) => Promise<GoalAdmission>;
  stopDescendants?: (runId: string) => Promise<void>;
}
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function enrollment(value: unknown): value is GoalEnrollment {
  return object(value) && typeof value.session === "string" && !!value.session.trim() &&
    typeof value.from === "string" && Number.isFinite(Date.parse(value.from)) &&
    (value.until === undefined || (typeof value.until === "string" && Number.isFinite(Date.parse(value.until))));
}
export function restoreGoalRuntime(branch: readonly unknown[], state: GoalState): GoalRuntimeData | undefined {
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i];
    if (!object(entry) || entry.type !== "custom" || entry.customType !== GOAL_RUNTIME_ENTRY) continue;
    const data = entry.data;
    if (!object(data) || data.version !== 1 || data.runId !== state.runId || data.sessionId !== state.sessionId ||
      !Array.isArray(data.sessions) || !data.sessions.every(enrollment) || typeof data.attributionComplete !== "boolean" ||
      typeof data.restoringBuildability !== "boolean" || (data.reason !== undefined && typeof data.reason !== "string")) return;
    return { version: 1, runId: data.runId, sessionId: data.sessionId, sessions: data.sessions.map(s => ({ ...s })),
      attributionComplete: data.attributionComplete, baseline: data.baseline,
      ...(object(data.previousCodex) && [data.previousCodex.usedPercent, data.previousCodex.resetAt, data.previousCodex.observedAt].every(n => typeof n === "number" && Number.isFinite(n))
        ? { previousCodex: { usedPercent: Number(data.previousCodex.usedPercent), resetAt: Number(data.previousCodex.resetAt), observedAt: Number(data.previousCodex.observedAt) } } : {}),
      reason: data.reason, restoringBuildability: data.restoringBuildability };
  }
}

/** Session-owned controller. Healthy settlement continues until an explicit goal outcome. */
export class GoalRuntime {
  state?: GoalState;
  data?: GoalRuntimeData;
  guidance?: string;
  private admission: Promise<GoalAdmission> = Promise.resolve({ allowed: true });
  private stopping?: { runId: string; promise: Promise<void> };
  private readonly options: GoalRuntimeOptions;
  constructor(options: GoalRuntimeOptions) { this.options = options; }
  restore(branch: readonly unknown[], sessionId: string): void {
    this.state = restoreGoalState(branch, sessionId);
    this.data = this.state ? restoreGoalRuntime(branch, this.state) : undefined;
    if (!this.state) return;
    // Never auto-launch on reload, /resume, tree navigation, or a copied branch.
    if (!this.data) this.data = { version: 1, runId: this.state.runId, sessionId, sessions: [], attributionComplete: false, restoringBuildability: false };
    if (this.state.outcome === "running") this.pause("interrupted", "Session restored. Use /goal resume to continue.");
  }
  start(sessionId: string, session: string, authority: GoalAuthority, budget: GoalBudgetConfig, baseline?: unknown, now = new Date().toISOString()): void {
    if (this.state?.outcome === "running") throw new Error("A goal is already running. Pause it before starting another.");
    this.state = createGoalState({ runId: randomUUID(), sessionId, startedAt: now, authority, budget });
    this.data = { version: 1, runId: this.state.runId, sessionId, sessions: [{ session, from: now }], attributionComplete: true, baseline, restoringBuildability: false };
    this.save();
  }
  /** Called only with direct user text. Model tool results cannot reach this path. */
  userInstruction(text: string, resumeWaiting = true): void {
    if (!this.state || !text.trim() || !["running", "question", "blocker"].includes(this.state.outcome)) return;
    this.state = { ...this.state, authority: { ...this.state.authority, decisions: [...this.state.authority.decisions, text] } };
    if (resumeWaiting && (this.state.outcome === "question" || this.state.outcome === "blocker")) this.state = withGoalOutcome(this.state, "running");
    this.save();
  }
  resume(instruction?: string, restoringBuildability = false): void {
    if (!this.state || !this.data) throw new Error("No goal in this session. Start one with /goal <goal>.");
    if (this.state.outcome === "complete") throw new Error("This goal is complete. Start a new goal instead.");
    this.state = withGoalOutcome(this.state, "running");
    if (instruction?.trim()) this.userInstruction(instruction, false);
    this.data.reason = undefined;
    this.data.restoringBuildability = restoringBuildability;
    this.save();
  }
  setBaseline(baseline: unknown): void {
    if (!this.data) throw new Error("No goal runtime");
    if (this.data.baseline !== undefined) throw new Error("Goal launch baseline is immutable");
    this.data.baseline = structuredClone(baseline);
    this.save();
  }
  recordCodex(observation: GoalCodexCheckpoint): void {
    if (!this.data) return;
    this.data.previousCodex = { ...observation };
    this.save();
  }
  enroll(session: string, now = new Date().toISOString()): void {
    if (!this.state || !this.data || this.state.outcome !== "running") throw new Error("Goal is not running");
    if (!this.data.sessions.some(s => s.session === session && s.until === undefined)) { this.data.sessions.push({ session, from: now }); this.save(); }
  }
  async unavailable(reason: string): Promise<void> {
    if (!this.data) return;
    this.data.attributionComplete = false;
    this.pause("budget", reason);
    // pause starts cancellation, but the accounting ACK must not join it.
  }
  control(input: GoalControl): void {
    if (!this.state || !this.data || this.state.outcome !== "running") throw new Error("No running goal");
    if (!input.summary.trim()) throw new Error("Goal control requires a concrete summary");
    this.state = withGoalOperational(this.state, {
      findings: input.findings ?? this.state.operational.findings,
      notes: [input.summary],
    });
    this.data.restoringBuildability = input.restoringBuildability === true;
    if (input.action !== "checkpoint") {
      const outcome: GoalOutcome = input.action === "pause" ? "interrupted" : input.action;
      this.state = withGoalOutcome(this.state, outcome);
      this.data.reason = input.summary;
      this.closeEnrollments(input.action !== "complete");
    }
    this.save();
    if (input.action !== "checkpoint" && input.action !== "complete") void this.requestStop(this.data.runId);
  }
  pause(outcome: "budget" | "interrupted", reason: string): void {
    if (!this.state || !this.data) return;
    this.state = withGoalOutcome(this.state, outcome);
    this.data.reason = reason;
    this.closeEnrollments(true);
    this.save();
    void this.requestStop(this.data.runId);
  }
  async halt(outcome: "budget" | "interrupted", reason: string): Promise<void> {
    if (!this.state) return;
    const runId = this.state.runId;
    this.pause(outcome, reason);
    await this.requestStop(runId);
  }
  async waitForStops(): Promise<void> { await this.stopping?.promise; }
  closeSession(session: string): void {
    if (!this.data) return;
    const now = new Date().toISOString();
    for (const row of this.data.sessions) if (row.session === session && row.until === undefined) row.until = now;
    this.save();
  }
  private requestStop(runId: string): Promise<void> {
    if (this.stopping?.runId === runId) return this.stopping.promise;
    const promise = this.stopOwned(runId);
    this.stopping = { runId, promise };
    void promise.finally(() => { if (this.stopping?.promise === promise) this.stopping = undefined; });
    return promise;
  }
  private async stopOwned(runId: string): Promise<void> {
    try {
      await this.options.stopDescendants?.(runId);
      if (this.state?.runId === runId && this.data) { this.closeEnrollments(); this.save(); }
    } catch (error) {
      if (this.state?.runId === runId && this.data) {
        this.data.reason = `${this.data.reason ?? "Goal paused"}. Descendant cleanup: ${error instanceof Error ? error.message : String(error)}`;
        this.save();
      }
    }
  }
  /** Serialize admissions so nested delegation and root turns see one coherent state. */
  admit(): Promise<GoalAdmission> {
    const check = async (): Promise<GoalAdmission> => {
      if (!this.state || !this.data) return { allowed: true };
      if (this.state.outcome !== "running") return { allowed: false, reason: this.data.reason ?? `Goal is ${this.state.outcome}` };
      const runId = this.state.runId;
      let result: GoalAdmission;
      try { result = await this.options.admit(this.state, this.data); }
      catch (error) { result = { allowed: false, reason: `Goal usage unavailable: ${error instanceof Error ? error.message : String(error)}` }; }
      if (this.state.runId !== runId || this.state.outcome !== "running") return { allowed: false, reason: "Goal changed during admission" };
      this.guidance = result.guidance;
      if (!result.allowed) {
        this.pause("budget", result.reason ?? "Goal budget does not permit further work");
        // pause initiates actual cancellation without joining the child's ACK.
      }
      return result;
    };
    this.admission = this.admission.then(check, check);
    return this.admission;
  }
  async settle(outcome: "completed" | "aborted" | "error", canContinue: boolean): Promise<boolean> {
    if (!this.state || this.state.outcome !== "running") return false;
    if (outcome !== "completed" || !canContinue) {
      this.pause("interrupted", outcome === "completed" ? "Continuation unavailable" : `Agent ${outcome}. Use /goal resume to continue.`);
      return false;
    }
    return (await this.admit()).allowed;
  }
  private closeEnrollments(rootOnly = false): void {
    if (!this.data) return;
    const now = new Date().toISOString(), root = this.data.sessions[0]?.session;
    for (const row of this.data.sessions) if (row.until === undefined && (!rootOnly || row.session === root)) row.until = now;
  }
  private save(): void {
    if (this.state) this.options.persistState(this.state);
    if (this.data) this.options.persistRuntime(structuredClone(this.data));
  }
}

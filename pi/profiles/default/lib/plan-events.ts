import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { getAgentDir, type ExtensionAPI, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

export const PLAN_EVENT_TYPE = "plan-action-event";
export const PLAN_EVENT_SCHEMA_VERSION = 1;

export type PlanEventAction = "plans" | "open" | "copy" | "run-here" | "run-new-tab" | "archive" | "close";
export type PlanEventPhase = "invocation" | "request" | "naming" | "submission" | "outcome";
export type PlanEventOutcome = "started" | "requested" | "success" | "cancelled" | "refused" | "failed" | "ambiguous" | "not-applicable";

export interface PlanEventPlan {
	stub?: string;
	path?: string;
}

export interface PlanActionEvent {
	schemaVersion: typeof PLAN_EVENT_SCHEMA_VERSION;
	eventId: string;
	invocationId: string;
	actionAttemptId: string;
	action: PlanEventAction;
	phase: PlanEventPhase;
	outcome: PlanEventOutcome;
	timestamp: string;
	elapsedMs?: number;
	profile: string;
	sessionId?: string;
	cwd: string;
	plan?: PlanEventPlan;
	source?: { tabId?: string; paneId?: string };
	target?: { tabId?: string; paneId?: string };
	error?: { stage: string; message: string };
}

export interface PlanEventRecorderOptions {
	onLoggingFailure?: (error: unknown) => void;
}

function bounded(value: unknown, limit = 240): string {
	return String(value instanceof Error ? value.message : value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

function profileName(): string {
	try { return basename(getAgentDir()); } catch { return "default"; }
}

function sessionId(ctx: Pick<ExtensionCommandContext, "sessionManager">): string | undefined {
	try { return ctx.sessionManager?.getSessionId(); } catch { return undefined; }
}

function planValue(plan?: PlanEventPlan): PlanEventPlan | undefined {
	if (!plan) return undefined;
	return { ...(plan.stub ? { stub: bounded(plan.stub, 120) } : {}), ...(plan.path ? { path: bounded(plan.path, 500) } : {}) };
}

export class PlanEventRecorder {
	readonly invocationId = randomUUID();
	private readonly started = new Map<string, number>();
	private readonly pi: Pick<ExtensionAPI, "appendEntry">;
	private readonly ctx: Pick<ExtensionCommandContext, "cwd" | "sessionManager">;
	private readonly options: PlanEventRecorderOptions;
	private loggingFailureReported = false;

	constructor(
		pi: Pick<ExtensionAPI, "appendEntry">,
		ctx: Pick<ExtensionCommandContext, "cwd" | "sessionManager">,
		options: PlanEventRecorderOptions = {},
	) {
		this.pi = pi;
		this.ctx = ctx;
		this.options = options;
	}

	request(action: PlanEventAction, plan?: PlanEventPlan): string {
		const actionAttemptId = randomUUID();
		this.started.set(actionAttemptId, Date.now());
		this.append({ actionAttemptId, action, phase: action === "plans" ? "invocation" : "request", outcome: action === "plans" ? "started" : "requested", plan });
		return actionAttemptId;
	}

	outcome(actionAttemptId: string | undefined, action: PlanEventAction, outcome: PlanEventOutcome, details: {
		plan?: PlanEventPlan;
		target?: { tabId?: string; paneId?: string };
		error?: { stage: string; message: unknown };
		phase?: PlanEventPhase;
	} = {}): void {
		const phase = details.phase ?? "outcome";
		const started = actionAttemptId ? this.started.get(actionAttemptId) : undefined;
		if (actionAttemptId && phase === "outcome") this.started.delete(actionAttemptId);
		this.append({
			actionAttemptId: actionAttemptId ?? randomUUID(), action, phase, outcome,
			plan: details.plan, target: details.target,
			...(details.error ? { error: { stage: bounded(details.error.stage, 80), message: bounded(details.error.message) } } : {}),
			...(started === undefined ? {} : { elapsedMs: Math.max(0, Date.now() - started) }),
		});
	}

	private reportLoggingFailure(error: unknown): void {
		if (this.loggingFailureReported) return;
		this.loggingFailureReported = true;
		this.options.onLoggingFailure?.(error);
	}

	append(fields: {
		actionAttemptId: string;
		action: PlanEventAction;
		phase: PlanEventPhase;
		outcome: PlanEventOutcome;
		plan?: PlanEventPlan;
		target?: { tabId?: string; paneId?: string };
		error?: { stage: string; message: unknown };
		elapsedMs?: number;
	}): void {
		const env = process.env;
		const event: PlanActionEvent = {
			schemaVersion: PLAN_EVENT_SCHEMA_VERSION,
			eventId: randomUUID(),
			invocationId: this.invocationId,
			actionAttemptId: fields.actionAttemptId,
			action: fields.action,
			phase: fields.phase,
			outcome: fields.outcome,
			timestamp: new Date().toISOString(),
			...(fields.elapsedMs === undefined ? {} : { elapsedMs: fields.elapsedMs }),
			profile: profileName(),
			...(sessionId(this.ctx) ? { sessionId: sessionId(this.ctx) } : {}),
			cwd: bounded(this.ctx.cwd ?? process.cwd(), 500),
			plan: planValue(fields.plan),
			source: { ...(env.HERDR_TAB_ID ? { tabId: bounded(env.HERDR_TAB_ID, 120) } : {}), ...(env.HERDR_PANE_ID ? { paneId: bounded(env.HERDR_PANE_ID, 120) } : {}) },
			...(fields.target ? { target: { ...(fields.target.tabId ? { tabId: bounded(fields.target.tabId, 120) } : {}), ...(fields.target.paneId ? { paneId: bounded(fields.target.paneId, 120) } : {}) } } : {}),
			...(fields.error ? { error: { stage: bounded(fields.error.stage, 80), message: bounded(fields.error.message) } } : {}),
		};
		if (typeof (this.pi as { appendEntry?: unknown }).appendEntry !== "function") {
			this.reportLoggingFailure(new Error("Pi appendEntry is unavailable; plan action history was not recorded."));
			return;
		}
		try { this.pi.appendEntry<PlanActionEvent>(PLAN_EVENT_TYPE, event); }
		catch (error) { this.reportLoggingFailure(error); }
	}
}

const ACTION_LABELS: Record<PlanEventAction, string> = {
	plans: "/plans",
	open: "Open",
	copy: "Copy",
	"run-here": "Run here",
	"run-new-tab": "Run in new tab",
	archive: "Archive",
	close: "Close",
};

export function formatPlanEvent(event: Partial<PlanActionEvent>): string {
	const action = ACTION_LABELS[event.action ?? "plans"] ?? event.action ?? "Plan";
	const stub = event.plan?.stub ? ` · ${bounded(event.plan.stub, 80)}` : "";
	const outcome = event.outcome ?? "unknown";
	const reason = event.error?.message ? ` · ${bounded(event.error.message, 120)}` : "";
	const phase = event.phase ?? "unknown";
	return `${action}${stub} · ${phase} · ${outcome}${reason}`;
}

export function notifyLoggingFailure(ctx: Pick<ExtensionCommandContext, "ui">, error: unknown): void {
	try { ctx.ui.notify(`Plan action history logging failed: ${bounded(error)}`, "warning"); } catch { /* logging must not change the action result */ }
}

export function eventPlan(plan: { stub: string; path: string }): PlanEventPlan {
	return { stub: plan.stub, path: plan.path };
}

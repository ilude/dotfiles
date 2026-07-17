import crypto from "node:crypto";
import { Cron } from "croner";
import { recordEvent } from "./metrics.ts";

export type ScheduledPromptKind = "at" | "cron";
export type ScheduledPromptState = "scheduled" | "queued" | "delivered";

export interface ScheduledPromptSpec {
	id: string;
	kind: ScheduledPromptKind;
	prompt: string;
	createdAt: string;
	runAt?: string;
	pattern?: string;
	timezone?: string;
}

export interface ScheduledPromptSnapshot extends ScheduledPromptSpec {
	state: ScheduledPromptState;
	nextRunAt: string | null;
}

export interface ProcessSchedulerEvent {
	event:
		| "schedule_created"
		| "schedule_fired"
		| "schedule_skipped"
		| "schedule_cancelled";
	job: ScheduledPromptSpec;
	reason?: string;
}

export type ScheduleDelivery = (job: ScheduledPromptSpec) => void;
export type ProcessSchedulerEventSink = (event: ProcessSchedulerEvent) => void;

interface RuntimeJob {
	spec: ScheduledPromptSpec;
	cron: Cron;
	state: ScheduledPromptState;
}

const PROCESS_SCHEDULER_VERSION = 1;
const MAX_PROCESS_SCHEDULES = 64;
const PROCESS_SCHEDULER_KEY = Symbol.for("dotfiles.pi.process-scheduler.v1");

function recordSchedulerEvent(event: ProcessSchedulerEvent): void {
	recordEvent({
		event: event.event,
		data: {
			jobId: event.job.id,
			kind: event.job.kind,
			runAt: event.job.runAt,
			pattern: event.job.pattern,
			timezone: event.job.timezone,
			reason: event.reason,
		},
	});
}

function snapshot(job: RuntimeJob): ScheduledPromptSnapshot {
	return {
		...job.spec,
		state: job.state,
		nextRunAt: job.cron.nextRun()?.toISOString() ?? null,
	};
}

export class ProcessScheduler {
	private readonly jobs = new Map<string, RuntimeJob>();
	private delivery: ScheduleDelivery | undefined;

	constructor(
		private readonly onEvent: ProcessSchedulerEventSink = recordSchedulerEvent,
	) {}

	bind(delivery: ScheduleDelivery): void {
		this.delivery = delivery;
		for (const job of this.jobs.values()) {
			if (job.state === "queued") this.deliver(job);
		}
	}

	unbind(delivery?: ScheduleDelivery): void {
		if (delivery && this.delivery !== delivery) return;
		this.delivery = undefined;
		for (const job of this.jobs.values()) {
			if (job.state === "delivered") job.state = "scheduled";
		}
	}

	scheduleAt(runAt: Date, prompt: string): ScheduledPromptSnapshot {
		this.assertCapacity();
		this.assertPrompt(prompt);
		if (!Number.isFinite(runAt.getTime()) || runAt.getTime() <= Date.now()) {
			throw new Error("Scheduled time must be in the future");
		}
		const spec: ScheduledPromptSpec = {
			id: crypto.randomUUID(),
			kind: "at",
			prompt,
			createdAt: new Date().toISOString(),
			runAt: runAt.toISOString(),
		};
		const cron = new Cron(
			runAt,
			{ catch: true, maxRuns: 1, protect: true, unref: true },
			() => this.fire(spec.id),
		);
		const job: RuntimeJob = { spec, cron, state: "scheduled" };
		this.jobs.set(spec.id, job);
		this.onEvent({ event: "schedule_created", job: spec });
		return snapshot(job);
	}

	scheduleCron(
		pattern: string,
		prompt: string,
		timezone?: string,
	): ScheduledPromptSnapshot {
		this.assertCapacity();
		this.assertPrompt(prompt);
		const fields = pattern.trim().split(/\s+/);
		if (fields.length !== 5) {
			throw new Error("Cron expressions must contain exactly five fields");
		}
		if (timezone) {
			new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
		}
		const normalizedPattern = fields.join(" ");
		const spec: ScheduledPromptSpec = {
			id: crypto.randomUUID(),
			kind: "cron",
			prompt,
			createdAt: new Date().toISOString(),
			pattern: normalizedPattern,
			timezone,
		};
		const cron = new Cron(
			normalizedPattern,
			{
				catch: true,
				mode: "5-part",
				protect: true,
				timezone,
				unref: true,
			},
			() => this.fire(spec.id),
		);
		const job: RuntimeJob = { spec, cron, state: "scheduled" };
		this.jobs.set(spec.id, job);
		this.onEvent({ event: "schedule_created", job: spec });
		return snapshot(job);
	}

	list(): ScheduledPromptSnapshot[] {
		return Array.from(this.jobs.values())
			.map(snapshot)
			.sort((left, right) => {
				const leftTime = left.nextRunAt ?? "~";
				const rightTime = right.nextRunAt ?? "~";
				return (
					leftTime.localeCompare(rightTime) || left.id.localeCompare(right.id)
				);
			});
	}

	find(idOrPrefix: string): ScheduledPromptSnapshot {
		const matches = this.list().filter((job) => job.id.startsWith(idOrPrefix));
		if (matches.length === 0)
			throw new Error(`Schedule not found: ${idOrPrefix}`);
		if (matches.length > 1)
			throw new Error(`Schedule id is ambiguous: ${idOrPrefix}`);
		return matches[0];
	}

	cancel(idOrPrefix: string): ScheduledPromptSnapshot {
		const found = this.find(idOrPrefix);
		const job = this.jobs.get(found.id);
		if (!job) throw new Error(`Schedule not found: ${idOrPrefix}`);
		job.cron.stop();
		this.jobs.delete(job.spec.id);
		this.onEvent({ event: "schedule_cancelled", job: job.spec });
		return found;
	}

	markAgentSettled(): void {
		for (const job of this.jobs.values()) {
			if (job.spec.kind === "cron" && job.state === "delivered") {
				job.state = "scheduled";
			}
		}
	}

	stopAll(): void {
		for (const job of this.jobs.values()) job.cron.stop();
		this.jobs.clear();
		this.delivery = undefined;
	}

	private assertCapacity(): void {
		if (this.jobs.size >= MAX_PROCESS_SCHEDULES) {
			throw new Error(
				`Process schedule limit reached (${MAX_PROCESS_SCHEDULES})`,
			);
		}
	}

	private assertPrompt(prompt: string): void {
		if (!prompt.trim()) throw new Error("Scheduled prompt cannot be empty");
		if (prompt.trimStart().startsWith("/")) {
			throw new Error("Scheduled slash commands are not allowed");
		}
	}

	private fire(id: string): void {
		const job = this.jobs.get(id);
		if (!job) return;
		if (job.state !== "scheduled") {
			this.onEvent({
				event: "schedule_skipped",
				job: job.spec,
				reason: "prior_delivery_pending",
			});
			return;
		}
		job.state = "queued";
		this.deliver(job);
	}

	private deliver(job: RuntimeJob): void {
		if (!this.delivery) return;
		try {
			this.delivery(job.spec);
			job.state = "delivered";
			this.onEvent({ event: "schedule_fired", job: job.spec });
			if (job.spec.kind === "at") this.jobs.delete(job.spec.id);
		} catch {
			job.state = "queued";
		}
	}
}

interface ProcessSchedulerGlobal {
	version: typeof PROCESS_SCHEDULER_VERSION;
	scheduler: ProcessScheduler;
}

function schedulerGlobals(): typeof globalThis & Record<symbol, unknown> {
	return globalThis as typeof globalThis & Record<symbol, unknown>;
}

export function getProcessScheduler(): ProcessScheduler {
	const globals = schedulerGlobals();
	const existing = globals[PROCESS_SCHEDULER_KEY] as
		| ProcessSchedulerGlobal
		| undefined;
	if (existing?.version === PROCESS_SCHEDULER_VERSION) {
		return existing.scheduler;
	}
	const scheduler = new ProcessScheduler();
	globals[PROCESS_SCHEDULER_KEY] = {
		version: PROCESS_SCHEDULER_VERSION,
		scheduler,
	} satisfies ProcessSchedulerGlobal;
	return scheduler;
}

export function resetProcessScheduler(): void {
	const globals = schedulerGlobals();
	const existing = globals[PROCESS_SCHEDULER_KEY] as
		| ProcessSchedulerGlobal
		| undefined;
	existing?.scheduler.stopAll();
	delete globals[PROCESS_SCHEDULER_KEY];
}

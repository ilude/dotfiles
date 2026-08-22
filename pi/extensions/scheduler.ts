import { onSessionStart } from "../lib/session-start-metrics.js";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { sendBackgroundPrompt } from "../lib/background-prompt.js";
import { formatToolError, uiNotify } from "../lib/extension-utils.js";
import {
	getProcessScheduler,
	type ProcessScheduler,
	type ScheduledPromptSnapshot,
} from "../lib/process-scheduler.js";

const MAX_PROMPT_LENGTH = 4_000;
const PREVIEW_LENGTH = 80;
const DURATION_MULTIPLIERS = {
	s: 1_000,
	m: 60_000,
	h: 3_600_000,
	d: 86_400_000,
} as const;

type ScheduleToolAction = "create_at" | "create_cron" | "list" | "cancel";
const ScheduleToolActionSchema = StringEnum([
	"create_at",
	"create_cron",
	"list",
	"cancel",
] as const) as unknown as ReturnType<typeof Type.String>;

interface ScheduleToolInput {
	action: ScheduleToolAction;
	when?: string;
	pattern?: string;
	timezone?: string;
	prompt?: string;
	id?: string;
}

function tokenize(input: string): string[] {
	const tokens: string[] = [];
	const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
	for (const match of input.matchAll(pattern))
		tokens.push(match[1] ?? match[2] ?? match[3]);
	return tokens;
}

function splitDefinition(args: string): { header: string; prompt: string } {
	const separator = args.indexOf(" -- ");
	if (separator < 1) {
		throw new Error("Separate the schedule from the prompt with --");
	}
	return {
		header: args.slice(0, separator).trim(),
		prompt: validatePrompt(args.slice(separator + 4)),
	};
}

function validatePrompt(value: string): string {
	const prompt = value.trim();
	if (!prompt) throw new Error("Scheduled prompt cannot be empty");
	if (prompt.length > MAX_PROMPT_LENGTH) {
		throw new Error(`Scheduled prompt exceeds ${MAX_PROMPT_LENGTH} characters`);
	}
	if (prompt.startsWith("/")) {
		throw new Error("Scheduled slash commands are not allowed");
	}
	return prompt;
}

export function parseAtTime(value: string, now: Date = new Date()): Date {
	const trimmed = value.trim();
	const duration = trimmed.match(/^(\d+)([smhd])$/i);
	if (duration) {
		const amount = Number(duration[1]);
		const unit = duration[2].toLowerCase() as keyof typeof DURATION_MULTIPLIERS;
		if (!Number.isSafeInteger(amount) || amount < 1) {
			throw new Error("Duration must be a positive integer");
		}
		return new Date(now.getTime() + amount * DURATION_MULTIPLIERS[unit]);
	}
	if (!/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
		throw new Error(
			"Use an ISO timestamp or a duration such as 15m, 2h, or 1d",
		);
	}
	const parsed = new Date(trimmed);
	if (!Number.isFinite(parsed.getTime()) || parsed.getTime() <= now.getTime()) {
		throw new Error("Scheduled time must be a valid future ISO timestamp");
	}
	return parsed;
}

function parseCronHeader(header: string): {
	pattern: string;
	timezone?: string;
} {
	const tokens = tokenize(header);
	let timezone: string | undefined;
	const timezoneIndex = tokens.indexOf("--tz");
	if (timezoneIndex >= 0) {
		timezone = tokens[timezoneIndex + 1];
		if (!timezone) throw new Error("--tz requires an IANA timezone");
		tokens.splice(timezoneIndex, 2);
	}
	if (tokens.includes("--tz")) throw new Error("Specify --tz only once");
	return { pattern: tokens.join(" "), timezone };
}

function promptPreview(prompt: string): string {
	const singleLine = prompt.replace(/\s+/g, " ").trim();
	return singleLine.length <= PREVIEW_LENGTH
		? singleLine
		: `${singleLine.slice(0, PREVIEW_LENGTH - 3)}...`;
}

function shortId(id: string): string {
	return id.slice(0, 8);
}

function applicableTimeZone(job: ScheduledPromptSnapshot): string {
	return job.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function formatScheduledTime(timestamp: string, timeZone: string): string {
	const formatted = new Intl.DateTimeFormat("en-US", {
		timeZone,
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
		second: "2-digit",
		timeZoneName: "short",
	}).format(new Date(timestamp));
	return `${formatted} (${timeZone})`;
}

function nextScheduledJob(
	jobs: ScheduledPromptSnapshot[],
): ScheduledPromptSnapshot | undefined {
	return jobs
		.filter((job) => job.nextRunAt !== null)
		.sort((left, right) =>
			(left.nextRunAt ?? "").localeCompare(right.nextRunAt ?? ""),
		)[0];
}

function nextRunMessage(jobs: ScheduledPromptSnapshot[]): string {
	const job = nextScheduledJob(jobs);
	if (!job?.nextRunAt) return "Next scheduled run: none.";
	return `Next scheduled run: ${formatScheduledTime(job.nextRunAt, applicableTimeZone(job))}.`;
}

function formatJob(job: ScheduledPromptSnapshot): string {
	const schedule =
		job.kind === "at"
			? `at ${job.runAt}`
			: `cron ${job.pattern}${job.timezone ? ` tz=${job.timezone}` : ""}`;
	const next = job.nextRunAt
		? formatScheduledTime(job.nextRunAt, applicableTimeZone(job))
		: job.state;
	return `${shortId(job.id)} ${schedule} next=${next} ${promptPreview(job.prompt)}`;
}

function formatJobs(jobs: ScheduledPromptSnapshot[]): string {
	if (jobs.length === 0) {
		return `No process-local schedules.\n${nextRunMessage(jobs)}`;
	}
	return `${jobs.map(formatJob).join("\n")}\n${nextRunMessage(jobs)}`;
}

function creationMessage(
	job: ScheduledPromptSnapshot,
	jobs: ScheduledPromptSnapshot[],
): string {
	return `Scheduled ${formatJob(job)}. Survives session changes in this Pi process; stops when the process exits.\n${nextRunMessage(jobs)}`;
}

function show(pi: ExtensionAPI, text: string): void {
	pi.sendMessage(
		{ customType: "scheduler-status", content: text, display: true },
		{ triggerTurn: false },
	);
}

function usage(): string {
	return [
		"/at <ISO-time-or-duration> -- <prompt>",
		'/cron "<five-field-expression>" [--tz <IANA-zone>] -- <prompt>',
		"/schedule list",
		"/schedule cancel <id>",
	].join("\n");
}

function scheduleAt(
	scheduler: ProcessScheduler,
	when: string,
	prompt: string,
): ScheduledPromptSnapshot {
	return scheduler.scheduleAt(parseAtTime(when), validatePrompt(prompt));
}

function scheduleCron(
	scheduler: ProcessScheduler,
	pattern: string,
	prompt: string,
	timezone?: string,
): ScheduledPromptSnapshot {
	return scheduler.scheduleCron(pattern, validatePrompt(prompt), timezone);
}

async function handleAt(
	pi: ExtensionAPI,
	args: string,
	_ctx: ExtensionCommandContext,
): Promise<void> {
	const definition = splitDefinition(args);
	const scheduler = getProcessScheduler();
	const job = scheduleAt(scheduler, definition.header, definition.prompt);
	show(pi, creationMessage(job, scheduler.list()));
}

async function handleCron(
	pi: ExtensionAPI,
	args: string,
	_ctx: ExtensionCommandContext,
): Promise<void> {
	const definition = splitDefinition(args);
	const parsed = parseCronHeader(definition.header);
	const scheduler = getProcessScheduler();
	const job = scheduleCron(
		scheduler,
		parsed.pattern,
		definition.prompt,
		parsed.timezone,
	);
	show(pi, creationMessage(job, scheduler.list()));
}

async function handleSchedule(
	pi: ExtensionAPI,
	args: string,
	_ctx: ExtensionCommandContext,
): Promise<void> {
	const tokens = tokenize(args.trim());
	const action = tokens[0]?.toLowerCase() ?? "list";
	const scheduler = getProcessScheduler();
	if (action === "list") {
		show(pi, formatJobs(scheduler.list()));
		return;
	}
	if (action === "cancel") {
		if (!tokens[1]) throw new Error("Provide a schedule id to cancel");
		const cancelled = scheduler.cancel(tokens[1]);
		show(
			pi,
			`Cancelled ${formatJob(cancelled)}.\n${nextRunMessage(scheduler.list())}`,
		);
		return;
	}
	if (action === "help") {
		show(pi, usage());
		return;
	}
	throw new Error(`Unknown /schedule action: ${action}`);
}

function toolInput(value: unknown): ScheduleToolInput {
	return value as ScheduleToolInput;
}

export default function registerScheduler(pi: ExtensionAPI) {
	let activeDelivery: ((job: { prompt: string }) => void) | undefined;

	onSessionStart(pi, import.meta.url, (_event, _ctx) => {
		activeDelivery = (job) => {
			sendBackgroundPrompt(pi, job.prompt);
		};
		getProcessScheduler().bind(activeDelivery);
	});

	pi.on("session_shutdown", (event) => {
		const scheduler = getProcessScheduler();
		if (activeDelivery) scheduler.unbind(activeDelivery);
		activeDelivery = undefined;
		if (event.reason === "quit") scheduler.stopAll();
	});

	pi.on("agent_settled", () => {
		getProcessScheduler().markAgentSettled();
	});

	for (const [name, handler] of [
		["at", handleAt],
		["cron", handleCron],
		["schedule", handleSchedule],
	] as const) {
		pi.registerCommand(name, {
			description:
				name === "at"
					? "Schedule one process-local prompt"
					: name === "cron"
						? "Schedule a recurring process-local prompt"
						: "List or cancel process-local schedules",
			handler: async (args, ctx) => {
				try {
					await handler(pi, args, ctx);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					show(pi, `Schedule error: ${message}`);
					uiNotify(ctx, "error", message, { prefix: "schedule" });
				}
			},
		});
	}

	pi.registerTool({
		name: "schedule",
		label: "Schedule",
		description:
			"Create, list, or cancel process-local prompts that run later or recur. Schedule controls timing, not todo state, dependencies, or process lifecycle.",
		promptSnippet:
			"Schedule delayed workflow continuation or recurring checks instead of shell waits or polling",
		promptGuidelines: [
			"Use schedule without confirmation for delayed continuation, recurring checks, and waits of 60 seconds or longer; it controls timing, not todo or process lifecycle.",
			"Scheduled prompts should inspect current task, background-process, or external state; they cannot be slash commands and stop with the Pi process.",
			"Ask only when required timing or recurrence values are missing or ambiguous, cancel schedules when no longer needed, and interpret results in the explicit schedule timezone or local timezone otherwise.",
			"After scheduling, continue useful work; end the turn only when the scheduled follow-up is the intended next step.",
		],
		parameters: Type.Object({
			action: ScheduleToolActionSchema,
			when: Type.Optional(Type.String()),
			pattern: Type.Optional(Type.String()),
			timezone: Type.Optional(Type.String()),
			prompt: Type.Optional(Type.String({ maxLength: MAX_PROMPT_LENGTH })),
			id: Type.Optional(Type.String()),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const input = toolInput(params);
			const scheduler = getProcessScheduler();
			if (input.action === "list") {
				const jobs = scheduler.list();
				return {
					content: [{ type: "text" as const, text: formatJobs(jobs) }],
					details: { outcome: "listed", jobs },
				};
			}
			if (input.action === "cancel") {
				if (!input.id) return formatToolError("cancel requires id");
				let job: ScheduledPromptSnapshot;
				try {
					job = scheduler.find(input.id);
				} catch (error) {
					return formatToolError(
						error instanceof Error ? error.message : String(error),
					);
				}
				const cancelled = scheduler.cancel(job.id);
				const jobs = scheduler.list();
				return {
					content: [
						{
							type: "text" as const,
							text: `Cancelled ${formatJob(cancelled)}.\n${nextRunMessage(jobs)}`,
						},
					],
					details: {
						outcome: "cancelled",
						job: cancelled,
						nextJob: nextScheduledJob(jobs),
					},
				};
			}

			if (!input.prompt)
				return formatToolError(`${input.action} requires prompt`);
			let create: () => ScheduledPromptSnapshot;
			try {
				const prompt = validatePrompt(input.prompt);
				if (input.action === "create_at") {
					if (!input.when) return formatToolError("create_at requires when");
					const runAt = parseAtTime(input.when);
					create = () => scheduler.scheduleAt(runAt, prompt);
				} else {
					if (!input.pattern)
						return formatToolError("create_cron requires pattern");
					const pattern = input.pattern.trim();
					create = () =>
						scheduler.scheduleCron(pattern, prompt, input.timezone);
				}
			} catch (error) {
				return formatToolError(
					error instanceof Error ? error.message : String(error),
				);
			}
			try {
				const job = create();
				const jobs = scheduler.list();
				return {
					content: [
						{ type: "text" as const, text: creationMessage(job, jobs) },
					],
					details: {
						outcome: "scheduled",
						job,
						nextJob: nextScheduledJob(jobs),
					},
				};
			} catch (error) {
				return formatToolError(
					error instanceof Error ? error.message : String(error),
				);
			}
		},
	});
}

export const schedulerTestApi = {
	formatJobs,
	formatScheduledTime,
	nextRunMessage,
	parseCronHeader,
	splitDefinition,
	validatePrompt,
};

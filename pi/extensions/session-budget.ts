import { createHash } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	parseSessionBudgetConfig,
	SessionBudgetTracker,
	type SessionBudgetConfig,
	type SessionBudgetFinding,
} from "../lib/session-budget.js";
import { readMergedSettings } from "../lib/settings-loader.js";
import { wrapCommandRegistration } from "../lib/slash-command-echo.js";
import {
	getTask,
	getUnmetBlockers,
	listTasks,
	resolveTaskWorkspace,
	tasksByIdSnapshot,
} from "../lib/task-registry.js";
import { appendWorkflowEvent } from "../lib/workflow-telemetry.js";

const NOTICE_TYPE = "session-budget.notice";
const STATUS_TYPE = "session-budget.status";
const HARD_OPTIONS = ["continue as scoped", "wrap up now", "stop"] as const;

type HardChoice = (typeof HARD_OPTIONS)[number];

export interface SpawnDescriptor {
	agentType: string;
	prompt: string;
}

interface PendingCommand {
	command: string;
}

interface BudgetContext {
	hasUI: boolean;
	ui: {
		notify: (message: string, level: "error") => void;
		select: (title: string, options: string[]) => Promise<string | undefined>;
	};
}

export interface SessionBudgetDependencies {
	now: () => number;
	loadConfig: (cwd: string) => SessionBudgetConfig;
	recordEvent: typeof appendWorkflowEvent;
	resolveTaskSpawn: (
		taskId: string,
		cwd: string,
	) => SpawnDescriptor | undefined;
}

export function loadSessionBudgetConfig(
	cwd: string,
	userPath?: string,
): SessionBudgetConfig {
	const settings = readMergedSettings({
		projectRoot: cwd,
		userPath,
		skipProject: true,
		skipLocal: true,
	});
	return parseSessionBudgetConfig(settings.sessionBudget);
}

const defaultDependencies: SessionBudgetDependencies = {
	now: () => Date.now(),
	loadConfig: (cwd) => loadSessionBudgetConfig(cwd),
	recordEvent: appendWorkflowEvent,
	resolveTaskSpawn: (taskId, cwd) => {
		const record = getTask(taskId);
		const execution = record?.execution;
		const tasks = tasksByIdSnapshot(listTasks({ includeTombstones: true }));
		if (
			!record ||
			(record.workspace !== undefined &&
				record.workspace !== resolveTaskWorkspace(cwd)) ||
			!new Set(["pending", "failed"]).has(record.state) ||
			getUnmetBlockers(record, tasks).length > 0 ||
			execution?.kind !== "subagent" ||
			execution.status === "failed_to_stop" ||
			typeof execution.agent !== "string" ||
			typeof execution.task !== "string"
		) {
			return undefined;
		}
		return { agentType: execution.agent, prompt: execution.task };
	},
};

function normalizeText(value: string): string {
	return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function hashText(value: string): string {
	return createHash("sha256").update(normalizeText(value)).digest("hex");
}

function touchedPaths(
	toolName: string,
	input: Record<string, unknown>,
): string[] {
	if (!new Set(["write", "edit", "text_edit", "structured_edit"]).has(toolName))
		return [];
	const paths: string[] = [];
	if (typeof input.path === "string") paths.push(input.path);
	if (Array.isArray(input.paths)) {
		for (const value of input.paths) {
			if (typeof value === "string") paths.push(value);
		}
	}
	return [...new Set(paths)];
}

function spawnDescriptors(
	toolName: string,
	input: Record<string, unknown>,
	resolveTaskSpawn: (
		taskId: string,
		cwd: string,
	) => SpawnDescriptor | undefined,
	cwd: string,
): SpawnDescriptor[] {
	const descriptors: SpawnDescriptor[] = [];
	const add = (value: unknown) => {
		if (!value || typeof value !== "object") return;
		const item = value as Record<string, unknown>;
		if (typeof item.agent !== "string" || typeof item.task !== "string") return;
		descriptors.push({ agentType: item.agent, prompt: item.task });
	};
	if (toolName === "subagent") {
		add(input);
		if (Array.isArray(input.tasks)) input.tasks.forEach(add);
		if (Array.isArray(input.chain)) input.chain.forEach(add);
	}
	if (toolName === "task") {
		const ids =
			input.action === "execute" && typeof input.id === "string"
				? [input.id]
				: input.action === "execute_many" && Array.isArray(input.ids)
					? input.ids.filter((id): id is string => typeof id === "string")
					: [];
		for (const id of ids) {
			const descriptor = resolveTaskSpawn(id, cwd);
			if (descriptor) descriptors.push(descriptor);
		}
	}
	return descriptors;
}

function commandDescriptor(
	toolName: string,
	input: Record<string, unknown>,
): PendingCommand | undefined {
	if (toolName !== "bash" && toolName !== "pwsh") return undefined;
	if (typeof input.command !== "string" || !input.command.trim())
		return undefined;
	return {
		command: `${toolName}:${input.command.trim().replace(/\s+/g, " ")}`,
	};
}

function errorSignature(content: unknown): string {
	if (!Array.isArray(content)) return hashText("unknown command error");
	const text = content
		.filter(
			(item): item is { type: "text"; text: string } =>
				Boolean(item) &&
				typeof item === "object" &&
				(item as { type?: unknown }).type === "text" &&
				typeof (item as { text?: unknown }).text === "string",
		)
		.map((item) => item.text)
		.join("\n");
	return hashText(text || "unknown command error");
}

function formatMetric(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatFootprint(tracker: SessionBudgetTracker, now: number): string {
	const snapshot = tracker.snapshot(now);
	const spawns = snapshot.spawns.length
		? snapshot.spawns
				.map((item) => `${item.agentType}=${item.count}`)
				.join(", ")
		: "none";
	return [
		`${formatMetric(snapshot.elapsedMinutes)} minutes`,
		`${snapshot.toolCalls} tool calls`,
		`${snapshot.filesTouched.length} files touched`,
		`spawns: ${spawns}`,
	].join(", ");
}

function quotePrompt(prompt: string): string {
	return prompt
		.split("\n")
		.map((line) => `> ${line}`)
		.join("\n");
}

function softNotice(
	tracker: SessionBudgetTracker,
	finding: SessionBudgetFinding,
	now: number,
): string {
	const prompt =
		tracker.snapshot(now).prompt ?? "(opening request unavailable)";
	return [
		`Session watchdog soft check-in (${finding.sensor}).`,
		"",
		"Opening request:",
		quotePrompt(prompt),
		"",
		`Measured footprint: ${formatFootprint(tracker, now)}.`,
		"State what remains to satisfy the opening request. Do only that, or ask the user if the remaining scope is unclear.",
	].join("\n");
}

function hardSummary(
	tracker: SessionBudgetTracker,
	findings: SessionBudgetFinding[],
	now: number,
): string {
	const sensors = findings
		.map(
			(finding) =>
				`${finding.sensor}: ${formatMetric(finding.measured)}/${formatMetric(finding.threshold)} ${finding.metric}`,
		)
		.join("; ");
	return `Session watchdog hard check-in. ${formatFootprint(tracker, now)}. ${sensors}`;
}

function formatSensorState(state: {
	softTriggered: boolean;
	hardTriggered: boolean;
	acknowledged: boolean;
}): string {
	if (state.acknowledged) return "acknowledged";
	if (state.hardTriggered) return "hard";
	if (state.softTriggered) return "soft";
	return "clear";
}

function formatBudgetStatus(
	tracker: SessionBudgetTracker,
	config: SessionBudgetConfig,
	now: number,
): string {
	const snapshot = tracker.snapshot(now);
	if (!snapshot.epochId) return "Session watchdog: enabled; no active epoch.";
	const spawns = snapshot.spawns.length
		? snapshot.spawns
				.map((item) => `${item.agentType}=${item.count}`)
				.join(", ")
		: "none";
	return [
		"Session watchdog",
		`Epoch: ${snapshot.epochId}`,
		`Elapsed: ${formatMetric(snapshot.elapsedMinutes)}m (informational only)`,
		`Tool calls: ${snapshot.toolCalls} (informational only)`,
		`Files touched: ${snapshot.filesTouched.length}${snapshot.filesTouched.length ? ` - ${snapshot.filesTouched.join(", ")}` : ""}`,
		`Spawns: ${spawns} (same-agent max ${config.maxSameAgentSpawns})`,
		`Repeated command errors: ${snapshot.maxCommandErrorRepeats} (soft ${config.maxCommandErrorRepeats}, hard ${config.maxCommandErrorRepeats + 2})`,
		`Sensors: repeat_spawn=${formatSensorState(snapshot.sensors.repeat_spawn)}, command_error_repeat=${formatSensorState(snapshot.sensors.command_error_repeat)}`,
	].join("\n");
}

function show(pi: Pick<ExtensionAPI, "sendMessage">, content: string) {
	pi.sendMessage(
		{ customType: STATUS_TYPE, content, display: true },
		{ triggerTurn: false },
	);
}

export function registerSessionBudget(
	pi: ExtensionAPI,
	dependencies: Partial<SessionBudgetDependencies> = {},
): void {
	const deps = { ...defaultDependencies, ...dependencies };
	let config: SessionBudgetConfig | undefined;
	let configError: string | undefined;
	try {
		config = deps.loadConfig(process.cwd());
	} catch (error) {
		configError = error instanceof Error ? error.message : String(error);
	}

	wrapCommandRegistration(pi);
	let tracker = config ? new SessionBudgetTracker(config) : undefined;
	let disabledByError: string | undefined;
	let epochCounter = 0;
	let telemetryCounter = 0;
	const pendingCommands = new Map<string, PendingCommand>();
	let pendingHardFindings: SessionBudgetFinding[] = [];
	let stoppedEpochId: string | undefined;

	const disableForSession = (
		error: unknown,
		ctx: { ui: { notify: (message: string, level: "error") => void } },
	) => {
		if (disabledByError) return;
		disabledByError = error instanceof Error ? error.message : String(error);
		console.error(`[session-budget] disabled: ${disabledByError}`);
		ctx.ui.notify(
			`Session watchdog disabled for this session: ${disabledByError}`,
			"error",
		);
	};

	const record = (
		eventType: string,
		epochId: string,
		data: Record<string, unknown>,
	) => {
		try {
			telemetryCounter += 1;
			deps.recordEvent({
				episodeId: epochId,
				eventId: `budget-${String(telemetryCounter).padStart(3, "0")}`,
				phaseId: "session-budget",
				eventType,
				evidence: "Session watchdog runtime decision.",
				data,
				now: new Date(deps.now()),
			});
		} catch (error) {
			console.error(
				`[session-budget] telemetry failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	};

	const recordFindings = (findings: SessionBudgetFinding[]) => {
		for (const finding of findings) {
			record("budget_trip", finding.epochId, {
				sensor: finding.sensor,
				level: finding.level,
				metric: finding.metric,
				measured: finding.measured,
				threshold: finding.threshold,
			});
		}
	};

	const sendDirective = (content: string) => {
		pi.sendMessage(
			{ customType: NOTICE_TYPE, content, display: false },
			{ triggerTurn: true, deliverAs: "steer" },
		);
	};

	const handleSoftFindings = (
		findings: SessionBudgetFinding[],
		now: number,
	) => {
		if (!tracker || findings.length === 0) return;
		recordFindings(findings);
		for (const finding of findings) {
			sendDirective(softNotice(tracker, finding, now));
		}
	};

	const queueHardFindings = (findings: SessionBudgetFinding[]) => {
		const fresh = findings.filter(
			(finding) =>
				!pendingHardFindings.some(
					(pending) =>
						pending.epochId === finding.epochId &&
						pending.sensor === finding.sensor,
				),
		);
		if (fresh.length === 0) return;
		recordFindings(fresh);
		pendingHardFindings.push(...fresh);
	};

	const gatePendingHardFindings = async (
		ctx: BudgetContext,
	): Promise<{ block: true; reason: string } | undefined> => {
		if (!tracker || pendingHardFindings.length === 0) return undefined;
		const hard = [...pendingHardFindings];
		const now = deps.now();
		if (!ctx.hasUI) {
			return {
				block: true,
				reason:
					"Session watchdog hard check-in requires interactive user input.",
			};
		}
		const choice = (await ctx.ui.select(hardSummary(tracker, hard, now), [
			...HARD_OPTIONS,
		])) as HardChoice | undefined;
		if (!choice) {
			return {
				block: true,
				reason: "Session watchdog hard check-in was cancelled.",
			};
		}
		pendingHardFindings = [];
		if (choice !== "stop") {
			for (const finding of hard) tracker.acknowledge(finding.sensor);
		} else {
			stoppedEpochId = hard[0]?.epochId;
		}
		for (const finding of hard) {
			record("budget_response", finding.epochId, {
				sensor: finding.sensor,
				level: finding.level,
				response: choice,
			});
		}
		if (choice === "continue as scoped") return undefined;
		if (choice === "wrap up now") {
			sendDirective(
				"Session watchdog decision: wrap up now. Stop expanding the implementation, complete only the minimum validation needed for the opening request, and report the result.",
			);
			return undefined;
		}
		try {
			sendDirective(
				"Session watchdog decision: stop. Do not execute more tools for the opening request. Report current state and remaining work.",
			);
		} catch (error) {
			disableForSession(error, ctx);
		}
		return {
			block: true,
			reason: "Stopped by session watchdog user decision.",
		};
	};

	pi.registerCommand("budget", {
		description: "Show the current session watchdog footprint",
		handler: async (_args, ctx) => {
			try {
				if (configError) {
					show(pi, `Session watchdog: configuration error - ${configError}`);
					return;
				}
				if (!config?.enabled) {
					show(pi, "Session watchdog: disabled by configuration.");
					return;
				}
				if (disabledByError) {
					show(
						pi,
						`Session watchdog: disabled for this session - ${disabledByError}`,
					);
					return;
				}
				if (!tracker) throw new Error("session budget tracker is unavailable");
				show(pi, formatBudgetStatus(tracker, config, deps.now()));
			} catch (error) {
				disableForSession(error, ctx);
			}
		},
	});

	if (!config?.enabled || configError) return;

	pi.on("session_start", async (_event, ctx) => {
		try {
			tracker = new SessionBudgetTracker(config as SessionBudgetConfig);
			pendingCommands.clear();
			pendingHardFindings = [];
			stoppedEpochId = undefined;
		} catch (error) {
			disableForSession(error, ctx);
		}
	});

	pi.on("input", async (event, ctx) => {
		try {
			stoppedEpochId = undefined;
			if (disabledByError || !tracker) return { action: "continue" as const };
			epochCounter += 1;
			tracker.process({
				type: "epoch_start",
				epochId: `session-budget-${deps.now()}-${epochCounter}`,
				prompt: event.text,
				timestamp: deps.now(),
			});
			pendingCommands.clear();
			pendingHardFindings = [];
			return { action: "continue" as const };
		} catch (error) {
			disableForSession(error, ctx);
			return { action: "continue" as const };
		}
	});

	pi.on("tool_call", async (event, ctx) => {
		try {
			if (stoppedEpochId) {
				return {
					block: true,
					reason: "Stopped by session watchdog user decision.",
				};
			}
			if (disabledByError || !tracker) return undefined;
			const input = event.input as Record<string, unknown>;
			const command = commandDescriptor(event.toolName, input);
			if (command) pendingCommands.set(event.toolCallId, command);
			const findings = tracker.process({
				type: "tool_call",
				toolName: event.toolName,
				timestamp: deps.now(),
				touchedPaths: touchedPaths(event.toolName, input),
			});
			for (const spawn of spawnDescriptors(
				event.toolName,
				input,
				deps.resolveTaskSpawn,
				ctx.cwd,
			)) {
				findings.push(
					...tracker.process({
						type: "spawn",
						agentType: spawn.agentType,
						promptHash: hashText(spawn.prompt),
						timestamp: deps.now(),
					}),
				);
			}
			const soft = findings.filter((item) => item.level === "soft");
			const hard = findings.filter((item) => item.level === "hard");
			handleSoftFindings(soft, deps.now());
			queueHardFindings(hard);
			return await gatePendingHardFindings(ctx);
		} catch (error) {
			disableForSession(error, ctx);
			return undefined;
		}
	});

	pi.on("tool_result", async (event, ctx) => {
		try {
			if (disabledByError || !tracker) return undefined;
			const pending = pendingCommands.get(event.toolCallId);
			if (!pending) return undefined;
			pendingCommands.delete(event.toolCallId);
			const findings = tracker.process({
				type: "command_result",
				command: pending.command,
				ok: !event.isError,
				errorSignature: event.isError
					? errorSignature(event.content)
					: undefined,
				timestamp: deps.now(),
			});
			const soft = findings.filter((item) => item.level === "soft");
			const hard = findings.filter((item) => item.level === "hard");
			handleSoftFindings(soft, deps.now());
			queueHardFindings(hard);
			return undefined;
		} catch (error) {
			disableForSession(error, ctx);
			return undefined;
		}
	});
}

export const sessionBudgetTestApi = {
	commandDescriptor,
	errorSignature,
	formatBudgetStatus,
	spawnDescriptors,
	touchedPaths,
};

export default function sessionBudgetExtension(pi: ExtensionAPI) {
	registerSessionBudget(pi);
}

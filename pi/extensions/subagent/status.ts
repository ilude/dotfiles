import type {
	SubagentActivityKind,
	SubagentRunSnapshot,
} from "./run-manager.js";

export type SubagentProcessState =
	| "settled"
	| "waiting-to-start"
	| "alive"
	| "exited-unsettled";

export type SubagentWatchdogState =
	| "settled"
	| "starting"
	| "active"
	| "responsive-quiet"
	| "stalled-tool"
	| "unresponsive-runtime"
	| "dead-process";

export interface SubagentStatusInspection {
	readonly run: SubagentRunSnapshot;
	readonly processState: SubagentProcessState;
	readonly processAlive?: boolean;
	readonly lastActivityAt: number;
	readonly lastActivityKind: SubagentActivityKind | "unknown";
	readonly activityVersion: number;
	readonly quietForMs: number;
	readonly runtimePingAt?: number;
	readonly runtimePingAgeMs?: number;
	readonly activeToolDurationMs?: number;
	readonly activeToolOutputAgeMs?: number;
	readonly watchdogState: SubagentWatchdogState;
	readonly progressedSince?: boolean;
}

export interface InspectSubagentStatusOptions {
	readonly now?: number;
	readonly sinceActivityVersion?: number;
	readonly isProcessAlive?: (pid: number) => boolean;
	readonly runtimePingAt?: number;
	readonly runtimePingFreshMs?: number;
	readonly quietThresholdMs?: number;
	readonly stalledToolMs?: number;
}

export function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}

export function inspectSubagentStatus(
	run: SubagentRunSnapshot,
	options: InspectSubagentStatusOptions = {},
): SubagentStatusInspection {
	const now = options.now ?? Date.now();
	const activityVersion = Number.isInteger(run.activityVersion)
		? run.activityVersion
		: 0;
	const lastActivityAt = Number.isFinite(run.lastActivityAt)
		? run.lastActivityAt
		: run.startedAt;
	const lastActivityKind = run.lastActivityKind ?? "unknown";
	let processState: SubagentProcessState;
	let processAlive: boolean | undefined;
	if (run.status !== "running") {
		processState = "settled";
	} else if (!run.pid) {
		processState = "waiting-to-start";
	} else {
		processAlive = (options.isProcessAlive ?? isProcessAlive)(run.pid);
		processState = processAlive ? "alive" : "exited-unsettled";
	}
	const quietForMs = Math.max(0, now - lastActivityAt);
	const runtimePingAgeMs =
		options.runtimePingAt === undefined
			? undefined
			: Math.max(0, now - options.runtimePingAt);
	const activeToolStartedAt = run.liveTools.reduce<number | undefined>(
		(oldest, tool) =>
			oldest === undefined || tool.startedAt < oldest ? tool.startedAt : oldest,
		undefined,
	);
	const activeToolDurationMs =
		activeToolStartedAt === undefined
			? undefined
			: Math.max(0, now - activeToolStartedAt);
	const activeToolOutputAt = run.liveTools.reduce<number | undefined>(
		(latest, tool) => {
			const candidate = tool.outputUpdatedAt ?? tool.startedAt;
			return latest === undefined || candidate > latest ? candidate : latest;
		},
		undefined,
	);
	const activeToolOutputAgeMs =
		activeToolOutputAt === undefined
			? undefined
			: Math.max(0, now - activeToolOutputAt);
	const pingFresh =
		runtimePingAgeMs !== undefined &&
		runtimePingAgeMs <= (options.runtimePingFreshMs ?? 15_000);
	let watchdogState: SubagentWatchdogState;
	if (processState === "settled") watchdogState = "settled";
	else if (processState === "waiting-to-start") watchdogState = "starting";
	else if (processState === "exited-unsettled") watchdogState = "dead-process";
	else if (!pingFresh && now - run.startedAt > (options.runtimePingFreshMs ?? 15_000))
		watchdogState = "unresponsive-runtime";
	else if (
		pingFresh &&
		activeToolDurationMs !== undefined &&
		activeToolDurationMs >= (options.stalledToolMs ?? 120_000)
	)
		watchdogState = "stalled-tool";
	else if (pingFresh && quietForMs >= (options.quietThresholdMs ?? 30_000))
		watchdogState = "responsive-quiet";
	else watchdogState = "active";
	return {
		run,
		processState,
		...(processAlive === undefined ? {} : { processAlive }),
		lastActivityAt,
		lastActivityKind,
		activityVersion,
		quietForMs,
		...(options.runtimePingAt === undefined
			? {}
			: { runtimePingAt: options.runtimePingAt }),
		...(runtimePingAgeMs === undefined ? {} : { runtimePingAgeMs }),
		...(activeToolDurationMs === undefined ? {} : { activeToolDurationMs }),
		...(activeToolOutputAgeMs === undefined ? {} : { activeToolOutputAgeMs }),
		watchdogState,
		...(options.sinceActivityVersion === undefined
			? {}
			: {
					progressedSince:
						activityVersion > options.sinceActivityVersion,
				}),
	};
}

function localDateTime(timestamp: number): string {
	const date = new Date(timestamp);
	const datePart = [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, "0"),
		String(date.getDate()).padStart(2, "0"),
	].join("-");
	const timePart = [date.getHours(), date.getMinutes(), date.getSeconds()]
		.map((part) => String(part).padStart(2, "0"))
		.join(":");
	return `${datePart} ${timePart}`;
}

function durationLabel(milliseconds: number): string {
	const seconds = Math.floor(milliseconds / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remainder = seconds % 60;
	return `${minutes}m${String(remainder).padStart(2, "0")}s`;
}

function processLabel(inspection: SubagentStatusInspection): string {
	const pid = inspection.run.pid ? ` (pid ${inspection.run.pid})` : "";
	switch (inspection.processState) {
		case "settled":
			return `settled${pid}`;
		case "waiting-to-start":
			return "not started or process identity unavailable";
		case "alive":
			return `alive${pid}`;
		case "exited-unsettled":
			return `not alive${pid}; manager has not settled the run`;
	}
}

function assessment(inspection: SubagentStatusInspection): string {
	if (inspection.processState === "settled")
		return `run is ${inspection.run.status}`;
	if (inspection.processState === "waiting-to-start")
		return "the child may be queued, or this Pi process predates process tracking";
	if (inspection.processState === "exited-unsettled")
		return "the child process is gone while the run is still marked running";
	if (inspection.progressedSince === true)
		return "child is alive and emitted new observable activity since the supplied version";
	if (inspection.progressedSince === false)
		return "child is alive but emitted no observable activity since the supplied version; it may still be waiting on a provider or a silent long-running tool";
	return `child is alive; a later exact-run check may use sinceActivityVersion=${inspection.activityVersion} to compare observable progress`;
}

export function formatSubagentStatus(
	inspection: SubagentStatusInspection,
): string {
	const run = inspection.run;
	const tokens =
		run.usage.input +
		run.usage.output +
		run.usage.cacheRead +
		run.usage.cacheWrite;
	const activeTools = run.liveTools.length
		? run.liveTools.map((tool) => tool.name).join(", ")
		: "none";
	const progress =
		inspection.progressedSince === undefined
			? "not compared"
			: inspection.progressedSince
				? "yes"
				: "no";
		const markers = [
			run.workPaths?.length ? `workPaths=${run.workPaths.join(",")}` : "",
			run.workBoundary?.length
				? `workBoundary=${run.workBoundary.join(",")}`
				: "",
		].filter(Boolean).join(" | ");
	return [
		`run: ${run.runId}`,
		`agent: ${run.agent}`,
		`status: ${run.status}`,
		`process: ${processLabel(inspection)}`,
		`last observable activity: ${inspection.lastActivityKind} at ${localDateTime(inspection.lastActivityAt)} local (${durationLabel(inspection.quietForMs)} ago)`,
		`activity version: ${inspection.activityVersion}`,
		`progress since supplied version: ${progress}`,
		`usage: ${run.usage.turns} turns | ${tokens} tokens | context peak ${run.usage.contextPeakTokens} tokens | cost ${run.usage.cost === null ? "unknown" : `$${run.usage.cost.toFixed(4)}`}`,
		`active tools: ${activeTools}`,
		`watchdog: ${inspection.watchdogState}${inspection.runtimePingAgeMs === undefined ? "" : ` | runtime ping ${durationLabel(inspection.runtimePingAgeMs)} ago`}${inspection.activeToolDurationMs === undefined ? "" : ` | active tool ${durationLabel(inspection.activeToolDurationMs)}`}`,
		...(markers ? [`advisory markers: ${markers}`] : []),
		`assessment: ${assessment(inspection)}`,
	].join("\n");
}

export function formatSubagentStatusList(
	inspections: ReadonlyArray<SubagentStatusInspection>,
): string {
	if (inspections.length === 0) return "No subagent runs are tracked.";
	return inspections
		.map((inspection) => {
			const run = inspection.run;
			return [
				run.runId,
				run.status,
				`process=${inspection.processState}`,
				`activity=${inspection.lastActivityKind}`,
				`quiet=${durationLabel(inspection.quietForMs)}`,
				`version=${inspection.activityVersion}`,
				`watchdog=${inspection.watchdogState}`,
				`turns=${run.usage.turns}`,
				...(run.workPaths?.length
					? [`workPaths=${run.workPaths.join(",")}`]
					: []),
				...(run.workBoundary?.length
					? [`workBoundary=${run.workBoundary.join(",")}`]
					: []),
			].join(" | ");
		})
		.join("\n");
}

export function formatSubagentStatusGroup(
	orchestrationId: string,
	inspections: ReadonlyArray<SubagentStatusInspection>,
): string {
	return [
		`orchestration: ${orchestrationId}`,
		`runs: ${inspections.length}`,
		formatSubagentStatusList(inspections),
	].join("\n");
}

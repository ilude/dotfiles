import * as fs from "node:fs/promises";

import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { getMetricsConfig, getMetricsDir } from "../lib/metrics.js";
import {
	type OrchestrationInteractionData,
	type OrchestrationRunData,
	readOrchestrationEvents,
} from "../lib/orchestration-telemetry.js";
import { workflowFrictionStorageRoot } from "../lib/workflow-friction.js";

const DEFAULT_DAYS = 7;
const MAX_DAYS = 365;
const TERMINAL_STATUSES = new Set([
	"completed",
	"failed",
	"cancelled",
	"stopped",
	"failed_to_stop",
	"orphaned",
	"rejected",
]);

type ReviewState =
	| "productive"
	| "mixed"
	| "churn"
	| "uncertain"
	| "failed"
	| "pending"
	| "unreviewed"
	| "unmatched";

interface ModelRow {
	key: string;
	count: number;
	inputTokens: number;
	cacheReadTokens: number;
	knownCostUsd: number;
	unavailableCost: number;
}

interface ReviewRecord {
	interactionId?: unknown;
	status?: unknown;
	review?: { classification?: unknown };
}

export function parseOrchestrationStatsDays(args: string): number | null {
	const value = args.trim();
	if (!value) return DEFAULT_DAYS;
	if (!/^\d+$/.test(value)) return null;
	const days = Number(value);
	return Number.isInteger(days) && days >= 1 && days <= MAX_DAYS ? days : null;
}

function nearestRank(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((left, right) => left - right);
	return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0;
}

function percentileLine(values: number[]): string {
	if (values.length === 0) return "p50 --, p95 --";
	const sorted = [...values].sort((left, right) => left - right);
	const p50 = sorted[Math.ceil(sorted.length * 0.5) - 1] ?? 0;
	return `p50 ${p50} ms, p95 ${nearestRank(sorted)} ms`;
}

function formatUsd(value: number): string {
	return `$${value.toFixed(4)}`;
}

function addModelRow(
	rows: Map<string, ModelRow>,
	key: string,
	usage: {
		inputTokens?: number;
		cacheReadTokens?: number;
		costUsd?: number | null;
	},
): void {
	const row = rows.get(key) ?? {
		key,
		count: 0,
		inputTokens: 0,
		cacheReadTokens: 0,
		knownCostUsd: 0,
		unavailableCost: 0,
	};
	row.count += 1;
	row.inputTokens += usage.inputTokens ?? 0;
	row.cacheReadTokens += usage.cacheReadTokens ?? 0;
	if (typeof usage.costUsd === "number") row.knownCostUsd += usage.costUsd;
	else row.unavailableCost += 1;
	rows.set(key, row);
}

function renderModelTable(
	title: string,
	rows: Map<string, ModelRow>,
): string[] {
	const lines = ["", `### ${title}`];
	if (rows.size === 0) return [...lines, "No observations."];
	lines.push(
		"| Model | Observations | Input tokens | Cache-read tokens | Known cost | Unavailable cost |",
		"|---|---:|---:|---:|---:|---:|",
	);
	for (const row of [...rows.values()].sort((left, right) =>
		left.key.localeCompare(right.key),
	)) {
		lines.push(
			`| ${row.key} | ${row.count} | ${row.inputTokens} | ${row.cacheReadTokens} | ${formatUsd(row.knownCostUsd)} | ${row.unavailableCost} |`,
		);
	}
	return lines;
}

async function reviewStates(
	interactionIds: Set<string>,
): Promise<Map<ReviewState, number>> {
	const states = new Map<ReviewState, number>([
		["productive", 0],
		["mixed", 0],
		["churn", 0],
		["uncertain", 0],
		["failed", 0],
		["pending", 0],
		["unreviewed", 0],
		["unmatched", 0],
	]);
	let text = "";
	try {
		text = await fs.readFile(
			`${workflowFrictionStorageRoot()}/reviews.jsonl`,
			"utf8",
		);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	const reviews = new Map<string, ReviewState>();
	for (const line of text.split(/\r?\n/)) {
		if (!line.trim()) continue;
		try {
			const record = JSON.parse(line) as ReviewRecord;
			if (typeof record.interactionId !== "string") continue;
			let state: ReviewState = "pending";
			if (record.status === "failed") state = "failed";
			else if (record.status === "completed") {
				const classification = record.review?.classification;
				if (
					classification === "productive" ||
					classification === "mixed" ||
					classification === "churn" ||
					classification === "uncertain"
				)
					state = classification;
			}
			reviews.set(record.interactionId, state);
		} catch {}
	}
	for (const interactionId of interactionIds) {
		const state = reviews.get(interactionId) ?? "unreviewed";
		states.set(state, (states.get(state) ?? 0) + 1);
	}
	for (const interactionId of reviews.keys()) {
		if (!interactionIds.has(interactionId))
			states.set("unmatched", (states.get("unmatched") ?? 0) + 1);
	}
	return states;
}

export async function renderOrchestrationStatsReport(
	days: number,
	now = new Date(),
): Promise<string> {
	const result = await readOrchestrationEvents({
		dir: getMetricsDir(),
		days,
		now,
	});
	const runs: OrchestrationRunData[] = [];
	const interactions: OrchestrationInteractionData[] = [];
	for (const event of result.events) {
		if (event.event === "orchestration_run")
			runs.push(event.data as OrchestrationRunData);
		else interactions.push(event.data as OrchestrationInteractionData);
	}

	const parentModels = new Map<string, ModelRow>();
	const workerModels = new Map<string, ModelRow>();
	const terminalRunIds = new Set<string>();
	const runStatuses = new Map<string, number>();
	const interactionDurations: number[] = [];
	const runDurations: number[] = [];
	const childWorkDurations: number[] = [];
	let direct = 0;
	let delegated = 0;
	let workerOutputBytes = 0;
	let returnedInlineBytes = 0;
	let notReturnedInlineBytes = 0;
	let knownParentCost = 0;
	let knownWorkerCost = 0;
	let unavailableParentCosts = 0;
	let unavailableWorkerCosts = 0;
	let workerFailures = 0;

	for (const interaction of interactions) {
		if (interaction.direct) direct += 1;
		else delegated += 1;
		if (typeof interaction.durationMs === "number")
			interactionDurations.push(interaction.durationMs);
		for (const usage of interaction.parentUsageByModel) {
			addModelRow(parentModels, `${usage.provider}/${usage.model}`, usage);
			if (typeof usage.costUsd === "number") knownParentCost += usage.costUsd;
			else unavailableParentCosts += 1;
		}
	}
	for (const run of runs) {
		runStatuses.set(run.status, (runStatuses.get(run.status) ?? 0) + 1);
		if (TERMINAL_STATUSES.has(run.status))
			terminalRunIds.add(run.orchestrationId);
		if (TERMINAL_STATUSES.has(run.status) && typeof run.durationMs === "number")
			runDurations.push(run.durationMs);
		if (
			TERMINAL_STATUSES.has(run.status) &&
			typeof run.childWorkMs === "number"
		)
			childWorkDurations.push(run.childWorkMs);
		workerOutputBytes += run.childTextBytes ?? 0;
		returnedInlineBytes += run.parentVisibleBytes ?? 0;
		notReturnedInlineBytes += run.inlineBytesNotReturned ?? 0;
		for (const worker of run.workers) {
			if (worker.status !== "completed") workerFailures += 1;
			if (!worker.usage) continue;
			addModelRow(workerModels, worker.resolvedModel ?? "unknown", {
				inputTokens: worker.usage.inputTokens,
				cacheReadTokens: worker.usage.cacheReadInputTokens,
				costUsd: worker.usage.costUsd,
			});
			if (typeof worker.usage.costUsd === "number")
				knownWorkerCost += worker.usage.costUsd;
			else unavailableWorkerCosts += 1;
		}
	}
	const pending = new Set(
		interactions.flatMap((entry) => entry.orchestrationIds),
	).size;
	let pendingRuns = 0;
	for (const id of new Set(
		interactions.flatMap((entry) => entry.orchestrationIds),
	)) {
		if (!terminalRunIds.has(id)) pendingRuns += 1;
	}
	const quality = await reviewStates(
		new Set(interactions.map((entry) => entry.interactionId)),
	);
	const config = getMetricsConfig();
	const lines = [
		"# Orchestration stats",
		`Window: last ${days} UTC day${days === 1 ? "" : "s"}, ending ${now.toISOString()}`,
		`Collection: ${config.enabled ? "enabled" : "disabled"}; files ${result.diagnostics.filesScanned}; malformed ${result.diagnostics.malformedLines}; unsupported ${result.diagnostics.unsupportedLines}; oversized ${result.diagnostics.overLimitLines}; duplicates ${result.diagnostics.duplicateLines}${result.diagnostics.truncated ? `; truncated (${result.diagnostics.truncationReason})` : ""}`,
		"Observational only: causal savings claims require matched cohorts and remain deferred.",
		"",
		"## Interactions",
		`Direct: ${direct}; delegated: ${delegated}; pending referenced runs: ${pendingRuns}; referenced run IDs: ${pending}.`,
		"",
		"## Cost",
		`Known parent cost: ${formatUsd(knownParentCost)}; known worker cost: ${formatUsd(knownWorkerCost)}; known total: ${formatUsd(knownParentCost + knownWorkerCost)}; unavailable parent models: ${unavailableParentCosts}; unavailable worker models: ${unavailableWorkerCosts}.`,
		"",
		"## Context",
		`Worker output bytes: ${workerOutputBytes}; returned inline bytes: ${returnedInlineBytes}; worker output not returned inline: ${notReturnedInlineBytes}.`,
		"",
		"## Latency",
		`Interaction wall: ${percentileLine(interactionDurations)}.`,
		`Run wall: ${percentileLine(runDurations)}.`,
		`Child work: ${percentileLine(childWorkDurations)}.`,
		"",
		"## Quality",
		`Run statuses: ${
			[...runStatuses.entries()]
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([status, count]) => `${status} ${count}`)
				.join(", ") || "none"
		}.`,
		`Worker failures: ${workerFailures}.`,
		`Friction classifications: ${[...quality.entries()].map(([state, count]) => `${state} ${count}`).join(", ")}.`,
		...renderModelTable("Parent models", parentModels),
		...renderModelTable("Worker models", workerModels),
	];
	return lines.join("\n");
}

export default function orchestrationStatsExtension(pi: ExtensionAPI) {
	pi.registerCommand("orchestration-stats", {
		description: "Show deterministic orchestration telemetry statistics",
		handler: async (args: string, ctx: ExtensionContext) => {
			const days = parseOrchestrationStatsDays(args);
			if (days === null) {
				ctx.ui.notify("Usage: /orchestration-stats [days 1-365]", "warning");
				return;
			}
			pi.sendMessage(
				{
					customType: "orchestration-stats",
					content: await renderOrchestrationStatsReport(days),
					display: true,
				},
				{ triggerTurn: false },
			);
		},
	});
}

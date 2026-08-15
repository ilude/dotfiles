import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	assignReadOnlyFanoutExperiment,
	buildOrchestrationExperimentAssignmentEvent,
	buildOrchestrationExperimentOutcomeEvent,
	buildOrchestrationInteractionEvent,
	buildOrchestrationRunEvent,
	readOrchestrationEvents,
} from "../lib/orchestration-telemetry.js";

let tmpRoot: string;

beforeEach(() => {
	tmpRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "pi-orchestration-telemetry-"),
	);
});

afterEach(() => {
	fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function runInput() {
	return {
		orchestrationId: "orchestration-1",
		mode: "single" as const,
		status: "completed" as const,
		workers: [
			{
				runId: "run-1",
				agent: "reviewer",
				status: "completed" as const,
				childTextBytes: 20,
				parentVisibleBytes: 5,
				usage: {
					inputTokens: 1,
					outputTokens: 2,
					totalTokens: 3,
					cacheCreationInputTokens: 0,
					cacheReadInputTokens: 0,
					processedTokens: 3,
					contextPeakTokens: 3,
					turns: 1,
					costUsd: null,
					costSource: "unavailable" as const,
				},
			},
		],
	};
}

function event(
	id: string,
	ts: string,
	data: object,
	name = "orchestration_run",
) {
	return JSON.stringify({ schemaVersion: 1, id, ts, event: name, data });
}

describe("orchestration telemetry builders", () => {
	it("builds closed run events and derives bytes not returned inline", () => {
		const result = buildOrchestrationRunEvent(runInput());
		expect(result).not.toBeNull();
		expect(result?.data).toMatchObject({
			schemaVersion: 2,
			inlineBytesNotReturned: 15,
		});
	});

	it("records only safe optional tree metadata on version 2 workers", () => {
		const result = buildOrchestrationRunEvent({
			...runInput(),
			workers: [
				{
					...runInput().workers[0],
					treeId: "tree-1",
					parentRunId: "parent-1",
					depth: 2,
					role: "leaf",
					workflowPhase: "retry",
					taskKey: "item-1",
					attempt: 2,
					retryOrigin: "run-0",
					coordinatorTaskId: "task-1",
				},
			],
		});
		expect(result?.data).toMatchObject({
			schemaVersion: 2,
			workers: [
				{
					treeId: "tree-1",
					parentRunId: "parent-1",
					depth: 2,
					role: "leaf",
					workflowPhase: "retry",
					taskKey: "item-1",
					attempt: 2,
					retryOrigin: "run-0",
					coordinatorTaskId: "task-1",
				},
			],
		});
		expect(
			buildOrchestrationRunEvent({
				...runInput(),
				workers: [{ ...runInput().workers[0], taskKey: "src/index.ts" }],
			}),
		).toBeNull();
		expect(
			buildOrchestrationRunEvent({
				...runInput(),
				workers: [{ ...runInput().workers[0], workflowPhase: "tool args" }],
			} as never),
		).toBeNull();
	});

	it("builds deterministic read-only fan-out assignment and outcome events", () => {
		const assignment = assignReadOnlyFanoutExperiment("interaction-1", 3);
		expect(assignment).toEqual(
			assignReadOnlyFanoutExperiment("interaction-1", 3),
		);
		expect(assignment).toMatchObject({
			experimentId: "read-only-fanout-v1",
			experimentVersion: 1,
			taskClass: "read-only-multi-item-analysis",
			riskClass: "read-only",
			independentWorkItems: 3,
			assignmentMethod: "deterministic-hash",
		});
		if (!assignment) throw new Error("assignment fixture must build");
		const assignmentEvent = buildOrchestrationExperimentAssignmentEvent({
			...assignment,
			orchestrationId: "orchestration-1",
			interactionId: "interaction-1",
		});
		expect(assignmentEvent?.event).toBe(
			"orchestration_experiment_assignment",
		);
		expect(assignmentEvent?.data).toMatchObject({
			assignmentId: assignment.assignmentId,
			orchestrationId: "orchestration-1",
			interactionId: "interaction-1",
		});
		expect(
			buildOrchestrationExperimentAssignmentEvent({
				...assignment,
				orchestrationId: "orchestration-1",
				prompt: "not retained",
			} as never),
		).toBeNull();
		const outcome = buildOrchestrationExperimentOutcomeEvent({
			experimentId: assignment.experimentId,
			experimentVersion: assignment.experimentVersion,
			assignmentId: assignment.assignmentId,
			orchestrationId: "orchestration-1",
			validationKind: "output-schema",
			validationOutcome: "passed",
			checksTotal: 3,
			checksPassed: 3,
		});
		expect(outcome?.event).toBe("orchestration_experiment_outcome");
		expect(outcome?.data).toMatchObject({
			validationOutcome: "passed",
			checksTotal: 3,
			checksPassed: 3,
		});
		expect(assignReadOnlyFanoutExperiment("interaction-1", 1)).toBeUndefined();
		expect(
			buildOrchestrationExperimentOutcomeEvent({
				...outcome?.data,
				checksTotal: 1,
				checksPassed: 2,
			} as never),
		).toBeNull();
	});

	it("rejects unknown and content-bearing fields while redacting supported secret-like values", () => {
		expect(
			buildOrchestrationRunEvent({ ...runInput(), unexpected: true } as never),
		).toBeNull();
		expect(
			buildOrchestrationRunEvent({
				...runInput(),
				workers: [{ ...runInput().workers[0], stderr: "not retained" }],
			} as never),
		).toBeNull();
		const redacted = buildOrchestrationRunEvent({
			...runInput(),
			workers: [
				{
					...runInput().workers[0],
					agent: "ghp_abcdefghijklmnopqrstuvwxyz123456",
				},
			],
		});
		expect(redacted?.data.workers[0]?.agent).toBe("[REDACTED]");
		expect(
			buildOrchestrationRunEvent({
				...runInput(),
				workers: [{ ...runInput().workers[0], agent: "Bearer credential" }],
			}),
		).toBeNull();
	});

	it("bounds arrays and drops non-finite numeric values", () => {
		expect(
			buildOrchestrationRunEvent({
				...runInput(),
				workers: Array.from({ length: 33 }, () => runInput().workers[0]),
			}),
		).toBeNull();
		const result = buildOrchestrationRunEvent({
			...runInput(),
			durationMs: Number.NaN,
		});
		expect(result?.data).not.toHaveProperty("durationMs");
		expect(
			buildOrchestrationInteractionEvent({
				interactionId: "interaction-1",
				orchestrationIds: Array.from(
					{ length: 65 },
					(_, index) => `id-${index}`,
				),
				parentUsageByModel: [],
				direct: false,
			}),
		).toBeNull();
	});

	it("validates interaction usage cost provenance", () => {
		expect(
			buildOrchestrationInteractionEvent({
				interactionId: "interaction-1",
				orchestrationIds: ["orchestration-1"],
				parentUsageByModel: [
					{
						provider: "openai",
						model: "model-1",
						costUsd: null,
						costSource: "unavailable",
					},
				],
				direct: false,
			})?.data,
		).toMatchObject({ schemaVersion: 2, direct: false });
		expect(
			buildOrchestrationInteractionEvent({
				interactionId: "interaction-1",
				orchestrationIds: [],
				parentUsageByModel: [
					{
						provider: "openai",
						model: "model-1",
						costUsd: 0,
						costSource: "unavailable",
					},
				],
				direct: true,
			}),
		).toBeNull();
	});
});

describe("readOrchestrationEvents", () => {
	it("reads UTC day files and legacy metrics, filters timestamps, deduplicates, and counts malformed lines", async () => {
		const now = new Date("2026-07-10T12:00:00.000Z");
		const built = buildOrchestrationRunEvent(runInput());
		if (!built) throw new Error("test fixture must build");
		const data = built.data;
		fs.writeFileSync(
			path.join(tmpRoot, "metrics-2026-07-08.jsonl"),
			`${event("old", "2026-07-08T11:59:59.000Z", data)}\n`,
			"utf-8",
		);
		fs.writeFileSync(
			path.join(tmpRoot, "metrics-2026-07-09.jsonl"),
			`${event("daily", "2026-07-09T13:00:00.000Z", data)}\nnot json\n`,
			"utf-8",
		);
		fs.writeFileSync(
			path.join(tmpRoot, "metrics.jsonl"),
			`${event("legacy", "2026-07-10T10:00:00.000Z", data)}\n${event("daily", "2026-07-10T10:00:00.000Z", data)}\n`,
			"utf-8",
		);
		const result = await readOrchestrationEvents({
			dir: tmpRoot,
			days: 2,
			now,
		});
		expect(result.events.map((entry) => entry.id)).toEqual(["daily", "legacy"]);
		expect(result.diagnostics.malformedLines).toBe(1);
		expect(result.diagnostics.duplicateLines).toBe(1);
	});

	it("normalizes version 1 telemetry without tree metadata", async () => {
		const legacyRun = { ...runInput(), schemaVersion: 1 };
		const legacyInteraction = {
			schemaVersion: 1,
			interactionId: "interaction-1",
			orchestrationIds: ["orchestration-1"],
			parentUsageByModel: [],
			direct: false,
		};
		fs.writeFileSync(
			path.join(tmpRoot, "metrics-2026-07-10.jsonl"),
			[
				event("legacy-v1-run", "2026-07-10T10:00:00.000Z", legacyRun),
				event(
					"legacy-v1-interaction",
					"2026-07-10T10:00:00.000Z",
					legacyInteraction,
					"orchestration_interaction",
				),
			].join("\n") + "\n",
			"utf-8",
		);
		const result = await readOrchestrationEvents({
			dir: tmpRoot,
			days: 1,
			now: new Date("2026-07-10T12:00:00.000Z"),
		});
		expect(result.events).toHaveLength(2);
		const run = result.events.find(
			(entry) => entry.event === "orchestration_run",
		);
		if (!run || run.event !== "orchestration_run")
			throw new Error("legacy run fixture must be readable");
		expect(run.data).toMatchObject({
			schemaVersion: 2,
			orchestrationId: "orchestration-1",
		});
		expect(run.data.workers[0]).not.toHaveProperty("treeId");
		const interaction = result.events.find(
			(entry) => entry.event === "orchestration_interaction",
		);
		if (!interaction || interaction.event !== "orchestration_interaction")
			throw new Error("legacy interaction fixture must be readable");
		expect(interaction.data).toMatchObject({
			schemaVersion: 2,
			interactionId: "interaction-1",
		});
	});

	it("reports oversized lines without retaining them", async () => {
		fs.writeFileSync(
			path.join(tmpRoot, "metrics-2026-07-10.jsonl"),
			`${"x".repeat(8 * 1024 * 1024)}\n`,
			"utf-8",
		);
		const result = await readOrchestrationEvents({
			dir: tmpRoot,
			days: 1,
			now: new Date("2026-07-10T12:00:00.000Z"),
		});
		expect(result.events).toEqual([]);
		expect(result.diagnostics.overLimitLines).toBe(1);
	});

	it("returns an explicit diagnostic when the requested window exceeds the file bound", async () => {
		const result = await readOrchestrationEvents({
			dir: tmpRoot,
			days: 367,
			now: new Date("2026-07-10T12:00:00.000Z"),
		});
		expect(result.diagnostics).toMatchObject({
			filesScanned: 0,
			truncated: true,
			truncationReason: "file_limit",
		});
	});
});

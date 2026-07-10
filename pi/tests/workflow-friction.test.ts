import { describe, expect, it } from "vitest";
import workflowFrictionExtension, {
	buildReviewerArgs,
} from "../extensions/workflow-friction.js";
import {
	buildReviewPrompt,
	consumeWorkflowSubmission,
	detectFrictionTriggers,
	interactionMetadataFromPacket,
	isControlSample,
	noteWorkflowSubmission,
	parseReviewResult,
	reviewSampleBucket,
	selectInteractionForReview,
	summarizeInteractionMetadata,
	type ToolTrace,
} from "../lib/workflow-friction.js";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.js";

function trace(overrides: Partial<ToolTrace> = {}): ToolTrace {
	return {
		toolName: "bash",
		argsText: JSON.stringify({ command: "pnpm test" }),
		resultText: "Command exited with code 1",
		isError: true,
		mutationGeneration: 0,
		...overrides,
	};
}

describe("workflow friction selection", () => {
	it("reviews all interactions over ten minutes", () => {
		expect(
			selectInteractionForReview({
				interactionId: "long",
				durationMs: 10 * 60 * 1000 + 1,
				triggers: [],
			}),
		).toEqual(["duration_over_10m"]);
	});

	it("reviews every subagent run lasting at least two minutes", () => {
		expect(
			selectInteractionForReview({
				interactionId: "subagent-long",
				durationMs: 2 * 60 * 1000,
				triggers: ["subagent_duration_over_2m"],
			}),
		).toEqual(["subagent_duration_over_2m"]);
	});

	it("reviews sub-two-minute interactions only when captured", () => {
		expect(
			selectInteractionForReview({
				interactionId: "short",
				durationMs: 90_000,
				triggers: ["repeated_tool_failure"],
			}),
		).toEqual([]);
		expect(
			selectInteractionForReview({
				interactionId: "short",
				durationMs: 90_000,
				triggers: [],
				manual: true,
			}),
		).toEqual(["manual_capture"]);
	});

	it("uses a stable fifteen-percent control bucket", () => {
		const bucket = reviewSampleBucket("interaction-stable");
		expect(bucket).toBeGreaterThanOrEqual(0);
		expect(bucket).toBeLessThan(100);
		expect(reviewSampleBucket("interaction-stable")).toBe(bucket);
		expect(isControlSample("interaction-stable")).toBe(bucket < 15);
	});
});

describe("workflow friction triggers", () => {
	it("detects repeated command and tool failures without an intervening edit", () => {
		expect(detectFrictionTriggers("run it", [trace(), trace()])).toEqual([
			"repeated_failed_command",
			"repeated_tool_failure",
			"repeated_validation_without_edit",
		]);
	});

	it("does not treat validation reruns after an edit as unchanged repetition", () => {
		expect(
			detectFrictionTriggers("run it", [
				trace({ isError: false, resultText: "passed", mutationGeneration: 0 }),
				trace({ isError: false, resultText: "passed", mutationGeneration: 1 }),
			]),
		).toEqual([]);
	});

	it("detects repeated failed subagents and explicit frustration", () => {
		expect(
			detectFrictionTriggers("This is over-designed bullshit", [
				trace({ toolName: "subagent" }),
				trace({ toolName: "subagent" }),
			]),
		).toEqual([
			"multiple_failed_subagents",
			"repeated_tool_failure",
			"user_frustration",
		]);
	});
});

describe("workflow friction metadata", () => {
	it("records denominator metrics without prompt or response content", () => {
		const metadata = interactionMetadataFromPacket({
			schemaVersion: 1,
			interactionId: "interaction-metadata",
			sessionId: "session-metadata",
			mode: "explore",
			startedAt: "2026-07-10T00:00:00.000Z",
			settledAt: "2026-07-10T00:04:00.000Z",
			durationMs: 240_000,
			subagentRunId: "task-run-123",
			subagentStartedAt: "2026-07-10T00:00:00.000Z",
			selectionReasons: ["repeated_tool_failure"],
			userText: "private request text",
			assistantTurns: ["private assistant text"],
			assistantText: "private assistant text",
			tools: [
				trace(),
				trace({
					toolName: "subagent",
					argsText: "{}",
					resultText: "completed",
					isError: false,
				}),
				trace({
					toolName: "edit",
					argsText: "{}",
					resultText: "updated",
					isError: false,
				}),
			],
		});

		expect(metadata).toMatchObject({
			selected: true,
			subagentRunId: "task-run-123",
			subagentStartedAt: "2026-07-10T00:00:00.000Z",
			toolCount: 3,
			toolFailureCount: 1,
			validationCount: 1,
			subagentCount: 1,
			failedSubagentCount: 0,
			fileMutationCount: 1,
		});
		expect(JSON.stringify(metadata)).not.toContain("private request text");
		expect(JSON.stringify(metadata)).not.toContain("private assistant text");
	});

	it("summarizes selected and unselected interactions with duration buckets", () => {
		const base = {
			schemaVersion: 1,
			interactionId: "one",
			sessionId: "session",
			mode: "explore" as const,
			startedAt: "2026-07-10T00:00:00.000Z",
			settledAt: "2026-07-10T00:01:00.000Z",
			durationMs: 60_000,
			selected: false,
			selectionReasons: [],
			toolCount: 1,
			toolFailureCount: 0,
			validationCount: 0,
			subagentCount: 0,
			failedSubagentCount: 0,
			fileMutationCount: 0,
		};
		const summary = summarizeInteractionMetadata([
			base,
			{
				...base,
				interactionId: "two",
				mode: "engineer",
				durationMs: 700_000,
				selected: true,
				selectionReasons: ["duration_over_10m"],
			},
		]);

		expect(summary).toMatchObject({
			total: 2,
			selected: 1,
			duration: { under2m: 1, from2To10m: 0, over10m: 1 },
			mode: { explore: 1, engineer: 1, unknown: 0 },
			selectionReasons: { duration_over_10m: 1 },
			medianDurationMs: 60_000,
			p95DurationMs: 700_000,
		});
	});
});

describe("workflow friction reviewer", () => {
	it("runs Terra at low effort with tools and persistent state disabled", () => {
		const args = buildReviewerArgs("C:/tmp/prompt.md");
		expect(args).toContain("gpt-5.6-terra");
		expect(args).toContain("low");
		expect(args).toContain("--no-tools");
		expect(args).toContain("--no-session");
	});

	it("includes bounded assistant turns and the final response", () => {
		const prompt = buildReviewPrompt({
			schemaVersion: 1,
			interactionId: "interaction-1",
			sessionId: "session-1",
			mode: "explore",
			startedAt: "2026-07-10T00:00:00.000Z",
			settledAt: "2026-07-10T00:03:00.000Z",
			durationMs: 180_000,
			subagentRunId: "run-123",
			subagentStartedAt: "2026-07-10T00:00:00.000Z",
			selectionReasons: ["manual_capture"],
			userText: "Fix the command.",
			assistantTurns: ["First I inspected it.", "Then I repaired it."],
			assistantText: "Then I repaired it.",
			tools: [],
		});
		expect(prompt).toContain("First I inspected it.");
		expect(prompt).toContain("Then I repaired it.");
		expect(prompt).toContain('"subagentRunId":"run-123"');
		expect(prompt).toContain('"subagentStartedAt":"2026-07-10T00:00:00.000Z"');
	});

	it("accepts the bounded review schema", () => {
		expect(
			parseReviewResult(
				JSON.stringify({
					classification: "churn",
					confidence: 0.9,
					summary: "Repeated validation before implementation.",
					evidence: ["The same command ran twice without an edit."],
					reusableInstruction: {
						likely: "yes",
						reason: "A focused validation rule would prevent repetition.",
						targetSkill: "analysis-workflow",
					},
					suggestedChange: "Run validation after a coherent edit.",
				}),
			),
		).toMatchObject({ classification: "churn", confidence: 0.9 });
	});

	it("rejects invalid reviewer classifications", () => {
		expect(
			parseReviewResult(
				JSON.stringify({
					classification: "bad",
					confidence: 0.9,
					evidence: [],
					reusableInstruction: { likely: "no", reason: "" },
				}),
			),
		).toBeNull();
	});
});

describe("workflow friction extension", () => {
	it("registers the commands, experiment tool, and lifecycle hooks", () => {
		const pi = createMockPi();
		workflowFrictionExtension(pi as never);
		expect(pi._commands.map((command) => command.name)).toEqual([
			"capture",
			"workflow-review",
		]);
		expect(pi._getTool("workflow_friction_mark_change")).toBeDefined();
		expect(pi._getHook("before_agent_start")).toHaveLength(1);
		expect(pi._getHook("agent_settled")).toHaveLength(1);
	});

	it("reports when capture has no completed interaction", async () => {
		const pi = createMockPi();
		workflowFrictionExtension(pi as never);
		const ctx = createMockCtx();
		const capture = pi._commands.find((command) => command.name === "capture");
		await capture?.handler("", ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			"No completed interaction is available to capture.",
			"warning",
		);
	});
});

describe("workflow submission hints", () => {
	it("preserves explicit workflow mode for the next agent run", () => {
		noteWorkflowSubmission("/do-it .specs/example/design.md", "engineer", 1000);
		expect(consumeWorkflowSubmission(1500)).toEqual({
			text: "/do-it .specs/example/design.md",
			mode: "engineer",
			submittedAt: 1000,
		});
	});
});

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import workflowFrictionExtension, {
	buildReviewerArgs,
} from "../extensions/workflow-friction-review.js";
import {
	activateOrchestrationInteraction,
	buildReviewPrompt,
	consumeWorkflowSubmission,
	detectFrictionTriggers,
	interactionMetadataFromPacket,
	isControlSample,
	noteParentAssistantUsage,
	noteWorkflowSubmission,
	parseReviewResult,
	registerOrchestrationInvocation,
	resetOrchestrationInteraction,
	reviewSampleBucket,
	selectInteractionForReview,
	settleOrchestrationInteraction,
	summarizeInteractionMetadata,
	type ToolTrace,
	workflowFrictionStorageRoot,
} from "../lib/workflow-friction.js";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.js";

let moduleInstance = 0;

async function loadIndependentWorkflowFrictionModule() {
	const copyUrl = new URL("../lib/workflow-friction.ts", import.meta.url);
	moduleInstance += 1;
	copyUrl.searchParams.set("instance", String(moduleInstance));
	return import(copyUrl.href);
}

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

	it("counts task execute traces as subagent invocations", () => {
		const metadata = interactionMetadataFromPacket({
			schemaVersion: 1,
			interactionId: "interaction-task-execute",
			sessionId: "session-task-execute",
			mode: "engineer",
			startedAt: "2026-07-10T00:00:00.000Z",
			settledAt: "2026-07-10T00:01:00.000Z",
			durationMs: 60_000,
			selectionReasons: [],
			userText: "",
			assistantTurns: [],
			assistantText: "",
			tools: [
				trace({
					toolName: "task",
					argsText: JSON.stringify({ action: "execute" }),
					resultText: "completed",
					isError: false,
				}),
			],
		});
		expect(metadata.subagentCount).toBe(1);
		expect(metadata.failedSubagentCount).toBe(0);
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

describe("orchestration interaction lifecycle", () => {
	beforeEach(() => resetOrchestrationInteraction());
	afterEach(() => resetOrchestrationInteraction());

	it("accumulates usage by provider and model and consumes once", () => {
		activateOrchestrationInteraction({
			interactionId: "interaction-usage",
			sessionId: "session-usage",
		});
		expect(registerOrchestrationInvocation("orchestration-one")).toBe(
			"interaction-usage",
		);
		noteParentAssistantUsage({
			provider: "provider-one",
			model: "model-one",
			usage: {
				input: 10,
				output: 2,
				cacheRead: 3,
				cacheWrite: 4,
				totalTokens: 19,
				cost: { total: 0 },
			},
		});
		noteParentAssistantUsage({
			provider: "provider-two",
			model: "model-two",
			usage: { input: 5, totalTokens: 5 },
		});
		const settled = settleOrchestrationInteraction("interaction-usage");
		expect(settled).toMatchObject({
			orchestrationIds: ["orchestration-one"],
			parentUsageByModel: [
				{
					provider: "provider-one",
					model: "model-one",
					inputTokens: 10,
					outputTokens: 2,
					cacheReadTokens: 3,
					cacheWriteTokens: 4,
					contextPeakTokens: 19,
					costUsd: 0,
					costSource: "pi-usage",
				},
				{
					provider: "provider-two",
					model: "model-two",
					costUsd: null,
					costSource: "unavailable",
				},
			],
		});
		expect(settleOrchestrationInteraction("interaction-usage")).toBeNull();
	});

	it("shares only orchestration lifecycle state across module identities", async () => {
		const copy = await loadIndependentWorkflowFrictionModule();

		activateOrchestrationInteraction({
			interactionId: "interaction-module-copy",
			sessionId: "session-module-copy",
		});
		expect(
			copy.registerOrchestrationInvocation("orchestration-module-copy"),
		).toBe("interaction-module-copy");

		noteWorkflowSubmission("primary submission", "engineer", 1_000);
		expect(copy.consumeWorkflowSubmission(1_001)).toBeNull();
		expect(consumeWorkflowSubmission(1_001)?.text).toBe("primary submission");

		expect(
			settleOrchestrationInteraction("interaction-module-copy"),
		).toMatchObject({
			orchestrationIds: ["orchestration-module-copy"],
		});
		expect(
			copy.settleOrchestrationInteraction("interaction-module-copy"),
		).toBeNull();
	});

	it("returns the canonical interaction ID after cross-module replacement", async () => {
		const copy = await loadIndependentWorkflowFrictionModule();
		activateOrchestrationInteraction({
			interactionId: "interaction-stale",
			sessionId: "session-stale",
		});
		copy.activateOrchestrationInteraction({
			interactionId: "interaction-current",
			sessionId: "session-current",
		});

		expect(registerOrchestrationInvocation("orchestration-current")).toBe(
			"interaction-current",
		);
		expect(settleOrchestrationInteraction("interaction-stale")).toBeNull();
		expect(
			copy.settleOrchestrationInteraction("interaction-current"),
		).toMatchObject({
			interactionId: "interaction-current",
			orchestrationIds: ["orchestration-current"],
		});
		expect(settleOrchestrationInteraction("interaction-current")).toBeNull();
	});

	it("clears only the matching session lifecycle across module identities", async () => {
		const copy = await loadIndependentWorkflowFrictionModule();
		activateOrchestrationInteraction({
			interactionId: "interaction-session",
			sessionId: "session-one",
		});
		copy.resetOrchestrationInteraction("session-two");
		expect(
			settleOrchestrationInteraction("interaction-session"),
		).not.toBeNull();

		activateOrchestrationInteraction({
			interactionId: "interaction-reset",
			sessionId: "session-two",
		});
		copy.resetOrchestrationInteraction("session-two");
		expect(
			registerOrchestrationInvocation("orchestration-stale"),
		).toBeUndefined();
		expect(settleOrchestrationInteraction("interaction-reset")).toBeNull();
	});

	it("resolves the configured friction storage root", () => {
		const previous = process.env.PI_WORKFLOW_FRICTION_DIR;
		process.env.PI_WORKFLOW_FRICTION_DIR = "C:/tmp/friction";
		expect(workflowFrictionStorageRoot()).toBe("C:/tmp/friction");
		if (previous === undefined) delete process.env.PI_WORKFLOW_FRICTION_DIR;
		else process.env.PI_WORKFLOW_FRICTION_DIR = previous;
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

	it("emits one top-level interaction event with grouped parent usage", async () => {
		const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "pi-friction-"));
		const metricsDir = path.join(scratch, "metrics");
		const frictionDir = path.join(scratch, "friction");
		const previousMetrics = process.env.PI_METRICS_DIR;
		const previousFriction = process.env.PI_WORKFLOW_FRICTION_DIR;
		const previousSubagent = process.env.PI_SUBAGENT_RUN_ID;
		process.env.PI_METRICS_DIR = metricsDir;
		process.env.PI_WORKFLOW_FRICTION_DIR = frictionDir;
		delete process.env.PI_SUBAGENT_RUN_ID;
		try {
			const ctx = createMockCtx({
				sessionManager: { getSessionId: () => "session-top-level" },
			});
			const pi = createMockPi();
			workflowFrictionExtension(pi as never);
			const beforeAgent = pi._getHook("before_agent_start")[0]?.handler;
			const messageEnd = pi._getHook("message_end")[0]?.handler;
			const settled = pi._getHook("agent_settled")[0]?.handler;
			await beforeAgent({ prompt: "direct" }, ctx);
			await messageEnd({
				message: {
					role: "assistant",
					provider: "provider-one",
					model: "model-one",
					usage: { input: 7, output: 2, totalTokens: 9 },
					content: [],
				},
			});
			await messageEnd({
				message: {
					role: "assistant",
					provider: "provider-two",
					model: "model-two",
					usage: { input: 3, output: 1, totalTokens: 4, cost: { total: 0 } },
					content: [{ type: "text", text: "done" }],
				},
			});
			await settled({}, ctx);

			await beforeAgent({ prompt: "delegated" }, ctx);
			registerOrchestrationInvocation("orchestration-delegated");
			await settled({}, ctx);

			process.env.PI_SUBAGENT_RUN_ID = "child-run";
			const child = createMockPi();
			workflowFrictionExtension(child as never);
			const childBefore = child._getHook("before_agent_start")[0]?.handler;
			const childSettled = child._getHook("agent_settled")[0]?.handler;
			await childBefore({ prompt: "child" }, ctx);
			await childSettled({}, ctx);

			const files = await fs.readdir(metricsDir);
			const lines = await fs.readFile(
				path.join(metricsDir, files[0] ?? ""),
				"utf8",
			);
			const events = lines
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line) as Record<string, unknown>)
				.filter((event) => event.event === "orchestration_interaction");
			expect(events).toHaveLength(2);
			expect(events[0]).toMatchObject({
				session: "session-top-level",
				data: {
					orchestrationIds: [],
					direct: true,
					parentUsageByModel: [
						{
							provider: "provider-one",
							model: "model-one",
							inputTokens: 7,
							costSource: "unavailable",
						},
						{
							provider: "provider-two",
							model: "model-two",
							inputTokens: 3,
							costUsd: 0,
							costSource: "pi-usage",
						},
					],
				},
			});
			expect(events[1]).toMatchObject({
				data: {
					orchestrationIds: ["orchestration-delegated"],
					direct: false,
				},
			});
		} finally {
			if (previousMetrics === undefined) delete process.env.PI_METRICS_DIR;
			else process.env.PI_METRICS_DIR = previousMetrics;
			if (previousFriction === undefined)
				delete process.env.PI_WORKFLOW_FRICTION_DIR;
			else process.env.PI_WORKFLOW_FRICTION_DIR = previousFriction;
			if (previousSubagent === undefined) delete process.env.PI_SUBAGENT_RUN_ID;
			else process.env.PI_SUBAGENT_RUN_ID = previousSubagent;
			await fs.rm(scratch, { recursive: true, force: true });
		}
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

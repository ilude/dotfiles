import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import workflowFrictionExtension, {
	candidateStatusesPath,
	collectCandidateUsage,
	gateImprovementCandidates,
	type ImprovementCandidateStatusRecord,
	type ImprovementCandidateUsage,
	learningDecisionsPath,
	processPendingReviews,
	rankImprovementCandidates,
	readCurrentLearningDecisions,
} from "../extensions/workflow-friction-review.js";
import {
	activateOrchestrationInteraction,
	buildReviewPrompt,
	consumeWorkflowSubmission,
	detectFrictionTriggers,
	type InteractionPacket,
	interactionMetadataFromPacket,
	isControlSample,
	noteParentAssistantUsage,
	noteWorkflowSubmission,
	registerOrchestrationInvocation,
	resetOrchestrationInteraction,
	reviewSampleBucket,
	type StoredReviewRecord,
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

function commandLearningReviewRecord(
	repoRoot: string,
	scope: "project" | "user" = "project",
	targetSkill?: string,
): StoredReviewRecord {
	return {
		schemaVersion: 1,
		interactionId: "interaction-command",
		sessionId: "session-command",
		reviewedAt: "2026-07-14T00:00:00.000Z",
		startedAt: "2026-07-14T00:00:00.000Z",
		durationMs: 1_000,
		mode: "explore",
		selectionReasons: ["user_correction"],
		repoRoot,
		status: "completed",
		review: {
			classification: "mixed",
			confidence: 0.9,
			summary: "The user corrected the package manager.",
			evidence: ["The user said to use pnpm instead."],
			reusableInstruction: {
				likely: "yes",
				reason: "The package manager is a durable project convention.",
				scope,
				targetSkill,
				target: targetSkill
					? { kind: "skill", name: targetSkill }
					: { kind: "command", name: "improve" },
			},
			suggestedChange: "Use pnpm for Pi TypeScript work.",
		},
	};
}

function queuedReviewPacket(interactionId: string): InteractionPacket {
	return {
		schemaVersion: 1,
		interactionId,
		sessionId: `session-${interactionId}`,
		mode: "explore",
		startedAt: "2026-07-15T00:00:00.000Z",
		settledAt: "2026-07-15T00:01:00.000Z",
		durationMs: 60_000,
		selectionReasons: ["user_correction"],
		userText: "Use pnpm instead.",
		assistantTurns: ["I used npm."],
		assistantText: "I used npm.",
		tools: [],
		repoRoot: "/test/dir",
	};
}

function queuedReviewJob(packet: InteractionPacket) {
	return {
		schemaVersion: 1,
		queuedAt: "2026-07-15T00:01:00.000Z",
		packet,
	};
}

function emptySessionEntries(): [] {
	return [];
}

function sessionContextFixture(sessionId: string) {
	return createMockCtx({
		sessionManager: {
			getSessionId: () => sessionId,
			getEntries: emptySessionEntries,
		},
	});
}

async function invokeImproveCommand(
	pi: ReturnType<typeof createMockPi>,
	ctx: ReturnType<typeof createMockCtx>,
	args: string,
): Promise<void> {
	const command = pi._commands.find((item) => item.name === "improve");
	if (!command) throw new Error("improve command not registered");
	await command.handler(args, ctx);
}

function improveMessageContent(
	pi: ReturnType<typeof createMockPi>,
	index: number,
): string {
	const call = pi.sendMessage.mock.calls[index];
	if (!call) throw new Error(`Missing improve message at index ${index}`);
	return String((call[0] as { content: unknown }).content);
}

async function emitTopLevelInteractionEvents(
	ctx: ReturnType<typeof createMockCtx>,
): Promise<void> {
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
}

async function readOrchestrationInteractionEvents(
	metricsDir: string,
): Promise<Record<string, unknown>[]> {
	const files = await fs.readdir(metricsDir);
	const lines = await fs.readFile(
		path.join(metricsDir, files[0] ?? ""),
		"utf8",
	);
	return lines
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line) as Record<string, unknown>)
		.filter((event) => event.event === "orchestration_interaction");
}

function expectTopLevelInteractionEvents(
	events: Record<string, unknown>[],
): void {
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
}

function fakeReviewer() {
	const output = commandLearningReviewRecord("/test/dir").review;
	if (!output) throw new Error("Review fixture is missing");
	return {
		run: vi.fn(async () => ({ output, attempts: 1 })),
	};
}

function rankedCandidate(
	id: string,
	impact: "safety" | "correctness" | "efficiency" | "maintainability",
	reviewedAt: string,
): StoredReviewRecord {
	const record = commandLearningReviewRecord("/test/dir");
	return {
		...record,
		interactionId: id,
		reviewedAt,
		review: record.review ? { ...record.review, impact } : undefined,
	};
}

async function waitForPath(filePath: string): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		try {
			await fs.access(filePath);
			return;
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
	}
	throw new Error(`Timed out waiting for ${filePath}`);
}

async function waitForPathRemoval(filePath: string): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		try {
			await fs.access(filePath);
			await new Promise((resolve) => setTimeout(resolve, 10));
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 10));
			return;
		}
	}
	throw new Error(`Timed out waiting for removal of ${filePath}`);
}

async function seedLearningReviews(
	records: readonly StoredReviewRecord[],
): Promise<void> {
	const reviewsPath = path.join(
		path.dirname(learningDecisionsPath()),
		"reviews.jsonl",
	);
	await fs.mkdir(path.dirname(reviewsPath), { recursive: true });
	await fs.writeFile(
		reviewsPath,
		`${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
		"utf8",
	);
}

async function seedCandidateStatuses(
	records: readonly ImprovementCandidateStatusRecord[],
): Promise<void> {
	await fs.mkdir(path.dirname(candidateStatusesPath()), { recursive: true });
	await fs.writeFile(
		candidateStatusesPath(),
		`${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
		"utf8",
	);
}

function activeCandidateStatuses(
	records: readonly StoredReviewRecord[],
): ImprovementCandidateStatusRecord[] {
	return records.map((record, index) => ({
		schemaVersion: 1,
		eventId: `active-${record.interactionId}`,
		candidateId: record.interactionId,
		recordedAt: `2026-07-25T00:00:${String(index).padStart(2, "0")}.000Z`,
		status: "active",
		reasonCode: "validated_fixture",
		reason: "The fixture is explicitly active.",
	}));
}

async function seedCommandLearningReview(
	repoRoot: string,
	scope: "project" | "user" = "project",
	targetSkill?: string,
): Promise<StoredReviewRecord> {
	const review = commandLearningReviewRecord(repoRoot, scope, targetSkill);
	await seedLearningReviews([review]);
	await seedCandidateStatuses(activeCandidateStatuses([review]));
	return review;
}

function ordinalCandidateRecords(): StoredReviewRecord[] {
	return ["11111111", "22222222", "33333333", "da4f5e4b"].map(
		(id, index) => {
			const record = rankedCandidate(
				`interaction-${id}`,
				"efficiency",
				`2026-07-14T00:00:0${index}.000Z`,
			);
			record.sessionId = `session-${id}`;
			if (record.review)
				record.review.reusableInstruction.target = {
					kind: "command",
					name: `command-${id}`,
				};
			return record;
		},
	);
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

	it("reviews short corrections immediately but leaves other short friction sampled out", () => {
		expect(
			selectInteractionForReview({
				interactionId: "short-failure",
				durationMs: 90_000,
				triggers: ["repeated_tool_failure"],
			}),
		).toEqual([]);
		expect(
			selectInteractionForReview({
				interactionId: "short-correction",
				durationMs: 1_000,
				triggers: ["user_correction"],
			}),
		).toEqual(["user_correction"]);
		expect(
			selectInteractionForReview({
				interactionId: "short-remember",
				durationMs: 1_000,
				triggers: ["explicit_learning_request"],
			}),
		).toEqual(["explicit_learning_request"]);
		expect(
			selectInteractionForReview({
				interactionId: "short-manual",
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

	it("detects direct corrections and explicit remember requests", () => {
		expect(detectFrictionTriggers("No, use pnpm instead.", [])).toEqual([
			"user_correction",
		]);
		expect(
			detectFrictionTriggers(
				"Please remember that Pi TypeScript uses pnpm.",
				[],
			),
		).toEqual(["explicit_learning_request"]);
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
	it("executes one review when a duplicate pending job appears after claim", async () => {
		const scratch = await fs.mkdtemp(
			path.join(os.tmpdir(), "pi-review-contention-"),
		);
		const previous = process.env.PI_WORKFLOW_FRICTION_DIR;
		process.env.PI_WORKFLOW_FRICTION_DIR = scratch;
		try {
			const packet = queuedReviewPacket("interaction-contention");
			const job = queuedReviewJob(packet);
			const pendingDir = path.join(scratch, "queue", "pending");
			const pendingPath = path.join(pendingDir, `${packet.interactionId}.json`);
			await fs.mkdir(pendingDir, { recursive: true });
			await fs.writeFile(pendingPath, `${JSON.stringify(job)}\n`, "utf8");
			const annotationDir = path.join(scratch, "annotations");
			await fs.mkdir(annotationDir, { recursive: true });
			await fs.writeFile(
				path.join(annotationDir, `${packet.interactionId}.json`),
				`${JSON.stringify({
					interactionId: packet.interactionId,
					selectionReasons: ["manual_capture"],
					captureNote: "Preserve this annotation.",
				})}\n`,
				"utf8",
			);
			const reviewer = fakeReviewer();
			reviewer.run.mockImplementationOnce(async () => {
				await fs.writeFile(pendingPath, `${JSON.stringify(job)}\n`, "utf8");
				const output = commandLearningReviewRecord("/test/dir").review;
				if (!output) throw new Error("Review fixture is missing");
				return { output, attempts: 1 };
			});

			await processPendingReviews(createMockCtx(), reviewer);

			expect(reviewer.run).toHaveBeenCalledTimes(1);
			const records = (
				await fs.readFile(path.join(scratch, "reviews.jsonl"), "utf8")
			)
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line) as StoredReviewRecord);
			expect(records).toHaveLength(1);
			expect(records[0]).toMatchObject({
				selectionReasons: ["manual_capture", "user_correction"],
				captureNote: "Preserve this annotation.",
			});
		} finally {
			if (previous === undefined) delete process.env.PI_WORKFLOW_FRICTION_DIR;
			else process.env.PI_WORKFLOW_FRICTION_DIR = previous;
			await fs.rm(scratch, { recursive: true, force: true });
		}
	});

	it("does not append a failed review when recovering an already recorded job", async () => {
		const scratch = await fs.mkdtemp(
			path.join(os.tmpdir(), "pi-review-recovery-"),
		);
		const previous = process.env.PI_WORKFLOW_FRICTION_DIR;
		process.env.PI_WORKFLOW_FRICTION_DIR = scratch;
		try {
			const packet = queuedReviewPacket("interaction-recovered");
			const processingDir = path.join(scratch, "queue", "processing");
			await fs.mkdir(processingDir, { recursive: true });
			await fs.writeFile(
				path.join(processingDir, `${packet.interactionId}.json`),
				`${JSON.stringify(queuedReviewJob(packet))}\n`,
				"utf8",
			);
			const existing = {
				...commandLearningReviewRecord("/test/dir"),
				interactionId: packet.interactionId,
			};
			await fs.writeFile(
				path.join(scratch, "reviews.jsonl"),
				`${JSON.stringify(existing)}\n`,
				"utf8",
			);
			const reviewer = fakeReviewer();

			await processPendingReviews(createMockCtx(), reviewer);

			expect(reviewer.run).not.toHaveBeenCalled();
			const records = (
				await fs.readFile(path.join(scratch, "reviews.jsonl"), "utf8")
			)
				.trim()
				.split("\n");
			expect(records).toHaveLength(1);
		} finally {
			if (previous === undefined) delete process.env.PI_WORKFLOW_FRICTION_DIR;
			else process.env.PI_WORKFLOW_FRICTION_DIR = previous;
			await fs.rm(scratch, { recursive: true, force: true });
		}
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

	it("keeps truncated packet fields within reviewer schema limits", async () => {
		const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "pi-review-bounds-"));
		const previous = process.env.PI_WORKFLOW_FRICTION_DIR;
		process.env.PI_WORKFLOW_FRICTION_DIR = scratch;
		try {
			const ctx = createMockCtx({
				sessionManager: {
					getSessionId: () => "session-review-bounds",
					getEntries: () => [
						{
							type: "message",
							message: { role: "assistant" },
						},
					],
				},
			});
			const pi = createMockPi();
			const reviewer = fakeReviewer();
			workflowFrictionExtension(pi as never, { reviewer });
			const beforeAgent = pi._getHook("before_agent_start")[0]?.handler;
			const messageEnd = pi._getHook("message_end")[0]?.handler;
			const toolStart = pi._getHook("tool_execution_start")[0]?.handler;
			const toolEnd = pi._getHook("tool_execution_end")[0]?.handler;
			const settled = pi._getHook("agent_settled")[0]?.handler;

			await beforeAgent({ prompt: `No, ${"u".repeat(17_000)}` }, ctx);
			await messageEnd({
				message: {
					role: "assistant",
					provider: "provider-one",
					model: "model-one",
					usage: { input: 1, output: 1, totalTokens: 2 },
					content: [{ type: "text", text: "a".repeat(9_000) }],
				},
			});
			await toolStart({
				toolCallId: "tool-review-bounds",
				toolName: "bash",
				args: { command: "x".repeat(2_000) },
			});
			await toolEnd({
				toolCallId: "tool-review-bounds",
				toolName: "bash",
				result: {
					content: [{ type: "text", text: "r".repeat(3_000) }],
				},
				isError: true,
			});
			await settled({}, ctx);

			await vi.waitFor(() => expect(reviewer.run).toHaveBeenCalledOnce());
			const input = reviewer.run.mock.calls[0]?.[0] as
				| { packet: InteractionPacket }
				| undefined;
			if (!input) throw new Error("Reviewer input is missing");
			const packet = input.packet;
			expect(packet.userText).toHaveLength(16_000);
			expect(packet.assistantText).toHaveLength(8_000);
			expect(packet.assistantTurns[0]).toHaveLength(8_000);
			expect(packet.tools[0]?.argsText).toHaveLength(1_000);
			expect(packet.tools[0]?.resultText).toHaveLength(2_000);
			for (const value of [
				packet.userText,
				packet.assistantText,
				packet.assistantTurns[0],
				packet.tools[0]?.argsText,
				packet.tools[0]?.resultText,
			])
				expect(value).toMatch(/\n\[truncated\]$/);
			await waitForPathRemoval(path.join(scratch, "worker.lock"));
		} finally {
			if (previous === undefined) delete process.env.PI_WORKFLOW_FRICTION_DIR;
			else process.env.PI_WORKFLOW_FRICTION_DIR = previous;
			await fs.rm(scratch, { recursive: true, force: true });
		}
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

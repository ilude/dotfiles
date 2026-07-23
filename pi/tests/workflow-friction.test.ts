import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import workflowFrictionExtension, {
	collectCandidateUsage,
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

async function seedCommandLearningReview(
	repoRoot: string,
	scope: "project" | "user" = "project",
	targetSkill?: string,
): Promise<StoredReviewRecord> {
	const review = commandLearningReviewRecord(repoRoot, scope, targetSkill);
	await seedLearningReviews([review]);
	return review;
}

function ordinalCandidateRecords(): StoredReviewRecord[] {
	return ["11111111", "22222222", "33333333", "da4f5e4b"].map((id, index) =>
		rankedCandidate(
			`interaction-${id}`,
			"efficiency",
			`2026-07-14T00:00:0${index}.000Z`,
		),
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

	it("counts task execute actions but excludes joins and graph mutations", () => {
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
			tools: ["execute", "execute_many", "await", "batch"].map((action) =>
				trace({
					toolName: "task",
					argsText: JSON.stringify({ action }),
					resultText: "completed",
					isError: false,
				}),
			),
		});
		expect(metadata.subagentCount).toBe(2);
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
});

describe("improvement candidate ranking", () => {
	it("prioritizes safety and correctness, then higher observed usage", () => {
		const safety = rankedCandidate(
			"safety-zero",
			"safety",
			"2026-07-12T00:00:00.000Z",
		);
		const high = rankedCandidate(
			"normal-high",
			"efficiency",
			"2026-07-13T00:00:00.000Z",
		);
		const low = rankedCandidate(
			"normal-low",
			"efficiency",
			"2026-07-11T00:00:00.000Z",
		);
		const usage = new Map<string, ImprovementCandidateUsage>([
			[
				safety.interactionId,
				{ state: "zero", source: "skill-stats", calls30d: 0 },
			],
			[
				high.interactionId,
				{ state: "observed", source: "skill-stats", calls30d: 8 },
			],
			[
				low.interactionId,
				{ state: "observed", source: "skill-stats", calls30d: 1 },
			],
		]);
		expect(
			rankImprovementCandidates([low, high, safety], usage).map(
				(candidate) => candidate.interactionId,
			),
		).toEqual(["safety-zero", "normal-high", "normal-low"]);
	});

	it("keeps undiscovered targets unknown instead of verified zero", async () => {
		const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "pi-targets-"));
		const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
		process.env.PI_CODING_AGENT_DIR = path.join(scratch, "agent");
		try {
			const candidates = (
				["skill", "command", "extension", "tool"] as const
			).map((kind) => {
				const candidate = rankedCandidate(
					`missing-${kind}`,
					"efficiency",
					"2026-07-14T00:00:00.000Z",
				);
				if (candidate.review)
					candidate.review.reusableInstruction.target = {
						kind,
						name: `missing-${kind}`,
					};
				return candidate;
			});
			const pi = createMockPi() as ReturnType<typeof createMockPi> & {
				getAllTools: () => never[];
			};
			pi.getAllTools = () => [];
			const usage = await collectCandidateUsage(
				candidates,
				pi as never,
				createMockCtx({
					cwd: scratch,
					sessionManager: {
						getSessionDir: () => path.join(scratch, "sessions"),
					},
				}),
			);
			for (const candidate of candidates)
				expect(usage.get(candidate.interactionId)).toMatchObject({
					state: "unknown",
					diagnostic: "target not discovered",
				});
		} finally {
			if (previousAgentDir === undefined)
				delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
			await fs.rm(scratch, { recursive: true, force: true });
		}
	});

	it("ranks observed usage above unknown and verified zero deterministically", () => {
		const observed = rankedCandidate(
			"observed",
			"maintainability",
			"2026-07-14T00:00:00.000Z",
		);
		const unknown = rankedCandidate(
			"unknown",
			"maintainability",
			"2026-07-12T00:00:00.000Z",
		);
		const zero = rankedCandidate(
			"zero",
			"maintainability",
			"2026-07-10T00:00:00.000Z",
		);
		const usage = new Map<string, ImprovementCandidateUsage>([
			[
				observed.interactionId,
				{ state: "observed", source: "extension-stats", calls30d: 2 },
			],
			[unknown.interactionId, { state: "unknown", source: "none" }],
			[
				zero.interactionId,
				{ state: "zero", source: "extension-stats", calls30d: 0 },
			],
		]);
		expect(
			rankImprovementCandidates([zero, unknown, observed], usage).map(
				(candidate) => candidate.interactionId,
			),
		).toEqual(["observed", "unknown", "zero"]);
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
	it("registers one improvement command, decision tools, and lifecycle hooks", () => {
		const pi = createMockPi();
		workflowFrictionExtension(pi as never);
		expect(pi._commands.map((command) => command.name)).toEqual(["improve"]);
		const decideTool = pi._getTool("learning_candidate_decide");
		expect(decideTool).toBeDefined();
		expect(decideTool?.parameters.properties).not.toHaveProperty(
			"decisionText",
		);
		expect(pi._getTool("workflow_friction_mark_change")).toBeDefined();
		expect(pi._getHook("before_agent_start")).toHaveLength(1);
		expect(pi._getHook("agent_settled")).toHaveLength(1);
	});

	it("rejects empty edit and skip decision commands visibly", async () => {
		const pi = createMockPi();
		workflowFrictionExtension(pi as never);
		const ctx = createMockCtx();

		await invokeImproveCommand(pi, ctx, "decide edit");
		await invokeImproveCommand(pi, ctx, "decide skip   ");

		expect(improveMessageContent(pi, 0)).toContain(
			"/improve decide edit requires nonempty text.",
		);
		expect(improveMessageContent(pi, 1)).toContain(
			"/improve decide skip requires nonempty text.",
		);
		expect(pi.sendMessage.mock.calls[0]?.[1]).toEqual({ triggerTurn: false });
		expect(pi.sendMessage.mock.calls[1]?.[1]).toEqual({ triggerTurn: false });
	});

	it("reports when no supported improvement candidate exists", async () => {
		const scratch = await fs.mkdtemp(
			path.join(os.tmpdir(), "pi-improve-empty-"),
		);
		const previous = process.env.PI_WORKFLOW_FRICTION_DIR;
		process.env.PI_WORKFLOW_FRICTION_DIR = scratch;
		try {
			const pi = createMockPi();
			workflowFrictionExtension(pi as never);
			const ctx = createMockCtx();
			const improve = pi._commands.find(
				(command) => command.name === "improve",
			);
			await improve?.handler("", ctx);
			expect(pi.sendMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					customType: "workflow-friction.improve-command",
					display: true,
					content: expect.stringContaining(
						"> /improve\n\nNo supported improvement candidates exist for this workspace.",
					),
				}),
				{ triggerTurn: false },
			);
		} finally {
			if (previous === undefined) delete process.env.PI_WORKFLOW_FRICTION_DIR;
			else process.env.PI_WORKFLOW_FRICTION_DIR = previous;
			await fs.rm(scratch, { recursive: true, force: true });
		}
	});

	it("shows /improve help and rejects retired free-form capture arguments", async () => {
		const pi = createMockPi();
		workflowFrictionExtension(pi as never);
		const ctx = createMockCtx();
		const improve = pi._commands.find((command) => command.name === "improve");
		await improve?.handler("help", ctx);
		expect(pi.sendMessage).toHaveBeenLastCalledWith(
			expect.objectContaining({
				content: expect.stringContaining(
					"> /improve help\n\nUsage:\n  /improve",
				),
				display: true,
			}),
			{ triggerTurn: false },
		);
		await improve?.handler("Repeated validation with no edit", ctx);
		expect(pi.sendMessage).toHaveBeenLastCalledWith(
			expect.objectContaining({
				content: expect.stringContaining("/improve select <number-or-id>"),
				display: true,
			}),
			{ triggerTurn: false },
		);
	});

	it("runs /improve report through the repository generator", async () => {
		const pi = createMockPi();
		pi.exec.mockResolvedValueOnce({
			code: 0,
			stdout: "C:/repo/.specs/improvement-reports/2026-07-17.md\n",
			stderr: "",
		});
		workflowFrictionExtension(pi as never);
		const ctx = createMockCtx({ cwd: "C:/repo" });

		await invokeImproveCommand(pi, ctx, "report");

		expect(pi.exec).toHaveBeenCalledWith(
			"python",
			[
				expect.stringMatching(
					/[\\/]pi[\\/]scripts[\\/]improvement-report\.py$/,
				),
				"--repo",
				"C:/repo",
			],
			{ cwd: "C:/repo", timeout: 300_000 },
		);
		expect(improveMessageContent(pi, 0)).toContain(
			"Improvement report: C:/repo/.specs/improvement-reports/2026-07-17.md",
		);
	});

	it("reports bounded /improve report failures without starting discussion", async () => {
		const pi = createMockPi();
		pi.exec.mockResolvedValueOnce({
			code: 1,
			stdout: "",
			stderr: "report failed",
		});
		workflowFrictionExtension(pi as never);
		const ctx = createMockCtx({ cwd: "C:/repo" });

		await invokeImproveCommand(pi, ctx, "report");

		expect(improveMessageContent(pi, 0)).toContain(
			"Improvement report failed: report failed",
		);
	});

	it("lists unresolved candidates and selects one by its displayed ID", async () => {
		const scratch = await fs.mkdtemp(
			path.join(os.tmpdir(), "pi-improve-list-"),
		);
		const previous = process.env.PI_WORKFLOW_FRICTION_DIR;
		process.env.PI_WORKFLOW_FRICTION_DIR = scratch;
		try {
			const ctx = createMockCtx({
				cwd: "/test/dir",
				sessionManager: {
					getSessionId: () => "session-improve-list",
					getEntries: emptySessionEntries,
				},
			});
			const candidate = await seedCommandLearningReview(ctx.cwd);
			const pi = createMockPi();
			workflowFrictionExtension(pi as never);
			const improve = pi._commands.find(
				(command) => command.name === "improve",
			);

			await improve?.handler("list", ctx);
			expect(pi.sendMessage).toHaveBeenCalledTimes(1);
			expect(pi.sendMessage).toHaveBeenLastCalledWith(
				expect.objectContaining({
					customType: "workflow-friction.improve-command",
					display: true,
					content: expect.stringContaining(
						"> /improve list\n\nAvailable improvement candidates (1):\n1. command",
					),
				}),
				{ triggerTurn: false },
			);

			await improve?.handler("select command", ctx);
			expect(pi.sendMessage).toHaveBeenCalledTimes(3);
			expect(pi.sendMessage.mock.calls[1]).toEqual([
				expect.objectContaining({
					display: true,
					content: expect.stringContaining(
						"> /improve select command\n\nSelected improvement candidate 1 of 1: command",
					),
				}),
				{ triggerTurn: false },
			]);
			expect(
				String(pi.sendMessage.mock.calls[2]?.[0]?.content ?? ""),
			).toContain(`Candidate ID: ${candidate.interactionId}`);
			expect(consumeWorkflowSubmission(Date.now())?.text).toBe("/improve");
		} finally {
			if (previous === undefined) delete process.env.PI_WORKFLOW_FRICTION_DIR;
			else process.env.PI_WORKFLOW_FRICTION_DIR = previous;
			await fs.rm(scratch, { recursive: true, force: true });
		}
	});

	it("selects the fourth ranked candidate by its displayed ordinal", async () => {
		const scratch = await fs.mkdtemp(
			path.join(os.tmpdir(), "pi-improve-ordinal-"),
		);
		const previous = process.env.PI_WORKFLOW_FRICTION_DIR;
		process.env.PI_WORKFLOW_FRICTION_DIR = scratch;
		try {
			await seedLearningReviews(ordinalCandidateRecords());
			const ctx = sessionContextFixture("session-improve-ordinal");
			const pi = createMockPi();
			workflowFrictionExtension(pi as never);

			await invokeImproveCommand(pi, ctx, "list");
			expect(improveMessageContent(pi, 0)).toContain("4. da4f5e4b");

			await invokeImproveCommand(pi, ctx, "select 4");
			expect(improveMessageContent(pi, 1)).toContain(
				"> /improve select 4\n\nSelected improvement candidate 4 of 4: da4f5e4b",
			);
			expect(improveMessageContent(pi, 2)).toContain(
				"Candidate ID: interaction-da4f5e4b",
			);
			expect(consumeWorkflowSubmission(Date.now())?.text).toBe("/improve");
		} finally {
			if (previous === undefined) delete process.env.PI_WORKFLOW_FRICTION_DIR;
			else process.env.PI_WORKFLOW_FRICTION_DIR = previous;
			await fs.rm(scratch, { recursive: true, force: true });
		}
	});

	it("resolves numeric selection against the displayed snapshot after reranking", async () => {
		const scratch = await fs.mkdtemp(
			path.join(os.tmpdir(), "pi-improve-snapshot-"),
		);
		const previous = process.env.PI_WORKFLOW_FRICTION_DIR;
		process.env.PI_WORKFLOW_FRICTION_DIR = scratch;
		try {
			const records = ordinalCandidateRecords();
			await seedLearningReviews(records);
			const ctx = sessionContextFixture("session-improve-snapshot");
			const pi = createMockPi();
			workflowFrictionExtension(pi as never);

			await invokeImproveCommand(pi, ctx, "list");
			expect(improveMessageContent(pi, 0)).toContain("1. 11111111");
			if (records[1]?.review) records[1].review.impact = "safety";
			await seedLearningReviews(records);

			await invokeImproveCommand(pi, ctx, "select 1");
			expect(improveMessageContent(pi, 1)).toContain(
				"Selected improvement candidate 1 of 4: 11111111",
			);
			expect(improveMessageContent(pi, 2)).toContain(
				"Candidate ID: interaction-11111111",
			);
			expect(consumeWorkflowSubmission(Date.now())?.text).toBe("/improve");
		} finally {
			if (previous === undefined) delete process.env.PI_WORKFLOW_FRICTION_DIR;
			else process.env.PI_WORKFLOW_FRICTION_DIR = previous;
			await fs.rm(scratch, { recursive: true, force: true });
		}
	});

	it("rejects numeric selection without a displayed snapshot", async () => {
		const scratch = await fs.mkdtemp(
			path.join(os.tmpdir(), "pi-improve-no-snapshot-"),
		);
		const previous = process.env.PI_WORKFLOW_FRICTION_DIR;
		process.env.PI_WORKFLOW_FRICTION_DIR = scratch;
		try {
			await seedLearningReviews(ordinalCandidateRecords());
			const ctx = sessionContextFixture("session-improve-no-snapshot");
			const pi = createMockPi();
			workflowFrictionExtension(pi as never);

			await invokeImproveCommand(pi, ctx, "select 1");

			expect(pi.sendMessage).toHaveBeenCalledTimes(1);
			expect(improveMessageContent(pi, 0)).toContain(
				"No displayed improvement list is available in this session. Run /improve list",
			);
		} finally {
			if (previous === undefined) delete process.env.PI_WORKFLOW_FRICTION_DIR;
			else process.env.PI_WORKFLOW_FRICTION_DIR = previous;
			await fs.rm(scratch, { recursive: true, force: true });
		}
	});

	it("rejects a stale numeric snapshot entry", async () => {
		const scratch = await fs.mkdtemp(
			path.join(os.tmpdir(), "pi-improve-stale-snapshot-"),
		);
		const previous = process.env.PI_WORKFLOW_FRICTION_DIR;
		process.env.PI_WORKFLOW_FRICTION_DIR = scratch;
		try {
			const records = ordinalCandidateRecords();
			await seedLearningReviews(records);
			const ctx = sessionContextFixture("session-improve-stale-snapshot");
			const pi = createMockPi();
			workflowFrictionExtension(pi as never);
			await invokeImproveCommand(pi, ctx, "list");
			await seedLearningReviews(records.slice(1));

			await invokeImproveCommand(pi, ctx, "select 1");

			expect(pi.sendMessage).toHaveBeenCalledTimes(2);
			expect(improveMessageContent(pi, 1)).toContain(
				"interaction-11111111 from displayed number 1 is no longer eligible",
			);
		} finally {
			if (previous === undefined) delete process.env.PI_WORKFLOW_FRICTION_DIR;
			else process.env.PI_WORKFLOW_FRICTION_DIR = previous;
			await fs.rm(scratch, { recursive: true, force: true });
		}
	});

	it("turns a short correction into a quarantined improvement discussion", async () => {
		const scratch = await fs.mkdtemp(
			path.join(os.tmpdir(), "pi-learning-auto-"),
		);
		const previous = process.env.PI_WORKFLOW_FRICTION_DIR;
		process.env.PI_WORKFLOW_FRICTION_DIR = scratch;
		try {
			const ctx = createMockCtx({
				cwd: "/test/dir",
				sessionManager: {
					getSessionId: () => "session-auto-learning",
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
			const settled = pi._getHook("agent_settled")[0]?.handler;
			await beforeAgent({ prompt: "No, use pnpm instead." }, ctx);
			await settled({}, ctx);
			await waitForPath(path.join(scratch, "reviews.jsonl"));
			await waitForPathRemoval(path.join(scratch, "worker.lock"));
			expect(pi.sendMessage).not.toHaveBeenCalled();

			const command = pi._commands.find((item) => item.name === "improve");
			await command?.handler("", ctx);
			expect(pi.sendMessage).toHaveBeenCalledTimes(1);
			const prompt = String(pi.sendMessage.mock.calls[0]?.[0]?.content ?? "");
			expect(prompt).toContain("Use the full 1-3-1 format");
			expect(prompt).toContain(
				"Questions and comments continue the discussion",
			);
			expect(prompt).toContain(
				"Proposed change: Use pnpm for Pi TypeScript work.",
			);
			expect(prompt).toContain(
				"Cross-session context from the previous 15 days",
			);
			expect(await readCurrentLearningDecisions()).toEqual([]);
		} finally {
			if (previous === undefined) delete process.env.PI_WORKFLOW_FRICTION_DIR;
			else process.env.PI_WORKFLOW_FRICTION_DIR = previous;
			await fs.rm(scratch, { recursive: true, force: true });
		}
	});

	it("adds target-skill usage to the improvement evidence", async () => {
		const scratch = await fs.mkdtemp(
			path.join(os.tmpdir(), "pi-improve-skill-"),
		);
		const previousFriction = process.env.PI_WORKFLOW_FRICTION_DIR;
		const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
		process.env.PI_WORKFLOW_FRICTION_DIR = path.join(scratch, "friction");
		process.env.PI_CODING_AGENT_DIR = path.join(scratch, "agent");
		try {
			await fs.mkdir(path.join(scratch, "agent", "sessions"), {
				recursive: true,
			});
			const ctx = createMockCtx({
				cwd: "/test/dir",
				sessionManager: {
					getSessionDir: () => path.join(scratch, "agent", "sessions"),
				},
			});
			await seedCommandLearningReview(ctx.cwd, "project", "typescript");
			const pi = createMockPi();
			workflowFrictionExtension(pi as never);
			const improve = pi._commands.find(
				(command) => command.name === "improve",
			);
			await improve?.handler("", ctx);
			const prompt = String(pi.sendMessage.mock.calls[0]?.[0]?.content ?? "");
			expect(prompt).toContain(
				'"candidateUsage":{"target":{"kind":"skill","name":"typescript"},"state":"zero","source":"skill-stats","calls30d":0,"manualReadCandidates":0}',
			);
		} finally {
			if (previousFriction === undefined)
				delete process.env.PI_WORKFLOW_FRICTION_DIR;
			else process.env.PI_WORKFLOW_FRICTION_DIR = previousFriction;
			if (previousAgentDir === undefined)
				delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
			await fs.rm(scratch, { recursive: true, force: true });
		}
	});

	it("selects the higher-usage candidate before an older lower-usage candidate", async () => {
		const scratch = await fs.mkdtemp(
			path.join(os.tmpdir(), "pi-improve-ranking-"),
		);
		const previousFriction = process.env.PI_WORKFLOW_FRICTION_DIR;
		const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
		process.env.PI_WORKFLOW_FRICTION_DIR = path.join(scratch, "friction");
		process.env.PI_CODING_AGENT_DIR = path.join(scratch, "agent");
		try {
			const cwd = path.join(scratch, "workspace");
			const sessionDir = path.join(scratch, "sessions");
			for (const skill of ["high-use", "low-use"]) {
				const skillDir = path.join(scratch, "agent", "skills", skill);
				await fs.mkdir(skillDir, { recursive: true });
				await fs.writeFile(
					path.join(skillDir, "SKILL.md"),
					`---\nname: ${skill}\ndescription: ${skill} fixture\n---\n`,
					"utf8",
				);
			}
			await fs.mkdir(sessionDir, { recursive: true });
			await fs.writeFile(
				path.join(sessionDir, "2026-07-14T00-00-00-000Z_ranking.jsonl"),
				[
					["high-use", "high-1"],
					["high-use", "high-2"],
					["low-use", "low-1"],
				]
					.map(([skill, turnId]) =>
						JSON.stringify({
							type: "custom",
							customType: "skill-load",
							data: {
								skill,
								source: "explicit_slash_command",
								timestamp: "2026-07-14T00:00:00.000Z",
								turnId,
							},
						}),
					)
					.join("\n"),
				"utf8",
			);
			const low = commandLearningReviewRecord(cwd, "project", "low-use");
			low.interactionId = "candidate-low";
			low.reviewedAt = "2026-07-12T00:00:00.000Z";
			if (low.review) low.review.impact = "efficiency";
			const high = commandLearningReviewRecord(cwd, "project", "high-use");
			high.interactionId = "candidate-high";
			high.reviewedAt = "2026-07-13T00:00:00.000Z";
			if (high.review) high.review.impact = "efficiency";
			const reviewsPath = path.join(
				path.dirname(learningDecisionsPath()),
				"reviews.jsonl",
			);
			await fs.mkdir(path.dirname(reviewsPath), { recursive: true });
			await fs.writeFile(
				reviewsPath,
				`${JSON.stringify(low)}\n${JSON.stringify(high)}\n`,
				"utf8",
			);
			const ctx = createMockCtx({
				cwd,
				sessionManager: { getSessionDir: () => sessionDir },
			});
			const pi = createMockPi();
			workflowFrictionExtension(pi as never);
			await pi._commands
				.find((command) => command.name === "improve")
				?.handler("", ctx);
			const prompt = String(pi.sendMessage.mock.calls[0]?.[0]?.content ?? "");
			expect(prompt).toContain("Candidate ID: candidate-high");
			expect(prompt).toContain(
				"Ranking reason: highest observed 30-day usage ROI (2 calls)",
			);
		} finally {
			if (previousFriction === undefined)
				delete process.env.PI_WORKFLOW_FRICTION_DIR;
			else process.env.PI_WORKFLOW_FRICTION_DIR = previousFriction;
			if (previousAgentDir === undefined)
				delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
			await fs.rm(scratch, { recursive: true, force: true });
		}
	});

	it("does not classify an initial instruction as a correction", async () => {
		const scratch = await fs.mkdtemp(
			path.join(os.tmpdir(), "pi-learning-initial-"),
		);
		const previous = process.env.PI_WORKFLOW_FRICTION_DIR;
		process.env.PI_WORKFLOW_FRICTION_DIR = scratch;
		try {
			const ctx = createMockCtx({
				cwd: "/test/dir",
				sessionManager: {
					getSessionId: () => "session-initial",
					getEntries: emptySessionEntries,
				},
			});
			const pi = createMockPi();
			workflowFrictionExtension(pi as never);
			const beforeAgent = pi._getHook("before_agent_start")[0]?.handler;
			const settled = pi._getHook("agent_settled")[0]?.handler;
			await beforeAgent({ prompt: "Do not use npm for this task." }, ctx);
			await settled({}, ctx);
			expect(pi.exec).not.toHaveBeenCalled();
		} finally {
			if (previous === undefined) delete process.env.PI_WORKFLOW_FRICTION_DIR;
			else process.env.PI_WORKFLOW_FRICTION_DIR = previous;
			await fs.rm(scratch, { recursive: true, force: true });
		}
	});

	it("captures an explicit remember request on the first turn", async () => {
		const scratch = await fs.mkdtemp(
			path.join(os.tmpdir(), "pi-learning-remember-"),
		);
		const previous = process.env.PI_WORKFLOW_FRICTION_DIR;
		process.env.PI_WORKFLOW_FRICTION_DIR = scratch;
		try {
			const ctx = createMockCtx({
				cwd: "/test/dir",
				sessionManager: {
					getSessionId: () => "session-remember",
					getEntries: emptySessionEntries,
				},
			});
			const pi = createMockPi();
			const reviewer = fakeReviewer();
			workflowFrictionExtension(pi as never, { reviewer });
			const beforeAgent = pi._getHook("before_agent_start")[0]?.handler;
			const settled = pi._getHook("agent_settled")[0]?.handler;
			await beforeAgent(
				{ prompt: "Please remember that Pi TypeScript work uses pnpm." },
				ctx,
			);
			await settled({}, ctx);
			const reviewPath = path.join(scratch, "reviews.jsonl");
			await waitForPath(reviewPath);
			const review = JSON.parse(
				(await fs.readFile(reviewPath, "utf8")).trim(),
			) as StoredReviewRecord;
			expect(review.selectionReasons).toContain("explicit_learning_request");
			await waitForPathRemoval(path.join(scratch, "worker.lock"));
		} finally {
			if (previous === undefined) delete process.env.PI_WORKFLOW_FRICTION_DIR;
			else process.env.PI_WORKFLOW_FRICTION_DIR = previous;
			await fs.rm(scratch, { recursive: true, force: true });
		}
	});

	it("does not authorize a decision from conversational Apply input", async () => {
		const scratch = await fs.mkdtemp(
			path.join(os.tmpdir(), "pi-learning-conversation-"),
		);
		const previous = process.env.PI_WORKFLOW_FRICTION_DIR;
		process.env.PI_WORKFLOW_FRICTION_DIR = scratch;
		try {
			const ctx = createMockCtx({ cwd: "/test/dir" });
			const candidate = await seedCommandLearningReview(ctx.cwd);
			const pi = createMockPi();
			workflowFrictionExtension(pi as never);
			await invokeImproveCommand(pi, ctx, "");
			const input = pi._getHook("input")[0]?.handler;
			await input({ source: "interactive", text: "Apply" }, ctx);

			await expect(
				pi._getTool("learning_candidate_decide")?.execute(
					"conversation-call",
					{
						candidateId: candidate.interactionId,
						decision: "applied",
						approvedText: "Use pnpm.",
						targetPaths: ["pi/AGENTS.md"],
						validation: "Validated.",
						rollback: "Revert the edit.",
					},
					undefined,
					undefined,
					ctx,
				),
			).rejects.toThrow(/explicit \/improve decide command/);
			expect(await readCurrentLearningDecisions()).toEqual([]);
		} finally {
			if (previous === undefined) delete process.env.PI_WORKFLOW_FRICTION_DIR;
			else process.env.PI_WORKFLOW_FRICTION_DIR = previous;
			await fs.rm(scratch, { recursive: true, force: true });
		}
	});

	it("captures an explicit apply command and triggers execution", async () => {
		const scratch = await fs.mkdtemp(
			path.join(os.tmpdir(), "pi-learning-apply-"),
		);
		const previous = process.env.PI_WORKFLOW_FRICTION_DIR;
		process.env.PI_WORKFLOW_FRICTION_DIR = scratch;
		try {
			const ctx = createMockCtx({ cwd: "/test/dir" });
			const candidate = await seedCommandLearningReview(ctx.cwd);
			const pi = createMockPi();
			workflowFrictionExtension(pi as never);
			await invokeImproveCommand(pi, ctx, "");
			await invokeImproveCommand(pi, ctx, "decide apply");

			expect(improveMessageContent(pi, 1)).toContain(
				"> /improve decide apply\n\nCaptured apply decision",
			);
			expect(improveMessageContent(pi, 2)).toContain(
				"Captured command: /improve decide apply",
			);
			expect(pi.sendMessage.mock.calls[2]?.[0]).toMatchObject({
				customType: "workflow-friction.improve-decision",
				display: false,
			});
			expect(pi.sendMessage.mock.calls[2]?.[1]).toEqual({
				triggerTurn: true,
				deliverAs: "followUp",
			});
			await pi._getTool("learning_candidate_decide")?.execute(
				"apply-call",
				{
					candidateId: candidate.interactionId,
					decision: "applied",
					approvedText: "Use pnpm.",
					targetPaths: ["pi/AGENTS.md"],
					validation: "Validated the Pi workflow.",
					rollback: "Revert the candidate-specific edit.",
				},
				undefined,
				undefined,
				ctx,
			);
			expect((await readCurrentLearningDecisions())[0]?.decisionText).toBe(
				"/improve decide apply",
			);
		} finally {
			if (previous === undefined) delete process.env.PI_WORKFLOW_FRICTION_DIR;
			else process.env.PI_WORKFLOW_FRICTION_DIR = previous;
			await fs.rm(scratch, { recursive: true, force: true });
		}
	});

	it("records an explicit edited decision with validation and rollback", async () => {
		const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "pi-learning-"));
		const previous = process.env.PI_WORKFLOW_FRICTION_DIR;
		process.env.PI_WORKFLOW_FRICTION_DIR = scratch;
		try {
			const ctx = createMockCtx({ cwd: "/test/dir" });
			const candidate = await seedCommandLearningReview(ctx.cwd);
			const pi = createMockPi();
			workflowFrictionExtension(pi as never);
			await invokeImproveCommand(pi, ctx, "");
			await invokeImproveCommand(
				pi,
				ctx,
				"decide edit include focused validation",
			);
			const decideTool = pi._getTool("learning_candidate_decide");
			await decideTool?.execute(
				"decision-call",
				{
					candidateId: candidate.interactionId,
					decision: "applied",
					approvedText: "Use pnpm and run the focused Pi tests.",
					targetPaths: ["pi/AGENTS.md"],
					validation: "Reloaded Pi and verified the instruction was present.",
					rollback: "Revert the candidate-specific edit in pi/AGENTS.md.",
				},
				undefined,
				undefined,
				ctx,
			);
			expect((await readCurrentLearningDecisions())[0]).toMatchObject({
				candidateId: candidate.interactionId,
				decision: "applied",
				decisionText: "/improve decide edit include focused validation",
				approvedText: "Use pnpm and run the focused Pi tests.",
				targetPaths: ["pi/AGENTS.md"],
				experimentId: `experiment-${candidate.interactionId}`,
			});
			const experimentLog = await fs.readFile(
				path.join(scratch, "experiments.jsonl"),
				"utf8",
			);
			expect(experimentLog).toContain(`experiment-${candidate.interactionId}`);
		} finally {
			if (previous === undefined) delete process.env.PI_WORKFLOW_FRICTION_DIR;
			else process.env.PI_WORKFLOW_FRICTION_DIR = previous;
			await fs.rm(scratch, { recursive: true, force: true });
		}
	});

	it("records a skipped candidate without an experiment", async () => {
		const scratch = await fs.mkdtemp(
			path.join(os.tmpdir(), "pi-learning-skip-"),
		);
		const previous = process.env.PI_WORKFLOW_FRICTION_DIR;
		process.env.PI_WORKFLOW_FRICTION_DIR = scratch;
		try {
			const ctx = createMockCtx({ cwd: "/test/dir" });
			const candidate = await seedCommandLearningReview(ctx.cwd, "user");
			const pi = createMockPi();
			workflowFrictionExtension(pi as never);
			const command = pi._commands.find((item) => item.name === "improve");
			await command?.handler("", ctx);
			await command?.handler("decide skip this was specific to one task", ctx);
			expect(improveMessageContent(pi, 1)).toContain(
				"> /improve decide skip this was specific to one task\n\nCaptured skip decision",
			);
			expect(improveMessageContent(pi, 2)).toContain(
				"Captured detail: this was specific to one task",
			);
			const decideTool = pi._getTool("learning_candidate_decide");
			await expect(
				decideTool?.execute(
					"cross-workspace-call",
					{
						candidateId: candidate.interactionId,
						decision: "skipped",
						targetPaths: [],
						reason: "Wrong workspace.",
					},
					undefined,
					undefined,
					createMockCtx({ cwd: "/other/project" }),
				),
			).rejects.toThrow(/not found/);
			await decideTool?.execute(
				"decision-call",
				{
					candidateId: candidate.interactionId,
					decision: "skipped",
					targetPaths: [],
					reason: "This model-supplied reason is ignored.",
				},
				undefined,
				undefined,
				ctx,
			);
			expect((await readCurrentLearningDecisions())[0]).toMatchObject({
				candidateId: candidate.interactionId,
				decision: "skipped",
				reason: "this was specific to one task",
				decisionText: "/improve decide skip this was specific to one task",
			});
			await expect(
				fs.access(path.join(scratch, "experiments.jsonl")),
			).rejects.toThrow();
		} finally {
			if (previous === undefined) delete process.env.PI_WORKFLOW_FRICTION_DIR;
			else process.env.PI_WORKFLOW_FRICTION_DIR = previous;
			await fs.rm(scratch, { recursive: true, force: true });
		}
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
			const ctx = sessionContextFixture("session-top-level");
			await emitTopLevelInteractionEvents(ctx);
			expectTopLevelInteractionEvents(
				await readOrchestrationInteractionEvents(metricsDir),
			);
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

import { describe, expect, it, vi } from "vitest";

const { resolveCommitPlanningModelMock } = vi.hoisted(() => ({
	resolveCommitPlanningModelMock: vi.fn(),
}));

vi.mock("../lib/model-routing", () => ({
	resolveCommitPlanningModelFromRegistry: resolveCommitPlanningModelMock,
}));

import {
	buildStagingPlan,
	chooseFilesToCommit,
	confirmCommitMessage,
	filterCommitSafeFiles,
	formatCommitPlannerFailure,
	formatCommitPlanWarnings,
	getCommitRuntimePathReason,
	isBlockingSecretReviewClassification,
	normalizeCommitSubject,
	parseCommitPlan,
	parseSecretReviewResult,
	parseUntrackedClassifierResult,
	proposeCommitMessage,
	validateCommitPlan,
	validateSecretReviewCoverage,
} from "../extensions/workflow-commands.ts";

describe("commit planner warnings", () => {
	it("sanitizes and bounds the fallback reason", () => {
		const message = formatCommitPlannerFailure(
			new Error(`provider token=secret-value\n${"x".repeat(400)}`),
		);
		expect(message).toContain(
			"Commit planner failed: Error: provider token=[redacted]",
		);
		expect(message).not.toContain("secret-value");
		expect(message.length).toBeLessThanOrEqual(323);
	});

	it("trims warnings and drops empty entries before display", () => {
		expect(
			formatCommitPlanWarnings([
				"  Review generated files before committing.  ",
				"",
				"   ",
			]),
		).toEqual(["Planner warning: Review generated files before committing."]);
		expect(formatCommitPlanWarnings(undefined)).toEqual([]);
	});
});

describe("parseCommitPlan", () => {
	it("parses JSON wrapped in assistant prose", () => {
		const text = `Here is the plan:\n{"groups":[{"files":["a.ts"],"subject":"feat(pi): add planner"}]}`;
		const plan = parseCommitPlan(text);
		expect(plan.groups).toHaveLength(1);
		expect(plan.groups[0]?.files).toEqual(["a.ts"]);
	});

	it("throws when groups are missing", () => {
		expect(() => parseCommitPlan('{"warnings":[]}')).toThrow(
			/no commit groups/i,
		);
	});

	it("normalizes planner subjects onto one line", () => {
		const plan = parseCommitPlan(
			JSON.stringify({
				groups: [
					{
						files: ["a.ts"],
						subject: "style(status):\n dim context token counts",
					},
				],
			}),
		);
		expect(plan.groups[0]?.subject).toBe(
			"style(status): dim context token counts",
		);
	});
});

describe("parseSecretReviewResult", () => {
	it("accepts false positives so commit processing can continue", () => {
		const result = parseSecretReviewResult(
			JSON.stringify({
				findings: [
					{
						id: 1,
						classification: "false_positive",
						reason: "Type annotation with no credential value.",
					},
				],
			}),
		);

		expect(result.findings[0]?.classification).toBe("false_positive");
		expect(isBlockingSecretReviewClassification("false_positive")).toBe(false);
		expect(isBlockingSecretReviewClassification("likely_secret")).toBe(true);
		expect(isBlockingSecretReviewClassification("ambiguous")).toBe(true);
	});

	it("rejects unknown secret-review classifications", () => {
		expect(() =>
			parseSecretReviewResult(
				JSON.stringify({
					findings: [
						{
							id: 1,
							classification: "safe",
							reason: "Unrecognized classification.",
						},
					],
				}),
			),
		).toThrow("Secret reviewer returned invalid findings");
	});

	it("requires one exact classification for every candidate", () => {
		const candidate = {
			path: "example.ts",
			label: "Hardcoded password/token/secret/key",
			line: 7,
			match: "accessToken: string",
			context: "interface Auth { accessToken: string }",
		};
		const reviewed = {
			id: 1,
			classification: "false_positive" as const,
			reason: "Type annotation with no credential value.",
		};

		expect(() =>
			validateSecretReviewCoverage([reviewed], [candidate]),
		).not.toThrow();
		expect(() => validateSecretReviewCoverage([], [candidate])).toThrow(
			"classify every candidate exactly once",
		);
		expect(() =>
			validateSecretReviewCoverage([reviewed, reviewed], [candidate]),
		).toThrow("classify every candidate exactly once");
		expect(() =>
			validateSecretReviewCoverage([{ ...reviewed, id: 2 }], [candidate]),
		).toThrow("classify every candidate exactly once");
	});
});

describe("normalizeCommitSubject", () => {
	it("collapses all whitespace runs, including newlines", () => {
		expect(
			normalizeCommitSubject("style(status):\n dim context token counts"),
		).toBe("style(status): dim context token counts");
	});
});

describe("validateCommitPlan", () => {
	it("accepts a valid full-coverage plan", () => {
		const plan = {
			groups: [
				{ files: ["a.ts"], subject: "feat(pi): add planner" },
				{ files: ["b.ts"], subject: "test(pi): cover planner" },
			],
		};
		expect(() => validateCommitPlan(plan, ["a.ts", "b.ts"])).not.toThrow();
	});

	it("rejects duplicate files across groups", () => {
		const plan = {
			groups: [
				{ files: ["a.ts"], subject: "feat(pi): add planner" },
				{ files: ["a.ts"], subject: "test(pi): cover planner" },
			],
		};
		expect(() => validateCommitPlan(plan, ["a.ts"])).toThrow(
			/multiple groups/i,
		);
	});

	it("rejects omitted changed files", () => {
		const plan = {
			groups: [{ files: ["a.ts"], subject: "feat(pi): add planner" }],
		};
		expect(() => validateCommitPlan(plan, ["a.ts", "b.ts"])).toThrow(
			/omitted changed files/i,
		);
	});

	it.each([
		"deps(pi): update packages",
		"style(pi): normalize runtime icon spacing",
	])("accepts supported commit subject %s", (subject) => {
		const plan = {
			groups: [{ files: ["a.ts"], subject }],
		};
		expect(() => validateCommitPlan(plan, ["a.ts"])).not.toThrow();
	});

	it("accepts normalized wrapped dependency commit subjects", () => {
		const plan = parseCommitPlan(
			JSON.stringify({
				groups: [
					{
						files: ["a.ts"],
						subject: "deps(teams):\n update Kubernetes platform Helm charts",
					},
				],
			}),
		);
		expect(plan.groups[0]?.subject).toBe(
			"deps(teams): update Kubernetes platform Helm charts",
		);
		expect(() => validateCommitPlan(plan, ["a.ts"])).not.toThrow();
	});

	it("rejects invalid conventional commit subjects", () => {
		const plan = {
			groups: [{ files: ["a.ts"], subject: "Add planner" }],
		};
		expect(() => validateCommitPlan(plan, ["a.ts"])).toThrow(
			/invalid conventional commit/i,
		);
	});
});

// ---------------------------------------------------------------------------
// confirmCommitMessage — cancellation safety
// ---------------------------------------------------------------------------

describe("confirmCommitMessage", () => {
	const baseMessage = { subject: "feat(pi): add something" };
	const files = ["a.ts"];
	const stat = "a.ts | 5 ++-";

	it("returns the original message without prompting", async () => {
		const result = await confirmCommitMessage(
			{},
			baseMessage,
			files,
			stat,
			stat,
		);
		expect(result).toEqual(baseMessage);
	});

	it("preserves body without prompting", async () => {
		const withBody = {
			subject: "feat(pi): original",
			body: "Detailed context.",
		};
		const result = await confirmCommitMessage({}, withBody, files, stat, stat);
		expect(result).toEqual(withBody);
	});

	it("throws when subject violates conventional commit format", async () => {
		await expect(
			confirmCommitMessage(
				{},
				{ subject: "This is not conventional" },
				files,
				stat,
				stat,
			),
		).rejects.toThrow(/conventional commit format/i);
	});

	it("accepts wip commit subjects", async () => {
		const message = { subject: "wip: save tui latency instrumentation" };
		const result = await confirmCommitMessage({}, message, files, stat, stat);
		expect(result).toEqual(message);
	});
});

// ---------------------------------------------------------------------------
// chooseFilesToCommit — cancellation safety
// ---------------------------------------------------------------------------

describe("commit runtime path filters", () => {
	it("excludes runtime cache, logs, traces, jsonl, and database files", () => {
		const files = [
			"pi/cache/models-dev-api.json",
			"pi/prompt-routing/logs/routing_log.jsonl",
			"pi/prompt-routing/router.py",
			"tmp/session.duckdb",
			"notes/change.md",
		];
		const result = filterCommitSafeFiles(files);
		expect(result.included).toEqual([
			"notes/change.md",
			"pi/prompt-routing/router.py",
		]);
		expect(result.excluded.map((item) => item.file)).toEqual([
			"pi/cache/models-dev-api.json",
			"pi/prompt-routing/logs/routing_log.jsonl",
			"tmp/session.duckdb",
		]);
		expect(getCommitRuntimePathReason("pi/cache/models-dev-api.json")).toBe(
			"Pi runtime cache",
		);
	});
});

describe("untracked classifier helpers", () => {
	const untracked = [
		"pi/inspect/snapshots/session.json",
		"pi/extensions/source.ts",
	];

	it("accepts full coverage and splits low confidence decisions", () => {
		const classifications = [
			{
				path: "pi/inspect/snapshots/session.json",
				decision: "ignore",
				confidence: 96,
				reason: "Generated runtime snapshot.",
				gitignorePattern: "pi/inspect/snapshots/",
			},
			{
				path: "pi/extensions/source.ts",
				decision: "do_not_ignore",
				confidence: 84,
				reason: "Source file, but confidence is intentionally low.",
			},
		];
		const result = parseUntrackedClassifierResult(
			JSON.stringify({ classifications }),
			untracked,
		);
		expect(result.accepted.map((item) => item.path)).toEqual([
			"pi/inspect/snapshots/session.json",
		]);
		expect(result.needsUserDecision.map((item) => item.path)).toEqual([
			"pi/extensions/source.ts",
		]);

		const arrayResult = parseUntrackedClassifierResult(
			JSON.stringify(classifications),
			untracked,
		);
		expect(arrayResult).toEqual(result);
	});

	it("rejects invalid decisions, duplicate paths, and incomplete coverage", () => {
		expect(() =>
			parseUntrackedClassifierResult(
				JSON.stringify({
					classifications: [
						{
							path: untracked[0],
							decision: "ask_user",
							confidence: 90,
							reason: "Invalid action.",
						},
					],
				}),
				untracked,
			),
		).toThrow(/invalid decision/i);
		expect(() =>
			parseUntrackedClassifierResult(
				JSON.stringify({
					classifications: [
						{
							path: untracked[0],
							decision: "ignore",
							confidence: 90,
							reason: "Generated.",
						},
						{
							path: untracked[0],
							decision: "ignore",
							confidence: 91,
							reason: "Generated.",
						},
					],
				}),
				untracked,
			),
		).toThrow(/duplicate/i);
		expect(() =>
			parseUntrackedClassifierResult(
				JSON.stringify({
					classifications: [
						{
							path: untracked[0],
							decision: "ignore",
							confidence: 90,
							reason: "Generated.",
						},
					],
				}),
				untracked,
			),
		).toThrow(/omitted/i);
	});

	it("rejects nonnumeric confidence", () => {
		expect(() =>
			parseUntrackedClassifierResult(
				JSON.stringify({
					classifications: untracked.map((path) => ({
						path,
						decision: "do_not_ignore",
						confidence: "high",
						reason: "Invalid confidence.",
					})),
				}),
				untracked,
			),
		).toThrow(/confidence/i);
	});
});

describe("staging strategy helpers", () => {
	it("omits ignored paths from git add and plans index-only removal", () => {
		const plan = buildStagingPlan({
			files: ["src/app.ts", "pi/inspect/snapshots/session.json"],
			allCommittableFiles: ["src/app.ts"],
			ignoredFiles: ["pi/inspect/snapshots/session.json"],
			trackedIgnoredFiles: ["pi/inspect/snapshots/session.json"],
		});
		expect(plan.addArgs).toEqual(["add", "-A", "--", "src/app.ts"]);
		expect(plan.rmCachedArgs).toEqual([
			"rm",
			"--cached",
			"--ignore-unmatch",
			"--",
			"pi/inspect/snapshots/session.json",
		]);
		expect(plan.addArgs).not.toContain("-f");
	});

	it("uses broad staging only for the full safe candidate set", () => {
		const files = Array.from(
			{ length: 21 },
			(_, index) => `src/file-${index}.ts`,
		);
		expect(
			buildStagingPlan({ files, allCommittableFiles: files }).addArgs,
		).toEqual(["add", "."]);
		expect(
			buildStagingPlan({
				files: [files[0] ?? "src/file-0.ts"],
				allCommittableFiles: files,
			}).addArgs,
		).toEqual(["add", "-A", "--", files[0]]);
		expect(
			buildStagingPlan({
				files: ["src/app.ts", "pi/inspect/snapshots/session.json"],
				allCommittableFiles: ["src/app.ts"],
				ignoredFiles: ["pi/inspect/snapshots/session.json"],
			}).useBroadAdd,
		).toBe(false);
	});
});

describe("chooseFilesToCommit", () => {
	const changed = ["a.ts", "b.ts", "c.ts"];
	const staged = ["a.ts"];

	it("returns requested files when files are explicitly specified", async () => {
		const result = await chooseFilesToCommit({}, changed, staged, ["b.ts"]);
		expect(result.cancelled).toBe(false);
		expect(result.files).toEqual(["b.ts"]);
		expect(result.stageAll).toBe(true);
	});

	it("returns all changed files when nothing is staged", async () => {
		const result = await chooseFilesToCommit({}, changed, [], []);
		expect(result.cancelled).toBe(false);
		expect(result.files).toEqual(changed);
		expect(result.stageAll).toBe(true);
	});

	it("returns all changed files even when some files are already staged", async () => {
		const result = await chooseFilesToCommit({}, changed, staged, []);
		expect(result.cancelled).toBe(false);
		expect(result.files).toEqual(changed);
		expect(result.stageAll).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// parseCommitPlan multi-group
// ---------------------------------------------------------------------------

describe("parseCommitPlan multi-group", () => {
	it("parses the first complete JSON object when extra text follows", () => {
		const json = `${JSON.stringify({
			groups: [{ files: ["src/api.ts"], subject: "feat(pi): add planner" }],
		})}\n${JSON.stringify({ note: "extra model output" })}`;
		const plan = parseCommitPlan(json);
		expect(plan.groups).toHaveLength(1);
		expect(plan.groups[0]?.subject).toBe("feat(pi): add planner");
	});

	it("parses a 3-group plan with body and warnings", () => {
		const json = JSON.stringify({
			groups: [
				{
					files: ["src/api.ts", "src/db.ts"],
					subject: "feat(pi): add commit planner",
					body: "Implements LLM-based commit grouping",
				},
				{
					files: ["src/api.test.ts"],
					subject: "test(pi): cover commit planner",
				},
				{ files: ["README.md"], subject: "docs(pi): document commit planner" },
			],
			warnings: ["large diff detected"],
		});
		const plan = parseCommitPlan(json);
		expect(plan.groups).toHaveLength(3);
		expect(plan.groups[0]?.body).toBe("Implements LLM-based commit grouping");
		expect(Array.isArray(plan.warnings)).toBe(true);
	});

	it("rejects a group with an empty files array", () => {
		const json = JSON.stringify({
			groups: [{ files: [], subject: "feat(pi): add planner" }],
		});
		expect(() => parseCommitPlan(json)).toThrow(/without valid files/i);
	});

	it("rejects a group with non-string file entries", () => {
		const json = JSON.stringify({
			groups: [{ files: [42], subject: "feat(pi): add planner" }],
		});
		expect(() => parseCommitPlan(json)).toThrow(/without valid files/i);
	});
});

// ---------------------------------------------------------------------------
// validateCommitPlan multi-group sequential staging
// ---------------------------------------------------------------------------

describe("validateCommitPlan multi-group sequential staging", () => {
	it("accepts a 3-group plan covering all changed files", () => {
		const plan = {
			groups: [
				{
					files: ["src/api.ts", "src/db.ts"],
					subject: "feat(pi): add commit planner",
				},
				{
					files: ["src/api.test.ts"],
					subject: "test(pi): cover commit planner",
				},
				{ files: ["README.md"], subject: "docs(pi): document commit planner" },
			],
		};
		const changedFiles = [
			"src/api.ts",
			"src/db.ts",
			"src/api.test.ts",
			"README.md",
		];
		expect(() => validateCommitPlan(plan, changedFiles)).not.toThrow();
	});

	it("rejects a group referencing a file not in changedFiles", () => {
		const plan = {
			groups: [
				{ files: ["src/api.ts"], subject: "feat(pi): add api" },
				{ files: ["untracked.ts"], subject: "test(pi): cover api" },
			],
		};
		expect(() => validateCommitPlan(plan, ["src/api.ts"])).toThrow(
			/unknown file/i,
		);
	});

	it("preserves group order for sequential staging", () => {
		const plan = {
			groups: [
				{ files: ["a.ts"], subject: "feat(pi): first commit" },
				{ files: ["b.ts"], subject: "fix(pi): second commit" },
				{ files: ["c.ts"], subject: "chore(pi): third commit" },
			],
		};
		expect(() =>
			validateCommitPlan(plan, ["a.ts", "b.ts", "c.ts"]),
		).not.toThrow();
		expect(plan.groups.map((g) => g.subject)).toEqual([
			"feat(pi): first commit",
			"fix(pi): second commit",
			"chore(pi): third commit",
		]);
	});
});

// ---------------------------------------------------------------------------
// proposeCommitMessage — planner-fallback path
// ---------------------------------------------------------------------------

describe("proposeCommitMessage", () => {
	const CONVENTIONAL_COMMIT_RE =
		/^(feat|fix|docs|chore|refactor|test|perf|ci|build|wip)(\([^)]+\))?: [a-z0-9]/;

	it("docs-only files produce type docs", () => {
		const result = proposeCommitMessage(["README.md", "CHANGELOG.md"], "", "");
		expect(result.subject).toMatch(/^docs\(/);
	});

	it("test-only files produce type test", () => {
		const result = proposeCommitMessage(["pi/tests/foo.test.ts"], "", "");
		expect(result.subject).toMatch(/^test\(/);
	});

	it("pi/ files produce scope pi", () => {
		const result = proposeCommitMessage(
			["pi/extensions/workflow-commands.ts"],
			"",
			"",
		);
		expect(result.subject).toMatch(/\(pi\):/);
	});

	it("hint is used as description", () => {
		const result = proposeCommitMessage(
			["pi/extensions/workflow-commands.ts"],
			"add planner fallback",
			"",
		);
		expect(result.subject).toContain("add planner fallback");
	});

	it("result matches conventional commit regex", () => {
		const result = proposeCommitMessage(
			["pi/extensions/workflow-commands.ts"],
			"add planner fallback",
			"",
		);
		expect(result.subject).toMatch(CONVENTIONAL_COMMIT_RE);
	});

	it("more than 3 files includes a body", () => {
		const files = ["pi/a.ts", "pi/b.ts", "pi/c.ts", "pi/d.ts"];
		const result = proposeCommitMessage(files, "", "");
		expect(result.body).toBeDefined();
		expect(result.body).toContain("4");
	});

	it("feat detected from diff containing registerCommand text", () => {
		const result = proposeCommitMessage(
			["pi/extensions/workflow-commands.ts"],
			"",
			"+registerCommand(",
		);
		expect(result.subject).toMatch(/^feat\(/);
	});

	it("fix detected from diff containing fix text", () => {
		const result = proposeCommitMessage(
			["pi/extensions/workflow-commands.ts"],
			"",
			"+fix the bug",
		);
		expect(result.subject).toMatch(/^fix\(/);
	});
});

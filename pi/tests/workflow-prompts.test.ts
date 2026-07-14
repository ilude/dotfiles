import * as fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
	buildCommitPlanningPrompt,
	buildSecretReviewPrompt,
} from "../lib/workflow-commands/prompts.ts";

function readPrompt(relativePath: string) {
	return fs.readFileSync(
		new URL(`../${relativePath}`, import.meta.url),
		"utf8",
	);
}

describe("workflow prompt contracts", () => {
	it("/yt is the public menos workflow and keeps the local fetcher internal", () => {
		const prompt = readPrompt("prompts/yt.md");
		expect(prompt).toContain("argument-hint:");
		expect(prompt).toContain("YouTube request: $ARGUMENTS");
		expect(prompt).toContain("Always attempt menos first");
		expect(prompt).toContain("locally fall back");
		expect(
			fs.existsSync(new URL("../prompts/yt-local.md", import.meta.url)),
		).toBe(false);
		expect(
			fs.existsSync(new URL("../skills/workflow/yt-local.md", import.meta.url)),
		).toBe(false);
	});

	it("/do-it explicitly supports .specs/*/plan.md execution", () => {
		const prompt = readPrompt("skills/workflow/do-it.md");
		expect(prompt).toContain("Plan file");
		expect(prompt).toContain(".specs/my-feature/plan.md");
		expect(prompt).toContain("Execute Plan File");
		expect(prompt).toContain("wave by wave");
	});

	it("/plan-it requires agent assignment and executable plan contracts", () => {
		const prompt = readPrompt("skills/workflow/plan-it.md");
		expect(prompt).toContain("| Scope | Indicators | Model | Agent |");
		expect(prompt).toContain(
			"Every task has both a **Model** and an **Agent** assigned",
		);
		expect(prompt).toContain("Self-Validate Before Presenting");
		expect(prompt).toContain(
			"| # | Task | Files | Type | Model | Agent | Depends On |",
		);
		expect(prompt).toContain("Validation Contract");
		expect(prompt).toContain("Automation Plan");
		expect(prompt).toContain("mutation boundaries");
		expect(prompt).toContain("Telemetry & Evidence Contract");
		expect(prompt).toContain("episode ID");
		expect(prompt).toContain("validation command");
		expect(prompt).toContain("plan_profile");
		expect(prompt).toContain("review_panel_decision");
		expect(prompt).toContain("expected reviewer count");
	});

	it("/review-it requires fixed standard reviewers plus dynamic expert reviewers", () => {
		const prompt = readPrompt("skills/workflow/review-it.md");
		expect(prompt).toContain("3 standard reviewers");
		expect(prompt).toContain(
			"at least 3 additional domain-specific expert reviewers",
		);
		expect(prompt).toContain('modelSize: "small"` by default');
		expect(prompt).toContain("do not raise the whole\npanel tier by default");
		expect(prompt).toContain(
			'Escalate independent reviewers to `modelSize: "medium"`',
		);
		expect(prompt).toContain("MATERIAL_CHANGE_REVIEW");
		expect(prompt).toContain(
			"original panel verdict is invalid for the changed",
		);
		expect(prompt).toContain("Run at most one post-change panel");
		expect(prompt).toContain("If its fixes are material under the same");
		expect(prompt).toMatch(
			/Classify the\s+resulting diff with the complete MATERIAL_CHANGE_REVIEW definition/,
		);
		expect(
			prompt.match(
				/return(?:s)? to the complete MATERIAL_CHANGE_REVIEW state/g,
			),
		).toHaveLength(2);
		expect(prompt.match(/execute every step in that state/g)).toHaveLength(2);
		expect(prompt).toContain(
			"resume at\nPRE_READINESS_AUDIT without repeating KNOWN_BLOCKER_QUICKFIX",
		);
		expect(prompt).toContain("PRE_READINESS_AUDIT");
		expect(prompt).toContain("Repository prerequisites");
		expect(prompt).toContain("Command truth tables");
		expect(prompt).toContain("Archive before/after");
		expect(prompt).toContain("Allow two\naudit repair cycles");
		expect(prompt).toContain(
			"A material repair consumes its current audit\nrepair cycle",
		);
		expect(prompt).toContain(
			'`modelSize: "large"`, and\n`modelPolicy: "same-family"`. This gate is a single serial reviewer',
		);
		expect(prompt).toContain(
			"The reviewer must evaluate every PRE_READINESS_AUDIT domain",
		);
		expect(prompt).toContain(
			"The budget starts only here, after all earlier audits pass",
		);
		expect(prompt).toContain("Contested or Dismissed Findings");
		expect(prompt).toContain("Default mode is **auto-apply**");
		expect(prompt).toContain("final standalone-readiness reviewer");
		expect(prompt).toContain("review_artifact_write");
		expect(prompt).toContain(
			"do not silently route reviewer personas through proxy agents",
		);
		expect(prompt).toContain("substantive defect");
		expect(prompt).toContain("process defect");
		expect(prompt).toContain("duplicate");
		expect(prompt).toContain("low-value/theater");
		expect(prompt).toContain("false positive");
		expect(prompt).toContain("severity rationale");
		expect(prompt).toContain("confidence");
		expect(prompt).toContain("review_yield");
		expect(prompt).toContain("per-reviewer yield");
	});

	it("/review-it reviewer template prefers constrained artifact writer", () => {
		const prompt = readPrompt(
			"skills/workflow/templates/review-it-reviewer-prompts.md",
		);
		expect(prompt).toContain("review_artifact_write");
		expect(prompt).toContain("narrowest available file-write mechanism");
		expect(prompt).toContain(
			"read/verify it if the available tool surface permits",
		);
		expect(prompt).toContain("substantive defect");
		expect(prompt).toContain("low-value/theater");
		expect(prompt).toContain("severity_rationale");
		expect(prompt).toContain("confidence");
	});

	it("/do-it enforces telemetry, safe manual-gate downgrade, archive defaults, and automatic post-run eval", () => {
		const prompt = readPrompt("skills/workflow/do-it.md");
		expect(prompt).toContain("structured telemetry/evidence");
		expect(prompt).toContain("episode ID");
		expect(prompt).toContain("phase ID");
		expect(prompt).toContain("validation command");
		expect(prompt).toContain("archive status");
		expect(prompt).toContain("downgrade a manual validation gate");
		expect(prompt).toContain("clearly safe, non-destructive");
		expect(prompt).toContain("archive the completed plan by default");
		expect(prompt).toContain("opted-out");
		expect(prompt).toContain("Automatic post-run workflow eval");
		expect(prompt).toContain("not a separate command");
		expect(prompt).toContain("## Workflow Eval Record");
		expect(prompt).toContain("evidence-auditor");
		expect(prompt).toContain("workflow-friction-analyst");
		expect(prompt).toContain("friction triggers");
		expect(prompt).toContain("execution_outcome");
		expect(prompt).toContain("panel_quality_label");
	});

	it("/commit documents the prompt-dispatched git workflow", () => {
		const prompt = readPrompt("skills/workflow/commit.md");
		expect(prompt).toContain("Commit all legitimate uncommitted changes");
		expect(prompt).toContain("Do not skip files because they were changed");
		expect(prompt).toContain("detect-secrets-hook");
		expect(prompt).toContain("--disable-plugin KeywordDetector");
		expect(prompt).toContain("Prepared: yes/no");
		expect(prompt).toContain("Committed: yes/no");
		expect(prompt).toContain("Pushed: yes/no/not requested");
	});

	it("commit planner prompt requires one-line subjects", () => {
		const prompt = buildCommitPlanningPrompt("", {
			files: ["a.ts"],
			diffStat: "a.ts | 1 +",
			cachedStat: "a.ts | 1 +",
			cachedDiff: "diff --git a/a.ts b/a.ts",
			hint: "",
		});
		expect(prompt).toContain("Each subject must be exactly one line");
		expect(prompt).toContain("Do not put a newline before or after the colon");
	});

	it("secret review distinguishes ordinary code from credentials", () => {
		const prompt = buildSecretReviewPrompt([
			{
				id: 1,
				path: "example.ts",
				label: "Hardcoded password/token/secret/key",
				match: "accessToken: string",
				line: 1,
				context: "type Auth = { accessToken: string };",
			},
		]);

		expect(prompt).toContain("false_positive");
		expect(prompt).toContain("keyword-only match");
		expect(prompt).toContain("type annotations");
		expect(prompt).toContain("runtime expressions");
		expect(prompt).toContain("no literal credential value");
		expect(prompt).toContain("every candidate ID exactly once");
		expect(prompt).toContain('"id": 1');
	});

	it("/gitlab-ticket documents issue-numbered branch naming and draft MR follow-on", () => {
		const prompt = readPrompt("skills/workflow/gitlab-ticket.md");
		expect(prompt).toContain("<issue-number>-<kebab-case-title>");
		expect(prompt).toContain("474-migrate-e2e-coverage-to-playwright");
		expect(prompt).toContain("Default to a **draft** MR");
		expect(prompt).toContain(
			"Want me to create a branch and draft MR for this issue too?",
		);
	});
});

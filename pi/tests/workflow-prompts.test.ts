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
		expect(prompt).toContain("uv run --isolated --frozen");
		expect(prompt).toContain("uv run --script fetch_transcript.py");
		expect(prompt).not.toContain("uv run ingest_video.py");
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
		expect(prompt).toContain("Build a dependency truth table");
		expect(prompt).toContain("cleanup on success/failure/interruption");
		expect(prompt).toContain("safe read-only probes");
		expect(prompt).toContain(
			"Reject plans that add a prerequisite in a later wave",
		);
		expect(prompt).toContain("Do not invent plan-specific telemetry scripts");
	});

	it("/review-it adapts review composition to runtime capabilities", () => {
		const prompt = readPrompt("skills/workflow/review-it.md");
		expect(prompt).toContain("DISCOVER");
		expect(prompt).toContain("Choose from what is actually available");
		expect(prompt).toContain("smallest panel");
		expect(prompt).toContain("Apply all verified must-fix defects");
		expect(prompt).toContain("Do not ask first");
		expect(prompt).toContain("Do not automatically launch a second panel");
		expect(prompt).not.toContain("--ask");
		expect(prompt).not.toContain("modelSize:");
		expect(prompt).not.toContain("MATERIAL_CHANGE_REVIEW");
		expect(prompt).not.toContain("STANDALONE_READINESS");
	});

	it("/review-it reviewer template is capability-neutral", () => {
		const prompt = readPrompt(
			"skills/workflow/templates/review-it-reviewer-prompts.md",
		);
		expect(prompt).toContain("capabilities discovered in the current runtime");
		expect(prompt).toContain("Do not require a particular agent name");
		expect(prompt).toContain("constrained review-artifact writer");
		expect(prompt).toContain("severity_rationale");
		expect(prompt).toContain("confidence");
		expect(prompt).not.toContain("modelSize:");
	});

	it("/review-it synthesis records discovery, edits, and final readiness", () => {
		const prompt = readPrompt(
			"skills/workflow/templates/review-synthesis-template.md",
		);
		expect(prompt).toContain("## Runtime Discovery");
		expect(prompt).toContain("## Applied Edits");
		expect(prompt).toContain("## Final Readiness");
		expect(prompt).not.toContain("Standalone-readiness");
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
		expect(prompt).toContain(
			"Use only these commit types: feat, fix, docs, chore, refactor, test, perf, style, ci, build, deps, revert, wip.",
		);
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

	it("/summarize stays grounded in session context", () => {
		const prompt = readPrompt("prompts/summarize.md");
		expect(prompt).toContain("argument-hint:");
		expect(prompt).toContain("Additional focus: $ARGUMENTS");
		expect(prompt).toContain(
			"Treat the available session context, including any compaction summaries, as the source of truth for session scope.",
		);
		expect(prompt).toContain(
			"Use Git status and history only to corroborate implementation and current state.",
		);
		expect(prompt).toContain(
			"state that coverage is limited instead of reconstructing missing work from Git history.",
		);
	});

	it("/gitlab-ticket is a native prompt with issue and draft MR follow-on", () => {
		const prompt = readPrompt("prompts/gitlab-ticket.md");
		expect(prompt).toContain("argument-hint:");
		expect(prompt).toContain("GitLab ticket request: $ARGUMENTS");
		expect(prompt).toContain("<issue-number>-<kebab-case-title>");
		expect(prompt).toContain("474-migrate-e2e-coverage-to-playwright");
		expect(prompt).toContain("Default to a **draft** MR");
		expect(prompt).toContain(
			"Want me to create a branch and draft MR for this issue too?",
		);
		expect(
			fs.existsSync(
				new URL("../skills/workflow/gitlab-ticket.md", import.meta.url),
			),
		).toBe(false);
	});
});

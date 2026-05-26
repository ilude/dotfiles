import * as fs from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCommitPlanningPrompt } from "../lib/workflow-commands/prompts.ts";

function readPrompt(relativePath: string) {
	return fs.readFileSync(
		new URL(`../${relativePath}`, import.meta.url),
		"utf8",
	);
}

describe("workflow prompt contracts", () => {
	it("/do-it explicitly supports .specs/*/plan.md execution", () => {
		const prompt = readPrompt("skills/workflow/do-it.md");
		expect(prompt).toContain("Plan file");
		expect(prompt).toContain(".specs/my-feature/plan.md");
		expect(prompt).toContain("Execute Plan File");
		expect(prompt).toContain("wave by wave");
	});

	it("/plan-it requires agent assignment and self-validation", () => {
		const prompt = readPrompt("skills/workflow/plan-it.md");
		expect(prompt).toContain("| Scope | Indicators | Model | Agent |");
		expect(prompt).toContain(
			"Every task has both a **Model** and an **Agent** assigned",
		);
		expect(prompt).toContain("## Step 7: Self-Validate Before Presenting");
		expect(prompt).toContain(
			"| # | Task | Files | Type | Model | Agent | Depends On |",
		);
	});

	it("/review-it requires fixed standard reviewers plus dynamic expert reviewers", () => {
		const prompt = readPrompt("skills/workflow/review-it.md");
		expect(prompt).toContain("3 standard reviewers");
		expect(prompt).toContain(
			"at least 3 additional domain-specific expert reviewers",
		);
		expect(prompt).toContain('modelSize: "medium"');
		expect(prompt).toContain('modelPolicy: "same-family"');
		expect(prompt).toContain("Contested or Dismissed Findings");
		expect(prompt).toContain("Default mode is **auto-apply**");
		expect(prompt).toContain("final standalone-readiness reviewer");
		expect(prompt).toContain("review_artifact_write");
		expect(prompt).toContain(
			"do not silently route reviewer personas through proxy agents",
		);
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

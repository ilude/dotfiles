import * as fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
	WorkflowEventRecord,
	WorkflowExecutionOutcome,
	WorkflowPanelQualityLabel,
	WorkflowPlanProfile,
	WorkflowReviewPanelDecision,
	WorkflowReviewYield,
} from "../lib/workflow-telemetry.ts";
import {
	createWorkflowEpisodeId,
	startWorkflowEpisode,
	workflowTelemetryDir,
} from "../lib/workflow-telemetry.ts";

vi.mock("node:fs", () => ({
	mkdirSync: vi.fn(),
	appendFileSync: vi.fn(),
}));

describe("workflow telemetry", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("creates stable readable episode IDs from command and artifact path", () => {
		const id = createWorkflowEpisodeId({
			command: "do-it",
			args: ".specs/example/plan.md",
			artifactPath: ".specs/example/plan.md",
			now: new Date("2026-05-26T12:10:42.000Z"),
		});

		expect(id).toBe("2026-05-26T12-10-42-000Z-do-it-specs-example");
	});

	it("accepts adaptive review lifecycle payloads", () => {
		const planProfile: WorkflowPlanProfile = {
			domains: ["prompt", "typescript-test"],
			files_estimated: 5,
			tasks: 6,
			waves: 2,
			dependency_depth: 2,
			validation_commands: 3,
			external_systems: 0,
			deployment_required: false,
			manual_gate_required: false,
			credentials_required: false,
			risk_level: "low",
			blast_radius: "personal-repo",
			rollback: "easy",
			destructive_potential: false,
			paid_or_quota_resource: false,
			secret_exposure_risk: false,
			shared_user_impact: false,
		};
		const panelDecision: WorkflowReviewPanelDecision = {
			review_strategy: "manual-review-it",
			complexity_score: 4,
			risk_score: 1,
			recommended_reviewer_count: 3,
			selected_reviewers: [
				{
					base_agent: "qa-engineer",
					persona: "verification realism reviewer",
					reason: "Prompt-contract tests are the safety mechanism.",
					expected_value: "Catch weak acceptance criteria.",
				},
			],
			selection_reasons: ["prompt/test workflow"],
			expected_high_risk_areas: ["validation drift"],
		};
		const reviewYield: WorkflowReviewYield = {
			total_findings: 8,
			must_fix: 1,
			hardening: 3,
			duplicates: 2,
			low_value_theater: 1,
			false_positives: 1,
			applied: 4,
			rejected: 4,
			changed_execution_readiness: true,
			per_reviewer: [
				{
					persona: "verification realism reviewer",
					findings: 3,
					applied: 2,
					false_positives: 0,
					low_value_theater: 0,
				},
			],
		};
		const executionOutcome: WorkflowExecutionOutcome = {
			classification: "completed-and-archived",
			completed: true,
			blocked_by_plan_gap: false,
			validation_failures_after_review: 0,
			manual_gate_ambiguity: false,
			archive_issue: false,
			missed_by_review: [],
		};
		const panelQuality: WorkflowPanelQualityLabel = {
			sizing: "right_sized",
			reason: "Execution completed without missed plan gaps.",
			confidence: "medium",
		};

		expect(planProfile.risk_level).toBe("low");
		expect(panelDecision.recommended_reviewer_count).toBe(3);
		expect(reviewYield.changed_execution_readiness).toBe(true);
		expect(executionOutcome.completed).toBe(true);
		expect(panelQuality.sizing).toBe("right_sized");
	});

	it("accepts post-run eval and friction event types", () => {
		const event: WorkflowEventRecord = {
			schema_version: 1,
			episode_id: "episode-1",
			event_id: "eval-001",
			phase_id: "post-run-eval",
			event_type: "improvement_candidate",
			status: "recorded",
			evidence: "Validation passed after one repair loop.",
			category: "test-gap",
			severity: "medium",
			impact: "Future evals need repair-loop counts.",
			recommended_change: "Record validation_result events for each attempt.",
			candidate_test: "assert repaired validation has repair_attempt > 0",
			created_at: "2026-05-26T12:10:42.000Z",
		};

		expect(event.event_type).toBe("improvement_candidate");
		expect(event.phase_id).toBe("post-run-eval");
	});

	it("appends an episode record and dispatch event as JSONL", () => {
		const episode = startWorkflowEpisode({
			command: "review-it",
			args: ".specs/example/plan.md",
			artifactPath: ".specs/example/plan.md",
			repoRoot: "C:/repo",
			now: new Date("2026-05-26T12:10:42.000Z"),
		});

		expect(episode).toMatchObject({
			schema_version: 1,
			episode_id: "2026-05-26T12-10-42-000Z-review-it-specs-example",
			command: "review-it",
			artifact_path: ".specs/example/plan.md",
			repo_root: "C:/repo",
			status: "started",
			archive_status: "not_applicable",
			redaction_status: "no_sensitive_output",
		});
		expect(fs.appendFileSync).toHaveBeenCalledTimes(2);
		expect(String(vi.mocked(fs.appendFileSync).mock.calls[0][0])).toContain(
			workflowTelemetryDir,
		);
		expect(vi.mocked(fs.appendFileSync).mock.calls[0][1]).toContain(
			'"command":"review-it"',
		);
		expect(vi.mocked(fs.appendFileSync).mock.calls[1][1]).toContain(
			'"event_type":"command"',
		);
		expect(vi.mocked(fs.appendFileSync).mock.calls[1][1]).toContain(
			'"phase_id":"dispatch"',
		);
	});
});

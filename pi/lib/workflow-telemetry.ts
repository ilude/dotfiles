import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export type WorkflowCommandName =
	| "plan-it"
	| "prd-it"
	| "review-it"
	| "do-it"
	| "summarize"
	| string;

export interface WorkflowEpisodeRecord {
	schema_version: 1;
	episode_id: string;
	command: WorkflowCommandName;
	artifact_path?: string;
	repo_root: string;
	started_at: string;
	completed_at?: string;
	status: "started" | "completed" | "blocked" | "not_complete" | "failed";
	classification?: string;
	archive_status?:
		| "not_applicable"
		| "archived"
		| "active"
		| "opted-out"
		| "failed";
	archive_path?: string;
	redaction_status: "redacted" | "no_sensitive_output" | "not_recorded";
}

export interface WorkflowEventRecord {
	schema_version: 1;
	episode_id: string;
	event_id: string;
	phase_id: string;
	task_id?: string;
	event_type:
		| "command"
		| "decision"
		| "checklist_update"
		| "artifact_write"
		| "plan_profile"
		| "review_panel_decision"
		| "review_yield"
		| "execution_outcome"
		| "panel_quality_label"
		| "validation_result"
		| "manual_gate_decision"
		| "archive_move"
		| "post_run_eval"
		| "friction"
		| "improvement_candidate"
		| "missing_evidence"
		| "blocker";
	command_line?: string;
	exit_code?: number;
	status: "passed" | "failed" | "blocked" | "skipped" | "recorded";
	duration_ms?: number;
	evidence: string;
	failure_reason?: string;
	repair_attempt?: number;
	category?: string;
	severity?: "critical" | "high" | "medium" | "low";
	impact?: string;
	recommended_change?: string;
	candidate_test?: string;
	plan_profile?: WorkflowPlanProfile;
	review_panel_decision?: WorkflowReviewPanelDecision;
	review_yield?: WorkflowReviewYield;
	execution_outcome?: WorkflowExecutionOutcome;
	panel_quality_label?: WorkflowPanelQualityLabel;
	created_at: string;
}

export interface WorkflowPlanProfile {
	domains: string[];
	files_estimated?: number;
	tasks?: number;
	waves?: number;
	dependency_depth?: number;
	validation_commands?: number;
	external_systems?: number;
	deployment_required: boolean;
	manual_gate_required: boolean;
	credentials_required: boolean;
	risk_level: "low" | "medium" | "high";
	blast_radius:
		| "local"
		| "personal-repo"
		| "home-lab"
		| "shared"
		| "work"
		| "production";
	rollback: "easy" | "known" | "unclear" | "none";
	destructive_potential: boolean;
	paid_or_quota_resource: boolean;
	secret_exposure_risk: boolean;
	shared_user_impact: boolean;
}

export interface WorkflowReviewPanelDecision {
	review_strategy: "manual-review-it" | "embedded-plan-review";
	complexity_score: number;
	risk_score: number;
	recommended_reviewer_count: number;
	selected_reviewers: Array<{
		base_agent: string;
		persona: string;
		reason: string;
		expected_value: string;
	}>;
	selection_reasons: string[];
	expected_high_risk_areas: string[];
}

export interface WorkflowReviewYield {
	total_findings: number;
	must_fix: number;
	hardening: number;
	duplicates: number;
	low_value_theater: number;
	false_positives: number;
	applied: number;
	rejected: number;
	changed_execution_readiness: boolean;
	per_reviewer: Array<{
		persona: string;
		findings: number;
		applied: number;
		false_positives: number;
		low_value_theater: number;
	}>;
}

export interface WorkflowExecutionOutcome {
	classification: string;
	completed: boolean;
	blocked_by_plan_gap: boolean;
	validation_failures_after_review: number;
	manual_gate_ambiguity: boolean;
	archive_issue: boolean;
	missed_by_review: string[];
}

export interface WorkflowPanelQualityLabel {
	sizing: "under_reviewed" | "right_sized" | "over_reviewed" | "unknown";
	reason: string;
	confidence: "high" | "medium" | "low";
}

export interface WorkflowEpisodeStartInput {
	command: WorkflowCommandName;
	args: string;
	artifactPath?: string;
	repoRoot?: string;
	now?: Date;
}

const WORKFLOW_TELEMETRY_DIR = path.join(
	os.homedir(),
	".pi",
	"workflow-telemetry",
);

function safeSegment(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/^[._-]+|[._-]+$/g, "")
		.slice(0, 80);
}

function appendJsonl(filePath: string, record: unknown) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, "utf8");
}

export function createWorkflowEpisodeId(
	input: WorkflowEpisodeStartInput,
): string {
	const now = input.now ?? new Date();
	const timestamp = now.toISOString().replace(/[:.]/g, "-");
	const artifactSlug = input.artifactPath
		? safeSegment(input.artifactPath.replace(/\/plan\.md$/, ""))
		: safeSegment(input.args || "no-args");
	const suffix = artifactSlug ? `-${artifactSlug}` : "";
	return `${timestamp}-${safeSegment(input.command)}${suffix}`;
}

export function startWorkflowEpisode(
	input: WorkflowEpisodeStartInput,
): WorkflowEpisodeRecord {
	const now = input.now ?? new Date();
	const episode: WorkflowEpisodeRecord = {
		schema_version: 1,
		episode_id: createWorkflowEpisodeId({ ...input, now }),
		command: input.command,
		repo_root: input.repoRoot ?? process.cwd(),
		started_at: now.toISOString(),
		status: "started",
		archive_status: "not_applicable",
		redaction_status: "no_sensitive_output",
	};
	if (input.artifactPath) episode.artifact_path = input.artifactPath;

	appendJsonl(path.join(WORKFLOW_TELEMETRY_DIR, "episodes.jsonl"), episode);
	appendJsonl(
		path.join(WORKFLOW_TELEMETRY_DIR, episode.episode_id, "events.jsonl"),
		{
			schema_version: 1,
			episode_id: episode.episode_id,
			event_id: "dispatch-001",
			phase_id: "dispatch",
			event_type: "command",
			command_line: `/${input.command}${input.args ? ` ${input.args}` : ""}`,
			status: "recorded",
			evidence:
				"Workflow command dispatched; detailed execution evidence is recorded by the executing agent or follow-up runtime hooks.",
			created_at: now.toISOString(),
		} satisfies WorkflowEventRecord,
	);
	return episode;
}

export const workflowTelemetryDir = WORKFLOW_TELEMETRY_DIR;

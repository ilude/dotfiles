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
	status: "started";
	redaction_status: "no_sensitive_output";
}

export interface WorkflowEventRecord {
	schema_version: 1;
	episode_id: string;
	event_id: "dispatch-001";
	phase_id: "dispatch";
	event_type: "command";
	command_line: string;
	status: "recorded";
	evidence: string;
	created_at: string;
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
			evidence: "Workflow command dispatched by runtime code.",
			created_at: now.toISOString(),
		} satisfies WorkflowEventRecord,
	);
	return episode;
}

export const workflowTelemetryDir = WORKFLOW_TELEMETRY_DIR;

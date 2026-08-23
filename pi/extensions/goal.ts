import { onSessionStart } from "../lib/session-start-metrics.js";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { formatToolError } from "../lib/extension-utils.js";
import { replaceRuntimeContext } from "../lib/runtime-context.js";
import { archiveCompletedPlan } from "../lib/plan-archive.js";
import {
	beginGoalAttempt,
	createGoalWorkItem,
	type GoalFailureOutcome,
	type GoalMode,
	type GoalStrategy,
	type GoalWaitReason,
	type GoalCondition,
	type GoalConditionMode,
	goalStrategiesMateriallyDiffer,
	reconcileGoalConditions,
	validateGoalTaskCoverage,
	recordGoalOutcome,
	recordGoalReEvaluation,
	recordGoalWait,
	type UnattendedGoal,
} from "../lib/goal-state.js";
import { readLinkedPlan } from "../lib/plan-state.js";
import {
	currentPlanLifecycle,
	startPlanLifecycle,
	validatePlanFile,
} from "../lib/workflow-commands/plan-lifecycle.js";
import {
	createTaskBatch,
	getTask,
	listTasks,
	resolveTaskWorkspace,
	startTask,
	updateTask,
} from "../lib/task-registry.js";
import { activateTools, deactivateTools } from "../lib/tool-activation.js";
import {
	closeWorkflowWorktree,
	ensureWorkflowWorktree,
	readWorkflowOwnershipForWorktree,
	readWorkflowOwnershipRecord,
	workflowSlugFromPlan,
} from "../lib/workflow-worktree.js";
import { noteWorkflowSubmission } from "../lib/workflow-friction.js";
import {
	inspectLoopJob,
	listLoopJobs,
	listWorkspaceGoalJobs,
	readLoopJob,
	resumeLoopJob,
	startLoopJob,
	stopLoopJob,
	type LoopJob,
	updateLoopJob,
} from "./loop.js";

const GOAL_STATE_TYPE = "local-goal-state";
const INLINE_LIMIT = 15_000;
const FILE_LIMIT_BYTES = 256 * 1024;
const PREVIEW_LIMIT = 500;
const SUMMARY_LIMIT = 240;
const PATH_LIKE_PATTERN = /[\\/]|\.(md|txt)$/i;
const TEXT_EXTENSIONS = new Set([".md", ".txt"]);
const GOAL_TOOLS = ["goal_complete", "goal_progress"];
const MODIFYING_TOOLS = new Set([
	"bash",
	"pwsh",
	"write",
	"edit",
	"text_edit",
	"structured_edit",
	"bg_start",
	"subagent",
	"subagent_continue",
]);
const WAIT_REASONS = [
	"operator_decision",
	"access_or_credential",
	"external_dependency",
	"safety_boundary",
	"objective_conflict",
	"recovery_exhausted",
] as const;
const FAILURE_OUTCOMES = [
	"error",
	"inconclusive",
	"schema_invalid",
	"verifier_contradiction",
	"capability_rejected",
	"cancelled",
	"damage_control_denied",
	"infrastructure_failure",
	"not_found",
	"success",
] as const;

export type ForegroundGoal = {
	id: string;
	mode: GoalMode;
	status: "active" | "completed";
	startedAt: string;
	updatedAt: string;
	iterationCount: number;
	summary: string;
	preview: string;
	hash: string;
	path?: string;
	sizeBytes?: number;
	objectiveText?: string;
	workspace?: string;
	plans?: string[];
	items?: Record<string, ReturnType<typeof createGoalWorkItem>>;
	planning?: boolean;
	requestedUnattended?: boolean;
	conditions?: GoalCondition[];
	conditionMode?: GoalConditionMode;
	initialHead?: string;
	archivedPlanPath?: string;
	closeoutState?: "archived_pending_commit";
};

type ParsedGoal = {
	goal: ForegroundGoal;
	startupPrompt: string;
	objectiveText: string;
	absolutePath?: string;
};

type GoalStateEntry = {
	goal: ForegroundGoal | null;
	unattendedGoalId?: string;
	completedAt?: string;
	closeout?: string;
};

type SessionEntry = {
	customType?: string;
	data?: unknown;
	content?: unknown;
};

type GoalCommandContext = {
	cwd?: string;
	ui?: {
		notify?: (message: string, level?: "error" | "warning" | "info") => unknown;
	};
	sessionManager?: {
		getBranch?: () => unknown;
		getEntries?: () => unknown;
	};
};

const PROCESS_INSTANCE_ID = randomUUID();
const observedSuccessfulCommands = new Set<string>();
let foregroundGoal: ForegroundGoal | null = null;
let unattendedJobId: string | null = null;
let pendingUnattendedContext: ExtensionCommandContext | null = null;

function nowIso(): string {
	return new Date().toISOString();
}

function sha256(text: string | Buffer): string {
	return createHash("sha256").update(text).digest("hex");
}

function bounded(text: string, limit: number): string {
	const compact = text.replace(/\s+/g, " ").trim();
	return compact.length <= limit
		? compact
		: `${compact.slice(0, limit - 3)}...`;
}

function asciiBounded(text: string, limit: number): string {
	return bounded(text.replace(/[^\x20-\x7e]/g, "?"), limit);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function needsApprovalDecisionId(content: unknown): string | undefined {
	if (!Array.isArray(content)) return undefined;
	for (const item of content) {
		if (!isRecord(item) || item.type !== "text" || typeof item.text !== "string")
			continue;
		const candidates = [
			item.text,
			item.text.slice(item.text.indexOf("{"), item.text.lastIndexOf("}") + 1),
		];
		for (const candidate of candidates) {
			if (!candidate.startsWith("{") || !candidate.endsWith("}")) continue;
			try {
				const parsed: unknown = JSON.parse(candidate);
				if (
					isRecord(parsed) &&
					parsed.outcome === "needs_approval" &&
					typeof parsed.decisionId === "string" &&
					/^[A-Za-z0-9_-]+$/.test(parsed.decisionId)
				)
					return parsed.decisionId;
			} catch {
				continue;
			}
		}
	}
	return undefined;
}

function normalizeWindowsPath(rawPath: string): string {
	const drive = rawPath.match(/^\/([a-zA-Z])\/(.*)$/);
	if (drive) return `${drive[1]}:/${drive[2]}`;
	return rawPath;
}

function displayPath(filePath: string, cwd: string): string {
	const relative = path.relative(cwd, filePath);
	return relative && !relative.startsWith("..") && !path.isAbsolute(relative)
		? relative.replaceAll(path.sep, "/")
		: filePath.replaceAll(path.sep, "/");
}

function isContained(root: string, candidate: string): boolean {
	const relative = path.relative(root, candidate);
	return (
		relative === "" ||
		(!relative.startsWith("..") && !path.isAbsolute(relative))
	);
}

function assertFuturePathContained(root: string, candidate: string): void {
	let ancestor = path.resolve(candidate);
	while (!fs.existsSync(ancestor)) {
		const parent = path.dirname(ancestor);
		if (parent === ancestor)
			throw new Error("Generated goal path has no existing ancestor.");
		ancestor = parent;
	}
	const canonicalAncestor = fs.realpathSync(ancestor);
	if (!isContained(root, canonicalAncestor))
		throw new Error(
			"Generated goal plan must stay under the workspace and cannot traverse a symlink or junction.",
		);
	if (
		ancestor !== path.resolve(candidate) &&
		!fs.statSync(canonicalAncestor).isDirectory()
	)
		throw new Error("Generated goal plan parent must be a directory.");
}

function looksBinary(buffer: Buffer): boolean {
	if (buffer.includes(0)) return true;
	const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
	let suspicious = 0;
	for (const byte of sample) {
		if (byte < 9 || (byte > 13 && byte < 32)) suspicious += 1;
	}
	return sample.length > 0 && suspicious / sample.length > 0.1;
}

function resolveGoalFile(
	rawArg: string,
	cwd: string,
): { ok: true; filePath: string } | { ok: false; message: string } {
	if (rawArg.includes("\0") || /\r|\n/.test(rawArg))
		return {
			ok: false,
			message: "Goal file paths cannot contain NUL or newline characters.",
		};
	const normalized = normalizeWindowsPath(rawArg);
	const base = fs.realpathSync(cwd);
	const candidate = path.resolve(base, normalized);
	if (!fs.existsSync(candidate))
		return { ok: false, message: `Goal file not found: ${rawArg}` };
	const real = fs.realpathSync(candidate);
	if (!isContained(base, real))
		return {
			ok: false,
			message: "Goal file must stay under the current workspace.",
		};
	const stat = fs.statSync(real);
	if (!stat.isFile())
		return {
			ok: false,
			message: "Goal path must be an existing regular text file.",
		};
	if (stat.size > FILE_LIMIT_BYTES)
		return {
			ok: false,
			message: "Goal file is too large. Maximum size is 256 KiB.",
		};
	if (!TEXT_EXTENSIONS.has(path.extname(real).toLowerCase()))
		return { ok: false, message: "Goal file must be a .md or .txt text file." };
	const buffer = fs.readFileSync(real);
	if (looksBinary(buffer))
		return {
			ok: false,
			message: "Goal file appears to be binary. Use a text .md or .txt file.",
		};
	return { ok: true, filePath: real };
}

function pathModeCandidate(arg: string): boolean {
	return !/\s/.test(arg) && PATH_LIKE_PATTERN.test(arg);
}

function goalFromInline(
	objective: string,
): { ok: true; goal: ForegroundGoal } | { ok: false; message: string } {
	if (!objective.trim())
		return {
			ok: false,
			message: "Usage: /goal <objective> or /goal path/to/goal_prompt_file.md",
		};
	if (objective.length > INLINE_LIMIT) {
		return {
			ok: false,
			message: `Inline goal is too long (${objective.length}/${INLINE_LIMIT} characters). Put the objective in a workspace .md or .txt file and run /goal <path>.`,
		};
	}
	const at = nowIso();
	return {
		ok: true,
		goal: {
			id: sha256(`${at}:${objective}`).slice(0, 16),
			mode: "inline",
			status: "active",
			startedAt: at,
			updatedAt: at,
			iterationCount: 0,
			summary: bounded(objective, SUMMARY_LIMIT),
			preview: bounded(objective, PREVIEW_LIMIT),
			hash: sha256(objective),
			conditions: [],
			conditionMode: "legacy_compatibility",
		},
	};
}

function goalFromFile(filePath: string, cwd: string): ForegroundGoal {
	const content = fs.readFileSync(filePath, "utf8");
	const at = nowIso();
	return {
		id: sha256(`${at}:${filePath}:${content}`).slice(0, 16),
		mode: "file",
		status: "active",
		startedAt: at,
		updatedAt: at,
		iterationCount: 0,
		summary: bounded(content, SUMMARY_LIMIT),
		preview: bounded(content, PREVIEW_LIMIT),
		hash: sha256(content),
		path: displayPath(filePath, cwd),
		sizeBytes: Buffer.byteLength(content, "utf8"),
		conditions: [],
		conditionMode: "legacy_compatibility",
	};
}

function parseGoal(
	args: string,
	cwd: string,
): (
	| {
			ok: true;
			parsed: ParsedGoal;
			goal: ForegroundGoal;
			startupPrompt: string;
	  }
	| { ok: false; message: string }
) {
	const trimmed = args.trim();
	if (pathModeCandidate(trimmed)) {
		const resolved = resolveGoalFile(trimmed, cwd);
		if (!resolved.ok) return resolved;
		const root = fs.realpathSync(cwd);
		const objectiveText = fs.readFileSync(resolved.filePath, "utf8");
		const goal = goalFromFile(resolved.filePath, root);
		const prompt = startupPrompt(goal);
		return {
			ok: true,
			goal,
			startupPrompt: prompt,
			parsed: {
				goal,
				objectiveText,
				absolutePath: resolved.filePath,
				startupPrompt: prompt,
			},
		};
	}
	const inline = goalFromInline(trimmed);
	if (!inline.ok) return inline;
	const prompt = startupPrompt(inline.goal);
	return {
		ok: true,
		goal: inline.goal,
		startupPrompt: prompt,
		parsed: {
			goal: inline.goal,
			objectiveText: trimmed,
			startupPrompt: prompt,
		},
	};
}

function stateEntry(
	goal: ForegroundGoal | null,
	extra: Partial<GoalStateEntry> = {},
): GoalStateEntry {
	return { goal, ...extra };
}

async function appendState(
	pi: ExtensionAPI,
	entry: GoalStateEntry,
): Promise<void> {
	if (typeof pi.appendEntry === "function")
		await pi.appendEntry(GOAL_STATE_TYPE, entry);
	else if (typeof pi.sendMessage === "function")
		pi.sendMessage(
			{
				customType: GOAL_STATE_TYPE,
				display: false,
				content: JSON.stringify(entry),
			},
			{ triggerTurn: false },
		);
}

function entryData(entry: SessionEntry): unknown {
	if (entry.customType !== GOAL_STATE_TYPE) return undefined;
	if (entry.data !== undefined) return entry.data;
	if (typeof entry.content === "string") {
		try {
			return JSON.parse(entry.content) as unknown;
		} catch {
			return undefined;
		}
	}
	return entry.content;
}

function reconcileForegroundArchivePath(goal: ForegroundGoal): ForegroundGoal {
	if (
		goal.archivedPlanPath ||
		!goal.workspace ||
		goal.plans?.length !== 1
	)
		return goal;
	const sourcePlan = goal.plans[0];
	const archivedPlan = derivedArchivedPlanPath(sourcePlan);
	if (
		!archivedPlan ||
		fs.existsSync(path.resolve(goal.workspace, sourcePlan)) ||
		!fs.existsSync(path.resolve(goal.workspace, archivedPlan))
	)
		return goal;
	const sourceDirectory = path.posix.dirname(sourcePlan);
	const archivedDirectory = path.posix.dirname(archivedPlan);
	const goalPath = goal.path;
	return {
		...goal,
		path: goalPath?.startsWith(`${sourceDirectory}/`)
			? `${archivedDirectory}/${goalPath.slice(sourceDirectory.length + 1)}`
			: goalPath,
		plans: [archivedPlan],
		archivedPlanPath: archivedPlan,
		closeoutState: "archived_pending_commit",
		updatedAt: nowIso(),
	};
}

function restoreGoal(ctx: GoalCommandContext): void {
	foregroundGoal = null;
	unattendedJobId = process.env.PI_GOAL_ID?.trim() || null;
	const entries =
		ctx?.sessionManager?.getBranch?.() ??
		ctx?.sessionManager?.getEntries?.() ??
		[];
	if (!Array.isArray(entries)) return;
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const data = entryData(entries[index]);
		if (!isRecord(data) || !("goal" in data)) continue;
		const goal = data.goal;
		foregroundGoal =
			isRecord(goal) && goal.status === "active"
				? reconcileForegroundArchivePath(goal as ForegroundGoal)
				: null;
		if (!unattendedJobId && typeof data.unattendedGoalId === "string")
			unattendedJobId = data.unattendedGoalId;
		return;
	}
}

function startupPrompt(goal: ForegroundGoal): string {
	const source = goal.mode === "file" ? `file: ${goal.path}` : "inline objective";
	const plan = goal.plans?.[0];
	return [
		plan
			? "Active goal started with a reviewed canonical plan. Execute its durable root-task dependency graph, prove the plan's Completion Evidence, and call goal_complete only after the plan and required tasks are complete."
			: "Active foreground goal started with one linked durable root task. Work interactively and directly in this session. Use the settled observable pass/fail completion evidence, record the task outcome as task-level proof, and call goal_complete only after separate condition judgments and the top-level integration judgment pass.",
		...(plan
			? [`Canonical plan: ${plan}`]
			: [
				"If material risk or unresolved ambiguity makes direct execution unsafe, surface the specific issue and use a reviewed plan only when it is necessary.",
			]),
		`Source: ${source}`,
		`Hash: ${goal.hash}`,
		`Preview: ${goal.preview}`,
	].join("\n");
}

function foregroundReminder(goal: ForegroundGoal): string {
	const source =
		goal.mode === "file"
			? `File-backed goal: ${goal.path} (${goal.sizeBytes} bytes, sha256 ${goal.hash}). Re-read the file only if needed or if the hash changes.`
			: `Inline goal: sha256 ${goal.hash}.`;
	return [
		goal.plans?.length
			? "Active /goal reminder: continue the reviewed canonical plan and durable root-task graph until its Completion Evidence passes, update the plan, then call goal_complete."
			: "Active /goal reminder: continue toward the settled completion evidence, preserve any root task created for resume, then call goal_complete only after those checks pass.",
		source,
		`Summary: ${goal.summary}`,
	].join("\n");
}

function unattendedReminder(goal: UnattendedGoal): string {
	const active = Object.values(goal.items).find((item) => item.activeAttempt);
	return [
		`Unattended /goal ${goal.id} is ${goal.state}. Complete one validated slice and preserve durable task state.`,
		`Objective source: ${goal.mode === "file" ? goal.objectivePath : "inline"}; sha256 ${goal.objectiveHash}`,
		`Objective preview: ${goal.preview}`,
		`Linked plans: ${goal.plans.join(", ")}`,
		active
			? `Active work item: ${active.key} (${active.taskId})`
			: "No work item is claimed. Link root tasks if needed, then call goal_progress begin_attempt before any modifying-capable tool.",
		"Use goal_progress for attempts, outcomes, validation evidence, artifacts, blockers, and recovery. Call goal_complete only after every linked requirement is verified.",
	].join("\n");
}

type GoalConditionJudgment = {
	id: string;
	evidence: string;
	passed: boolean;
};

function validateGoalCompletionEvidence(
	conditions: readonly GoalCondition[] | undefined,
	conditionMode: GoalConditionMode | undefined,
	judgments: readonly GoalConditionJudgment[] | undefined,
	integrationJudgment: string | undefined,
	tasks: readonly { goalId?: string; covers?: readonly string[] }[],
	goalId: string,
): GoalConditionJudgment[] {
	if (conditionMode !== "structured" || !conditions?.length) return [];
	if (!judgments?.length)
		throw new Error("every current goal condition requires a judgment");
	const current = new Map(conditions.map((condition) => [condition.id, condition]));
	const seen = new Set<string>();
	for (const judgment of judgments) {
		if (!current.has(judgment.id))
			throw new Error(`condition judgment references unknown condition: ${judgment.id}`);
		if (seen.has(judgment.id))
			throw new Error(`condition judgment is duplicated: ${judgment.id}`);
		seen.add(judgment.id);
		if (!judgment.evidence.trim())
			throw new Error(`condition ${judgment.id} is missing evidence`);
		if (!judgment.passed)
			throw new Error(`condition ${judgment.id} failed`);
	}
	for (const condition of conditions)
		if (!seen.has(condition.id))
			throw new Error(`condition ${condition.id} has no judgment`);
	validateGoalTaskCoverage(conditions, tasks, goalId);
	if (!integrationJudgment?.trim())
		throw new Error("top-level integration judgment is required");
	return judgments.map((judgment) => ({
		id: judgment.id,
		evidence: judgment.evidence.trim(),
		passed: judgment.passed,
	}));
}

function formatConditionEvidence(judgments: readonly GoalConditionJudgment[]): string {
	return judgments.length === 0
		? "None recorded (legacy goal without structured conditions)"
		: judgments
				.map(
					(judgment) =>
						`${judgment.id}: ${judgment.passed ? "passed" : "failed"} - ${judgment.evidence}`,
				)
				.join("; ");
}

function foregroundCloseout(
	goal: ForegroundGoal,
	summary: string,
	validation: string,
	gaps: string,
	nextSteps: string,
	conditionJudgments: readonly GoalConditionJudgment[],
	integrationJudgment: string,
): string {
	return [
		"# Goal Closeout",
		"",
		`- Goal source: ${goal.mode === "file" ? goal.path : "inline objective"}`,
		`- Goal hash: ${goal.hash}`,
		`- Condition evidence: ${formatConditionEvidence(conditionJudgments)}`,
		`- Integration judgment: ${integrationJudgment.trim() || "Not specified"}`,
		`- Accomplished work: ${summary.trim() || "Not specified"}`,
		`- Validation: ${validation.trim() || "Not specified"}`,
		"- Current state: goal marked complete and active state cleared",
		`- Known gaps: ${gaps.trim() || "None reported"}`,
		`- Next steps to consider: ${nextSteps.trim() || "None reported"}`,
	].join("\n");
}

function showGoal(pi: ExtensionAPI, text: string): void {
	pi.sendMessage(
		{ customType: "goal-status", content: text, display: true },
		{ triggerTurn: false },
	);
}

function goalJob(): LoopJob | undefined {
	if (!unattendedJobId) return undefined;
	try {
		return readLoopJob(unattendedJobId);
	} catch {
		return undefined;
	}
}

function currentActiveItem(goal: UnattendedGoal) {
	return Object.values(goal.items).find((item) => item.activeAttempt);
}

function planningToolAllowed(
	goal: ForegroundGoal,
	toolName: string,
	input: unknown,
): boolean {
	if (toolName === "subagent") return true;
	if ((toolName !== "edit" && toolName !== "write") || !isRecord(input))
		return false;
	const rawPath = input.path;
	if (typeof rawPath !== "string" || !goal.workspace || goal.plans?.length !== 1)
		return false;
	return (
		path.resolve(goal.workspace, rawPath) ===
		path.resolve(goal.workspace, goal.plans[0])
	);
}

function foregroundTaskGraphError(goal: ForegroundGoal): string | undefined {
	if (!goal.workspace || goal.plans?.length !== 1 || !goal.items)
		return "Foreground goal has no canonical plan and durable task mapping.";
	const plan = readLinkedPlan(path.resolve(goal.workspace, goal.plans[0]));
	for (const planTask of plan.tasks) {
		if (!planTask.required) continue;
		const item = goal.items[planTask.key];
		if (!item) return `Required plan task ${planTask.key} has no durable root task.`;
		const task = getTask(item.taskId);
		if (!task || task.parentId)
			return `Required plan task ${planTask.key} has an invalid durable root task.`;
	}
	return undefined;
}

function assertGoalTaskGraphReady(goal: UnattendedGoal): void {
	if (goal.conditionMode === "structured" && goal.conditions.length > 0) {
		validateGoalTaskCoverage(
			goal.conditions,
			Object.values(goal.items).map((item) => getTask(item.taskId) ?? {}),
			goal.id,
		);
	}
	const planTasks = goal.plans.flatMap((plan) =>
		readLinkedPlan(path.resolve(goal.workspace, plan)).tasks.map((task) => ({
			plan,
			task,
		})),
	);
	for (const { task: planTask } of planTasks) {
		if (!planTask.required) continue;
		const item = goal.items[planTask.key];
		if (!item || !item.required)
			throw new Error(
				`required plan task ${planTask.key} is not linked to a durable root task`,
			);
		const task = getTask(item.taskId);
		if (!task) throw new Error(`linked task not found: ${item.taskId}`);
		const expected = planTask.dependsOn
			.map((key) => goal.items[key]?.taskId)
			.filter((id): id is string => Boolean(id))
			.sort();
		if (expected.length !== planTask.dependsOn.length)
			throw new Error(`dependencies for ${planTask.key} are not fully linked`);
		const actual = [...(task.blockedBy ?? [])].sort();
		if (
			expected.length !== actual.length ||
			expected.some((id, index) => id !== actual[index])
		)
			throw new Error(
				`linked task ${planTask.key} does not match the plan dependency graph`,
			);
	}
}

function goalJobsForWorkspace(cwd: string): LoopJob[] {
	const direct = listWorkspaceGoalJobs(cwd);
	const canonical = fs.realpathSync(cwd);
	const owned = listLoopJobs().filter((job) => {
		const workspace = job.goal?.workspace;
		if (!workspace) return false;
		const ownership = readWorkflowOwnershipForWorktree(workspace);
		return ownership?.primaryWorktree === canonical;
	});
	return [...new Map([...direct, ...owned].map((job) => [job.id, job])).values()];
}

function selectWorkspaceGoalJob(cwd: string): LoopJob {
	const jobs = goalJobsForWorkspace(cwd);
	const active = jobs.filter((job) => job.goal?.state !== "completed");
	const selected = (active.length > 0 ? active : jobs).at(-1);
	if (!selected) throw new Error("No unattended goal exists in this workspace.");
	return selected;
}

function minimumPlanContent(goal: ForegroundGoal): string {
	return [
		"---",
		`created: ${goal.startedAt.slice(0, 10)}`,
		"status: draft",
		"completed:",
		"---",
		"",
		`# Plan: ${asciiBounded(goal.summary, 80) || "Complete goal"}`,
		"",
		"## Objective",
		"",
		`${asciiBounded(goal.preview, 500)} The /goal job owns this objective and completion contract.`,
		"",
		"## Completion Evidence",
		"",
		"Settle concise `Evidence:` and `Fails when:` statements with the operator before readiness. Do not infer materially ambiguous conditions.",
		"",
		"## Boundaries",
		"",
		"- In scope: The stated goal objective.",
		"- Out of scope: Unrequested adjacent work.",
		"- Preserve: Existing behavior outside the objective.",
		"- Assumptions: None.",
		"",
		"## Tasks",
		"",
		`- [ ] **T1: ${asciiBounded(goal.summary, 100) || "Deliver the stated objective"}**`,
		"  - Files: Determine the smallest owning paths during execution.",
		"  - Depends on: none",
		`  - Change: ${asciiBounded(goal.preview, 500)}`,
		"  - Done when: The stated objective is complete without unrelated changes.",
		"  - Verify: Record focused passing validation through goal_progress.",
		"",
		"## Validation",
		"",
		"- [ ] Focused check: Exercise the changed contract through its user entrypoint or closest exact check.",
		"  - Expected: The requested outcome works and unrelated behavior is preserved.",
		"",
		"## Retention",
		"",
		`Keep incomplete work at this path. After completion, archive this spec directory to .specs/archive/goal-${goal.id}/.`,
		"",
		"## Execution Status",
		"",
		"- State: planned, not started",
		"- Blocker: none",
		"- Next: T1",
		`- Resume: /do-it .specs/goal-${goal.id}/plan.md`,
		"",
	].join("\n");
}

function attachOrCreatePlanDetails(
	parsed: ParsedGoal,
	cwd: string,
): { plan: string; needsReview: boolean } {
	const root = fs.realpathSync(cwd);
	let sourcePlan: string | undefined;
	if (parsed.absolutePath) {
		if (path.basename(parsed.absolutePath).toLowerCase() === "plan.md")
			sourcePlan = parsed.absolutePath;
		else {
			const sibling = path.join(path.dirname(parsed.absolutePath), "plan.md");
			if (fs.existsSync(sibling) && fs.statSync(sibling).isFile())
				sourcePlan = fs.realpathSync(sibling);
		}
	}
	const sourceRelative = sourcePlan ? displayPath(sourcePlan, root) : undefined;
	if (
		sourcePlan &&
		/^\.specs\/(?!archive\/)[a-z0-9]+(?:-[a-z0-9]+)*\/plan\.md$/.test(
			sourceRelative ?? "",
		)
	) {
		const plan = sourceRelative as string;
		return { plan, needsReview: !validatePlanFile(root, plan).valid };
	}
	const objectiveRelative = parsed.absolutePath
		? displayPath(parsed.absolutePath, root)
		: undefined;
	const specMatch = objectiveRelative?.match(/^\.specs\/(?!archive\/)([^/]+)\//);
	const directory = specMatch
		? path.join(root, ".specs", specMatch[1])
		: path.join(root, ".specs", `goal-${parsed.goal.id}`);
	const planPath = path.join(directory, "plan.md");
	assertFuturePathContained(root, planPath);
	fs.mkdirSync(directory, { recursive: true });
	fs.writeFileSync(
		planPath,
		sourcePlan ? fs.readFileSync(sourcePlan, "utf8") : minimumPlanContent(parsed.goal),
		"utf8",
	);
	return { plan: displayPath(planPath, root), needsReview: true };
}

function attachOrCreatePlan(parsed: ParsedGoal, cwd: string): string {
	return attachOrCreatePlanDetails(parsed, cwd).plan;
}

function explicitlySuppliedPlan(parsed: ParsedGoal): boolean {
	return path.basename(parsed.absolutePath ?? "").toLowerCase() === "plan.md";
}

function materializeRawGoalTask(
	goal: ForegroundGoal,
	conditionDescriptions: readonly string[],
	workspace: string,
): {
	conditions: GoalCondition[];
	items: Record<string, ReturnType<typeof createGoalWorkItem>>;
} {
	if (conditionDescriptions.length === 0 || conditionDescriptions.length > 8)
		throw new Error("materialize_goal requires 1 to 8 settled condition descriptions");
	const conditions = reconcileGoalConditions(goal.conditions, conditionDescriptions.map((description) => asciiBounded(description, 500)));
	const taskWorkspace = resolveTaskWorkspace(workspace);
	const existing = listTasks({ workspace: taskWorkspace }).find(
		(task) =>
			!task.parentId &&
			task.metadata?.goalId === goal.id &&
			task.metadata?.goalItemKey === "GOAL",
	);
	let task = existing;
	if (!task) {
		const created = createTaskBatch(
			[
				{
					key: "GOAL",
					origin: "other",
					summary: goal.summary,
					instructions: `Done when: ${conditions.map((condition) => condition.description).join("; ")} Verify: Record separate condition evidence and integration judgment in goal_complete.`,
					workspace: taskWorkspace,
					boundary: ["."],
					goalId: goal.id,
					covers: conditions.map((condition) => condition.id),
					metadata: {
						goalId: goal.id,
						goalItemKey: "GOAL",
					},
				},
			],
			taskWorkspace,
		);
		if (created.outcome !== "persisted")
			throw new Error(
				`raw goal task creation failed during ${created.failedPhase}: ${created.error}`,
			);
		task = created.records[0];
	}
	if (!task) throw new Error("raw goal durable root task was not created");
	return {
		conditions,
		items: { GOAL: createGoalWorkItem("GOAL", task.id) },
	};
}

function planGoalConditions(workspace: string, planPath: string): GoalCondition[] {
	const content = fs.readFileSync(path.resolve(workspace, planPath), "utf8");
	const section = content.split("## Completion Evidence", 2)[1]?.split(/^## /m, 1)[0] ?? "";
	const descriptions = [...section.matchAll(/^\s*-\s+Evidence:\s*(\S.*)$/gim)].map(
		(match) => match[1].trim(),
	);
	return reconcileGoalConditions(undefined, descriptions);
}

function materializePlanTasks(
	goalId: string,
	objectiveHash: string,
	workspace: string,
	planPath: string,
	conditions: readonly GoalCondition[] = [],
): Record<string, ReturnType<typeof createGoalWorkItem>> {
	const plan = readLinkedPlan(path.resolve(workspace, planPath));
	const conditionIds = conditions.map((condition) => condition.id);
	const linkedCoverage = plan.tasks.map(() => ({ goalId, covers: conditionIds }));
	if (conditions.length > 0)
		validateGoalTaskCoverage(conditions, linkedCoverage, goalId);
	const taskNotes = (task: (typeof plan.tasks)[number]): string | undefined => {
		const notes = [
			task.doneWhen ? `Done when: ${task.doneWhen}` : "",
			task.verify ? `Verify: ${task.verify}` : "",
		]
			.filter(Boolean)
			.join(" ");
		return notes ? asciiBounded(notes, 500) : undefined;
	};
	if (plan.tasks.length === 0)
		throw new Error(`canonical plan has no executable tasks: ${planPath}`);
	const taskWorkspace = resolveTaskWorkspace(workspace);
	const candidates = listTasks({ workspace: taskWorkspace }).filter(
		(task) =>
			!task.parentId &&
			task.metadata?.canonicalPlanPath === planPath &&
			task.metadata?.goalObjectiveHash === objectiveHash,
	);
	const byKey = new Map<string, (typeof candidates)[number]>();
	for (const task of candidates) {
		const key = task.metadata?.planTaskKey;
		if (typeof key !== "string") continue;
		if (byKey.has(key))
			throw new Error(`multiple durable root tasks exist for plan key ${key}`);
		byKey.set(key, task);
	}
	const missing = plan.tasks.filter((task) => !byKey.has(task.key));
	if (conditions.length > 0)
		validateGoalTaskCoverage(
			conditions,
			[
				...candidates,
				...missing.map(() => ({ goalId, covers: conditionIds })),
			],
			goalId,
		);
	if (missing.length > 0) {
		const missingKeys = new Set(missing.map((task) => task.key));
		const created = createTaskBatch(
			missing.map((task) => ({
				key: task.key,
				origin: "other" as const,
				summary: task.summary,
				notes: taskNotes(task),
				workspace: taskWorkspace,
				scope: ["."],
				...(conditions.length > 0 ? { goalId, covers: conditionIds } : {}),
				metadata: {
					goalId,
					goalObjectiveHash: objectiveHash,
					canonicalPlanPath: planPath,
					planTaskKey: task.key,
					required: task.required,
				},
				blockedBy: task.dependsOn.flatMap((key) => {
					const dependency = byKey.get(key);
					return dependency ? [dependency.id] : [];
				}),
				blockedByKeys: task.dependsOn.filter((key) => missingKeys.has(key)),
			})),
			taskWorkspace,
		);
		if (created.outcome !== "persisted")
			throw new Error(
				`task graph creation failed during ${created.failedPhase}: ${created.error}`,
			);
		for (const task of created.records) {
			const key = task.metadata?.planTaskKey;
			if (typeof key === "string") byKey.set(key, task);
		}
	}
	const items: Record<string, ReturnType<typeof createGoalWorkItem>> = {};
	for (const planTask of plan.tasks) {
		const task = byKey.get(planTask.key);
		if (!task)
			throw new Error(`durable root task is missing for plan key ${planTask.key}`);
		const blockedBy = planTask.dependsOn.map((key) => {
			const dependency = byKey.get(key);
			if (!dependency)
				throw new Error(`durable dependency is missing for plan key ${key}`);
			return dependency.id;
		});
		updateTask(task.id, {
			blockedBy,
			notes: taskNotes(planTask),
			...(conditions.length > 0 ? { goalId, covers: conditionIds } : {}),
			metadata: {
				...(task.metadata ?? {}),
				goalId,
				goalObjectiveHash: objectiveHash,
				canonicalPlanPath: planPath,
				planTaskKey: planTask.key,
				required: planTask.required,
			},
		});
		items[planTask.key] = createGoalWorkItem(
			planTask.key,
			task.id,
			planTask.required,
		);
	}
	return items;
}

function createUnattendedGoal(
	parsed: ParsedGoal,
	cwd: string,
	plan: string,
): UnattendedGoal {
	const root = fs.realpathSync(cwd);
	const conditions = planGoalConditions(root, plan);
	const items = materializePlanTasks(
		parsed.goal.id,
		parsed.goal.hash,
		root,
		plan,
		conditions,
	);
	return {
		schemaVersion: 1,
		id: parsed.goal.id,
		mode: parsed.goal.mode,
		state: "running",
		startedAt: parsed.goal.startedAt,
		updatedAt: parsed.goal.updatedAt,
		workspace: root,
		scope: ["."],
		summary: parsed.goal.summary,
		preview: parsed.goal.preview,
		objectiveHash: parsed.goal.hash,
		...(parsed.goal.mode === "inline"
			? { objectiveText: parsed.objectiveText }
			: {
					objectivePath: parsed.goal.path,
					objectiveSizeBytes: parsed.goal.sizeBytes,
				}),
		plans: [plan],
		items,
		conditions,
		conditionMode: conditions.length > 0 ? "structured" : "legacy_compatibility",
		completionContract: {
			requireLinkedPlanTasks: true,
			requireLinkedRootTasks: true,
			requireValidationEvidence: true,
			requireRepositoryState: true,
		},
		validations: [],
		changedArtifacts: [],
		blockers: [],
		knownGaps: [],
	};
}

function derivedArchivedPlanPath(planPath: string): string | undefined {
	const normalized = planPath.replace(/\\/g, "/");
	const match = normalized.match(/^\.specs\/([^/]+)\/plan\.md$/);
	return match ? `.specs/archive/${match[1]}/plan.md` : undefined;
}

async function reconcileArchivedGoalPath(job: LoopJob): Promise<LoopJob> {
	const goal = job.goal;
	if (!goal || goal.archivedPlanPath || goal.plans.length !== 1) return job;
	const sourcePlan = goal.plans[0];
	const archivedPlan = derivedArchivedPlanPath(sourcePlan);
	if (!archivedPlan) return job;
	if (
		fs.existsSync(path.resolve(goal.workspace, sourcePlan)) ||
		!fs.existsSync(path.resolve(goal.workspace, archivedPlan))
	)
		return job;
	const sourceDirectory = path.posix.dirname(sourcePlan);
	const archivedDirectory = path.posix.dirname(archivedPlan);
	const objectivePath = goal.objectivePath;
	const archivedObjectivePath = objectivePath?.startsWith(`${sourceDirectory}/`)
		? `${archivedDirectory}/${objectivePath.slice(sourceDirectory.length + 1)}`
		: objectivePath;
	return updateLoopJob(job.id, (current) => ({
		...current,
		objectivePath: archivedObjectivePath,
		plans: [archivedPlan],
		goal: current.goal
			? {
					...current.goal,
					objectivePath: archivedObjectivePath,
					plans: [archivedPlan],
					archivedPlanPath: archivedPlan,
					closeoutState: "archived_pending_commit",
					updatedAt: nowIso(),
				}
			: undefined,
	}));
}

function isExpectedArchiveWorktree(
	goal: UnattendedGoal,
	porcelain: string,
): boolean {
	if (goal.closeoutState !== "archived_pending_commit" || !goal.archivedPlanPath)
		return false;
	const archivedDirectory = path.posix.dirname(goal.archivedPlanPath);
	const sourcePlan = goal.archivedPlanPath.replace(/^\.specs\/archive\//, ".specs/");
	const sourceDirectory = path.posix.dirname(sourcePlan);
	const paths = porcelain
		.split(/\r?\n/)
		.filter(Boolean)
		.flatMap((line) => line.slice(3).split(" -> "))
		.map((value) => value.replace(/^"|"$/g, "").replace(/\\/g, "/"));
	return (
		paths.length > 0 &&
		paths.every(
			(value) =>
				value === sourceDirectory ||
				value.startsWith(`${sourceDirectory}/`) ||
				value === archivedDirectory ||
				value.startsWith(`${archivedDirectory}/`),
		)
	);
}

function verifyObjective(goal: UnattendedGoal): string | undefined {
	if (goal.mode === "inline")
		return sha256(goal.objectiveText ?? "") === goal.objectiveHash
			? undefined
			: "persisted inline objective does not match its hash";
	if (!goal.objectivePath) return "file-backed objective path is missing";
	const candidate = path.resolve(goal.workspace, goal.objectivePath);
	if (!fs.existsSync(candidate)) return `objective file is missing: ${goal.objectivePath}`;
	const real = fs.realpathSync(candidate);
	if (!isContained(fs.realpathSync(goal.workspace), real))
		return "objective file escaped the workspace";
	return sha256(fs.readFileSync(real)) === goal.objectiveHash
		? undefined
		: `objective file hash changed: ${goal.objectivePath}`;
}

async function reconcileForResume(
	pi: ExtensionAPI,
	job: LoopJob,
): Promise<{ ok: true; job: LoopJob } | { ok: false; message: string }> {
	const activeJob = await reconcileArchivedGoalPath(job);
	if (!activeJob.goal)
		return { ok: false, message: "Loop job has no goal metadata." };
	const objectiveError = verifyObjective(activeJob.goal);
	if (objectiveError) return { ok: false, message: objectiveError };
	for (const plan of activeJob.goal.plans) {
		const candidate = path.resolve(activeJob.goal.workspace, plan);
		if (!fs.existsSync(candidate))
			return { ok: false, message: `Linked plan is missing: ${plan}` };
	}
	const status = await pi.exec("git", ["status", "--porcelain"], {
		cwd: activeJob.cwd,
		timeout: 30_000,
	});
	if (status.code !== 0)
		return {
			ok: false,
			message: status.stderr.trim() || "Unable to inspect repository state.",
		};
	if (
		status.stdout.trim() &&
		!isExpectedArchiveWorktree(activeJob.goal, status.stdout)
	) {
		await updateLoopJob(activeJob.id, (current) => ({
			...current,
			goal: current.goal
				? {
						...current.goal,
						state: "waiting_for_operator",
						updatedAt: nowIso(),
						blockers: [
							...new Set([
								...current.goal.blockers,
								"Interrupted modifying work left a dirty worktree; reconcile it before resume.",
							]),
						],
					}
				: undefined,
		}));
		return {
			ok: false,
			message:
				"Resume stopped: the worktree is dirty after an interrupted attempt. Reconcile it before retrying.",
		};
	}
	const reconciled = await updateLoopJob(activeJob.id, (current) => {
		if (!current.goal) return current;
		const items = { ...current.goal.items };
		let blockers = [...current.goal.blockers];
		for (const [key, item] of Object.entries(items)) {
			if (!item.activeAttempt) continue;
			const task = getTask(item.taskId);
			if (task?.state === "completed") {
				const settled = { ...item };
				delete settled.activeAttempt;
				items[key] = settled;
				continue;
			}
			// Assigned tasks remain assigned while interrupted work awaits reconciliation.
			const interruptedReason = `Work item ${key} was interrupted and was not replayed automatically.`;
			const settled = {
				...item,
				interruptedReason,
				interruptedStrategy: item.activeAttempt.strategy,
			};
			delete settled.activeAttempt;
			items[key] = settled;
			blockers.push(interruptedReason);
		}
		return {
			...current,
			goal: {
				...current.goal,
				items,
				blockers: [...new Set(blockers)],
				updatedAt: nowIso(),
			},
		};
	});
	return { ok: true, job: reconciled };
}

function strategyFrom(params: Record<string, unknown>): GoalStrategy {
	const raw = isRecord(params.strategy) ? params.strategy : {};
	return Object.fromEntries(
		Object.entries(raw).flatMap(([key, value]) =>
			typeof value === "string" ? [[key, value]] : [],
		),
	) as GoalStrategy;
}

function isSaferApprovalStrategy(
	candidate: GoalStrategy,
	denied: GoalStrategy,
): boolean {
	return (["capabilities", "toolApproach"] as const).some((key) => {
		const value = candidate[key]?.trim();
		return Boolean(value) && value !== denied[key]?.trim();
	});
}

function requiredString(
	params: Record<string, unknown>,
	key: string,
): string {
	const value = params[key];
	if (typeof value !== "string" || !value.trim())
		throw new Error(`${key} is required`);
	return value.trim();
}

function goalProgressResult(goal: UnattendedGoal, message: string) {
	const active = currentActiveItem(goal);
	const waiting = Object.values(goal.items).filter(
		(item) => item.phase === "needs_operator",
	);
	const nextAction = active
		? `Settle ${active.key} with goal_progress record_outcome.`
		: waiting.length === Object.keys(goal.items).length && waiting.length > 0
			? "Complete the recorded operator action for a waiting task."
			: "Select a dependency-ready root task and call goal_progress begin_attempt.";
	const report = {
		outcome: "persisted",
		command: "goal_progress",
		target: `goal ${goal.id}`,
		result: message,
		effect: `${Object.keys(goal.items).length} durable root task(s) are linked; ${waiting.length} wait for operator action.`,
		continues: goal.state === "running",
		nextAction,
	};
	return {
		content: [{ type: "text" as const, text: JSON.stringify(report) }],
		details: { goalId: goal.id, state: goal.state, ...report },
	};
}

async function updateCurrentGoal(
	update: (goal: UnattendedGoal) => UnattendedGoal,
): Promise<UnattendedGoal> {
	const job = goalJob();
	if (!job?.goal) throw new Error("No unattended /goal is active.");
	const next = await updateLoopJob(job.id, (current) => {
		if (!current.goal) throw new Error("Loop job lost its goal metadata.");
		if (current.goal.state === "completed")
			throw new Error("Completed goal state is immutable.");
		return { ...current, goal: update(current.goal) };
	});
	if (!next.goal) throw new Error("Loop job lost its goal metadata.");
	return next.goal;
}

function latestValidation(goal: UnattendedGoal) {
	const latest = new Map<string, (typeof goal.validations)[number]>();
	for (const validation of goal.validations)
		latest.set(validation.command, validation);
	return [...latest.values()];
}

async function verifyUnattendedCompletion(
	pi: ExtensionAPI,
	job: LoopJob,
): Promise<
	| { ok: false; blockers: string[] }
	| {
			ok: true;
			head: string;
			branch: string;
			worktree: string;
			artifacts: string[];
			validation: string;
	  }
> {
	const goal = job.goal;
	if (!goal) return { ok: false, blockers: ["goal metadata is missing"] };
	const blockers: string[] = [];
	const objectiveError = verifyObjective(goal);
	if (objectiveError) blockers.push(objectiveError);
	const requiredPlanKeys = new Set<string>();
	for (const plan of goal.plans) {
		try {
			const state = readLinkedPlan(path.resolve(goal.workspace, plan));
			blockers.push(...state.blockers.map((item) => `${plan}: ${item}`));
			for (const task of state.tasks)
				if (task.required) requiredPlanKeys.add(task.key);
		} catch (error) {
			blockers.push(
				`${plan}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
	const requiredItems = Object.values(goal.items).filter((item) => item.required);
	let latestRequiredTaskCompletion = "";
	if (requiredItems.length === 0)
		blockers.push("no required durable root task is linked");
	for (const key of requiredPlanKeys) {
		const item = goal.items[key];
		if (!item || !item.required)
			blockers.push(`${key}: required plan task has no required durable root task`);
	}
	for (const item of requiredItems) {
		const task = getTask(item.taskId);
		if (!task) blockers.push(`${item.key}: linked task ${item.taskId} is missing`);
		else if (task.workspace !== resolveTaskWorkspace(goal.workspace))
			blockers.push(`${item.key}: linked task belongs to another workspace`);
		else if (
			task.parentId ||
			task.origin === "subagent" ||
			task.execution ||
			task.agentName ||
			task.prompt
		)
			blockers.push(`${item.key}: linked task is not a durable root task`);
		else if (task.state !== "completed")
			blockers.push(`${item.key}: linked task is ${task.state}, not completed`);
		else if (!task.outcome?.summary || !task.outcome.evidence.length)
			blockers.push(`${item.key}: completed task has no bounded outcome evidence`);
		else if (task.endedAt && task.endedAt > latestRequiredTaskCompletion)
			latestRequiredTaskCompletion = task.endedAt;
		if (item.activeAttempt)
			blockers.push(`${item.key}: an attempt is still running`);
		if (item.phase === "needs_operator")
			blockers.push(`${item.key}: needs operator input`);
		if (item.interruptedReason)
			blockers.push(`${item.key}: interrupted work is not reconciled`);
		if (item.approvalGate)
			blockers.push(`${item.key}: permission decision is unresolved`);
	}
	const validations = latestValidation(goal);
	if (validations.length === 0)
		blockers.push("no relevant validation evidence is recorded");
	for (const evidence of validations) {
		if (!evidence.passed)
			blockers.push(`validation is failing: ${evidence.command}`);
		if (
			latestRequiredTaskCompletion &&
			evidence.recordedAt < latestRequiredTaskCompletion
		)
			blockers.push(
				`validation predates required task completion: ${evidence.command}`,
			);
	}
	if (goal.blockers.length > 0) blockers.push(...goal.blockers);

	const [head, branch, status] = await Promise.all([
		pi.exec("git", ["rev-parse", "HEAD"], { cwd: goal.workspace, timeout: 30_000 }),
		pi.exec("git", ["branch", "--show-current"], {
			cwd: goal.workspace,
			timeout: 30_000,
		}),
		pi.exec("git", ["status", "--porcelain"], {
			cwd: goal.workspace,
			timeout: 30_000,
		}),
	]);
	if (head.code !== 0) blockers.push("final Git HEAD could not be identified");
	if (branch.code !== 0) blockers.push("final Git branch could not be identified");
	if (status.code !== 0) blockers.push("final worktree state could not be identified");
	else if (status.stdout.trim()) blockers.push("final worktree is not clean");

	let artifacts: string[] = [];
	if (head.code === 0 && head.stdout.trim() !== job.initialHead) {
		const diff = await pi.exec(
			"git",
			["diff", "--name-only", `${job.initialHead}..${head.stdout.trim()}`],
			{ cwd: goal.workspace, timeout: 30_000 },
		);
		if (diff.code !== 0) blockers.push("changed artifacts could not be identified");
		else
			artifacts = diff.stdout
				.split(/\r?\n/)
				.map((item) => item.trim())
				.filter(Boolean);
	}
	for (const recorded of goal.changedArtifacts)
		if (!artifacts.includes(recorded))
			blockers.push(`recorded artifact is not in the final Git diff: ${recorded}`);
	if (blockers.length > 0) return { ok: false, blockers: [...new Set(blockers)] };

	return {
		ok: true,
		head: head.stdout.trim(),
		branch: branch.stdout.trim() || "(detached)",
		worktree: "clean",
		artifacts,
		validation: validations
			.map(
				(item) =>
					`${item.command}: passed${item.summary ? ` (${item.summary})` : ""}`,
			)
			.join("; "),
	};
}

function unattendedCloseout(input: {
	goal: UnattendedGoal;
	summary: string;
	artifacts: string[];
	validation: string;
	head: string;
	branch: string;
	worktree: string;
	gaps: string[];
	nextSteps: string;
	conditionJudgments: readonly GoalConditionJudgment[];
	integrationJudgment: string;
}): string {
	const objective =
		input.goal.mode === "file"
			? `${input.goal.objectivePath} (sha256 ${input.goal.objectiveHash})`
			: `${input.goal.summary} (sha256 ${input.goal.objectiveHash})`;
	return [
		"# Goal Closeout",
		"",
		`- Objective: ${objective}`,
		`- Condition evidence: ${formatConditionEvidence(input.conditionJudgments)}`,
		`- Integration judgment: ${input.integrationJudgment.trim()}`,
		`- Completed work: ${input.summary.trim()}`,
		`- Changed artifacts: ${input.artifacts.length > 0 ? input.artifacts.join(", ") : "None"}`,
		`- Validation: ${input.validation}`,
		`- Repository state: ${input.branch}@${input.head}; worktree ${input.worktree}`,
		`- Blockers or gaps: ${input.gaps.length > 0 ? input.gaps.join("; ") : "None"}`,
		`- Exact next action: ${input.nextSteps.trim() || "None - objective is complete."}`,
	].join("\n");
}

export const goalTestApi = {
	attachOrCreatePlan,
	createUnattendedGoal,
	goalFromInline,
	parseGoal,
	resolveGoalFile,
	restoreGoal,
	verifyObjective,
};

export default function (pi: ExtensionAPI) {
	onSessionStart(pi, import.meta.url, async (_event, ctx) => {
		observedSuccessfulCommands.clear();
		restoreGoal(ctx);
		const unattended = goalJob()?.goal;
		if (foregroundGoal || unattended) activateTools(pi, ["goal_complete"]);
		else deactivateTools(pi, ["goal_complete"]);
		if (unattended || foregroundGoal?.planning)
			activateTools(pi, ["goal_progress"]);
		else deactivateTools(pi, ["goal_progress"]);
	});

	pi.on("before_agent_start", async () => {
		const unattended = goalJob()?.goal;
		if (unattended) {
			activateTools(pi, GOAL_TOOLS);
			return undefined;
		}
		if (!foregroundGoal) return undefined;
		activateTools(
			pi,
			foregroundGoal.planning
				? ["goal_complete", "goal_progress"]
				: ["goal_complete"],
		);
		foregroundGoal = {
			...foregroundGoal,
			iterationCount: foregroundGoal.iterationCount + 1,
			updatedAt: nowIso(),
		};
		return undefined;
	});

	const registerContextHook = pi.on as unknown as (
		event: "context",
		handler: (
			event: { messages: Array<Record<string, unknown>> },
			ctx: { cwd: string },
		) => Promise<{ messages: Array<Record<string, unknown>> }>,
	) => void;
	registerContextHook("context", async (event) => {
		const unattended = goalJob()?.goal;
		const context = unattended
			? unattendedReminder(unattended)
			: foregroundGoal
				? foregroundReminder(foregroundGoal)
				: undefined;
		return { messages: replaceRuntimeContext(event.messages, "goal", context) };
	});

	pi.on("tool_call", (event) => {
		if (!MODIFYING_TOOLS.has(event.toolName)) return undefined;
		if (foregroundGoal) {
			if (!foregroundGoal.plans?.length) return undefined;
			if (
				foregroundGoal.planning &&
				planningToolAllowed(foregroundGoal, event.toolName, event.input)
			)
				return undefined;
			const error = foregroundTaskGraphError(foregroundGoal);
			return error ? { block: true, reason: error } : undefined;
		}
		const goal = goalJob()?.goal;
		if (!goal) return undefined;
		const active = currentActiveItem(goal);
		if (
			active?.activeAttempt?.ownerPid === process.pid &&
			active.activeAttempt.ownerInstanceId === PROCESS_INSTANCE_ID
		)
			return undefined;
		return {
			block: true,
			reason: active
				? "The active goal attempt belongs to an earlier Pi process. Call goal_progress reconcile before modifying work."
				: "Unattended goal work must link a durable root task and call goal_progress begin_attempt before a modifying-capable tool.",
		};
	});

	pi.on("tool_result", async (event) => {
		if (
			!event.isError &&
			(event.toolName === "bash" || event.toolName === "pwsh") &&
			isRecord(event.input) &&
			typeof event.input.command === "string"
		)
			observedSuccessfulCommands.add(event.input.command.trim());
		const decisionId = needsApprovalDecisionId(event.content);
		if (!decisionId) return undefined;
		const job = goalJob();
		const goal = job?.goal;
		const active = goal && currentActiveItem(goal);
		if (!job || !goal || !active) return undefined;
		const blocker = `Permission decision ${decisionId} blocks ${active.key}.`;
		// Assigned tasks remain assigned while permission approval is pending.
		await updateLoopJob(job.id, (current) => {
			if (!current.goal) return current;
			const item = current.goal.items[active.key];
			if (!item?.activeAttempt) return current;
			const settled = {
				...recordGoalOutcome(item, "damage_control_denied"),
				approvalGate: {
					decisionId,
					blocker,
					strategy:
						item.approvalGate?.strategy ?? item.activeAttempt.strategy,
					saferAlternativeUsed:
						item.approvalGate?.saferAlternativeUsed ?? false,
				},
			};
			return {
				...current,
				goal: {
					...current.goal,
					state: "waiting_for_operator",
					updatedAt: nowIso(),
					items: { ...current.goal.items, [active.key]: settled },
					blockers: [
						...new Set([
							...current.goal.blockers.filter(
								(existing) => existing !== item.approvalGate?.blocker,
							),
							blocker,
						]),
					],
				},
			};
		});
		return undefined;
	});

	pi.registerCommand("goal", {
		description:
			"Start, inspect, stop, or resume a foreground or unattended outcome goal.",
		handler: async (args: string, ctx) => {
			const trimmed = args.trim();
			try {
				if (trimmed === "status") {
					const job = selectWorkspaceGoalJob(ctx.cwd);
					const snapshot = inspectLoopJob(job);
					const goal = job.goal;
					showGoal(
						pi,
						[
							`Goal ${goal?.id ?? job.id}: ${snapshot.state}`,
							`Objective: ${goal?.summary ?? "unknown"}`,
							`Plans: ${job.plans.join(", ")}`,
							`Tasks: ${goal ? Object.keys(goal.items).length : 0}`,
							...(goal?.blockers.length
								? [`Blockers: ${goal.blockers.join("; ")}`]
								: []),
						].join("\n"),
					);
					return;
				}
				if (trimmed === "stop") {
					const job = selectWorkspaceGoalJob(ctx.cwd);
					if (job.goal?.state === "completed")
						throw new Error("A completed goal cannot be stopped.");
					await stopLoopJob(pi, job, true);
					showGoal(pi, `Goal ${job.goal?.id ?? job.id}: stopped`);
					return;
				}
				if (trimmed === "resume") {
					const prior = selectWorkspaceGoalJob(ctx.cwd);
					if (prior.goal?.state === "completed")
						throw new Error("A completed goal cannot be resumed.");
					if (inspectLoopJob(prior).alive)
						throw new Error(`Goal ${prior.goal?.id ?? prior.id} is already running.`);
					const reconciliation = await reconcileForResume(pi, prior);
					if (!reconciliation.ok) throw new Error(reconciliation.message);
					const started = await resumeLoopJob(reconciliation.job);
					unattendedJobId = started.id;
					await appendState(pi, stateEntry(null, { unattendedGoalId: started.id }));
					showGoal(
						pi,
						`Goal ${started.goal?.id ?? started.id}: running (PID ${started.pid}).`,
					);
					ctx.shutdown();
					return;
				}

				if (trimmed === "--unattended")
					throw new Error("Usage: /goal --unattended <objective-or-file>");
				const unattended = trimmed.startsWith("--unattended ");
				const objective = unattended
					? trimmed.slice("--unattended".length).trim()
					: trimmed;
				const invocationWorkspace = ctx.cwd ?? process.cwd();
				const suppliedPlan = objective.replace(/^@/, "").replace(/\\/g, "/");
				const suppliedSlug = workflowSlugFromPlan(suppliedPlan);
				const suppliedOwnership = suppliedSlug === "workflow"
					? undefined
					: readWorkflowOwnershipRecord(invocationWorkspace, suppliedSlug);
				const parsed = parseGoal(
					objective,
					suppliedOwnership?.state === "active"
						? suppliedOwnership.worktree
						: invocationWorkspace,
				);
				if (!parsed.ok) {
					ctx.ui.notify(parsed.message, "warning");
					return;
				}
				noteWorkflowSubmission(
					args.trim() ? `/goal ${args.trim()}` : "/goal",
					"explore",
				);
				observedSuccessfulCommands.clear();
				if (unattended && ctx.mode !== "tui" && ctx.mode !== "rpc")
					throw new Error("/goal --unattended requires TUI or RPC mode.");
				if (unattended) {
					const existing = goalJobsForWorkspace(ctx.cwd).find(
						(job) => job.goal?.state !== "completed",
					);
					if (existing)
						throw new Error(
							`Goal ${existing.goal?.id ?? existing.id} already owns this workspace. Use /goal status, /goal stop, or /goal resume.`,
						);
				}
				let workspace = fs.realpathSync(ctx.cwd);
				const ownerSlug = explicitlySuppliedPlan(parsed.parsed)
					? workflowSlugFromPlan(parsed.parsed.goal.plans?.[0] ?? "")
					: `goal-${parsed.parsed.goal.id.slice(0, 8)}`;
				const owned = await ensureWorkflowWorktree({
					cwd: workspace,
					workflow: "goal",
					workflowId: `goal:${parsed.parsed.goal.id}`,
					slug: ownerSlug === "workflow" ? `goal-${parsed.parsed.goal.id.slice(0, 8)}` : ownerSlug,
					runner: async (cwd, args) => {
						const result = await pi.exec("git", args, { cwd, timeout: 120_000 });
						return { code: result.code, stdout: result.stdout, stderr: result.stderr };
					},
				});
				workspace = owned.ownership.worktree;
				if (!unattended && !explicitlySuppliedPlan(parsed.parsed)) {
					foregroundGoal = {
						...parsed.parsed.goal,
						objectiveText: parsed.parsed.objectiveText,
						workspace,
					};
					unattendedJobId = null;
					activateTools(pi, ["goal_progress"]);
					deactivateTools(pi, ["goal_complete"]);
					await appendState(pi, stateEntry(foregroundGoal));
					await pi.sendUserMessage(`Raw goal recorded but not materialized. Work interactively and directly in this session. Preview: ${foregroundGoal.preview} Settle 1-8 observable condition descriptions, then call goal_progress with action materialize_goal.`);
					return;
				}
				const attached = attachOrCreatePlanDetails(parsed.parsed, workspace);
				const initialHeadResult = await pi.exec("git", ["rev-parse", "HEAD"], {
					cwd: workspace,
					timeout: 30_000,
				});
				foregroundGoal = {
					...parsed.parsed.goal,
					objectiveText: parsed.parsed.objectiveText,
					workspace,
					plans: [attached.plan],
					planning: attached.needsReview,
					requestedUnattended: unattended,
					...(initialHeadResult.code === 0 && initialHeadResult.stdout.trim()
						? { initialHead: initialHeadResult.stdout.trim() }
						: {}),
				};
				unattendedJobId = null;
				if (attached.needsReview) {
					pendingUnattendedContext = unattended ? ctx : null;
					await startPlanLifecycle(
						pi,
						`Review ${attached.plan} for /goal: ${parsed.parsed.goal.summary}`,
					);
					activateTools(pi, ["goal_complete", "goal_progress"]);
					await appendState(pi, stateEntry(foregroundGoal));
					await pi.sendUserMessage(
						[
							`Create or repair the reviewed canonical plan at ${attached.plan}.`,
							"Use plan_progress for draft, primary risk review, bounded material-risk review when required, adjudication, one repair or acceptance, final inspection, and ready.",
							"After plan_progress reaches ready, call goal_progress with action materialize_plan. Do not begin modifying implementation work before that call succeeds.",
						].join("\n"),
					);
					return;
				}
				if (!unattended) {
					const items = materializePlanTasks(
						foregroundGoal.id,
						foregroundGoal.hash,
						workspace,
						attached.plan,
					);
					foregroundGoal = { ...foregroundGoal, items, planning: false };
					activateTools(pi, ["goal_complete"]);
					deactivateTools(pi, ["goal_progress"]);
					await appendState(pi, stateEntry(foregroundGoal));
					await pi.sendUserMessage(startupPrompt(foregroundGoal));
					return;
				}
				const goal = createUnattendedGoal(
					parsed.parsed,
					workspace,
					attached.plan,
				);
				const started = await startLoopJob(pi, ctx, [attached.plan], {
					goal,
					requireTui: false,
				});
				foregroundGoal = null;
				unattendedJobId = started.id;
				activateTools(pi, GOAL_TOOLS);
				await appendState(pi, stateEntry(null, { unattendedGoalId: started.id }));
				showGoal(
					pi,
					`Goal ${goal.id}: running through detached loop ${started.id}. Pi will exit so the unattended worker can take over this worktree.`,
				);
				ctx.shutdown();
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				showGoal(pi, `Goal error: ${message}`);
				ctx.ui.notify(message, "error");
			}
		},
	});

	pi.registerTool({
		name: "goal_progress",
		label: "Goal Progress",
		description: "Record progress and evidence for the active goal.",
		parameters: Type.Object(
			{
				action: StringEnum([
					"link_tasks",
					"begin_attempt",
					"record_outcome",
					"re_evaluate",
					"validation",
					"artifacts",
					"blocker",
					"resolve_blocker",
					"gap",
					"reconcile",
					"wait",
					"materialize_plan",
					"materialize_goal",
				] as const),
				key: Type.Optional(Type.String()),
				taskId: Type.Optional(Type.String()),
				required: Type.Optional(Type.Boolean()),
				items: Type.Optional(
					Type.Array(
						Type.Object({
							key: Type.String(),
							taskId: Type.String(),
							required: Type.Optional(Type.Boolean()),
						}),
						{ maxItems: 16 },
					),
				),
				strategy: Type.Optional(
					Type.Object({
						agent: Type.Optional(Type.String()),
						capabilities: Type.Optional(Type.String()),
						evidenceSource: Type.Optional(Type.String()),
						inputPartition: Type.Optional(Type.String()),
						testedAssumption: Type.Optional(Type.String()),
						toolApproach: Type.Optional(Type.String()),
						validationMethod: Type.Optional(Type.String()),
					}),
				),
				outcome: Type.Optional(StringEnum(FAILURE_OUTCOMES)),
				evidence: Type.Optional(Type.String()),
				assumptions: Type.Optional(Type.String()),
				message: Type.Optional(Type.String()),
				conditions: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 500 }), { minItems: 1, maxItems: 8 })),
				waitReason: Type.Optional(StringEnum(WAIT_REASONS)),
				operatorAction: Type.Optional(Type.String({ maxLength: 500 })),
				command: Type.Optional(Type.String()),
				passed: Type.Optional(Type.Boolean()),
				summary: Type.Optional(Type.String()),
				paths: Type.Optional(Type.Array(Type.String(), { maxItems: 64 })),
			},
			{ additionalProperties: false },
		),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			try {
				const input = params as Record<string, unknown>;
				const action = requiredString(input, "action");
				if (action === "materialize_goal") {
					if (!foregroundGoal) throw new Error("No raw foreground goal is active.");
					if (foregroundGoal.plans?.length || foregroundGoal.items)
						throw new Error("This goal is already materialized or plan-backed.");
					if (!Array.isArray(input.conditions))
						throw new Error("materialize_goal requires settled condition descriptions");
					const pending = foregroundGoal;
					const raw = materializeRawGoalTask(pending, input.conditions as string[], pending.workspace ?? ctx.cwd);
					foregroundGoal = { ...pending, conditions: raw.conditions, conditionMode: "structured", items: raw.items, updatedAt: nowIso() };
					await appendState(pi, stateEntry(foregroundGoal));
					deactivateTools(pi, ["goal_progress"]);
					activateTools(pi, ["goal_complete"]);
					await pi.sendUserMessage(startupPrompt(foregroundGoal));
					return {
						content: [{ type: "text" as const, text: "Materialized one durable root task from settled goal conditions." }],
						details: { goalId: foregroundGoal.id, state: "running", taskCount: 1 },
					};
				}
				if (action === "materialize_plan") {
					if (!foregroundGoal?.planning || foregroundGoal.plans?.length !== 1)
						throw new Error("No /goal plan is awaiting materialization.");
					const planPath = foregroundGoal.plans[0];
					const lifecycle = currentPlanLifecycle(pi);
					if (lifecycle?.stage !== "ready" || lifecycle.planPath !== planPath)
						throw new Error(
							"The matching /plan-it lifecycle must reach ready before task materialization.",
						);
					const pending = foregroundGoal;
					const workspace = pending.workspace ?? ctx.cwd;
					const conditions = reconcileGoalConditions(
						pending.conditions,
						planGoalConditions(workspace, planPath).map((condition) => condition.description),
					);
					foregroundGoal = {
						...pending,
						conditions,
						conditionMode: conditions.length > 0 ? "structured" : "legacy_compatibility",
						updatedAt: nowIso(),
					};
					await appendState(pi, stateEntry(foregroundGoal));
					const items = materializePlanTasks(
						pending.id,
						pending.hash,
						workspace,
						planPath,
						conditions,
					);
					foregroundGoal = {
						...pending,
						items,
						conditions,
						conditionMode: conditions.length > 0 ? "structured" : "legacy_compatibility",
						planning: false,
						updatedAt: nowIso(),
					};
					if (pending.requestedUnattended) {
						if (!pendingUnattendedContext)
							throw new Error(
								"The unattended /goal command context is unavailable; restart /goal planning in this session.",
							);
						const parsed: ParsedGoal = {
							goal: foregroundGoal,
							startupPrompt: startupPrompt(foregroundGoal),
							objectiveText: pending.objectiveText ?? "",
						};
						const goal = createUnattendedGoal(parsed, workspace, planPath);
						const started = await startLoopJob(
							pi,
							pendingUnattendedContext,
							[planPath],
							{ goal, requireTui: false },
						);
						pendingUnattendedContext = null;
						foregroundGoal = null;
						unattendedJobId = started.id;
						activateTools(pi, GOAL_TOOLS);
						await appendState(pi, stateEntry(null, { unattendedGoalId: started.id }));
						ctx.shutdown();
						return goalProgressResult(
							goal,
							`materialized ${Object.keys(items).length} root task(s) from ${planPath} and started detached goal ${started.id}`,
						);
					}
					deactivateTools(pi, ["goal_progress"]);
					await appendState(pi, stateEntry(foregroundGoal));
					await pi.sendUserMessage(startupPrompt(foregroundGoal));
					return {
						content: [
							{
								type: "text" as const,
								text: `Materialized ${Object.keys(items).length} durable root task(s) from ${planPath}. Foreground execution continues with the dependency-ready task.`,
							},
						],
						details: {
							goalId: foregroundGoal.id,
							state: "executing",
							planPath,
						},
					};
				}
				if (action === "link_tasks") {
					const links = Array.isArray(input.items)
						? input.items
						: [
								{
									key: requiredString(input, "key"),
									taskId: requiredString(input, "taskId"),
									required: input.required,
								},
							];
					const job = goalJob();
					if (!job?.goal) throw new Error("No unattended /goal is active.");
					const planTasks = new Map(
						job.goal.plans.flatMap((plan) =>
							readLinkedPlan(
								path.resolve(job.goal?.workspace ?? job.cwd, plan),
							).tasks.map(
								(task) => [task.key, { plan, task }] as const,
							),
						),
					);
					const additions: Record<string, ReturnType<typeof createGoalWorkItem>> = {};
					for (const raw of links) {
						if (!isRecord(raw)) throw new Error("linked task must be an object");
						const key = requiredString(raw, "key");
						const taskId = requiredString(raw, "taskId");
						const planned = planTasks.get(key);
						if (!planned)
							throw new Error(`linked task key is absent from the plans: ${key}`);
						const { plan, task: planTask } = planned;
						const task = getTask(taskId);
						if (!task) throw new Error(`linked task not found: ${taskId}`);
						if (
							task.parentId ||
							task.origin === "subagent" ||
							task.execution ||
							task.agentName ||
							task.prompt
						)
							throw new Error(`linked task is not a durable root task: ${taskId}`);
						if (task.state === "completed")
							throw new Error(`completed task cannot be newly linked: ${taskId}`);
						if (
							(typeof task.metadata?.goalId === "string" &&
								task.metadata.goalId !== job.goal.id) ||
							(typeof task.metadata?.goalItemKey === "string" &&
								task.metadata.goalItemKey !== key)
						)
							throw new Error(`task already belongs to different goal work: ${taskId}`);
						if (task.workspace !== resolveTaskWorkspace(job.goal.workspace))
							throw new Error(`linked task belongs to another workspace: ${taskId}`);
						const required = planTask.required || raw.required !== false;
						const existing = job.goal.items[key];
						if (
							existing &&
							(existing.taskId !== taskId || existing.required !== required)
						)
							throw new Error(
								`goal work item ${key} is already linked and cannot be replaced`,
							);
						updateTask(taskId, {
							metadata: {
								...(task.metadata ?? {}),
								goalId: job.goal.id,
								canonicalPlanPath: plan,
								planTaskKey: key,
								goalItemKey: key,
								required,
							},
						});
						additions[key] =
							existing ?? createGoalWorkItem(key, taskId, required);
					}
					const goal = await updateCurrentGoal((current) => ({
						...current,
						updatedAt: nowIso(),
						items: { ...current.items, ...additions },
					}));
					return goalProgressResult(goal, `linked ${links.length} root task(s)`);
				}
				if (action === "begin_attempt") {
					const key = requiredString(input, "key");
					const goal = await updateCurrentGoal((current) => {
						assertGoalTaskGraphReady(current);
						if (currentActiveItem(current))
							throw new Error("another work item already has an active attempt");
						const item = current.items[key];
						if (!item) throw new Error(`goal work item not found: ${key}`);
						const task = getTask(item.taskId);
						if (!task) throw new Error(`linked task not found: ${item.taskId}`);
						if (task.state === "completed")
							throw new Error(`linked task ${item.taskId} is already completed`);
						if (item.interruptedReason)
							throw new Error(
								`work item ${key} requires explicit reconciliation before replay`,
							);
						const strategy = strategyFrom(input);
						let candidate = item;
						if (item.approvalGate) {
							if (item.approvalGate.saferAlternativeUsed)
								throw new Error(
									`work item ${key} already used its one safer alternative and needs operator input`,
								);
							if (!isSaferApprovalStrategy(strategy, item.approvalGate.strategy))
								throw new Error(
									"A permission-blocked item may try only one materially different safer alternative.",
								);
							candidate = {
								...candidate,
								approvalGate: {
									...item.approvalGate,
									saferAlternativeUsed: true,
								},
							};
						}
						if (item.reconciledInterruptedStrategy) {
							if (
								!goalStrategiesMateriallyDiffer(
									strategy,
									item.reconciledInterruptedStrategy,
								)
							)
								throw new Error(
									"A reconciled interrupted attempt must use a materially different strategy.",
								);
							candidate = { ...candidate };
							delete candidate.reconciledInterruptedStrategy;
						}
						const next = beginGoalAttempt(candidate, {
							attemptId: randomUUID(),
							ownerPid: process.pid,
							ownerInstanceId: PROCESS_INSTANCE_ID,
							startedAt: nowIso(),
							strategy,
						});
						if (["unassigned", "failed"].includes(task.state)) {
							const started = startTask(item.taskId);
							if (started.outcome !== "persisted")
								throw new Error(
									started.error ?? `linked task ${item.taskId} is not ready`,
								);
						}
						return {
							...current,
							state: "running",
							updatedAt: nowIso(),
							items: { ...current.items, [key]: next },
						};
					});
					return goalProgressResult(goal, `began attempt for ${key}`);
				}
				if (action === "record_outcome") {
					const key = requiredString(input, "key");
					const outcome = requiredString(input, "outcome") as GoalFailureOutcome;
					if (!FAILURE_OUTCOMES.includes(outcome))
						throw new Error(`unknown outcome: ${outcome}`);
					const goal = await updateCurrentGoal((current) => {
						const item = current.items[key];
						if (!item) throw new Error(`goal work item not found: ${key}`);
						const next = recordGoalOutcome(item, outcome);
						let blockers = current.blockers;
						if (outcome === "success" && next.approvalGate) {
							blockers = blockers.filter(
								(blocker) => blocker !== next.approvalGate?.blocker,
							);
							delete next.approvalGate;
						} else if (next.approvalGate?.saferAlternativeUsed) {
							// Assigned tasks remain assigned while approval is pending.
						}
						if (next.phase === "needs_operator") {
							// Assigned tasks remain assigned while operator input is pending.
							blockers = [
								...new Set([
									...blockers,
									`${key}: ${next.needsOperatorReason}`,
								]),
							];
						}
						return {
							...current,
							updatedAt: nowIso(),
							items: { ...current.items, [key]: next },
							blockers,
						};
					});
					return goalProgressResult(goal, `recorded ${outcome} for ${key}`);
				}
				if (action === "re_evaluate") {
					const key = requiredString(input, "key");
					const goal = await updateCurrentGoal((current) => {
						const item = current.items[key];
						if (!item) throw new Error(`goal work item not found: ${key}`);
						return {
							...current,
							updatedAt: nowIso(),
							items: {
								...current.items,
								[key]: recordGoalReEvaluation(item, {
									evidence: requiredString(input, "evidence"),
									assumptions: requiredString(input, "assumptions"),
									strategy: requiredString(input, "message"),
									at: nowIso(),
								}),
							},
						};
					});
					return goalProgressResult(goal, `recorded re-evaluation for ${key}`);
				}
				if (action === "wait") {
					const key = requiredString(input, "key");
					const reason = requiredString(input, "waitReason") as GoalWaitReason;
					if (!WAIT_REASONS.includes(reason))
						throw new Error(`unknown terminal wait reason: ${reason}`);
					const goal = await updateCurrentGoal((current) => {
						const item = current.items[key];
						if (!item) throw new Error(`goal work item not found: ${key}`);
						const next = recordGoalWait(item, {
							reason,
							evidence: requiredString(input, "evidence"),
							operatorAction: requiredString(input, "operatorAction"),
							at: nowIso(),
						});
						// Assigned tasks remain assigned while operator input is pending.
						return {
							...current,
							updatedAt: nowIso(),
							items: { ...current.items, [key]: next },
							blockers: [
								...new Set([
									...current.blockers,
									`${key}: ${next.needsOperatorReason}; operator action: ${next.wait?.operatorAction}`,
								]),
							],
						};
					});
					return goalProgressResult(
						goal,
						`${key} is waiting because ${reason}; independent ready tasks may continue`,
					);
				}
				if (action === "validation") {
					const command = requiredString(input, "command");
					if (typeof input.passed !== "boolean")
						throw new Error("passed is required");
					if (input.passed && !observedSuccessfulCommands.has(command))
						throw new Error(
							"passing validation must match a successful bash or pwsh result observed in this Pi process",
						);
					const goal = await updateCurrentGoal((current) => ({
						...current,
						updatedAt: nowIso(),
						validations: [
							...current.validations,
							{
								command: bounded(command, 500),
								passed: input.passed as boolean,
								recordedAt: nowIso(),
								...(typeof input.summary === "string"
									? { summary: bounded(input.summary, 500) }
									: {}),
							},
						],
					}));
					return goalProgressResult(goal, `recorded validation: ${command}`);
				}
				if (action === "artifacts") {
					if (!Array.isArray(input.paths)) throw new Error("paths is required");
					const job = goalJob();
					if (!job?.goal) throw new Error("No unattended /goal is active.");
					const paths = input.paths.map((raw) => {
						if (typeof raw !== "string") throw new Error("artifact path must be a string");
						const absolute = path.resolve(job.goal?.workspace ?? job.cwd, raw);
						if (!isContained(job.goal?.workspace ?? job.cwd, absolute))
							throw new Error(`artifact escaped the workspace: ${raw}`);
						return displayPath(absolute, job.goal?.workspace ?? job.cwd);
					});
					const goal = await updateCurrentGoal((current) => ({
						...current,
						updatedAt: nowIso(),
						changedArtifacts: [...new Set([...current.changedArtifacts, ...paths])],
					}));
					return goalProgressResult(goal, `recorded ${paths.length} artifact(s)`);
				}
				if (
					action === "blocker" ||
					action === "resolve_blocker" ||
					action === "gap"
				) {
					const message = requiredString(input, "message");
					const boundedMessage = bounded(message, 500);
					const goal = await updateCurrentGoal((current) => {
						const item =
							action === "resolve_blocker" && typeof input.key === "string"
								? current.items[input.key]
								: undefined;
						if (item?.approvalGate)
							throw new Error(
								"A permission-decision gate cannot be cleared by generic blocker resolution. Complete the one safer alternative successfully or stop the goal for operator handling.",
							);
						return {
							...current,
							updatedAt: nowIso(),
							...(action === "blocker"
								? {
										blockers: [
											...new Set([...current.blockers, boundedMessage]),
										],
									}
								: action === "resolve_blocker"
									? {
											blockers: current.blockers.filter(
												(item) => item !== boundedMessage,
											),
										}
									: {
											knownGaps: [
												...new Set([
													...current.knownGaps,
													boundedMessage,
												]),
											],
										}),
						};
					});
					return goalProgressResult(goal, `recorded ${action}`);
				}
				if (action === "reconcile") {
					const key = requiredString(input, "key");
					const goal = await updateCurrentGoal((current) => {
						const item = current.items[key];
						if (!item) throw new Error(`goal work item not found: ${key}`);
						if (!item.activeAttempt && !item.interruptedReason)
							return current;
						const reconciliationEvidence = requiredString(input, "message");
						// Assigned tasks remain assigned during reconciliation.
						const interruptedStrategy =
							item.interruptedStrategy ?? item.activeAttempt?.strategy;
						const settled = { ...item };
						delete settled.activeAttempt;
						const interruptedReason = settled.interruptedReason;
						delete settled.interruptedReason;
						delete settled.interruptedStrategy;
						if (interruptedStrategy)
							settled.reconciledInterruptedStrategy = interruptedStrategy;
						return {
							...current,
							updatedAt: nowIso(),
							items: { ...current.items, [key]: settled },
							blockers: interruptedReason
								? current.blockers.filter(
										(blocker) => blocker !== interruptedReason,
									)
								: current.blockers,
						};
					});
					return goalProgressResult(goal, `reconciled ${key} without replay`);
				}
				throw new Error(`unknown goal_progress action: ${action}`);
			} catch (error) {
				return formatToolError(
					error instanceof Error ? error.message : String(error),
				);
			}
		},
	});

	pi.registerTool({
		name: "goal_complete",
		label: "Complete Goal",
		description: "Verify and complete the active goal with evidence.",
		promptSnippet: "Verify and complete the active goal",
		promptGuidelines: [
			"Call goal_complete only after every current goal condition has passed with observable evidence and the result composes into the requested outcome.",
		],
		parameters: Type.Object({
			summary: Type.String({
				description: "Concise summary of completed work",
			}),
			conditionJudgments: Type.Optional(
				Type.Array(
					Type.Object({
						id: Type.String({ description: "Current goal condition ID" }),
						evidence: Type.String({ description: "Observable evidence" }),
						passed: Type.Boolean({ description: "Whether the condition passed" }),
					}),
				),
			),
			integrationJudgment: Type.Optional(
				Type.String({ description: "Top-level judgment that the condition evidence composes into the goal" }),
			),
			validation: Type.Optional(
				Type.String({
					description: "Validation commands or checks that passed",
				}),
			),
			knownGaps: Type.Optional(
				Type.String({ description: "Known gaps, if any" }),
			),
			nextSteps: Type.Optional(
				Type.String({ description: "Optional next steps to consider" }),
			),
		}),
		async execute(_toolCallId, params) {
			if (foregroundGoal) {
				try {
					validateGoalCompletionEvidence(
						foregroundGoal.conditions,
						foregroundGoal.conditionMode,
						params.conditionJudgments,
						params.integrationJudgment,
						Object.values(foregroundGoal.items ?? {}).map(
							(item) => getTask(item.taskId) ?? {},
						),
						foregroundGoal.id,
					);
				} catch (error) {
					return formatToolError(
						`Goal completion rejected: ${error instanceof Error ? error.message : String(error)}`,
					);
				}
				if (!foregroundGoal.plans?.length && foregroundGoal.items) {
					const blockers: string[] = [];
					for (const item of Object.values(foregroundGoal.items)) {
						const record = getTask(item.taskId);
						if (!record) blockers.push(`${item.key}: durable root task is missing`);
						else if (record.state !== "completed")
							blockers.push(`${item.key}: durable root task is ${record.state}, not completed`);
						else if (!record.outcome?.summary || !record.outcome.evidence.length)
							blockers.push(`${item.key}: completed task has no bounded outcome evidence`);
					}
					if (blockers.length > 0)
						return formatToolError(
							`Goal completion rejected:\n- ${blockers.join("\n- ")}`,
							{ details: { blockers } },
						);
				}
				if (
					foregroundGoal.workspace &&
					foregroundGoal.plans?.length === 1 &&
					foregroundGoal.items
				) {
					const blockers: string[] = [];
					const plan = readLinkedPlan(
						path.resolve(foregroundGoal.workspace, foregroundGoal.plans[0]),
					);
					blockers.push(...plan.blockers);
					for (const task of plan.tasks) {
						if (!task.required) continue;
						const item = foregroundGoal.items[task.key];
						const record = item ? getTask(item.taskId) : null;
						if (!record)
							blockers.push(`${task.key}: durable root task is missing`);
						else if (!["completed", "skipped"].includes(record.state))
							blockers.push(
								`${task.key}: durable root task is ${record.state}`,
							);
						else if (
							record.state === "completed" &&
							(!record.outcome?.summary || !record.outcome.evidence.length)
						)
							blockers.push(
								`${task.key}: completed task has no bounded outcome evidence`,
							);
					}
					if (blockers.length > 0)
						return formatToolError(
							`Goal completion rejected:\n- ${blockers.join("\n- ")}`,
							{ details: { blockers } },
						);
					let closeoutVerificationWorkspace = foregroundGoal.workspace;
					if (!foregroundGoal.archivedPlanPath) {
						const slug = workflowSlugFromPlan(foregroundGoal.plans[0]);
						const ownership = readWorkflowOwnershipRecord(path.dirname(path.dirname(foregroundGoal.workspace)), slug);
						closeoutVerificationWorkspace = ownership?.primaryWorktree ?? foregroundGoal.workspace;
						if (ownership?.state === "active") {
							await closeWorkflowWorktree({
									worktree: { ownership, resumed: true },
									planPath: foregroundGoal.plans[0],
									archivePlan: (cwd, planPath) => { archiveCompletedPlan(cwd, planPath); },
									runner: async (cwd, args) => {
										const result = await pi.exec("git", args, { cwd, timeout: 120_000 });
										return { code: result.code, stdout: result.stdout, stderr: result.stderr };
									},
								});
						} else {
							archiveCompletedPlan(foregroundGoal.workspace, foregroundGoal.plans[0]);
						}
						const archivedPlan = `.specs/archive/${slug}/plan.md`;
						foregroundGoal = {
							...foregroundGoal,
							plans: [archivedPlan],
							archivedPlanPath: archivedPlan,
							closeoutState: "archived_pending_commit",
							updatedAt: nowIso(),
						};
						await appendState(pi, stateEntry(foregroundGoal));
					}
					if (!foregroundGoal) throw new Error("foreground goal disappeared during closeout");
					const archivedInHead = await pi.exec(
						"git",
						["cat-file", "-e", `HEAD:${foregroundGoal.archivedPlanPath}`],
						{ cwd: closeoutVerificationWorkspace, timeout: 30_000 },
					);
					if (archivedInHead.code !== 0)
						return formatToolError(
							`Goal completion rejected: final HEAD does not contain ${foregroundGoal.archivedPlanPath}.`,
						);
				}
				if (foregroundGoal.workspace) {
					const ownership = readWorkflowOwnershipForWorktree(foregroundGoal.workspace);
					if (ownership?.state === "active") {
						await closeWorkflowWorktree({
							worktree: { ownership, resumed: true },
							runner: async (cwd, args) => {
								const result = await pi.exec("git", args, { cwd, timeout: 120_000 });
								return { code: result.code, stdout: result.stdout, stderr: result.stderr };
							},
						});
					}
				}
				const completed = {
					...foregroundGoal,
					status: "completed" as const,
					updatedAt: nowIso(),
				};
				const report = foregroundCloseout(
					completed,
					params.summary,
					params.validation ?? "",
					params.knownGaps ?? "",
					params.nextSteps ?? "",
					params.conditionJudgments ?? [],
					params.integrationJudgment ?? "",
				);
				foregroundGoal = null;
				deactivateTools(pi, GOAL_TOOLS);
				await appendState(
					pi,
					stateEntry(null, {
						completedAt: completed.updatedAt,
						closeout: report,
					}),
				);
				return {
					content: [{ type: "text" as const, text: report }],
					details: undefined,
				};
			}

			const job = goalJob();
			if (!job?.goal)
				return formatToolError("No active /goal is currently running.");
			let conditionJudgments: GoalConditionJudgment[] = [];
			let conditionError: string | undefined;
			try {
				conditionJudgments = validateGoalCompletionEvidence(
					job.goal.conditions,
					job.goal.conditionMode,
					params.conditionJudgments,
					params.integrationJudgment,
					Object.values(job.goal.items).map(
						(item) => getTask(item.taskId) ?? {},
					),
					job.goal.id,
				);
			} catch (error) {
				conditionError = error instanceof Error ? error.message : String(error);
			}
			if (!job.goal.archivedPlanPath) {
				const verification = await verifyUnattendedCompletion(pi, job);
				if (!verification.ok) {
					const blockers = conditionError
						? [...verification.blockers, conditionError]
						: verification.blockers;
					return formatToolError(
						`Goal completion rejected:\n- ${blockers.join("\n- ")}`,
						{ details: { blockers } },
					);
				}
				if (conditionError)
					return formatToolError(`Goal completion rejected: ${conditionError}`);
				if (job.goal.plans.length !== 1)
					return formatToolError(
						"Goal completion requires exactly one canonical plan.",
					);
				const slug = workflowSlugFromPlan(job.goal.plans[0]);
				const ownership = readWorkflowOwnershipForWorktree(job.goal.workspace);
				if (!ownership || ownership.state !== "active")
					return formatToolError("Goal completion requires its active owned workflow worktree.");
				const sourcePlan = job.goal.plans[0];
				const archivedPlan = `.specs/archive/${slug}/plan.md`;
				const sourceDirectory = path.posix.dirname(sourcePlan);
				const archivedDirectory = path.posix.dirname(archivedPlan);
				const objectivePath = job.goal.objectivePath;
				const archivedObjectivePath = objectivePath?.startsWith(`${sourceDirectory}/`)
					? `${archivedDirectory}/${objectivePath.slice(sourceDirectory.length + 1)}`
					: objectivePath;
				const closed = await closeWorkflowWorktree({
					worktree: { ownership, resumed: true },
					planPath: sourcePlan,
					archivePlan: (cwd, planPath) => { archiveCompletedPlan(cwd, planPath); },
					runner: async (cwd, args) => {
						const result = await pi.exec("git", args, { cwd, timeout: 120_000 });
						return { code: result.code, stdout: result.stdout, stderr: result.stderr };
					},
				});
				if (!closed.mergedHead)
					return formatToolError("Goal closeout did not produce a verified merged HEAD.");
				const diff = await pi.exec(
					"git",
					["diff", "--name-only", `${job.initialHead}..${closed.mergedHead}`],
					{ cwd: closed.primaryWorktree, timeout: 30_000 },
				);
				if (diff.code !== 0)
					return formatToolError("Goal closeout could not identify merged artifacts.");
				const artifacts = diff.stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
				const suppliedGaps = (params.knownGaps ?? "").trim();
				const gaps = [...job.goal.knownGaps];
				if (suppliedGaps && !/^none(?: reported)?$/i.test(suppliedGaps)) gaps.push(suppliedGaps);
				const completedAt = nowIso();
				const completedGoal = {
					...job.goal,
					workspace: closed.primaryWorktree,
					objectivePath: archivedObjectivePath,
					plans: [archivedPlan],
					archivedPlanPath: archivedPlan,
					state: "completed" as const,
					updatedAt: completedAt,
					completedAt,
					finalHead: closed.mergedHead,
					finalBranch: closed.primaryBranch,
					finalWorktree: "clean",
					changedArtifacts: artifacts,
					knownGaps: [...new Set(gaps)],
					blockers: [],
				};
				const report = unattendedCloseout({
					goal: completedGoal,
					summary: params.summary,
					artifacts,
					validation: verification.validation,
					head: closed.mergedHead,
					branch: closed.primaryBranch,
					worktree: "clean",
					gaps: [...new Set(gaps)],
					nextSteps: params.nextSteps ?? "",
					conditionJudgments,
					integrationJudgment: params.integrationJudgment ?? "",
				});
				await updateLoopJob(job.id, (current) => ({
					...current,
					objectivePath: archivedObjectivePath,
					plans: [archivedPlan],
					goal: { ...completedGoal, closeout: report },
				}));
				unattendedJobId = null;
				deactivateTools(pi, GOAL_TOOLS);
				await appendState(pi, stateEntry(null, { completedAt, closeout: report }));
				return { content: [{ type: "text" as const, text: report }], details: undefined };
			}
			const verification = await verifyUnattendedCompletion(pi, job);
			if (!verification.ok) {
				const blockers = conditionError
					? [...verification.blockers, conditionError]
					: verification.blockers;
				return formatToolError(
					`Goal completion rejected:\n- ${blockers.join("\n- ")}`,
					{ details: { blockers } },
				);
			}
			if (conditionError)
				return formatToolError(`Goal completion rejected: ${conditionError}`);
			if (!verification.artifacts.includes(job.goal.archivedPlanPath))
				return formatToolError(
					`Goal completion rejected:\n- final HEAD does not contain the archived plan: ${job.goal.archivedPlanPath}`,
				);
			const suppliedGaps = (params.knownGaps ?? "").trim();
			const gaps = [...job.goal.knownGaps];
			if (suppliedGaps && !/^none(?: reported)?$/i.test(suppliedGaps))
				gaps.push(suppliedGaps);
			const completedAt = nowIso();
			const report = unattendedCloseout({
				goal: job.goal,
				summary: params.summary,
				artifacts: verification.artifacts,
				validation: verification.validation,
				head: verification.head,
				branch: verification.branch,
				worktree: verification.worktree,
				gaps: [...new Set(gaps)],
				nextSteps: params.nextSteps ?? "",
				conditionJudgments,
				integrationJudgment: params.integrationJudgment ?? "",
			});
			await updateLoopJob(job.id, (current) => ({
				...current,
				goal: current.goal
					? {
							...current.goal,
							state: "completed",
							updatedAt: completedAt,
							completedAt,
							finalHead: verification.head,
							finalBranch: verification.branch,
							finalWorktree: verification.worktree,
							changedArtifacts: verification.artifacts,
							knownGaps: [...new Set(gaps)],
							blockers: [],
							closeout: report,
						}
					: undefined,
			}));
			unattendedJobId = null;
			deactivateTools(pi, GOAL_TOOLS);
			await appendState(
				pi,
				stateEntry(null, { completedAt, closeout: report }),
			);
			return {
				content: [{ type: "text" as const, text: report }],
				details: { goalId: job.goal.id, state: "completed" },
			};
		},
	});
}

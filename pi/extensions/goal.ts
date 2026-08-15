import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { formatToolError } from "../lib/extension-utils.js";
import {
	beginGoalAttempt,
	createGoalWorkItem,
	type GoalFailureOutcome,
	type GoalMode,
	type GoalStrategy,
	goalStrategiesMateriallyDiffer,
	recordGoalOutcome,
	recordGoalReEvaluation,
	type UnattendedGoal,
} from "../lib/goal-state.js";
import { readLinkedPlan } from "../lib/plan-state.js";
import {
	getTask,
	resolveTaskWorkspace,
	safeTransitionTask,
	startTask,
	updateTask,
} from "../lib/task-registry.js";
import { activateTools, deactivateTools } from "../lib/tool-activation.js";
import { noteWorkflowSubmission } from "../lib/workflow-friction.js";
import {
	inspectLoopJob,
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
	"subagent_chain",
	"subagent_continue",
	"subagent_fanout",
	"subagent_workflow",
]);
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
				? (goal as ForegroundGoal)
				: null;
		if (!unattendedJobId && typeof data.unattendedGoalId === "string")
			unattendedJobId = data.unattendedGoalId;
		return;
	}
}

function startupPrompt(goal: ForegroundGoal): string {
	const source = goal.mode === "file" ? `file: ${goal.path}` : "inline objective";
	return [
		"Active goal started. Work until the requested outcome is complete, use only checks relevant to that outcome, then call goal_complete.",
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
		"Active /goal reminder: keep working until the requested outcome is complete, check only the changed contract, then call goal_complete.",
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

function foregroundCloseout(
	goal: ForegroundGoal,
	summary: string,
	validation: string,
	gaps: string,
	nextSteps: string,
): string {
	return [
		"# Goal Closeout",
		"",
		`- Goal source: ${goal.mode === "file" ? goal.path : "inline objective"}`,
		`- Goal hash: ${goal.hash}`,
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

function selectWorkspaceGoalJob(cwd: string): LoopJob {
	const jobs = listWorkspaceGoalJobs(cwd);
	const active = jobs.filter((job) => job.goal?.state !== "completed");
	const selected = (active.length > 0 ? active : jobs).at(-1);
	if (!selected) throw new Error("No unattended goal exists in this workspace.");
	return selected;
}

function minimumPlanContent(goal: ForegroundGoal): string {
	return [
		"---",
		`created: ${goal.startedAt.slice(0, 10)}`,
		"status: active",
		"---",
		"",
		`# Plan: ${asciiBounded(goal.summary, 80) || "Complete goal"}`,
		"",
		"## Objective",
		"",
		`Complete unattended goal ${goal.id}. The /goal job owns the full objective and completion contract.`,
		"",
		"## Tasks",
		"",
		"- [ ] **T1: Complete the goal objective**",
		"  - State: pending",
		"  - Verify: Record focused passing validation through goal_progress.",
		"",
		"## Execution Status",
		"",
		"- State: pending",
		"- Blocker: none",
		"- Next: T1",
		"",
	].join("\n");
}

function attachOrCreatePlan(parsed: ParsedGoal, cwd: string): string {
	const root = fs.realpathSync(cwd);
	if (parsed.absolutePath) {
		if (path.basename(parsed.absolutePath).toLowerCase() === "plan.md")
			return displayPath(parsed.absolutePath, root);
		const sibling = path.join(path.dirname(parsed.absolutePath), "plan.md");
		if (fs.existsSync(sibling) && fs.statSync(sibling).isFile())
			return displayPath(fs.realpathSync(sibling), root);
	}
	const directory = parsed.absolutePath
		? path.dirname(parsed.absolutePath)
		: path.join(root, ".specs", `goal-${parsed.goal.id}`);
	if (!isContained(root, path.resolve(directory)))
		throw new Error("Generated goal plan must stay under the workspace.");
	const planPath = path.join(directory, "plan.md");
	assertFuturePathContained(root, planPath);
	fs.mkdirSync(directory, { recursive: true });
	fs.writeFileSync(planPath, minimumPlanContent(parsed.goal), "utf8");
	return displayPath(planPath, root);
}

function createUnattendedGoal(
	parsed: ParsedGoal,
	cwd: string,
	plan: string,
): UnattendedGoal {
	const root = fs.realpathSync(cwd);
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
		items: {},
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
	if (!job.goal) return { ok: false, message: "Loop job has no goal metadata." };
	const objectiveError = verifyObjective(job.goal);
	if (objectiveError) return { ok: false, message: objectiveError };
	for (const plan of job.goal.plans) {
		const candidate = path.resolve(job.goal.workspace, plan);
		if (!fs.existsSync(candidate))
			return { ok: false, message: `Linked plan is missing: ${plan}` };
	}
	const status = await pi.exec("git", ["status", "--porcelain"], {
		cwd: job.cwd,
		timeout: 30_000,
	});
	if (status.code !== 0)
		return {
			ok: false,
			message: status.stderr.trim() || "Unable to inspect repository state.",
		};
	if (status.stdout.trim()) {
		await updateLoopJob(job.id, (current) => ({
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
	const reconciled = await updateLoopJob(job.id, (current) => {
		if (!current.goal) return current;
		const items = { ...current.goal.items };
		let blockers = [...current.goal.blockers];
		for (const [key, item] of Object.entries(items)) {
			if (item.phase === "needs_operator") {
				const reset = {
					...item,
					phase: "re_evaluation_required" as const,
					recoveryStrategies: [],
				};
				delete reset.needsOperatorReason;
				items[key] = reset;
				blockers = blockers.filter(
					(blocker) =>
						blocker !== `${key}: ${item.needsOperatorReason ?? ""}`,
				);
			}
			if (!item.activeAttempt) continue;
			const task = getTask(item.taskId);
			if (task?.state === "completed") {
				const settled = { ...item };
				delete settled.activeAttempt;
				items[key] = settled;
				continue;
			}
			if (task?.state === "running")
				safeTransitionTask(item.taskId, "blocked", {
					blockReason: "Interrupted attempt requires reconciliation before replay.",
				});
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
	return {
		content: [
			{
				type: "text" as const,
				text: JSON.stringify({
					outcome: "persisted",
					goalId: goal.id,
					state: goal.state,
					message,
				}),
			},
		],
		details: { goalId: goal.id, state: goal.state },
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
}): string {
	const objective =
		input.goal.mode === "file"
			? `${input.goal.objectivePath} (sha256 ${input.goal.objectiveHash})`
			: `${input.goal.summary} (sha256 ${input.goal.objectiveHash})`;
	return [
		"# Goal Closeout",
		"",
		`- Objective: ${objective}`,
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
	pi.on("session_start", async (_event, ctx) => {
		observedSuccessfulCommands.clear();
		restoreGoal(ctx);
		const unattended = goalJob()?.goal;
		if (foregroundGoal || unattended) activateTools(pi, ["goal_complete"]);
		else deactivateTools(pi, ["goal_complete"]);
		if (unattended) activateTools(pi, ["goal_progress"]);
		else deactivateTools(pi, ["goal_progress"]);
	});

	pi.on("before_agent_start", async (event) => {
		const unattended = goalJob()?.goal;
		if (unattended) {
			activateTools(pi, GOAL_TOOLS);
			return {
				systemPrompt: `${event.systemPrompt}\n\n${unattendedReminder(unattended)}`,
			};
		}
		if (!foregroundGoal) return undefined;
		activateTools(pi, ["goal_complete"]);
		foregroundGoal = {
			...foregroundGoal,
			iterationCount: foregroundGoal.iterationCount + 1,
			updatedAt: nowIso(),
		};
		return {
			systemPrompt: `${event.systemPrompt}\n\n${foregroundReminder(foregroundGoal)}`,
		};
	});

	pi.on("tool_call", (event) => {
		const goal = goalJob()?.goal;
		if (!goal || !MODIFYING_TOOLS.has(event.toolName)) return undefined;
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
		if (getTask(active.taskId)?.state === "running")
			safeTransitionTask(active.taskId, "blocked", {
				blockReason: `Permission decision ${decisionId} requires operator approval.`,
			});
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
				const parsed = parseGoal(objective, ctx.cwd ?? process.cwd());
				if (!parsed.ok) {
					ctx.ui.notify(parsed.message, "warning");
					return;
				}
				noteWorkflowSubmission(
					args.trim() ? `/goal ${args.trim()}` : "/goal",
					"explore",
				);
				observedSuccessfulCommands.clear();
				if (!unattended) {
					foregroundGoal = parsed.parsed.goal;
					unattendedJobId = null;
					activateTools(pi, ["goal_complete"]);
					deactivateTools(pi, ["goal_progress"]);
					await appendState(pi, stateEntry(foregroundGoal));
					await pi.sendUserMessage(parsed.parsed.startupPrompt);
					return;
				}
				if (ctx.mode !== "tui" && ctx.mode !== "rpc")
					throw new Error("/goal --unattended requires TUI or RPC mode.");
				const existing = listWorkspaceGoalJobs(ctx.cwd).find(
					(job) => job.goal?.state !== "completed",
				);
				if (existing)
					throw new Error(
						`Goal ${existing.goal?.id ?? existing.id} already owns this workspace. Use /goal status, /goal stop, or /goal resume.`,
					);
				const plan = attachOrCreatePlan(parsed.parsed, ctx.cwd);
				const goal = createUnattendedGoal(parsed.parsed, ctx.cwd, plan);
				const started = await startLoopJob(pi, ctx, [plan], {
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
		description:
			"Persist unattended goal task links, attempt outcomes, recovery state, validation, artifacts, blockers, and gaps.",
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
				command: Type.Optional(Type.String()),
				passed: Type.Optional(Type.Boolean()),
				summary: Type.Optional(Type.String()),
				paths: Type.Optional(Type.Array(Type.String(), { maxItems: 64 })),
			},
			{ additionalProperties: false },
		),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			try {
				const input = params as Record<string, unknown>;
				const action = requiredString(input, "action");
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
							).tasks.map((task) => [task.key, task] as const),
						),
					);
					const additions: Record<string, ReturnType<typeof createGoalWorkItem>> = {};
					for (const raw of links) {
						if (!isRecord(raw)) throw new Error("linked task must be an object");
						const key = requiredString(raw, "key");
						const taskId = requiredString(raw, "taskId");
						const planTask = planTasks.get(key);
						if (!planTask)
							throw new Error(`linked task key is absent from the plans: ${key}`);
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
						if (["pending", "blocked", "failed"].includes(task.state)) {
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
							const task = getTask(next.taskId);
							if (task?.state === "running")
								safeTransitionTask(next.taskId, "blocked", {
									blockReason:
										"The one safer alternative did not resolve the approval-blocked item.",
								});
						}
						if (next.phase === "needs_operator") {
							const task = getTask(next.taskId);
							if (task?.state === "running")
								safeTransitionTask(next.taskId, "blocked", {
									blockReason: next.needsOperatorReason,
								});
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
						const task = getTask(item.taskId);
						if (!item.activeAttempt && !item.interruptedReason)
							return current;
						const reconciliationEvidence = requiredString(input, "message");
						if (task?.state === "running")
							safeTransitionTask(item.taskId, "blocked", {
								blockReason: bounded(reconciliationEvidence, 500),
							});
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
		description:
			"Verify and complete the active /goal, returning an evidence-backed closeout report.",
		promptSnippet:
			"Verify and complete the active /goal with a structured closeout report.",
		promptGuidelines: [
			"Call goal_complete only after the requested outcome is complete and checks relevant to the changed contract have passed.",
		],
		parameters: Type.Object({
			summary: Type.String({
				description: "Concise summary of completed work",
			}),
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
			const verification = await verifyUnattendedCompletion(pi, job);
			if (!verification.ok)
				return formatToolError(
					`Goal completion rejected:\n- ${verification.blockers.join("\n- ")}`,
					{ details: { blockers: verification.blockers } },
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

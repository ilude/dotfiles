import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { formatToolError } from "../lib/extension-utils.js";
import { wrapCommandRegistration } from "../lib/slash-command-echo.js";
import { noteWorkflowSubmission } from "../lib/workflow-friction.js";

const GOAL_STATE_TYPE = "local-goal-state";
const INLINE_LIMIT = 15_000;
const FILE_LIMIT_BYTES = 256 * 1024;
const PREVIEW_LIMIT = 500;
const SUMMARY_LIMIT = 240;
const PATH_LIKE_PATTERN = /[\\/]|\.(md|txt)$/i;
const TEXT_EXTENSIONS = new Set([".md", ".txt"]);

type GoalMode = "inline" | "file";
type GoalStatus = "active" | "completed";

type ActiveGoal = {
	id: string;
	mode: GoalMode;
	status: GoalStatus;
	startedAt: string;
	updatedAt: string;
	iterationCount: number;
	summary: string;
	preview: string;
	hash: string;
	path?: string;
	sizeBytes?: number;
};

type GoalStateEntry = {
	goal: ActiveGoal | null;
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

let activeGoal: ActiveGoal | null = null;

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

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
): { ok: true; goal: ActiveGoal } | { ok: false; message: string } {
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

function goalFromFile(filePath: string, cwd: string): ActiveGoal {
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
):
	| { ok: true; goal: ActiveGoal; startupPrompt: string }
	| { ok: false; message: string } {
	const trimmed = args.trim();
	if (pathModeCandidate(trimmed)) {
		const resolved = resolveGoalFile(trimmed, cwd);
		if (!resolved.ok) return resolved;
		const goal = goalFromFile(resolved.filePath, fs.realpathSync(cwd));
		return { ok: true, goal, startupPrompt: startupPrompt(goal) };
	}
	const inline = goalFromInline(trimmed);
	if (!inline.ok) return inline;
	return {
		ok: true,
		goal: inline.goal,
		startupPrompt: startupPrompt(inline.goal),
	};
}

function stateEntry(
	goal: ActiveGoal | null,
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
	if (typeof entry.content === "string")
		return JSON.parse(entry.content) as unknown;
	return entry.content;
}

function restoreGoal(ctx: GoalCommandContext): void {
	const entries =
		ctx?.sessionManager?.getBranch?.() ??
		ctx?.sessionManager?.getEntries?.() ??
		[];
	if (!Array.isArray(entries)) return;
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const data = entryData(entries[index]);
		if (!isRecord(data) || !("goal" in data)) continue;
		const goal = data.goal;
		activeGoal =
			isRecord(goal) && goal.status === "active" ? (goal as ActiveGoal) : null;
		return;
	}
}

function startupPrompt(goal: ActiveGoal): string {
	const source =
		goal.mode === "file" ? `file: ${goal.path}` : "inline objective";
	return [
		"Active goal started. Work until the requested outcome is complete, use only checks relevant to that outcome, then call goal_complete.",
		`Source: ${source}`,
		`Hash: ${goal.hash}`,
		`Preview: ${goal.preview}`,
	].join("\n");
}

function reminderPrompt(goal: ActiveGoal): string {
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

function closeout(
	goal: ActiveGoal,
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
		`- Current state: goal marked complete and active state cleared`,
		`- Known gaps: ${gaps.trim() || "None reported"}`,
		`- Next steps to consider: ${nextSteps.trim() || "None reported"}`,
	].join("\n");
}

export const goalTestApi = {
	parseGoal,
	reminderPrompt,
	restoreGoal,
	goalFromInline,
	resolveGoalFile,
};

export default function (pi: ExtensionAPI) {
	wrapCommandRegistration(pi);
	pi.on("session_start", async (_event, ctx) => {
		restoreGoal(ctx);
	});

	pi.on("before_agent_start", async (event) => {
		if (!activeGoal) return undefined;
		activeGoal = {
			...activeGoal,
			iterationCount: activeGoal.iterationCount + 1,
			updatedAt: nowIso(),
		};
		return {
			systemPrompt: `${event.systemPrompt}\n\n${reminderPrompt(activeGoal)}`,
		};
	});

	pi.registerCommand("goal", {
		description:
			"Start a local active goal from inline text or a workspace .md/.txt file.",
		handler: async (args: string, ctx) => {
			const parsed = parseGoal(args, ctx.cwd ?? process.cwd());
			if (!parsed.ok) {
				ctx?.ui?.notify?.(parsed.message, "warning");
				return;
			}
			noteWorkflowSubmission(
				args.trim() ? `/goal ${args.trim()}` : "/goal",
				"explore",
			);
			activeGoal = parsed.goal;
			await appendState(pi, stateEntry(activeGoal));
			if (typeof pi.sendUserMessage === "function")
				await pi.sendUserMessage(parsed.startupPrompt);
			else if (ctx?.ui?.notify) ctx.ui.notify(parsed.startupPrompt, "info");
		},
	});

	pi.registerTool({
		name: "goal_complete",
		label: "Complete Goal",
		description:
			"Mark the active /goal complete and return a structured closeout report.",
		promptSnippet:
			"Mark the active /goal complete with a structured closeout report.",
		promptGuidelines: [
			"Call this after the requested outcome is complete and checks relevant to the changed contract have passed.",
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
		async execute(_toolCallId, params, _signal, _onUpdate) {
			if (!activeGoal)
				return formatToolError("No active /goal is currently running.");
			const completed = {
				...activeGoal,
				status: "completed" as const,
				updatedAt: nowIso(),
			};
			const report = closeout(
				completed,
				params.summary,
				params.validation ?? "",
				params.knownGaps ?? "",
				params.nextSteps ?? "",
			);
			activeGoal = null;
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
		},
	});
}

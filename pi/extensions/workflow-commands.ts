/**
 * Workflow Commands Extension
 *
 * Registers shared slash commands. Most commands load skill template files and
 * dispatch them via sendUserMessage(). `/commit` uses the same prompt-dispatch
 * path so it can stay flexible for complex worktrees.
 *
 *   /commit        -- smart git commit with secret scanning
 *   /new-terminal  -- open a plain shell in this cwd in a new terminal
 *   /plan-it       -- crystallize conversation context into an executable plan
 *   /prd-it        — refine fuzzy ideas into an optional PRD artifact
 *   /review-it     — adversarial review of a plan file
 *   /do-it         — smart task routing by complexity
 *   /research      — parallel multi-angle research on a topic
 *   /summarize     — concise session recap and workflow friction notes
 *   /exit          — gracefully quit pi
 */

// Convention exception: direct ctx.ui.notify calls in slash-command flows.
// Risk: notification wording could drift from the rest of the extension set
//   if helper format changes; today uiNotify only adds an extension prefix
//   that would be redundant since the user typed the slash command to trigger
//   each flow.
// Why shared helper is inappropriate: a `[workflow-commands]` prefix on every
//   /commit / /plan-it / /review-it status line would echo back the slash
//   command name and add visual noise to user-facing command output.

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	type Api,
	completeSimple,
	type Model,
	type TextContent,
} from "@earendil-works/pi-ai";
import type {
	ContextUsage,
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { Key, Text } from "@earendil-works/pi-tui";
import { emitTerminalBell } from "../lib/extension-utils";
import { resolveCommitPlanningModelFromRegistry } from "../lib/model-routing";
import { withTimingSpan } from "../lib/observability";
import {
	buildCommitPlanningPrompt,
	buildGitlabTicketPrompt,
	buildSecretReviewPrompt,
	buildSkillPrompt,
} from "../lib/workflow-commands/prompts";
import { startWorkflowEpisode } from "../lib/workflow-telemetry";
import {
	clearCodexStatusNewSessionSuppression,
	showCodexStatus,
	suppressNextCodexStatusOnNewSession,
} from "./codex-status";
import { isOperatorReloadNeeded } from "./operator-status";

const SKILLS_DIR = path.join(
	os.homedir(),
	".dotfiles",
	"pi",
	"skills",
	"workflow",
);
const CONVENTIONAL_TYPES = [
	"feat",
	"fix",
	"docs",
	"chore",
	"refactor",
	"test",
	"perf",
	"ci",
	"build",
	"deps",
	"wip",
];
const CONVENTIONAL_COMMIT_RE = new RegExp(
	`^(${CONVENTIONAL_TYPES.join("|")})(\\([^)]+\\))?: [a-z0-9].{0,71}$`,
);

const COMMIT_RUNTIME_PATH_PATTERNS = [
	{ label: "Pi runtime cache", regex: /^pi\/cache(?:\/|$)/ },
	{ label: "runtime log directory", regex: /(?:^|\/)logs?\// },
	{ label: "runtime trace directory", regex: /(?:^|\/)traces?\// },
	{ label: "JSONL runtime log", regex: /\.jsonl$/ },
	{ label: "log file", regex: /\.log$/ },
	{ label: "DuckDB database", regex: /\.(?:duckdb|db)$/ },
];

export const SECRET_PATTERNS = [
	{ label: "OpenAI-style key", regex: /\bsk-[A-Za-z0-9_-]{10,}\b/g },
	{ label: "AWS access key", regex: /\bAKIA[A-Z0-9]{16}\b/g },
	{ label: "Private key / certificate", regex: /-----BEGIN(?: [A-Z]+)?-----/g },
	{ label: "GitHub PAT", regex: /\bghp_[A-Za-z0-9]{20,}\b/g },
	{
		label: "GitHub fine-grained PAT",
		regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
	},
	{ label: "npm token", regex: /\bnpm_[A-Za-z0-9]{20,}\b/g },
	{ label: "Slack bot token", regex: /\bxoxb-[A-Za-z0-9-]{10,}\b/g },
	{ label: "Slack user token", regex: /\bxoxp-[A-Za-z0-9-]{10,}\b/g },
	{
		label: "JWT",
		regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\b/g,
	},
	{
		label: "Hardcoded password/token/secret/key",
		regex:
			/(?:^|[^A-Za-z0-9])[A-Za-z_]*(?:PASSWORD|TOKEN|SECRET|API[_-]?KEY)[A-Za-z_]*\s*[:=]/gim,
	},
];

function loadSkill(name: string) {
	const skillPath = path.join(SKILLS_DIR, name);
	try {
		return fs.readFileSync(skillPath, "utf-8");
	} catch (err) {
		throw new Error(`Failed to load skill ${name} from ${skillPath}: ${err}`);
	}
}

async function newSessionWithReloadIfNeeded(
	ctx: Pick<ExtensionCommandContext, "newSession">,
	options?: Parameters<ExtensionCommandContext["newSession"]>[0],
) {
	const reloadNeeded = isOperatorReloadNeeded();
	if (
		!reloadNeeded &&
		!options?.parentSession &&
		!options?.withSession &&
		!options?.setup
	) {
		return ctx.newSession();
	}
	return ctx.newSession({
		parentSession: options?.parentSession,
		setup: options?.setup,
		withSession: async (newCtx) => {
			await options?.withSession?.(newCtx);
			if (reloadNeeded && !options?.withSession) {
				await newCtx.reload();
			}
		},
	});
}

function formatUsageTokens(tokens: number): string {
	if (tokens < 1_000) return String(tokens);
	if (tokens < 1_000_000) return `${Math.round(tokens / 1_000)}k`;
	const millions = tokens / 1_000_000;
	return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`;
}

function formatClearedSessionUsage(
	usage: ContextUsage | undefined,
): string | null {
	if (!usage || usage.tokens === null || usage.contextWindow <= 0) return null;
	const percent = usage.percent ?? (usage.tokens / usage.contextWindow) * 100;
	const tokens = formatUsageTokens(usage.tokens);
	const contextWindow = formatUsageTokens(usage.contextWindow);
	return `Previous session usage: ${Math.round(percent)}% (${tokens}/${contextWindow} tokens)`;
}

function loadClaudeCommitInstructions() {
	const instructionsPath = path.join(
		os.homedir(),
		".dotfiles",
		"claude",
		"shared",
		"commit-instructions.md",
	);
	try {
		return fs.readFileSync(instructionsPath, "utf-8");
	} catch (err) {
		throw new Error(
			`Failed to load Claude commit instructions from ${instructionsPath}: ${err}`,
		);
	}
}

interface CommitPlanGroup {
	files: string[];
	subject: string;
	body?: string;
}

interface CommitPlan {
	groups: CommitPlanGroup[];
	warnings?: string[];
}

interface GitRunResult {
	code: number;
	stdout: string;
	stderr: string;
}

interface SecretCandidate {
	path: string;
	label: string;
	match: string;
	line: number;
	context: string;
}

interface SecretReviewFinding {
	path: string;
	label: string;
	classification: "likely_secret" | "example" | "ambiguous";
	reason: string;
	match?: string;
}

interface SecretReviewResult {
	findings: SecretReviewFinding[];
}

export interface UntrackedClassification {
	path: string;
	decision: "ignore" | "do_not_ignore";
	confidence: number;
	reason: string;
	gitignorePattern?: string;
}

export interface UntrackedClassificationPlan {
	accepted: UntrackedClassification[];
	needsUserDecision: UntrackedClassification[];
}

export interface StagingPlan {
	addArgs: string[];
	rmCachedArgs: string[];
	unsafe: string[];
	useBroadAdd: boolean;
}

interface CommitActivity {
	setPhase(message?: string): void;
	logCommand(command: string, result?: GitRunResult): void;
	logInfo(message: string): void;
	finish(): void;
}

interface WorkflowUi {
	notify(message: string, level?: string): void;
	select?(
		message: string,
		options: string[],
	): Promise<string | null | undefined>;
	setStatus?(key: string, value: string | undefined): void;
	setWidget?(
		key: string,
		value: string[] | undefined,
		options?: { placement?: string },
	): void;
}

interface WorkflowSessionManager {
	getLeafId?(): string | null | undefined;
	createBranchedSession?(leafId: string): string | null | undefined;
}

interface WorkflowModelRegistry {
	getAvailable(): Model<Api>[];
	getApiKeyAndHeaders(model: Model<Api>): Promise<{
		ok?: boolean;
		error?: string;
		apiKey?: string;
		headers?: Record<string, string>;
	}>;
}

interface WorkflowContext {
	cwd: string;
	ui: WorkflowUi;
	modelRegistry: WorkflowModelRegistry;
	getSystemPrompt?: () => string | undefined;
	signal?: AbortSignal;
	sessionManager?: WorkflowSessionManager;
}

interface SlashEchoExtensionAPI extends ExtensionAPI {
	__slashEchoRegisterCommandWrapped?: boolean;
}

const CLEAR_USAGE_TYPE = "workflow-clear-usage";
const COMMIT_ACTIVITY_TYPE = "workflow-commit-activity";
const SLASH_ECHO_TYPE = "slash-echo";
const SUMMARIZE_PROMPT = `Summarize the work done in this session as a compact handoff note.

Use this structure when applicable:

1. Start with the primary artifact/path or main outcome in a short sentence.
2. Include links/paths to any PRD.md or plan.md files created or materially updated in this session, with state: open, ready for review, ready for plan/implementation, completed, or archived. Before reporting a PRD/plan as active or recommending it as next work, validate whether it still exists at the stated path, whether it has moved under .specs/archive/, and whether its frontmatter/status/checklist marks it completed or archived.
3. Add a "Current direction" or "Current status" section if there is an active design/plan/change.
4. Add "Key decisions captured" as concise bullets for durable decisions.
5. Add "Telemetry/validation/implementation notes" only if relevant.
6. Add "Workflow friction" only when commands, agents, tools, prompts, or process issues should be improved later.
7. End with "Recommended next command" or "Next step" when there is a clear follow-up.

Style rules:
- Keep any top-level bullet list to 3 bullets or fewer when a sectioned handoff is not needed.
- Prefer grouped sections over a flat chronological recap.
- Preserve exact paths, commands, model names, and important enum/value choices.
- Keep it concise but complete enough to survive compaction or handoff.
- Skip routine tool calls and dead-end exploration unless they affect the next step.
- Do not invent validation; say "not run" or omit if unknown.
- Include any workflow issue that materially affects the next handoff.`;

interface BranchLaunchPlan {
	executable?: string;
	args: string[];
	reason?: string;
}

export function msysPathToWindows(cwd: string): string {
	const match = cwd.match(/^\/([a-zA-Z])\/(.*)$/);
	const drive = match?.[1];
	const rest = match?.[2];
	if (!drive || rest === undefined) return cwd;
	return `${drive.toUpperCase()}:\\${rest.replace(/\//g, "\\")}`;
}

export function extractSessionId(sessionFile: string): string {
	const basename = path.basename(sessionFile);
	const match = basename.match(
		/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
	);
	return match?.[0] ?? sessionFile;
}

export function buildPiResumeArgs(sessionFile: string): string[] {
	return ["--session", extractSessionId(sessionFile)];
}

function quotePowerShellArg(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

export function buildPowerShellResumeCommand(sessionFile: string): string {
	return [
		"&",
		"pi",
		...buildPiResumeArgs(sessionFile).map(quotePowerShellArg),
	].join(" ");
}

export function defaultBranchTitle(cwd: string): string {
	return path.basename(cwd.replace(/[\\/]$/, "")) || "pi";
}

export function buildBranchLaunchPlan(input: {
	cwd: string;
	title: string;
	sessionFile: string;
	env?: NodeJS.ProcessEnv;
	platform?: NodeJS.Platform;
}): BranchLaunchPlan {
	const env = input.env ?? process.env;
	const platform = input.platform ?? process.platform;
	if (platform === "darwin") {
		return buildGhosttyLaunchPlan({
			cwd: input.cwd,
			initialInput: buildShellPiCommand(buildPiResumeArgs(input.sessionFile)),
		});
	}
	return buildWindowsTerminalLaunchPlan({
		cwd: input.cwd,
		title: input.title,
		command: buildPowerShellResumeCommand(input.sessionFile),
		suppressApplicationTitle: true,
		env,
		platform,
	});
}

export function buildNewInstanceLaunchPlan(input: {
	cwd: string;
	title: string;
	env?: NodeJS.ProcessEnv;
	platform?: NodeJS.Platform;
}): BranchLaunchPlan {
	const env = input.env ?? process.env;
	const platform = input.platform ?? process.platform;
	if (platform === "darwin") {
		return buildGhosttyLaunchPlan({
			cwd: input.cwd,
			initialInput: "pi",
		});
	}
	return buildWindowsTerminalLaunchPlan({
		cwd: input.cwd,
		title: input.title,
		command: "& pi",
		suppressApplicationTitle: true,
		env,
		platform,
	});
}

export function buildNewTerminalLaunchPlan(input: {
	cwd: string;
	title: string;
	env?: NodeJS.ProcessEnv;
	platform?: NodeJS.Platform;
}): BranchLaunchPlan {
	const env = input.env ?? process.env;
	const platform = input.platform ?? process.platform;
	if (platform === "win32" || env.WT_SESSION) {
		return {
			executable: "wt",
			args: [
				"-w",
				"0",
				"new-tab",
				"--title",
				input.title,
				"-d",
				msysPathToWindows(input.cwd),
				"pwsh",
			],
		};
	}
	if (platform === "darwin") {
		return buildGhosttyLaunchPlan({ cwd: input.cwd });
	}
	return {
		args: [],
		reason: "No supported terminal launcher detected.",
	};
}

function buildGhosttyLaunchPlan(input: {
	cwd: string;
	initialInput?: string;
}): BranchLaunchPlan {
	return {
		executable: "osascript",
		args: ["-e", buildGhosttyNewWindowScript(input)],
	};
}

function quoteAppleScriptString(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function quoteShellArg(value: string): string {
	return `'${value.replace(/'/g, "'\\''")}'`;
}

function buildShellPiCommand(args: string[]): string {
	return ["pi", ...args.map(quoteShellArg)].join(" ");
}

function buildGhosttyNewWindowScript(input: {
	cwd: string;
	initialInput?: string;
}): string {
	const lines = [
		'tell application "Ghostty"',
		"activate",
		"set cfg to new surface configuration",
		`set initial working directory of cfg to ${quoteAppleScriptString(input.cwd)}`,
		'set command of cfg to "/bin/zsh"',
		"set win to new window with configuration cfg",
	];
	if (input.initialInput) {
		lines.push(
			"set term to terminal 1 of selected tab of win",
			`input text ${quoteAppleScriptString(`${input.initialInput}\n`)} to term`,
		);
	}
	lines.push("end tell");
	return lines.join("\n");
}

function buildWindowsTerminalLaunchPlan(input: {
	cwd: string;
	title: string;
	command: string;
	suppressApplicationTitle?: boolean;
	env?: NodeJS.ProcessEnv;
	platform?: NodeJS.Platform;
}): BranchLaunchPlan {
	const env = input.env ?? process.env;
	const platform = input.platform ?? process.platform;
	if (platform === "win32" || env.WT_SESSION) {
		const args = ["-w", "0", "new-tab", "--title", input.title];
		if (input.suppressApplicationTitle) {
			args.push("--suppressApplicationTitle");
		}
		args.push(
			"-d",
			msysPathToWindows(input.cwd),
			"pwsh",
			"-NoExit",
			"-Command",
			input.command,
		);
		return {
			executable: "wt",
			args,
		};
	}
	return {
		args: [],
		reason: "No supported terminal tab launcher detected.",
	};
}

export function launchBranch(plan: BranchLaunchPlan): {
	launched: boolean;
	error?: string;
} {
	if (!plan.executable) return { launched: false };
	const result = spawnSync(plan.executable, plan.args, {
		shell: false,
		stdio: "ignore",
		windowsHide: true,
	});
	if (result.error) return { launched: false, error: result.error.message };
	if (typeof result.status === "number" && result.status !== 0)
		return {
			launched: false,
			error: `${plan.executable} exited ${result.status}`,
		};
	return { launched: true };
}

async function executeNewInstanceCommand(
	args: string,
	ctx: Pick<WorkflowContext, "cwd" | "ui">,
) {
	const title = args.trim() || defaultBranchTitle(ctx.cwd ?? process.cwd());
	const plan = buildNewInstanceLaunchPlan({
		cwd: ctx.cwd ?? process.cwd(),
		title,
	});
	const launched = launchBranch(plan);
	if (launched.launched) {
		return ctx.ui.notify(
			`Opened new Pi instance in a new terminal tab: ${title}`,
			"info",
		);
	}
	const details = launched.error
		? `Terminal launch failed: ${launched.error}`
		: plan.reason;
	return ctx.ui.notify(
		details ?? "Terminal launch failed.",
		launched.error ? "warning" : "error",
	);
}

async function executeNewTerminalCommand(
	args: string,
	ctx: Pick<WorkflowContext, "cwd" | "ui">,
) {
	const title = args.trim() || defaultBranchTitle(ctx.cwd ?? process.cwd());
	const plan = buildNewTerminalLaunchPlan({
		cwd: ctx.cwd ?? process.cwd(),
		title,
	});
	const launched = launchBranch(plan);
	if (launched.launched) {
		return ctx.ui.notify(`Opened new terminal in this cwd: ${title}`, "info");
	}
	const details = launched.error
		? `Terminal launch failed: ${launched.error}`
		: plan.reason;
	return ctx.ui.notify(
		details ?? "Terminal launch failed.",
		launched.error ? "warning" : "error",
	);
}

async function executeBranchCommand(args: string, ctx: WorkflowContext) {
	const sessionManager = ctx.sessionManager;
	const leafId = sessionManager?.getLeafId?.();
	if (!sessionManager?.createBranchedSession || !leafId) {
		return ctx.ui.notify(
			"Cannot branch this session yet: no persisted session leaf is available.",
			"error",
		);
	}
	const branchSessionFile = sessionManager.createBranchedSession(leafId);
	if (!branchSessionFile) {
		return ctx.ui.notify(
			"Cannot branch this session: session persistence is unavailable.",
			"error",
		);
	}
	const title = args.trim() || defaultBranchTitle(ctx.cwd ?? process.cwd());
	const plan = buildBranchLaunchPlan({
		cwd: ctx.cwd ?? process.cwd(),
		title,
		sessionFile: branchSessionFile,
	});
	const launched = launchBranch(plan);
	if (launched.launched) {
		return ctx.ui.notify(
			`Opened branched Pi session in a new terminal tab: ${title}`,
			"info",
		);
	}
	const details = launched.error
		? `Terminal launch failed: ${launched.error}`
		: plan.reason;
	return ctx.ui.notify(
		details ?? "Terminal launch failed.",
		launched.error ? "warning" : "error",
	);
}

function extractJsonObject(text: string) {
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	if (start === -1 || end === -1 || end < start) return undefined;
	return text.slice(start, end + 1);
}

export function normalizeCommitSubject(subject: string) {
	return subject.replace(/\s+/g, " ").trim();
}

export function parseCommitPlan(text: string): CommitPlan {
	const jsonText = extractJsonObject(text);
	if (!jsonText) throw new Error("Planner did not return JSON");
	const parsed = JSON.parse(jsonText) as CommitPlan;
	if (!parsed || !Array.isArray(parsed.groups) || parsed.groups.length === 0) {
		throw new Error("Planner returned no commit groups");
	}
	for (const group of parsed.groups) {
		if (
			!Array.isArray(group.files) ||
			group.files.length === 0 ||
			!group.files.every((file) => typeof file === "string")
		) {
			throw new Error("Planner returned a group without valid files");
		}
		if (typeof group.subject !== "string" || !group.subject.trim()) {
			throw new Error("Planner returned a group without a commit subject");
		}
		group.subject = normalizeCommitSubject(group.subject);
		if (group.body !== undefined && typeof group.body !== "string") {
			throw new Error("Planner returned a non-string commit body");
		}
	}
	return parsed;
}

export function validateCommitPlan(plan: CommitPlan, changedFiles: string[]) {
	const changedSet = new Set(changedFiles);
	const seen = new Set<string>();
	for (const group of plan.groups) {
		for (const file of group.files) {
			if (!changedSet.has(file)) {
				throw new Error(`Planner referenced unknown file: ${file}`);
			}
			if (seen.has(file)) {
				throw new Error(`Planner assigned file to multiple groups: ${file}`);
			}
			seen.add(file);
		}
		if (!isValidConventionalCommit(group.subject.trim())) {
			throw new Error(
				`Planner produced invalid conventional commit subject: ${group.subject}`,
			);
		}
	}
	const missing = changedFiles.filter((file) => !seen.has(file));
	if (missing.length > 0) {
		throw new Error(`Planner omitted changed files: ${missing.join(", ")}`);
	}
}

function extractAssistantText(content: unknown) {
	if (!Array.isArray(content)) return "";
	return content
		.filter(
			(block): block is TextContent =>
				!!block &&
				typeof block === "object" &&
				"type" in block &&
				block.type === "text",
		)
		.map((block) => block.text)
		.join("\n");
}

function buildSingleGroupCommitPlan(
	context: {
		files: string[];
		diffStat: string;
		cachedStat: string;
		cachedDiff: string;
		hint: string;
	},
	warning?: string,
): CommitPlan {
	const message = proposeCommitMessage(
		context.files,
		context.hint,
		context.cachedDiff,
	);
	return {
		groups: [
			{
				files: context.files,
				subject: message.subject,
				...(message.body ? { body: message.body } : {}),
			},
		],
		warnings: warning ? [warning] : undefined,
	};
}

async function generateCommitPlanWithLlm(
	_ctxPi: ExtensionAPI,
	ctx: WorkflowContext,
	context: {
		files: string[];
		diffStat: string;
		cachedStat: string;
		cachedDiff: string;
		hint: string;
	},
) {
	const model = await resolveCommitPlanningModelFromRegistry(
		ctx.modelRegistry,
		ctx,
	);
	if (!model) {
		throw new Error("No small/mini model available for commit planning");
	}
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth?.ok) {
		throw new Error(
			auth?.error || "No configured auth available for commit planning model",
		);
	}
	const planningPrompt = buildCommitPlanningPrompt(
		loadClaudeCommitInstructions(),
		context,
	);
	const response = await completeSimple(
		model,
		{
			systemPrompt: ctx.getSystemPrompt?.(),
			messages: [
				{ role: "user", content: planningPrompt, timestamp: Date.now() },
			],
		},
		{
			apiKey: auth.apiKey,
			headers: auth.headers,
			reasoning: "minimal",
			signal: ctx.signal,
		},
	);
	const planText = extractAssistantText(response.content);
	if (!planText.trim()) {
		return buildSingleGroupCommitPlan(
			context,
			"Commit planner returned empty response; used single-commit fallback.",
		);
	}
	const plan = parseCommitPlan(planText);
	validateCommitPlan(plan, context.files);
	return plan;
}

function shouldLogGitCommand(args: string[]) {
	const command = args[0];
	return (
		command !== "diff" && command !== "ls-files" && command !== "rev-parse"
	);
}

let _gitBin: string | undefined;
function resolveGit(): string {
	if (_gitBin !== undefined) return _gitBin;
	if (process.platform !== "win32") {
		_gitBin = "git";
		return _gitBin;
	}
	const candidates = [
		process.env.ProgramFiles
			? `${process.env.ProgramFiles}\\Git\\mingw64\\bin\\git.exe`
			: undefined,
		process.env["ProgramFiles(x86)"]
			? `${process.env["ProgramFiles(x86)"]}\\Git\\mingw64\\bin\\git.exe`
			: undefined,
		process.env.LOCALAPPDATA
			? `${process.env.LOCALAPPDATA}\\Programs\\Git\\mingw64\\bin\\git.exe`
			: undefined,
	].filter((c): c is string => Boolean(c));
	for (const c of candidates) {
		try {
			if (fs.existsSync(c)) {
				_gitBin = c;
				return _gitBin;
			}
		} catch {
			/* ignore */
		}
	}
	_gitBin = "git";
	return _gitBin;
}

function runGit(
	cwd: string,
	args: string[],
	activity?: CommitActivity,
): GitRunResult {
	const result = spawnSync(resolveGit(), args, {
		cwd,
		encoding: "utf8",
		windowsHide: true,
	});
	const gitResult = {
		code: result.status ?? 1,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
	};
	if (shouldLogGitCommand(args)) {
		activity?.logCommand(`git ${args.join(" ")}`, gitResult);
	}
	return gitResult;
}

function gitOrThrow(cwd: string, args: string[], activity?: CommitActivity) {
	const result = runGit(cwd, args, activity);
	if (result.code !== 0) {
		throw new Error(
			(result.stderr || result.stdout || `git ${args.join(" ")} failed`).trim(),
		);
	}
	return result.stdout.trim();
}

function parseLines(output: string) {
	return output
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
}

function normalizeGitPath(file: string) {
	return file.replace(/\\/g, "/").replace(/^\.\//, "");
}

function uniqueSorted(values: string[]) {
	return [...new Set(values.filter(Boolean))].sort((a, b) =>
		a.localeCompare(b),
	);
}

function hasMergeConflicts(statusOutput: string) {
	return parseLines(statusOutput).some((line) => {
		const code = line.slice(0, 2);
		return ["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(code);
	});
}

export function getCommitRuntimePathReason(file: string): string | null {
	const normalized = file.replace(/\\/g, "/");
	return (
		COMMIT_RUNTIME_PATH_PATTERNS.find((pattern) =>
			pattern.regex.test(normalized),
		)?.label ?? null
	);
}

export function filterCommitSafeFiles(files: string[]) {
	const included: string[] = [];
	const excluded: Array<{ file: string; reason: string }> = [];
	for (const file of files) {
		const reason = getCommitRuntimePathReason(file);
		if (reason) excluded.push({ file, reason });
		else included.push(file);
	}
	return { included: uniqueSorted(included), excluded };
}

export function listChangedFiles(cwd: string, activity?: CommitActivity) {
	const hasHead = runGit(cwd, ["rev-parse", "--verify", "HEAD"]).code === 0;
	const headDiff = hasHead
		? parseLines(gitOrThrow(cwd, ["diff", "--name-only", "HEAD"], activity))
		: [];
	const untracked = parseLines(
		gitOrThrow(cwd, ["ls-files", "--others", "--exclude-standard"], activity),
	);
	const staged = parseLines(
		gitOrThrow(cwd, ["diff", "--cached", "--name-only"], activity),
	);
	return {
		all: uniqueSorted([...headDiff, ...untracked]),
		staged: uniqueSorted(staged),
		untracked: uniqueSorted(untracked),
	};
}

export function buildUntrackedClassifierPrompt(untrackedFiles: string[]) {
	return `Classify every untracked Git path for commit hygiene.

Rules:
- Return JSON only: {"classifications":[{"path":"...","decision":"ignore|do_not_ignore","confidence":0-100,"reason":"...","gitignorePattern":"..."}]}
- Allowed decisions are exactly ignore and do_not_ignore.
- Use ignore for generated runtime state, logs, caches, local metadata, build outputs, temporary files, database files, and machine-local artifacts.
- Use do_not_ignore for source code, tests, documentation, project configuration, lockfiles, and intentional assets.
- Use the 85% confidence gate: if you are below 85% confident, still choose the best decision and set confidence below 85 so the user can decide.
- For ignore decisions, include the minimal Git ignore pattern that covers the artifact without hiding unrelated source.
- Classify every input path exactly once.

Untracked paths:
${untrackedFiles.map((file) => `- ${file}`).join("\n")}`;
}

export function parseUntrackedClassifierResult(
	text: string,
	untrackedFiles: string[],
): UntrackedClassificationPlan {
	const jsonText = extractJsonObject(text);
	if (!jsonText) throw new Error("Untracked classifier did not return JSON");
	const parsed = JSON.parse(jsonText) as { classifications?: unknown };
	if (!Array.isArray(parsed.classifications)) {
		throw new Error("Untracked classifier returned no classifications");
	}
	const expected = new Set(untrackedFiles.map(normalizeGitPath));
	const seen = new Set<string>();
	const classifications: UntrackedClassification[] = [];
	for (const item of parsed.classifications) {
		if (!item || typeof item !== "object") {
			throw new Error("Untracked classifier returned an invalid item");
		}
		const record = item as Record<string, unknown>;
		const itemPath =
			typeof record.path === "string" ? normalizeGitPath(record.path) : "";
		if (!expected.has(itemPath)) {
			throw new Error(
				`Untracked classifier returned unknown path: ${itemPath || "<missing>"}`,
			);
		}
		if (seen.has(itemPath)) {
			throw new Error(
				`Untracked classifier returned duplicate path: ${itemPath}`,
			);
		}
		seen.add(itemPath);
		if (record.decision !== "ignore" && record.decision !== "do_not_ignore") {
			throw new Error("Untracked classifier returned invalid decision");
		}
		if (
			typeof record.confidence !== "number" ||
			!Number.isFinite(record.confidence) ||
			record.confidence < 0 ||
			record.confidence > 100
		) {
			throw new Error("Untracked classifier returned invalid confidence");
		}
		if (typeof record.reason !== "string" || !record.reason.trim()) {
			throw new Error("Untracked classifier returned missing reason");
		}
		classifications.push({
			path: itemPath,
			decision: record.decision,
			confidence: record.confidence,
			reason: record.reason.trim(),
			gitignorePattern:
				typeof record.gitignorePattern === "string"
					? record.gitignorePattern.trim()
					: undefined,
		});
	}
	const missing = [...expected].filter((file) => !seen.has(file));
	if (missing.length > 0) {
		throw new Error(
			`Untracked classifier omitted paths: ${missing.join(", ")}`,
		);
	}
	return {
		accepted: classifications.filter((item) => item.confidence >= 85),
		needsUserDecision: classifications.filter((item) => item.confidence < 85),
	};
}

export function buildStagingPlan(input: {
	files: string[];
	allCommittableFiles: string[];
	ignoredFiles?: string[];
	trackedIgnoredFiles?: string[];
}): StagingPlan {
	const files = uniqueSorted(input.files.map(normalizeGitPath));
	const allCommittable = uniqueSorted(
		input.allCommittableFiles.map(normalizeGitPath),
	);
	const ignored = new Set((input.ignoredFiles ?? []).map(normalizeGitPath));
	const trackedIgnored = uniqueSorted(
		(input.trackedIgnoredFiles ?? []).map(normalizeGitPath),
	);
	const unsafe = files.filter((file) => ignored.has(file));
	const useBroadAdd =
		unsafe.length === 0 &&
		files.length > 0 &&
		files.length === allCommittable.length &&
		files.every((file, index) => file === allCommittable[index]);
	return {
		addArgs: useBroadAdd
			? ["add", "."]
			: ["add", "-A", "--", ...files.filter((file) => !ignored.has(file))],
		rmCachedArgs:
			trackedIgnored.length > 0
				? ["rm", "--cached", "--ignore-unmatch", "--", ...trackedIgnored]
				: [],
		unsafe,
		useBroadAdd,
	};
}

function parseCommitArgs(rawArgs: string, changedFiles: string[]) {
	const tokens = rawArgs.trim().split(/\s+/).filter(Boolean);
	const push = tokens.includes("push");
	const remaining = tokens.filter((token) => token !== "push");
	const changedSet = new Set(changedFiles);
	return {
		push,
		files: remaining.filter((token) => changedSet.has(token)),
		hint: remaining
			.filter((token) => !changedSet.has(token))
			.join(" ")
			.trim(),
	};
}

function buildSecretContext(content: string, index: number) {
	const lineStarts = [0];
	for (let i = 0; i < content.length; i++) {
		if (content[i] === "\n") lineStarts.push(i + 1);
	}
	let lineIndex = 0;
	for (let i = 0; i < lineStarts.length; i++) {
		if (lineStarts[i] <= index) lineIndex = i;
		else break;
	}
	const startLine = Math.max(0, lineIndex - 1);
	const endLine = Math.min(lineStarts.length - 1, lineIndex + 1);
	const lines = content.split(/\r?\n/);
	const snippet = lines.slice(startLine, endLine + 1).join("\n");
	return { line: lineIndex + 1, context: snippet.slice(0, 400) };
}

function scanFileForSecrets(
	cwd: string,
	relativePath: string,
): SecretCandidate[] {
	const absolutePath = path.resolve(cwd, relativePath);
	try {
		if (!fs.statSync(absolutePath).isFile()) return [];
	} catch {
		return [];
	}

	let content: string;
	try {
		content = fs.readFileSync(absolutePath, "utf8");
	} catch {
		return [];
	}

	const findings: SecretCandidate[] = [];
	for (const pattern of SECRET_PATTERNS) {
		for (const match of content.matchAll(pattern.regex)) {
			const raw = String(match[0]);
			const index = match.index ?? 0;
			const { line, context } = buildSecretContext(content, index);
			findings.push({
				path: relativePath,
				label: pattern.label,
				match: raw.slice(0, 80),
				line,
				context,
			});
		}
	}
	return findings;
}

function scanFilesForSecrets(cwd: string, files: string[]) {
	return files.flatMap((file) => scanFileForSecrets(cwd, file));
}

function classifyScopeRoot(file: string) {
	if (["install", "install.ps1", "Brewfile"].includes(file)) return "dotfiles";
	const root = file.split("/")[0] ?? file;
	if (["zsh", "pi", "claude", "opencode", "menos"].includes(root)) return root;
	return "repo";
}

function detectScope(files: string[]) {
	const roots = uniqueSorted(files.map(classifyScopeRoot));
	if (roots.length === 1) return roots[0];
	return roots.includes("pi") && roots.length <= 2 ? "pi" : "dotfiles";
}

function isDocsFile(file: string) {
	return [".md", ".rst", ".txt"].some((ext) => file.endsWith(ext));
}

function isTestFile(file: string) {
	return file.includes("test") || file.includes("spec");
}

function isConfigFile(file: string) {
	return ["install", "install.ps1", "Brewfile", "settings.json"].some((name) =>
		file.endsWith(name),
	);
}

function diffIncludesAny(diffText: string, snippets: string[]) {
	return snippets.some((snippet) => diffText.includes(snippet));
}

function detectType(files: string[], diffText: string) {
	if (files.length > 0 && files.every(isDocsFile)) return "docs";
	if (files.length > 0 && files.every(isTestFile)) return "test";
	if (
		files.every((file) => isDocsFile(file) || isTestFile(file)) &&
		files.some(isDocsFile)
	)
		return "docs";
	if (
		diffIncludesAny(diffText, [
			"registerCommand(",
			"registerTool(",
			"+\t/exit",
			"+\t/commit",
		])
	)
		return "feat";
	if (
		diffIncludesAny(diffText, [
			"fix",
			"error",
			"failed",
			"bug",
			"prevent",
			"correct",
		])
	)
		return "fix";
	if (files.every(isConfigFile)) return "chore";
	return "chore";
}

function detectDescription(files: string[], diffText: string) {
	if (files.includes("pi/extensions/workflow-commands.ts")) {
		if (
			diffIncludesAny(diffText, [
				"executeCommitCommand",
				"confirmCommitMessage",
				"chooseFilesToCommit",
			])
		) {
			return "improve commit workflow";
		}
		if (diffText.includes('registerCommand("exit"')) return "add exit command";
		return "update workflow commands";
	}
	if (files.every(isDocsFile)) return "update documentation";
	if (files.every((file) => file.startsWith("pi/")))
		return "update pi configuration";
	if (
		files.some((file) => ["install", "install.ps1", "Brewfile"].includes(file))
	) {
		return "update install and shell configuration";
	}
	return "update tracked changes";
}

function toConventionalDescription(input: string) {
	return input
		.trim()
		.toLowerCase()
		.replace(/[.]+$/g, "")
		.replace(/\s+/g, " ")
		.slice(0, 72);
}

export function proposeCommitMessage(
	files: string[],
	hint: string,
	diffText: string,
) {
	const scope = detectScope(files);
	const type = detectType(files, diffText);
	const subject = `${type}(${scope}): ${toConventionalDescription(hint || detectDescription(files, diffText))}`;
	return files.length > 3
		? { subject, body: `Update ${files.length} tracked paths across ${scope}.` }
		: { subject };
}

function isValidConventionalCommit(subject: string) {
	return CONVENTIONAL_COMMIT_RE.test(subject);
}

function parseSecretReviewResult(text: string): SecretReviewResult {
	const jsonText = extractJsonObject(text);
	if (!jsonText) throw new Error("Secret reviewer did not return JSON");
	const parsed = JSON.parse(jsonText) as SecretReviewResult;
	if (!parsed || !Array.isArray(parsed.findings))
		throw new Error("Secret reviewer returned invalid findings");
	return parsed;
}

async function reviewSecretFindingsWithLlm(
	ctx: WorkflowContext,
	findings: SecretCandidate[],
): Promise<SecretReviewFinding[]> {
	if (findings.length === 0) return [];
	const model = await resolveCommitPlanningModelFromRegistry(
		ctx.modelRegistry,
		ctx,
	);
	if (!model)
		throw new Error("No small/mini model available for secret review");
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth?.ok)
		throw new Error(
			auth?.error || "No configured auth available for secret review model",
		);
	const response = await completeSimple(
		model,
		{
			systemPrompt: ctx.getSystemPrompt?.(),
			messages: [
				{
					role: "user",
					content: buildSecretReviewPrompt(findings),
					timestamp: Date.now(),
				},
			],
		},
		{
			apiKey: auth.apiKey,
			headers: auth.headers,
			reasoning: "minimal",
			signal: ctx.signal,
		},
	);
	const text = extractAssistantText(response.content);
	if (!text.trim())
		throw new Error("Secret reviewer returned no assistant text");
	return parseSecretReviewResult(text).findings;
}

async function confirmSecretScan(
	ctx: WorkflowContext,
	findings: SecretCandidate[],
) {
	if (findings.length === 0) return true;
	const reviewed = await reviewSecretFindingsWithLlm(ctx, findings);
	const blocking = reviewed.filter(
		(finding) =>
			finding.classification === "likely_secret" ||
			finding.classification === "ambiguous",
	);
	if (blocking.length === 0) return true;
	const preview = blocking
		.slice(0, 8)
		.map(
			(finding) =>
				`- ${finding.path}: ${finding.label} [${finding.classification}]${finding.match ? ` (${finding.match})` : ""} - ${finding.reason}`,
		)
		.join("\n");
	throw new Error(
		`Potential secrets detected after review:\n${preview}${blocking.length > 8 ? "\n- ..." : ""}\n\nRemove the secrets, redact them, or exclude the files before committing.`,
	);
}

async function classifyUntrackedFiles(
	ctx: WorkflowContext,
	untrackedFiles: string[],
): Promise<UntrackedClassificationPlan> {
	if (untrackedFiles.length === 0) {
		return { accepted: [], needsUserDecision: [] };
	}
	const model = await resolveCommitPlanningModelFromRegistry(
		ctx.modelRegistry,
		ctx,
	);
	if (!model) {
		throw new Error("No small/mini model available for untracked classifier");
	}
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth?.ok) {
		throw new Error(
			auth?.error || "No configured auth available for untracked classifier",
		);
	}
	const response = await completeSimple(
		model,
		{
			systemPrompt: ctx.getSystemPrompt?.(),
			messages: [
				{
					role: "user",
					content: buildUntrackedClassifierPrompt(untrackedFiles),
					timestamp: Date.now(),
				},
			],
		},
		{
			apiKey: auth.apiKey,
			headers: auth.headers,
			reasoning: "minimal",
			signal: ctx.signal,
		},
	);
	const text = extractAssistantText(response.content);
	if (!text.trim()) {
		throw new Error("Untracked classifier returned no assistant text");
	}
	return parseUntrackedClassifierResult(text, untrackedFiles);
}

async function resolveLowConfidenceClassifications(
	ctx: WorkflowContext,
	items: UntrackedClassification[],
) {
	const resolved: UntrackedClassification[] = [];
	for (const item of items) {
		emitTerminalBell();
		const selected = await ctx.ui.select?.(
			`Track untracked path ${item.path}? ${item.reason}`,
			["ignore", "do_not_ignore"],
		);
		if (selected !== "ignore" && selected !== "do_not_ignore") {
			throw new Error("Commit cancelled during untracked classification");
		}
		resolved.push({ ...item, decision: selected });
	}
	return resolved;
}

function appendGitignorePatterns(cwd: string, patterns: string[]) {
	const uniquePatterns = uniqueSorted(
		patterns.map((p) => p.trim()).filter(Boolean),
	);
	if (uniquePatterns.length === 0) return;
	const gitignorePath = path.join(cwd, ".gitignore");
	const existing = fs.existsSync(gitignorePath)
		? fs.readFileSync(gitignorePath, "utf-8")
		: "";
	const existingLines = new Set(parseLines(existing));
	const missing = uniquePatterns.filter(
		(pattern) => !existingLines.has(pattern),
	);
	if (missing.length === 0) return;
	const prefix = existing.length === 0 || existing.endsWith("\n") ? "" : "\n";
	fs.appendFileSync(gitignorePath, `${prefix}${missing.join("\n")}\n`);
}

function applyUntrackedClassifications(
	cwd: string,
	classifications: UntrackedClassification[],
	activity?: CommitActivity,
) {
	const ignored = classifications.filter((item) => item.decision === "ignore");
	appendGitignorePatterns(
		cwd,
		ignored.map((item) => item.gitignorePattern || item.path),
	);
	if (ignored.length > 0) {
		activity?.logInfo(
			`Ignored untracked paths:\n${ignored.map((item) => `- ${item.path}: ${item.reason}`).join("\n")}`,
		);
	}
}

const LARGE_COMMIT_FILE_THRESHOLD = 50;
const MIXED_COMMIT_FILE_THRESHOLD = 10;

function topLevelCommitRoot(file: string) {
	return normalizeGitPath(file).split("/")[0] || file;
}

export function isLargeOrMixedCommitSelection(files: string[]) {
	const roots = uniqueSorted(files.map(topLevelCommitRoot));
	return (
		files.length > LARGE_COMMIT_FILE_THRESHOLD ||
		(files.length > MIXED_COMMIT_FILE_THRESHOLD && roots.length > 1)
	);
}

export async function chooseFilesToCommit(
	_ctx: WorkflowContext,
	changedFiles: string[],
	stagedFiles: string[],
	requestedFiles: string[],
) {
	if (requestedFiles.length > 0)
		return { files: requestedFiles, stageAll: true, cancelled: false };
	return { files: changedFiles, stageAll: true, cancelled: false };
}

export function stageFiles(
	cwd: string,
	files: string[],
	activity?: CommitActivity,
	allCommittableFiles: string[] = files,
) {
	const unsafe = filterCommitSafeFiles(files).excluded;
	if (unsafe.length > 0) {
		throw new Error(
			`Refusing to stage runtime/generated paths:\n${formatExcludedCommitPaths(unsafe)}`,
		);
	}
	const existingFiles = files.filter((file) =>
		fs.existsSync(path.resolve(cwd, file)),
	);
	const missingFiles = files.filter((file) => !existingFiles.includes(file));
	const ignoredExisting = existingFiles.filter(
		(file) => runGit(cwd, ["check-ignore", "--quiet", "--", file]).code === 0,
	);
	const stagingPlan = buildStagingPlan({
		files: existingFiles,
		allCommittableFiles: isLargeOrMixedCommitSelection(files)
			? []
			: allCommittableFiles,
		ignoredFiles: ignoredExisting,
	});
	if (stagingPlan.unsafe.length > 0) {
		throw new Error(
			`Refusing to stage ignored paths:\n${stagingPlan.unsafe.map((file) => `- ${file}`).join("\n")}`,
		);
	}
	if (existingFiles.length > 0) {
		const addResult = runGit(cwd, stagingPlan.addArgs, activity);
		if (addResult.code !== 0)
			throw new Error(
				(addResult.stderr || addResult.stdout).trim() || "git add failed",
			);
	}
	if (missingFiles.length > 0) {
		const rmResult = runGit(
			cwd,
			["rm", "--ignore-unmatch", "--", ...missingFiles],
			activity,
		);
		if (rmResult.code !== 0)
			throw new Error(
				(rmResult.stderr || rmResult.stdout).trim() || "git rm failed",
			);
	}
}

function unstageFiles(cwd: string, files: string[], activity?: CommitActivity) {
	const resetResult = runGit(cwd, ["reset", "HEAD", "--", ...files], activity);
	if (resetResult.code !== 0)
		throw new Error(
			(resetResult.stderr || resetResult.stdout).trim() || "git reset failed",
		);
}

export async function confirmCommitMessage(
	_ctx: WorkflowContext,
	commitMessage: { subject: string; body?: string },
	_filesToCommit: string[],
	_cachedStat: string,
	_diffStat: string,
) {
	if (!isValidConventionalCommit(commitMessage.subject)) {
		throw new Error(
			"Commit message must match conventional commit format: type(scope): description; allowed types include wip",
		);
	}
	return commitMessage;
}

function commitCurrentChanges(
	cwd: string,
	commitMessage: { subject: string; body?: string },
	activity?: CommitActivity,
) {
	const commitArgs = commitMessage.body
		? ["commit", "-m", commitMessage.subject, "-m", commitMessage.body]
		: ["commit", "-m", commitMessage.subject];
	const commitResult = runGit(cwd, commitArgs, activity);
	if (commitResult.code !== 0)
		throw new Error(
			(commitResult.stderr || commitResult.stdout).trim() ||
				"git commit failed",
		);
	return gitOrThrow(cwd, ["rev-parse", "--short", "HEAD"], activity);
}

function pushCurrentBranch(cwd: string, activity?: CommitActivity) {
	const pushResult = runGit(cwd, ["push"], activity);
	if (pushResult.code !== 0)
		throw new Error(
			(pushResult.stderr || pushResult.stdout).trim() || "git push failed",
		);
}

function summarizeCommit(hash: string, subject: string, pushed: boolean) {
	return pushed ? `${hash} ${subject}\nPushed to remote` : `${hash} ${subject}`;
}

function truncateForCommitOutput(value: string, maxChars = 4000) {
	if (value.length <= maxChars) return value;
	return `${value.slice(0, maxChars)}\n... [truncated ${value.length - maxChars} chars]`;
}

function formatGitOutput(result?: GitRunResult) {
	if (!result) return ["ok"];
	const outputLines: string[] = [];
	const stdout = truncateForCommitOutput(result.stdout.trim());
	const stderr = truncateForCommitOutput(result.stderr.trim());
	if (stdout) {
		for (const line of stdout.split(/\r?\n/)) outputLines.push(line);
	}
	if (stderr) {
		for (const line of stderr.split(/\r?\n/))
			outputLines.push(`stderr: ${line}`);
	}
	if (outputLines.length === 0) {
		outputLines.push(result.code === 0 ? "ok" : `exit ${result.code}`);
	}
	return outputLines.slice(0, 80);
}

function echoSlashCommand(pi: ExtensionAPI, command: string, args: string) {
	if ((pi as SlashEchoExtensionAPI).__slashEchoRegisterCommandWrapped)
		return undefined;
	const text = args.trim() ? `/${command} ${args.trim()}` : `/${command}`;
	if (typeof pi.sendMessage === "function") {
		pi.sendMessage({
			customType: SLASH_ECHO_TYPE,
			content: text,
			display: true,
		});
	}
	return text;
}

function sendHiddenWorkflowPrompt(
	sender: Pick<ExtensionAPI, "sendMessage">,
	content: string,
	options: { deliverAs?: "steer" | "followUp" | "nextTurn" } = {},
) {
	sender.sendMessage(
		{
			customType: "workflow.hiddenPrompt",
			content,
			display: false,
		},
		{
			triggerTurn: true,
			deliverAs: options.deliverAs ?? "followUp",
		},
	);
}

function isPlanFileInput(args: string) {
	return /(?:^|\s)(?:\.specs\/[A-Za-z0-9._/-]+\/plan\.md|[^\s]+plan\.md)(?:\s|$)/.test(
		args.trim(),
	);
}

function createCommitActivity(
	pi: ExtensionAPI,
	ctx: WorkflowContext,
	commandText: string,
): CommitActivity {
	const fallbackLines: string[] = [];
	const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
	let spinnerIndex = 0;
	let spinnerTimer: ReturnType<typeof setInterval> | undefined;

	const stopSpinner = () => {
		if (spinnerTimer) {
			clearInterval(spinnerTimer);
			spinnerTimer = undefined;
		}
		ctx.ui.setWidget?.("commit-spinner", undefined);
	};

	const startSpinner = (phase: string) => {
		stopSpinner();
		const tick = () => {
			ctx.ui.setWidget?.(
				"commit-spinner",
				[`${spinnerFrames[spinnerIndex]} ${phase}`],
				{
					placement: "aboveEditor",
				},
			);
			spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
		};
		tick();
		spinnerTimer = setInterval(tick, 120);
	};

	const emit = (content: string) => {
		if (typeof pi.sendMessage === "function") {
			pi.sendMessage({
				customType: COMMIT_ACTIVITY_TYPE,
				content,
				display: true,
			});
			return;
		}
		fallbackLines.push(content);
		ctx.ui.setWidget?.("commit-progress", fallbackLines.slice(-10), {
			placement: "aboveEditor",
		});
	};

	emit(commandText);

	const shouldSpinForPhase = (phase: string) =>
		phase === "preparing" ||
		phase === "planning commits" ||
		phase.startsWith("creating commit") ||
		phase === "pushing";

	return {
		setPhase(message?: string) {
			const phase = message ?? "done";
			emit(`phase: ${phase}`);
			if (shouldSpinForPhase(phase)) startSpinner(phase);
			else stopSpinner();
		},
		logCommand(command: string, result?: GitRunResult) {
			const output = formatGitOutput(result)
				.map((line) => `  ${line}`)
				.join("\n");
			const content = output ? `$ ${command}\n${output}` : `$ ${command}`;
			emit(content);
		},
		logInfo(message: string) {
			emit(message);
		},
		finish() {
			stopSpinner();
			emit("phase: done");
		},
	};
}

function formatExcludedCommitPaths(
	excluded: Array<{ file: string; reason: string }>,
) {
	return excluded
		.slice(0, 12)
		.map((item) => `- ${item.file} (${item.reason})`)
		.join("\n");
}

function getCommitContext(cwd: string, activity?: CommitActivity) {
	const { all, staged, untracked } = listChangedFiles(cwd, activity);
	const changed = filterCommitSafeFiles(all);
	const stagedSafe = filterCommitSafeFiles(staged);
	if (changed.excluded.length > 0) {
		activity?.logInfo(
			`Excluded runtime/generated paths from commit planning:\n${formatExcludedCommitPaths(changed.excluded)}`,
		);
	}
	if (stagedSafe.excluded.length > 0) {
		throw new Error(
			`Unsafe runtime/generated paths are already staged. Unstage them before committing:\n${formatExcludedCommitPaths(stagedSafe.excluded)}`,
		);
	}
	if (changed.included.length === 0)
		throw new Error("No committable changed files found");
	const diffStat = gitOrThrow(
		cwd,
		["diff", "--stat", "HEAD", "--", ...changed.included],
		activity,
	);
	return {
		diffStat,
		changedFiles: changed.included,
		stagedFiles: stagedSafe.included,
		untrackedFiles: untracked,
	};
}

async function prepareCommitSelection(
	args: string,
	ctx: WorkflowContext,
	activity?: CommitActivity,
) {
	let { diffStat, changedFiles, stagedFiles, untrackedFiles } =
		getCommitContext(ctx.cwd, activity);
	const parsedArgs = parseCommitArgs(args, changedFiles);
	let selection = await chooseFilesToCommit(
		ctx,
		changedFiles,
		stagedFiles,
		parsedArgs.files,
	);
	if (selection.cancelled || selection.files.length === 0) return null;

	const selectedUntracked = untrackedFiles.filter((file) =>
		selection.files.includes(file),
	);
	if (selectedUntracked.length > 0) {
		activity?.setPhase("classifying untracked files");
		const plan = await classifyUntrackedFiles(ctx, selectedUntracked);
		const userDecisions = await resolveLowConfidenceClassifications(
			ctx,
			plan.needsUserDecision,
		);
		applyUntrackedClassifications(
			ctx.cwd,
			[...plan.accepted, ...userDecisions],
			activity,
		);
		({ diffStat, changedFiles, stagedFiles, untrackedFiles } = getCommitContext(
			ctx.cwd,
			activity,
		));
		selection = await chooseFilesToCommit(
			ctx,
			changedFiles,
			stagedFiles,
			parsedArgs.files,
		);
		if (selection.cancelled || selection.files.length === 0) return null;
	}

	const findings = scanFilesForSecrets(ctx.cwd, selection.files);
	if (!(await confirmSecretScan(ctx, findings))) return null;

	if (selection.stageAll)
		stageFiles(ctx.cwd, selection.files, activity, changedFiles);

	const cachedStat = gitOrThrow(
		ctx.cwd,
		["diff", "--cached", "--stat"],
		activity,
	);
	if (!cachedStat.trim()) throw new Error("Nothing is staged for commit");
	const cachedDiff = gitOrThrow(
		ctx.cwd,
		["diff", "--cached", "--no-color"],
		activity,
	);
	return { parsedArgs, selection, diffStat, cachedStat, cachedDiff };
}

async function executeCommitCommand(
	pi: ExtensionAPI,
	args: string,
	ctx: WorkflowContext,
) {
	const commandText = `/commit${args.trim() ? ` ${args.trim()}` : ""}`;
	const activity = createCommitActivity(pi, ctx, commandText);
	ctx.ui.notify(`Starting ${commandText}…`, "info");
	activity.setPhase("preparing");
	try {
		const status = gitOrThrow(ctx.cwd, ["status", "--short"], activity);
		if (!status.trim()) {
			activity.finish();
			return ctx.ui.notify("Working tree is clean", "info");
		}
		if (hasMergeConflicts(status)) {
			activity.finish();
			return ctx.ui.notify(
				"Resolve merge conflicts before committing",
				"error",
			);
		}

		const prepared = await prepareCommitSelection(args, ctx, activity);
		if (!prepared) {
			activity.finish();
			return ctx.ui.notify("Commit cancelled", "warning");
		}
		activity.setPhase("planning commits");

		let plan: CommitPlan | undefined;
		try {
			plan = await generateCommitPlanWithLlm(pi, ctx, {
				files: prepared.selection.files,
				diffStat: prepared.diffStat,
				cachedStat: prepared.cachedStat,
				cachedDiff: prepared.cachedDiff,
				hint: prepared.parsedArgs.hint,
			});
		} catch (err) {
			ctx.ui.notify(
				`Commit planner unavailable, falling back to single commit: ${err instanceof Error ? err.message : String(err)}`,
				"warning",
			);
		}

		if (!plan) {
			activity.setPhase("creating commit");
			const proposed = proposeCommitMessage(
				prepared.selection.files,
				prepared.parsedArgs.hint,
				prepared.cachedDiff,
			);
			const commitMessage = await confirmCommitMessage(
				ctx,
				proposed,
				prepared.selection.files,
				prepared.cachedStat,
				prepared.diffStat,
			);
			if (!commitMessage) {
				activity.finish();
				return ctx.ui.notify("Commit cancelled", "warning");
			}
			if (!isValidConventionalCommit(commitMessage.subject)) {
				activity.finish();
				return ctx.ui.notify(
					"Proposed commit message does not match conventional commit format; allowed types include wip",
					"error",
				);
			}
			const hash = commitCurrentChanges(ctx.cwd, commitMessage, activity);
			if (prepared.parsedArgs.push) {
				activity.setPhase("pushing");
				pushCurrentBranch(ctx.cwd, activity);
			}
			activity.finish();
			return ctx.ui.notify(
				summarizeCommit(hash, commitMessage.subject, prepared.parsedArgs.push),
				"info",
			);
		}

		const commitSummaries: string[] = [];
		unstageFiles(ctx.cwd, prepared.selection.files, activity);
		for (const [index, group] of plan.groups.entries()) {
			activity.setPhase(`creating commit ${index + 1}/${plan.groups.length}`);
			stageFiles(ctx.cwd, group.files, activity, prepared.selection.files);
			let hash: string;
			try {
				const stagedStat = gitOrThrow(
					ctx.cwd,
					["diff", "--cached", "--stat"],
					activity,
				);
				const commitMessage = await confirmCommitMessage(
					ctx,
					{
						subject: group.subject.trim(),
						body: group.body?.trim() || undefined,
					},
					group.files,
					stagedStat,
					prepared.diffStat,
				);
				if (!commitMessage) {
					unstageFiles(ctx.cwd, group.files, activity);
					activity.finish();
					return ctx.ui.notify("Commit cancelled", "warning");
				}
				hash = commitCurrentChanges(ctx.cwd, commitMessage, activity);
				commitSummaries.push(`${hash} ${commitMessage.subject}`);
			} catch (groupErr) {
				unstageFiles(ctx.cwd, group.files, activity);
				throw groupErr;
			}
		}
		if (prepared.parsedArgs.push) {
			activity.setPhase("pushing");
			pushCurrentBranch(ctx.cwd, activity);
			activity.logInfo("Pushed to remote");
		}
		activity.finish();
		return ctx.ui.notify(commitSummaries.join("\n"), "info");
	} catch (err) {
		activity.finish();
		throw err;
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("input", async (event, ctx) => {
		if (event.source === "extension") {
			return { action: "continue" };
		}
		if (event.text.trim().toLowerCase() === "exit") {
			ctx.shutdown();
			return { action: "handled" };
		}
		return { action: "continue" };
	});

	if (typeof pi.registerMessageRenderer === "function") {
		pi.registerMessageRenderer(CLEAR_USAGE_TYPE, (message, _options, theme) => {
			const text =
				typeof message.content === "string"
					? message.content
					: String(message.content ?? "");
			return new Text(theme.fg("dim", text), 1, 0);
		});

		pi.registerMessageRenderer(SLASH_ECHO_TYPE, (message, _options, theme) => {
			const text =
				typeof message.content === "string"
					? message.content
					: String(message.content ?? "");
			return new Text(
				theme.bold(theme.fg("success", "> ")) +
					theme.bold(theme.fg("text", text)),
				0,
				0,
			);
		});

		pi.registerMessageRenderer(
			COMMIT_ACTIVITY_TYPE,
			(message, _options, theme) => {
				const text =
					typeof message.content === "string"
						? message.content
						: String(message.content ?? "");
				const styled = text
					.split("\n")
					.map((line) => {
						if (line === "Pushed to remote") {
							return theme.bold(theme.fg("success", line));
						}
						if (line.startsWith("  ") || line.startsWith("stderr:")) {
							return theme.fg("toolOutput", line);
						}
						return theme.bold(theme.fg("text", line));
					})
					.join("\n");
				return new Text(theme.bold(theme.fg("success", "> ")) + styled, 0, 0);
			},
		);
	}

	pi.registerCommand("commit", {
		description: "Smart git commit with flexible prompt-driven grouping",
		handler: async (args, _ctx) => {
			echoSlashCommand(pi, "commit", args);
			const template = loadSkill("commit.md");
			sendHiddenWorkflowPrompt(
				pi,
				buildSkillPrompt(template, args, { replaceArguments: true }),
			);
		},
	});

	pi.registerCommand("branch", {
		description:
			"Open a branched copy of this Pi session in a new terminal tab",
		handler: async (args, ctx) => {
			try {
				await executeBranchCommand(args, ctx);
			} catch (err) {
				ctx.ui.notify(
					err instanceof Error ? err.message : String(err),
					"error",
				);
			}
		},
	});

	pi.registerCommand("new-instance", {
		description: "Open a new Pi instance in this cwd in a new terminal tab",
		handler: async (args, ctx) => {
			try {
				await executeNewInstanceCommand(args, ctx);
			} catch (err) {
				ctx.ui.notify(
					err instanceof Error ? err.message : String(err),
					"error",
				);
			}
		},
	});

	pi.registerCommand("new-terminal", {
		description: "Open a plain shell in this cwd in a new terminal",
		handler: async (args, ctx) => {
			try {
				await executeNewTerminalCommand(args, ctx);
			} catch (err) {
				ctx.ui.notify(
					err instanceof Error ? err.message : String(err),
					"error",
				);
			}
		},
	});

	pi.registerShortcut(Key.ctrl("t"), {
		description: "Open a new Pi instance in this cwd",
		handler: async (ctx) => {
			try {
				await executeNewInstanceCommand("", ctx);
			} catch (err) {
				ctx.ui.notify(
					err instanceof Error ? err.message : String(err),
					"error",
				);
			}
		},
	});

	pi.registerCommand("plan-it", {
		description:
			"Crystallize conversation context into an executable plan document; pass worktree/wt to require isolated branch work",
		handler: async (args, _ctx) => {
			const planPath = args
				.trim()
				.match(/(\.specs\/[A-Za-z0-9._/-]+\/plan\.md)/)?.[1];
			startWorkflowEpisode({
				command: "plan-it",
				args,
				artifactPath: planPath,
			});
			await withTimingSpan(
				{
					name: "slash.plan-it",
					category: "command",
					metadata: {
						command: "plan-it",
						workflow: "plan-it",
						phase: "dispatch",
						planPath,
					},
				},
				async () => {
					echoSlashCommand(pi, "plan-it", args);
					const template = loadSkill("plan-it.md");
					sendHiddenWorkflowPrompt(pi, buildSkillPrompt(template, args));
				},
			);
		},
	});

	pi.registerCommand("prd-it", {
		description:
			"Refine a fuzzy product/workflow idea into an optional PRD artifact",
		handler: async (args, _ctx) => {
			startWorkflowEpisode({ command: "prd-it", args });
			await withTimingSpan(
				{
					name: "slash.prd-it",
					category: "command",
					metadata: {
						command: "prd-it",
						workflow: "prd-it",
						phase: "dispatch",
					},
				},
				async () => {
					echoSlashCommand(pi, "prd-it", args);
					const template = loadSkill("prd-it.md");
					sendHiddenWorkflowPrompt(
						pi,
						buildSkillPrompt(template, args, { replaceArguments: true }),
					);
				},
			);
		},
	});

	pi.registerCommand("review-it", {
		description:
			"Adversarial review of a plan file -- finds bugs, gaps, and failure modes",
		handler: async (args, _ctx) => {
			const planPath = args
				.trim()
				.match(/(\.specs\/[A-Za-z0-9._/-]+\/plan\.md)/)?.[1];
			startWorkflowEpisode({
				command: "review-it",
				args,
				artifactPath: planPath,
			});
			await withTimingSpan(
				{
					name: "slash.review-it",
					category: "command",
					metadata: {
						command: "review-it",
						workflow: "review-it",
						phase: "dispatch",
						planPath,
					},
				},
				async () => {
					echoSlashCommand(pi, "review-it", args);
					const template = loadSkill("review-it.md");
					sendHiddenWorkflowPrompt(
						pi,
						buildSkillPrompt(template, args, { replaceArguments: true }),
					);
				},
			);
		},
	});

	pi.registerCommand("do-it", {
		description:
			"Smart task routing -- implements directly, delegates, or plans based on complexity",
		handler: async (args, ctx) => {
			const planPath = args
				.trim()
				.match(/(\.specs\/[A-Za-z0-9._/-]+\/plan\.md)/)?.[1];
			startWorkflowEpisode({
				command: "do-it",
				args,
				artifactPath: planPath,
			});
			await withTimingSpan(
				{
					name: "slash.do-it",
					category: "command",
					metadata: {
						command: "do-it",
						workflow: "do-it",
						phase: "dispatch",
						planPath,
					},
				},
				async () => {
					echoSlashCommand(pi, "do-it", args);
					const template = loadSkill("do-it.md");
					const prompt = buildSkillPrompt(template, args, {
						replaceArguments: true,
					});
					if (isPlanFileInput(args)) {
						await newSessionWithReloadIfNeeded(ctx, {
							withSession: async (newCtx) => {
								await newCtx.sendMessage(
									{
										customType: "workflow.hiddenPrompt",
										content: prompt,
										display: false,
									},
									{ triggerTurn: true, deliverAs: "followUp" },
								);
							},
						});
						return;
					}
					sendHiddenWorkflowPrompt(pi, prompt);
				},
			);
		},
	});

	pi.registerCommand("summarize", {
		description: "Concise recap of this session and notable workflow friction",
		handler: async (args, _ctx) => {
			echoSlashCommand(pi, "summarize", args);
			const extraContext = args.trim()
				? `\n\nAdditional focus: ${args.trim()}`
				: "";
			sendHiddenWorkflowPrompt(pi, `${SUMMARIZE_PROMPT}${extraContext}`);
		},
	});

	pi.registerCommand("research", {
		description:
			"Parallel multi-angle research — primary sources, practical guidance, and alternatives",
		handler: async (args, _ctx) => {
			echoSlashCommand(pi, "research", args);
			const template = loadSkill("research.md");
			await pi.sendUserMessage(
				buildSkillPrompt(template, args, { replaceArguments: true }),
			);
		},
	});

	pi.registerCommand("gitlab-ticket", {
		description:
			"Generate a structured GitLab issue, then optionally create an issue-numbered branch and draft MR",
		handler: async (args, _ctx) => {
			echoSlashCommand(pi, "gitlab-ticket", args);
			const template = loadSkill("gitlab-ticket.md");
			await pi.sendUserMessage(buildGitlabTicketPrompt(template, args));
		},
	});

	pi.registerCommand("clear", {
		description: "Alias to /new",
		handler: async (_args, ctx) => {
			const usageMessage = formatClearedSessionUsage(ctx.getContextUsage?.());
			suppressNextCodexStatusOnNewSession();
			let result: Awaited<ReturnType<ExtensionCommandContext["newSession"]>>;
			try {
				result = await newSessionWithReloadIfNeeded(ctx, {
					setup: async (sessionManager) => {
						if (!usageMessage) return;
						sessionManager.appendCustomMessageEntry?.(
							CLEAR_USAGE_TYPE,
							usageMessage,
							true,
						);
					},
					withSession: async (newCtx) => {
						await showCodexStatus(newCtx);
					},
				});
			} catch (error) {
				clearCodexStatusNewSessionSuppression();
				throw error;
			}
			if (result.cancelled) {
				clearCodexStatusNewSessionSuppression();
			}
		},
	});

	pi.registerCommand("exit", {
		description: "Gracefully quit pi",
		handler: async (_args, ctx) => {
			ctx.shutdown();
		},
	});
}

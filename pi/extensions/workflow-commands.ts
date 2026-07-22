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
 *   /prd-it        -- refine fuzzy ideas into an optional PRD artifact
 *   /review-it     -- adversarial review of a plan file
 *   /do-it         -- smart task routing by complexity
 *   /exit          -- gracefully quit pi
 */

// Convention exception: direct ctx.ui.notify calls in slash-command flows.
// Risk: notification wording could drift from the rest of the extension set
//   if helper format changes; today uiNotify only adds an extension prefix
//   that would be redundant since the user typed the slash command to trigger
//   each flow.
// Why shared helper is inappropriate: a `[workflow-commands]` prefix on every
//   /commit / /plan-it / /review-it status line would echo back the slash
//   command name and add visual noise to user-facing command output.

import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type {
	ContextUsage,
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { Key, Text } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";
import { validateCommitMessage } from "../lib/commit/message";
import { preflightGitStateAsync } from "../lib/commit/plan";
import { emitTerminalBell } from "../lib/extension-utils";
import { resolveCommitPlanningModelFromRegistry } from "../lib/model-routing";
import { withTimingSpan } from "../lib/observability";
import { scanSecrets } from "../lib/secret-scan";
import {
	SLASH_COMMAND_ECHO_TYPE,
	wrapCommandRegistration,
} from "../lib/slash-command-echo.js";
import { defineAgent, type TypedAgentRunContext } from "../lib/typed-agent";
import {
	buildCommitPlanningPrompt,
	buildSecretReviewPrompt,
	buildSkillPrompt,
} from "../lib/workflow-commands/prompts";
import { noteWorkflowSubmission } from "../lib/workflow-friction";
import { startWorkflowEpisode } from "../lib/workflow-telemetry";
import { formatConfiguredUsageReport } from "./codex-status";
import { isOperatorReloadNeeded } from "./operator-status";

const DOTFILES_PI_DIR = path.join(os.homedir(), ".dotfiles", "pi");
const SKILLS_DIR = path.join(DOTFILES_PI_DIR, "skills", "workflow");
const COMMIT_RUNTIME_PATH_PATTERNS = [
	{ label: "Pi runtime cache", regex: /^pi\/cache(?:\/|$)/ },
	{ label: "runtime log directory", regex: /(?:^|\/)logs?\// },
	{ label: "runtime trace directory", regex: /(?:^|\/)traces?\// },
	{ label: "JSONL runtime log", regex: /\.jsonl$/ },
	{ label: "log file", regex: /\.log$/ },
	{ label: "DuckDB database", regex: /\.(?:duckdb|db)$/ },
];

export const SECRET_PATTERNS = [
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
			/(?:^|[^A-Za-z0-9])[A-Za-z_]*(?:PASSWORD|TOKEN|SECRET|API[_-]?KEY)[A-Za-z_]*\s*[:=]\s*["']?(?!%s\b|\$\{|\{\{|\$[A-Za-z_]|<|values\[|envValue\(|process\.env\b|redacted\b|example\b|placeholder\b|token-value\b|secret-value\b)[A-Za-z0-9+/_.:@-]{6,}/gim,
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

async function formatClearedSessionCodexStatus(): Promise<string> {
	try {
		return await formatConfiguredUsageReport();
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
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

export type SecretReviewClassification =
	| "likely_secret"
	| "false_positive"
	| "ambiguous";

interface SecretReviewDecision {
	id: number;
	classification: SecretReviewClassification;
	reason: string;
}

interface SecretReviewFinding extends SecretCandidate {
	classification: SecretReviewClassification;
	reason: string;
}

interface SecretReviewResult {
	findings: SecretReviewDecision[];
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

interface WorkflowContext {
	cwd: string;
	ui: WorkflowUi;
	model: ExtensionCommandContext["model"];
	modelRegistry: ExtensionCommandContext["modelRegistry"];
	getSystemPrompt?: () => string | undefined;
	signal: AbortSignal | undefined;
	sessionManager?: WorkflowSessionManager;
}

const CommitPlannerInputSchema = Type.Object({
	instructions: Type.String(),
	files: Type.Array(Type.String()),
	diffStat: Type.String(),
	cachedStat: Type.String(),
	cachedDiff: Type.String(),
	hint: Type.String(),
});
const CommitPlanSchema = Type.Object({
	groups: Type.Array(
		Type.Object({
			files: Type.Array(Type.String(), { minItems: 1 }),
			subject: Type.String({ minLength: 1 }),
			body: Type.Optional(Type.String()),
		}),
		{ minItems: 1 },
	),
	warnings: Type.Optional(Type.Array(Type.String())),
});
const SecretReviewInputSchema = Type.Object({
	findings: Type.Array(
		Type.Object({
			id: Type.Integer({ minimum: 1 }),
			path: Type.String(),
			label: Type.String(),
			match: Type.String(),
			line: Type.Number(),
			context: Type.String(),
		}),
	),
	coverageCorrection: Type.Optional(Type.String()),
});
const SecretReviewSchema = Type.Object({
	findings: Type.Array(
		Type.Object({
			id: Type.Integer({ minimum: 1 }),
			classification: Type.Union([
				Type.Literal("likely_secret"),
				Type.Literal("false_positive"),
				Type.Literal("ambiguous"),
			]),
			reason: Type.String(),
		}),
	),
});
const UntrackedClassifierInputSchema = Type.Object({
	files: Type.Array(Type.String()),
});
const UntrackedClassifierSchema = Type.Object({
	classifications: Type.Array(
		Type.Object({
			path: Type.String(),
			decision: Type.Union([
				Type.Literal("ignore"),
				Type.Literal("do_not_ignore"),
			]),
			confidence: Type.Number({ minimum: 0, maximum: 100 }),
			reason: Type.String(),
			gitignorePattern: Type.Optional(Type.String()),
		}),
	),
});

const COMMIT_MODEL_TIMEOUT_MS = 120_000;

async function resolveCommitAgentModel(ctx: TypedAgentRunContext) {
	return resolveCommitPlanningModelFromRegistry(ctx.modelRegistry, ctx);
}

const commitPlannerAgent = defineAgent({
	id: "commit-planner",
	instructions: "Plan logical commit groups and conventional commit messages.",
	inputSchema: CommitPlannerInputSchema,
	outputSchema: CommitPlanSchema,
	resolveModel: resolveCommitAgentModel,
	prompt: ({ instructions, ...context }) =>
		buildCommitPlanningPrompt(instructions, context),
	timeoutMs: COMMIT_MODEL_TIMEOUT_MS,
});

const secretReviewAgent = defineAgent({
	id: "secret-reviewer",
	instructions:
		"Classify candidate findings without weakening the deterministic commit policy.",
	inputSchema: SecretReviewInputSchema,
	outputSchema: SecretReviewSchema,
	resolveModel: resolveCommitAgentModel,
	prompt: ({ findings, coverageCorrection }) =>
		buildSecretReviewPrompt(findings, coverageCorrection),
	timeoutMs: COMMIT_MODEL_TIMEOUT_MS,
});

const untrackedClassifierAgent = defineAgent({
	id: "untracked-classifier",
	instructions: "Classify untracked Git paths for commit hygiene.",
	inputSchema: UntrackedClassifierInputSchema,
	outputSchema: UntrackedClassifierSchema,
	resolveModel: resolveCommitAgentModel,
	prompt: ({ files }) => buildUntrackedClassifierPrompt(files),
	timeoutMs: COMMIT_MODEL_TIMEOUT_MS,
});

const CLEAR_USAGE_TYPE = "workflow-clear-usage";
const CLEAR_CODEX_STATUS_TYPE = "workflow-clear-codex-status";
const COMMIT_ACTIVITY_TYPE = "workflow-commit-activity";
const COMMIT_REPORT_TYPE = "workflow-commit-report";

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

function extractJsonValue(text: string) {
	const start = text.search(/[[{]/);
	if (start === -1) return undefined;
	const stack: string[] = [];
	let inString = false;
	let escaped = false;
	for (let i = start; i < text.length; i += 1) {
		const ch = text[i];
		if (escaped) {
			escaped = false;
			continue;
		}
		if (ch === "\\") {
			escaped = true;
			continue;
		}
		if (ch === '"') {
			inString = !inString;
			continue;
		}
		if (inString) continue;
		if (ch === "{") stack.push("}");
		else if (ch === "[") stack.push("]");
		else if (ch === "}" || ch === "]") {
			if (stack.pop() !== ch) return undefined;
			if (stack.length === 0) return text.slice(start, i + 1);
		}
	}
	return undefined;
}

function extractJsonObject(text: string) {
	const jsonText = extractJsonValue(text);
	return jsonText?.startsWith("{") ? jsonText : undefined;
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

export function formatCommitPlannerFailure(error: unknown): string {
	const raw =
		error instanceof Error ? `${error.name}: ${error.message}` : String(error);
	const sanitized = raw
		.replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
		.replace(
			/\b(token|secret|password|api[-_ ]?key)\s*[:=]\s*\S+/gi,
			"$1=[redacted]",
		)
		.replace(/\b[A-Za-z0-9+/_=-]{40,}\b/g, "[redacted]")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 300);
	return `Commit planner failed: ${sanitized || "unknown error"}`;
}

export function formatCommitPlanWarnings(
	warnings: string[] | undefined,
): string[] {
	return (warnings ?? [])
		.map((warning) => warning.trim())
		.filter(Boolean)
		.map((warning) => `Planner warning: ${warning}`);
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

interface CommitFallbackContext {
	files: string[];
	diffStat: string;
	cachedStat: string;
	cachedDiff: string;
	hint: string;
}

export function buildDeterministicCommitFallback(
	context: CommitFallbackContext,
): { plan: CommitPlan } {
	const files = uniqueSorted(context.files.map(normalizeGitPath));
	const message = proposeCommitMessage(files, context.hint, context.cachedDiff);
	return {
		plan: {
			groups: [
				{
					files,
					subject: message.subject,
					...(message.body ? { body: message.body } : {}),
				},
			],
			warnings: ["Using deterministic single-commit fallback."],
		},
	};
}

async function generateCommitPlanWithLlm(
	ctx: WorkflowContext,
	context: {
		files: string[];
		diffStat: string;
		cachedStat: string;
		cachedDiff: string;
		hint: string;
	},
) {
	const result = await commitPlannerAgent.run(
		{
			instructions: loadClaudeCommitInstructions(),
			...context,
		},
		ctx,
	);
	const plan = parseCommitPlan(JSON.stringify(result.output));
	validateCommitPlan(plan, context.files);
	return plan;
}

function shouldLogGitCommand(args: string[]) {
	const command = args[0];
	return (
		command !== "diff" && command !== "ls-files" && command !== "rev-parse"
	);
}

const GIT_COMMAND_TIMEOUT_MS = 120000;

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
		timeout: GIT_COMMAND_TIMEOUT_MS,
		windowsHide: true,
	});
	const gitResult = {
		code: result.status ?? 1,
		stdout: result.stdout ?? "",
		stderr: result.error?.message ?? result.stderr ?? "",
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

function stopProcessTree(pid: number) {
	if (process.platform === "win32") {
		spawn("taskkill", ["/pid", String(pid), "/t", "/f"], {
			windowsHide: true,
			stdio: "ignore",
		});
		return;
	}
	process.kill(-pid, "SIGTERM");
}

function runGitAsync(
	cwd: string,
	args: string[],
	activity?: CommitActivity,
	signal?: AbortSignal,
): Promise<GitRunResult> {
	if (signal?.aborted) {
		return Promise.resolve({
			code: 1,
			stdout: "",
			stderr: "Operation cancelled",
		});
	}
	return new Promise((resolve) => {
		const child = spawn(resolveGit(), args, {
			cwd,
			detached: process.platform !== "win32",
			windowsHide: true,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		let cancelled = false;
		let timedOut = false;
		const timeoutId = setTimeout(() => {
			timedOut = true;
			if (child.pid) stopProcessTree(child.pid);
		}, GIT_COMMAND_TIMEOUT_MS);
		const onAbort = () => {
			cancelled = true;
			if (child.pid) stopProcessTree(child.pid);
		};
		child.stdout?.setEncoding("utf8");
		child.stderr?.setEncoding("utf8");
		child.stdout?.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr?.on("data", (chunk) => {
			stderr += chunk;
		});
		signal?.addEventListener("abort", onAbort, { once: true });
		child.on("error", (err) => {
			clearTimeout(timeoutId);
			signal?.removeEventListener("abort", onAbort);
			const gitResult = {
				code: 1,
				stdout,
				stderr: err.message,
			};
			if (shouldLogGitCommand(args)) {
				activity?.logCommand(`git ${args.join(" ")}`, gitResult);
			}
			resolve(gitResult);
		});
		child.on("close", (code, signalName) => {
			clearTimeout(timeoutId);
			signal?.removeEventListener("abort", onAbort);
			const gitResult = {
				code: code ?? 1,
				stdout,
				stderr: timedOut
					? `git timed out after ${GIT_COMMAND_TIMEOUT_MS / 1000}s`
					: cancelled
						? "Operation cancelled"
						: stderr || (signalName ? `git terminated by ${signalName}` : ""),
			};
			if (shouldLogGitCommand(args)) {
				activity?.logCommand(`git ${args.join(" ")}`, gitResult);
			}
			resolve(gitResult);
		});
	});
}

async function gitOrThrowAsync(
	cwd: string,
	args: string[],
	activity?: CommitActivity,
	signal?: AbortSignal,
) {
	const result = await runGitAsync(cwd, args, activity, signal);
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

async function listChangedFilesAsync(
	cwd: string,
	activity?: CommitActivity,
	signal?: AbortSignal,
) {
	const hasHead =
		(
			await runGitAsync(
				cwd,
				["rev-parse", "--verify", "HEAD"],
				undefined,
				signal,
			)
		).code === 0;
	const headDiff = hasHead
		? parseLines(
				await gitOrThrowAsync(
					cwd,
					["diff", "--name-only", "HEAD"],
					activity,
					signal,
				),
			)
		: [];
	const untracked = parseLines(
		await gitOrThrowAsync(
			cwd,
			["ls-files", "--others", "--exclude-standard"],
			activity,
			signal,
		),
	);
	const staged = parseLines(
		await gitOrThrowAsync(
			cwd,
			["diff", "--cached", "--name-only"],
			activity,
			signal,
		),
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
	const jsonText = extractJsonValue(text);
	if (!jsonText) throw new Error("Untracked classifier did not return JSON");
	const parsed = JSON.parse(jsonText) as
		| { classifications?: unknown }
		| unknown[];
	const rawClassifications = Array.isArray(parsed)
		? parsed
		: parsed && typeof parsed === "object"
			? parsed.classifications
			: undefined;
	if (!Array.isArray(rawClassifications)) {
		throw new Error("Untracked classifier returned no classifications");
	}
	const expected = new Set(untrackedFiles.map(normalizeGitPath));
	const seen = new Set<string>();
	const classifications: UntrackedClassification[] = [];
	for (const item of rawClassifications) {
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

	const findings: SecretCandidate[] = scanSecrets(content).map((finding) => {
		const redactedContent = `${content.slice(0, finding.offset)}${finding.redacted}${content.slice(finding.offset + finding.length)}`;
		return {
			path: relativePath,
			label: finding.kind,
			match: finding.redacted,
			line: finding.line,
			context: buildSecretContext(redactedContent, finding.offset).context,
		};
	});
	for (const pattern of SECRET_PATTERNS) {
		for (const match of content.matchAll(pattern.regex)) {
			const raw = String(match[0]);
			const index = match.index ?? 0;
			if (/\b(?:task|risk)$/i.test(content.slice(0, index))) continue;
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
	return validateCommitMessage(subject).valid;
}

export function parseSecretReviewResult(text: string): SecretReviewResult {
	const jsonText = extractJsonObject(text);
	if (!jsonText) throw new Error("Secret reviewer did not return JSON");
	const parsed = JSON.parse(jsonText) as SecretReviewResult;
	const classifications = new Set([
		"likely_secret",
		"false_positive",
		"ambiguous",
	]);
	if (
		!parsed ||
		!Array.isArray(parsed.findings) ||
		parsed.findings.some(
			(finding) =>
				!finding ||
				!Number.isInteger(finding.id) ||
				finding.id < 1 ||
				!classifications.has(finding.classification) ||
				typeof finding.reason !== "string",
		)
	) {
		throw new Error("Secret reviewer returned invalid findings");
	}
	return parsed;
}

export function validateSecretReviewCoverage(
	reviewed: SecretReviewDecision[],
	candidates: SecretCandidate[],
) {
	const actualIds = reviewed.map((finding) => finding.id);
	if (
		actualIds.length !== candidates.length ||
		new Set(actualIds).size !== actualIds.length ||
		actualIds.some((id) => id < 1 || id > candidates.length)
	) {
		throw new Error(
			"Secret reviewer must classify every candidate exactly once",
		);
	}
}

async function reviewSecretFindingsWithLlm(
	ctx: WorkflowContext,
	findings: SecretCandidate[],
): Promise<SecretReviewFinding[]> {
	if (findings.length === 0) return [];
	const identifiedFindings = findings.map((finding, index) => ({
		id: index + 1,
		...finding,
	}));
	const runReview = async (coverageCorrection?: string) => {
		const result = await secretReviewAgent.run(
			{ findings: identifiedFindings, coverageCorrection },
			ctx,
		);
		return parseSecretReviewResult(JSON.stringify(result.output)).findings;
	};
	let reviewed = await runReview();
	try {
		validateSecretReviewCoverage(reviewed, findings);
	} catch {
		reviewed = await runReview(
			`Your previous response did not classify every candidate ID exactly once. Return exactly ${findings.length} findings covering IDs 1 through ${findings.length}, with no duplicates or extra IDs.`,
		);
		validateSecretReviewCoverage(reviewed, findings);
	}
	return reviewed.map((decision) => ({
		...findings[decision.id - 1],
		classification: decision.classification,
		reason: decision.reason,
	}));
}

export function isBlockingSecretReviewClassification(
	classification: SecretReviewClassification,
): boolean {
	return classification === "likely_secret" || classification === "ambiguous";
}

async function confirmSecretScan(
	ctx: WorkflowContext,
	findings: SecretCandidate[],
) {
	if (findings.length === 0) return true;
	const reviewed = await reviewSecretFindingsWithLlm(ctx, findings);
	const blocking = reviewed.filter((finding) =>
		isBlockingSecretReviewClassification(finding.classification),
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

export async function classifyUntrackedFiles(
	ctx: WorkflowContext,
	untrackedFiles: string[],
): Promise<UntrackedClassificationPlan> {
	if (untrackedFiles.length === 0) {
		return { accepted: [], needsUserDecision: [] };
	}
	const result = await untrackedClassifierAgent.run(
		{ files: untrackedFiles },
		ctx,
	);
	return parseUntrackedClassifierResult(
		JSON.stringify(result.output),
		untrackedFiles,
	);
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
	_stagedFiles: string[],
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

async function stageFilesAsync(
	cwd: string,
	files: string[],
	activity?: CommitActivity,
	allCommittableFiles: string[] = files,
	signal?: AbortSignal,
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
	const ignoredExisting: string[] = [];
	for (const file of existingFiles) {
		const result = await runGitAsync(
			cwd,
			["check-ignore", "--quiet", "--", file],
			undefined,
			signal,
		);
		if (result.code === 0) ignoredExisting.push(file);
	}
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
		const addResult = await runGitAsync(
			cwd,
			stagingPlan.addArgs,
			activity,
			signal,
		);
		if (addResult.code !== 0)
			throw new Error(
				(addResult.stderr || addResult.stdout).trim() || "git add failed",
			);
	}
	if (missingFiles.length > 0) {
		const rmResult = await runGitAsync(
			cwd,
			["rm", "--ignore-unmatch", "--", ...missingFiles],
			activity,
			signal,
		);
		if (rmResult.code !== 0)
			throw new Error(
				(rmResult.stderr || rmResult.stdout).trim() || "git rm failed",
			);
	}
}

async function unstageFilesAsync(
	cwd: string,
	files: string[],
	activity?: CommitActivity,
	signal?: AbortSignal,
) {
	const resetResult = await runGitAsync(
		cwd,
		["reset", "HEAD", "--", ...files],
		activity,
		signal,
	);
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

async function commitCurrentChangesAsync(
	cwd: string,
	commitMessage: { subject: string; body?: string },
	activity?: CommitActivity,
	signal?: AbortSignal,
) {
	const commitArgs = commitMessage.body
		? ["commit", "-m", commitMessage.subject, "-m", commitMessage.body]
		: ["commit", "-m", commitMessage.subject];
	const commitResult = await runGitAsync(cwd, commitArgs, activity, signal);
	if (commitResult.code !== 0)
		throw new Error(
			(commitResult.stderr || commitResult.stdout).trim() ||
				"git commit failed",
		);
	return gitOrThrowAsync(
		cwd,
		["rev-parse", "--short", "HEAD"],
		activity,
		signal,
	);
}

async function pushCurrentBranchAsync(
	cwd: string,
	activity?: CommitActivity,
	signal?: AbortSignal,
) {
	const pushResult = await runGitAsync(cwd, ["push"], activity, signal);
	if (pushResult.code !== 0)
		throw new Error(
			(pushResult.stderr || pushResult.stdout).trim() || "git push failed",
		);
}

function emitCommitReport(
	pi: ExtensionAPI,
	ctx: WorkflowContext,
	lines: string[],
) {
	const content = lines.join("\n");
	if (typeof pi.sendMessage === "function") {
		pi.sendMessage({
			customType: COMMIT_REPORT_TYPE,
			content,
			display: true,
		});
		return;
	}
	ctx.ui.notify(content, "info");
}

function echoSlashCommand(pi: ExtensionAPI, command: string, args: string) {
	const text = args.trim() ? `/${command} ${args.trim()}` : `/${command}`;
	if (typeof pi.sendMessage === "function") {
		pi.sendMessage({
			customType: SLASH_COMMAND_ECHO_TYPE,
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

function formatGitOutput(result?: GitRunResult) {
	if (!result) return [];
	const lines: string[] = [];
	const stdout = result.stdout.trim();
	const stderr = result.stderr.trim();
	if (stdout)
		lines.push(...stdout.split("\n").map((line) => `stdout: ${line}`));
	if (stderr)
		lines.push(...stderr.split("\n").map((line) => `stderr: ${line}`));
	lines.push(`exit: ${result.code}`);
	return lines;
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
		ctx.ui.setWidget?.("commit-progress", fallbackLines.slice(-12), {
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
			emit(output ? `$ ${command}\n${output}` : `$ ${command}`);
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

async function getCommitContext(
	cwd: string,
	activity?: CommitActivity,
	signal?: AbortSignal,
) {
	const { all, staged, untracked } = await listChangedFilesAsync(
		cwd,
		activity,
		signal,
	);
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
	const diffStat = await gitOrThrowAsync(
		cwd,
		["diff", "--stat", "HEAD", "--", ...changed.included],
		activity,
		signal,
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
		await getCommitContext(ctx.cwd, activity, ctx.signal);
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
		({ diffStat, changedFiles, stagedFiles, untrackedFiles } =
			await getCommitContext(ctx.cwd, activity, ctx.signal));
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
		await stageFilesAsync(
			ctx.cwd,
			selection.files,
			activity,
			changedFiles,
			ctx.signal,
		);

	const cachedStat = await gitOrThrowAsync(
		ctx.cwd,
		["diff", "--cached", "--stat"],
		activity,
		ctx.signal,
	);
	if (!cachedStat.trim()) throw new Error("Nothing is staged for commit");
	const cachedDiff = await gitOrThrowAsync(
		ctx.cwd,
		["diff", "--cached", "--no-color"],
		activity,
		ctx.signal,
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
	ctx.ui.notify(`Starting ${commandText}...`, "info");
	activity.setPhase("preparing");
	try {
		if (ctx.signal?.aborted) throw new Error("Operation cancelled");
		const preflight = await preflightGitStateAsync(
			ctx.cwd,
			(cwd, gitArgs, signal) => runGitAsync(cwd, gitArgs, activity, signal),
			ctx.signal,
		);
		if (!preflight.ok) {
			throw new Error(
				`Git state preflight failed:\n${preflight.blocked.join("\n")}`,
			);
		}
		const status = await gitOrThrowAsync(
			ctx.cwd,
			["status", "--short"],
			activity,
			ctx.signal,
		);
		if (!status.trim()) {
			activity.finish();
			return ctx.ui.notify("Working tree is clean", "info");
		}

		const prepared = await prepareCommitSelection(args, ctx, activity);
		if (!prepared) {
			activity.finish();
			return ctx.ui.notify("Commit cancelled", "warning");
		}
		activity.setPhase("planning commits");

		let plan: CommitPlan | undefined;
		try {
			plan = await generateCommitPlanWithLlm(ctx, {
				files: prepared.selection.files,
				diffStat: prepared.diffStat,
				cachedStat: prepared.cachedStat,
				cachedDiff: prepared.cachedDiff,
				hint: prepared.parsedArgs.hint,
			});
		} catch (error) {
			activity.logInfo(formatCommitPlannerFailure(error));
			const fallback = buildDeterministicCommitFallback({
				files: prepared.selection.files,
				diffStat: prepared.diffStat,
				cachedStat: prepared.cachedStat,
				cachedDiff: prepared.cachedDiff,
				hint: prepared.parsedArgs.hint,
			});
			plan = fallback.plan;
		}

		if (!plan) throw new Error("Commit planning produced no plan");
		for (const warning of formatCommitPlanWarnings(plan.warnings)) {
			activity.logInfo(warning);
		}
		const commitSummaries: string[] = [];
		await unstageFilesAsync(
			ctx.cwd,
			prepared.selection.files,
			activity,
			ctx.signal,
		);
		for (const [index, group] of plan.groups.entries()) {
			activity.setPhase(`creating commit ${index + 1}/${plan.groups.length}`);
			await stageFilesAsync(
				ctx.cwd,
				group.files,
				activity,
				prepared.selection.files,
				ctx.signal,
			);
			let hash: string;
			try {
				const stagedStat = await gitOrThrowAsync(
					ctx.cwd,
					["diff", "--cached", "--stat"],
					activity,
					ctx.signal,
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
					await unstageFilesAsync(ctx.cwd, group.files, activity, ctx.signal);
					activity.finish();
					return ctx.ui.notify("Commit cancelled", "warning");
				}
				hash = await commitCurrentChangesAsync(
					ctx.cwd,
					commitMessage,
					activity,
					ctx.signal,
				);
				commitSummaries.push(`${hash} ${commitMessage.subject}`);
			} catch (groupErr) {
				await unstageFilesAsync(ctx.cwd, group.files, activity, ctx.signal);
				throw groupErr;
			}
		}
		if (prepared.parsedArgs.push) {
			activity.setPhase("pushing");
			await pushCurrentBranchAsync(ctx.cwd, activity, ctx.signal);
			activity.logInfo("Pushed to remote");
		}
		activity.finish();
		emitCommitReport(pi, ctx, commitSummaries);
		return;
	} catch (err) {
		activity.logInfo(
			`Error: Commit failed: ${err instanceof Error ? err.message : String(err)}`,
		);
		activity.finish();
		throw err;
	}
}

export default function (pi: ExtensionAPI) {
	wrapCommandRegistration(pi, {
		excludeCommands: ["plan-it", "prd-it", "review-it", "do-it"],
	});
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

		pi.registerMessageRenderer(CLEAR_CODEX_STATUS_TYPE, (message) => {
			const text =
				typeof message.content === "string"
					? message.content
					: String(message.content ?? "");
			return new Text(text, 1, 0);
		});

		pi.registerMessageRenderer(
			SLASH_COMMAND_ECHO_TYPE,
			(message, _options, theme) => {
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
			},
		);

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

		pi.registerMessageRenderer(
			COMMIT_REPORT_TYPE,
			(message, _options, theme) => {
				const text =
					typeof message.content === "string"
						? message.content
						: String(message.content ?? "");
				const styled = text
					.split("\n")
					.map((line) => {
						const match = line.match(/^([0-9a-f]{7,12})\s+(.*)$/i);
						if (match) {
							return `${theme.fg("dim", match[1])} ${theme.bold(theme.fg("text", match[2]))}`;
						}
						if (line === "Pushed to remote") return theme.fg("success", line);
						return theme.fg("text", line);
					})
					.join("\n");
				return new Text(
					`${theme.bold(theme.fg("success", "commits:"))}\n${styled}`,
					0,
					0,
				);
			},
		);
	}

	pi.registerCommand("commit", {
		description: "Smart git commit with flexible prompt-driven grouping",
		handler: async (args, ctx) => {
			try {
				await executeCommitCommand(pi, args, ctx);
			} catch (err) {
				ctx.ui.notify(
					`Commit failed: ${err instanceof Error ? err.message : String(err)}`,
					"error",
				);
			}
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
			noteWorkflowSubmission(
				args.trim() ? `/plan-it ${args.trim()}` : "/plan-it",
				"engineer",
			);
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
		description: "Review a plan or requirements artifact",
		handler: async (args, _ctx) => {
			echoSlashCommand(pi, "review-it", args);
			const template = loadSkill("review-it.md");
			sendHiddenWorkflowPrompt(
				pi,
				buildSkillPrompt(template, args, { replaceArguments: true }),
			);
		},
	});

	pi.registerCommand("do-it", {
		description: "Execute a task or plan with proportional validation",
		handler: async (args, _ctx) => {
			echoSlashCommand(pi, "do-it", args);
			const template = loadSkill("do-it.md");
			const prompt = buildSkillPrompt(template, args, {
				replaceArguments: true,
			});
			sendHiddenWorkflowPrompt(pi, prompt);
		},
	});

	pi.registerCommand("clear", {
		description: "Alias to /new",
		handler: async (_args, ctx) => {
			const usageMessage = formatClearedSessionUsage(ctx.getContextUsage?.());
			await newSessionWithReloadIfNeeded(ctx, {
				setup: async (sessionManager) => {
					if (!sessionManager.appendCustomMessageEntry) return;
					const codexStatusMessage = await formatClearedSessionCodexStatus();
					sessionManager.appendCustomMessageEntry(
						CLEAR_CODEX_STATUS_TYPE,
						codexStatusMessage,
						true,
					);
					if (!usageMessage) return;
					sessionManager.appendCustomMessageEntry(
						CLEAR_USAGE_TYPE,
						usageMessage,
						true,
					);
				},
			});
		},
	});

	pi.registerCommand("exit", {
		description: "Gracefully quit pi",
		handler: async (_args, ctx) => {
			ctx.shutdown();
		},
	});
}

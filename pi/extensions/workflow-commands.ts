import { onSessionStart } from "../lib/session-start-metrics.js";
/**
 * Workflow Commands Extension
 *
 * Registers shared slash commands. Prompt-backed workflows load skill template
 * files and dispatch them through hidden follow-up messages. `/commit` runs its
 * deterministic commit workflow directly.
 *
 *   /commit        -- smart git commit with submodule handling and secret scanning
 *   /new-terminal  -- open a plain shell in this cwd in a new terminal
 *   /plan-it       -- crystallize conversation context into an executable plan
 *   /do-it         -- smart task routing by complexity
 *   /exit          -- gracefully quit pi
 */

// Convention exception: direct ctx.ui.notify calls in slash-command flows.
// Risk: notification wording could drift from the rest of the extension set
//   if helper format changes; today uiNotify only adds an extension prefix
//   that would be redundant since the user typed the slash command to trigger
//   each flow.
// Why shared helper is inappropriate: a `[workflow-commands]` prefix on every
//   /commit / /plan-it status line would echo back the slash
//   command name and add visual noise to user-facing command output.

import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	BorderedLoader,
	copyToClipboard,
	type ContextUsage,
	type ExtensionAPI,
	type ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Key, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { commitFailureMessage } from "../lib/commit/failure";
import { validateCommitMessage } from "../lib/commit/message";
import {
	buildStagingPlan,
	stageExactPathsAsync,
	stageExactPathsWithRunner,
	type StagingPlan,
} from "../lib/commit/stage";
import {
	changedFilesFromStatus,
	normalizeGitPath,
	PORCELAIN_V2_STATUS_ARGS,
	type ChangedFilesSnapshot,
	uniqueGitPaths,
} from "../lib/commit/status";
import { emitTerminalBell, formatToolError } from "../lib/extension-utils";
import { formatTranscriptTiming } from "../lib/tool-timing.js";
import { handoffRecoverableLocalFailure } from "../lib/recovery-handoff.js";
import { resolveCommitPlanningModelFromRegistry } from "../lib/model-routing";
import { parsePersistedPlanRoutingState } from "../lib/plan-state.js";
import { withTimingSpan } from "../lib/observability";
import {
	canonicalPlanPathFromInput,
	createPlanLifecycleSnapshot,
	parsePlanCloseoutPolicy,
	isPlanLifecycleSnapshot,
	PLAN_LIFECYCLE_ENTRY_TYPE,
	registerPlanLifecycleController,
	type PlanLifecycleSnapshot,
	type PlanProgressInput,
	type PlanReviewerRole,
	type PlanReviewOutcome,
	transitionPlanLifecycle,
	validatePlanFile,
} from "../lib/workflow-commands/plan-lifecycle";
import { scanSecrets } from "../lib/secret-scan";
import {
	appendNextCommand,
	appendSlashCommandAcknowledgement,
	stripTrailingNextCommandContent,
} from "../lib/slash-command-echo.js";
import { defineAgent, type TypedAgentRunContext } from "../lib/typed-agent";
import {
	createCommitCommandExecutor,
	formatCommitWorkflowFailure,
} from "../lib/workflow-commands/commit-orchestration";
import {
	buildCommitPlanningPrompt,
	buildSecretReviewPrompt,
	buildSkillPrompt,
} from "../lib/workflow-commands/prompts";
import { noteWorkflowSubmission } from "../lib/workflow-friction";
import { sendHiddenWorkflowPrompt } from "../lib/workflow-prompt.js";
import { startWorkflowEpisode } from "../lib/workflow-telemetry";
import {
	type WorkflowWorktree,
	closeWorkflowWorktree,
	verifyAndCleanupWorkflowWorktree,
	verifyRetainedWorkflowWorktree,
	ensureWorkflowWorktree,
	materializePlanInWorkflowWorktree,
	readWorkflowOwnershipForWorktree,
	readWorkflowOwnershipRecord,
	resolveWorkflowRepoRoot,
	workflowSlugFromPlan,
	workflowSlugFromRequest,
} from "../lib/workflow-worktree";
import { activateTools, deactivateTools } from "../lib/tool-activation";
import { formatConfiguredUsageReport } from "./codex-status";
import { isOperatorReloadNeeded } from "./operator-status";

const DOTFILES_PI_DIR = path.join(os.homedir(), ".dotfiles", "pi");
const SKILLS_DIR = path.join(DOTFILES_PI_DIR, "skills", "workflow");
const PLAN_PREFLIGHT_MESSAGE_TYPE = "workflow.plan-preflight";
const MAX_PLAN_PREFLIGHT_CHARS = 2000;

export function parsePlanItArgs(args: string): {
	mode: "standard" | "quick";
	request: string;
} {
	const trimmed = args.trim();
	const quick = trimmed.match(/^quick(?:\s+([\s\S]*))?$/i);
	return quick
		? { mode: "quick", request: (quick[1] ?? "").trim() }
		: { mode: "standard", request: trimmed };
}

export const COMMIT_SECRETS_ATTRIBUTE = "commit-secrets";
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

class NoCommittableChangesError extends Error {}

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
	diff: Type.String(),
	hint: Type.String(),
	validationCorrection: Type.Optional(Type.String()),
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

async function yieldForLauncherFeedback() {
	await new Promise<void>((resolve) => setImmediate(resolve));
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

export function isHerdrManagedEnvironment(
	env: NodeJS.ProcessEnv = process.env,
): boolean {
	return env.HERDR_ENV === "1";
}

function requiredHerdrEnvironment(
	name: "HERDR_WORKSPACE_ID",
	env: NodeJS.ProcessEnv = process.env,
): string {
	const value = env[name]?.trim();
	if (!value) throw new Error(`Herdr launch requires ${name}.`);
	return value;
}

async function runHerdrCommand(
	pi: ExtensionAPI,
	args: string[],
	cwd: string,
	signal: AbortSignal | undefined,
	timeout: number,
): Promise<string> {
	const executable = process.env.HERDR_BIN_PATH?.trim() || "herdr";
	const result = await pi.exec(executable, args, { cwd, signal, timeout });
	if (signal?.aborted || result.killed) throw new Error("Herdr launch cancelled.");
	if (result.code !== 0) {
		const detail = (result.stderr || result.stdout).trim();
		throw new Error(
			detail || `Herdr command failed with exit code ${result.code}.`,
		);
	}
	return result.stdout;
}

interface HerdrTabCreateResponse {
	result?: {
		root_pane?: { pane_id?: string };
		tab?: { tab_id?: string };
	};
}

async function createHerdrTab(
	pi: ExtensionAPI,
	input: {
		cwd: string;
		title: string;
		signal?: AbortSignal;
	},
): Promise<{ paneId: string; tabId: string }> {
	const workspaceId = requiredHerdrEnvironment("HERDR_WORKSPACE_ID");
	const cwd =
		process.platform === "win32" ? msysPathToWindows(input.cwd) : input.cwd;
	const stdout = await runHerdrCommand(
		pi,
		[
			"tab",
			"create",
			"--workspace",
			workspaceId,
			"--cwd",
			cwd,
			"--label",
			input.title,
			"--focus",
		],
		cwd,
		input.signal,
		15_000,
	);
	const json = extractJsonObject(stdout);
	if (!json) throw new Error("Herdr tab create returned invalid JSON.");
	const response = JSON.parse(json) as HerdrTabCreateResponse;
	const paneId = response.result?.root_pane?.pane_id;
	const tabId = response.result?.tab?.tab_id;
	if (!paneId || !tabId)
		throw new Error("Herdr tab create did not return tab and pane IDs.");
	return { paneId, tabId };
}

async function createHerdrPiTab(
	pi: ExtensionAPI,
	input: {
		cwd: string;
		title: string;
		sessionFile?: string;
		signal?: AbortSignal;
	},
): Promise<void> {
	const created = await createHerdrTab(pi, input);
	const piArgs = input.sessionFile ? buildPiResumeArgs(input.sessionFile) : [];
	const command =
		process.platform === "win32"
			? ["&", "pi", ...piArgs.map(quotePowerShellArg)].join(" ")
			: buildShellPiCommand(piArgs);
	const cwd =
		process.platform === "win32" ? msysPathToWindows(input.cwd) : input.cwd;
	await runHerdrCommand(
		pi,
		["pane", "run", created.paneId, command],
		cwd,
		input.signal,
		15_000,
	);
}

async function executeNewInstanceCommand(
	pi: ExtensionAPI,
	args: string,
	ctx: Pick<WorkflowContext, "cwd" | "ui"> & { signal?: AbortSignal },
) {
	const cwd = ctx.cwd ?? process.cwd();
	const title = args.trim() || defaultBranchTitle(cwd);
	ctx.ui.notify(
		isHerdrManagedEnvironment()
			? `Opening new Pi instance in a Herdr tab: ${title}`
			: `Opening new Pi instance in a new terminal tab: ${title}`,
		"info",
	);
	if (isHerdrManagedEnvironment()) {
		await createHerdrPiTab(pi, { cwd, title, signal: ctx.signal });
		return ctx.ui.notify(
			`Opened new Pi instance in a Herdr tab: ${title}`,
			"info",
		);
	}
	const plan = buildNewInstanceLaunchPlan({ cwd, title });
	if (plan.executable) await yieldForLauncherFeedback();
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
	pi: ExtensionAPI,
	args: string,
	ctx: Pick<WorkflowContext, "cwd" | "ui"> & { signal?: AbortSignal },
) {
	const cwd = ctx.cwd ?? process.cwd();
	const title = args.trim() || defaultBranchTitle(cwd);
	ctx.ui.notify(
		isHerdrManagedEnvironment()
			? `Opening new Herdr tab in this cwd: ${title}`
			: `Opening new terminal in this cwd: ${title}`,
		"info",
	);
	if (isHerdrManagedEnvironment()) {
		await createHerdrTab(pi, { cwd, title, signal: ctx.signal });
		return ctx.ui.notify(`Opened new Herdr tab in this cwd: ${title}`, "info");
	}
	const plan = buildNewTerminalLaunchPlan({ cwd, title });
	if (plan.executable) await yieldForLauncherFeedback();
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

async function executeBranchCommand(
	pi: ExtensionAPI,
	args: string,
	ctx: WorkflowContext,
) {
	const sessionManager = ctx.sessionManager;
	const leafId = sessionManager?.getLeafId?.();
	if (!sessionManager?.createBranchedSession || !leafId) {
		return ctx.ui.notify(
			"Cannot branch this session yet: no persisted session leaf is available.",
			"error",
		);
	}
	const cwd = ctx.cwd ?? process.cwd();
	const title = args.trim() || defaultBranchTitle(cwd);
	ctx.ui.notify(
		isHerdrManagedEnvironment()
			? `Opening branched Pi session in a Herdr tab: ${title}`
			: `Opening branched Pi session in a new terminal tab: ${title}`,
		"info",
	);
	const branchSessionFile = sessionManager.createBranchedSession(leafId);
	if (!branchSessionFile) {
		return ctx.ui.notify(
			"Cannot branch this session: session persistence is unavailable.",
			"error",
		);
	}
	if (isHerdrManagedEnvironment()) {
		await createHerdrPiTab(pi, {
			cwd,
			title,
			sessionFile: branchSessionFile,
			signal: ctx.signal,
		});
		return ctx.ui.notify(
			`Opened branched Pi session in a Herdr tab: ${title}`,
			"info",
		);
	}
	const plan = buildBranchLaunchPlan({
		cwd,
		title,
		sessionFile: branchSessionFile,
	});
	if (plan.executable) await yieldForLauncherFeedback();
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
	diff: string;
	hint: string;
}

export function buildDeterministicCommitFallback(
	context: CommitFallbackContext,
): { plan: CommitPlan } {
	const files = uniqueSorted(context.files.map(normalizeGitPath));
	const message = proposeCommitMessage(files, context.hint, context.diff);
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
		diff: string;
		hint: string;
	},
) {
	const runPlanner = async (validationCorrection?: string) => {
		const result = await commitPlannerAgent.run(
			{
				instructions: loadClaudeCommitInstructions(),
				...context,
				validationCorrection,
			},
			ctx,
		);
		return parseCommitPlan(JSON.stringify(result.output));
	};

	let plan = await runPlanner();
	try {
		validateCommitPlan(plan, context.files);
	} catch {
		plan = await runPlanner(
			"Your previous response failed deterministic validation. Regenerate the complete plan. Assign every listed changed file to exactly one group with no duplicates, omissions, or extra paths. Every subject must use the required conventional commit format and an allowed type.",
		);
		validateCommitPlan(plan, context.files);
	}
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
	input?: string,
): GitRunResult {
	const result = spawnSync(resolveGit(), args, {
		cwd,
		encoding: "utf8",
		input,
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
	input?: string,
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
			stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
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
		if (input !== undefined) {
			child.stdin?.on("error", () => {
				// Process close reports the Git failure.
			});
			child.stdin?.end(input);
		}
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

const uniqueSorted = uniqueGitPaths;

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
	const status = gitOrThrow(cwd, [...PORCELAIN_V2_STATUS_ARGS], activity);
	const { hasHead: _hasHead, hasDirtySubmodule: _dirty, ...files } =
		changedFilesFromStatus(status);
	return files;
}

async function listChangedFilesAsync(
	cwd: string,
	activity?: CommitActivity,
	signal?: AbortSignal,
	statusOutput?: string,
): Promise<ChangedFilesSnapshot> {
	const status =
		statusOutput ??
		(await gitOrThrowAsync(
			cwd,
			[...PORCELAIN_V2_STATUS_ARGS],
			activity,
			signal,
		));
	return changedFilesFromStatus(status);
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

export { buildStagingPlan };
export type { StagingPlan };

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

function scanContentForSecrets(
	relativePath: string,
	content: string,
): SecretCandidate[] {
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

async function scanStagedFilesForSecrets(
	cwd: string,
	files: string[],
	activity?: CommitActivity,
	signal?: AbortSignal,
) {
	const indexResult = await runGitAsync(
		cwd,
		["ls-files", "--stage", "-z", "--", ...files],
		activity,
		signal,
	);
	if (indexResult.code !== 0) {
		throw new Error(
			(indexResult.stderr || indexResult.stdout).trim() ||
				"git ls-files failed",
		);
	}
	const entries = indexResult.stdout
		.split("\0")
		.filter(Boolean)
		.map((record) => {
			const match = record.match(/^(\d+) ([0-9a-f]+) 0\t([\s\S]+)$/);
			if (!match) throw new Error("git ls-files returned malformed staged entry");
			return { mode: match[1], objectId: match[2], path: match[3] };
		})
		.filter((entry) => entry.mode !== "160000");
	const findings: SecretCandidate[] = [];
	for (const entry of entries) {
		const blob = await runGitAsync(
			cwd,
			["cat-file", "blob", entry.objectId],
			activity,
			signal,
		);
		if (blob.code !== 0) {
			throw new Error(
				(blob.stderr || blob.stdout).trim() || "git cat-file failed",
			);
		}
		findings.push(...scanContentForSecrets(entry.path, blob.stdout));
	}
	return findings;
}

export function parseCommitSecretsAllowedPaths(output: string) {
	if (!output) return new Set<string>();
	const fields = output.split("\0");
	if (fields.at(-1) === "") fields.pop();
	if (fields.length % 3 !== 0) {
		throw new Error("git check-attr returned malformed NUL-delimited output");
	}
	const allowed = new Set<string>();
	for (let index = 0; index < fields.length; index += 3) {
		const file = fields[index];
		const attribute = fields[index + 1];
		const value = fields[index + 2];
		if (file && attribute === COMMIT_SECRETS_ATTRIBUTE && value === "allow") {
			allowed.add(normalizeGitPath(file));
		}
	}
	return allowed;
}

async function getCommitSecretsAllowedPaths(
	cwd: string,
	files: string[],
	signal?: AbortSignal,
) {
	if (files.length === 0) return new Set<string>();
	const output = await gitOrThrowAsync(
		cwd,
		["check-attr", "--cached", "-z", COMMIT_SECRETS_ATTRIBUTE, "--", ...files],
		undefined,
		signal,
	);
	return parseCommitSecretsAllowedPaths(output);
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

async function reviewStagedSecrets(
	ctx: WorkflowContext,
	files: string[],
	activity?: CommitActivity,
) {
	const findings = await scanStagedFilesForSecrets(
		ctx.cwd,
		files,
		activity,
		ctx.signal,
	);
	const findingPaths = uniqueSorted(findings.map((finding) => finding.path));
	const allowedSecretPaths = await getCommitSecretsAllowedPaths(
		ctx.cwd,
		findingPaths,
		ctx.signal,
	);
	const reviewableFindings = findings.filter(
		(finding) => !allowedSecretPaths.has(normalizeGitPath(finding.path)),
	);
	if (allowedSecretPaths.size > 0) {
		activity?.logInfo(
			`${COMMIT_SECRETS_ATTRIBUTE}=allow for ${allowedSecretPaths.size} selected path(s); skipping secret review for those paths.`,
		);
	}
	await confirmSecretScan(ctx, reviewableFindings);
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

function appendGitignorePatterns(cwd: string, patterns: string[]): boolean {
	const uniquePatterns = uniqueSorted(
		patterns.map((p) => p.trim()).filter(Boolean),
	);
	if (uniquePatterns.length === 0) return false;
	const gitignorePath = path.join(cwd, ".gitignore");
	const existing = fs.existsSync(gitignorePath)
		? fs.readFileSync(gitignorePath, "utf-8")
		: "";
	const existingLines = new Set(parseLines(existing));
	const missing = uniquePatterns.filter(
		(pattern) => !existingLines.has(pattern),
	);
	if (missing.length === 0) return false;
	const prefix = existing.length === 0 || existing.endsWith("\n") ? "" : "\n";
	fs.appendFileSync(gitignorePath, `${prefix}${missing.join("\n")}\n`);
	return true;
}

function applyUntrackedClassifications(
	cwd: string,
	classifications: UntrackedClassification[],
	activity?: CommitActivity,
): string[] {
	const ignored = classifications.filter((item) => item.decision === "ignore");
	const gitignoreChanged = appendGitignorePatterns(
		cwd,
		ignored.map((item) => item.gitignorePattern || item.path),
	);
	if (ignored.length > 0) {
		activity?.logInfo(
			`Ignored untracked paths:\n${ignored.map((item) => `- ${item.path}: ${item.reason}`).join("\n")}`,
		);
	}
	return gitignoreChanged ? [".gitignore"] : [];
}

export function postClassificationRequestedFiles(
	requestedFiles: string[],
	changedFiles: string[],
	generatedPaths: string[],
): string[] {
	if (requestedFiles.length === 0) return [];
	const changed = new Set(changedFiles);
	return uniqueSorted(
		[...requestedFiles, ...generatedPaths].filter((file) => changed.has(file)),
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

function checkIgnoreInput(files: string[]): string {
	return files.length > 0 ? `${files.join("\0")}\0` : "";
}

function parseIgnoredPaths(result: GitRunResult): string[] {
	if (result.code !== 0 && result.code !== 1)
		throw new Error(
			(result.stderr || result.stdout).trim() || "git check-ignore failed",
		);
	return uniqueSorted(result.stdout.split("\0").filter(Boolean));
}

function ignoredPaths(
	cwd: string,
	files: string[],
	activity?: CommitActivity,
): string[] {
	if (files.length === 0) return [];
	return parseIgnoredPaths(
		runGit(
			cwd,
			["check-ignore", "-z", "--stdin"],
			activity,
			checkIgnoreInput(files),
		),
	);
}

async function ignoredPathsAsync(
	cwd: string,
	files: string[],
	activity?: CommitActivity,
	signal?: AbortSignal,
): Promise<string[]> {
	if (files.length === 0) return [];
	return parseIgnoredPaths(
		await runGitAsync(
			cwd,
			["check-ignore", "-z", "--stdin"],
			activity,
			signal,
			checkIgnoreInput(files),
		),
	);
}

export async function ignoredCommitArgumentPaths(
	cwd: string,
	rawArgs: string,
	signal?: AbortSignal,
): Promise<string[]> {
	const candidates = rawArgs
		.trim()
		.split(/\s+/)
		.filter((token) => token !== "push")
		.map(normalizeGitPath)
		.filter((token) => fs.existsSync(path.resolve(cwd, token)));
	return ignoredPathsAsync(cwd, uniqueSorted(candidates), undefined, signal);
}

export function stageFiles(
	cwd: string,
	files: string[],
	activity?: CommitActivity,
) {
	const unsafe = filterCommitSafeFiles(files).excluded;
	if (unsafe.length > 0) {
		throw new Error(
			`Refusing to stage runtime/generated paths:\n${formatExcludedCommitPaths(unsafe)}`,
		);
	}
	const ignored = ignoredPaths(
		cwd,
		files.filter((file) => fs.existsSync(path.resolve(cwd, file))),
		activity,
	);
	const stagingPlan = buildStagingPlan({ files, ignoredFiles: ignored });
	if (stagingPlan.unsafe.length > 0) {
		throw new Error(
			`Refusing to stage ignored paths:\n${stagingPlan.unsafe.map((file) => `- ${file}`).join("\n")}`,
		);
	}
	stageExactPathsWithRunner(cwd, files, (repoRoot, args) =>
		runGit(repoRoot, args, activity),
	);
}

async function stageFilesAsync(
	cwd: string,
	files: string[],
	activity?: CommitActivity,
	signal?: AbortSignal,
) {
	const unsafe = filterCommitSafeFiles(files).excluded;
	if (unsafe.length > 0) {
		throw new Error(
			`Refusing to stage runtime/generated paths:\n${formatExcludedCommitPaths(unsafe)}`,
		);
	}
	const ignored = await ignoredPathsAsync(
		cwd,
		files.filter((file) => fs.existsSync(path.resolve(cwd, file))),
		activity,
		signal,
	);
	let stagedIgnoredDeletions: string[] = [];
	if (ignored.length > 0) {
		const result = await runGitAsync(
			cwd,
			[
				"diff",
				"--cached",
				"--name-only",
				"-z",
				"--diff-filter=D",
				"--",
				...ignored,
			],
			activity,
			signal,
		);
		if (result.code !== 0) {
			throw new Error(
				(result.stderr || result.stdout).trim() || "git diff --cached failed",
			);
		}
		stagedIgnoredDeletions = uniqueSorted(
			result.stdout.split("\0").filter(Boolean),
		);
	}
	const preservedDeletions = new Set(stagedIgnoredDeletions);
	const filesToStage = files.filter((file) => !preservedDeletions.has(file));
	const blockedIgnored = ignored.filter(
		(file) => !preservedDeletions.has(file),
	);
	const stagingPlan = buildStagingPlan({
		files: filesToStage,
		ignoredFiles: blockedIgnored,
	});
	if (stagingPlan.unsafe.length > 0) {
		throw new Error(
			`Refusing to stage ignored paths:\n${stagingPlan.unsafe.map((file) => `- ${file}`).join("\n")}`,
		);
	}
	await stageExactPathsAsync(
		cwd,
		filesToStage,
		(repoRoot, args, runSignal) =>
			runGitAsync(repoRoot, args, activity, runSignal),
		signal,
	);
}

async function unstageFilesAsync(
	cwd: string,
	files: string[],
	activity?: CommitActivity,
	signal?: AbortSignal,
) {
	const head = await runGitAsync(
		cwd,
		["rev-parse", "--verify", "HEAD"],
		activity,
		signal,
	);
	const resetArgs =
		head.code === 0
			? ["reset", "HEAD", "--", ...files]
			: ["rm", "--cached", "--ignore-unmatch", "--", ...files];
	const resetResult = await runGitAsync(cwd, resetArgs, activity, signal);
	if (resetResult.code !== 0)
		throw new Error(
			(resetResult.stderr || resetResult.stdout).trim() ||
				"git unstage failed",
		);
}

export async function confirmCommitMessage(commitMessage: {
	subject: string;
	body?: string;
}) {
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
		throw new Error(commitFailureMessage(commitResult));
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
	const pushResult = await runGitAsync(
		cwd,
		["push", "--recurse-submodules=on-demand"],
		activity,
		signal,
	);
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

const MAX_COMMIT_ACTIVITY_CHARS = 2000;

function boundedCommitActivity(content: string): string {
	if (content.length <= MAX_COMMIT_ACTIVITY_CHARS) return content;
	return `${content.slice(0, MAX_COMMIT_ACTIVITY_CHARS - 22)}\n... details truncated`;
}

function createCommitActivity(
	pi: ExtensionAPI,
	ctx: WorkflowContext,
	_commandText: string,
): CommitActivity {
	const emit = (content: string) => {
		const bounded = boundedCommitActivity(content);
		if (typeof pi.sendMessage === "function") {
			pi.sendMessage({
				customType: COMMIT_ACTIVITY_TYPE,
				content: bounded,
				display: true,
			});
			return;
		}
		ctx.ui.notify(bounded, "info");
	};

	return {
		setPhase(message?: string) {
			ctx.ui.setStatus?.(
				"commit",
				message && message !== "done" ? `commit: ${message}` : undefined,
			);
		},
		logCommand(_command: string, _result?: GitRunResult) {
			// Internal Git commands remain available to the workflow but do not
			// create persistent transcript noise. Failures are reported by the
			// owning operation with bounded context.
		},
		logInfo(message: string) {
			emit(message);
		},
		finish() {
			ctx.ui.setStatus?.("commit", undefined);
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
	initialSnapshot?: ChangedFilesSnapshot,
) {
	const snapshot =
		initialSnapshot ?? (await listChangedFilesAsync(cwd, activity, signal));
	const changed = filterCommitSafeFiles(snapshot.all);
	const stagedSafe = filterCommitSafeFiles(snapshot.staged);
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
		throw new NoCommittableChangesError(
			"No committable changed files found",
		);
	return {
		changedFiles: changed.included,
		stagedFiles: stagedSafe.included,
		untrackedFiles: snapshot.untracked,
		hasHead: snapshot.hasHead,
		hasDirtySubmodule: snapshot.hasDirtySubmodule,
	};
}

const MAX_UNTRACKED_PLANNING_BYTES = 128 * 1024;
const MAX_UNTRACKED_FILE_PLANNING_BYTES = 32 * 1024;

function buildUntrackedPlanningPreview(cwd: string, files: string[]) {
	const stat: string[] = [];
	const diff: string[] = [];
	let remaining = MAX_UNTRACKED_PLANNING_BYTES;
	for (const file of files) {
		const absolute = path.resolve(cwd, file);
		let size: number;
		try {
			const fileStat = fs.statSync(absolute);
			if (!fileStat.isFile()) continue;
			size = fileStat.size;
		} catch {
			continue;
		}
		stat.push(`${file} | ${size} bytes (new file)`);
		if (remaining <= 0) continue;
		const previewSize = Math.min(
			size,
			remaining,
			MAX_UNTRACKED_FILE_PLANNING_BYTES,
		);
		const buffer = Buffer.alloc(previewSize);
		const descriptor = fs.openSync(absolute, "r");
		try {
			fs.readSync(descriptor, buffer, 0, previewSize, 0);
		} finally {
			fs.closeSync(descriptor);
		}
		remaining -= previewSize;
		if (buffer.includes(0)) {
			diff.push(`new binary file ${file} (${size} bytes)`);
			continue;
		}
		const suffix = previewSize < size ? "\n[preview truncated]" : "";
		diff.push(`new file ${file}\n${buffer.toString("utf8")}${suffix}`);
	}
	return { stat: stat.join("\n"), diff: diff.join("\n\n") };
}

async function buildCommitPlanningContext(
	cwd: string,
	files: string[],
	untrackedFiles: string[],
	hasHead: boolean,
	activity?: CommitActivity,
	signal?: AbortSignal,
) {
	const untracked = new Set(untrackedFiles);
	const trackedFiles = hasHead
		? files.filter((file) => !untracked.has(file))
		: [];
	const newFiles = hasHead ? files.filter((file) => untracked.has(file)) : files;
	const trackedStat =
		hasHead && trackedFiles.length > 0
			? await gitOrThrowAsync(
					cwd,
					["diff", "--stat", "--no-ext-diff", "HEAD", "--", ...trackedFiles],
					activity,
					signal,
				)
			: "";
	const trackedDiff =
		hasHead && trackedFiles.length > 0
			? await gitOrThrowAsync(
					cwd,
					[
						"diff",
						"--no-color",
						"--no-ext-diff",
						"HEAD",
						"--",
						...trackedFiles,
					],
					activity,
					signal,
				)
			: "";
	const preview = buildUntrackedPlanningPreview(cwd, newFiles);
	return {
		diffStat: [trackedStat, preview.stat].filter(Boolean).join("\n"),
		diff: [trackedDiff, preview.diff].filter(Boolean).join("\n\n"),
	};
}

async function prepareCommitSelection(
	args: string,
	ctx: WorkflowContext,
	activity?: CommitActivity,
	initialSnapshot?: ChangedFilesSnapshot,
) {
	const explicitlyIgnored = await ignoredCommitArgumentPaths(
		ctx.cwd,
		args,
		ctx.signal,
	);
	if (explicitlyIgnored.length > 0) {
		throw new Error(
			`Requested commit paths are ignored:\n${explicitlyIgnored.map((file) => `- ${file}`).join("\n")}`,
		);
	}
	let { changedFiles, stagedFiles, untrackedFiles, hasHead } =
		await getCommitContext(ctx.cwd, activity, ctx.signal, initialSnapshot);
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
		const generatedPaths = applyUntrackedClassifications(
			ctx.cwd,
			[...plan.accepted, ...userDecisions],
			activity,
		);
		({ changedFiles, stagedFiles, untrackedFiles, hasHead } =
			await getCommitContext(ctx.cwd, activity, ctx.signal));
		selection = await chooseFilesToCommit(
			ctx,
			changedFiles,
			stagedFiles,
			postClassificationRequestedFiles(
				parsedArgs.files,
				changedFiles,
				generatedPaths,
			),
		);
		if (selection.cancelled || selection.files.length === 0) return null;
	}

	const unselectedStaged = stagedFiles.filter(
		(file) => !selection.files.includes(file),
	);
	if (unselectedStaged.length > 0) {
		throw new Error(
			`Selected commit paths would include other staged changes:\n${unselectedStaged.map((file) => `- ${file}`).join("\n")}`,
		);
	}

	const planning = await buildCommitPlanningContext(
		ctx.cwd,
		selection.files,
		untrackedFiles,
		hasHead,
		activity,
		ctx.signal,
	);
	return { parsedArgs, selection, stagedFiles, ...planning };
}

interface PlanProgressParams {
	action: PlanProgressInput["action"];
	planPath?: string;
	role?: PlanReviewerRole;
	concern?: string;
	outcome?: PlanReviewOutcome;
	strategy?: string;
}

function requirePlanProgressValue<T>(
	value: T | undefined,
	label: string,
): T {
	if (value === undefined) throw new Error(`${label} is required.`);
	return value;
}

function planProgressInput(params: PlanProgressParams): PlanProgressInput {
	switch (params.action) {
		case "draft":
			return {
				action: params.action,
				planPath: requirePlanProgressValue(params.planPath, "planPath"),
			};
		case "review": {
			const role = requirePlanProgressValue(params.role, "role");
			return {
				action: params.action,
				role,
				...(params.concern?.trim() ? { concern: params.concern.trim() } : {}),
				outcome: requirePlanProgressValue(params.outcome, "outcome"),
				...(params.strategy?.trim() ? { strategy: params.strategy.trim().slice(0, 120) } : {}),
			};
		}
		case "blocked":
			return {
				action: params.action,
				concern: requirePlanProgressValue(params.concern, "concern"),
			};
		case "ready":
			return { action: params.action };
	}
}

export const executeCommitCommand = createCommitCommandExecutor({
	runGitAsync,
	gitOrThrowAsync,
	listChangedFilesAsync,
	prepareCommitSelection,
	isNoCommittableChangesError: (error) =>
		error instanceof NoCommittableChangesError,
	generateCommitPlanWithLlm,
	formatCommitPlannerFailure,
	buildDeterministicCommitFallback,
	formatCommitPlanWarnings,
	unstageFilesAsync,
	stageFilesAsync,
	reviewStagedSecrets,
	confirmCommitMessage,
	commitCurrentChangesAsync,
	pushCurrentBranchAsync,
	createCommitActivity,
	emitCommitReport,
});

function renderLifecycleCall(label: string, theme: any, context: any): Text {
	if (context.executionStarted && context.state.transcriptStartedAt === undefined)
		context.state.transcriptStartedAt = Date.now();
	const timing = formatTranscriptTiming(context.state.transcriptStartedAt, undefined);
	return new Text(`${theme.fg("toolTitle", label)}${timing ? `\n  ${theme.fg("dim", timing)}` : ""}`, 0, 0);
}

function renderLifecycleResult(result: any, options: any, theme: any, context: any): Text {
	const timing = formatTranscriptTiming(
		context.state?.transcriptStartedAt,
		options.isPartial ? undefined : Date.now() - context.state?.transcriptStartedAt,
	);
	const text = result.content?.[0]?.text ?? "(no output)";
	return new Text(`${timing ? `${timing}\n` : ""}${text}`, 0, 0);
}

export default function (pi: ExtensionAPI) {
	const workflowRunner = async (cwd: string, args: string[]) => {
		const result = await pi.exec("git", args, { cwd, timeout: 120_000 });
		return { code: result.code, stdout: result.stdout, stderr: result.stderr };
	};
	let activePlanLifecycle: PlanLifecycleSnapshot | undefined;
	let activePlanningRoot: string | undefined;
	let pendingNextPlanCommand: string | undefined;
	let activeRawWorkflow: WorkflowWorktree | undefined;

	const persistPlanLifecycle = async (
		snapshot: PlanLifecycleSnapshot,
	): Promise<void> => {
		activePlanLifecycle = snapshot;
		await pi.appendEntry(PLAN_LIFECYCLE_ENTRY_TYPE, snapshot);
	};

	registerPlanLifecycleController(pi, {
		start: async (request) => {
			const snapshot = createPlanLifecycleSnapshot(randomUUID(), request);
			await persistPlanLifecycle(snapshot);
			activateTools(pi, ["plan_progress"]);
			return snapshot;
		},
		current: () => activePlanLifecycle,
	});

	const restorePlanLifecycle = (ctx: {
		sessionManager: { getBranch(): ReadonlyArray<unknown> };
	}): void => {
		activePlanLifecycle = undefined;
		for (const entry of ctx.sessionManager.getBranch()) {
			if (!entry || typeof entry !== "object") continue;
			const candidate = entry as {
				type?: unknown;
				customType?: unknown;
				data?: unknown;
			};
			if (
				candidate.type === "custom" &&
				candidate.customType === PLAN_LIFECYCLE_ENTRY_TYPE &&
				isPlanLifecycleSnapshot(candidate.data)
			)
				activePlanLifecycle = candidate.data;
		}
		if (activePlanLifecycle && activePlanLifecycle.stage !== "ready")
			activateTools(pi, ["plan_progress"]);
		else deactivateTools(pi, ["plan_progress"]);
	};

	pi.registerTool({
		name: "plan_progress",
		label: "Plan Progress",
		description:
			"Record bounded /plan-it lifecycle transitions for the active invocation and validate the canonical plan before readiness.",
		parameters: Type.Object(
			{
				action: StringEnum(
					[
						"draft",
						"review",
						"blocked",
						"ready",
					] as const,
				),
				planPath: Type.Optional(Type.String()),
				role: Type.Optional(
					StringEnum(["adversary", "proponent", "specialist", "subtractive"] as const),
				),
				concern: Type.Optional(Type.String({ maxLength: 120 })),
				outcome: Type.Optional(
					StringEnum(
						["supported", "no_finding", "failed", "covered"] as const,
					),
				),
				strategy: Type.Optional(Type.String()),
			},
			{ additionalProperties: false },
		),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!activePlanLifecycle)
				throw new Error("No active /plan-it lifecycle exists in this session.");
			const input = planProgressInput(params as PlanProgressParams);
			if (input.action === "ready") {
				const planPath = activePlanLifecycle.planPath;
				if (!planPath) throw new Error("The active lifecycle has no plan path.");
				const planningRoot = activePlanningRoot ?? await resolveWorkflowRepoRoot(ctx.cwd, workflowRunner);
				const validation = validatePlanFile(planningRoot, planPath);
				if (!validation.valid)
					throw new Error(
						`Plan contract validation failed: ${validation.errors.join(" ")}`,
					);
			}
			const next = transitionPlanLifecycle(activePlanLifecycle, input);
			await persistPlanLifecycle(next);
			if (next.stage === "ready") {
				deactivateTools(pi, ["plan_progress"]);
				if (ctx.mode === "tui")
					pendingNextPlanCommand = `/do-it ${next.planPath}`;
			}
			return {
				content: [
					{
						type: "text" as const,
						text: JSON.stringify({
							outcome: "recorded",
							planPath: next.planPath,
							stage: next.stage,
						}, null, 2),
					},
				],
				details: next,
			};
		},
	});

	onSessionStart(pi, import.meta.url, (_event, ctx) => restorePlanLifecycle(ctx));
	pi.on("session_tree", (_event, ctx) => restorePlanLifecycle(ctx));
	pi.on("session_shutdown", () => {
		pendingNextPlanCommand = undefined;
	});
	pi.on("message_end", (event, ctx) => {
		const command = pendingNextPlanCommand;
		if (
			!command ||
			ctx.mode !== "tui" ||
			event.message.role !== "assistant" ||
			event.message.stopReason !== "stop" ||
			!Array.isArray(event.message.content)
		)
			return;
		const content = stripTrailingNextCommandContent(event.message.content, command);
		if (content === event.message.content) return;
		return { message: { ...event.message, content } };
	});
	pi.on("agent_end", async (_event, ctx) => {
		const command = pendingNextPlanCommand;
		pendingNextPlanCommand = undefined;
		if (!command || ctx.mode !== "tui") return;
		try {
			await copyToClipboard(command);
			appendNextCommand(pi, ctx, command);
		} catch {
			ctx.ui.notify("Could not copy the next command to the clipboard.", "warning");
		}
	});

	pi.registerTool({
		name: "workflow_complete",
		label: "Complete Isolated Workflow",
		description:
			"Commit an active raw /do-it workflow, merge it with --no-ff into its clean primary branch, verify the merge, and remove only the owned worktree and branch.",
		parameters: Type.Object({}, { additionalProperties: false }),
		renderCall(_args, theme, context) {
			return renderLifecycleCall("workflow complete", theme, context);
		},
		renderResult: renderLifecycleResult,
		async execute() {
			try {
				const worktree = activeRawWorkflow ?? (() => {
					const ownership = readWorkflowOwnershipForWorktree(process.cwd());
					return ownership ? { ownership, resumed: true } : undefined;
				})();
				if (!worktree) throw new Error("No active raw /do-it workflow worktree exists.");
				const completed = await verifyAndCleanupWorkflowWorktree({ worktree, runner: workflowRunner });
				activeRawWorkflow = undefined;
				deactivateTools(pi, ["workflow_complete"]);
				return {
					content: [{
						type: "text" as const,
						text: `Workflow completed.\n${completed.branch} committed and merged into ${completed.primaryBranch} and cleaned up.`,
					}],
					details: completed,
				};
			} catch (error) {
				return formatToolError(error instanceof Error ? error.message : String(error));
			}
		},
	});

	pi.registerTool({
		name: "plan_archive",
		label: "Verify Completed Plan Closeout",
		description:
			"Verify completed plan closeout according to its Retention policy: either merge and clean up, or commit without merging and retain the owned branch and worktree.",
		parameters: Type.Object(
			{
				path: Type.String({
					description: "Repository-relative .specs/{slug}/plan.md path",
				}),
			},
			{ additionalProperties: false },
		),
		renderCall(_args, theme, context) {
			return renderLifecycleCall("plan archive", theme, context);
		},
		renderResult: renderLifecycleResult,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			try {
				const planPath = canonicalPlanPathFromInput(params.path);
				if (!planPath) throw new Error("Plan archive requires a canonical .specs/{slug}/plan.md path.");
				const slug = workflowSlugFromPlan(planPath);
				const ownership = readWorkflowOwnershipRecord(ctx.cwd, slug);
				if (!ownership || ownership.state !== "active")
					throw new Error("Plan closeout requires its active owned workflow worktree.");
				if (ownership.planPath && ownership.planPath !== planPath)
					throw new Error("Plan archive path does not match workflow ownership.");
				const archivedPlan = `.specs/archive/${slug}/plan.md`;
				const archivedPlanPath = path.join(ownership.worktree, archivedPlan);
				if (!fs.existsSync(archivedPlanPath))
					throw new Error("Completed plan was not archived in the owned workflow worktree.");
				const closeoutPolicy = parsePlanCloseoutPolicy(fs.readFileSync(archivedPlanPath, "utf8"));
				const verified = closeoutPolicy === "retain"
					? await verifyRetainedWorkflowWorktree({
						worktree: { ownership, resumed: true },
						planPath,
						runner: workflowRunner,
					})
					: await verifyAndCleanupWorkflowWorktree({
						worktree: { ownership, resumed: true },
						planPath,
						runner: workflowRunner,
					});
				const archived = {
					sourcePlan: planPath,
					archivedPlan,
					closeoutPolicy,
					...verified,
				};
				deactivateTools(pi, ["plan_archive"]);
				return {
					content: [
						{
							type: "text" as const,
							text: closeoutPolicy === "retain"
								? `Plan archived and committed on ${archived.branch}. The branch and worktree were retained without merging into ${archived.primaryBranch}.`
								: `Plan archived:\nfrom: ${archived.sourcePlan} to: ${archived.archivedPlan}\n${archived.branch} committed and merged into ${archived.primaryBranch} and cleaned up.`,
						},
					],
					details: archived,
				};
			} catch (error) {
				return formatToolError(
					error instanceof Error ? error.message : String(error),
				);
			}
		},
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
		description: "Smart git commit with submodule handling and flexible grouping",
		handler: async (args, ctx) => {
			try {
				if (ctx.mode !== "tui") {
					ctx.ui.notify("Running /commit...", "info");
					await executeCommitCommand(pi, args, ctx);
					return;
				}

				let commitPromise: Promise<void> | undefined;
				let cancelled = false;
				await ctx.ui.custom<void>((tui, theme, _keybindings, done) => {
					const loader = new BorderedLoader(tui, theme, "Running /commit...");
					loader.onAbort = () => {
						cancelled = true;
					};
					commitPromise = executeCommitCommand(pi, args, {
						...ctx,
						signal: loader.signal,
					});
					void commitPromise.then(
						() => done(undefined),
						() => done(undefined),
					);
					return loader;
				});

				if (!commitPromise) throw new Error("Commit loader did not start.");
				if (cancelled) {
					await commitPromise.then(
						() => undefined,
						() => undefined,
					);
					ctx.ui.notify("Commit cancelled", "info");
					return;
				}
				await commitPromise;
			} catch (err) {
				const message = formatCommitWorkflowFailure(err);
				handoffRecoverableLocalFailure(pi, {
					command: `/commit${args.trim() ? ` ${args.trim()}` : ""}`,
					failure: message,
					cwd: ctx.cwd,
					context: "The commit workflow preserved its current worktree and index state.",
				});
				ctx.ui.notify(message, "error");
			}
		},
	});

	pi.registerCommand("branch", {
		description:
			"Open a branched copy of this Pi session in a new terminal tab",
		handler: async (args, ctx) => {
			try {
				await executeBranchCommand(pi, args, ctx);
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
				await executeNewInstanceCommand(pi, args, ctx);
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
				await executeNewTerminalCommand(pi, args, ctx);
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
				await executeNewInstanceCommand(pi, "", ctx);
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
			"Crystallize an executable plan in the primary repository",
		handler: async (args, ctx) => {
			pendingNextPlanCommand = undefined;
			if (ctx.mode === "tui") {
				ctx.ui.setStatus?.("plan-it", "planning...");
			}
			try {
				appendSlashCommandAcknowledgement(pi, ctx, "plan-it", args);
				const planRequest = parsePlanItArgs(args);
				const lifecycle = createPlanLifecycleSnapshot(
					randomUUID(),
					planRequest.request,
				planRequest.mode,
			);
			let workspaceDirective = "";
			if (ctx.cwd) {
				try {
					activePlanningRoot = await resolveWorkflowRepoRoot(ctx.cwd, workflowRunner);
				} catch (error) {
					activePlanningRoot = path.resolve(ctx.cwd);
					ctx.ui?.notify?.(
						`Repository discovery did not complete; planning continues in ${activePlanningRoot}: ${error instanceof Error ? error.message : String(error)}`,
						"warning",
					);
				}
				workspaceDirective = `\n\nPRIMARY REPOSITORY (mandatory): ${activePlanningRoot}\nWrite the canonical plan directly under ${path.join(activePlanningRoot, ".specs", "<meaningful-slug>", "plan.md")}. Choose a concise kebab-case slug from the requested outcome and conversation context; never use an invocation ID or generic plan name. Do not create a planning worktree. Git state and repository-discovery failures never block planning; record relevant execution constraints in the plan for /do-it. The plan must require /do-it to perform implementation, validation, archive, and commit in its owned worktree. Merge and cleanup are the default; when the operator explicitly requests commit-and-retain closeout, record the exact Retention policy marker and require no merge.`;
			}
			await persistPlanLifecycle(lifecycle);
			activateTools(pi, ["plan_progress"]);
			const planPath = planRequest.request
				.match(/(\.specs\/[A-Za-z0-9._/-]+\/plan\.md)/)?.[1];
			noteWorkflowSubmission(
				args.trim() ? `/plan-it ${args.trim()}` : "/plan-it",
				"engineer",
			);
			startWorkflowEpisode({
				command: "plan-it",
				args: planRequest.request,
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
					const template = loadSkill("plan-it.md");
					const modeDirective =
						planRequest.mode === "quick"
							? "\n\nQUICK MODE (mandatory): This is a small-work-set plan. Skip all subject-matter adversarial reviews and the final overengineering, gold-plating, and churn review. After writing and mechanically checking the complete plan, call plan_progress ready directly. Do not call plan_progress review or delegate reviewers."
							: "";
					sendHiddenWorkflowPrompt(
						pi,
						buildSkillPrompt(template, planRequest.request) +
							workspaceDirective +
							modeDirective,
					);
				},
				);
			} finally {
				if (ctx.mode === "tui") ctx.ui.setStatus?.("plan-it", undefined);
			}
		},
	});

	pi.registerCommand("do-it", {
		description: "Execute work in one owned workflow worktree with proportional validation",
		handler: async (args, ctx) => {
			appendSlashCommandAcknowledgement(pi, ctx, "do-it", args);
			const requestedPlanPath = args.trim().replace(/^@/, "");
			const canonicalPlanPath = canonicalPlanPathFromInput(requestedPlanPath);
			const canonicalPlan = canonicalPlanPath !== undefined;
			let workspaceDirective = "";
			let ownedWorkspace = ctx.cwd;
			let ownedWorktree: WorkflowWorktree | undefined;
			let completedPlan = false;
			let planNeedsReconciliation = false;
			let closeoutPolicy: "merge" | "retain" = "merge";
			if (ctx.cwd) {
				try {
					const primaryRoot = await resolveWorkflowRepoRoot(ctx.cwd, workflowRunner);
					if (canonicalPlan) {
						const sourceValidation = validatePlanFile(primaryRoot, canonicalPlanPath, "execution-preflight");
						if (!sourceValidation.valid) {
							const diagnostics = sourceValidation.errors.join("\n");
							const message = `Plan preflight failed for ${canonicalPlanPath}:\n${diagnostics}`;
							pi.sendMessage({
								customType: PLAN_PREFLIGHT_MESSAGE_TYPE,
								content: message.length <= MAX_PLAN_PREFLIGHT_CHARS
									? message
									: `${message.slice(0, MAX_PLAN_PREFLIGHT_CHARS - 22)}\n... details truncated`,
								display: true,
							});
							return;
						}
						const sourcePlanContent = fs.readFileSync(path.resolve(primaryRoot, canonicalPlanPath), "utf8");
						closeoutPolicy = parsePlanCloseoutPolicy(sourcePlanContent);
						const routingState = parsePersistedPlanRoutingState(sourcePlanContent);
						completedPlan = routingState.complete;
						planNeedsReconciliation = routingState.needsReconciliation;
						if (completedPlan || planNeedsReconciliation) {
							const existing = readWorkflowOwnershipRecord(primaryRoot, workflowSlugFromPlan(canonicalPlanPath));
							if (!existing) {
								const recovery = planNeedsReconciliation
									? `Canonical plan ${canonicalPlanPath} has conflicting persisted state and requires reconciliation. Do not run implementation or validation. Explain the conflict clearly and inspect repository evidence before proposing recovery. No owned workflow worktree or branch exists to recover.`
									: `Canonical plan ${canonicalPlanPath} is already complete. Do not rerun implementation or validation. Report it as already complete; no owned workflow worktree or branch exists to recover. Do not recommend this plan as new work.`;
								ctx.ui?.notify?.(recovery, "info");
								sendHiddenWorkflowPrompt(pi, recovery);
								return;
							}
						}
					}
					const planSlug = workflowSlugFromPlan(canonicalPlanPath ?? requestedPlanPath);
					const slug = planSlug === "workflow" ? workflowSlugFromRequest(requestedPlanPath) : planSlug;
					const worktree = await ensureWorkflowWorktree({
						cwd: primaryRoot,
						workflow: "do-it",
						workflowId: `do-it:${slug}`,
						planPath: canonicalPlanPath,
						slug,
						runner: workflowRunner,
						allowDirtyPrimary: canonicalPlan,
					});
					if (canonicalPlan && !completedPlan && !worktree.resumed)
						await materializePlanInWorkflowWorktree({ worktree, planPath: canonicalPlanPath, runner: workflowRunner });
					ownedWorktree = worktree;
					ownedWorkspace = worktree.ownership.worktree;
					const retainCloseout = canonicalPlan && closeoutPolicy === "retain";
					const closeoutWork = retainCloseout
						? "archive the completed spec, stage and commit all nonignored in-scope artifacts, do not force-add ignored plan files, and do not merge the workflow branch into the primary branch"
						: canonicalPlan
							? "archive the completed spec, stage and commit all in-scope artifacts, and merge the workflow branch with --no-ff"
							: "stage and commit all in-scope artifacts, and merge the workflow branch with --no-ff";
					const verifierEffect = retainCloseout
						? "verifies the commit and non-merge state while retaining the owned branch, worktree, and ownership record"
						: "checks exact final state and cleans the owned branch/worktree";
					workspaceDirective = `\n\nWORKFLOW WORKTREE (mandatory): ${worktree.ownership.worktree}\nConfine implementation and validation to this worktree. When the requested work is complete, ${closeoutWork} yourself, then call the workflow closeout verifier; the verifier ${verifierEffect}. Preserve the worktree for recovery on any dirty, unmerged, or conflict state.${completedPlan || planNeedsReconciliation ? `\n\nRECOVERY ONLY: The canonical plan ${canonicalPlanPath} is complete or has conflicting persisted state. Do not rerun implementation or validation. Inspect the active/archive paths, branch, primary HEAD, and ownership record; finish only recoverable closeout work, then call the closeout verifier.` : ""}`;
				} catch (error) {
					ctx.ui?.notify?.(error instanceof Error ? error.message : String(error), "error");
					return;
				}
			}
			if (canonicalPlan) {
				if (!completedPlan && !planNeedsReconciliation) {
					const validation = validatePlanFile(ownedWorkspace, canonicalPlanPath, "execution-preflight");
					if (!validation.valid) throw new Error(`Materialized plan failed validation: ${validation.errors.join(" ")}`);
				}
				activateTools(pi, ["plan_archive"]);
			} else if (ownedWorktree) {
				activeRawWorkflow = ownedWorktree;
				activateTools(pi, ["workflow_complete"]);
			}
			const template = loadSkill("do-it.md");
			const prompt = buildSkillPrompt(template, canonicalPlan ? canonicalPlanPath : args, {
				replaceArguments: true,
			});
			sendHiddenWorkflowPrompt(pi, prompt + workspaceDirective);
		},
	});

	pi.registerCommand("clear", {
		description: "Alias to /new",
		handler: async (_args, ctx) => {
			ctx.ui.notify("Clearing session...", "info");
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

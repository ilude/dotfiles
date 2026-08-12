import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	inspectGitStateAsync,
	preflightGitStateAsync,
} from "../commit/plan";
import {
	changedFilesFromStatus,
	type ChangedFilesSnapshot,
	PORCELAIN_V2_STATUS_ARGS,
	uniqueGitPaths,
} from "../commit/status";
import { parseDirectSubmodulePaths } from "../commit/submodule";

export interface SlashCommitGitResult {
	code: number;
	stdout: string;
	stderr: string;
}

export interface SlashCommitActivity {
	setPhase(message?: string): void;
	logCommand(command: string, result?: SlashCommitGitResult): void;
	logInfo(message: string): void;
	finish(): void;
}

interface SlashCommitUi {
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

interface SlashCommitSessionManager {
	getLeafId?(): string | null | undefined;
	createBranchedSession?(leafId: string): string | null | undefined;
}

export interface SlashCommitContext {
	cwd: string;
	ui: SlashCommitUi;
	model: ExtensionCommandContext["model"];
	modelRegistry: ExtensionCommandContext["modelRegistry"];
	getSystemPrompt?: () => string | undefined;
	signal: AbortSignal | undefined;
	sessionManager?: SlashCommitSessionManager;
}

export interface SlashCommitPlanGroup {
	files: string[];
	subject: string;
	body?: string;
}

export interface SlashCommitPlan {
	groups: SlashCommitPlanGroup[];
	warnings?: string[];
}

export interface PreparedCommitSelection {
	parsedArgs: {
		push: boolean;
		files: string[];
		hint: string;
	};
	selection: {
		files: string[];
		stageAll: boolean;
		cancelled: boolean;
	};
	stagedFiles: string[];
	diffStat: string;
	diff: string;
}

export interface CommitOrchestrationDependencies {
	runGitAsync(
		cwd: string,
		args: string[],
		activity?: SlashCommitActivity,
		signal?: AbortSignal,
		input?: string,
	): Promise<SlashCommitGitResult>;
	gitOrThrowAsync(
		cwd: string,
		args: string[],
		activity?: SlashCommitActivity,
		signal?: AbortSignal,
	): Promise<string>;
	listChangedFilesAsync(
		cwd: string,
		activity?: SlashCommitActivity,
		signal?: AbortSignal,
		statusOutput?: string,
	): Promise<ChangedFilesSnapshot>;
	prepareCommitSelection(
		args: string,
		ctx: SlashCommitContext,
		activity?: SlashCommitActivity,
		initialSnapshot?: ChangedFilesSnapshot,
	): Promise<PreparedCommitSelection | null>;
	isNoCommittableChangesError(error: unknown): boolean;
	generateCommitPlanWithLlm(
		ctx: SlashCommitContext,
		context: {
			files: string[];
			diffStat: string;
			diff: string;
			hint: string;
		},
	): Promise<SlashCommitPlan>;
	formatCommitPlannerFailure(error: unknown): string;
	buildDeterministicCommitFallback(context: {
		files: string[];
		diffStat: string;
		diff: string;
		hint: string;
	}): { plan: SlashCommitPlan };
	formatCommitPlanWarnings(warnings: string[] | undefined): string[];
	unstageFilesAsync(
		cwd: string,
		files: string[],
		activity?: SlashCommitActivity,
		signal?: AbortSignal,
	): Promise<void>;
	stageFilesAsync(
		cwd: string,
		files: string[],
		activity?: SlashCommitActivity,
		signal?: AbortSignal,
	): Promise<void>;
	confirmCommitMessage(commitMessage: {
		subject: string;
		body?: string;
	}): Promise<{ subject: string; body?: string } | null>;
	commitCurrentChangesAsync(
		cwd: string,
		commitMessage: { subject: string; body?: string },
		activity?: SlashCommitActivity,
		signal?: AbortSignal,
	): Promise<string>;
	pushCurrentBranchAsync(
		cwd: string,
		activity?: SlashCommitActivity,
		signal?: AbortSignal,
	): Promise<void>;
	createCommitActivity(
		pi: ExtensionAPI,
		ctx: SlashCommitContext,
		commandText: string,
	): SlashCommitActivity;
	emitCommitReport(
		pi: ExtensionAPI,
		ctx: SlashCommitContext,
		lines: string[],
	): void;
}

interface CommitCommandOptions {
	args: string;
	noSubmodules: boolean;
	push: boolean;
}

function parseCommitCommandOptions(rawArgs: string): CommitCommandOptions {
	const tokens = rawArgs.trim().split(/\s+/).filter(Boolean);
	return {
		args: tokens.filter((token) => token !== "--no-submodules").join(" "),
		noSubmodules: tokens.includes("--no-submodules"),
		push: tokens.includes("push"),
	};
}

interface DirectSubmodule {
	cwd: string;
	path: string;
}

export interface ExecuteCommitCommandOptions {
	commandText?: string;
	skipSubmoduleDiscovery?: boolean;
}

export function createCommitCommandExecutor(
	dependencies: CommitOrchestrationDependencies,
) {
	async function listDirtyDirectSubmodules(
		cwd: string,
		activity: SlashCommitActivity,
		signal?: AbortSignal,
	): Promise<DirectSubmodule[]> {
		const root = await dependencies.gitOrThrowAsync(
			cwd,
			["rev-parse", "--show-toplevel"],
			activity,
			signal,
		);
		const config = await dependencies.runGitAsync(
			root,
			[
				"config",
				"-z",
				"--file",
				".gitmodules",
				"--get-regexp",
				"^submodule\\..*\\.path$",
			],
			activity,
			signal,
		);
		if (config.code === 1 && !config.stdout && !config.stderr) return [];
		if (config.code !== 0) {
			throw new Error(
				(config.stderr || config.stdout).trim() ||
					"Failed to read direct submodule paths",
			);
		}

		const dirty: DirectSubmodule[] = [];
		for (const submodulePath of parseDirectSubmodulePaths(config.stdout)) {
			const submoduleCwd = path.resolve(root, submodulePath);
			const relative = path.relative(root, submoduleCwd);
			if (
				!relative ||
				relative === ".." ||
				relative.startsWith(`..${path.sep}`) ||
				path.isAbsolute(relative)
			) {
				throw new Error(
					`Invalid submodule path outside repository: ${submodulePath}`,
				);
			}
			if (!fs.existsSync(submoduleCwd)) continue;
			const worktree = await dependencies.runGitAsync(
				submoduleCwd,
				["rev-parse", "--is-inside-work-tree"],
				undefined,
				signal,
			);
			if (worktree.code !== 0 || worktree.stdout.trim() !== "true") continue;
			const status = await dependencies.gitOrThrowAsync(
				submoduleCwd,
				["status", "--porcelain=v1", "-z", "--untracked-files=all"],
				activity,
				signal,
			);
			if (status) dirty.push({ cwd: submoduleCwd, path: submodulePath });
		}
		return dirty;
	}

	async function prepareDirtySubmodule(
		submodule: DirectSubmodule,
		activity: SlashCommitActivity,
		signal?: AbortSignal,
	): Promise<boolean> {
		const preflight = await preflightGitStateAsync(
			submodule.cwd,
			(cwd, gitArgs, runSignal) =>
				dependencies.runGitAsync(cwd, gitArgs, activity, runSignal),
			signal,
		);
		if (!preflight.ok) {
			throw new Error(
				`Submodule ${submodule.path} preflight failed:\n${preflight.blocked.join("\n")}`,
			);
		}
		const upstream = await dependencies.runGitAsync(
			submodule.cwd,
			["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
			activity,
			signal,
		);
		if (upstream.code !== 0 || !upstream.stdout.trim()) {
			throw new Error(
				`Submodule ${submodule.path} must have an upstream branch before /commit can update it`,
			);
		}
		const pull = await dependencies.runGitAsync(
			submodule.cwd,
			["pull", "--ff-only", "--no-rebase", "--no-recurse-submodules"],
			activity,
			signal,
		);
		if (pull.code !== 0) {
			throw new Error(
				`Submodule ${submodule.path} pull failed: ${(pull.stderr || pull.stdout).trim() || "git pull failed"}`,
			);
		}
		const status = await dependencies.gitOrThrowAsync(
			submodule.cwd,
			["status", "--porcelain=v1", "-z", "--untracked-files=all"],
			activity,
			signal,
		);
		return Boolean(status);
	}

	async function commitDirtyDirectSubmodules(
		pi: ExtensionAPI,
		ctx: SlashCommitContext,
		activity: SlashCommitActivity,
		push: boolean,
	) {
		const submodules = await listDirtyDirectSubmodules(
			ctx.cwd,
			activity,
			ctx.signal,
		);
		for (const submodule of submodules) {
			activity.setPhase(`preparing submodule ${submodule.path}`);
			activity.logInfo(`Preparing dirty submodule: ${submodule.path}`);
			if (!(await prepareDirtySubmodule(submodule, activity, ctx.signal))) {
				activity.logInfo(
					`Submodule ${submodule.path} became clean after fast-forward pull`,
				);
				continue;
			}
			await executeCommitCommand(
				pi,
				push ? "push --no-submodules" : "--no-submodules",
				{ ...ctx, cwd: submodule.cwd },
				{
					commandText: `/commit (${submodule.path})`,
					skipSubmoduleDiscovery: true,
				},
			);
			const remaining = await dependencies.gitOrThrowAsync(
				submodule.cwd,
				["status", "--porcelain=v1", "-z", "--untracked-files=all"],
				activity,
				ctx.signal,
			);
			if (remaining) {
				throw new Error(
					`Submodule ${submodule.path} still has uncommitted changes after its commit workflow`,
				);
			}
		}
		if (submodules.length > 0) activity.setPhase("preparing");
	}

	async function executeCommitCommand(
		pi: ExtensionAPI,
		args: string,
		ctx: SlashCommitContext,
		options: ExecuteCommitCommandOptions = {},
	): Promise<void> {
		const commandOptions = parseCommitCommandOptions(args);
		const commandText =
			options.commandText ?? `/commit${args.trim() ? ` ${args.trim()}` : ""}`;
		const activity = dependencies.createCommitActivity(pi, ctx, commandText);
		ctx.ui.notify(`Starting ${commandText}...`, "info");
		activity.setPhase("preparing");
		try {
			if (ctx.signal?.aborted) throw new Error("Operation cancelled");
			const inspection = await inspectGitStateAsync(
				ctx.cwd,
				(cwd, gitArgs, signal) =>
					dependencies.runGitAsync(cwd, gitArgs, activity, signal),
				ctx.signal,
			);
			if (!inspection.preflight.ok) {
				throw new Error(
					`Git state preflight failed:\n${inspection.preflight.blocked.join("\n")}`,
				);
			}
			let initialSnapshot = changedFilesFromStatus(inspection.statusOutput);
			if (
				initialSnapshot.all.length === 0 &&
				!initialSnapshot.hasDirtySubmodule
			) {
				activity.finish();
				ctx.ui.notify("Working tree is clean", "info");
				return;
			}
			if (
				!options.skipSubmoduleDiscovery &&
				!commandOptions.noSubmodules &&
				initialSnapshot.hasDirtySubmodule
			) {
				await commitDirtyDirectSubmodules(
					pi,
					ctx,
					activity,
					commandOptions.push,
				);
				initialSnapshot = await dependencies.listChangedFilesAsync(
					ctx.cwd,
					activity,
					ctx.signal,
				);
			}
			let prepared: PreparedCommitSelection | null;
			try {
				prepared = await dependencies.prepareCommitSelection(
					commandOptions.args,
					ctx,
					activity,
					initialSnapshot,
				);
			} catch (error) {
				if (!dependencies.isNoCommittableChangesError(error)) throw error;
				activity.finish();
				ctx.ui.notify(
					"No committable parent-repository changes found; dirty submodule worktrees were left untouched.",
					"info",
				);
				return;
			}
			if (!prepared) {
				activity.finish();
				ctx.ui.notify("Commit cancelled", "warning");
				return;
			}
			activity.setPhase("planning commits");

			let plan: SlashCommitPlan;
			try {
				plan = await dependencies.generateCommitPlanWithLlm(ctx, {
					files: prepared.selection.files,
					diffStat: prepared.diffStat,
					diff: prepared.diff,
					hint: prepared.parsedArgs.hint,
				});
			} catch (error) {
				activity.logInfo(dependencies.formatCommitPlannerFailure(error));
				plan = dependencies.buildDeterministicCommitFallback({
					files: prepared.selection.files,
					diffStat: prepared.diffStat,
					diff: prepared.diff,
					hint: prepared.parsedArgs.hint,
				}).plan;
			}

			for (const warning of dependencies.formatCommitPlanWarnings(
				plan.warnings,
			)) {
				activity.logInfo(warning);
			}
			const commitSummaries: string[] = [];
			const firstGroupFiles = new Set(plan.groups[0]?.files ?? []);
			const stagedOutsideFirstGroup = prepared.stagedFiles.filter(
				(file) => !firstGroupFiles.has(file),
			);
			if (stagedOutsideFirstGroup.length > 0) {
				await dependencies.unstageFilesAsync(
					ctx.cwd,
					stagedOutsideFirstGroup,
					activity,
					ctx.signal,
				);
			}
			for (const [index, group] of plan.groups.entries()) {
				activity.setPhase(
					`creating commit ${index + 1}/${plan.groups.length}`,
				);
				await dependencies.stageFilesAsync(
					ctx.cwd,
					group.files,
					activity,
					ctx.signal,
				);
				try {
					const stagedStatus = await dependencies.gitOrThrowAsync(
						ctx.cwd,
						[...PORCELAIN_V2_STATUS_ARGS],
						activity,
						ctx.signal,
					);
					const stagedFiles = changedFilesFromStatus(stagedStatus).staged;
					const expectedFiles = uniqueGitPaths(group.files);
					if (JSON.stringify(stagedFiles) !== JSON.stringify(expectedFiles)) {
						const missing = expectedFiles.filter(
							(file) => !stagedFiles.includes(file),
						);
						const unexpected = stagedFiles.filter(
							(file) => !expectedFiles.includes(file),
						);
						const summarize = (label: string, files: string[]) =>
							files.length === 0
								? undefined
								: `${label} (${files.length}): ${files.slice(0, 5).join(", ")}${files.length > 5 ? ", ..." : ""}`;
						throw new Error(
							[
								`Staging verification failed for commit ${index + 1}/${plan.groups.length}.`,
								summarize("Missing", missing),
								summarize("Unexpected", unexpected),
							]
								.filter(Boolean)
								.join(" "),
						);
					}
					const commitMessage = await dependencies.confirmCommitMessage({
						subject: group.subject.trim(),
						body: group.body?.trim() || undefined,
					});
					if (!commitMessage) {
						await dependencies.unstageFilesAsync(
							ctx.cwd,
							group.files,
							activity,
							ctx.signal,
						);
						activity.finish();
						ctx.ui.notify("Commit cancelled", "warning");
						return;
					}
					const hash = await dependencies.commitCurrentChangesAsync(
						ctx.cwd,
						commitMessage,
						activity,
						ctx.signal,
					);
					commitSummaries.push(`${hash} ${commitMessage.subject}`);
				} catch (groupError) {
					await dependencies.unstageFilesAsync(
						ctx.cwd,
						group.files,
						activity,
						ctx.signal,
					);
					throw groupError;
				}
			}
			if (prepared.parsedArgs.push) {
				activity.setPhase("pushing");
				await dependencies.pushCurrentBranchAsync(
					ctx.cwd,
					activity,
					ctx.signal,
				);
				activity.logInfo("Pushed to remote");
			}
			activity.finish();
			dependencies.emitCommitReport(pi, ctx, commitSummaries);
		} catch (error) {
			const rawMessage = error instanceof Error ? error.message : String(error);
			const message =
				rawMessage.length <= 2000
					? rawMessage
					: `${rawMessage.slice(0, 1978)}\n... details truncated`;
			activity.logInfo(`Commit failed: ${message}`);
			activity.finish();
			throw new Error(message);
		}
	}

	return executeCommitCommand;
}

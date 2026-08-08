import { randomUUID } from "node:crypto";
import { type Static, Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createCommitAsync } from "../lib/commit/create";
import type { GitAsyncRunner } from "../lib/commit/git";
import { validateCommitMessage } from "../lib/commit/message";
import { buildCommitPlan } from "../lib/commit/plan";
import { pushCommit } from "../lib/commit/push";
import { stagePathsAsync } from "../lib/commit/stage";
import { withTimingSpan } from "../lib/observability";
import { activateTools, deactivateTools } from "../lib/tool-activation";

const CommitPlanParams = Type.Object({
	cwd: Type.Optional(
		Type.String({ description: "Repository directory; defaults to session cwd." }),
	),
	paths: Type.Optional(
		Type.Array(Type.String(), {
			description: "Exact paths to include. Omit to plan every committable path.",
		}),
	),
});
const CommitValidateMessageParams = Type.Object({ message: Type.String() });
const CommitStageParams = Type.Object({
	planId: Type.String({
		description: "Opaque handle returned by commit_plan.",
	}),
});
const CommitCreateParams = Type.Object({
	stageId: Type.String({
		description: "Opaque handle returned by commit_stage.",
	}),
	message: Type.String(),
});
const CommitPushParams = Type.Object({
	cwd: Type.Optional(
		Type.String({ description: "Repository directory; defaults to session cwd." }),
	),
	expectedHead: Type.String({
		description: "Commit hash returned by commit_create. Push fails if HEAD changed.",
	}),
});
type CommitPlanParams = Static<typeof CommitPlanParams>;
type CommitValidateMessageParams = Static<typeof CommitValidateMessageParams>;
type CommitStageParams = Static<typeof CommitStageParams>;
type CommitCreateParams = Static<typeof CommitCreateParams>;
type CommitPushParams = Static<typeof CommitPushParams>;

function toolResult(text: string, details: unknown) {
	return { content: [{ type: "text" as const, text }], details };
}

function modelJson(value: unknown): string {
	const text = JSON.stringify(value, null, 2);
	if (Buffer.byteLength(text, "utf8") > 48 * 1024) {
		throw new Error(
			"Commit plan exceeds the model-visible output limit; rerun commit_plan with exact paths.",
		);
	}
	return text;
}

function gitRunner(pi: ExtensionAPI): GitAsyncRunner {
	return async (cwd, args, signal) => {
		const result = await pi.exec("git", args, {
			cwd,
			signal,
			timeout: 120_000,
		});
		return {
			code: result.code,
			stdout: result.stdout,
			stderr: result.stderr,
		};
	};
}

export const COMMIT_TOOL_NAMES = [
	"commit_plan",
	"commit_validate_message",
	"commit_stage",
	"commit_create",
	"commit_push",
] as const;
const COMMIT_INTENT_PATTERN =
	/\b(?:commit|commits|committed|committing|stage|staged|staging|push|pushed|pushing)\b/i;

export function registerCommitTools(pi: ExtensionAPI) {
	const plans = new Map<string, ReturnType<typeof buildCommitPlan>>();
	const stages = new Map<
		string,
		{
			repoRoot: string;
			expectedStagedPaths: string[];
			createConfirmationToken: string;
		}
	>();
	pi.on("session_start", () => {
		plans.clear();
		stages.clear();
		deactivateTools(pi, COMMIT_TOOL_NAMES);
	});
	pi.on("before_agent_start", (event) => {
		if (!COMMIT_INTENT_PATTERN.test(event.prompt)) return undefined;
		activateTools(pi, COMMIT_TOOL_NAMES);
		return undefined;
	});

	pi.registerTool({
		name: "commit_plan",
		label: "Commit Plan",
		description:
			"Inspect Git state and return a model-visible exact-path commit plan without mutation.",
		promptSnippet: "Inspect Git status and return a safe commit plan without mutation.",
		promptGuidelines: [
			"Run commit_plan before commit_stage and use exact paths when only part of a worktree belongs in the commit.",
		],
		parameters: CommitPlanParams,
		execute: async (
			_toolCallId,
			params: CommitPlanParams,
			_signal,
			_onUpdate,
			ctx: { cwd?: string },
		) => {
			const plan = buildCommitPlan(
				params.cwd || ctx.cwd || process.cwd(),
				params.paths,
			);
			const planId = randomUUID();
			plans.set(planId, plan);
			const selected = new Set(plan.selectedPaths);
			const visiblePlan = {
				planId,
				preflight: plan.preflight,
				entries: plan.entries.filter((entry) => selected.has(entry.path)),
				selectedPaths: plan.selectedPaths,
				safeStagePaths: plan.safeStagePaths,
				expectedStagedPaths: plan.expectedStagedPaths,
			};
			return toolResult(modelJson(visiblePlan), { planId, ...plan });
		},
	});

	pi.registerTool({
		name: "commit_validate_message",
		label: "Validate Commit Message",
		description: "Validate a conventional commit subject without mutating git state.",
		promptSnippet: "Optionally validate a conventional commit subject before commit_create.",
		parameters: CommitValidateMessageParams,
		execute: async (_toolCallId, params: CommitValidateMessageParams) => {
			const result = validateCommitMessage(params.message);
			return toolResult(
				result.valid
					? "Commit message is valid."
					: `Invalid commit message: ${result.error}`,
				result,
			);
		},
	});

	pi.registerTool({
		name: "commit_stage",
		label: "Commit Stage",
		description:
			"Stage exact safe paths bound to a commit_plan token using abort-aware Git execution. Never force-adds ignored paths.",
		promptSnippet: "Run commit_plan first, then pass its planId to commit_stage.",
		parameters: CommitStageParams,
		executionMode: "sequential",
		execute: async (
			_toolCallId,
			params: CommitStageParams,
			signal,
			_onUpdate,
			_ctx: { cwd?: string },
		) =>
			withTimingSpan({ name: "commit.stage", category: "tool" }, async () => {
				const plan = plans.get(params.planId);
				if (!plan) throw new Error("Unknown or expired commit planId.");
				const result = await stagePathsAsync(
					plan.repoRoot,
					plan.safeStagePaths,
					plan.stageConfirmationToken,
					gitRunner(pi),
					signal,
				);
				plans.delete(params.planId);
				const stageId = randomUUID();
				stages.set(stageId, {
					repoRoot: plan.repoRoot,
					expectedStagedPaths: result.expectedStagedPaths,
					createConfirmationToken: result.createConfirmationToken,
				});
				const visibleResult = {
					stageId,
					staged: result.staged,
					expectedStagedPaths: result.expectedStagedPaths,
				};
				return toolResult(modelJson(visibleResult), {
					stageId,
					...result,
				});
			}),
	});

	pi.registerTool({
		name: "commit_create",
		label: "Commit Create",
		description:
			"Create a commit after token, message, whitespace, and staged-set validation using abort-aware Git execution. Does not push.",
		promptSnippet:
			"Create a local commit by passing the stageId returned by commit_stage. Does not push.",
		parameters: CommitCreateParams,
		executionMode: "sequential",
		execute: async (
			_toolCallId,
			params: CommitCreateParams,
			signal,
			_onUpdate,
			_ctx: { cwd?: string },
		) =>
			withTimingSpan({ name: "commit.create", category: "tool" }, async () => {
				const stage = stages.get(params.stageId);
				if (!stage) throw new Error("Unknown or expired commit stageId.");
				const result = await createCommitAsync(
					stage.repoRoot,
					params.message,
					stage.expectedStagedPaths,
					stage.createConfirmationToken,
					gitRunner(pi),
					signal,
				);
				stages.delete(params.stageId);
				return toolResult(modelJson(result), result);
			}),
	});

	pi.registerTool({
		name: "commit_push",
		label: "Commit Push",
		description:
			"Push the current branch after verifying the expected HEAD and a non-diverged upstream. Never force-pushes.",
		promptSnippet: "Push a commit only when the user explicitly requests it.",
		promptGuidelines: [
			"Use commit_push only when the user explicitly requests a push, and pass the hash returned by commit_create as expectedHead.",
		],
		parameters: CommitPushParams,
		executionMode: "sequential",
		execute: async (
			_toolCallId,
			params: CommitPushParams,
			signal,
			_onUpdate,
			ctx: { cwd?: string },
		) =>
			withTimingSpan({ name: "commit.push", category: "tool" }, async () => {
				const result = await pushCommit(
					params.cwd || ctx.cwd || process.cwd(),
					params.expectedHead,
					gitRunner(pi),
					signal,
				);
				return toolResult(modelJson(result), result);
			}),
	});
}

export default function (pi: ExtensionAPI) {
	registerCommitTools(pi);
}

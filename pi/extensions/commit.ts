import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildCommitPlan } from "../lib/commit/plan";
import { validateCommitMessage } from "../lib/commit/message";
import { stagePaths } from "../lib/commit/stage";
import { createCommit } from "../lib/commit/create";
import { formatToolError } from "../lib/extension-utils";
import { withTimingSpan } from "../lib/observability";

const CommitPlanParams = Type.Object({ cwd: Type.Optional(Type.String({ description: "Repository directory; defaults to session cwd." })) });
const CommitValidateMessageParams = Type.Object({ message: Type.String() });
const CommitStageParams = Type.Object({
	cwd: Type.Optional(Type.String({ description: "Repository directory; defaults to session cwd." })),
	paths: Type.Array(Type.String(), { description: "Exact paths to stage; passed to git add after --." }),
	confirmationToken: Type.String({ description: "Token from commit_plan.stageConfirmationToken for this exact path set." }),
});
const CommitCreateParams = Type.Object({
	cwd: Type.Optional(Type.String({ description: "Repository directory; defaults to session cwd." })),
	message: Type.String(),
	expectedStagedPaths: Type.Array(Type.String(), { description: "Exact staged path set expected at commit time." }),
	confirmationToken: Type.String({ description: "Token from commit_plan.createConfirmationToken for this exact staged path set." }),
});
type CommitPlanParams = Static<typeof CommitPlanParams>;
type CommitValidateMessageParams = Static<typeof CommitValidateMessageParams>;
type CommitStageParams = Static<typeof CommitStageParams>;
type CommitCreateParams = Static<typeof CommitCreateParams>;

function toolResult(text: string, details: unknown) {
	return { content: [{ type: "text" as const, text }], details };
}

export function registerCommitTools(pi: ExtensionAPI) {
	pi.registerTool({
		name: "commit_plan",
		label: "Commit Plan",
		description: "Non-mutating Pi-native git commit planning. Does not stage, commit, or push.",
		promptSnippet: "Inspect git status and return a safe commit plan without mutation.",
		parameters: CommitPlanParams,
		execute: async (_toolCallId, params: CommitPlanParams, _signal, _onUpdate, ctx: { cwd?: string }) => {
			const plan = buildCommitPlan(params.cwd || ctx.cwd || process.cwd());
			return toolResult(`Prepared commit plan with ${plan.entries.length} path(s).`, plan);
		},
	});

	pi.registerTool({
		name: "commit_validate_message",
		label: "Validate Commit Message",
		description: "Validate a conventional commit subject without mutating git state.",
		promptSnippet: "Validate conventional commit messages before commit_create.",
		parameters: CommitValidateMessageParams,
		execute: async (_toolCallId, params: CommitValidateMessageParams) => {
			const result = validateCommitMessage(params.message);
			return toolResult(result.valid ? "Commit message is valid." : `Invalid commit message: ${result.error}`, result);
		},
	});

	pi.registerTool({
		name: "commit_stage",
		label: "Commit Stage",
		description: "Stage exact safe paths bound to a commit_plan token. Never force-adds ignored paths.",
		promptSnippet: "Run commit_plan first, then stage its exact safe path set with the matching token.",
		parameters: CommitStageParams,
		execute: async (_toolCallId, params: CommitStageParams, _signal, _onUpdate, ctx: { cwd?: string }) => {
			return withTimingSpan({ name: "commit.stage", category: "tool" }, async () => {
				try {
					const result = stagePaths(params.cwd || ctx.cwd || process.cwd(), params.paths, params.confirmationToken);
					return toolResult(`Staged ${result.staged.length} path(s).`, result);
				} catch (err) {
					return formatToolError(err instanceof Error ? err.message : String(err));
				}
			});
		},
	});

	pi.registerTool({
		name: "commit_create",
		label: "Commit Create",
		description: "Create a commit after token validation, message validation, and final staged-set revalidation. Does not push.",
		promptSnippet: "Create a local commit after validating the message and exact staged path set. Does not push.",
		parameters: CommitCreateParams,
		execute: async (_toolCallId, params: CommitCreateParams, _signal, _onUpdate, ctx: { cwd?: string }) => {
			return withTimingSpan({ name: "commit.create", category: "tool" }, async () => {
				try {
					const result = createCommit(params.cwd || ctx.cwd || process.cwd(), params.message, params.expectedStagedPaths, params.confirmationToken);
					return toolResult(`Committed ${result.hash}; pushed=false.`, result);
				} catch (err) {
					return formatToolError(err instanceof Error ? err.message : String(err));
				}
			});
		},
	});
}

export default function (pi: ExtensionAPI) {
	registerCommitTools(pi);
}

import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { buildCommitPlan } from "../lib/commit/plan";
import { validateCommitMessage } from "../lib/commit/message";
import { stagePaths } from "../lib/commit/stage";
import { createCommit } from "../lib/commit/create";

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
	expectedStagedPaths: Type.Array(Type.String(), { description: "Exact staged path set confirmed by the user." }),
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
		description: "Stage exact safe paths after user confirmation. Never force-adds ignored paths.",
		promptSnippet: "Use only after showing commit_plan output and receiving explicit approval.",
		parameters: CommitStageParams,
		execute: async (_toolCallId, params: CommitStageParams, _signal, _onUpdate, ctx: { cwd?: string }) => {
			const result = stagePaths(params.cwd || ctx.cwd || process.cwd(), params.paths, params.confirmationToken);
			return toolResult(`Staged ${result.staged.length} path(s).`, result);
		},
	});

	pi.registerTool({
		name: "commit_create",
		label: "Commit Create",
		description: "Create a commit after token validation, message validation, and final staged-set revalidation. Does not push.",
		promptSnippet: "Use only after commit_stage/user staging and explicit approval of the exact staged set and message.",
		parameters: CommitCreateParams,
		execute: async (_toolCallId, params: CommitCreateParams, _signal, _onUpdate, ctx: { cwd?: string }) => {
			const result = createCommit(params.cwd || ctx.cwd || process.cwd(), params.message, params.expectedStagedPaths, params.confirmationToken);
			return toolResult(`Committed ${result.hash}; pushed=false.`, result);
		},
	});
}

export default function (pi: ExtensionAPI) {
	registerCommitTools(pi);
}

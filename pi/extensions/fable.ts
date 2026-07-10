import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const FABLE_MODEL_ID = "amazon-bedrock/us.anthropic.claude-fable-5";
const FABLE_THINKING_LEVEL = "high";
const SUBAGENT_MODEL_ID = "openai-codex/gpt-5.6-sol";

function parseModelId(
	modelId: string,
): { provider: string; id: string } | null {
	const slash = modelId.indexOf("/");
	if (slash <= 0 || slash === modelId.length - 1) return null;
	return { provider: modelId.slice(0, slash), id: modelId.slice(slash + 1) };
}

function findModel(
	models: readonly Model<Api>[],
	modelId: string,
): Model<Api> | undefined {
	const parsed = parseModelId(modelId);
	if (!parsed) return undefined;
	return models.find(
		(model) => model.provider === parsed.provider && model.id === parsed.id,
	);
}

export function buildFablePrompt(task: string): string {
	return [
		"Act as the orchestration controller for this request.",
		"",
		"Task:",
		task,
		"",
		"Operating rules:",
		"- Keep this thread focused on planning, dispatch, coordination, and synthesis.",
		"- Delegate implementation, validation, code review, debugging, and research to subagents unless the work is trivial.",
		`- For substantial delegated work, call subagent with model: "${SUBAGENT_MODEL_ID}".`,
		"- Keep each subagent task bounded with a clear deliverable.",
		"- Prefer 2-4 parallel subagents unless the task clearly benefits from more.",
		"- Ask subagents for concise outputs and cite file paths or commands they verified.",
		"- Synthesize subagent results, resolve conflicts, and decide the next action.",
		"- Do not claim validation unless the relevant command or workflow was actually run.",
	].join("\n");
}

export default function fableCommand(pi: ExtensionAPI): void {
	pi.registerCommand("fable", {
		description:
			"Switch to Fable high and run an orchestration prompt that delegates substantial work to Codex subagents.",
		handler: async (args, ctx) => {
			const task = args.trim();
			if (!task) {
				ctx.ui.notify("Usage: /fable <task>", "warning");
				return;
			}

			const fableModel = findModel(
				ctx.modelRegistry.getAvailable(),
				FABLE_MODEL_ID,
			);
			if (!fableModel) {
				ctx.ui.notify(`Fable model not available: ${FABLE_MODEL_ID}`, "error");
				return;
			}

			const changed = await pi.setModel(fableModel);
			if (!changed) {
				ctx.ui.notify(
					`Could not switch to ${FABLE_MODEL_ID}. Check provider credentials.`,
					"error",
				);
				return;
			}

			pi.setThinkingLevel(FABLE_THINKING_LEVEL);
			ctx.ui.notify(
				`${FABLE_MODEL_ID}[${FABLE_THINKING_LEVEL}] orchestration started.`,
				"info",
			);
			await pi.sendUserMessage(buildFablePrompt(task));
		},
	});
}

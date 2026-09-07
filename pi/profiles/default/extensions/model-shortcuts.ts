import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { Model } from "@earendil-works/pi-ai";

const SHORTCUTS = {
	astra: {
		description: "Switch to GPT-6 Astra through the Codex subscription",
		candidates: [["openai-codex", "gpt-6-astra"]],
	},
	sol: {
		description: "Switch to GPT-5.6 Sol through the Codex subscription",
		candidates: [["openai-codex", "gpt-5.6-sol"]],
	},
	luna: {
		description: "Switch to GPT-5.6 Luna through the Codex subscription",
		candidates: [["openai-codex", "gpt-5.6-luna"]],
	},
	fable: {
		description: "Switch to Claude Fable through Amazon Bedrock",
		candidates: [
			["bedrock-mantle", "anthropic.claude-fable-5-1"],
			["bedrock-mantle", "anthropic.claude-fable-5"],
			["amazon-bedrock", "us.anthropic.claude-fable-5-1"],
			["amazon-bedrock", "us.anthropic.claude-fable-5"],
		],
	},
} as const;

type ShortcutName = keyof typeof SHORTCUTS;
type AvailableModel = Model<any>;

function findCandidate(ctx: ExtensionCommandContext, name: ShortcutName): AvailableModel | undefined {
	const available = ctx.modelRegistry.getAvailable();
	for (const [provider, id] of SHORTCUTS[name].candidates) {
		const model = available.find((candidate) => candidate.provider === provider && candidate.id === id);
		if (model) return model;
	}
	return undefined;
}

export default function modelShortcuts(pi: ExtensionAPI): void {
	for (const name of Object.keys(SHORTCUTS) as ShortcutName[]) {
		const shortcut = SHORTCUTS[name];
		pi.registerCommand(name, {
			description: shortcut.description,
			handler: async (args, ctx) => {
				if (args.trim()) {
					ctx.ui.notify(`/${name} does not accept arguments.`, "warning");
					return;
				}

				const model = findCandidate(ctx, name);
				if (!model) {
					ctx.ui.notify(`No configured ${name} model is available. Refresh models or check provider login.`, "error");
					return;
				}

				if (!(await pi.setModel(model))) {
					ctx.ui.notify(`Could not switch to ${model.provider}/${model.id}. Check provider login.`, "error");
					return;
				}

				ctx.ui.notify(`Switched to ${model.provider}/${model.id}.`, "info");
			},
		});
	}
}

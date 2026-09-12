import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { completePartialArgument } from "../lib/argument-completions.ts";
import { resolvePreferredModel } from "../lib/model-selection.ts";

const SHORTCUTS = {
	astra: "Switch to GPT-6 Astra using the preferred configured provider",
	sol: "Switch to GPT-5.6 Sol using the preferred configured provider",
	luna: "Switch to GPT-5.6 Luna using the preferred configured provider",
	fable: "Switch to Claude Fable using the preferred configured provider",
} as const;

const EFFORT_LEVELS = ["low", "medium", "high", "xhigh"] as const;

type ShortcutName = keyof typeof SHORTCUTS;
type EffortLevel = typeof EFFORT_LEVELS[number];

function parseEffort(args: string): EffortLevel | undefined {
	const requested = args.trim().toLowerCase();
	if (!requested) return undefined;
	return EFFORT_LEVELS.find((level) => level === requested);
}

function findCandidate(ctx: ExtensionCommandContext, name: ShortcutName) {
	try {
		return resolvePreferredModel(name, ctx.modelRegistry);
	} catch {
		return undefined;
	}
}

export default function modelShortcuts(pi: ExtensionAPI): void {
	for (const name of Object.keys(SHORTCUTS) as ShortcutName[]) {
		pi.registerCommand(name, {
			description: `${SHORTCUTS[name]}; optionally set effort: ${EFFORT_LEVELS.join(", ")}`,
			getArgumentCompletions: (prefix) => completePartialArgument(prefix, EFFORT_LEVELS),
			handler: async (args, ctx) => {
				const requestedEffort = parseEffort(args);
				if (args.trim() && !requestedEffort) {
					ctx.ui.notify(`Invalid effort level for /${name}: ${args.trim()}. Available levels: ${EFFORT_LEVELS.join(", ")}.`, "warning");
					return;
				}

				const model = findCandidate(ctx, name);
				if (!model) {
					ctx.ui.notify(`No configured ${name} model is available through the subscription or AWS provider ladder.`, "error");
					return;
				}

				if (!(await pi.setModel(model))) {
					ctx.ui.notify(`Could not switch to ${model.provider}/${model.id}. Check provider login.`, "error");
					return;
				}

				if (requestedEffort) pi.setThinkingLevel(requestedEffort);
				const effortSuffix = requestedEffort ? ` at ${pi.getThinkingLevel()} effort` : "";
				ctx.ui.notify(`Switched to ${model.provider}/${model.id}${effortSuffix}.`, "info");
			},
		});
	}
}

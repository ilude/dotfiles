import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const EFFORT_LEVELS = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
] as const satisfies readonly ThinkingLevel[];

const EFFORT_MESSAGE_TYPE = "effort-command";

function sendResult(pi: ExtensionAPI, content: string): void {
	pi.sendMessage(
		{
			customType: EFFORT_MESSAGE_TYPE,
			content,
			display: true,
		},
		{ triggerTurn: false },
	);
}

function isThinkingLevel(value: string): value is ThinkingLevel {
	return EFFORT_LEVELS.some((level) => level === value);
}

export default function registerEffortCommand(pi: ExtensionAPI): void {
	pi.registerCommand("effort", {
		description: "Show or set the session thinking effort",
		getArgumentCompletions: (prefix) => {
			const normalized = prefix.trim().toLowerCase();
			const matches = EFFORT_LEVELS.filter((level) =>
				level.startsWith(normalized),
			);
			return matches.length > 0
				? matches.map((value) => ({ value, label: value }))
				: null;
		},
		handler: async (args) => {
			const requested = args.trim().toLowerCase();
			if (requested === "") {
				sendResult(
					pi,
					`Current effort: ${pi.getThinkingLevel()}. Available levels: ${EFFORT_LEVELS.join(", ")}.`,
				);
				return;
			}

			if (!isThinkingLevel(requested)) {
				sendResult(
					pi,
					`Invalid effort level: ${requested}. Available levels: ${EFFORT_LEVELS.join(", ")}.`,
				);
				return;
			}

			pi.setThinkingLevel(requested);
			const effective = pi.getThinkingLevel();
			const result =
				effective === requested
					? `Effort set to ${effective}.`
					: `Effort ${requested} was adjusted to ${effective} for the active model.`;
			sendResult(pi, result);
		},
	});
}

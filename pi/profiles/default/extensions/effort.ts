import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { completePartialArgument } from "../lib/argument-completions.ts";

const EFFORT_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
const EFFORT_MESSAGE_TYPE = "effort-command";

type EffortLevel = typeof EFFORT_LEVELS[number];

function isEffortLevel(value: string): value is EffortLevel {
	return EFFORT_LEVELS.some((level) => level === value);
}

function sendResult(pi: ExtensionAPI, content: string): void {
	pi.sendMessage({ customType: EFFORT_MESSAGE_TYPE, content, display: true }, { triggerTurn: false });
}

export default function effortCommand(pi: ExtensionAPI): void {
	pi.registerCommand("effort", {
		description: "Show or set the session thinking effort",
		getArgumentCompletions: (prefix) => completePartialArgument(prefix, EFFORT_LEVELS),
		handler: async (args) => {
			const requested = args.trim().toLowerCase();
			if (!requested) {
				sendResult(pi, `Current effort: ${pi.getThinkingLevel()}. Available levels: ${EFFORT_LEVELS.join(", ")}.`);
				return;
			}
			if (!isEffortLevel(requested)) {
				sendResult(pi, `Invalid effort level: ${requested}. Available levels: ${EFFORT_LEVELS.join(", ")}.`);
				return;
			}
			pi.setThinkingLevel(requested as Parameters<typeof pi.setThinkingLevel>[0]);
			const effective = pi.getThinkingLevel();
			sendResult(pi, effective === requested ? `Effort set to ${effective}.` : `Effort ${requested} was adjusted to ${effective} for the active model.`);
		},
	});
}

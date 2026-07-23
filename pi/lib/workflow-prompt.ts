import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export function sendHiddenWorkflowPrompt(
	sender: Pick<ExtensionAPI, "sendMessage">,
	content: string,
	options: {
		customType?: string;
		deliverAs?: "steer" | "followUp";
	} = {},
): void {
	sender.sendMessage(
		{
			customType: options.customType ?? "workflow.hiddenPrompt",
			content,
			display: false,
		},
		{
			triggerTurn: true,
			deliverAs: options.deliverAs ?? "followUp",
		},
	);
}

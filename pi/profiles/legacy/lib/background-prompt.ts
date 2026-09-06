import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export function sendBackgroundPrompt(
	pi: ExtensionAPI,
	prompt: string,
): void {
	pi.sendUserMessage(prompt, { deliverAs: "followUp" });
}

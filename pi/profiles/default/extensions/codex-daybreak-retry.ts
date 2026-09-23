import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { modelFamilyVersion } from "../lib/model-family.ts";

const DAYBREAK_ACCESS_ERROR = "Unable to verify Daybreak Blue access. Please try again.";
const RETRYABLE_DAYBREAK_ACCESS_ERROR = "Unable to verify Daybreak Blue access. Please retry your request.";

export function markDaybreakAccessErrorRetryable(message: AssistantMessage): AssistantMessage | undefined {
	if (
		message.provider !== "openai-codex" ||
		modelFamilyVersion(message.model)?.family !== "sol" ||
		message.stopReason !== "error" ||
		!message.errorMessage?.includes(DAYBREAK_ACCESS_ERROR)
	) return undefined;

	return {
		...message,
		errorMessage: message.errorMessage.replace(DAYBREAK_ACCESS_ERROR, RETRYABLE_DAYBREAK_ACCESS_ERROR),
	};
}

export default function codexDaybreakRetry(pi: ExtensionAPI): void {
	pi.on("message_end", event => {
		if (event.message.role !== "assistant") return;
		const message = markDaybreakAccessErrorRetryable(event.message);
		return message ? { message } : undefined;
	});
}

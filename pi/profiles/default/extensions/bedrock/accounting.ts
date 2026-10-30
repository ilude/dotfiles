import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { accountBedrockMessage, bedrockSessionReference } from "../../lib/bedrock/accounting.js";
import { notifyGoalAccounting } from "../../lib/bedrock/goal-notification.ts";
export { notifyGoalAccounting } from "../../lib/bedrock/goal-notification.ts";

/** Register Bedrock accounting without provider, command, status, or operator UI surfaces. */
export function registerBedrockAccounting(pi: ExtensionAPI): void {
	pi.on("message_end", async (event, ctx) => {
		const result = await accountBedrockMessage(event.message, bedrockSessionReference(ctx));
		if (!result) return;
		await notifyGoalAccounting(pi, result);
		return { message: result.message };
	});
}

export default registerBedrockAccounting;

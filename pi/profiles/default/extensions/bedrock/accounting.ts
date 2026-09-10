import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { accountBedrockMessage, bedrockSessionReference } from "../../lib/bedrock/accounting.js";

/** Register Bedrock accounting without provider, command, status, or operator UI surfaces. */
export function registerBedrockAccounting(pi: ExtensionAPI): void {
	pi.on("message_end", async (event, ctx) => {
		const result = await accountBedrockMessage(event.message, bedrockSessionReference(ctx));
		return result ? { message: result.message } : undefined;
	});
}

export default registerBedrockAccounting;

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { accountBedrockMessage, bedrockSessionReference } from "../../lib/bedrock/accounting.js";
import { createBedrockModelProvider } from "../../lib/bedrock/provider.js";

// Child-only provider registration. Keep status and /bedrock operator commands
// out of restricted subagent sessions, while still accounting finalized replies.
export default function bedrockProvider(pi: ExtensionAPI): void {
  pi.registerProvider(createBedrockModelProvider());
  pi.on("message_end", async (event, ctx) => {
    const result = await accountBedrockMessage(event.message, bedrockSessionReference(ctx));
    return result ? { message: result.message } : undefined;
  });
}

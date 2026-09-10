import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createBedrockModelProvider } from "../../lib/bedrock/provider.js";
import { registerBedrockAccounting } from "./accounting.js";

// Child-only provider registration. Keep status and /bedrock operator commands
// out of restricted subagent sessions, while still accounting finalized replies.
export default function bedrockProvider(pi: ExtensionAPI): void {
  pi.registerProvider(createBedrockModelProvider());
  registerBedrockAccounting(pi);
}

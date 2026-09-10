import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createBedrockModelProvider } from "../../lib/bedrock/provider.js";

// Child-only provider registration. Keep accounting, status, and /bedrock
// operator commands owned by index.ts and out of restricted subagent sessions.
export default function bedrockProvider(pi: ExtensionAPI): void {
  pi.registerProvider(createBedrockModelProvider());
}

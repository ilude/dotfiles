import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPromptTemplateCommands } from "../lib/prompt-template-commands.ts";

export default function promptTemplateCommands(pi: ExtensionAPI): void {
	registerPromptTemplateCommands(pi, join(dirname(fileURLToPath(import.meta.url)), "..", "prompts"));
}

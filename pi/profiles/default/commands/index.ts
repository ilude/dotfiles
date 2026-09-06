import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { commitReviewerTool } from "./commit/reviewer.ts";

export interface ProfileCommand {
	name: string;
	description: string;
	/** Return extra prompt text, or throw a usage error. */
	arguments?: (args: string) => string;
	completions?: string[];
	tools?: (pi: ExtensionAPI) => ToolDefinition[];
}

let commitPushRequested = false;

// Explicit, profile-local registry: no global discovery, plugin loader, or agent router.
export const commands: ProfileCommand[] = [
	{
		name: "commit",
		description: "Review and commit related changes; optionally push to origin",
		completions: ["push"],
		tools: (pi) => [commitReviewerTool(pi, () => commitPushRequested)],
		arguments: (args) => {
			if (args !== "" && args !== "push") throw new Error("Usage: /commit [push]");
			commitPushRequested = args === "push";
			return "";
		},
	},
	{
		name: "bro",
		description: "Restate the last response in plain language",
	},
];

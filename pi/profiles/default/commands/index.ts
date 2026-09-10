import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { InvocationResolver } from "../lib/command-invocations.ts";
import { commitReviewerTool } from "./commit/reviewer.ts";

export interface ParsedCommandArguments {
	readonly extra: string;
	readonly options?: Readonly<Record<string, unknown>>;
}

export interface ProfileCommand {
	name: string;
	description: string;
	/** Return immutable invocation data, or throw a usage error. */
	arguments?: (args: string) => ParsedCommandArguments;
	completions?: string[];
	tools?: (pi: ExtensionAPI, invocations?: InvocationResolver) => ToolDefinition[];
}

// Explicit, profile-local registry: no global discovery, plugin loader, or agent router.
export const commands: ProfileCommand[] = [
	{
		name: "commit",
		description: "Review and commit related changes; optionally push to origin",
		completions: ["push"],
		tools: (pi, invocations) => [commitReviewerTool(pi, (toolCallId) => {
			const invocation = invocations?.getToolCall(toolCallId);
			if (!invocation || invocation.command !== "commit") return undefined;
			return invocation.options.push === true;
		})],
		arguments: (args) => {
			if (args !== "" && args !== "push") throw new Error("Usage: /commit [push]");
			return Object.freeze({ extra: "", options: Object.freeze({ push: args === "push" }) });
		},
	},
	{
		name: "bro",
		description: "Restate the last response in plain language",
	},
];

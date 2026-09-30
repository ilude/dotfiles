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
}

// Explicit, profile-local registry: no global discovery, plugin loader, or agent router.
export const commands: ProfileCommand[] = [
	{
		name: "commit",
		description: "Review and commit related changes; optionally push to origin",
		completions: ["push"],
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

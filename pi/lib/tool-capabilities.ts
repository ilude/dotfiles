export type ToolCapability = "read" | "execute" | "mutate";

const TOOL_CAPABILITIES: Readonly<Record<string, ToolCapability>> =
	Object.freeze({
		find: "read",
		grep: "read",
		ls: "read",
		read: "read",
		tool_search: "read",
		web_fetch: "read",
		web_search: "read",
		bash: "execute",
		pwsh: "execute",
		task: "mutate",
		subagent: "mutate",
		write: "mutate",
		edit: "mutate",
	});

export function toolCapability(name: string): ToolCapability {
	return TOOL_CAPABILITIES[name] ?? "mutate";
}

export function enforcedToolsAreReadOnly(
	tools: readonly string[] | undefined,
): boolean {
	if (!tools || tools.length === 0) return false;
	return tools.every((tool) => toolCapability(tool) === "read");
}

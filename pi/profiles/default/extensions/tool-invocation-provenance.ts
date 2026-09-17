import type { ExtensionAPI, ToolInfo } from "@earendil-works/pi-coding-agent";

export const TOOL_INVOCATION_PROVENANCE_ENTRY = "tool-invocation-provenance";

export interface ToolInvocationProvenance {
	toolCallId: string;
	toolName: string;
	sourceInfo: ToolInfo["sourceInfo"] | "unknown";
}

/** Resolve the effective registered tool, retaining the runtime's last-definition override identity. */
export function resolveToolSourceInfo(pi: Pick<ExtensionAPI, "getAllTools">, toolName: string): ToolInfo["sourceInfo"] | "unknown" {
	let sourceInfo: ToolInfo["sourceInfo"] | "unknown" = "unknown";
	for (const tool of pi.getAllTools()) {
		if (tool.name === toolName) sourceInfo = tool.sourceInfo;
	}
	return sourceInfo;
}

export default function toolInvocationProvenance(pi: ExtensionAPI): void {
	pi.on("tool_execution_start", (event) => {
		const entry: ToolInvocationProvenance = {
			toolCallId: event.toolCallId,
			toolName: event.toolName,
			sourceInfo: resolveToolSourceInfo(pi, event.toolName),
		};
		pi.appendEntry(TOOL_INVOCATION_PROVENANCE_ENTRY, entry);
	});
}

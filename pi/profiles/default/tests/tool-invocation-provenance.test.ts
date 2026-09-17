import { describe, expect, it, vi } from "vitest";
import provenance, { TOOL_INVOCATION_PROVENANCE_ENTRY, resolveToolSourceInfo } from "../extensions/tool-invocation-provenance.ts";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function fixture(tools: Array<{ name: string; sourceInfo: unknown }>) {
	const hooks = new Map<string, (event: { toolCallId: string; toolName: string; args: unknown }) => void>();
	const appendEntry = vi.fn();
	const pi = {
		on: vi.fn((name: string, handler: (event: { toolCallId: string; toolName: string; args: unknown }) => void) => hooks.set(name, handler)),
		getAllTools: vi.fn(() => tools),
		appendEntry,
	};
	provenance(pi as unknown as ExtensionAPI);
	return { hooks, appendEntry, pi };
}

describe("tool invocation provenance", () => {
	it("records the effective built-in, extension, and override metadata only once", () => {
		const builtin = { path: "<builtin:read>", source: "builtin", scope: "temporary", origin: "top-level" };
		const extension = { path: "extensions/example.ts", source: "extension", scope: "user", origin: "top-level" };
		const override = { path: "extensions/override.ts", source: "extension", scope: "project", origin: "top-level" };
		const { hooks, appendEntry } = fixture([
			{ name: "read", sourceInfo: builtin },
			{ name: "custom", sourceInfo: extension },
			{ name: "overridden", sourceInfo: builtin },
			{ name: "overridden", sourceInfo: override },
		]);

		hooks.get("tool_execution_start")!({ toolCallId: "a", toolName: "read", args: { secret: "not recorded" } });
		hooks.get("tool_execution_start")!({ toolCallId: "b", toolName: "custom", args: { secret: "not recorded" } });
		hooks.get("tool_execution_start")!({ toolCallId: "c", toolName: "overridden", args: { secret: "not recorded" } });
		hooks.get("tool_execution_start")!({ toolCallId: "d", toolName: "missing", args: { secret: "not recorded" } });

		expect(appendEntry).toHaveBeenCalledTimes(4);
		expect(appendEntry).toHaveBeenNthCalledWith(1, TOOL_INVOCATION_PROVENANCE_ENTRY, { toolCallId: "a", toolName: "read", sourceInfo: builtin });
		expect(appendEntry).toHaveBeenNthCalledWith(2, TOOL_INVOCATION_PROVENANCE_ENTRY, { toolCallId: "b", toolName: "custom", sourceInfo: extension });
		expect(appendEntry).toHaveBeenNthCalledWith(3, TOOL_INVOCATION_PROVENANCE_ENTRY, { toolCallId: "c", toolName: "overridden", sourceInfo: override });
		expect(appendEntry).toHaveBeenNthCalledWith(4, TOOL_INVOCATION_PROVENANCE_ENTRY, { toolCallId: "d", toolName: "missing", sourceInfo: "unknown" });
		expect(JSON.stringify(appendEntry.mock.calls)).not.toContain("secret");
	});

	it("does not infer provenance for an unknown tool", () => {
		const pi = { getAllTools: () => [] } as unknown as ExtensionAPI;
		expect(resolveToolSourceInfo(pi, "unknown_tool")).toBe("unknown");
	});
});

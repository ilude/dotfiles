import { describe, expect, it } from "vitest";
import {
	SubagentReadSchema,
	SubagentTeamleadSchema,
	SubagentWriteSchema,
} from "../extensions/subagent/contracts.ts";
import { adaptLegacySubagentInvocation } from "../extensions/subagent/legacy-adapter.ts";
import { modernRequestToExecutorInput } from "../extensions/subagent/modern-adapter.ts";
import type { PreparedSubagentExecution } from "../extensions/subagent/contracts.ts";
import type { SubagentControlSelector } from "../extensions/subagent/control.ts";

function properties(schema: unknown): Record<string, unknown> {
	return ((schema as { properties?: Record<string, unknown> }).properties ?? {});
}

describe("T6 current subagent naming", () => {
	it("advertises current parameters and an accurate enforced boundary", () => {
		const read = properties(SubagentReadSchema);
		const readItem = properties((read.items as { items?: unknown }).items);
		const teamlead = properties(SubagentTeamleadSchema);
		const enforced = read.enforcedBoundary as { description?: string };

		expect(read).toHaveProperty("enforcedBoundary");
		expect(read).not.toHaveProperty("workspaceRoot");
		expect(readItem).toHaveProperty("instructions");
		expect(readItem).toHaveProperty("boundaryPaths");
		expect(readItem).not.toHaveProperty("task");
		expect(teamlead).toHaveProperty("boundary");
		expect(teamlead).not.toHaveProperty("workBoundary");
		expect(enforced.description).toContain("governed file tools");
		expect(enforced.description).toContain("recursive-search tools");
		expect(enforced.description).toContain("not a general sandbox");
		expect(properties(SubagentWriteSchema)).toHaveProperty("enforcedBoundary");
	});

	it("maps current names to hidden legacy execution fields without changing authority", () => {
		const request = {
			kind: "read" as const,
			items: [{ agent: "reader", instructions: "Inspect files", boundaryPaths: ["src"] }],
			enforcedBoundary: "/workspace",
		};
		const prepared = {
			items: [
				{
					request: request.items[0],
					workspaceRoot: "/workspace",
					taskLink: { outcome: "none" as const },
				},
			],
		} as unknown as PreparedSubagentExecution;
		const executorInput = modernRequestToExecutorInput(request, prepared);
		expect(executorInput).toMatchObject({
			task: "Inspect files",
			scope: ["src"],
			workspaceRoot: "/workspace",
		});
		expect(executorInput).not.toHaveProperty("instructions");
	});

	it("accepts old names only through the historical adapter and returns current names", () => {
		const result = adaptLegacySubagentInvocation("subagent", {
			agent: "reader",
			task: "Inspect files",
			scope: ["src"],
			workspaceRoot: "/workspace",
		});
		if (!result.request || result.request.kind !== "write") throw new Error("request missing");
		expect(result.request.items[0]).toMatchObject({
			instructions: "Inspect files",
			boundaryPaths: ["src"],
		});
		expect(result.request).toHaveProperty("enforcedBoundary", "/workspace");
		expect(result.request.items[0]).not.toHaveProperty("task");
	});

	it("defines process selectors with current process terminology", () => {
		const selector: SubagentControlSelector = { type: "process", processId: "p-1" };
		expect(selector).toEqual({ type: "process", processId: "p-1" });
	});
});

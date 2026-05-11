import { describe, expect, it } from "vitest";
import agentTeam from "../extensions/agent-team.ts";
import subagent from "../extensions/subagent/index.ts";
import { createMockPi } from "./helpers/mock-pi.ts";

describe("agent control-plane registration", () => {
	it("does not register /team while subagent remains available", () => {
		const pi = createMockPi();
		agentTeam(pi as Parameters<typeof agentTeam>[0]);
		subagent(pi as Parameters<typeof subagent>[0]);

		expect(pi._commands.some((entry) => entry.name === "team")).toBe(false);
		expect(pi._getTool("subagent")).toBeTruthy();
	});
});

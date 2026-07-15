import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { loadAgentsFromDir } from "../extensions/subagent/agents.ts";

const AGENTS_DIR = path.resolve(__dirname, "..", "agents");
const CONTROL_TOOLS = new Set(["subagent", "find", "ls", "grep", "read"]);
const DIRECT_MUTATION_TOOLS = new Set(["bash", "pwsh", "edit", "write"]);

describe("agent source and role semantics", () => {
	it("loads active agent definitions from pi/agents, not pi/multi-team/agents", () => {
		const agents = loadAgentsFromDir(AGENTS_DIR, "user");

		expect(agents.length).toBeGreaterThan(0);
		expect(
			agents.every((agent) =>
				agent.filePath.includes(`${path.sep}pi${path.sep}agents${path.sep}`),
			),
		).toBe(true);
		expect(
			agents.every(
				(agent) =>
					!agent.filePath.includes(
						`${path.sep}pi${path.sep}multi-team${path.sep}agents${path.sep}`,
					),
			),
		).toBe(true);
	});

	it("parses enforced execution frontmatter for active agents", () => {
		const agents = loadAgentsFromDir(AGENTS_DIR, "user");
		expect(
			agents.find((agent) => agent.name === "engineering-lead")?.roleType,
		).toBe("lead");
		expect(agents.find((agent) => agent.name === "builder")?.roleType).toBe(
			"worker",
		);
		expect(agents.every((agent) => agent.effort)).toBe(true);
		expect(
			agents.find((agent) => agent.name === "code-reviewer")?.skills,
		).toEqual(["code-review"]);
	});

	it("does not advertise unenforced domain, expertise, or maxTurns fields", () => {
		for (const file of fs
			.readdirSync(AGENTS_DIR)
			.filter((name) => name.endsWith(".md"))) {
			const content = fs.readFileSync(path.join(AGENTS_DIR, file), "utf-8");
			expect(content).not.toMatch(/^domain:/m);
			expect(content).not.toMatch(/^expertise:/m);
			expect(content).not.toMatch(/^maxTurns:/m);
		}
	});

	it("keeps lead/orchestrator agents coordination-only by default", () => {
		const agents = loadAgentsFromDir(AGENTS_DIR, "user").filter((agent) =>
			["lead", "orchestrator"].includes(agent.roleType ?? ""),
		);

		expect(agents.length).toBeGreaterThan(0);
		for (const agent of agents) {
			const tools = agent.tools ?? [];
			expect(tools.some((tool) => DIRECT_MUTATION_TOOLS.has(tool))).toBe(false);
			expect(tools.every((tool) => CONTROL_TOOLS.has(tool))).toBe(true);
		}
	});

	it("keeps workers/specialists from delegating by default", () => {
		const agents = loadAgentsFromDir(AGENTS_DIR, "user").filter((agent) =>
			["worker", "specialist"].includes(agent.roleType ?? ""),
		);

		expect(agents.length).toBeGreaterThan(0);
		expect(
			agents.every((agent) => !(agent.tools ?? []).includes("subagent")),
		).toBe(true);
	});

	it("keeps the intended tier agents from delegating", () => {
		const agents = loadAgentsFromDir(AGENTS_DIR, "user");
		const tierAgentNames = [
			"utility-mini",
			"coding-light",
			"coding-medium",
			"coding-heavy",
		];

		for (const name of tierAgentNames) {
			const agent = agents.find((candidate) => candidate.name === name);
			expect(agent).toBeDefined();
			expect(agent?.roleType).toBe("tier");
			expect(agent?.tools ?? []).not.toContain("subagent");
		}
	});
});

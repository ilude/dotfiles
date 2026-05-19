import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import agentsContext, {
	agentsContextTestApi,
	formatAgentsContextStatus,
	resetAgentsContextStateForTests,
} from "../extensions/agents-context.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

function mkdirp(dir: string) {
	fs.mkdirSync(dir, { recursive: true });
}

function writeFile(filePath: string, content: string) {
	mkdirp(path.dirname(filePath));
	fs.writeFileSync(filePath, content, "utf8");
}

describe("agents-context extension", () => {
	let tmp: string;
	let originalHome: string | undefined;

	beforeEach(() => {
		resetAgentsContextStateForTests();
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agents-context-"));
		originalHome = process.env.HOME;
		process.env.HOME = tmp;
		vi.spyOn(os, "homedir").mockReturnValue(tmp);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		resetAgentsContextStateForTests();
		if (originalHome === undefined) delete process.env.HOME;
		else process.env.HOME = originalHome;
		fs.rmSync(tmp, { recursive: true, force: true });
	});

	it("filters and blocks expertise tools", async () => {
		const pi = createMockPi();
		agentsContext(pi as any);
		const before = pi._getHook("before_agent_start")[0].handler;
		const event = {
			systemPrompt: "base",
			tools: [{ name: "read_expertise" }, { name: "bash" }, { name: "append_expertise" }],
		};
		await before(event, createMockCtx({ cwd: tmp }));
		expect(event.tools).toEqual([{ name: "bash" }]);

		const toolHook = pi._getHook("tool_call")[0].handler;
		await expect(toolHook({ toolName: "read_expertise", input: {} }, createMockCtx({ cwd: tmp }))).resolves.toMatchObject({
			block: true,
		});
	});

	it("discovers global/user, root, nested, Claude, .pi, and imported instructions in deterministic order", () => {
		const cwd = path.join(tmp, "repo");
		const nested = path.join(cwd, "src", "feature");
		writeFile(path.join(tmp, ".pi", "agent", "AGENTS.md"), "global agent");
		writeFile(path.join(tmp, ".pi", "AGENTS.md"), "global compat");
		writeFile(path.join(cwd, "AGENTS.md"), "root agents\n@docs/root.md");
		writeFile(path.join(cwd, "docs", "root.md"), "root import");
		writeFile(path.join(cwd, ".pi", "AGENTS.md"), "root .pi agents");
		writeFile(path.join(cwd, "CLAUDE.md"), "root claude");
		writeFile(path.join(cwd, ".claude", "CLAUDE.md"), "dot claude");
		writeFile(path.join(cwd, "src", "AGENT.md"), "src agent");
		writeFile(path.join(nested, "AGENTS.md"), "nested agents");

		const files = agentsContextTestApi.discoverForPaths(cwd, [path.join("src", "feature", "thing.ts")]);
		expect(files.map((file) => path.relative(tmp, file.path).replaceAll(path.sep, "/"))).toEqual([
			".pi/agent/AGENTS.md",
			".pi/AGENTS.md",
			"repo/AGENTS.md",
			"repo/docs/root.md",
			"repo/.pi/AGENTS.md",
			"repo/CLAUDE.md",
			"repo/.claude/CLAUDE.md",
			"repo/src/AGENT.md",
			"repo/src/feature/AGENTS.md",
		]);

		const second = agentsContextTestApi.discoverForPaths(cwd, [path.join("src", "feature", "thing.ts")]);
		expect(second).toEqual([]);
	});

	it("blocks a mutating call once after loading new instructions and allows retry", async () => {
		const cwd = path.join(tmp, "repo");
		writeFile(path.join(cwd, "AGENTS.md"), "root agents");
		writeFile(path.join(cwd, "src", "AGENTS.md"), "src agents");
		const pi = createMockPi();
		agentsContext(pi as any);
		const toolHook = pi._getHook("tool_call")[0].handler;
		const ctx = createMockCtx({ cwd });
		const event = { toolName: "edit", input: { path: "src/file.ts" } };
		await expect(toolHook(event, ctx)).resolves.toMatchObject({ block: true });
		await expect(toolHook(event, ctx)).resolves.toBeUndefined();
		expect(pi.sendMessage).toHaveBeenCalledWith(
			expect.objectContaining({ customType: "agents-context-report", display: false }),
			expect.objectContaining({ triggerTurn: false }),
		);
	});

	it("registers /agents-context inspection status without adding display reports to LLM context", async () => {
		const cwd = path.join(tmp, "repo");
		writeFile(path.join(cwd, "AGENTS.md"), "root agents");
		const pi = createMockPi();
		agentsContext(pi as any);
		const before = pi._getHook("before_agent_start")[0].handler;
		await before({ systemPrompt: "base", tools: [] }, createMockCtx({ cwd }));
		const command = pi._commands.find((item) => item.name === "agents-context");
		expect(command).toBeTruthy();
		expect(formatAgentsContextStatus()).toContain("Expertise tools disabled: yes");
		expect(formatAgentsContextStatus()).toContain("AGENTS.md");
		const ctx = createMockCtx({ cwd, hasUI: false });
		await command?.handler("", ctx);
		expect(pi.sendMessage).toHaveBeenCalledWith(
			expect.objectContaining({ customType: "agents-context-report", display: true }),
			expect.objectContaining({ triggerTurn: false }),
		);
	});
});

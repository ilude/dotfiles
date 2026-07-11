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

function registerAgentsContext(pi: ReturnType<typeof createMockPi>) {
	agentsContext(pi as unknown as Parameters<typeof agentsContext>[0]);
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
		registerAgentsContext(pi);
		const beforeAgentStart = pi._getHook("before_agent_start")[0].handler;
		const event = {
			systemPrompt: "base",
			tools: [
				{ name: "read_expertise" },
				{ name: "bash" },
				{ name: "append_expertise" },
			],
		};
		await beforeAgentStart(event, createMockCtx({ cwd: tmp }));
		expect(event.tools).toEqual([{ name: "bash" }]);

		const toolHook = pi._getHook("tool_call")[0].handler;
		await expect(
			toolHook(
				{ toolName: "read_expertise", input: {} },
				createMockCtx({ cwd: tmp }),
			),
		).resolves.toMatchObject({
			block: true,
		});
	});

	it("discovers global/user, root, nested, and imported instructions in deterministic order", () => {
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

		const files = agentsContextTestApi.discoverForPaths(cwd, [
			path.join("src", "feature", "thing.ts"),
		]);
		expect(
			files.map((file) =>
				path.relative(tmp, file.path).replaceAll(path.sep, "/"),
			),
		).toEqual([
			".pi/agent/AGENTS.md",
			".pi/AGENTS.md",
			"repo/AGENTS.md",
			"repo/docs/root.md",
			"repo/src/AGENT.md",
			"repo/src/feature/AGENTS.md",
		]);

		const second = agentsContextTestApi.discoverForPaths(cwd, [
			path.join("src", "feature", "thing.ts"),
		]);
		expect(
			second.map((file) =>
				path.relative(tmp, file.path).replaceAll(path.sep, "/"),
			),
		).toEqual([
			".pi/agent/AGENTS.md",
			".pi/AGENTS.md",
			"repo/AGENTS.md",
			"repo/docs/root.md",
			"repo/src/AGENT.md",
			"repo/src/feature/AGENTS.md",
		]);
	});

	it("rejects unsafe AGENTS imports without loading skipped content", () => {
		const cwd = path.join(tmp, "repo");
		writeFile(
			path.join(cwd, "AGENTS.md"),
			[
				"root agents",
				"@../outside.md",
				"@/etc/hosts",
				"@.env",
				"@docs/ok.md",
			].join("\n"),
		);
		writeFile(path.join(tmp, "outside.md"), "outside secret");
		writeFile(path.join(cwd, ".env"), "TOKEN=secret");
		writeFile(path.join(cwd, "docs", "ok.md"), "safe import");

		const files = agentsContextTestApi.discoverForPaths(cwd, ["file.ts"]);
		expect(
			files.map((file) =>
				path.relative(tmp, file.path).replaceAll(path.sep, "/"),
			),
		).toEqual(["repo/AGENTS.md", "repo/docs/ok.md"]);
		const status = formatAgentsContextStatus();
		expect(status).toContain("parent-directory imports are not allowed");
		expect(status).toContain("absolute imports are not allowed");
		expect(status).toContain("sensitive file imports are not allowed");
		expect(status).not.toContain("outside secret");
		expect(status).not.toContain("TOKEN=secret");
	});

	it("rejects AGENTS imports through symlinks escaping the repo", () => {
		const cwd = path.join(tmp, "repo");
		writeFile(path.join(cwd, "AGENTS.md"), "root agents\n@links/outside.md");
		writeFile(path.join(tmp, "outside", "outside.md"), "outside secret");
		mkdirp(path.join(cwd, "links"));
		fs.symlinkSync(
			path.join(tmp, "outside", "outside.md"),
			path.join(cwd, "links", "outside.md"),
		);

		const files = agentsContextTestApi.discoverForPaths(cwd, ["file.ts"]);
		expect(
			files.map((file) =>
				path.relative(tmp, file.path).replaceAll(path.sep, "/"),
			),
		).toEqual(["repo/AGENTS.md"]);
		expect(formatAgentsContextStatus()).toContain(
			"import escapes instruction root",
		);
	});

	it("does not persist discovered instructions with sendMessage", async () => {
		const cwd = path.join(tmp, "repo");
		writeFile(path.join(cwd, "AGENTS.md"), "root agents");
		const pi = createMockPi();
		registerAgentsContext(pi);
		const toolHook = pi._getHook("tool_call")[0].handler;
		await toolHook(
			{ toolName: "read", input: { path: "file.ts" } },
			createMockCtx({ cwd }),
		);
		expect(pi.sendMessage).not.toHaveBeenCalled();
	});

	it("filters historical reports and injects exactly one current ephemeral message", async () => {
		const cwd = path.join(tmp, "repo");
		writeFile(path.join(cwd, "AGENTS.md"), "root agents");
		const pi = createMockPi();
		registerAgentsContext(pi);
		const ctx = createMockCtx({ cwd });
		const toolHook = pi._getHook("tool_call")[0].handler;
		await toolHook({ toolName: "read", input: { path: "a.ts" } }, ctx);
		await toolHook({ toolName: "read", input: { path: "b.ts" } }, ctx);
		const contextHook = pi._getHook("context")[0].handler;
		const result = await contextHook(
			{
				messages: [
					{ role: "user", content: "keep" },
					{
						role: "custom",
						customType: "agents-context-report",
						content: "old",
						display: false,
					},
					{
						role: "custom",
						customType: "agents-context-report",
						content: "older",
						display: false,
					},
				],
			},
			ctx,
		);
		expect(
			result.messages.filter(
				(message: Record<string, unknown>) =>
					message.customType === "agents-context-report",
			),
		).toHaveLength(1);
		expect(result.messages.at(-1).content).toContain("root agents");
		expect(result.messages.at(-1).content).not.toContain("older");
	});

	it("replaces cwd and target scopes instead of accumulating them", async () => {
		const first = path.join(tmp, "first");
		const second = path.join(tmp, "second");
		writeFile(path.join(first, "AGENTS.md"), "first root");
		writeFile(path.join(first, "src", "AGENTS.md"), "first src");
		writeFile(path.join(first, "test", "AGENTS.md"), "first test");
		writeFile(path.join(second, "AGENTS.md"), "second root");
		const pi = createMockPi();
		registerAgentsContext(pi);
		const toolHook = pi._getHook("tool_call")[0].handler;
		const contextHook = pi._getHook("context")[0].handler;
		await toolHook(
			{ toolName: "read", input: { path: "src/file.ts" } },
			createMockCtx({ cwd: first }),
		);
		await toolHook(
			{ toolName: "read", input: { path: "test/file.ts" } },
			createMockCtx({ cwd: first }),
		);
		let result = await contextHook(
			{ messages: [] },
			createMockCtx({ cwd: first }),
		);
		expect(result.messages[0].content).toContain("first test");
		expect(result.messages[0].content).not.toContain("first src");

		await toolHook(
			{ toolName: "read", input: { path: "file.ts" } },
			createMockCtx({ cwd: second }),
		);
		result = await contextHook(
			{ messages: [] },
			createMockCtx({ cwd: second }),
		);
		expect(result.messages[0].content).toContain("second root");
		expect(result.messages[0].content).not.toContain("first root");
	});

	it("keeps base instructions in the system prompt and blocks only new target scope", async () => {
		const cwd = path.join(tmp, "repo");
		writeFile(path.join(cwd, "AGENTS.md"), "root agents");
		writeFile(path.join(cwd, "src", "AGENTS.md"), "src agents");
		const pi = createMockPi();
		registerAgentsContext(pi);
		const ctx = createMockCtx({ cwd });
		const beforeAgentStart = pi._getHook("before_agent_start")[0].handler;
		const contextHook = pi._getHook("context")[0].handler;
		const toolHook = pi._getHook("tool_call")[0].handler;

		const start = await beforeAgentStart(
			{ systemPrompt: "base", tools: [] },
			ctx,
		);
		expect(start.systemPrompt).toContain("root agents");
		await expect(
			toolHook({ toolName: "edit", input: { path: "root.ts" } }, ctx),
		).resolves.toBeUndefined();
		await expect(
			toolHook({ toolName: "edit", input: { path: "src/file.ts" } }, ctx),
		).resolves.toMatchObject({ block: true });

		const retryContext = await contextHook({ messages: [] }, ctx);
		expect(retryContext.messages).toHaveLength(1);
		expect(retryContext.messages[0].content).toContain("src agents");
		expect(retryContext.messages[0].content).not.toContain("root agents");
		await expect(
			toolHook({ toolName: "edit", input: { path: "src/file.ts" } }, ctx),
		).resolves.toBeUndefined();
	});

	it("blocks newly discovered context exactly once and permits the immediate identical retry", async () => {
		const cwd = path.join(tmp, "repo");
		writeFile(path.join(cwd, "AGENTS.md"), "root agents");
		writeFile(path.join(cwd, "src", "AGENTS.md"), "src agents");
		const pi = createMockPi();
		registerAgentsContext(pi);
		const toolHook = pi._getHook("tool_call")[0].handler;
		const contextHook = pi._getHook("context")[0].handler;
		const ctx = createMockCtx({ cwd });
		const event = { toolName: "edit", input: { path: "src/file.ts" } };
		await expect(toolHook(event, ctx)).resolves.toMatchObject({ block: true });
		await expect(toolHook(event, ctx)).resolves.toBeUndefined();
		const retryContext = await contextHook({ messages: [] }, ctx);
		expect(retryContext.messages).toHaveLength(1);
		expect(retryContext.messages[0].content).toContain("src agents");
		expect(pi.sendMessage).not.toHaveBeenCalled();
	});

	it("blocks once again when target instruction content changes", async () => {
		const cwd = path.join(tmp, "repo");
		const instructionPath = path.join(cwd, "src", "AGENTS.md");
		writeFile(path.join(cwd, "AGENTS.md"), "root agents");
		writeFile(instructionPath, "first version");
		const pi = createMockPi();
		registerAgentsContext(pi);
		const toolHook = pi._getHook("tool_call")[0].handler;
		const resultHook = pi._getHook("tool_result")[0].handler;
		const ctx = createMockCtx({ cwd });
		const event = { toolName: "edit", input: { path: "src/file.ts" } };

		await expect(toolHook(event, ctx)).resolves.toMatchObject({ block: true });
		await expect(toolHook(event, ctx)).resolves.toBeUndefined();
		await resultHook({ ...event, content: [], isError: false }, ctx);
		writeFile(instructionPath, "second version");
		await expect(toolHook(event, ctx)).resolves.toMatchObject({ block: true });
		await expect(toolHook(event, ctx)).resolves.toBeUndefined();
	});

	it("does not stop identical successful tool calls", async () => {
		const pi = createMockPi();
		registerAgentsContext(pi);
		const toolHook = pi._getHook("tool_call")[0].handler;
		const resultHook = pi._getHook("tool_result")[0].handler;
		const ctx = createMockCtx({ cwd: tmp });
		const event = { toolName: "read", input: { path: "same.ts" } };

		for (let attempt = 0; attempt < 3; attempt += 1) {
			await expect(toolHook(event, ctx)).resolves.toBeUndefined();
			await resultHook({ ...event, content: [], isError: false }, ctx);
		}
	});

	it("stops a third identical failed attempt before execution and resets for a new user turn", async () => {
		const cwd = path.join(tmp, "repo");
		const pi = createMockPi();
		registerAgentsContext(pi);
		const toolHook = pi._getHook("tool_call")[0].handler;
		const resultHook = pi._getHook("tool_result")[0].handler;
		const beforeAgentStart = pi._getHook("before_agent_start")[0].handler;
		const ctx = createMockCtx({ cwd });
		const event = { toolName: "read", input: { path: "missing.ts" } };
		const failedResult = {
			...event,
			content: [{ type: "text", text: "not found" }],
			details: { code: "ENOENT" },
			isError: true,
		};
		let invocationCount = 0;

		for (let attempt = 0; attempt < 2; attempt += 1) {
			await expect(toolHook(event, ctx)).resolves.toBeUndefined();
			invocationCount += 1;
			await resultHook(failedResult, ctx);
		}
		await expect(toolHook(event, ctx)).resolves.toEqual({
			block: true,
			reason: expect.stringContaining("repeated_tool_loop"),
		});
		expect(invocationCount).toBe(2);

		await beforeAgentStart({ systemPrompt: "base", tools: [] }, ctx);
		await expect(toolHook(event, ctx)).resolves.toBeUndefined();
		invocationCount += 1;
		expect(invocationCount).toBe(3);
	});

	it("registers /agents-context inspection status without adding display reports to LLM context", async () => {
		const cwd = path.join(tmp, "repo");
		writeFile(path.join(cwd, "AGENTS.md"), "root agents");
		const pi = createMockPi();
		registerAgentsContext(pi);
		const beforeAgentStart = pi._getHook("before_agent_start")[0].handler;
		await beforeAgentStart(
			{ systemPrompt: "base", tools: [] },
			createMockCtx({ cwd }),
		);
		const command = pi._commands.find((item) => item.name === "agents-context");
		expect(command).toBeTruthy();
		expect(formatAgentsContextStatus()).toContain(
			"Expertise tools disabled: yes",
		);
		expect(formatAgentsContextStatus()).toContain("AGENTS.md");
		const ctx = createMockCtx({ cwd, hasUI: false });
		await command?.handler("", ctx);
		expect(pi.sendMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				customType: "agents-context-report",
				display: true,
			}),
			expect.objectContaining({ triggerTurn: false }),
		);
	});
});

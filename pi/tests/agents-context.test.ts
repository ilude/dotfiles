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

let tmp: string;

function setupAgentsContextTest() {
	resetAgentsContextStateForTests();
	tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agents-context-"));
}

function cleanupAgentsContextTest() {
	vi.restoreAllMocks();
	resetAgentsContextStateForTests();
	fs.rmSync(tmp, { recursive: true, force: true });
}

describe("agents-context discovery", () => {
	beforeEach(setupAgentsContextTest);
	afterEach(cleanupAgentsContextTest);

	it("discovers root and nested AGENTS files in deterministic order", () => {
		const cwd = path.join(tmp, "repo");
		const nested = path.join(cwd, "src", "feature");
		writeFile(path.join(cwd, "AGENTS.md"), "root agents");
		writeFile(path.join(cwd, "src", "AGENTS.md"), "src agents");
		writeFile(path.join(nested, "AGENTS.md"), "nested agents");

		const files = agentsContextTestApi.discoverForPaths(cwd, [
			path.join("src", "feature", "thing.ts"),
		]);
		expect(
			files.map((file) =>
				path.relative(tmp, file.path).replaceAll(path.sep, "/"),
			),
		).toEqual([
			"repo/AGENTS.md",
			"repo/src/AGENTS.md",
			"repo/src/feature/AGENTS.md",
		]);
	});

	it("uses CLAUDE.md only when AGENTS.md is absent in the same directory", () => {
		const cwd = path.join(tmp, "repo");
		writeFile(path.join(cwd, "AGENTS.md"), "root agents");
		writeFile(path.join(cwd, "CLAUDE.md"), "root fallback");
		writeFile(path.join(cwd, "src", "CLAUDE.md"), "src fallback");

		const files = agentsContextTestApi.discoverForPaths(cwd, ["src/file.ts"]);
		expect(files.map((file) => path.basename(file.path))).toEqual([
			"AGENTS.md",
			"CLAUDE.md",
		]);
		expect(formatAgentsContextStatus()).toContain(
			"CLAUDE.md skipped: AGENTS.md exists",
		);
	});

	it("does not interpret instruction imports or compatibility filenames", () => {
		const cwd = path.join(tmp, "repo");
		writeFile(path.join(cwd, "AGENTS.md"), "root agents\n@docs/extra.md");
		writeFile(path.join(cwd, "docs", "extra.md"), "imported content");
		writeFile(path.join(cwd, "src", "AGENT.md"), "compat agent");
		writeFile(path.join(cwd, "src", "AGENTS.override.md"), "override agent");

		const files = agentsContextTestApi.discoverForPaths(cwd, ["src/file.ts"]);
		expect(files.map((file) => path.basename(file.path))).toEqual(["AGENTS.md"]);
		expect(files[0].content).toContain("@docs/extra.md");
	});

	it("does not persist discovered instructions with sendMessage", async () => {
		const cwd = path.join(tmp, "repo");
		writeFile(path.join(cwd, "AGENTS.md"), "root agents");
		const pi = createMockPi();
		registerAgentsContext(pi);
		await pi._getHook("tool_call")[0].handler(
			{ toolName: "read", input: { path: "file.ts" } },
			createMockCtx({ cwd }),
		);
		expect(pi.sendMessage).not.toHaveBeenCalled();
	});

	it("skips discovery for tools without target paths", async () => {
		const cwd = path.join(tmp, "repo");
		writeFile(path.join(cwd, "AGENTS.md"), "root agents");
		const pi = createMockPi();
		registerAgentsContext(pi);
		const ctx = createMockCtx({ cwd });

		await pi._getHook("tool_call")[0].handler(
			{ toolName: "bash", input: { command: "pwd" } },
			ctx,
		);
		const result = await pi._getHook("context")[0].handler(
			{ messages: [] },
			ctx,
		);
		expect(result.messages).toEqual([]);
	});

	it("filters historical reports and injects one current ephemeral message", async () => {
		const cwd = path.join(tmp, "repo");
		writeFile(path.join(cwd, "AGENTS.md"), "root agents");
		const pi = createMockPi();
		registerAgentsContext(pi);
		const ctx = createMockCtx({ cwd });
		await pi._getHook("tool_call")[0].handler(
			{ toolName: "read", input: { path: "a.ts" } },
			ctx,
		);
		const result = await pi._getHook("context")[0].handler(
			{
				messages: [
					{ role: "user", content: "keep" },
					{
						role: "custom",
						customType: "agents-context-report",
						content: "old",
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
		expect(result.messages.at(-1).content).not.toContain("old");
	});

	it("unions sibling target scopes for the current user turn", async () => {
		const cwd = path.join(tmp, "repo");
		writeFile(path.join(cwd, "AGENTS.md"), "root agents");
		writeFile(path.join(cwd, "src", "AGENTS.md"), "src agents");
		writeFile(path.join(cwd, "test", "AGENTS.md"), "test agents");
		const pi = createMockPi();
		registerAgentsContext(pi);
		const ctx = createMockCtx({ cwd });
		const toolHook = pi._getHook("tool_call")[0].handler;

		await toolHook({ toolName: "read", input: { path: "src/file.ts" } }, ctx);
		await toolHook({ toolName: "read", input: { path: "test/file.ts" } }, ctx);
		const result = await pi._getHook("context")[0].handler(
			{ messages: [] },
			ctx,
		);
		expect(result.messages[0].content).toContain("src agents");
		expect(result.messages[0].content).toContain("test agents");
	});
});

describe("agents-context mutation deferral", () => {
	beforeEach(setupAgentsContextTest);
	afterEach(cleanupAgentsContextTest);

	it("relies on native base context and blocks only new nested scope", async () => {
		const cwd = path.join(tmp, "repo");
		const rootInstructions = path.join(cwd, "AGENTS.md");
		writeFile(rootInstructions, "root agents");
		writeFile(path.join(cwd, "src", "AGENTS.md"), "src agents");
		const pi = createMockPi();
		registerAgentsContext(pi);
		const ctx = createMockCtx({ cwd });
		await pi._getHook("before_agent_start")[0].handler(
			{
				systemPrompt: "base\nroot agents",
				systemPromptOptions: {
					contextFiles: [{ path: rootInstructions, content: "root agents" }],
				},
			},
			ctx,
		);
		const toolHook = pi._getHook("tool_call")[0].handler;
		await expect(
			toolHook({ toolName: "edit", input: { path: "root.ts" } }, ctx),
		).resolves.toBeUndefined();
		await expect(
			toolHook({ toolName: "edit", input: { path: "src/file.ts" } }, ctx),
		).resolves.toMatchObject({ block: true });

		const retryContext = await pi._getHook("context")[0].handler(
			{ messages: [] },
			ctx,
		);
		expect(retryContext.messages[0].content).toContain("src agents");
		expect(retryContext.messages[0].content).not.toContain("root agents");
	});

	it("defers new context once without a visible error result", async () => {
		const cwd = path.join(tmp, "repo");
		writeFile(path.join(cwd, "AGENTS.md"), "root agents");
		writeFile(path.join(cwd, "src", "AGENTS.md"), "src agents");
		const pi = createMockPi();
		registerAgentsContext(pi);
		const ctx = createMockCtx({ cwd });
		const event = {
			toolCallId: "deferred-edit",
			toolName: "edit",
			input: { path: "src/file.ts" },
		};
		const toolHook = pi._getHook("tool_call")[0].handler;
		const blocked = await toolHook(event, ctx);
		expect(blocked).toEqual({ block: true });
		await expect(
			pi._getHook("tool_result")[0].handler(
				{
					...event,
					content: [{ type: "text", text: "Tool execution was blocked" }],
					isError: true,
				},
				ctx,
			),
		).resolves.toEqual({ content: [], details: {}, isError: false });
		const retryContext = await pi._getHook("context")[0].handler(
			{ messages: [] },
			ctx,
		);
		expect(retryContext.messages[0].content).toContain(
			"retry the deferred mutating tool call",
		);
		await expect(toolHook(event, ctx)).resolves.toBeUndefined();
	});

	it("blocks again when nested instruction content changes", async () => {
		const cwd = path.join(tmp, "repo");
		const instructionPath = path.join(cwd, "src", "AGENTS.md");
		writeFile(path.join(cwd, "AGENTS.md"), "root agents");
		writeFile(instructionPath, "first version");
		const pi = createMockPi();
		registerAgentsContext(pi);
		const ctx = createMockCtx({ cwd });
		const event = { toolName: "edit", input: { path: "src/file.ts" } };
		const toolHook = pi._getHook("tool_call")[0].handler;

		await expect(toolHook(event, ctx)).resolves.toMatchObject({ block: true });
		await expect(toolHook(event, ctx)).resolves.toBeUndefined();
		writeFile(instructionPath, "second version");
		await expect(toolHook(event, ctx)).resolves.toMatchObject({ block: true });
	});

	it("does not register an inspection command or alter expertise tools", async () => {
		const pi = createMockPi();
		registerAgentsContext(pi);
		const event = {
			systemPrompt: "base",
			systemPromptOptions: { contextFiles: [] },
			tools: [{ name: "read_expertise" }, { name: "bash" }],
		};
		await pi._getHook("before_agent_start")[0].handler(
			event,
			createMockCtx({ cwd: tmp }),
		);
		expect(event.tools).toEqual([
			{ name: "read_expertise" },
			{ name: "bash" },
		]);
		expect(pi._commands).toEqual([]);
	});
});

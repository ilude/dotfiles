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

async function completeTool(
	pi: ReturnType<typeof createMockPi>,
	ctx: ReturnType<typeof createMockCtx>,
	event: {
		toolCallId?: string;
		toolName: string;
		input: Record<string, unknown>;
	},
) {
	await expect(
		pi._getHook("tool_call")[0].handler(event, ctx),
	).resolves.toBeUndefined();
	await pi._getHook("tool_result")[0].handler(
		{
			...event,
			content: [{ type: "text", text: "ok" }],
			isError: false,
		},
		ctx,
	);
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

	it("ignores CLAUDE.md when AGENTS.md is absent in the same directory", () => {
		const cwd = path.join(tmp, "repo");
		writeFile(path.join(cwd, "AGENTS.md"), "root agents");
		writeFile(path.join(cwd, "CLAUDE.md"), "root claude");
		writeFile(path.join(cwd, "src", "CLAUDE.md"), "src claude");

		const files = agentsContextTestApi.discoverForPaths(cwd, ["src/file.ts"]);
		expect(files.map((file) => path.basename(file.path))).toEqual(["AGENTS.md"]);
		expect(files[0].content).toBe("root agents");
	});

	it("injects nothing for a CLAUDE.md-only target", async () => {
		const cwd = path.join(tmp, "repo");
		writeFile(path.join(cwd, "CLAUDE.md"), "root claude");
		writeFile(path.join(cwd, "src", "CLAUDE.md"), "src claude");
		const pi = createMockPi();
		registerAgentsContext(pi);
		const ctx = createMockCtx({ cwd });

		await completeTool(
			pi,
			ctx,
			{ toolName: "read", input: { path: "src/file.ts" } },
		);
		const result = await pi._getHook("context")[0].handler(
			{ messages: [] },
			ctx,
		);
		expect(result.messages).toEqual([]);
	});

	it("does not inject an explicitly read CLAUDE.md", async () => {
		const cwd = path.join(tmp, "repo");
		writeFile(path.join(cwd, "src", "CLAUDE.md"), "src claude");
		const pi = createMockPi();
		registerAgentsContext(pi);
		const ctx = createMockCtx({ cwd });

		await completeTool(
			pi,
			ctx,
			{ toolName: "read", input: { path: "src/CLAUDE.md" } },
		);
		const result = await pi._getHook("context")[0].handler(
			{ messages: [] },
			ctx,
		);
		expect(result.messages).toEqual([]);
	});

	it("removes native CLAUDE.md context while preserving AGENTS.md", async () => {
		const cwd = path.join(tmp, "repo");
		const agentsPath = path.join(cwd, "AGENTS.md");
		const claudePath = path.join(cwd, "src", "CLAUDE.md");
		const contextFiles = [
			{ path: agentsPath, content: "root agents" },
			{ path: claudePath, content: "src claude" },
		];
		const event = {
			systemPrompt: [
				"base",
				"",
				"<project_context>",
				"",
				"Project-specific instructions and guidelines:",
				"",
				`<project_instructions path="${agentsPath}">`,
				"root agents",
				"</project_instructions>",
				"",
				`<project_instructions path="${claudePath}">`,
				"src claude",
				"</project_instructions>",
				"",
				"</project_context>",
				"",
			].join("\n"),
			systemPromptOptions: { contextFiles },
		};
		const pi = createMockPi();
		registerAgentsContext(pi);
		const result = await pi._getHook("before_agent_start")[0].handler(
			event,
			createMockCtx({ cwd }),
		);

		expect(result?.systemPrompt).toContain("root agents");
		expect(result?.systemPrompt).not.toContain("src claude");
		expect(event.systemPromptOptions.contextFiles).toEqual([contextFiles[0]]);
	});

	it("removes an empty native project context after filtering CLAUDE.md", async () => {
		const cwd = path.join(tmp, "repo");
		const claudePath = path.join(cwd, "CLAUDE.md");
		const event = {
			systemPrompt: [
				"base",
				"",
				"<project_context>",
				"",
				"Project-specific instructions and guidelines:",
				"",
				`<project_instructions path="${claudePath}">`,
				"root claude",
				"</project_instructions>",
				"",
				"</project_context>",
				"",
			].join("\n"),
			systemPromptOptions: {
				contextFiles: [{ path: claudePath, content: "root claude" }],
			},
		};
		const pi = createMockPi();
		registerAgentsContext(pi);
		const result = await pi._getHook("before_agent_start")[0].handler(
			event,
			createMockCtx({ cwd }),
		);

		expect(result?.systemPrompt).toBe("base");
		expect(event.systemPromptOptions.contextFiles).toEqual([]);
	});

	it("enforces per-file byte caps for multibyte instructions", () => {
		const cwd = path.join(tmp, "repo");
		writeFile(path.join(cwd, "AGENTS.md"), "e".repeat(10));
		writeFile(path.join(cwd, "src", "AGENTS.md"), "\u00e9".repeat(20_000));

		const files = agentsContextTestApi.discoverForPaths(cwd, ["src/file.ts"]);
		const nested = files.find((file) =>
			file.path.endsWith(path.join("src", "AGENTS.md")),
		);
		expect(nested).toBeDefined();
		expect(nested!.bytes).toBeLessThanOrEqual(32 * 1024);
		expect(Buffer.byteLength(nested!.content, "utf8")).toBe(nested!.bytes);
		expect(nested!.truncated).toBe(true);
	});

	it("does not interpret instruction imports or compatibility filenames", () => {
		const cwd = path.join(tmp, "repo");
		writeFile(path.join(cwd, "AGENTS.md"), "root agents\n@docs/extra.md");
		writeFile(path.join(cwd, "docs", "extra.md"), "imported content");
		writeFile(path.join(cwd, "src", "AGENT.md"), "compat agent");

		const files = agentsContextTestApi.discoverForPaths(cwd, ["src/file.ts"]);
		expect(files.map((file) => path.basename(file.path))).toEqual(["AGENTS.md"]);
		expect(files[0].content).toContain("@docs/extra.md");
	});

	it("uses AGENTS.override.md instead of AGENTS.md in each directory", () => {
		const cwd = path.join(tmp, "repo");
		writeFile(path.join(cwd, "AGENTS.md"), "root agents");
		writeFile(path.join(cwd, "src", "AGENTS.md"), "src agents");
		writeFile(path.join(cwd, "src", "AGENTS.override.md"), "src override");
		writeFile(path.join(cwd, "src", "feature", "AGENTS.md"), "feature agents");
		writeFile(
			path.join(cwd, "src", "feature", "AGENTS.override.md"),
			"feature override",
		);

		const files = agentsContextTestApi.discoverForPaths(cwd, [
			"src/feature/file.ts",
		]);
		expect(
			files.map((file) => path.relative(cwd, file.path).replaceAll(path.sep, "/")),
		).toEqual([
			"AGENTS.md",
			"src/AGENTS.override.md",
			"src/feature/AGENTS.override.md",
		]);
		expect(files.map((file) => file.content)).toEqual([
			"root agents",
			"src override",
			"feature override",
		]);
	});

	it("deduplicates nested instructions that match native context content", async () => {
		const cwd = path.join(tmp, "repo");
		const nativePath = path.join(tmp, "global", "AGENTS.md");
		writeFile(path.join(cwd, "AGENTS.md"), "shared agents");
		writeFile(nativePath, "shared agents");
		const pi = createMockPi();
		registerAgentsContext(pi);
		const ctx = createMockCtx({ cwd });
		await pi._getHook("before_agent_start")[0].handler(
			{
				systemPrompt: "base",
				systemPromptOptions: {
					contextFiles: [{ path: nativePath, content: "shared agents" }],
				},
			},
			ctx,
		);
		await completeTool(
			pi,
			ctx,
			{ toolName: "read", input: { path: "file.ts" } },
		);
		const result = await pi._getHook("context")[0].handler(
			{ messages: [] },
			ctx,
		);
		expect(result.messages).toEqual([]);
		expect(formatAgentsContextStatus()).toContain(
			"skipped: duplicate instruction content",
		);
	});

	it("does not inject a selected AGENTS.override.md or hardlink alias merely because it was read", async () => {
		const cwd = path.join(tmp, "repo");
		const rootInstruction = path.join(cwd, "AGENTS.override.md");
		const nestedInstruction = path.join(cwd, "src", "AGENTS.override.md");
		writeFile(rootInstruction, "root override");
		mkdirp(path.dirname(nestedInstruction));
		fs.linkSync(rootInstruction, nestedInstruction);
		const pi = createMockPi();
		registerAgentsContext(pi);
		const ctx = createMockCtx({ cwd });
		await completeTool(
			pi,
			ctx,
			{ toolName: "read", input: { path: "src/AGENTS.override.md" } },
		);
		const result = await pi._getHook("context")[0].handler(
			{ messages: [] },
			ctx,
		);
		expect(result.messages).toEqual([]);
		expect(formatAgentsContextStatus()).toContain(
			"skipped: matches read instruction target",
		);
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

	it("does not defer a mutation after the same nested context was delivered", async () => {
		const cwd = path.join(tmp, "repo");
		writeFile(path.join(cwd, "AGENTS.md"), "root agents");
		writeFile(path.join(cwd, "src", "AGENTS.md"), "src agents");
		const pi = createMockPi();
		registerAgentsContext(pi);
		const ctx = createMockCtx({ cwd });
		const toolHook = pi._getHook("tool_call")[0].handler;

		writeFile(path.join(cwd, "src", "file.ts"), "original");
		await completeTool(
			pi,
			ctx,
			{ toolName: "read", input: { path: "src/file.ts" } },
		);
		await pi._getHook("context")[0].handler({ messages: [] }, ctx);

		await expect(
			toolHook(
				{ toolCallId: "edit-after-read", toolName: "edit", input: { path: "src/file.ts" } },
				ctx,
			),
		).resolves.toBeUndefined();
	});

	it("replaces historical target context with the current target only", async () => {
		const cwd = path.join(tmp, "repo");
		writeFile(path.join(cwd, "AGENTS.md"), "root agents");
		writeFile(path.join(cwd, "src", "AGENTS.md"), "src agents");
		writeFile(path.join(cwd, "test", "AGENTS.md"), "test agents");
		const pi = createMockPi();
		registerAgentsContext(pi);
		const ctx = createMockCtx({ cwd });

		await completeTool(
			pi,
			ctx,
			{ toolName: "read", input: { path: "src/file.ts" } },
		);
		const first = await pi._getHook("context")[0].handler(
			{ messages: [] },
			ctx,
		);
		expect(first.messages[0].content).toContain("src agents");

		await completeTool(
			pi,
			ctx,
			{ toolName: "read", input: { path: "test/file.ts" } },
		);
		const result = await pi._getHook("context")[0].handler(
			{ messages: first.messages },
			ctx,
		);
		const reports = result.messages.filter(
			(message: Record<string, unknown>) =>
				message.customType === "agents-context-report",
		);
		expect(reports).toHaveLength(1);
		expect(reports[0].content).toContain("test agents");
		expect(reports[0].content).not.toContain("src agents");
	});
});

describe("agents-context mutation deferral", () => {
	beforeEach(setupAgentsContextTest);
	afterEach(cleanupAgentsContextTest);

	it("relies on native base context and defers only uninjected nested scope", async () => {
		const cwd = path.join(tmp, "repo");
		const rootInstructions = path.join(cwd, "AGENTS.md");
		writeFile(rootInstructions, "root agents");
		writeFile(path.join(cwd, "root.ts"), "root file");
		writeFile(path.join(cwd, "src", "AGENTS.md"), "src agents");
		writeFile(path.join(cwd, "src", "file.ts"), "src file");
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

	it("defers a direct new-file write with an explicit context reason", async () => {
		const cwd = path.join(tmp, "repo");
		writeFile(path.join(cwd, "AGENTS.md"), "root agents");
		writeFile(path.join(cwd, "src", "AGENTS.md"), "src agents");
		const pi = createMockPi();
		registerAgentsContext(pi);
		const ctx = createMockCtx({ cwd });
		const event = {
			toolCallId: "deferred-write",
			toolName: "write",
			input: { path: "src/file.ts", content: "new file" },
		};
		const toolHook = pi._getHook("tool_call")[0].handler;
		const blocked = await toolHook(event, ctx);
		expect(blocked).toEqual({
			block: true,
			reason:
				"Deferred while loading path-specific instructions. Apply them, then retry the mutation.",
		});
		const retryContext = await pi._getHook("context")[0].handler(
			{ messages: [] },
			ctx,
		);
		expect(retryContext.messages[0].content).toContain(
			"retry the deferred mutating tool call",
		);
		await expect(toolHook(event, ctx)).resolves.toBeUndefined();
	});

	it("defers a cross-repository mutation only once across automatic continuation", async () => {
		const repoA = path.join(tmp, "repo-a");
		const repoB = path.join(tmp, "repo-b");
		const repoAInstructions = path.join(repoA, "AGENTS.md");
		mkdirp(path.join(repoA, ".git"));
		mkdirp(path.join(repoB, ".git"));
		writeFile(repoAInstructions, "repo a agents");
		writeFile(path.join(repoA, "src", "AGENTS.md"), "repo a src agents");
		writeFile(path.join(repoB, "AGENTS.md"), "repo b agents");
		writeFile(path.join(repoB, "src", "AGENTS.md"), "repo b src agents");
		writeFile(path.join(repoB, "src", "file.ts"), "original");
		const pi = createMockPi();
		registerAgentsContext(pi);
		const ctx = createMockCtx({ cwd: repoA });
		const beforeAgentStart = pi._getHook("before_agent_start")[0].handler;
		const event = {
			toolCallId: "cross-repo-edit",
			toolName: "edit",
			input: {
				path: path.join(repoB, "src", "file.ts"),
				edits: [{ oldText: "original", newText: "updated" }],
			},
		};
		const nativeContext = {
			systemPrompt: "base\nrepo a agents",
			systemPromptOptions: {
				contextFiles: [
					{ path: repoAInstructions, content: "repo a agents" },
				],
			},
		};
		await beforeAgentStart(nativeContext, ctx);
		const toolHook = pi._getHook("tool_call")[0].handler;

		await expect(toolHook(event, ctx)).resolves.toMatchObject({ block: true });
		const retryContext = await pi._getHook("context")[0].handler(
			{ messages: [] },
			ctx,
		);
		expect(retryContext.messages[0].content).toContain("repo b agents");
		expect(retryContext.messages[0].content).toContain("repo b src agents");
		expect(retryContext.messages[0].content).not.toContain("repo a agents");

		await beforeAgentStart(nativeContext, ctx);
		await expect(toolHook(event, ctx)).resolves.toBeUndefined();
		await beforeAgentStart(nativeContext, ctx);
		await expect(toolHook(event, ctx)).resolves.toBeUndefined();

		writeFile(path.join(repoB, "src", "AGENTS.md"), "repo b src changed");
		await expect(toolHook(event, ctx)).resolves.toMatchObject({ block: true });

		await completeTool(
			pi,
			ctx,
			{ toolName: "read", input: { path: "src/file.ts" } },
		);
		const returnedContext = await pi._getHook("context")[0].handler(
			{ messages: retryContext.messages },
			ctx,
		);
		const reports = returnedContext.messages.filter(
			(message: Record<string, unknown>) =>
				message.customType === "agents-context-report",
		);
		expect(reports).toHaveLength(1);
		expect(reports[0].content).toContain("repo a src agents");
		expect(reports[0].content).not.toContain("repo b agents");
	});

	it("does not activate context after a failed read", async () => {
		const cwd = path.join(tmp, "repo");
		writeFile(path.join(cwd, "AGENTS.md"), "root agents");
		writeFile(path.join(cwd, "src", "AGENTS.md"), "src agents");
		writeFile(path.join(cwd, "src", "file.ts"), "original");
		const pi = createMockPi();
		registerAgentsContext(pi);
		const ctx = createMockCtx({ cwd });
		await pi._getHook("tool_result")[0].handler(
			{
				toolName: "read",
				input: { path: "src/file.ts" },
				content: [{ type: "text", text: "failed" }],
				isError: true,
			},
			ctx,
		);
		const result = await pi._getHook("context")[0].handler(
			{ messages: [] },
			ctx,
		);
		expect(result.messages).toEqual([]);
		const event = { toolName: "edit", input: { path: "src/file.ts" } };
		const toolHook = pi._getHook("tool_call")[0].handler;
		await expect(toolHook(event, ctx)).resolves.toEqual({
			block: true,
			reason:
				"Deferred while loading path-specific instructions. Apply them, then retry the mutation.",
		});
		const retryContext = await pi._getHook("context")[0].handler(
			{ messages: [] },
			ctx,
		);
		expect(retryContext.messages[0].content).toContain("src agents");
		await expect(toolHook(event, ctx)).resolves.toBeUndefined();
	});

	it("allows a new file after a successful directory-scoped access", async () => {
		const cwd = path.join(tmp, "repo");
		writeFile(path.join(cwd, "AGENTS.md"), "root agents");
		writeFile(path.join(cwd, "src", "AGENTS.md"), "src agents");
		const pi = createMockPi();
		registerAgentsContext(pi);
		const ctx = createMockCtx({ cwd });
		await completeTool(
			pi,
			ctx,
			{ toolName: "find", input: { path: "src", pattern: "*.ts" } },
		);
		const context = await pi._getHook("context")[0].handler(
			{ messages: [] },
			ctx,
		);
		expect(context.messages[0].content).toContain("src agents");
		await expect(
			pi._getHook("tool_call")[0].handler(
				{
					toolName: "write",
					input: { path: "src/new.ts", content: "new file" },
				},
				ctx,
			),
		).resolves.toBeUndefined();
	});

	it("blocks again when nested instruction content changes", async () => {
		const cwd = path.join(tmp, "repo");
		const instructionPath = path.join(cwd, "src", "AGENTS.md");
		writeFile(path.join(cwd, "AGENTS.md"), "root agents");
		writeFile(instructionPath, "first version");
		const pi = createMockPi();
		registerAgentsContext(pi);
		const ctx = createMockCtx({ cwd });
		const event = {
			toolName: "write",
			input: { path: "src/file.ts", content: "new file" },
		};
		const toolHook = pi._getHook("tool_call")[0].handler;

		await expect(toolHook(event, ctx)).resolves.toMatchObject({ block: true });
		await pi._getHook("context")[0].handler({ messages: [] }, ctx);
		await expect(toolHook(event, ctx)).resolves.toBeUndefined();
		writeFile(instructionPath, "second version");
		await expect(toolHook(event, ctx)).resolves.toMatchObject({ block: true });
	});

});

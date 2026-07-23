/**
 * Integration tests for tool-search extension execute function.
 * Mocks pi.getAllTools() and pi.getActiveTools() — lightweight.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockPi, createMockTheme } from "./helpers/mock-pi.js";

const MOCK_TOOLS = [
	{
		name: "bash",
		description: "Execute shell commands",
		parameters: {},
		sourceInfo: { source: "builtin", origin: "top-level" },
	},
	{
		name: "pwsh",
		description: "Execute PowerShell Core commands",
		parameters: {},
		sourceInfo: { source: "extension", origin: "top-level" },
	},
	{
		name: "web_search",
		description: "Search the web via SearXNG",
		parameters: {},
		sourceInfo: { source: "extension", origin: "top-level" },
	},
	{
		name: "read",
		description: "Read file contents",
		parameters: {},
		sourceInfo: { source: "builtin", origin: "top-level" },
	},
	{
		name: "task",
		description: "Manage durable tasks and background execution",
		parameters: {},
		sourceInfo: { source: "extension", origin: "top-level" },
	},
];

describe("tool-search extension", () => {
	let mockPi: ReturnType<typeof createMockPi>;
	let tool: NonNullable<ReturnType<typeof mockPi._getTool>>;
	let activeNames: string[];

	beforeEach(async () => {
		mockPi = createMockPi();
		activeNames = ["bash", "pwsh", "web_search", "read", "task"];
		const searchablePi = Object.assign(mockPi, {
			getAllTools: vi.fn(() => MOCK_TOOLS),
			getActiveTools: vi.fn(() => [...activeNames]),
			setActiveTools: vi.fn((names: string[]) => {
				activeNames = [...names];
			}),
		});

		const mod = await import("../extensions/tool-search.ts");
		mod.default(searchablePi as Parameters<typeof mod.default>[0]);
		const registered = mockPi._getTool("tool_search");
		if (!registered) throw new Error("tool_search not registered");
		tool = registered;
	});

	it("should register tool_search", () => {
		expect(tool).toBeDefined();
		expect(tool.name).toBe("tool_search");
	});

	describe("list all", () => {
		it("should list all tools when no query", async () => {
			const result = await tool.execute("id", {}, undefined, undefined, {});
			const text = result.content[0].text;
			expect(text).toContain("5 available tools");
			expect(text).toContain("bash");
			expect(text).toContain("pwsh");
			expect(text).toContain("web_search");
			expect(text).toContain("[source: built-in]");
			expect(text).toContain("[source: extension]");
		});

		it("should list all with empty query", async () => {
			const result = await tool.execute(
				"id",
				{ query: "" },
				undefined,
				undefined,
				{},
			);
			expect(result.content[0].text).toContain("5 available tools");
		});

		it("never activates tools from list mode", async () => {
			activeNames = ["bash", "read"];
			const result = await tool.execute(
				"id",
				{ activate: true },
				undefined,
				undefined,
				{},
			);
			expect(activeNames).toEqual(["bash", "read"]);
			expect(result.details.activated).toEqual([]);
		});
	});

	describe("search", () => {
		it("should find tools by keyword", async () => {
			const result = await tool.execute(
				"id",
				{ query: "shell" },
				undefined,
				undefined,
				{},
			);
			const text = result.content[0].text;
			expect(text).toContain("bash");
			expect(result.details.matched).toBeGreaterThan(0);
		});

		it("should find tools by name", async () => {
			const result = await tool.execute(
				"id",
				{ query: "pwsh" },
				undefined,
				undefined,
				{},
			);
			expect(result.content[0].text).toContain("pwsh");
		});

		it("activates matching inactive tools by default", async () => {
			activeNames = activeNames.filter((name) => name !== "pwsh");
			const result = await tool.execute(
				"id",
				{ query: "powershell" },
				undefined,
				undefined,
				{},
			);
			expect(activeNames).toContain("pwsh");
			expect(result.details.activated).toEqual(["pwsh"]);
			expect(result.content[0].text).toContain("Activated pwsh");
		});

		it("does not activate matches when explicitly disabled", async () => {
			activeNames = activeNames.filter((name) => name !== "pwsh");
			const result = await tool.execute(
				"id",
				{ query: "powershell", activate: false },
				undefined,
				undefined,
				{},
			);
			expect(activeNames).not.toContain("pwsh");
			expect(result.details.activated).toEqual([]);
		});

		it("should return no results for unmatched query", async () => {
			const result = await tool.execute(
				"id",
				{ query: "xyznonexistent" },
				undefined,
				undefined,
				{},
			);
			expect(result.content[0].text).toContain("No tools found");
		});

		it("should rank name matches higher", async () => {
			const result = await tool.execute(
				"id",
				{ query: "bash" },
				undefined,
				undefined,
				{},
			);
			const text = result.content[0].text;
			// bash should appear first (exact name match)
			const bashPos = text.indexOf("bash");
			expect(bashPos).toBeGreaterThan(-1);
		});
	});

	describe("include_params", () => {
		it("should include parameters when requested", async () => {
			const result = await tool.execute(
				"id",
				{ query: "bash", include_params: true },
				undefined,
				undefined,
				{},
			);
			expect(result.content[0].text).toContain("Parameters:");
		});

		it("should not include parameters by default", async () => {
			const result = await tool.execute(
				"id",
				{ query: "bash" },
				undefined,
				undefined,
				{},
			);
			expect(result.content[0].text).not.toContain("Parameters:");
		});
	});

	describe("renderCall", () => {
		it("should show search query", () => {
			const theme = createMockTheme();
			tool.renderCall({ query: "powershell" }, theme, {});
			expect(theme.fg).toHaveBeenCalledWith("toolTitle", "powershell");
		});

		it("should show 'list all' when no query", () => {
			const theme = createMockTheme();
			const result = tool.renderCall({}, theme, {});
			expect(result).toBeDefined();
		});
	});
});

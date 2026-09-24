import { describe, expect, it } from "vitest";
import registerToolSearch, { renderToolSearchResult, scoreTool } from "../extensions/tool-search";
import registerToolVisibility from "../extensions/tool-visibility";
import { createMockPi } from "./helpers/mock-pi";

function register(pi: ReturnType<typeof createMockPi>, name: string, description: string) {
	pi.registerTool({ name, description, parameters: { type: "object" }, execute: async () => ({ content: [] }) });
}

describe("tool_search", () => {
	const theme = { bold: (text: string) => text, fg: (_color: string, text: string) => text };

	it("renders a bounded collapsed summary while preserving expanded output", async () => {
		const pi = createMockPi();
		for (let index = 0; index < 8; index++) register(pi, `image_tool_${index}`, "Image capability");
		pi.setActiveTools([]);
		registerToolSearch(pi as never);
		const result = await pi._getTool("tool_search")!.execute!("id", { query: "image" }, undefined, undefined, {});
		const renderer = renderToolSearchResult as unknown as (result: Parameters<typeof renderToolSearchResult>[0], options: { expanded: boolean }, theme: Parameters<typeof renderToolSearchResult>[2], context: unknown) => { render(width: number): string[] };
		const collapsed = renderer(result, { expanded: false }, theme as Parameters<typeof renderToolSearchResult>[2], {}).render(400).join("\n");
		expect(collapsed).toContain('query "image" · 8 results · 8 activated');
		expect(collapsed).toContain("image_tool_0");
		expect(collapsed).toContain("image_tool_5");
		expect(collapsed).not.toContain("image_tool_6");
		expect(renderer(result, { expanded: true }, theme as Parameters<typeof renderToolSearchResult>[2], {}).render(400).map(line => line.trimEnd()).join("\n")).toBe(result.content[0].text);
	});

	it("scores names and descriptions", () => {
		expect(scoreTool({ name: "image_transform", description: "Crop an image" }, ["image"])).toBe(7);
	});

	it("lists without activating and includes parameters when requested", async () => {
		const pi = createMockPi();
		register(pi, "read", "Read files"); register(pi, "image_properties", "Read image dimensions, format, orientation, and metadata");
		pi.setActiveTools(["read"]); registerToolSearch(pi as never);
		const tool = pi._getTool("tool_search")!;
		const result = await tool.execute!("id", { include_params: true }, undefined, undefined, {});
		expect(result.details.activated).toEqual([]);
		expect(pi.getActiveTools()).toEqual(["read", "tool_search"]);
		expect(result.content[0].text).toContain("Parameters:");
	});

	it("activates all image matches, persists activation, and honors activate false", async () => {
		const pi = createMockPi();
		register(pi, "read", "Read files"); register(pi, "image_properties", "Read image dimensions, format, orientation, and metadata"); register(pi, "image_transform", "Crop resize rotate convert compress image");
		pi.setActiveTools(["read"]); registerToolSearch(pi as never);
		const tool = pi._getTool("tool_search")!;
		const dry = await tool.execute!("id", { query: "image", activate: false }, undefined, undefined, {});
		expect(dry.details.activated).toEqual([]);
		expect(pi.getActiveTools()).not.toContain("image_properties");
		const result = await tool.execute!("id", { query: "image crop metadata" }, undefined, undefined, {});
		expect(result.details.activated).toEqual(expect.arrayContaining(["image_properties", "image_transform"]));
		expect(pi.getActiveTools()).toEqual(expect.arrayContaining(["read", "tool_search", "image_properties", "image_transform"]));
		expect((await tool.execute!("id", { query: "image" }, undefined, undefined, {})).details.activated).toEqual([]);
	});

	it("activates deferred vault matches without activating communication tools", async () => {
		const pi = createMockPi();
		register(pi, "read", "Read files");
		register(pi, "onclave_vault_search", "Search YouTube transcripts and private vault content");
		register(pi, "onclave_vault_content", "Read a transcript or vault content");
		register(pi, "onclave_message", "Communicate with an independent Onclave instance");
		pi.setActiveTools(["read"]); registerToolSearch(pi as never);
		const result = await pi._getTool("tool_search")!.execute!("id", { query: "YouTube transcript" }, undefined, undefined, {});
		expect(result.details.activated).toEqual(["onclave_vault_search", "onclave_vault_content"]);
		expect(pi.getActiveTools()).toEqual(["read", "tool_search", "onclave_vault_search", "onclave_vault_content"]);
		expect(pi.getActiveTools()).not.toContain("onclave_message");
		expect(pi.exec).not.toHaveBeenCalled();
	});

	it("keeps root Herdr tools deferred until a descriptive search activates them", async () => {
		const pi = createMockPi();
		for (const [name, description] of [["read", "Read files"], ["herdr_agent", "Inspect and prompt Herdr agents"], ["herdr_layout", "Inspect Herdr panes and workspaces"], ["herdr_pane", "Read and recover Herdr panes"]]) register(pi, name, description);
		pi.setActiveTools(["read"]);
		registerToolSearch(pi as never);
		registerToolVisibility(pi as never);
		await pi._getHook("session_start")[0]!.handler({}, {});
		expect(pi.getActiveTools()).toEqual(["read", "tool_search"]);
		const result = await pi._getTool("tool_search")!.execute!("id", { query: "Herdr agent control" }, undefined, undefined, {});
		expect(result.details.activated).toEqual(["herdr_agent", "herdr_layout", "herdr_pane"]);
		expect(pi.getActiveTools()).toEqual(["read", "tool_search", "herdr_agent", "herdr_layout", "herdr_pane"]);
		const paneTools = await pi._getTool("tool_search")!.execute!("id", { query: "Herdr panes" }, undefined, undefined, {});
		expect(paneTools.details.activated).toEqual([]);
		expect(pi.getActiveTools()).toEqual(["read", "tool_search", "herdr_agent", "herdr_layout", "herdr_pane"]);
	});

	it.each([
		["Herdr agent control", ["herdr_agent", "herdr_layout", "herdr_pane"]],
		["read or prompt another agent", ["herdr_agent"]],
		["cross-agent pane recovery", ["herdr_layout", "herdr_pane"]],
	])("discovers deferred Herdr recovery with %s", async (query, expected) => {
		const pi = createMockPi();
		for (const [name, description] of [["herdr_agent", "Inspect and control any exact live agent: list, get, read, prompt, wait, send keys"], ["herdr_layout", "Inspect the complete connected Herdr pane layout"], ["herdr_pane", "Read, interrupt, or close an exact existing Herdr process pane for recovery"]]) register(pi, name, description);
		pi.setActiveTools([]); registerToolSearch(pi as never);
		const result = await pi._getTool("tool_search")!.execute!("id", { query }, undefined, undefined, {});
		expect(result.details.activated).toEqual(expect.arrayContaining(expected));
		for (const name of expected) expect(result.content[0].text).toContain(name);
	});

	it("returns a bounded no-match result", async () => {
		const pi = createMockPi(); register(pi, "read", "Read files"); registerToolSearch(pi as never);
		const result = await pi._getTool("tool_search")!.execute!("id", { query: "nonexistent-capability" }, undefined, undefined, {});
		expect(result.details).toMatchObject({ matched: 0, activated: [] });
	});
});

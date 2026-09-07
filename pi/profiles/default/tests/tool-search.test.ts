import { describe, expect, it } from "vitest";
import registerToolSearch, { scoreTool } from "../extensions/tool-search";
import { createMockPi } from "./helpers/mock-pi";

function register(pi: ReturnType<typeof createMockPi>, name: string, description: string) {
	pi.registerTool({ name, description, parameters: { type: "object" }, execute: async () => ({ content: [] }) });
}

describe("tool_search", () => {
	it("scores names and descriptions", () => {
		expect(scoreTool({ name: "image_transform", description: "Crop an image" }, ["image"])).toBe(7);
	});

	it("lists without activating and includes parameters when requested", async () => {
		const pi = createMockPi();
		register(pi, "read", "Read files"); register(pi, "image_inspect", "Inspect image metadata");
		pi.setActiveTools(["read"]); registerToolSearch(pi as never);
		const tool = pi._getTool("tool_search")!;
		const result = await tool.execute!("id", { include_params: true }, undefined, undefined, {});
		expect(result.details.activated).toEqual([]);
		expect(pi.getActiveTools()).toEqual(["read", "tool_search"]);
		expect(result.content[0].text).toContain("Parameters:");
	});

	it("activates all image matches, persists activation, and honors activate false", async () => {
		const pi = createMockPi();
		register(pi, "read", "Read files"); register(pi, "image_inspect", "Inspect image metadata"); register(pi, "image_transform", "Crop resize rotate convert compress image");
		pi.setActiveTools(["read"]); registerToolSearch(pi as never);
		const tool = pi._getTool("tool_search")!;
		const dry = await tool.execute!("id", { query: "image", activate: false }, undefined, undefined, {});
		expect(dry.details.activated).toEqual([]);
		expect(pi.getActiveTools()).not.toContain("image_inspect");
		const result = await tool.execute!("id", { query: "image crop metadata" }, undefined, undefined, {});
		expect(result.details.activated).toEqual(expect.arrayContaining(["image_inspect", "image_transform"]));
		expect(pi.getActiveTools()).toEqual(expect.arrayContaining(["read", "tool_search", "image_inspect", "image_transform"]));
		expect((await tool.execute!("id", { query: "image" }, undefined, undefined, {})).details.activated).toEqual([]);
	});

	it("returns a bounded no-match result", async () => {
		const pi = createMockPi(); register(pi, "read", "Read files"); registerToolSearch(pi as never);
		const result = await pi._getTool("tool_search")!.execute!("id", { query: "nonexistent-capability" }, undefined, undefined, {});
		expect(result.details).toMatchObject({ matched: 0, activated: [] });
	});
});

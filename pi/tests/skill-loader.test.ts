import { describe, expect, it } from "vitest";
import { createMockPi } from "./helpers/mock-pi.ts";
import { renderSkillBody } from "../extensions/skill-loader.js";

describe("renderSkillBody", () => {
	it("substitutes ${args} in the body", () => {
		expect(renderSkillBody("Run on ${args}.", "main")).toBe("Run on main.");
	});

	it("replaces multiple placeholders", () => {
		expect(renderSkillBody("a=${args} b=${args}", "x")).toBe("a=x b=x");
	});

	it("appends args when no placeholder is present", () => {
		expect(renderSkillBody("Plain body.", "topic")).toBe("Plain body.\n\nArgs: topic");
	});

	it("returns body unchanged when args is empty and no placeholder", () => {
		expect(renderSkillBody("Plain body.", "")).toBe("Plain body.");
	});

	it("trims args before substitution", () => {
		expect(renderSkillBody("X ${args} Y", "  hi  ")).toBe("X hi Y");
	});
});

describe("skill-loader registration", () => {
	it("registers a session_start hook and the /skills command", async () => {
		const pi = createMockPi();
		const mod = await import("../extensions/skill-loader.ts");
		mod.default(pi as any);
		expect(pi._getHook("session_start").length).toBeGreaterThan(0);
		const skillsCmd = pi._commands.find((c) => c.name === "skills");
		expect(skillsCmd).toBeDefined();
	});
});

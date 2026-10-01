import { describe, expect, it } from "vitest";
import { inverseToHighlight } from "../extensions/plain-edit-diff.ts";

const green = "\x1b[38;2;100;200;150m";

describe("inverseToHighlight", () => {
	it("renders changed words bold and brighter, then restores the line color", () => {
		expect(inverseToHighlight(`${green}+1 a \x1b[7mchanged\x1b[27m word\x1b[39m`)).toBe(
			`${green}+1 a \x1b[1;38;2;170;225;197mchanged\x1b[22;38;2;100;200;150m word\x1b[39m`,
		);
	});

	it("handles styles re-emitted together at a wrapped line start", () => {
		expect(inverseToHighlight("\x1b[7;38;2;100;200;150mrest\x1b[27m tail")).toBe(
			"\x1b[1;38;2;170;225;197mrest\x1b[22;38;2;100;200;150m tail",
		);
	});

	it("brightens basic colors and keeps other attributes and backgrounds", () => {
		expect(inverseToHighlight("\x1b[31m-\x1b[3;7;48;5;7mx\x1b[27my")).toBe("\x1b[31m-\x1b[3;48;5;7;1;91mx\x1b[22;31my");
	});
});

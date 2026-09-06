import { describe, expect, it } from "vitest";
import {
	enforcedToolsAreReadOnly,
	toolCapability,
} from "../lib/tool-capabilities.ts";

describe("tool capability declarations", () => {
	it("derives read-only execution from the launcher-enforced tools", () => {
		expect(enforcedToolsAreReadOnly(["read", "grep", "find", "ls"])).toBe(true);
		expect(enforcedToolsAreReadOnly(["read", "bash"])).toBe(false);
		expect(enforcedToolsAreReadOnly(["read", "edit"])).toBe(false);
	});

	it("treats default and undeclared tool sets as mutating", () => {
		expect(enforcedToolsAreReadOnly(undefined)).toBe(false);
		expect(enforcedToolsAreReadOnly([])).toBe(false);
		expect(toolCapability("custom_unknown")).toBe("mutate");
	});
});

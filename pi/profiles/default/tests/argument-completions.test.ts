import { describe, expect, it } from "vitest";
import { completePartialArgument } from "../lib/argument-completions.ts";

const options = ["low", "medium", "high", "xhigh"];

describe("argument completions", () => {
	it.each(["", " ", "high", "HIGH", "high "])("does not intercept submission for %j", (prefix) => {
		expect(completePartialArgument(prefix, options)).toBeNull();
	});

	it.each(["h", "hi", "HIG"])("completes partial arguments for %j", (prefix) => {
		expect(completePartialArgument(prefix, options)).toEqual([{ value: "high", label: "high" }]);
	});

	it("returns all matching partial arguments", () => {
		expect(completePartialArgument("m", ["medium", "max", "minimal"])).toEqual([
			{ value: "medium", label: "medium" },
			{ value: "max", label: "max" },
			{ value: "minimal", label: "minimal" },
		]);
	});
});

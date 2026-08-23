import { describe, expect, it } from "vitest";
import {
	appendRuntimeContext,
	boundRuntimeContext,
	runtimeContextTestApi,
} from "../lib/runtime-context.ts";

describe("dynamic runtime context assembly", () => {
	it("appends bounded context after stable instructions and replaces its section", () => {
		const first = appendRuntimeContext("stable instructions", "task", "first task");
		const second = appendRuntimeContext(first, "task", "second task");

		expect(second.indexOf("stable instructions")).toBeLessThan(
			second.indexOf("second task"),
		);
		expect(second).not.toContain("first task");
		expect(second.match(/pi-runtime-context:task/g)).toHaveLength(1);
	});

	it("bounds oversized dynamic content without changing stable instructions", () => {
		const context = boundRuntimeContext("x".repeat(runtimeContextTestApi.RUNTIME_CONTEXT_MAX_CHARS + 100));
		const assembled = appendRuntimeContext("stable", "goal", context);

		expect(assembled).toContain("stable");
		expect(assembled).toContain("[dynamic context truncated]");
		expect(assembled.length).toBeLessThan(9_000);
	});

	it("keeps independently keyed dynamic sections instead of duplicating them", () => {
		const assembled = appendRuntimeContext(
			appendRuntimeContext("stable", "tasks", "task context"),
			"goal",
			"goal context",
		);

		expect(assembled).toContain("task context");
		expect(assembled).toContain("goal context");
		expect(assembled.match(/pi-runtime-context:/g)).toHaveLength(2);
	});
});

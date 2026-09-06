import { describe, expect, it } from "vitest";
import {
	boundRuntimeContext,
	replaceRuntimeContext,
	runtimeContextMessage,
	runtimeContextTestApi,
} from "../lib/runtime-context.ts";

describe("dynamic runtime context assembly", () => {
	it("replaces one owning hidden message with the current bounded context", () => {
		const first = runtimeContextMessage("task", "first task");
		const second = replaceRuntimeContext(
			[first as Record<string, unknown>],
			"task",
			"second task",
		);

		expect(second).toHaveLength(1);
		expect(second[0].content).toContain("second task");
		expect(second[0].content).not.toContain("first task");
		expect(second[0].content.match(/pi-runtime-context:task/g)).toHaveLength(1);
	});

	it("bounds oversized dynamic content deterministically", () => {
		const context = boundRuntimeContext(
			"x".repeat(runtimeContextTestApi.RUNTIME_CONTEXT_MAX_CHARS + 100),
		);
		const assembled = runtimeContextMessage("goal", context);

		expect(assembled?.content).toContain("[dynamic context truncated]");
		expect(assembled?.content.length).toBeLessThan(9_000);
	});

	it("keeps independently keyed custom context composed", () => {
		const assembled = replaceRuntimeContext(
			replaceRuntimeContext(
				[{ role: "custom", customType: "test-context", content: "memory" }],
				"tasks",
				"task context",
			),
			"goal",
			"goal context",
		);

		expect(assembled.map((message) => message.content).join("\n")).toContain("memory");
		expect(assembled.map((message) => message.content).join("\n")).toContain("task context");
		expect(assembled.map((message) => message.content).join("\n")).toContain("goal context");
		expect(assembled.filter((message) => message.customType === "pi-runtime-context")).toHaveLength(2);
	});

	it("removes a cleared context without disturbing other custom messages", () => {
		const messages = replaceRuntimeContext([], "goal", "current goal");
		const cleared = replaceRuntimeContext(
			[...messages, { role: "custom", customType: "test-context", content: "memory" }],
			"goal",
			undefined,
		);
		expect(cleared).toHaveLength(1);
		expect(cleared[0].customType).toBe("test-context");
	});
});

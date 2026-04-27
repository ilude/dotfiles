import { describe, expect, it } from "vitest";
import {
	isKnownPiHookEvent,
	PI_HOOK_EVENTS,
	validateHookConfig,
} from "../lib/hook-schema.js";

describe("PI_HOOK_EVENTS", () => {
	it("includes the documented runtime events", () => {
		expect(new Set(PI_HOOK_EVENTS)).toEqual(
			new Set([
				"tool_call",
				"tool_result",
				"session_start",
				"session_shutdown",
				"input",
				"before_agent_start",
			]),
		);
	});
});

describe("isKnownPiHookEvent", () => {
	it("returns true for runtime events", () => {
		expect(isKnownPiHookEvent("tool_call")).toBe(true);
		expect(isKnownPiHookEvent("session_start")).toBe(true);
	});

	it("returns false for unknown events", () => {
		expect(isKnownPiHookEvent("PreToolUse")).toBe(false);
		expect(isKnownPiHookEvent("")).toBe(false);
	});
});

describe("validateHookConfig", () => {
	it("returns ok and empty groups for null/undefined input", () => {
		expect(validateHookConfig(null).ok).toBe(true);
		expect(validateHookConfig(undefined).ok).toBe(true);
		expect(validateHookConfig({}).ok).toBe(true);
	});

	it("rejects non-object input with an error", () => {
		const result = validateHookConfig("not a config");
		expect(result.ok).toBe(false);
		expect(result.issues[0].level).toBe("error");
	});

	it("rejects hooks that is not an array", () => {
		const result = validateHookConfig({ hooks: "oops" });
		expect(result.ok).toBe(false);
		expect(result.issues.some((i) => i.path === "hooks")).toBe(true);
	});

	it("validates a minimal valid config", () => {
		const result = validateHookConfig({
			hooks: [
				{
					event: "tool_call",
					hooks: [{ type: "command", command: "echo hi" }],
				},
			],
		});
		expect(result.ok).toBe(true);
		expect(result.groups.length).toBe(1);
		expect(result.groups[0].event).toBe("tool_call");
		expect(result.groups[0].hooks[0].command).toBe("echo hi");
	});

	it("warns on unknown event but still parses the group", () => {
		const result = validateHookConfig({
			hooks: [
				{
					event: "MadeUpEvent",
					hooks: [{ type: "command", command: "echo" }],
				},
			],
		});
		expect(result.ok).toBe(true);
		expect(result.issues.some((i) => i.level === "warning" && i.path.endsWith(".event"))).toBe(true);
		expect(result.groups.length).toBe(1);
	});

	it("rejects a group with empty hooks array", () => {
		const result = validateHookConfig({
			hooks: [{ event: "tool_call", hooks: [] }],
		});
		expect(result.ok).toBe(false);
		expect(result.issues.some((i) => i.path.endsWith(".hooks"))).toBe(true);
	});

	it("rejects a hook with bad type", () => {
		const result = validateHookConfig({
			hooks: [
				{
					event: "tool_call",
					hooks: [{ type: "shell", command: "echo" }],
				},
			],
		});
		expect(result.ok).toBe(false);
		expect(result.issues.some((i) => i.path.endsWith(".type"))).toBe(true);
	});

	it("rejects a hook with missing command", () => {
		const result = validateHookConfig({
			hooks: [
				{
					event: "tool_call",
					hooks: [{ type: "command" }],
				},
			],
		});
		expect(result.ok).toBe(false);
		expect(result.issues.some((i) => i.path.endsWith(".command"))).toBe(true);
	});

	it("rejects negative timeout", () => {
		const result = validateHookConfig({
			hooks: [
				{
					event: "tool_call",
					hooks: [{ type: "command", command: "x", timeout: -5 }],
				},
			],
		});
		expect(result.ok).toBe(false);
		expect(result.issues.some((i) => i.path.endsWith(".timeout"))).toBe(true);
	});

	it("warns on non-boolean async but does not fail", () => {
		const result = validateHookConfig({
			hooks: [
				{
					event: "tool_call",
					hooks: [{ type: "command", command: "x", async: "yes" }],
				},
			],
		});
		expect(result.ok).toBe(true);
		expect(result.issues.some((i) => i.level === "warning" && i.path.endsWith(".async"))).toBe(
			true,
		);
		expect(result.groups[0].hooks[0].async).toBeUndefined();
	});

	it("preserves matcher and optional fields", () => {
		const result = validateHookConfig({
			hooks: [
				{
					event: "tool_call",
					matcher: "Bash",
					hooks: [
						{
							type: "command",
							command: "echo",
							if: "tool == 'bash'",
							timeout: 1000,
							async: true,
							env: { FOO: "bar", BAZ: "1" },
						},
					],
				},
			],
		});
		expect(result.ok).toBe(true);
		expect(result.groups[0].matcher).toBe("Bash");
		const entry = result.groups[0].hooks[0];
		expect(entry.if).toBe("tool == 'bash'");
		expect(entry.timeout).toBe(1000);
		expect(entry.async).toBe(true);
		expect(entry.env).toEqual({ FOO: "bar", BAZ: "1" });
	});

	it("strips non-string env values with a warning", () => {
		const result = validateHookConfig({
			hooks: [
				{
					event: "tool_call",
					hooks: [
						{
							type: "command",
							command: "x",
							env: { GOOD: "ok", BAD: 42 },
						},
					],
				},
			],
		});
		expect(result.ok).toBe(true);
		expect(result.issues.some((i) => i.level === "warning" && i.path.includes("env.BAD"))).toBe(
			true,
		);
		expect(result.groups[0].hooks[0].env).toEqual({ GOOD: "ok" });
	});
});

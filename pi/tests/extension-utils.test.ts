import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
	canonicalize,
	formatToolError,
	getAgentDir,
	getMultiTeamDir,
	uiNotify,
} from "../lib/extension-utils.ts";

describe("getAgentDir", () => {
	it("returns ~/.pi/agent", () => {
		expect(getAgentDir()).toBe(path.join(os.homedir(), ".pi", "agent"));
	});
});

describe("getMultiTeamDir", () => {
	it("respects PI_MULTI_TEAM_DIR env override", () => {
		const previous = process.env.PI_MULTI_TEAM_DIR;
		try {
			process.env.PI_MULTI_TEAM_DIR = "/tmp/explicit-multi-team";
			expect(getMultiTeamDir()).toBe("/tmp/explicit-multi-team");
		} finally {
			if (previous === undefined) delete process.env.PI_MULTI_TEAM_DIR;
			else process.env.PI_MULTI_TEAM_DIR = previous;
		}
	});

	it("returns the agent-local multi-team dir or the dotfiles default when no override is set", () => {
		const previous = process.env.PI_MULTI_TEAM_DIR;
		try {
			delete process.env.PI_MULTI_TEAM_DIR;
			const result = getMultiTeamDir();
			const agentLocal = path.join(os.homedir(), ".pi", "agent", "multi-team");
			const dotfilesDefault = path.join(os.homedir(), ".dotfiles", "pi", "multi-team");
			expect([agentLocal, dotfilesDefault]).toContain(result);
		} finally {
			if (previous !== undefined) process.env.PI_MULTI_TEAM_DIR = previous;
		}
	});
});

describe("canonicalize", () => {
	it("rejects paths containing NUL bytes", () => {
		expect(() => canonicalize("foo\0bar")).toThrow(TypeError);
	});

	it("expands a leading ~/ to the user home directory", () => {
		const result = canonicalize("~/.config/pi");
		expect(result.startsWith(os.homedir())).toBe(true);
		expect(result.includes("~")).toBe(false);
	});

	it("returns an absolute path when given a relative path", () => {
		const result = canonicalize("./somefile-that-does-not-exist", "/tmp");
		expect(path.isAbsolute(result)).toBe(true);
	});

	it("normalizes redundant segments for non-existent paths", () => {
		const result = canonicalize("/tmp/a/../b/c");
		expect(result).toBe(path.normalize("/tmp/b/c"));
	});

	it("throws TypeError for non-string inputs", () => {
		// @ts-expect-error -- intentional bad input
		expect(() => canonicalize(undefined)).toThrow(TypeError);
	});
});

describe("formatToolError", () => {
	it("returns a tool result with isError true and a text content block", () => {
		const result = formatToolError("something went wrong");
		expect(result.isError).toBe(true);
		expect(result.content).toEqual([{ type: "text", text: "something went wrong" }]);
		expect(result.details).toBeUndefined();
	});

	it("includes opts.details when supplied", () => {
		const details = { mode: "select", reason: "no options" };
		const result = formatToolError("missing options", { details });
		expect(result.details).toEqual(details);
	});
});

describe("uiNotify", () => {
	it("calls ctx.ui.notify with the message and level", () => {
		const calls: Array<{ message: string; level?: string }> = [];
		const ctx = {
			ui: {
				notify: (message: string, level?: string) => {
					calls.push({ message, level });
				},
			},
		};
		uiNotify(ctx, "info", "hello");
		expect(calls).toEqual([{ message: "hello", level: "info" }]);
	});

	it("prefixes the message when opts.prefix is provided", () => {
		const calls: Array<{ message: string; level?: string }> = [];
		const ctx = {
			ui: {
				notify: (message: string, level?: string) => {
					calls.push({ message, level });
				},
			},
		};
		uiNotify(ctx, "warning", "watch out", { prefix: "damage-control" });
		expect(calls).toEqual([
			{ message: "[damage-control] watch out", level: "warning" },
		]);
	});

	it("falls back to console output when no UI is available", () => {
		const originalWarn = console.warn;
		const captured: string[] = [];
		console.warn = (msg: string) => captured.push(msg);
		try {
			uiNotify({}, "warning", "no ui here", { prefix: "test" });
			expect(captured).toEqual(["[test] no ui here"]);
		} finally {
			console.warn = originalWarn;
		}
	});
});

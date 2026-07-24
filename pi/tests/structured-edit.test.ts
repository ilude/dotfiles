import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import structuredEditExtension, {
	applyStructuredOperations,
	type Operation,
} from "../extensions/structured-edit.ts";

type ToolResult = { isError?: boolean };

class MockPi {
	tools: unknown[] = [];
	registerTool(tool: unknown) {
		this.tools.push(tool);
	}
}
function repo() {
	const dir = mkdtempSync(path.join(tmpdir(), "structured-edit-"));
	execFileSync("git", ["init"], { cwd: dir, stdio: "ignore" });
	return dir;
}
function tool() {
	const pi = new MockPi();
	structuredEditExtension(pi as never);
	return pi.tools[0] as {
		name: string;
		parameters: unknown;
		execute: (...args: unknown[]) => Promise<ToolResult>;
	};
}

describe("structured_edit", () => {
	it("applies JSON set and delete using typed array paths", () => {
		const data = { a: { b: 1 }, list: ["x", "y"] };
		applyStructuredOperations(data, [
			{ mode: "set", path: ["a", "b"], value: 2 },
			{ mode: "delete", path: ["list", 0] },
		] satisfies Operation[]);
		expect(data).toEqual({ a: { b: 2 }, list: ["y"] });
	});
	it("writes pretty JSON with finalNewline", async () => {
		const cwd = repo();
		writeFileSync(path.join(cwd, "a.json"), '{"a":1}\n');
		const t = tool();
		const r = await t.execute(
			"1",
			{
				path: "a.json",
				format: "json",
				indent: 2,
				finalNewline: true,
				operations: [{ mode: "set", path: ["a"], value: 2 }],
			},
			undefined,
			undefined,
			{ cwd },
		);
		expect(r.isError).not.toBe(true);
		expect(readFileSync(path.join(cwd, "a.json"), "utf8")).toBe(
			'{\n  "a": 2\n}\n',
		);
	});
	it("serializes concurrent same-target edits across canonical aliases", async () => {
		const cwd = repo();
		const target = path.join(cwd, "a.json");
		writeFileSync(target, '{"a":1,"b":1}\n');
		const t = tool();
		let enterBlocker!: () => void;
		let releaseBlocker!: () => void;
		const blockerEntered = new Promise<void>((resolve) => {
			enterBlocker = resolve;
		});
		const blocker = withFileMutationQueue(target, async () => {
			enterBlocker();
			await new Promise<void>((resolve) => {
				releaseBlocker = resolve;
			});
		});
		await blockerEntered;

		const calls = [
			t.execute(
				"1",
				{
					path: "a.json",
					format: "json",
					operations: [{ mode: "set", path: ["a"], value: 2 }],
				},
				undefined,
				undefined,
				{ cwd },
			),
			t.execute(
				"2",
				{
					path: "./a.json",
					format: "json",
					operations: [{ mode: "set", path: ["b"], value: 2 }],
				},
				undefined,
				undefined,
				{ cwd },
			),
		];
		const whileBlocked = readFileSync(target, "utf8");
		releaseBlocker();
		await blocker;
		const results = await Promise.all(calls);

		expect(whileBlocked).toBe('{"a":1,"b":1}\n');
		expect(results.every((result) => result.isError !== true)).toBe(true);
		expect(JSON.parse(readFileSync(target, "utf8"))).toEqual({ a: 2, b: 2 });
	});
	it("does not mutate when aborted while waiting for the file queue", async () => {
		const cwd = repo();
		const target = path.join(cwd, "a.json");
		writeFileSync(target, '{"a":1}\n');
		const t = tool();
		let enterBlocker!: () => void;
		let releaseBlocker!: () => void;
		const blockerEntered = new Promise<void>((resolve) => {
			enterBlocker = resolve;
		});
		const blocker = withFileMutationQueue(target, async () => {
			enterBlocker();
			await new Promise<void>((resolve) => {
				releaseBlocker = resolve;
			});
		});
		await blockerEntered;
		const controller = new AbortController();
		const call = t.execute(
			"1",
			{
				path: "a.json",
				format: "json",
				operations: [{ mode: "set", path: ["a"], value: 2 }],
			},
			controller.signal,
			undefined,
			{ cwd },
		);

		controller.abort();
		releaseBlocker();
		await blocker;
		const result = await call;

		expect(result.isError).toBe(true);
		expect(readFileSync(target, "utf8")).toBe('{"a":1}\n');
	});
	it("rejects prototype and constructor segments plus missing deletes", () => {
		expect(() =>
			applyStructuredOperations({}, [
				{ mode: "set", path: ["__proto__"], value: true },
			] satisfies Operation[]),
		).toThrow(/prototype/);
		expect(() =>
			applyStructuredOperations({}, [
				{ mode: "set", path: ["constructor"], value: true },
			] satisfies Operation[]),
		).toThrow(/prototype/);
		expect(() =>
			applyStructuredOperations({}, [
				{ mode: "delete", path: ["missing"] },
			] satisfies Operation[]),
		).toThrow(/Delete target/);
	});
	it("rejects .env and unsupported formats", async () => {
		const cwd = repo();
		writeFileSync(path.join(cwd, ".env"), "{}");
		const t = tool();
		expect(
			(
				await t.execute(
					"1",
					{
						path: ".env",
						format: "json",
						operations: [{ mode: "set", path: ["a"], value: 1 }],
					},
					undefined,
					undefined,
					{ cwd },
				)
			).isError,
		).toBe(true);
		expect(
			(
				await t.execute(
					"1",
					{ path: ".env", format: "yaml", operations: [] },
					undefined,
					undefined,
					{ cwd },
				)
			).isError,
		).toBe(true);
	});
});

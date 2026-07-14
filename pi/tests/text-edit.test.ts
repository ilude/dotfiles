import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import textEditExtension, {
	applyTextOperations,
	type Operation,
} from "../extensions/text-edit.ts";

type RegisteredTool = {
	name: string;
	parameters: unknown;
	execute: (
		...args: unknown[]
	) => Promise<{ details?: { dryRun?: boolean }; isError?: boolean }>;
};

class MockPi {
	tools: RegisteredTool[] = [];
	registerTool(tool: RegisteredTool) {
		this.tools.push(tool);
	}
}
function repo() {
	const dir = mkdtempSync(path.join(tmpdir(), "safe-edit-"));
	execFileSync("git", ["init"], { cwd: dir, stdio: "ignore" });
	return dir;
}
function tool() {
	const pi = new MockPi();
	textEditExtension(pi as never);
	return pi.tools[0];
}

describe("text_edit", () => {
	it("registers text_edit with schema and handler", () => {
		const t = tool();
		expect(t.name).toBe("text_edit");
		expect(t.parameters).toBeTruthy();
		expect(typeof t.execute).toBe("function");
	});
	it("literal_replace, regex_replace, line endings and finalNewline work", () => {
		const result = applyTextOperations("a\r\nb\n", [
			{
				mode: "literal_replace",
				search: "a",
				replace: "x",
				expectedMatches: 1,
			},
			{ mode: "regex_replace", pattern: "b", replace: "y", expectedMatches: 1 },
			{ mode: "normalize_line_endings" },
			{ mode: "ensure_final_newline" },
		] satisfies Operation[]);
		expect(result.text).toBe("x\ny\n");
	});
	it("dryRun returns preview and does not write", async () => {
		const cwd = repo();
		writeFileSync(path.join(cwd, "a.txt"), "hello\n");
		const t = tool();
		const r = await t.execute(
			"1",
			{
				paths: ["a.txt"],
				dryRun: true,
				operations: [
					{
						mode: "literal_replace",
						search: "hello",
						replace: "bye",
						expectedMatches: 1,
					},
				],
			},
			undefined,
			undefined,
			{ cwd },
		);
		expect(r.details.dryRun).toBe(true);
		expect(readFileSync(path.join(cwd, "a.txt"), "utf8")).toBe("hello\n");
	});
	it("serializes concurrent same-target edits across canonical aliases", async () => {
		const cwd = repo();
		const target = path.join(cwd, "a.txt");
		writeFileSync(target, "alpha beta\n");
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
					paths: ["a.txt"],
					operations: [
						{
							mode: "literal_replace",
							search: "alpha",
							replace: "A",
							expectedMatches: 1,
						},
					],
				},
				undefined,
				undefined,
				{ cwd },
			),
			t.execute(
				"2",
				{
					paths: ["./a.txt"],
					operations: [
						{
							mode: "literal_replace",
							search: "beta",
							replace: "B",
							expectedMatches: 1,
						},
					],
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

		expect(whileBlocked).toBe("alpha beta\n");
		expect(results.every((result) => result.isError !== true)).toBe(true);
		expect(readFileSync(target, "utf8")).toBe("A B\n");
	});
	it("does not mutate when aborted while waiting for the file queue", async () => {
		const cwd = repo();
		const target = path.join(cwd, "a.txt");
		writeFileSync(target, "alpha\n");
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
				paths: ["a.txt"],
				operations: [
					{
						mode: "literal_replace",
						search: "alpha",
						replace: "changed",
						expectedMatches: 1,
					},
				],
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
		expect(readFileSync(target, "utf8")).toBe("alpha\n");
	});
	it("expectedMatches and allowZero protect silent misses", () => {
		expect(() =>
			applyTextOperations("a", [
				{
					mode: "literal_replace",
					search: "z",
					replace: "x",
					expectedMatches: 1,
				},
			] satisfies Operation[]),
		).toThrow(/Expected 1/);
		expect(() =>
			applyTextOperations("a", [
				{ mode: "literal_replace", search: "z", replace: "x", allowZero: true },
			] satisfies Operation[]),
		).not.toThrow();
	});
	it("rejects .env, gitignored, glob, and symlink escape paths", async () => {
		const cwd = repo();
		writeFileSync(path.join(cwd, ".env"), "x");
		writeFileSync(path.join(cwd, ".gitignore"), "ignored.txt\n");
		writeFileSync(path.join(cwd, "ignored.txt"), "x");
		const outside = path.join(tmpdir(), `outside-${Date.now()}.txt`);
		writeFileSync(outside, "x");
		symlinkSync(outside, path.join(cwd, "link.txt"));
		const t = tool();
		for (const p of [".env", "ignored.txt", "*.txt", "link.txt"]) {
			const r = await t.execute(
				"1",
				{
					paths: [p],
					operations: [
						{
							mode: "literal_replace",
							search: "x",
							replace: "y",
							allowZero: true,
						},
					],
				},
				undefined,
				undefined,
				{ cwd },
			);
			expect(r.isError).toBe(true);
		}
	});
});

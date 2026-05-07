import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
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

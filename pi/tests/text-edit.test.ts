import {
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import textEditExtension, {
	applyTextOperations,
	type Operation,
} from "../extensions/text-edit.ts";
import {
	maxTextBytes,
	readSafeText,
	resolveSafePath,
} from "../lib/safe-edit.ts";

const tempPaths = new Set<string>();

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
	tempPaths.add(dir);
	return dir;
}
afterEach(() => {
	vi.unstubAllEnvs();
	for (const tempPath of tempPaths) {
		rmSync(tempPath, { recursive: true, force: true });
	}
	tempPaths.clear();
});

function tool() {
	const pi = new MockPi();
	textEditExtension(pi as never);
	return pi.tools[0];
}

describe("text_edit", () => {
	it("uses a flat operation schema with enumerated modes", () => {
		const parameters = tool().parameters as {
			properties: {
				operations: {
					items: {
						anyOf?: unknown;
						properties: Record<string, { enum?: string[] }>;
					};
				};
			};
		};
		const operation = parameters.properties.operations.items;

		expect(JSON.stringify(tool().parameters).length).toBeLessThan(600);
		expect(operation.anyOf).toBeUndefined();
		expect(operation.properties.mode.enum).toEqual([
			"literal_replace",
			"regex_replace",
			"normalize_line_endings",
			"ensure_final_newline",
		]);
		expect(Object.keys(operation.properties)).toEqual([
			"mode",
			"search",
			"pattern",
			"replace",
			"flags",
			"expectedMatches",
			"allowZero",
		]);
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
	it("rejects malformed flattened operations before file mutation", async () => {
		const cwd = repo();
		const target = path.join(cwd, "a.txt");
		writeFileSync(target, "hello\n");

		const result = await tool().execute(
			"1",
			{
				paths: ["a.txt"],
				operations: [{ mode: "literal_replace", replace: "bye" }],
			},
			undefined,
			undefined,
			{ cwd },
		);

		expect(result.isError).toBe(true);
		expect(readFileSync(target, "utf8")).toBe("hello\n");
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
	it("accepts regex patterns longer than 500 characters", () => {
		const pattern = "a".repeat(501);
		const result = applyTextOperations(pattern, [
			{ mode: "regex_replace", pattern, replace: "x", expectedMatches: 1 },
		]);

		expect(result.text).toBe("x");
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
	it("edits files without a Git repository", async () => {
		const cwd = repo();
		writeFileSync(path.join(cwd, "ignored.txt"), "x");

		const result = await tool().execute(
			"1",
			{
				paths: ["ignored.txt"],
				operations: [
					{
						mode: "literal_replace",
						search: "x",
						replace: "y",
						expectedMatches: 1,
					},
				],
			},
			undefined,
			undefined,
			{ cwd },
		);

		expect(result.isError).not.toBe(true);
		expect(readFileSync(path.join(cwd, "ignored.txt"), "utf8")).toBe("y");
	});
	it("allows unrestricted filenames", async () => {
		const cwd = repo();
		writeFileSync(path.join(cwd, ".env"), "x");
		writeFileSync(path.join(cwd, "..notes.txt"), "x");

		const result = await tool().execute(
			"1",
			{
				paths: [".env"],
				operations: [
					{
						mode: "literal_replace",
						search: "x",
						replace: "y",
						expectedMatches: 1,
					},
				],
			},
			undefined,
			undefined,
			{ cwd },
		);

		expect(result.isError).not.toBe(true);
		expect(readFileSync(path.join(cwd, ".env"), "utf8")).toBe("y");
		expect(resolveSafePath("..notes.txt", cwd).relative).toBe("..notes.txt");
	});
	it("rejects a canonical path outside the working directory", async () => {
		const cwd = repo();
		const outside = path.join(tmpdir(), `outside-${Date.now()}.txt`);
		tempPaths.add(outside);
		writeFileSync(outside, "x");
		symlinkSync(outside, path.join(cwd, "link.txt"));

		const result = await tool().execute(
			"1",
			{
				paths: ["link.txt"],
				operations: [
					{
						mode: "literal_replace",
						search: "x",
						replace: "y",
						expectedMatches: 1,
					},
				],
			},
			undefined,
			undefined,
			{ cwd },
		);

		expect(result.isError).toBe(true);
		expect(readFileSync(outside, "utf8")).toBe("x");
	});
	it("uses a configurable 16 MiB file-size limit", () => {
		const cwd = repo();
		writeFileSync(path.join(cwd, "a.txt"), "xx");
		const file = resolveSafePath("a.txt", cwd);

		expect(maxTextBytes()).toBe(16 * 1024 * 1024);
		vi.stubEnv("PI_SAFE_EDIT_MAX_BYTES", "1");
		expect(() => readSafeText(file)).toThrow(
			"File is 2 bytes; configured limit is 1 bytes",
		);
	});
});

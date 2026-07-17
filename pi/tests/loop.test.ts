import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.hoisted(() =>
	vi.fn(() => ({ pid: 4242, unref: vi.fn() })),
);
vi.mock("node:child_process", () => ({ spawn: spawnMock }));

import loop, { loopTestApi } from "../extensions/loop.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pi-loop-test-"));
	temporaryDirectories.push(directory);
	return directory;
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0))
		fs.rmSync(directory, { recursive: true, force: true });
});

describe("loop extension", () => {
	it("parses explicit actions, quoted plans, and bare start arguments", () => {
		expect(loopTestApi.parseRequest("")).toEqual({
			action: "help",
			values: [],
		});
		expect(
			loopTestApi.parseRequest('start "plans/phase one.md" plans/two.md'),
		).toEqual({
			action: "start",
			values: ["plans/phase one.md", "plans/two.md"],
		});
		expect(loopTestApi.parseRequest("status abc123")).toEqual({
			action: "status",
			values: ["abc123"],
		});
		expect(loopTestApi.parseRequest("plans/one.md")).toEqual({
			action: "start",
			values: ["plans/one.md"],
		});
	});

	it("resolves only plan files contained by the workspace", () => {
		const workspace = temporaryDirectory();
		const outside = temporaryDirectory();
		fs.mkdirSync(path.join(workspace, "plans"));
		fs.writeFileSync(path.join(workspace, "plans", "one.md"), "plan\n");
		fs.writeFileSync(path.join(outside, "outside.md"), "outside\n");

		expect(loopTestApi.resolvePlans(workspace, ["plans/one.md"])).toEqual([
			"plans/one.md",
		]);
		expect(() =>
			loopTestApi.resolvePlans(workspace, [path.join(outside, "outside.md")]),
		).toThrow("Plan must stay under the current workspace");
	});

	it("uses stable job ids for the same workspace and plan set", () => {
		const first = loopTestApi.boundedId("C:/repo", ["a.md", "b.md"]);
		expect(first).toHaveLength(12);
		expect(loopTestApi.boundedId("C:/repo", ["a.md", "b.md"])).toBe(first);
		expect(loopTestApi.boundedId("C:/repo", ["b.md", "a.md"])).not.toBe(first);
	});

	it("starts through the registered command after a clean Git preflight", async () => {
		const workspace = temporaryDirectory();
		const stateRoot = temporaryDirectory();
		fs.writeFileSync(path.join(workspace, "plan.md"), "# Plan\n");
		const priorRoot = process.env.PI_LOOP_DIR;
		process.env.PI_LOOP_DIR = stateRoot;
		const pi = createMockPi();
		pi.exec.mockImplementation(async (_command: string, args: string[]) => {
			const key = args.join(" ");
			if (key === "rev-parse --show-toplevel")
				return { stdout: `${workspace}\n`, stderr: "", code: 0, killed: false };
			if (key === "status --porcelain")
				return { stdout: "", stderr: "", code: 0, killed: false };
			if (key === "rev-parse HEAD")
				return { stdout: "abc123\n", stderr: "", code: 0, killed: false };
			throw new Error(`Unexpected command: ${key}`);
		});
		loop(pi as unknown as ExtensionAPI);
		const command = pi._commands.find((item) => item.name === "loop");
		const shutdown = vi.fn();

		try {
			await command?.handler(
				"start plan.md",
				createMockCtx({ cwd: workspace, mode: "tui", shutdown }),
			);
		} finally {
			if (priorRoot === undefined) delete process.env.PI_LOOP_DIR;
			else process.env.PI_LOOP_DIR = priorRoot;
		}

		expect(spawnMock).toHaveBeenCalledOnce();
		expect(shutdown).toHaveBeenCalledOnce();
		const records = fs
			.readdirSync(stateRoot, { recursive: true })
			.filter((entry) => String(entry).endsWith("job.json"));
		expect(records).toHaveLength(1);
	});

	it("registers /loop and renders help without starting a model turn", async () => {
		const pi = createMockPi();
		loop(pi as unknown as ExtensionAPI);
		const command = pi._commands.find((item) => item.name === "loop");
		expect(command).toBeTruthy();

		await command?.handler("help", createMockCtx());

		expect(pi.sendMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				customType: "loop-status",
				content: expect.stringContaining("/loop start"),
				display: true,
			}),
			{ triggerTurn: false },
		);
	});
});

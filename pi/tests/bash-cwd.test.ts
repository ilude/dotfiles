import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import bashCwd from "../extensions/bash-cwd.ts";
import { createMockPi, createMockTheme } from "./helpers/mock-pi.js";

describe("bash cwd extension", () => {
	it("records the execution start and renders its local timeout deadline", () => {
		const pi = createMockPi();
		bashCwd(pi as any);
		const tool = pi._getTool("bash")!;
		const theme = createMockTheme();
		const startedAt = new Date(2026, 7, 19, 11, 29, 30).getTime();
		const state: Record<string, unknown> = {};
		const now = vi.spyOn(Date, "now").mockReturnValue(startedAt);
		try {
			const component = tool.renderCall?.(
				{ command: "pnpm test", timeout: 90 },
				theme,
				{
					cwd: "C:/repo",
					executionStarted: true,
					lastComponent: undefined,
					state,
				},
			);

			expect(state.startedAt).toBe(startedAt);
			expect(component?.render(300).join("\n")).toContain(
				`cwd: ${path.resolve("C:/repo")}, started 11:29:30 local, timeout 90s at 11:31:00 local`,
			);
		} finally {
			now.mockRestore();
		}
	});

	it("renders an explicit command cwd resolved from the session cwd", () => {
		const pi = createMockPi();
		bashCwd(pi as any);
		const tool = pi._getTool("bash")!;
		const component = tool.renderCall?.(
			{ command: "pnpm test", cwd: "packages/api" },
			createMockTheme(),
			{
				cwd: "C:/repo",
				executionStarted: false,
				lastComponent: undefined,
				state: {},
			},
		);

		expect(tool.parameters.properties.cwd).toBeDefined();
		expect(component?.render(300).join("\n")).toContain(
			`cwd: ${path.resolve("C:/repo", "packages/api")}`,
		);
	});

	it("preserves command, timeout, and selected cwd through execution", async () => {
		const pi = createMockPi();
		bashCwd(pi as any);
		const tool = pi._getTool("bash")! as any;
		const sessionCwd = await mkdtemp(path.join(os.tmpdir(), "pi-bash-cwd-"));
		const selectedCwd = await mkdtemp(path.join(os.tmpdir(), "pi-bash-cwd-"));
		const command = 'node -e "process.stdout.write(process.cwd())"';

		try {
			const withCwd = tool.prepareArguments({
				command,
				timeout: 7,
				cwd: selectedCwd,
			});
			expect(withCwd).toMatchObject({ command, timeout: 7, cwd: selectedCwd });
			const selectedResult = await tool.execute(
				"selected-cwd",
				withCwd,
				undefined,
				undefined,
				{
					cwd: sessionCwd,
					sessionManager: {
						getSessionId: () => "test",
						getSessionFile: () => undefined,
					},
				},
			);
			expect(selectedResult.content[0].text.trim()).toBe(
				path.resolve(selectedCwd),
			);

			const withoutCwd = tool.prepareArguments({ command, timeout: 7 });
			expect(withoutCwd).toMatchObject({ command, timeout: 7 });
			expect(withoutCwd.cwd).toBeUndefined();
			const sessionResult = await tool.execute(
				"session-cwd",
				withoutCwd,
				undefined,
				undefined,
				{
					cwd: sessionCwd,
					sessionManager: {
						getSessionId: () => "test",
						getSessionFile: () => undefined,
					},
				},
			);
			expect(sessionResult.content[0].text.trim()).toBe(path.resolve(sessionCwd));
		} finally {
			await Promise.all([
				rm(sessionCwd, { recursive: true, force: true }),
				rm(selectedCwd, { recursive: true, force: true }),
			]);
		}
	});

	it("shows the configured timeout before execution starts", () => {
		const pi = createMockPi();
		bashCwd(pi as any);
		const tool = pi._getTool("bash")!;
		const component = tool.renderCall?.(
			{ command: "pnpm test", timeout: 30 },
			createMockTheme(),
			{
				cwd: "C:/repo",
				executionStarted: false,
				lastComponent: undefined,
				state: {},
			},
		);

		expect(component?.render(300).join("\n")).toContain(
			`cwd: ${path.resolve("C:/repo")}, timeout 30s`,
		);
		expect(component?.render(300).join("\n")).not.toContain("started");
	});
});

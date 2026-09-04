import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import bashCwd from "../extensions/bash-cwd.ts";
import { createMockPi, createMockTheme } from "./helpers/mock-pi.js";

describe("bash cwd extension", () => {
	it("does not start the upstream elapsed-time ticker for partial results", async () => {
		const { initTheme } = await import("@earendil-works/pi-coding-agent");
		initTheme("dark");
		const pi = createMockPi();
		bashCwd(pi as any);
		const tool = pi._getTool("bash")!;
		const state: Record<string, unknown> = { transcriptStartedAt: Date.now() };
		const invalidate = vi.fn();

		tool.renderResult?.(
			{
				content: [{ type: "text", text: "still running" }],
				details: { cwd: "C:/repo", elapsed: "2.0" },
			},
			{ expanded: false, isPartial: true },
			createMockTheme(),
			{
				cwd: "C:/repo",
				invalidate,
				isError: false,
				lastComponent: undefined,
				showImages: false,
				state,
			},
		);

		expect(state.interval).toBeUndefined();
		expect(invalidate).not.toHaveBeenCalled();
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

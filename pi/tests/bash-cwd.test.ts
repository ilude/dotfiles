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
				"cwd: C:/repo, started 11:29:30 local, timeout 90s at 11:31:00 local",
			);
		} finally {
			now.mockRestore();
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
			"cwd: C:/repo, timeout 30s",
		);
		expect(component?.render(300).join("\n")).not.toContain("started");
	});
});

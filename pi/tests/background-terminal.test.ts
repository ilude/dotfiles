import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import backgroundTerminalExtension from "../extensions/background-terminal/index.ts";
import { resetBackgroundTerminalManager } from "../extensions/background-terminal/manager.ts";
import { createMockPi } from "./helpers/mock-pi.js";

const roots: string[] = [];

beforeEach(async () => {
	await resetBackgroundTerminalManager();
});

afterEach(async () => {
	await resetBackgroundTerminalManager();
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!predicate()) {
		if (Date.now() >= deadline) throw new Error("Timed out waiting for condition");
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

function context(cwd: string) {
	return {
		cwd,
		hasUI: true,
		ui: { setWidget: vi.fn(), notify: vi.fn() },
	};
}

describe("background terminal extension", () => {
	it("lazy-activates controls and retries one exactly-once completion delivery", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "pi-bg-extension-"));
		roots.push(cwd);
		const pi = createMockPi();
		const delivered: Array<Record<string, unknown>> = [];
		let completionAttempts = 0;
		pi.sendMessage.mockImplementation((message: Record<string, unknown>) => {
			if (message.customType === "background-terminal-result") {
				completionAttempts++;
				if (completionAttempts === 1) throw new Error("synthetic send failure");
				delivered.push(message);
			}
		});
		backgroundTerminalExtension(pi as never);

		expect(pi._tools.map((tool) => tool.name).sort()).toEqual([
			"bg_kill",
			"bg_list",
			"bg_start",
			"bg_status",
		]);
		expect(pi._commands.some((command) => command.name === "ps")).toBe(true);
		const ctx = context(cwd);
		await pi._getHook("session_start")[0].handler(
			{ reason: "startup" },
			ctx,
		);
		expect(pi.getActiveTools()).toEqual(["bg_start"]);

		const start = pi._getTool("bg_start");
		if (!start) throw new Error("bg_start was not registered");
		const result = await start.execute(
			"call-1",
			{ command: "printf 'background-ok\\n'", title: "smoke" },
			new AbortController().signal,
			() => {},
			ctx as never,
		);
		expect(result.content[0]?.text).toContain("Started bg-1");
		expect(pi.getActiveTools().sort()).toEqual([
			"bg_kill",
			"bg_list",
			"bg_start",
			"bg_status",
		]);
		await waitFor(() => completionAttempts === 1);
		expect(delivered).toEqual([]);

		await pi._getHook("agent_settled")[0].handler({}, ctx);
		await waitFor(() => delivered.length === 1);
		expect(delivered[0]?.content).toContain("background-ok");
		await pi._getHook("agent_settled")[0].handler({}, ctx);
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(delivered).toHaveLength(1);

		await pi._getHook("session_shutdown")[0].handler(
			{ reason: "quit" },
			ctx,
		);
		expect(ctx.ui.setWidget).toHaveBeenLastCalledWith(
			"background-terminals",
			undefined,
		);
	});

	it("survives session replacement and delivers completion to the next session", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "pi-bg-replacement-"));
		roots.push(cwd);
		const firstPi = createMockPi();
		backgroundTerminalExtension(firstPi as never);
		const firstCtx = context(cwd);
		await firstPi._getHook("session_start")[0].handler(
			{ reason: "startup" },
			firstCtx,
		);
		const start = firstPi._getTool("bg_start");
		if (!start) throw new Error("bg_start was not registered");
		await start.execute(
			"call-replacement",
			{
				command:
					"node -e \"setTimeout(() => process.stdout.write('replacement-ok'), 250)\"",
				title: "replacement",
			},
			new AbortController().signal,
			() => {},
			firstCtx as never,
		);
		await firstPi._getHook("session_shutdown")[0].handler(
			{ reason: "new" },
			firstCtx,
		);

		const secondPi = createMockPi();
		backgroundTerminalExtension(secondPi as never);
		const secondCtx = context(cwd);
		await secondPi._getHook("session_start")[0].handler(
			{ reason: "new" },
			secondCtx,
		);
		expect(secondPi.getActiveTools()).toEqual(
			expect.arrayContaining(["bg_status", "bg_list", "bg_kill"]),
		);
		await waitFor(() =>
			secondPi.sendMessage.mock.calls.some(
				([message]) => message.customType === "background-terminal-result",
			),
		);
		const completion = secondPi.sendMessage.mock.calls.find(
			([message]) => message.customType === "background-terminal-result",
		)?.[0];
		expect(completion?.content).toContain("replacement-ok");
		expect(
			firstPi.sendMessage.mock.calls.some(
				([message]) => message.customType === "background-terminal-result",
			),
		).toBe(false);

		await secondPi._getHook("session_shutdown")[0].handler(
			{ reason: "quit" },
			secondCtx,
		);
	});
});

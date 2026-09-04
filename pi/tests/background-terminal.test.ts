import { existsSync, mkdtempSync, rmSync, watch, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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

function pathCreated(path: string): Promise<void> {
	if (existsSync(path)) return Promise.resolve();
	return new Promise((resolve, reject) => {
		const watcher = watch(dirname(path), () => {
			if (!existsSync(path)) return;
			watcher.close();
			resolve();
		});
		watcher.on("error", reject);
		if (existsSync(path)) {
			watcher.close();
			resolve();
		}
	});
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
		let resolveFirstAttempt!: () => void;
		const firstAttempt = new Promise<void>((resolve) => {
			resolveFirstAttempt = resolve;
		});
		pi.sendMessage.mockImplementation((message: Record<string, unknown>) => {
			if (message.customType === "background-terminal-result") {
				completionAttempts++;
				try {
					if (completionAttempts === 1) throw new Error("synthetic send failure");
					delivered.push(message);
				} finally {
					if (completionAttempts === 1) resolveFirstAttempt();
				}
			}
		});
		backgroundTerminalExtension(pi as never);

		expect(pi._tools.map((tool) => tool.name).sort()).toEqual([
			"bg_kill",
			"bg_start",
		]);
		expect(pi._commands.some((command) => command.name === "ps")).toBe(true);
		const ctx = context(cwd);
		await pi._getHook("session_start")[0].handler(
			{ reason: "startup" },
			ctx,
		);
		expect(pi.getActiveTools().sort()).toEqual(["bg_kill", "bg_start"]);

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
		expect(result.content[0]?.text).toMatch(/started \d{2}:\d{2}:\d{2} local/);
		expect(pi.getActiveTools().sort()).toEqual(["bg_kill", "bg_start"]);
		await firstAttempt;
		expect(delivered).toEqual([]);

		await pi._getHook("agent_settled")[0].handler({}, ctx);
		expect(delivered).toHaveLength(1);
		expect(delivered[0]?.content).toContain("background-ok");
		await pi._getHook("agent_settled")[0].handler({}, ctx);
		expect(delivered).toHaveLength(1);

		await pi._getHook("session_shutdown")[0].handler(
			{ reason: "quit" },
			ctx,
		);
		expect(ctx.ui.setWidget).not.toHaveBeenCalled();
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
		const readyPath = join(cwd, "replacement-ready");
		const releasePath = join(cwd, "replacement-release");
		const ready = pathCreated(readyPath);
		const readyForScript = readyPath.replaceAll("\\", "/");
		const releaseForScript = releasePath.replaceAll("\\", "/");
		const cwdForScript = cwd.replaceAll("\\", "/");
		const script = `const fs=require("node:fs");const ready=${JSON.stringify(readyForScript)};const release=${JSON.stringify(releaseForScript)};const finish=()=>{watcher.close();process.stdout.write("replacement-ok");process.exit(0)};const watcher=fs.watch(${JSON.stringify(cwdForScript)},()=>{if(fs.existsSync(release))finish()});fs.writeFileSync(ready,"ready");if(fs.existsSync(release))finish()`;
		await start.execute(
			"call-replacement",
			{
				command: `node -e '${script}'`,
				title: "replacement",
			},
			new AbortController().signal,
			() => {},
			firstCtx as never,
		);
		await ready;
		await firstPi._getHook("session_shutdown")[0].handler(
			{ reason: "new" },
			firstCtx,
		);

		const secondPi = createMockPi();
		let resolveDelivery!: () => void;
		const delivery = new Promise<void>((resolve) => {
			resolveDelivery = resolve;
		});
		secondPi.sendMessage.mockImplementation((message: Record<string, unknown>) => {
			if (message.customType === "background-terminal-result") resolveDelivery();
		});
		backgroundTerminalExtension(secondPi as never);
		const secondCtx = context(cwd);
		await secondPi._getHook("session_start")[0].handler(
			{ reason: "new" },
			secondCtx,
		);
		expect(secondPi.getActiveTools().sort()).toEqual(["bg_kill", "bg_start"]);
		writeFileSync(releasePath, "release");
		await delivery;
		const completion = secondPi.sendMessage.mock.calls.find(
			([message]) => message.customType === "background-terminal-result",
		)?.[0];
		expect(completion?.content).toContain("replacement-ok");
		expect(completion?.content).toMatch(/started \d{2}:\d{2}:\d{2} local \| duration \d+s/);
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

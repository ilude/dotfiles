import { existsSync, mkdtempSync, rmSync, watch, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import backgroundTerminalExtension from "../extensions/background-terminal/index.ts";
import { resetBackgroundTerminalManager } from "../extensions/background-terminal/manager.ts";
import { createDeferred, createMockPi } from "./helpers/mock-pi.js";

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

function context(cwd: string, sessionId: string | undefined = "test-session") {
	return {
		cwd,
		hasUI: true,
		sessionManager: { getSessionId: vi.fn(() => sessionId) },
		ui: { setWidget: vi.fn(), notify: vi.fn() },
	};
}

describe("background terminal extension", () => {
	it("rejects an SDK without acknowledged delivery before starting a process", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "pi-bg-capability-"));
		roots.push(cwd);
		const pi = createMockPi();
		pi.sendMessageWithReceipt = undefined as never;
		backgroundTerminalExtension(pi as never);
		const ctx = context(cwd);
		await pi._getHook("session_start")[0].handler({ reason: "startup" }, ctx);
		const start = pi._getTool("bg_start");
		if (!start) throw new Error("bg_start was not registered");
		await expect(start.execute("missing-capability", { command: "false" }, new AbortController().signal, () => {}, ctx as never)).rejects.toThrow(
			/Acknowledged background completion delivery is unavailable/,
		);
		expect(pi.sendMessageWithReceipt).toBeUndefined();
		const { getBackgroundTerminalManager } = await import("../extensions/background-terminal/manager.ts");
		expect(getBackgroundTerminalManager().list()).toEqual([]);
	});

	it("rejects a background start without a parent session before creating a terminal", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "pi-bg-origin-"));
		roots.push(cwd);
		const pi = createMockPi();
		backgroundTerminalExtension(pi as never);
		const ctx = {
			...context(cwd),
			sessionManager: { getSessionId: () => undefined },
		};
		await pi._getHook("session_start")[0].handler({ reason: "startup" }, ctx);
		const start = pi._getTool("bg_start");
		if (!start) throw new Error("bg_start was not registered");
		await expect(start.execute("missing-origin", { command: "false" }, new AbortController().signal, () => {}, ctx as never)).rejects.toThrow(
			/parent session ID/,
		);
		expect(pi.sendMessageWithReceipt).not.toHaveBeenCalled();
		const { getBackgroundTerminalManager } = await import("../extensions/background-terminal/manager.ts");
		expect(getBackgroundTerminalManager().list()).toEqual([]);
	});

	it("lazy-activates controls and retries a rejected receipt exactly once after interactive input", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "pi-bg-extension-"));
		roots.push(cwd);
		const pi = createMockPi();
		const delivered: Array<Record<string, unknown>> = [];
		const receipts = [createDeferred<any>(), createDeferred<any>()];
		let attempt = 0;
		pi.sendMessageWithReceipt.mockImplementation((message: Record<string, unknown>, options: Record<string, unknown>) => {
			pi.sendMessage(message, options);
			delivered.push(message);
			const deferred = receipts[attempt++];
			if (!deferred) throw new Error("unexpected completion attempt");
			return deferred.promise;
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
		await vi.waitFor(() => expect(pi.sendMessageWithReceipt).toHaveBeenCalledTimes(1), { timeout: 5000 });
		const { getBackgroundTerminalManager } = await import("../extensions/background-terminal/manager.ts");
		const manager = getBackgroundTerminalManager();
		expect(manager.hasPendingCompletion("bg-1")).toBe(true);
		receipts[0]!.resolve({
			status: "rejected",
			deliveryId: "background-terminal:bg-1",
			sessionId: "test-session",
			reason: "preflight_failed",
			error: new Error("synthetic rejection"),
		});
		await vi.waitFor(() => expect(manager.deliveryState("bg-1")?.phase).toBe("rejected"), { timeout: 5000 });
		expect(delivered).toHaveLength(1);

		await pi._getHook("agent_settled")[0].handler({}, ctx);
		expect(pi.sendMessageWithReceipt).toHaveBeenCalledTimes(1);
		await pi._getHook("input")[0].handler(
			{ source: "interactive", text: "retry", images: [] },
			ctx,
		);
		await vi.waitFor(() => expect(pi.sendMessageWithReceipt).toHaveBeenCalledTimes(2), { timeout: 5000 });
		receipts[1]!.resolve({
			status: "inserted",
			deliveryId: "background-terminal:bg-1",
			sessionId: "test-session",
			entryId: "entry-2",
		});
		await vi.waitFor(() => expect(manager.hasPendingCompletion("bg-1")).toBe(false), { timeout: 5000 });
		expect(delivered).toHaveLength(2);

		await pi._getHook("session_shutdown")[0].handler(
			{ reason: "quit" },
			ctx,
		);
		expect(ctx.ui.setWidget).not.toHaveBeenCalled();
	});

	it.each([
		{ reason: "new" as const, sessionId: "new-session", delivers: false },
		{ reason: "fork" as const, sessionId: "fork-session", delivers: false },
		{ reason: "resume" as const, sessionId: "test-session", delivers: true },
	])("routes completion only to the original parent on $reason", async ({ reason, sessionId, delivers }) => {
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
			{ reason },
			firstCtx,
		);

		const secondPi = createMockPi();
		backgroundTerminalExtension(secondPi as never);
		const secondCtx = context(cwd, sessionId);
		await secondPi._getHook("session_start")[0].handler(
			{ reason },
			secondCtx,
		);
		expect(secondPi.getActiveTools().sort()).toEqual(["bg_kill", "bg_start"]);
		writeFileSync(releasePath, "release");
		const { getBackgroundTerminalManager } = await import("../extensions/background-terminal/manager.ts");
		const manager = getBackgroundTerminalManager();
		if (delivers) {
			await vi.waitFor(() => expect(secondPi.sendMessageWithReceipt).toHaveBeenCalledTimes(1), { timeout: 5000 });
			const completion = secondPi.sendMessageWithReceipt.mock.calls[0]?.[0] as Record<string, unknown>;
			expect(completion.content).toContain("replacement-ok");
			expect(completion.content).toMatch(/started \d{2}:\d{2}:\d{2} local \| duration \d+s/);
			await vi.waitFor(() => expect(manager.pendingCompletions()).toHaveLength(0), { timeout: 5000 });
		} else {
			await vi.waitFor(() => expect(manager.pendingCompletions()).toHaveLength(1), { timeout: 5000 });
			expect(secondPi.sendMessageWithReceipt).not.toHaveBeenCalled();
			expect(manager.hasPendingCompletion("bg-1")).toBe(true);
		}
		expect(firstPi.sendMessageWithReceipt).not.toHaveBeenCalled();

		await secondPi._getHook("session_shutdown")[0].handler(
			{ reason: "quit" },
			secondCtx,
		);
	});

	it("does not duplicate a completion when bg_kill races a deferred receipt", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "pi-bg-kill-race-"));
		roots.push(cwd);
		const pi = createMockPi();
		const receipt = createDeferred<any>();
		pi.sendMessageWithReceipt.mockImplementation((message: Record<string, unknown>, options: Record<string, unknown>) => {
			pi.sendMessage(message, options);
			return receipt.promise;
		});
		backgroundTerminalExtension(pi as never);
		const ctx = context(cwd);
		await pi._getHook("session_start")[0].handler({ reason: "startup" }, ctx);
		const start = pi._getTool("bg_start");
		const kill = pi._getTool("bg_kill");
		if (!start || !kill) throw new Error("background terminal tools were not registered");
		await start.execute("race-start", { command: "printf 'race\\n'" }, new AbortController().signal, () => {}, ctx as never);
		await vi.waitFor(() => expect(pi.sendMessageWithReceipt).toHaveBeenCalledTimes(1), { timeout: 5000 });
		const { getBackgroundTerminalManager } = await import("../extensions/background-terminal/manager.ts");
		const manager = getBackgroundTerminalManager();
		const killed = await kill.execute("race-kill", { ids: ["bg-1"] }, new AbortController().signal, () => {}, ctx as never);
		expect(killed.content[0]?.text).toMatch(/bg-1: already completed/);
		expect(manager.hasPendingCompletion("bg-1")).toBe(false);
		receipt.resolve({
			status: "inserted",
			deliveryId: "background-terminal:bg-1",
			sessionId: "test-session",
			entryId: "race-entry",
		});
		await vi.waitFor(() => expect(manager.deliveryState("bg-1")?.phase).toBe("consumed"), { timeout: 5000 });
		expect(pi.sendMessageWithReceipt).toHaveBeenCalledTimes(1);
		await pi._getHook("session_shutdown")[0].handler({ reason: "quit" }, ctx);
	});
});

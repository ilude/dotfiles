import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import backgroundTerminalExtension from "../extensions/background-terminal/index.ts";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!predicate()) {
		if (Date.now() >= deadline) throw new Error("Timed out waiting for condition");
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

describe("background terminal extension", () => {
	it("registers its surfaces and retries one exactly-once completion delivery", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "pi-bg-extension-"));
		roots.push(cwd);
		const tools = new Map<string, Record<string, unknown>>();
		const commands = new Map<string, Record<string, unknown>>();
		const handlers = new Map<string, Array<(event: unknown, ctx: never) => unknown>>();
		const delivered: Array<Record<string, unknown>> = [];
		let completionAttempts = 0;
		const setWidget = vi.fn();
		const pi = {
			registerTool: vi.fn((tool: Record<string, unknown>) => {
				tools.set(String(tool.name), tool);
			}),
			registerCommand: vi.fn((name: string, command: Record<string, unknown>) => {
				commands.set(name, command);
			}),
			on: vi.fn((name: string, handler) => {
				const current = handlers.get(name) ?? [];
				current.push(handler);
				handlers.set(name, current);
			}),
			sendMessage: vi.fn((message: Record<string, unknown>) => {
				if (message.customType === "background-terminal-result") {
					completionAttempts++;
					if (completionAttempts === 1) throw new Error("synthetic send failure");
					delivered.push(message);
				}
			}),
		};
		backgroundTerminalExtension(pi as never);

		expect([...tools.keys()].sort()).toEqual([
			"bg_kill",
			"bg_list",
			"bg_start",
			"bg_status",
		]);
		expect(commands.has("ps")).toBe(true);
		const ctx = {
			cwd,
			hasUI: true,
			ui: { setWidget, notify: vi.fn() },
		};
		for (const handler of handlers.get("session_start") ?? []) {
			await handler({ reason: "startup" }, ctx as never);
		}

		const start = tools.get("bg_start") as {
			execute: (
				id: string,
				params: Record<string, unknown>,
				signal: AbortSignal,
				onUpdate: () => void,
				ctx: typeof ctx,
			) => Promise<{ content: Array<{ text: string }> }>;
		};
		const result = await start.execute(
			"call-1",
			{ command: "printf 'background-ok\\n'", title: "smoke" },
			new AbortController().signal,
			() => {},
			ctx,
		);
		expect(result.content[0]?.text).toContain("Started bg-1");
		await waitFor(() => completionAttempts === 1);
		expect(delivered).toEqual([]);

		for (const handler of handlers.get("agent_settled") ?? []) {
			await handler({}, ctx as never);
		}
		await waitFor(() => delivered.length === 1);
		expect(delivered[0]?.content).toContain("background-ok");
		for (const handler of handlers.get("agent_settled") ?? []) {
			await handler({}, ctx as never);
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(delivered).toHaveLength(1);

		for (const handler of handlers.get("session_shutdown") ?? []) {
			await handler({}, ctx as never);
		}
		expect(setWidget).toHaveBeenLastCalledWith("background-terminals", undefined);
	});
});

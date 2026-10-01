import { beforeEach, describe, expect, it, vi } from "vitest";

const reviewer = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("../commands/commit/reviewer.ts", () => ({ runCommitReviewer: reviewer.run }));

import profileCommands from "../extensions/commands.ts";
import promptTemplateCommands from "../extensions/prompt-template-commands.ts";

type Hook = (event: any, ctx?: any) => unknown;

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => { resolve = done; });
	return { promise, resolve };
}

function fixture() {
	const hooks = new Map<string, Hook[]>();
	const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<void> }>();
	const shortcuts = new Map<string, { description?: string; handler: (ctx: any) => Promise<void> | void }>();
	const tools = new Map<string, any>();
	const sent: Array<{ message: any; options?: any }> = [];
	const entries: Array<{ name: string; data: any }> = [];
	const terminal = new Set<(data: string) => unknown>();
	let activeTools = ["read", "unrelated_tool"];
	let idle = true;
	const ctx = {
		hasUI: true, mode: "tui", isIdle: () => idle,
		ui: { notify: vi.fn(), setStatus: vi.fn(), onTerminalInput: vi.fn((handler: (data: string) => unknown) => {
			terminal.add(handler);
			return () => { terminal.delete(handler); };
		}) },
		waitForIdle: vi.fn(async () => {}),
	};
	const pi: any = {
		registerEntryRenderer: vi.fn(),
		registerMessageRenderer: vi.fn(),
		registerTool: (tool: any) => tools.set(tool.name, tool),
		registerCommand: (name: string, definition: any) => commands.set(name, definition),
		registerShortcut: (key: string, definition: any) => shortcuts.set(key, definition),
		on: (event: string, handler: Hook) => {
			hooks.set(event, [...(hooks.get(event) ?? []), handler]);
			return () => hooks.set(event, (hooks.get(event) ?? []).filter(item => item !== handler));
		},
		appendEntry: (name: string, data: any) => entries.push({ name, data }),
		sendMessage: (message: any, options?: any) => sent.push({ message, options }),
		getActiveTools: () => [...activeTools],
		setActiveTools: (names: string[]) => { activeTools = [...names]; },
	};
	profileCommands(pi);
	const emit = async (name: string, event: any) => {
		for (const handler of [...hooks.get(name) ?? []]) await handler(event, ctx);
	};
	return { pi, commands, shortcuts, tools, sent, entries, terminal, hooks, ctx, emit, active: () => activeTools,
		setIdle: (value: boolean) => { idle = value; }, input: (data: string) => [...terminal].map(handler => handler(data)) };
}

beforeEach(() => {
	vi.clearAllMocks();
	reviewer.run.mockReset().mockResolvedValue({ text: "abc123 committed", elapsedMs: 12, model: "offline", usage: {} });
});

describe("profile command lifecycle", () => {
	it.each([
		["f9", true, "Commit changes and push to origin"],
		["f10", false, "Commit changes"],
	] as const)("maps %s to direct commit with push=%s", async (key, push, description) => {
		const f = fixture();
		expect(f.shortcuts.get(key)?.description).toBe(description);
		await f.shortcuts.get(key)!.handler(f.ctx);
		expect(reviewer.run).toHaveBeenCalledWith(f.pi, f.ctx, push, expect.any(AbortSignal), expect.any(Function));
		expect(f.entries.at(-1)).toEqual({ name: "profile-commit-result", data: { text: "abc123 committed", error: false } });
		expect(f.tools.size).toBe(0);
		expect(f.active()).toEqual(["read", "unrelated_tool"]);
		expect(f.terminal.size).toBe(0);
		expect(f.sent).toEqual([]);
	});

	it("keeps slash idle waiting and immutable push choice", async () => {
		const f = fixture();
		const gate = deferred();
		f.ctx.waitForIdle.mockReturnValueOnce(gate.promise);
		const run = f.commands.get("commit")!.handler("push", f.ctx);
		await vi.waitFor(() => expect(f.ctx.waitForIdle).toHaveBeenCalledOnce());
		expect(reviewer.run).not.toHaveBeenCalled();
		gate.resolve();
		await run;
		expect(reviewer.run.mock.calls[0]![2]).toBe(true);
		await f.commands.get("commit")!.handler("", f.ctx);
		expect(reviewer.run.mock.calls[1]![2]).toBe(false);
	});

	it("cancels a slash command during its idle wait on shutdown", async () => {
		const f = fixture();
		const gate = deferred();
		f.ctx.waitForIdle.mockReturnValueOnce(gate.promise);
		const run = f.commands.get("commit")!.handler("push", f.ctx);
		await vi.waitFor(() => expect(f.ctx.waitForIdle).toHaveBeenCalledOnce());
		await f.emit("session_shutdown", { reason: "quit" });
		await run;
		expect(reviewer.run).not.toHaveBeenCalled();
		expect(f.entries.at(-1)?.data).toMatchObject({ error: true, text: expect.stringContaining("Cancelled") });
		expect(f.terminal.size).toBe(0);
		gate.resolve();
	});

	it("waits for final settlement rather than refusing busy shortcuts", async () => {
		const f = fixture();
		f.setIdle(false);
		const run = f.shortcuts.get("f9")!.handler(f.ctx);
		expect(reviewer.run).not.toHaveBeenCalled();
		await f.emit("agent_settled", {});
		expect(reviewer.run).not.toHaveBeenCalled();
		f.setIdle(true);
		await f.emit("agent_settled", {});
		await run;
		expect(reviewer.run.mock.calls[0]![2]).toBe(true);
		expect(f.hooks.get("agent_settled")).toEqual([]);
	});

	it("interrupts a waiting shortcut without starting Git and releases listeners", async () => {
		const f = fixture();
		f.setIdle(false);
		const run = f.shortcuts.get("f10")!.handler(f.ctx);
		expect(f.input("\x1b")).toEqual([undefined]);
		await run;
		expect(reviewer.run).not.toHaveBeenCalled();
		expect(f.entries.at(-1)?.data).toMatchObject({ error: true, text: expect.stringContaining("Cancelled") });
		expect(f.terminal.size).toBe(0);
		expect(f.hooks.get("agent_settled")).toEqual([]);
	});

	it("interrupts running work, preserving result/error presentation and dialog Escape", async () => {
		const f = fixture();
		const gate = deferred();
		reviewer.run.mockImplementationOnce(async (_pi, _ctx, _push, signal: AbortSignal, progress: (text: string) => void) => {
			progress("Waiting for ignore-file decision…");
			f.input("\x1b"); // Native dialog receives this key; it is not consumed here.
			expect(signal.aborted).toBe(false);
			progress("Committing…");
			await gate.promise;
			throw new Error("Cancelled\nabc123 existing commit\nStopped; existing commits and changes were not undone.");
		});
		const run = f.commands.get("commit")!.handler("", f.ctx);
		await vi.waitFor(() => expect(reviewer.run).toHaveBeenCalledOnce());
		expect(f.input("\x1b")).toEqual([undefined]);
		expect(reviewer.run.mock.calls[0]![3].aborted).toBe(true);
		gate.resolve();
		await run;
		expect(f.entries.at(-1)?.data).toMatchObject({ error: true, text: expect.stringContaining("abc123 existing commit") });
		expect(f.ctx.ui.notify).toHaveBeenCalledWith("/commit failed; see result above", "error");
		expect(f.terminal.size).toBe(0);
		expect(f.ctx.ui.setStatus).toHaveBeenLastCalledWith("profile-commit", undefined);
	});

	it("shutdown aborts active runner and clears terminal input", async () => {
		const f = fixture();
		reviewer.run.mockImplementationOnce((_pi, _ctx, _push, signal: AbortSignal) => new Promise((_resolve, reject) => {
			signal.addEventListener("abort", () => reject(new Error("Cancelled\nNo commits created.\nStopped; existing commits and changes were not undone.")), { once: true });
		}));
		const run = f.shortcuts.get("f9")!.handler(f.ctx);
		await vi.waitFor(() => expect(reviewer.run).toHaveBeenCalledOnce());
		await f.emit("session_shutdown", { reason: "quit" });
		await run;
		expect(f.entries.at(-1)?.data.text).toContain("No commits created.");
		expect(f.terminal.size).toBe(0);
	});

	it("rejects invalid and overlapping invocations without disturbing the active run", async () => {
		const f = fixture();
		const gate = deferred();
		reviewer.run.mockImplementationOnce(async () => { await gate.promise; return { text: "done" }; });
		const run = f.commands.get("commit")!.handler("", f.ctx);
		await vi.waitFor(() => expect(reviewer.run).toHaveBeenCalledOnce());
		await f.commands.get("commit")!.handler("not-push", f.ctx);
		await f.shortcuts.get("f9")!.handler(f.ctx);
		expect(f.entries.filter(entry => entry.name === "profile-commit-result").map(entry => entry.data.text)).toEqual([
			"/commit failed: Usage: /commit [push]", "/commit failed: A commit is already running.",
		]);
		gate.resolve();
		await run;
		expect(reviewer.run).toHaveBeenCalledOnce();
	});

	it("preserves /bro and additive /yt activation without registering commit tools", async () => {
		const f = fixture();
		const vaultTools = ["onclave_vault_search", "onclave_vault_content", "onclave_vault_ingest", "onclave_vault_jobs"];
		promptTemplateCommands(f.pi);
		f.pi.setActiveTools([...f.active(), ...vaultTools]);
		await f.commands.get("yt-local")!.handler("fixture-video", f.ctx);
		expect(f.active()).toEqual(["read", "unrelated_tool", ...vaultTools]);
		await f.commands.get("commit")!.handler("", f.ctx);
		expect(f.active()).toEqual(["read", "unrelated_tool", ...vaultTools]);
		expect(f.tools.size).toBe(0);
		await f.commands.get("bro")!.handler("", f.ctx);
		expect(f.sent.at(-1)).toMatchObject({ message: { customType: "profile-command-prompt", display: false }, options: { deliverAs: "steer", triggerTurn: true } });
		await f.commands.get("yt")!.handler("https://www.youtube.com/watch?v=fixture", f.ctx);
		expect(f.active()).toEqual(["read", "unrelated_tool", ...vaultTools]);
		expect(f.sent.at(-1)!.message.content).toContain("YouTube request: https://www.youtube.com/watch?v=fixture");
		await f.emit("agent_settled", {});
		expect(f.active()).toEqual(["read", "unrelated_tool", ...vaultTools]);
	});
});

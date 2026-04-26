/**
 * Behavioral tests for test-orchestrator.ts.
 *
 * AC#3(a): The orchestrator's primary entry (command/tool handlers) is invoked
 *          with the expected args when triggered -- tested via real handler calls.
 * AC#3(b): The extension emits the documented progress event shape:
 *          pi.sendMessage({ customType: string, content: string, display: true }).
 */
import { describe, it, expect, vi } from "vitest";

function createMockPiForOrchestrator() {
	const tools: Array<{ name: string; execute: Function }> = [];
	const hooks: Array<{ event: string; handler: Function }> = [];
	const commands: Array<{ name: string; handler: Function }> = [];
	const messages: Array<{ customType: string; content: string; display: boolean }> = [];

	const mockPi = {
		registerTool: vi.fn((def: any) => tools.push(def)),
		on: vi.fn((event: string, handler: Function) => hooks.push({ event, handler })),
		registerCommand: vi.fn((name: string, def: any) => commands.push({ name, handler: def.handler })),
		sendMessage: vi.fn((msg: any) => messages.push(msg)),
		exec: vi.fn(async () => ({ code: 0, stdout: "", stderr: "" })),
		sendUserMessage: vi.fn(async () => {}),

		_tools: tools,
		_hooks: hooks,
		_commands: commands,
		_messages: messages,
		_getTool: (name: string) => tools.find((t) => t.name === name),
		_getCommand: (name: string) => commands.find((c) => c.name === name),
		_getHook: (event: string) => hooks.filter((h) => h.event === event),
	};
	return mockPi;
}

function createMockCtx(overrides: Record<string, any> = {}) {
	return {
		cwd: "/no-adapter-here",
		hasUI: true,
		ui: {
			notify: vi.fn(),
			confirm: vi.fn(async () => true),
			setStatus: vi.fn(),
		},
		sessionManager: { getSessionId: () => null },
		...overrides,
	};
}

async function loadExtension() {
	const mod = await import("../extensions/test-orchestrator.ts");
	const pi = createMockPiForOrchestrator();
	mod.default(pi as any);
	return pi;
}

describe("test-orchestrator extension", () => {
	describe("AC#3(a) -- behavioral invocation via real entry points", () => {
		it("session_start handler runs and calls ctx.ui.setStatus with the expected key", async () => {
			const pi = await loadExtension();
			const hooks = pi._getHook("session_start");
			expect(hooks.length).toBe(1);

			const ctx = createMockCtx();
			await hooks[0].handler({}, ctx);

			// setStatus is always called -- either with a status string (adapter found)
			// or with undefined (no adapter). Either way the call happens with the right key.
			expect(ctx.ui.setStatus).toHaveBeenCalledWith("test-orchestrator", undefined);
		});

		it("test-status command handler invokes the real status builder and emits via sendMessage", async () => {
			const pi = await loadExtension();
			const cmd = pi._getCommand("test-status");
			expect(cmd).toBeDefined();

			const ctx = createMockCtx();
			await cmd!.handler("", ctx);

			// The handler must have called pi.sendMessage (the progress event mechanism)
			expect(pi.sendMessage).toHaveBeenCalledTimes(1);
			const [msg] = pi._messages;
			expect(msg.customType).toBe("test-orchestrator-status");
			expect(typeof msg.content).toBe("string");
		});

		it("test-run command handler calls sendMessage when no adapter is present", async () => {
			const pi = await loadExtension();
			const cmd = pi._getCommand("test-run");
			expect(cmd).toBeDefined();

			const ctx = createMockCtx();
			await cmd!.handler("some-spec.spec.ts", ctx);

			// With no adapter on disk, the real code path emits the no-adapter report
			expect(pi.sendMessage).toHaveBeenCalledTimes(1);
			const [msg] = pi._messages;
			expect(msg.customType).toBe("test-orchestrator-run");
			expect(msg.content).toContain("No adapter found");
		});
	});

	describe("AC#3(b) -- progress event shape: { customType, content, display: true }", () => {
		it("test-status command emits the documented shape", async () => {
			const pi = await loadExtension();
			const cmd = pi._getCommand("test-status");
			await cmd!.handler("", createMockCtx());

			expect(pi._messages.length).toBeGreaterThan(0);
			for (const msg of pi._messages) {
				expect(typeof msg.customType).toBe("string");
				expect(msg.customType.length).toBeGreaterThan(0);
				expect(typeof msg.content).toBe("string");
				expect(msg.display).toBe(true);
			}
		});

		it("test-debug command emits the documented shape", async () => {
			const pi = await loadExtension();
			const cmd = pi._getCommand("test-debug");
			expect(cmd).toBeDefined();
			await cmd!.handler("", createMockCtx());

			expect(pi._messages.length).toBeGreaterThan(0);
			const msg = pi._messages[0];
			expect(msg.customType).toBe("test-orchestrator-debug");
			expect(typeof msg.content).toBe("string");
			expect(msg.display).toBe(true);
		});

		it("test-targets command emits the documented shape (no adapter path)", async () => {
			const pi = await loadExtension();
			const cmd = pi._getCommand("test-targets");
			expect(cmd).toBeDefined();
			await cmd!.handler("", createMockCtx());

			expect(pi._messages.length).toBeGreaterThan(0);
			const msg = pi._messages[0];
			expect(msg.customType).toBe("test-orchestrator-targets");
			expect(typeof msg.content).toBe("string");
			expect(msg.display).toBe(true);
		});
	});
});

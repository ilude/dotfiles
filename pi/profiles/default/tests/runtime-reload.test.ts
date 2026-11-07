import { expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, SessionStartEvent, SessionShutdownEvent } from "@earendil-works/pi-coding-agent";
import register from "../extensions/runtime-reload.ts";

type Command = Parameters<ExtensionAPI["registerCommand"]>[1];
type SessionHooks = {
	session_start: (event: SessionStartEvent, ctx: ExtensionContext) => void;
	session_shutdown: (event: SessionShutdownEvent, ctx: ExtensionContext) => void;
};
function fixture() {
	const commands = new Map<string, Command>();
	const hooks: Partial<SessionHooks> = {};
	const appendEntry = vi.fn();
	const pi = {
		on: <K extends keyof SessionHooks>(name: K, handler: SessionHooks[K]) => { hooks[name] = handler; },
		appendEntry, registerEntryRenderer: vi.fn(),
		registerCommand: (name: string, command: Command) => { commands.set(name, command); },
	};
	register(pi as unknown as ExtensionAPI);
	const ctx = {
		waitForIdle: vi.fn(async () => {}), reload: vi.fn(async () => {}),
		sessionManager: { getSessionId: () => "session-test" },
		ui: { notify: vi.fn() },
	};
	return {
		ctx, appendEntry,
		start: (reason: SessionStartEvent["reason"]) => hooks.session_start!({ type: "session_start", reason }, ctx as unknown as ExtensionContext),
		shutdown: (reason: SessionShutdownEvent["reason"]) => hooks.session_shutdown!({ type: "session_shutdown", reason }, ctx as unknown as ExtensionContext),
		command: (args = "") => commands.get("reload-runtime")!.handler(args, ctx as unknown as ExtensionCommandContext),
	};
}

it("dispatches reload only after idle, recording interface-only invocation and fresh generation lifecycle evidence", async () => {
	const before = fixture();
	const after = fixture();
	before.start("startup");
	const first = before.appendEntry.mock.calls[0]![1];
	expect(first).toMatchObject({ event: "start", reason: "startup", pid: process.pid, sessionId: "session-test" });
	before.ctx.reload.mockImplementation(async () => {
		expect(before.ctx.waitForIdle).toHaveBeenCalledOnce();
		before.shutdown("reload");
		after.start("reload");
	});
	await before.command();
	expect(before.ctx.reload).toHaveBeenCalledOnce();
	expect(before.appendEntry).toHaveBeenCalledWith("profile-command", "/reload-runtime");
	expect(before.appendEntry).toHaveBeenLastCalledWith("runtime-reload", { ...first, event: "shutdown", reason: "reload" });
	const next = after.appendEntry.mock.calls[0]![1];
	expect(next).toMatchObject({ event: "start", reason: "reload", pid: first.pid, sessionId: first.sessionId });
	expect(next.generation).not.toBe(first.generation);
	expect(after.ctx.ui.notify).toHaveBeenCalledWith("Pi resources reloaded in place.", "info");
	expect(before.ctx.ui.notify).not.toHaveBeenCalled();
	before.shutdown("quit");
	expect(before.appendEntry).toHaveBeenLastCalledWith("runtime-reload", { ...first, event: "shutdown", reason: "reload" });
});

it("does not reload invalid invocations and propagates native reload failures", async () => {
	const f = fixture();
	await expect(f.command("unexpected")).rejects.toThrow("Usage: /reload-runtime");
	expect(f.ctx.waitForIdle).not.toHaveBeenCalled();
	expect(f.ctx.reload).not.toHaveBeenCalled();
	f.ctx.reload.mockRejectedValueOnce(new Error("Reload failed"));
	await expect(f.command()).rejects.toThrow("Reload failed");
	expect(f.ctx.ui.notify).not.toHaveBeenCalled();
});

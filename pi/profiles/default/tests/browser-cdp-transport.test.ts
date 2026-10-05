import http from "node:http";
import fs from "node:fs";
import * as browserControl from "../lib/browser-control.js";
import { createHash } from "node:crypto";
import type { Duplex } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserCdpTransport, CdpConnection, type CdpEvent } from "../lib/browser-cdp-transport.js";
import { BrowserRuntime, processMatches, type ProcessAdapter, type ProcessInfo } from "../lib/browser-runtime.js";
import type { BrowserSessionState } from "../lib/browser-control.js";

interface WireCommand { id: number; method: string; params: Record<string, unknown>; sessionId?: string }
const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); vi.restoreAllMocks(); });

/** Minimal local RFC6455 server: real native WebSocket framing, no mocked CDP commands/events. */
async function fixture() {
	const sockets = new Set<Duplex>();
	const commands: WireCommand[] = [];
	let active: Duplex | undefined;
	let upgrades = 0;
	let handler: ((command: WireCommand) => boolean | void) | undefined;
	const send = (message: unknown) => {
		const payload = Buffer.from(JSON.stringify(message));
		const header = Buffer.alloc(payload.length < 126 ? 2 : 4);
		header[0] = 0x81;
		if (payload.length < 126) header[1] = payload.length; else { header[1] = 126; header.writeUInt16BE(payload.length, 2); }
		active?.write(Buffer.concat([header, payload]));
	};
	const server = http.createServer((_req, res) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ webSocketDebuggerUrl: endpoint })); });
	server.on("upgrade", (request, socket) => {
		active = socket; sockets.add(socket); upgrades++;
		const accept = createHash("sha1").update(`${request.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
		socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
		let buffer = Buffer.alloc(0);
		socket.on("data", (chunk: Buffer) => {
			buffer = Buffer.concat([buffer, chunk]);
			while (buffer.length >= 2) {
				const opcode = buffer[0]! & 15, masked = (buffer[1]! & 128) !== 0;
				let length = buffer[1]! & 127, offset = 2;
				if (length === 126) { if (buffer.length < 4) return; length = buffer.readUInt16BE(2); offset = 4; }
				if (length === 127) throw new Error("Fixture messages must be bounded.");
				const needed = offset + (masked ? 4 : 0) + length;
				if (buffer.length < needed) return;
				const mask = masked ? buffer.subarray(offset, offset + 4) : undefined;
				if (masked) offset += 4;
				const body = Buffer.from(buffer.subarray(offset, offset + length));
				if (mask) for (let index = 0; index < body.length; index++) body[index] = body[index]! ^ mask[index % 4]!;
				buffer = buffer.subarray(needed);
				if (opcode === 8) { socket.end(Buffer.from([0x88, 0])); return; }
				if (opcode !== 1) continue;
				const command = JSON.parse(body.toString()) as WireCommand;
				commands.push(command);
				if (handler?.(command)) continue;
				if (command.method === "Target.autoAttachRelated") {
					send({ method: "Target.attachedToTarget", params: { sessionId: `session-${command.params.targetId}`, waitingForDebugger: false, targetInfo: { targetId: command.params.targetId, type: "page", url: "https://task.example/" } } });
				}
				const result = command.method === "Page.getFrameTree" ? { frameTree: { frame: { id: `frame-${command.sessionId}`, url: "https://task.example/", securityOrigin: "https://task.example", loaderId: "loader-1" }, childFrames: [{ frame: { id: "login-frame", parentId: `frame-${command.sessionId}`, url: "https://login.example/", securityOrigin: "https://login.example", loaderId: "loader-2" } }] } } : command.method === "Target.createTarget" ? { targetId: "new-blank" } : { echoed: command.params };
				send({ id: command.id, ...(command.sessionId ? { sessionId: command.sessionId } : {}), result });
			}
		});
		socket.on("close", () => sockets.delete(socket));
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("No fixture address.");
	const port = address.port;
	const endpoint = `ws://127.0.0.1:${port}/devtools/browser/synthetic`;
	cleanup.push(async () => { for (const socket of sockets) socket.destroy(); server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); });
	return { port, endpoint, commands, send, setHandler: (value: typeof handler) => { handler = value; }, disconnect: () => active?.destroy(), upgrades: () => upgrades };
}

function state(port: number): BrowserSessionState {
	return { version: 1, sessionId: "browser-session", sessionMode: "attached", profileMode: "real", cdpPort: port, pid: 42, processStartTime: "start", executablePath: "/synthetic/brave", userDataDir: "/synthetic/profile", profileDirectory: "Profile 1", extensionMode: "enabled", extensionsExpected: false, comparisonGeneration: 0 };
}
function processInfo(saved: BrowserSessionState): ProcessInfo {
	return { pid: saved.pid, parentPid: 0, creationTime: saved.processStartTime, executablePath: saved.executablePath, userDataDir: saved.userDataDir, profileDirectory: saved.profileDirectory, port: String(saved.cdpPort), remoteDebuggingAddress: "127.0.0.1" };
}
async function waitFor(predicate: () => boolean) { await vi.waitFor(() => expect(predicate()).toBe(true), { timeout: 2000, interval: 5 }); }

async function managedFixture(register?: Parameters<typeof BrowserCdpTransport.connect>[1]["register"], signal?: AbortSignal) {
	const wire = await fixture(), saved = state(wire.port);
	let current: BrowserSessionState | undefined = saved;
	let info: ProcessInfo | undefined = processInfo(saved);
	const processes: ProcessAdapter = { inspect: vi.fn(async () => info), list: vi.fn(async () => info ? [info] : []), terminate: vi.fn(async () => {}) };
	const runtime = new BrowserRuntime(processes, () => current);
	const registrations: string[] = [];
	const transport = await runtime.connectTransport(saved, { signal, register: register ?? (async ({ target, command }) => { registrations.push(target.targetId); await command("Fetch.enable", { patterns: [{ urlPattern: "*" }] }); }) });
	cleanup.push(() => runtime.disposeTransport());
	return { wire, saved, transport, runtime, processes, registrations, replaceState: (value: typeof current) => { current = value; }, replaceProcess: (value: typeof info) => { info = value; } };
}

describe("persistent CDP wire", () => {
	it("multiplexes concurrent real commands and events on one persistent socket", async () => {
		const wire = await fixture();
		const connection = new CdpConnection(wire.endpoint);
		cleanup.push(() => connection.close());
		const events: CdpEvent[] = [];
		connection.onEvent((event) => events.push(event));
		const results = await Promise.all([connection.command("Network.enable", { a: 1 }, "exact-session"), connection.command("Runtime.enable", { b: 2 }, "exact-session")]);
		expect(results).toEqual([{ echoed: { a: 1 } }, { echoed: { b: 2 } }]);
		wire.send({ method: "Fetch.requestPaused", sessionId: "exact-session", params: { requestId: "request-1", frameId: "frame-1" } });
		await waitFor(() => events.length === 1);
		expect(events[0]).toMatchObject({ method: "Fetch.requestPaused", sessionId: "exact-session", params: { frameId: "frame-1" } });
		expect(wire.upgrades()).toBe(1);
	});

	it("cancels one pending command, ignores its late reply, and keeps the socket usable", async () => {
		const wire = await fixture();
		wire.setHandler((command) => command.method === "slow");
		const connection = new CdpConnection(wire.endpoint); cleanup.push(() => connection.close());
		const abort = new AbortController();
		const slow = connection.command("slow", {}, "s", { signal: abort.signal });
		const rejected = expect(slow).rejects.toMatchObject({ code: "cancelled" });
		await waitFor(() => wire.commands.length === 1); abort.abort(); await rejected;
		const command = wire.commands[0]!;
		wire.send({ id: command.id, sessionId: "s", result: { late: true } });
		expect(await connection.command("fast", {}, "s")).toEqual({ echoed: {} });
		expect(wire.upgrades()).toBe(1);
	});

	it("rejects pending work on disconnect, refuses reconnect, and bounds timeouts", async () => {
		const wire = await fixture(); wire.setHandler(() => true);
		const connection = new CdpConnection(wire.endpoint); cleanup.push(() => connection.close());
		await expect(connection.command("timeout", {}, undefined, { timeoutMs: 20 })).rejects.toMatchObject({ code: "cdp_timeout" });
		const pending = connection.command("pending");
		const rejected = expect(pending).rejects.toMatchObject({ code: "cdp_disconnected" });
		await waitFor(() => wire.commands.length === 2); wire.disconnect(); await rejected;
		await expect(connection.command("after-close")).rejects.toMatchObject({ code: "cdp_disconnected" });
		expect(wire.upgrades()).toBe(1);
	});

	it("sanitizes CDP errors instead of returning raw page/secret strings", async () => {
		const wire = await fixture(); wire.setHandler((command) => { wire.send({ id: command.id, error: { message: "synthetic-secret-value" } }); return true; });
		const connection = new CdpConnection(wire.endpoint); cleanup.push(() => connection.close());
		await expect(connection.command("failed")).rejects.toMatchObject({ code: "cdp_failed", message: "CDP command failed." });
	});
});

describe("session-owned managed identity", () => {
	it("registers exact selected roots and descendant guards before activity without touching unrelated tabs", async () => {
		const { wire, transport, registrations } = await managedFixture();
		await transport.manage("selected-raw-id");
		await transport.command("selected-raw-id", "Page.bringToFront");
		const rootMethods = wire.commands.filter((command) => command.sessionId === "session-selected-raw-id").map((command) => command.method);
		expect(rootMethods.indexOf("Fetch.enable")).toBeLessThan(rootMethods.indexOf("Page.bringToFront"));
		wire.send({ method: "Target.attachedToTarget", sessionId: "session-selected-raw-id", params: { sessionId: "popup-session", waitingForDebugger: true, targetInfo: { targetId: "popup-raw", type: "page", openerId: "selected-raw-id", url: "https://popup.example/" } } });
		await waitFor(() => wire.commands.some((command) => command.sessionId === "popup-session" && command.method === "Runtime.runIfWaitingForDebugger"));
		expect(registrations).toEqual(["selected-raw-id", "popup-raw"]);
		const popupMethods = wire.commands.filter((command) => command.sessionId === "popup-session").map((command) => command.method);
		expect(popupMethods.indexOf("Fetch.enable")).toBeLessThan(popupMethods.indexOf("Runtime.runIfWaitingForDebugger"));
		expect(transport.managedTargets().find((target) => target.targetId === "popup-raw")).toMatchObject({ rootTargetId: "selected-raw-id", parentTargetId: "selected-raw-id", openerId: "selected-raw-id" });
		await expect(transport.command("unrelated-tab", "Page.bringToFront")).rejects.toMatchObject({ code: "target_missing" });
		expect(wire.commands.filter((command) => command.method === "Target.autoAttachRelated").map((command) => command.params.targetId)).toEqual(["selected-raw-id"]);
		expect(wire.commands.some((command) => command.method === "Target.setAutoAttach" && !command.sessionId)).toBe(false);
	});

	it("coalesces simultaneous management of the same exact target", async () => {
		const { wire, transport, registrations } = await managedFixture();
		const selected = await Promise.all([transport.manage("root"), transport.manage("root")]);
		expect(selected.map((target) => target.targetId)).toEqual(["root", "root"]);
		expect(registrations).toEqual(["root"]);
		expect(wire.commands.filter((command) => command.method === "Target.autoAttachRelated")).toHaveLength(1);
	});

	it("cancels a caller waiting for guards and cancels registration on session disposal", async () => {
		let entered = false;
		const { transport } = await managedFixture(async () => { entered = true; await new Promise<void>(() => {}); });
		const caller = new AbortController();
		const operation = transport.manage("root", caller.signal);
		const rejected = expect(operation).rejects.toMatchObject({ code: "cancelled" });
		await waitFor(() => entered); caller.abort(); await rejected;
		const waiting = transport.command("root", "Page.bringToFront");
		const stopped = expect(waiting).rejects.toMatchObject({ code: "cancelled" });
		transport.dispose(); await stopped;
	});

	it("creates blank before registration rather than navigating unguarded", async () => {
		const { wire, transport } = await managedFixture();
		expect((await transport.create()).targetId).toBe("new-blank");
		expect(wire.commands[0]).toMatchObject({ method: "Target.createTarget", params: { url: "about:blank" } });
		expect(wire.commands.some((command) => command.method === "Page.navigate")).toBe(false);
	});

	it("maps exact same-process frames and clears contexts on navigation/removal", async () => {
		const { wire, transport } = await managedFixture(); await transport.manage("root");
		expect(await transport.frame("root", "login-frame")).toMatchObject({ frameId: "login-frame", targetId: "root", securityOrigin: "https://login.example", sessionId: "session-root" });
		await expect(transport.frame("root", "unknown-frame")).rejects.toMatchObject({ code: "frame_missing" });
		wire.send({ method: "Runtime.executionContextCreated", sessionId: "session-root", params: { context: { id: 7, origin: "https://login.example", auxData: { frameId: "login-frame", isDefault: true } } } });
		await vi.waitFor(async () => expect((await transport.frame("root", "login-frame")).executionContextId).toBe(7));
		const lease = await transport.frame("root", "login-frame");
		wire.send({ method: "Page.frameNavigated", sessionId: "session-root", params: { frame: { id: "login-frame", parentId: "frame-session-root", url: "https://sso.example/", securityOrigin: "https://sso.example", loaderId: "new-loader" } } });
		await vi.waitFor(async () => {
			const frame = await transport.frame("root", "login-frame");
			expect(frame).toMatchObject({ securityOrigin: "https://sso.example", loaderId: "new-loader" });
			expect(frame.executionContextId).toBeUndefined();
		});
		await expect(transport.revalidateFrame(lease)).rejects.toMatchObject({ code: "frame_stale" });
		wire.send({ method: "Page.frameDetached", sessionId: "session-root", params: { frameId: "login-frame", reason: "remove" } });
		await vi.waitFor(async () => expect(transport.frame("root", "login-frame")).rejects.toMatchObject({ code: "frame_missing" }));
	});

	it("queues an early paused request until exact attached-frame identity is ready without command deadlock", async () => {
		const { wire, transport } = await managedFixture();
		let treeCommand: WireCommand | undefined;
		wire.setHandler((command) => {
			if (command.method === "Fetch.enable") {
				wire.send({ method: "Page.frameAttached", sessionId: command.sessionId, params: { frameId: "early-child", parentFrameId: "frame-session-root" } });
				wire.send({ method: "Fetch.requestPaused", sessionId: command.sessionId, params: { requestId: "early-request", frameId: "early-child" } });
			}
			if (command.method === "Page.getFrameTree") { treeCommand = command; return true; }
		});
		const handled: string[] = [];
		transport.onEvent(async (event) => {
			if (event.method !== "Fetch.requestPaused") return;
			const frame = await transport.frame(event.targetId!, String(event.params.frameId));
			expect(frame).toMatchObject({ targetId: "root", sessionId: "session-root", frameId: "early-child", parentFrameId: "frame-session-root", url: "about:blank", securityOrigin: "null" });
			expect(frame.executionContextId).toBeUndefined();
			await transport.revalidateFrame(frame);
			await transport.command(event.targetId!, "Fetch.continueRequest", { requestId: event.params.requestId });
			handled.push(frame.frameId);
		});
		const managing = transport.manage("root");
		await waitFor(() => treeCommand !== undefined);
		expect(handled).toEqual([]);
		expect(wire.commands.some((command) => command.method === "Fetch.continueRequest")).toBe(false);
		wire.send({ id: treeCommand!.id, sessionId: "session-root", result: { frameTree: { frame: { id: "frame-session-root", url: "https://task.example/", securityOrigin: "https://task.example", loaderId: "root-loader" } } } });
		await managing;
		await waitFor(() => handled.length === 1);
		expect(wire.commands.find((command) => command.method === "Fetch.continueRequest")).toMatchObject({ sessionId: "session-root", params: { requestId: "early-request" } });
		const blank = await transport.frame("root", "early-child");
		wire.send({ method: "Page.frameNavigated", sessionId: "session-root", params: { frame: { id: "early-child", parentId: "frame-session-root", url: "https://login.example/", securityOrigin: "https://login.example", loaderId: "child-loader" } } });
		await vi.waitFor(async () => expect(transport.revalidateFrame(blank)).rejects.toMatchObject({ code: "frame_stale" }));
		await expect(transport.frame("root", "unobserved-child")).rejects.toMatchObject({ code: "frame_missing" });
	});

	it("invalidates opaque attached-frame leases on reparenting and detach", async () => {
		const { wire, transport } = await managedFixture(); await transport.manage("root");
		wire.send({ method: "Page.frameAttached", sessionId: "session-root", params: { frameId: "blank-child", parentFrameId: "frame-session-root" } });
		await vi.waitFor(async () => expect(await transport.frame("root", "blank-child")).toMatchObject({ securityOrigin: "null" }));
		const lease = await transport.frame("root", "blank-child");
		wire.send({ method: "Page.frameDetached", sessionId: "session-root", params: { frameId: "blank-child" } });
		wire.send({ method: "Page.frameAttached", sessionId: "session-root", params: { frameId: "blank-child", parentFrameId: "login-frame" } });
		await vi.waitFor(async () => expect(transport.revalidateFrame(lease)).rejects.toMatchObject({ code: "frame_stale" }));
		const reparented = await transport.frame("root", "blank-child");
		wire.send({ method: "Page.frameDetached", sessionId: "session-root", params: { frameId: "blank-child" } });
		await vi.waitFor(async () => expect(transport.revalidateFrame(reparented)).rejects.toMatchObject({ code: "frame_missing" }));
	});

	it("maps OOPIF owner sessions and independently projects request events", async () => {
		const { wire, transport } = await managedFixture(); await transport.manage("root");
		wire.send({ method: "Target.attachedToTarget", params: { sessionId: "oop-session", waitingForDebugger: true, targetInfo: { targetId: "oop-target", type: "iframe", parentId: "root", url: "https://login.example/" } } });
		await waitFor(() => wire.commands.some((command) => command.sessionId === "oop-session" && command.method === "Runtime.runIfWaitingForDebugger"));
		wire.send({ method: "Runtime.executionContextCreated", sessionId: "oop-session", params: { context: { id: 99, auxData: { frameId: "login-frame", isDefault: true } } } });
		await vi.waitFor(async () => expect(await transport.frame("root", "login-frame")).toMatchObject({ targetId: "oop-target", sessionId: "oop-session", executionContextId: 99 }));
		const events: CdpEvent[] = []; transport.onEvent((event) => { events.push(event); });
		wire.send({ method: "Fetch.requestPaused", sessionId: "oop-session", params: { requestId: "iframe-request", frameId: "login-frame" } });
		wire.send({ method: "Network.requestWillBeSent", sessionId: "unrelated-session", params: { requestId: "ignore" } });
		await waitFor(() => events.length === 1);
		expect(events[0]).toMatchObject({ targetId: "oop-target", sessionId: "oop-session", params: { frameId: "login-frame" } });
	});

	it.each(["pid", "creationTime", "executablePath", "userDataDir", "profileDirectory", "port", "remoteDebuggingAddress"] as const)("rejects stale process %s before a page command", async (field) => {
		const { wire, transport, saved, replaceProcess, processes } = await managedFixture(); await transport.manage("root");
		const original = processInfo(saved);
		const changed = { ...original, [field]: typeof original[field] === "number" ? 999 : "changed" };
		expect(processMatches(saved, changed)).toBe(false);
		replaceProcess(changed);
		await expect(transport.command("root", "Page.navigate", { url: "https://task.example/" })).rejects.toMatchObject({ code: "session_stale" });
		expect(wire.commands.some((command) => command.method === "Page.navigate")).toBe(false);
		expect(transport.signal.aborted).toBe(true); expect(processes.terminate).not.toHaveBeenCalled();
	});

	it("tracks replacement contexts without clearing a new context when the old one is destroyed", async () => {
		const { wire, transport } = await managedFixture(); await transport.manage("root");
		for (const id of [1, 2]) wire.send({ method: "Runtime.executionContextCreated", sessionId: "session-root", params: { context: { id, auxData: { frameId: "login-frame", isDefault: true } } } });
		wire.send({ method: "Runtime.executionContextDestroyed", sessionId: "session-root", params: { executionContextId: 1 } });
		await vi.waitFor(async () => expect((await transport.frame("root", "login-frame")).executionContextId).toBe(2));
		wire.send({ method: "Runtime.executionContextsCleared", sessionId: "session-root", params: {} });
		await vi.waitFor(async () => expect((await transport.frame("root", "login-frame")).executionContextId).toBeUndefined());
	});

	it("registers nested worker descendants before resuming their execution", async () => {
		const { wire, transport, registrations } = await managedFixture(); await transport.manage("root");
		wire.send({ method: "Target.attachedToTarget", sessionId: "session-root", params: { sessionId: "worker-session", waitingForDebugger: true, targetInfo: { targetId: "worker", type: "worker" } } });
		await waitFor(() => wire.commands.some((command) => command.sessionId === "worker-session" && command.method === "Runtime.runIfWaitingForDebugger"));
		wire.send({ method: "Target.attachedToTarget", sessionId: "worker-session", params: { sessionId: "nested-session", waitingForDebugger: true, targetInfo: { targetId: "nested", type: "worker" } } });
		await waitFor(() => wire.commands.some((command) => command.sessionId === "nested-session" && command.method === "Runtime.runIfWaitingForDebugger"));
		expect(registrations).toEqual(["root", "worker", "nested"]);
		expect(transport.managedTargets().find((target) => target.targetId === "nested")).toMatchObject({ rootTargetId: "root", parentTargetId: "worker" });
		expect(wire.commands.some((command) => command.sessionId === "nested-session" && command.method === "Page.enable")).toBe(false);
	});

	it("rejects replaced/absent saved sessions even with an unchanged process", async () => {
		const { transport, saved, replaceState } = await managedFixture(); await transport.manage("root");
		replaceState({ ...saved, sessionId: "reloaded-session" });
		await expect(transport.frame("root", "login-frame")).rejects.toMatchObject({ code: "session_stale" });
		expect(transport.managedTargets()).toEqual([]);
	});

	it("rejects a detached exact target, never substituting a same-URL tab", async () => {
		const { wire, transport } = await managedFixture(); await transport.manage("root");
		wire.send({ method: "Target.detachedFromTarget", params: { sessionId: "session-root", targetId: "root" } });
		await waitFor(() => transport.managedTargets().length === 0);
		await expect(transport.command("root", "Page.bringToFront")).rejects.toMatchObject({ code: "target_missing" });
	});

	it("disconnects on failed guard registration without resuming a paused descendant", async () => {
		const { wire, transport } = await managedFixture(async ({ target, command }) => {
			if (target.parentTargetId) throw new Error("synthetic guard failure");
			await command("Fetch.enable");
		});
		await transport.manage("root");
		wire.send({ method: "Target.attachedToTarget", sessionId: "session-root", params: { sessionId: "child", waitingForDebugger: true, targetInfo: { targetId: "child-target", type: "page", openerId: "root" } } });
		await waitFor(() => transport.signal.aborted);
		expect(wire.commands.some((command) => command.sessionId === "child" && command.method === "Runtime.runIfWaitingForDebugger")).toBe(false);
	});

	it("lifetime cancellation closes the socket and invalidates managed mappings", async () => {
		const session = new AbortController();
		const { wire, transport, processes } = await managedFixture(undefined, session.signal); await transport.manage("root");
		wire.setHandler((command) => command.method === "pending");
		const operation = transport.command("root", "pending");
		const rejected = expect(operation).rejects.toMatchObject({ code: "cdp_disconnected" });
		await waitFor(() => wire.commands.some((command) => command.method === "pending"));
		session.abort(); await rejected;
		expect(transport.signal.aborted).toBe(true); expect(transport.managedTargets()).toEqual([]);
		expect(processes.terminate).not.toHaveBeenCalled();
	});

	it("explicit attached stop clears only the session record after transport shutdown", async () => {
		const { wire, transport, runtime, saved, processes } = await managedFixture(); await transport.manage("operator-tab");
		vi.spyOn(browserControl, "loadBrowserState").mockReturnValue(saved);
		const rm = vi.spyOn(fs.promises, "rm").mockResolvedValue(undefined);
		expect(await runtime.stop()).toMatchObject({ code: 0, stdout: "close-attached: preserved" });
		expect(rm).toHaveBeenCalledWith(browserControl.getBrowserStatePath(), { force: true });
		expect(transport.signal.aborted).toBe(true); expect(processes.terminate).not.toHaveBeenCalled();
		expect(wire.commands.some((command) => ["Browser.close", "Target.closeTarget"].includes(command.method))).toBe(false);
	});

	it("shutdown while connecting cannot publish a stale transport", async () => {
		const wire = await fixture(), saved = state(wire.port);
		let release: (() => void) | undefined;
		const inspection = new Promise<void>((resolve) => { release = resolve; });
		let inspecting = false;
		const runtime = new BrowserRuntime({ inspect: async () => { inspecting = true; await inspection; return processInfo(saved); }, list: async () => [], terminate: async () => {} }, () => saved);
		const connecting = runtime.connectTransport(saved, { register: async () => {} });
		const rejected = expect(connecting).rejects.toMatchObject({ code: "cancelled" });
		await waitFor(() => inspecting); runtime.disposeTransport(); release!(); await rejected;
		expect(wire.commands).toEqual([]);
	});

	it("shutdown/reload is idempotent and never closes tabs or terminates attached browsers", async () => {
		const { wire, runtime, transport, saved, processes } = await managedFixture(); await transport.manage("operator-tab");
		wire.setHandler((command) => command.method === "pending");
		const pending = transport.command("operator-tab", "pending");
		const rejected = expect(pending).rejects.toMatchObject({ code: "cdp_disconnected" });
		await waitFor(() => wire.commands.some((command) => command.method === "pending"));
		runtime.disposeTransport(); runtime.disposeTransport(); await rejected;
		const fresh = await runtime.connectTransport(saved, { register: async ({ command }) => { await command("Fetch.enable"); } });
		await fresh.manage("operator-tab");
		expect(wire.upgrades()).toBe(2);
		expect(processes.terminate).not.toHaveBeenCalled();
		expect(wire.commands.some((command) => ["Target.closeTarget", "Browser.close"].includes(command.method))).toBe(false);
		expect(transport.managedTargets()).toEqual([]);
	});
});

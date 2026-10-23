import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as control from "../lib/browser-control.js";
import { BrowserCdpTransport, type BrowserCdpOptions, type ManagedTargetSetup } from "../lib/browser-cdp-transport.js";
import { BrowserRuntime } from "../lib/browser-runtime.js";
import type { BrowserSessionState } from "../lib/browser-control.js";

const cleanups: Array<() => void> = [];
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const state: BrowserSessionState = { sessionId: "synthetic", sessionMode: "attached", profileMode: "real", cdpPort: 9222, pid: 42, processStartTime: "start", executablePath: "/synthetic/brave", userDataDir: "/synthetic/profile", profileDirectory: "Default", extensionMode: "enabled", comparisonGeneration: 0 };
type Command = { id: number; method: string; params: Record<string, unknown>; sessionId?: string };

/** Deterministic CDP peer. Real transport, registration and page executors; no browser or account. */
class Socket extends EventTarget {
	commands: Command[] = [];
	hold?: (command: Command) => boolean;
	message(value: unknown) { this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(value) })); }
	reply(command: Command, result: unknown = {}) { this.message({ id: command.id, ...(command.sessionId ? { sessionId: command.sessionId } : {}), result }); }
	send(raw: string) {
		const command = JSON.parse(raw) as Command; this.commands.push(command);
		if (this.hold?.(command)) return;
		queueMicrotask(() => {
			if (command.method === "Target.autoAttachRelated") this.message({ method: "Target.attachedToTarget", params: { sessionId: `session-${command.params.targetId}`, targetInfo: { targetId: command.params.targetId, type: "page", url: "https://public.example/" } } });
			if (command.method === "Runtime.enable") this.message({ method: "Runtime.executionContextCreated", sessionId: command.sessionId, params: { context: { id: 1, auxData: { frameId: "frame", isDefault: true } } } });
			this.reply(command, command.method === "Page.getFrameTree" ? { frameTree: { frame: { id: "frame", url: "https://public.example/", securityOrigin: "https://public.example", loaderId: "loader" } } } : command.method === "Target.createTarget" ? { targetId: "created" } : command.method === "Runtime.evaluate" ? { result: { value: false } } : {});
		});
	}
	close() { this.dispatchEvent(new Event("close")); }
}
async function fixture() {
	vi.useFakeTimers();
	const socket = new Socket();
	vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/browser/synthetic" }) })));
	let transport: BrowserCdpTransport | undefined;
	const setups: ManagedTargetSetup[] = [];
	const connect = vi.fn(async (_state: BrowserSessionState, options: Omit<BrowserCdpOptions, "revalidate">) => {
		transport = await BrowserCdpTransport.connect(state, { ...options, register: async setup => { setups.push(setup); await options.register(setup); }, revalidate: async () => {}, socketFactory: () => { queueMicrotask(() => socket.dispatchEvent(new Event("open"))); return socket as unknown as WebSocket; } });
		return transport;
	});
	const runtime = { connectTransport: connect, disposeTransport: () => transport?.dispose() } as unknown as BrowserRuntime;
	const pages = new control.BrowserPageProtocol({ runtime, identity: () => ({ sessionId: "session", branchId: "branch", generation: 0 }), policy: async () => ({ outcome: "allow", reason: "Synthetic read" }), resolveHost: async () => ["93.184.216.34"] });
	cleanups.push(() => pages.dispose());
	return { socket, pages, connect, setups, transport: () => transport! };
}
async function flush() { await vi.advanceTimersByTimeAsync(0); }

describe("call-local browser timeouts", () => {
	it("lets a 60-second page call complete CDP at 45 seconds, including first target setup", async () => {
		const f = await fixture();
		f.socket.hold = command => command.method === "Security.enable";
		const operation = f.pages.select(state, "root", undefined, 60_000);
		await flush();
		const setup = f.socket.commands.find(command => command.method === "Security.enable")!;
		expect(setup).toBeDefined();
		await vi.advanceTimersByTimeAsync(45_000);
		f.socket.reply(setup);
		await operation;
		expect(f.connect.mock.calls[0]?.[1].timeoutMs).toBe(60_000);
		expect(f.socket.commands.some(command => command.method === "Page.bringToFront")).toBe(true);
	});

	it("bounds a concurrent default caller waiting for shared extended target registration", async () => {
		const f = await fixture(); f.socket.hold = command => command.method === "Security.enable";
		const extended = f.pages.select(state, "root", undefined, 60_000); await flush();
		const ordinary = f.pages.select(state, "root");
		const expired = expect(ordinary).rejects.toMatchObject({ code: "cdp_timeout" });
		await flush(); await vi.advanceTimersByTimeAsync(30_000); await expired;
		await vi.advanceTimersByTimeAsync(15_000);
		f.socket.reply(f.socket.commands.find(command => command.method === "Security.enable")!); await extended;
	});

	it("does not leak extended or shorter command budgets to concurrent or later calls on one socket", async () => {
		const f = await fixture(); await f.pages.select(state, "root");
		f.socket.hold = command => command.method === "Page.bringToFront";
		const extended = f.pages.select(state, "root", undefined, 60_000);
		const ordinary = f.pages.select(state, "root");
		const short = f.pages.select(state, "root", undefined, 1_000);
		const shortError = expect(short).rejects.toMatchObject({ code: "cdp_timeout" });
		const ordinaryError = expect(ordinary).rejects.toMatchObject({ code: "cdp_timeout" });
		await flush();
		await vi.advanceTimersByTimeAsync(1_000); await shortError;
		await vi.advanceTimersByTimeAsync(29_000); await ordinaryError;
		await vi.advanceTimersByTimeAsync(15_000);
		const held = f.socket.commands.filter(command => command.method === "Page.bringToFront").slice(1);
		f.socket.reply(held[0]!); await extended;
		const later = f.pages.select(state, "root");
		const laterError = expect(later).rejects.toMatchObject({ code: "cdp_timeout" });
		await flush(); await vi.advanceTimersByTimeAsync(30_000); await laterError;
		expect(f.connect).toHaveBeenCalledOnce();
	});

	it("propagates command budgets to blank creation, navigation and scoped hook commands without mutating the owner", async () => {
		const f = await fixture();
		const opening = f.pages.open(state, "https://public.example/", undefined, 60_000);
		f.socket.hold = command => command.method === "Target.createTarget";
		await flush(); await vi.advanceTimersByTimeAsync(45_000);
		f.socket.reply(f.socket.commands.find(command => command.method === "Target.createTarget")!, { targetId: "created" });
		await opening;
		const owner = f.transport(), scoped = owner.withCommandTimeout(60_000);
		f.socket.hold = command => command.method === "hook" || command.method === "background";
		const hook = scoped.command("created", "hook");
		const background = f.setups[0]!.command("background");
		const expired = expect(background).rejects.toMatchObject({ code: "cdp_timeout" });
		await flush(); await vi.advanceTimersByTimeAsync(30_000); await expired;
		await vi.advanceTimersByTimeAsync(15_000);
		f.socket.reply(f.socket.commands.find(command => command.method === "hook")!); await hook;
	});

	it("retains caller/overall cancellation and explicit smaller command overrides", async () => {
		const f = await fixture(); await f.pages.select(state, "root");
		f.socket.hold = command => command.method === "Page.bringToFront" || command.method === "override";
		const caller = new AbortController();
		const pending = f.pages.select(state, "root", caller.signal, 60_000);
		const cancelled = expect(pending).rejects.toMatchObject({ code: "cancelled" });
		await flush(); await vi.advanceTimersByTimeAsync(1_000); caller.abort(); await cancelled;
		const override = f.transport().withCommandTimeout(60_000).command("root", "override", {}, { timeoutMs: 500 });
		const expired = expect(override).rejects.toMatchObject({ code: "cdp_timeout" });
		await flush(); await vi.advanceTimersByTimeAsync(500); await expired;
	});
});

describe("browser startup timeout propagation", () => {
	it("extends attach readiness beyond the retained default and does not change later calls", async () => {
		vi.useFakeTimers(); vi.stubEnv("BRAVE_PATH", "/synthetic/brave");
		vi.spyOn(fs, "existsSync").mockReturnValue(true);
		vi.spyOn(control, "loadBrowserState").mockReturnValue(undefined);
		vi.spyOn(control, "readBrowserConfig").mockReturnValue({ version: 1, profiles: { synthetic: { profileDirectory: "Default", userDataDir: "/synthetic/profile" } } });
		vi.spyOn(control, "discoverBraveProfiles").mockReturnValue([]);
		vi.spyOn(control, "resolveConfiguredProfile").mockReturnValue({ userDataDir: "/synthetic/profile", profileDirectory: "Default", displayName: "Synthetic" });
		vi.spyOn(control, "saveBrowserState").mockResolvedValue();
		vi.spyOn(control, "listAllTargets").mockResolvedValue([]);
		let readyAt = Date.now() + 45_000;
		vi.stubGlobal("fetch", vi.fn(async () => ({ ok: Date.now() >= readyAt, status: 503, json: async () => ({ webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/browser/synthetic" }) })));
		const runtime = new BrowserRuntime({ inspect: async () => undefined, terminate: async () => {}, list: async () => [{ pid: 42, parentPid: 0, creationTime: "start", executablePath: path.resolve("/synthetic/brave"), userDataDir: path.resolve("/synthetic/profile"), profileDirectory: "Default", port: "9222", remoteDebuggingAddress: "127.0.0.1" }] });
		const extended = runtime.attach({ profileAlias: "synthetic", extensionMode: "enabled", timeoutMs: 60_000 });
		await vi.advanceTimersByTimeAsync(45_000);
		await expect(extended).resolves.toMatchObject({ code: 0 });
		readyAt = Date.now() + 45_000;
		const ordinary = runtime.attach({ profileAlias: "synthetic", extensionMode: "enabled" });
		const expired = expect(ordinary).rejects.toMatchObject({ code: "attach_failed", message: expect.stringContaining("15 seconds") });
		await vi.advanceTimersByTimeAsync(15_000); await expired;
	});
});

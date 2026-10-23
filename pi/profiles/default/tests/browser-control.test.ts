import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockPi } from "./helpers/mock-pi";
import { browserDom, scrollBox } from "./helpers/browser-dom";
import * as browserControl from "../lib/browser-control";
import { Value } from "typebox/value";
import registerBrowserControl, { parseSetupArgs, publicState, safeUrl } from "../extensions/browser-control";
import {
	BrowserControlError,
	braveUserDataRoots,
	discoverBraveProfiles,
	invalidateComparison,
	migrateBrowserConfig,
	isPasswordField,
	resolveConfiguredProfile,
	parseSessionStatus,
	restartAuthorization,
	validateBrowserConfig,
	writeBrowserConfig,
} from "../lib/browser-control";
import { browserLaunchArgs, cdpRetryDelay, inspectCdpVersion, processMatches, windowsArgv } from "../lib/browser-runtime";

const temporary: string[] = [];
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	for (const directory of temporary.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function tempDir(): string {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pi-browser-control-"));
	temporary.push(directory);
	return directory;
}

function makeBraveRoot(profiles: Record<string, string>): string {
	const root = tempDir();
	for (const directory of Object.keys(profiles)) fs.mkdirSync(path.join(root, directory));
	fs.writeFileSync(path.join(root, "Local State"), JSON.stringify({ profile: { info_cache: Object.fromEntries(Object.entries(profiles).map(([directory, name]) => [directory, { name }])) } }));
	return root;
}

function state(overrides: Record<string, unknown> = {}) {
	return {
		version: 1 as const,
		sessionId: "session-1",
		profileMode: "real" as const,
		profileAlias: "research",
		cdpPort: 9222,
		pid: 42,
		processStartTime: "start-1",
		executablePath: "<brave>",
		userDataDir: "<root>",
		profileDirectory: "Profile 1",
		extensionMode: "enabled" as const,
		targetId: "target-1",
		comparisonGeneration: 0,
		...overrides,
	};
}

function code(fn: () => unknown): string {
	try { fn(); } catch (error) { return error instanceof BrowserControlError ? error.code : "unknown"; }
	return "none";
}

describe("profile configuration", () => {
	it("shares strict alias and field rules with the tracked schema fixtures", () => {
		const fixtureDirectory = path.join(import.meta.dirname, "fixtures/browser-profiles");
		const valid = JSON.parse(fs.readFileSync(path.join(fixtureDirectory, "valid.json"), "utf8"));
		const invalid = JSON.parse(fs.readFileSync(path.join(fixtureDirectory, "invalid-unknown-field.json"), "utf8"));
		expect(validateBrowserConfig(valid).profiles.research?.profileDirectory).toBe("Profile 1");
		expect(code(() => validateBrowserConfig(invalid))).toBe("invalid_config");
		expect(code(() => validateBrowserConfig({ version: 1, profiles: { A: { profileDirectory: "x" }, a: { profileDirectory: "y" } } }))).toBe("invalid_config");
	});

	it("uses the actual platform home for tracked cross-platform roots", () => {
		expect(braveUserDataRoots({ HOME: "synthetic-linux-home" }, "linux")).toContain(path.resolve("synthetic-linux-home/.config/BraveSoftware/Brave-Browser"));
		expect(braveUserDataRoots({ HOME: "synthetic-macos-home" }, "darwin")).toEqual([path.resolve("synthetic-macos-home/Library/Application Support/BraveSoftware/Brave-Browser")]);
		expect(braveUserDataRoots({ USERPROFILE: "X:\\Synthetic", LOCALAPPDATA: "X:\\Synthetic\\Local" }, "win32")[0]).toContain("BraveSoftware");
	});

	it("discovers Local State metadata and rejects stale or ambiguous identity", () => {
		const root = makeBraveRoot({ Default: "Personal", "Profile 1": "Research" });
		expect(discoverBraveProfiles([root]).map((entry) => entry.profileDirectory)).toEqual(["Default", "Profile 1"]);
		fs.rmSync(path.join(root, "Profile 1"), { recursive: true });
		expect(() => discoverBraveProfiles([root])).toThrowError(expect.objectContaining({ code: "profile_metadata_stale" }));
		const ambiguous = makeBraveRoot({ Default: "Same", "Profile 2": "Same" });
		expect(() => discoverBraveProfiles([ambiguous])).toThrowError(expect.objectContaining({ code: "profile_metadata_ambiguous" }));
	});

	it("resolves configured aliases only against one live canonical profile", () => {
		const root = makeBraveRoot({ "Profile 1": "Research" });
		const config = validateBrowserConfig({ version: 1, profiles: { research: { profileDirectory: "Profile 1", userDataDir: root } } });
		expect(resolveConfiguredProfile("research", config, discoverBraveProfiles([root])).displayName).toBe("Research");
		expect(() => resolveConfiguredProfile("missing", config, [])).toThrowError(expect.objectContaining({ code: "profile_unknown" }));
	});

	it("preserves unrelated aliases during atomic setup writes", async () => {
		const file = path.join(tempDir(), "browser-profiles.json");
		fs.writeFileSync(file, JSON.stringify({ version: 1, profiles: { existing: { profileDirectory: "Default" } } }, null, 2));
		await writeBrowserConfig({ research: { profileDirectory: "Profile 1" } }, file);
		expect(Object.keys(JSON.parse(fs.readFileSync(file, "utf8")).profiles)).toEqual(["existing", "research"]);
		expect(fs.readdirSync(path.dirname(file)).filter((name) => name.includes(".tmp"))).toEqual([]);
	});

	it("migrates only validated alias configuration and refuses an existing destination", async () => {
		const directory = tempDir();
		const source = path.join(directory, "legacy.json");
		const destination = path.join(directory, "default.json");
		fs.writeFileSync(source, JSON.stringify({ version: 1, profiles: { dad: { profileDirectory: "Profile 5", extensionsExpected: true } } }));
		await migrateBrowserConfig(source, destination);
		expect(JSON.parse(fs.readFileSync(destination, "utf8"))).toEqual({ version: 1, profiles: { dad: { profileDirectory: "Profile 5", extensionsExpected: true } } });
		await expect(migrateBrowserConfig(source, destination)).rejects.toMatchObject({ code: "migration_destination_exists" });
	});
});

describe("bounded scroll expressions", () => {
	function page(html = '<div id="box"></div>') {
		const dom = browserDom(html);
		const root = scrollBox(dom.window.document.documentElement);
		Object.defineProperty(dom.window.document, "scrollingElement", { value: root });
		return { ...dom, root, run: (input: browserControl.BrowserScroll) => dom.evaluate(browserControl.browserScrollExpression(input)) as browserControl.BrowserScrollResult };
	}
	it("reports actual document positions, movement, boundaries and a no-op at the end", () => {
		const f = page();
		const result = f.run({ delta_y: 2000 });
		expect(result).toMatchObject({ moved: true, ancestorsTruncated: false, movements: [{ document: true, before: { x: 0, y: 0 }, after: { x: 0, y: 800 }, delta: { x: 0, y: 800 }, max: { x: 0, y: 800 }, boundary: { top: false, bottom: true, left: true, right: true } }] });
		expect(f.run({ delta_y: 400 })).toMatchObject({ moved: false, movements: [{ delta: { x: 0, y: 0 }, after: { y: 800 }, boundary: { bottom: true } }] });
		expect(f.run({ delta_y: -2000 })).toMatchObject({ moved: true, movements: [{ after: { y: 0 }, boundary: { top: true, bottom: false } }] });
	});
	it("moves only the selected container and supports negative RTL horizontal positions", () => {
		const f = page('<div id="box" style="direction:rtl"></div>');
		const box = scrollBox(f.window.document.querySelector("#box")!, 300, 200, 900, 1000);
		expect(f.run({ selector: "#box", delta_x: -2000, delta_y: 75 })).toMatchObject({ moved: true, movements: [{ document: false, after: { x: -600, y: 75 }, min: { x: -600, y: 0 }, max: { x: 0, y: 800 }, boundary: { left: true, right: false } }] });
		expect(box.scrollTop).toBe(75); expect(f.root.scrollTop).toBe(0);
	});
	it("brings an element through nested containers and the exact document into view", () => {
		const f = page('<div id="outer" style="overflow-y:auto"><div id="inner" style="overflow-y:auto"><button id="item">Item</button></div></div>');
		scrollBox(f.root, 300, 200, 300, 5000);
		const outer = scrollBox(f.window.document.querySelector("#outer")!, 300, 200, 300, 1600);
		const inner = scrollBox(f.window.document.querySelector("#inner")!, 300, 100, 300, 1200);
		const rect = (top: number, height: number) => ({ left: 0, right: 100, top, bottom: top + height }) as DOMRect;
		outer.getBoundingClientRect = () => rect(600 - f.root.scrollTop, 200);
		inner.getBoundingClientRect = () => rect(950 - outer.scrollTop - f.root.scrollTop, 100);
		f.window.document.querySelector("#item")!.getBoundingClientRect = () => rect(1550 - inner.scrollTop - outer.scrollTop - f.root.scrollTop, 20);
		const result = f.run({ scroll_mode: "into_view", selector: "#item" });
		expect(result).toMatchObject({ moved: true, inView: true, ancestorsTruncated: false });
		expect(result.movements.map(item => item.after.y)).toEqual([520, 250, 600]);
		expect(result.movements.map(item => item.document)).toEqual([false, false, true]);
		expect(f.run({ scroll_mode: "into_view", selector: "#item" })).toMatchObject({ moved: false, inView: true });
	});
	it("does not claim a far-away element is visible after a bounded movement", () => {
		const f = page('<button id="item">Item</button>'); scrollBox(f.root, 300, 200, 300, 10000);
		f.window.document.querySelector("#item")!.getBoundingClientRect = () => ({ left: 0, right: 100, top: 9000 - f.root.scrollTop, bottom: 9020 - f.root.scrollTop }) as DOMRect;
		expect(f.run({ scroll_mode: "into_view", selector: "#item" })).toMatchObject({ moved: true, inView: false, movements: [{ delta: { y: 2000 }, boundary: { bottom: false } }] });
	});
	it("bounds ancestor work and reports truncation instead of claiming visibility", () => {
		const f = page('<div style="overflow-y:auto">'.repeat(20) + '<button id="item">Item</button>' + '</div>'.repeat(20));
		for (const box of f.window.document.querySelectorAll("div")) scrollBox(box);
		expect(f.run({ scroll_mode: "into_view", selector: "#item" })).toMatchObject({ inView: false, ancestorsTruncated: true });
		expect(f.run({ scroll_mode: "into_view", selector: "#item" }).movements).toHaveLength(16);
	});
	it("rejects missing and ambiguous exact-frame selectors instead of selecting the first match", () => {
		const f = page('<button class="duplicate">One</button><button class="duplicate">Two</button>');
		expect(f.run({ delta_y: 1, selector: "#missing" })).toEqual({ error: "selector_missing" });
		expect(f.run({ delta_y: 1, selector: ".duplicate" })).toEqual({ error: "selector_ambiguous" });
		expect(f.run({ scroll_mode: "into_view", selector: ".duplicate" })).toEqual({ error: "selector_ambiguous" });
	});
	it.each([{}, { delta_y: 0 }, { delta_y: 2001 }, { delta_x: -2001 }, { delta_y: 1.5 }, { delta_y: NaN }, { delta_y: Infinity }, { scroll_mode: "all", delta_y: 1 }, { selector: "", delta_y: 1 }, { selector: "x".repeat(2001), delta_y: 1 }, { scroll_mode: "into_view" }, { scroll_mode: "into_view", selector: "button", delta_y: 1 }])("rejects invalid bounds/options %# before producing an expression", input => {
		expect(() => browserControl.browserScrollExpression(input as browserControl.BrowserScroll)).toThrowError(expect.objectContaining({ code: "scroll_invalid" }));
	});
});

describe("page form interaction", () => {
	it.each(["input", "textarea"])("updates application state for a tracked %s value", async (tag) => {
		// React-style tracking installs an instance setter. Calling it before an
		// input event makes the framework think the value has not changed.
		class TextControl extends EventTarget {
			private currentValue = "";
			get value() { return this.currentValue; }
			set value(value: string) { this.currentValue = value; }
			getAttribute() { return null; }
			matches() { return false; }
			closest() { return null; }
			getClientRects() { return [{}]; }
			focus() {}
		}
		class Input extends TextControl {}
		class Textarea extends TextControl {}
		// Native browser prototypes own their value accessor.
		for (const prototype of [Input.prototype, Textarea.prototype]) {
			Object.defineProperty(prototype, "value", Object.getOwnPropertyDescriptor(TextControl.prototype, "value")!);
		}
		const element = tag === "input" ? new Input() : new Textarea();
		const native = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")!;
		let tracked = "", application = "";
		Object.defineProperty(element, "value", {
			get() { return native.get!.call(element); },
			set(value: string) { tracked = value; native.set!.call(element, value); },
		});
		element.addEventListener("input", () => {
			if (element.value !== tracked) application = tracked = element.value;
		});
		const context = {
			document: { title: "Public form", body: { innerText: "Message" }, querySelectorAll: (selector: string) => selector === "#message" ? [element] : [] },
			HTMLInputElement: Input, HTMLTextAreaElement: Textarea, Event, getComputedStyle: () => ({ display: "block", visibility: "visible" }),
		};
		const value = 'Message with "quotes" and a newline\nnext line';
		expect(vm.runInNewContext(browserControl.browserFillExpression("#message", value), context)).toEqual({ ok: true, visible: true });
		expect(element.value).toBe(value);
		expect(application).toBe(value);
	});
});

describe("session and page boundaries", () => {
	it("disconnects idle interception at run end without stopping Brave or closing tabs", async () => {
		const disconnect = vi.spyOn(browserControl.BrowserSessionProtocol.prototype, "disposeTransport");
		const stop = vi.spyOn(browserControl.BrowserSessionProtocol.prototype, "stop");
		const close = vi.spyOn(browserControl.BrowserPageProtocol.prototype, "close");
		const pi = createMockPi();
		registerBrowserControl(pi as never);
		const hooks = pi._getHook("agent_end");
		expect(hooks).toHaveLength(1);
		await hooks[0]!.handler({ type: "agent_end", messages: [] });
		await hooks[0]!.handler({ type: "agent_end", messages: [] });
		expect(disconnect).toHaveBeenCalledTimes(2);
		expect(stop).not.toHaveBeenCalled();
		expect(close).not.toHaveBeenCalled();
	});

	it("exposes request diagnostics through session status and page/start failures", async () => {
		vi.spyOn(browserControl, "loadBrowserState").mockReturnValue(state());
		vi.spyOn(browserControl.BrowserSessionProtocol.prototype, "status").mockResolvedValue({ code: 0, stdout: "{}", stderr: "" });
		vi.spyOn(browserControl.BrowserSessionProtocol.prototype, "start").mockResolvedValue({ code: 0, stdout: "started", stderr: "" });
		const failures = [{ phase: "navigation" as const, stage: "classification" as const, code: "cancelled", cancellation: "deadline" as const }];
		vi.spyOn(browserControl.BrowserPageProtocol.prototype, "diagnostics").mockReturnValue(failures);
		vi.spyOn(browserControl.BrowserPageProtocol.prototype, "open").mockRejectedValue(new Error("Browser request cancelled."));
		const pi = createMockPi(); registerBrowserControl(pi as never);
		const session = pi._getTool("browser_session")!, page = pi._getTool("browser_page")!;
		const status = await session.execute("status", { action: "status" });
		expect(status.structuredContent.requestFailures).toEqual(failures);
		expect(status.content[0].text).toContain('"cancellation":"deadline"');
		expect(Value.Check(session.outputSchema!, status.structuredContent)).toBe(true);
		await expect(page.execute("open", { action: "open", session_id: "session-1", url: "https://public.example/" })).rejects.toThrow("Recent browser request failures:");
		await expect(session.execute("start", { action: "start", url: "https://public.example/" })).rejects.toThrow("Recent browser request failures:");
	});

	it("returns schema-valid discovery candidates rather than only a count", async () => {
		vi.spyOn(browserControl, "readBrowserConfig").mockReturnValue({ version: 1, profiles: {} });
		vi.spyOn(browserControl, "discoverBraveProfiles").mockReturnValue([{ userDataDir: "/public/brave", profileDirectory: "Default", displayName: "Personal" }]);
		const pi = createMockPi();
		registerBrowserControl(pi as never);
		const tool = pi._getTool("browser_session")!;
		if (!tool.outputSchema) throw new Error("Missing browser session output schema");
		const result = await tool.execute("discover", { action: "discover" });
		expect(result.structuredContent.candidates).toEqual([{ userDataDir: "/public/brave", profileDirectory: "Default", displayName: "Personal", configuredAliases: [] }]);
		expect(Value.Check(tool.outputSchema, result.structuredContent)).toBe(true);
	});

	it("returns sanitized exact page targets and redacted snapshots matching its schema", async () => {
		vi.spyOn(browserControl, "loadBrowserState").mockReturnValue(state());
		vi.spyOn(browserControl.BrowserPageProtocol.prototype, "list").mockResolvedValue([{ id: "exact-id", type: "page", url: "https://example.test/path?token=secret#private" }]);
		vi.spyOn(browserControl.BrowserPageProtocol.prototype, "snapshot").mockResolvedValue("button: public #field\\\\:name");
		vi.spyOn(browserControl.BrowserPageProtocol.prototype, "frames").mockResolvedValue([]);
		const pi = createMockPi();
		registerBrowserControl(pi as never);
		const tool = pi._getTool("browser_page")!;
		if (!tool.outputSchema) throw new Error("Missing browser page output schema");
		const list = await tool.execute("list", { action: "list", session_id: "session-1", timeout_ms: 45_000 });
		expect(Value.Check(tool.parameters, { action: "list", session_id: "session-1", timeout_ms: 45_000 })).toBe(true);
		expect(Value.Check(tool.parameters, { action: "list", session_id: "session-1", timeout_ms: 300_001 })).toBe(false);
		expect(list.structuredContent.targets).toEqual([{ id: "exact-id", type: "page", url: "https://example.test/path" }]);
		expect(Value.Check(tool.outputSchema, list.structuredContent)).toBe(true);
		const snapshot = await tool.execute("snapshot", { action: "snapshot", session_id: "session-1", target_id: "exact-id", frame_id: "exact-frame", selector: "#subtree" });
		expect(browserControl.BrowserPageProtocol.prototype.snapshot).toHaveBeenCalledWith(expect.anything(), "exact-id", undefined, "exact-frame", "#subtree", undefined);
		expect(snapshot.structuredContent.snapshot).toBe(snapshot.content[0].text);
		expect(snapshot.structuredContent.snapshot).toContain("#field\\\\:name");
		expect(Value.Check(tool.outputSchema, snapshot.structuredContent)).toBe(true);
		vi.spyOn(browserControl.BrowserPageProtocol.prototype, "screenshot").mockResolvedValue({ origin: "https://example.test", classification: "public" });
		const image = await tool.execute("screenshot", { action: "screenshot", session_id: "session-1", target_id: "exact-id", output_path: "image.png" }, undefined, undefined, { cwd: "/synthetic" } as never);
		expect(image.structuredContent.observation).toMatchObject({ source: "browser", trust: "untrusted", kind: "image", screening: "not-screened" });
		expect(image.content[0].text).toContain("Untrusted browser image");
		expect(Value.Check(tool.outputSchema, image.structuredContent)).toBe(true);
	});

	it("dispatches exact scroll parameters and exposes schema-valid truthful structured state", async () => {
		vi.spyOn(browserControl, "loadBrowserState").mockReturnValue(state());
		const scroll = { moved: false, movements: [{ document: false, before: { x: 0, y: 800 }, after: { x: 0, y: 800 }, delta: { x: 0, y: 0 }, min: { x: 0, y: 0 }, max: { x: 0, y: 800 }, boundary: { left: true, right: true, top: false, bottom: true } }], ancestorsTruncated: false };
		const execute = vi.spyOn(browserControl.BrowserPageProtocol.prototype, "scroll").mockResolvedValue(scroll);
		const pi = createMockPi(); registerBrowserControl(pi as never); const tool = pi._getTool("browser_page")!;
		const params = { action: "scroll", session_id: "session-1", target_id: "exact-id", frame_id: "exact-frame", scroll_mode: "by", selector: "#box", delta_y: 500 };
		expect(Value.Check(tool.parameters, params)).toBe(true);
		expect(Value.Check(tool.parameters, { ...params, delta_y: 2001 })).toBe(false);
		const result = await tool.execute("scroll", params);
		expect(execute).toHaveBeenCalledWith(expect.anything(), "exact-id", { frame_id: "exact-frame", scroll_mode: "by", selector: "#box", delta_y: 500, delta_x: undefined }, undefined, undefined);
		expect(result.structuredContent.scroll).toEqual(scroll);
		expect(result.content[0].text).toContain("virtualized content may remain unread");
		expect(Value.Check(tool.outputSchema!, result.structuredContent)).toBe(true);
	});

	it.each(["click", "fill"] as const)("reports non-rendered %s results in text and structured data", async action => {
		vi.spyOn(browserControl, "loadBrowserState").mockReturnValue(state());
		vi.spyOn(browserControl.BrowserPageProtocol.prototype, action).mockResolvedValue({ visible: false });
		const pi = createMockPi(); registerBrowserControl(pi as never); const tool = pi._getTool("browser_page")!;
		const result = await tool.execute(action, { action, session_id: "session-1", target_id: "exact-id", frame_id: "exact-frame", selector: "#control", ...(action === "fill" ? { value: "disposable" } : {}) });
		expect(result.content[0].text).toContain("control was not rendered"); expect(result.structuredContent.visible).toBe(false);
		expect(Value.Check(tool.outputSchema!, result.structuredContent)).toBe(true);
	});

	it.each(["list", "open", "select", "snapshot", "scroll", "screenshot", "click", "fill", "close"] as const)("forwards the call-local timeout for page %s", async action => {
		vi.spyOn(browserControl, "loadBrowserState").mockReturnValue(state());
		vi.spyOn(browserControl, "saveBrowserState").mockResolvedValue();
		const responses = { list: [], open: { id: "exact-id", url: "https://public.example/" }, select: undefined, snapshot: "Public text", scroll: { moved: false, movements: [], ancestorsTruncated: false }, screenshot: { origin: "https://public.example", classification: "public" }, click: { visible: true }, fill: { visible: true }, close: undefined };
		const method = vi.spyOn(browserControl.BrowserPageProtocol.prototype, action).mockResolvedValue(responses[action] as never);
		const frames = vi.spyOn(browserControl.BrowserPageProtocol.prototype, "frames").mockResolvedValue([]);
		const pi = createMockPi(); registerBrowserControl(pi as never);
		const tool = pi._getTool("browser_page")!;
		const params = { action, session_id: "session-1", target_id: "exact-id", url: "https://public.example/", selector: "#control", value: "disposable", delta_y: 100, output_path: "image.png" };
		await tool.execute("extended", { ...params, timeout_ms: 60_000 }, undefined, undefined, { cwd: "/synthetic" } as never);
		expect(method.mock.calls[0]?.at(-1)).toBe(60_000);
		if (action === "snapshot") expect(frames.mock.calls[0]?.at(-1)).toBe(60_000);
		await tool.execute("default", params, undefined, undefined, { cwd: "/synthetic" } as never);
		expect(method.mock.calls[1]?.at(-1)).toBeUndefined();
	});

	it.each(["caller", "deadline"] as const)("keeps the outer %s abort active with an extended CDP budget", async source => {
		vi.spyOn(browserControl, "loadBrowserState").mockReturnValue(state());
		const caller = new AbortController(), deadline = new AbortController();
		const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
		const close = vi.spyOn(browserControl.BrowserPageProtocol.prototype, "close").mockImplementation(async (_state, _target, signal) => await new Promise<void>((_resolve, reject) => signal!.addEventListener("abort", () => reject(new BrowserControlError("cancelled", "Synthetic cancellation")), { once: true })));
		const pi = createMockPi(); registerBrowserControl(pi as never);
		const pending = pi._getTool("browser_page")!.execute("close", { action: "close", session_id: "session-1", target_id: "exact-id", timeout_ms: 60_000 }, caller.signal);
		const rejected = expect(pending).rejects.toMatchObject({ code: "cancelled" });
		expect(close.mock.calls[0]?.at(-1)).toBe(60_000);
		expect(timeout).toHaveBeenCalledWith(60_000);
		(source === "caller" ? caller : deadline).abort(); await rejected;
	});

	it("starts and attaches without an unguarded runtime URL then delegates guarded page initialization", async () => {
		vi.spyOn(browserControl, "loadBrowserState").mockReturnValue(state());
		vi.spyOn(browserControl, "resolveConfiguredProfile").mockReturnValue({ userDataDir: "/synthetic", profileDirectory: "Default", displayName: "Synthetic" });
		const start = vi.spyOn(browserControl.BrowserSessionProtocol.prototype, "start").mockResolvedValue({ code: 0, stdout: "started", stderr: "" });
		const attach = vi.spyOn(browserControl.BrowserSessionProtocol.prototype, "attach").mockResolvedValue({ code: 0, stdout: "attached", stderr: "" });
		const open = vi.spyOn(browserControl.BrowserPageProtocol.prototype, "open").mockResolvedValue({ id: "new-exact", url: "https://account.example/login", type: "page" });
		vi.spyOn(browserControl, "saveBrowserState").mockResolvedValue();
		const pi = createMockPi(); registerBrowserControl(pi as never); const tool = pi._getTool("browser_session")!;
		await tool.execute("start", { action: "start", url: "https://account.example/login", allow_localhost_tls_errors: true, timeout_ms: 60_000 });
		await tool.execute("attach", { action: "attach", profile_alias: "synthetic", url: "https://account.example/login", timeout_ms: 90_000 });
		expect(start.mock.calls[0]?.[0]).not.toHaveProperty("url"); expect(attach.mock.calls[0]?.[0]).not.toHaveProperty("url");
		expect(start.mock.calls[0]?.[0]).toMatchObject({ allowLocalhostTlsErrors: true, timeoutMs: 60_000 });
		expect(attach.mock.calls[0]?.[0]).toMatchObject({ timeoutMs: 90_000 });
		expect(open).toHaveBeenCalledTimes(2);
		expect(open.mock.calls[0]?.at(-1)).toBe(60_000);
		expect(open.mock.calls[1]?.at(-1)).toBe(90_000);
	});

	it("forwards a restart timeout to relaunch and guarded initial navigation", async () => {
		const saved = state();
		vi.spyOn(browserControl, "loadBrowserState").mockReturnValue(saved);
		vi.spyOn(browserControl, "saveBrowserState").mockResolvedValue();
		vi.spyOn(browserControl, "resolveConfiguredProfile").mockReturnValue({ userDataDir: "/synthetic", profileDirectory: "Default", displayName: "Synthetic" });
		vi.spyOn(browserControl.BrowserSessionProtocol.prototype, "stop").mockResolvedValue({ code: 0, stdout: "close-owned: stopped", stderr: "" });
		const start = vi.spyOn(browserControl.BrowserSessionProtocol.prototype, "start").mockResolvedValue({ code: 0, stdout: "restarted", stderr: "" });
		const open = vi.spyOn(browserControl.BrowserPageProtocol.prototype, "open").mockResolvedValue({ id: "new", url: "https://public.example/" });
		const pi = createMockPi(); registerBrowserControl(pi as never);
		await pi._getTool("browser_session")!.execute("restart", { action: "restart", restart_authorization: restartAuthorization(saved), url: "https://public.example/", timeout_ms: 60_000 });
		expect(start.mock.calls[0]?.[0]).toMatchObject({ timeoutMs: 60_000, signal: expect.any(AbortSignal) });
		expect(open.mock.calls[0]?.at(-1)).toBe(60_000);
	});

	it("adds only Chromium's localhost-scoped TLS exception when explicitly requested", () => {
		const input = { cdpPort: 9222, userDataDir: "/tmp/pi-browser", profileDirectory: "Pi", marker: "marker", extensionMode: "enabled" as const };
		expect(browserLaunchArgs(input)).not.toContain("--allow-insecure-localhost");
		const optedIn = browserLaunchArgs({ ...input, allowLocalhostTlsErrors: true });
		expect(optedIn).toContain("--allow-insecure-localhost");
		expect(optedIn).not.toContain("--ignore-certificate-errors");
	});

	it("slows CDP startup polling at the configured elapsed-time thresholds", () => {
		expect(cdpRetryDelay(0)).toBe(250);
		expect(cdpRetryDelay(14_999)).toBe(250);
		expect(cdpRetryDelay(15_000)).toBe(500);
		expect(cdpRetryDelay(24_999)).toBe(500);
		expect(cdpRetryDelay(25_000)).toBe(1_000);
	});

	it("accepts a valid Chromium CDP endpoint without requiring a Brave product label", () => {
		expect(inspectCdpVersion({ Browser: "Chrome/140.0", "Protocol-Version": "1.3", webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/browser/id" })).toEqual({
			status: "ready",
			product: "Chrome/140.0",
			protocolVersion: "1.3",
		});
		expect(inspectCdpVersion({ Browser: "Chrome/140.0" }).status).toBe("invalid_endpoint");
	});

	it("binds restart authorization to the complete occupied tuple", () => {
		const first = restartAuthorization(state());
		expect(restartAuthorization(state({ processStartTime: "start-2" }))).not.toBe(first);
		expect(restartAuthorization(state({ cdpPort: 9333 }))).not.toBe(first);
	});

	it("requires the complete process tuple and parses spaced Windows identity arguments", () => {
		const current = state({ launchMarker: "marker", executablePath: "C:/Program Files/Brave/brave.exe", userDataDir: "C:/Users/A User/Brave Data" });
		const argv = windowsArgv('"C:\\Program Files\\Brave\\brave.exe" --user-data-dir="C:\\Users\\A User\\Brave Data" --profile-directory="Profile 1" --remote-debugging-port=9222 --pi-launch-marker=marker');
		expect(argv[0]).toContain("Brave");
		const observed = { pid: 42, parentPid: 1, creationTime: "start-1", executablePath: "C:/Program Files/Brave/brave.exe", userDataDir: "C:/Users/A User/Brave Data", profileDirectory: "Profile 1", port: "9222", marker: "marker" };
		expect(processMatches(current, observed)).toBe(true);
		expect(processMatches(current, { ...observed, creationTime: "reused" })).toBe(false);
		expect(processMatches(current, { ...observed, marker: "other" })).toBe(false);
	});

	it("accepts an attached tuple without a marker but requires an explicit loopback address", () => {
		const current = state({ sessionMode: "attached", launchMarker: undefined, executablePath: "C:/Program Files/Brave/brave.exe", userDataDir: "C:/Users/A User/Brave Data" });
		const observed = { pid: 42, parentPid: 1, creationTime: "start-1", executablePath: "C:/Program Files/Brave/brave.exe", userDataDir: "C:/Users/A User/Brave Data", profileDirectory: "Profile 1", port: "9222", remoteDebuggingAddress: "127.0.0.1" };
		expect(processMatches(current, observed)).toBe(true);
		expect(processMatches(current, { ...observed, remoteDebuggingAddress: undefined })).toBe(false);
		expect(processMatches(current, { ...observed, userDataDir: undefined })).toBe(false);
		expect(parseSessionStatus("close-attached: preserved").outcome).toBe("preserved");
	});

	it("invalidates comparisons and drops selected targets after protected continuation", () => {
		const invalidated = invalidateComparison(state({ comparisonGeneration: 7 }), "CAPTCHA detected");
		expect(invalidated.comparisonGeneration).toBe(8);
		expect(invalidated.targetId).toBeUndefined();
		expect(invalidated.comparisonInvalidatedReason).toBe("CAPTCHA detected");
		expect(isPasswordField("input[name=credential_token]")).toBe(false);
		expect(isPasswordField('input[type="password"]')).toBe(true);
	});

	it("registers bounded tools and excludes cookie, storage, and evaluation actions", () => {
		const pi = createMockPi();
		registerBrowserControl(pi as never);
		expect(pi._getTool("browser_session")).toBeDefined();
		expect(pi._getTool("browser_session")?.parameters.properties.action.enum).toContain("attach");
		expect(publicState(state({ sessionMode: "attached" })).sessionMode).toBe("attached");
		const page = pi._getTool("browser_page");
		expect(page).toBeDefined();
		expect(page?.parameters.properties.action.enum).toEqual(["list", "open", "select", "snapshot", "scroll", "screenshot", "click", "fill", "close"]);
		expect(page?.outputSchema).toHaveProperty("properties.targets");
		expect(page?.outputSchema).toHaveProperty("properties.targetId");
		expect(pi._getTool("browser_session")?.outputSchema).toHaveProperty("properties.candidates");
		expect(pi._commands.map((command) => command.name)).toContain("browser-setup");
	});

	it("accepts only secret-free JSON setup fields and redacts URL queries", () => {
		expect(parseSetupArgs('{"alias":"research","profileDirectory":"Profile 1","extensionsExpected":false}')).toMatchObject({ alias: "research", extensionsExpected: false });
		expect(() => parseSetupArgs('{"alias":"x","profileDirectory":"Default","password":"secret"}')).toThrowError(expect.objectContaining({ code: "invalid_setup" }));
		expect(safeUrl("https://example.test/results?q=private#fragment")).toBe("https://example.test/results");
	});
});

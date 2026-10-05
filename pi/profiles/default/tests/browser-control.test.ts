import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockPi } from "./helpers/mock-pi";
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
import { cdpRetryDelay, inspectCdpVersion, processMatches, windowsArgv } from "../lib/browser-runtime";

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

describe("page form interaction", () => {
	it.each(["input", "textarea"])("updates application state for a tracked %s value", async (tag) => {
		// React-style tracking installs an instance setter. Calling it before an
		// input event makes the framework think the value has not changed.
		class TextControl extends EventTarget {
			private currentValue = "";
			get value() { return this.currentValue; }
			set value(value: string) { this.currentValue = value; }
			getAttribute() { return null; }
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
			document: { title: "Public form", body: { innerText: "Message" }, querySelector: (selector: string) => selector === "#message" ? element : null },
			HTMLInputElement: Input, HTMLTextAreaElement: Textarea, Event,
		};
		const value = 'Message with "quotes" and a newline\nnext line';
		expect(vm.runInNewContext(browserControl.browserFillExpression("#message", value), context)).toEqual({ ok: true });
		expect(element.value).toBe(value);
		expect(application).toBe(value);
	});
});

describe("session and page boundaries", () => {
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
		const list = await tool.execute("list", { action: "list", session_id: "session-1" });
		expect(list.structuredContent.targets).toEqual([{ id: "exact-id", type: "page", url: "https://example.test/path" }]);
		expect(Value.Check(tool.outputSchema, list.structuredContent)).toBe(true);
		const snapshot = await tool.execute("snapshot", { action: "snapshot", session_id: "session-1", target_id: "exact-id" });
		expect(snapshot.structuredContent.snapshot).toBe(snapshot.content[0].text);
		expect(snapshot.structuredContent.snapshot).toContain("#field\\\\:name");
		expect(Value.Check(tool.outputSchema, snapshot.structuredContent)).toBe(true);
		vi.spyOn(browserControl.BrowserPageProtocol.prototype, "screenshot").mockResolvedValue({ origin: "https://example.test", classification: "public" });
		const image = await tool.execute("screenshot", { action: "screenshot", session_id: "session-1", target_id: "exact-id", output_path: "image.png" }, undefined, undefined, { cwd: "/synthetic" } as never);
		expect(image.structuredContent.observation).toMatchObject({ source: "browser", trust: "untrusted", kind: "image", screening: "not-screened" });
		expect(image.content[0].text).toContain("Untrusted browser image");
		expect(Value.Check(tool.outputSchema, image.structuredContent)).toBe(true);
	});

	it("starts and attaches without an unguarded runtime URL then delegates guarded page initialization", async () => {
		vi.spyOn(browserControl, "loadBrowserState").mockReturnValue(state());
		vi.spyOn(browserControl, "resolveConfiguredProfile").mockReturnValue({ userDataDir: "/synthetic", profileDirectory: "Default", displayName: "Synthetic" });
		const start = vi.spyOn(browserControl.BrowserSessionProtocol.prototype, "start").mockResolvedValue({ code: 0, stdout: "started", stderr: "" });
		const attach = vi.spyOn(browserControl.BrowserSessionProtocol.prototype, "attach").mockResolvedValue({ code: 0, stdout: "attached", stderr: "" });
		const open = vi.spyOn(browserControl.BrowserPageProtocol.prototype, "open").mockResolvedValue({ id: "new-exact", url: "https://account.example/login", type: "page" });
		vi.spyOn(browserControl, "saveBrowserState").mockResolvedValue();
		const pi = createMockPi(); registerBrowserControl(pi as never); const tool = pi._getTool("browser_session")!;
		await tool.execute("start", { action: "start", url: "https://account.example/login" });
		await tool.execute("attach", { action: "attach", profile_alias: "synthetic", url: "https://account.example/login" });
		expect(start.mock.calls[0]?.[0]).not.toHaveProperty("url"); expect(attach.mock.calls[0]?.[0]).not.toHaveProperty("url");
		expect(open).toHaveBeenCalledTimes(2);
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
		expect(page?.parameters.properties.action.enum).toEqual(["list", "open", "select", "snapshot", "screenshot", "click", "fill", "close"]);
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

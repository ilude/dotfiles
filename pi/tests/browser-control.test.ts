import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockPi } from "./helpers/mock-pi";
import registerBrowserControl, { parseSetupArgs, safeUrl } from "../extensions/browser-control";
import {
	BrowserControlError,
	BrowserSessionProtocol,
	braveUserDataRoots,
	discoverBraveProfiles,
	invalidateComparison,
	isPasswordField,
	resolveConfiguredProfile,
	restartAuthorization,
	validateBrowserConfig,
	writeBrowserConfig,
} from "../lib/browser-control";

const temporary: string[] = [];
afterEach(() => {
	vi.restoreAllMocks();
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
});

describe("session and page boundaries", () => {
	it("binds restart authorization to the complete occupied tuple", () => {
		const first = restartAuthorization(state());
		expect(restartAuthorization(state({ processStartTime: "start-2" }))).not.toBe(first);
		expect(restartAuthorization(state({ cdpPort: 9333 }))).not.toBe(first);
	});

	it("uses only the ownership wrapper for start, status, and stop", async () => {
		const run = vi.fn(async () => ({ code: 0, stdout: "close-owned: stopped", stderr: "" }));
		const protocol = new BrowserSessionProtocol({ run }, "wrapper.py");
		await protocol.start({ profileMode: "real", profileAlias: "research", extensionMode: "disabled", url: "https://example.test" });
		await protocol.status();
		await protocol.stop();
		expect(run.mock.calls.map((call) => call[1])).toEqual([
			["wrapper.py", "--open", "https://example.test", "--extensions", "disabled", "--real-brave-profile", "research"],
			["wrapper.py", "--status"],
			["wrapper.py", "--close-owned"],
		]);
	});

	it("invalidates comparisons and drops selected targets after protected continuation", () => {
		const invalidated = invalidateComparison(state({ comparisonGeneration: 7 }), "CAPTCHA detected");
		expect(invalidated.comparisonGeneration).toBe(8);
		expect(invalidated.targetId).toBeUndefined();
		expect(invalidated.comparisonInvalidatedReason).toBe("CAPTCHA detected");
		expect(isPasswordField("input[name=credential_token]")).toBe(true);
	});

	it("registers bounded tools and excludes cookie, storage, and evaluation actions", () => {
		const pi = createMockPi();
		registerBrowserControl(pi as never);
		expect(pi._getTool("browser_session")).toBeDefined();
		const page = pi._getTool("browser_page");
		expect(page).toBeDefined();
		expect(page?.parameters.properties.action.enum).toEqual(["list", "open", "select", "snapshot", "screenshot", "click", "fill", "close"]);
		expect(pi._commands.map((command) => command.name)).toContain("browser-setup");
	});

	it("accepts only secret-free JSON setup fields and redacts URL queries", () => {
		expect(parseSetupArgs('{"alias":"research","profileDirectory":"Profile 1","extensionsExpected":false}')).toMatchObject({ alias: "research", extensionsExpected: false });
		expect(() => parseSetupArgs('{"alias":"x","profileDirectory":"Default","password":"secret"}')).toThrowError(expect.objectContaining({ code: "invalid_setup" }));
		expect(safeUrl("https://example.test/results?q=private#fragment")).toBe("https://example.test/results");
	});
});

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockPi } from "./helpers/mock-pi";
import registerProviderCommand, {
	describeConfiguredProviders,
	parseProviderCommand,
	resolveProvider,
} from "../extensions/provider";

describe("parseProviderCommand", () => {
	it("parses interactive default", () => {
		expect(parseProviderCommand("")).toEqual({ action: "interactive" });
	});

	it("parses list/remove/set", () => {
		expect(parseProviderCommand("list")).toEqual({ action: "list" });
		expect(parseProviderCommand("remove opencode")).toEqual({ action: "remove", provider: "opencode" });
		expect(parseProviderCommand("openrouter")).toEqual({ action: "set", provider: "openrouter" });
	});

	it("rejects invalid forms", () => {
		expect(() => parseProviderCommand("remove")).toThrow("Usage: /provider remove <provider>");
		expect(() => parseProviderCommand("a b")).toThrow("Usage: /provider [list|remove <provider>|<provider>]");
	});
});

describe("resolveProvider", () => {
	it("resolves by id and label (case-insensitive)", () => {
		expect(resolveProvider("opencode")?.id).toBe("opencode");
		expect(resolveProvider("OPENCODE")?.id).toBe("opencode");
		expect(resolveProvider("OpenCode Zen")?.id).toBe("opencode");
	});
});

describe("describeConfiguredProviders", () => {
	it("renders provider/type list", () => {
		const authStorage = {
			list: () => ["opencode", "anthropic"],
			get: (id: string) => (id === "anthropic" ? { type: "oauth" } : { type: "api_key", key: "x" }),
		};
		expect(describeConfiguredProviders(authStorage)).toBe("Configured providers: anthropic (oauth), opencode (api_key)");
	});
});

describe("/provider command", () => {
	let mockPi: ReturnType<typeof createMockPi>;

	beforeEach(() => {
		mockPi = createMockPi();
		registerProviderCommand(mockPi as any);
	});

	it("registers command", () => {
		expect(mockPi._commands.find((command) => command.name === "provider")).toBeDefined();
	});

	it("sets api key in auth storage", async () => {
		const cmd = mockPi._commands.find((command) => command.name === "provider");
		if (!cmd) throw new Error("provider command missing");

		const set = vi.fn();
		const notify = vi.fn();
		const ctx = {
			ui: {
				notify,
				input: vi.fn(async () => " test-key "),
				select: vi.fn(async () => undefined),
				confirm: vi.fn(async () => false),
			},
			modelRegistry: {
				authStorage: {
					set,
					remove: vi.fn(),
					get: vi.fn(),
					list: vi.fn(() => []),
				},
			},
		};

		await cmd.handler("opencode", ctx as any);
		expect(set).toHaveBeenCalledWith("opencode", { type: "api_key", key: "test-key" });
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("Saved API key for opencode"), "info");
	});

	it("oauth provider routes to /login guidance", async () => {
		const cmd = mockPi._commands.find((command) => command.name === "provider");
		if (!cmd) throw new Error("provider command missing");

		const notify = vi.fn();
		const ctx = {
			ui: {
				notify,
				input: vi.fn(async () => ""),
				select: vi.fn(async () => undefined),
				confirm: vi.fn(async () => false),
			},
			modelRegistry: {
				authStorage: {
					set: vi.fn(),
					remove: vi.fn(),
					get: vi.fn(),
					list: vi.fn(() => []),
				},
			},
		};

		await cmd.handler("anthropic", ctx as any);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("uses OAuth. Run /login"), "warning");
	});

	it("removes provider credentials", async () => {
		const cmd = mockPi._commands.find((command) => command.name === "provider");
		if (!cmd) throw new Error("provider command missing");

		const remove = vi.fn();
		const notify = vi.fn();
		const ctx = {
			ui: {
				notify,
				input: vi.fn(async () => ""),
				select: vi.fn(async () => undefined),
				confirm: vi.fn(async () => true),
			},
			modelRegistry: {
				authStorage: {
					set: vi.fn(),
					remove,
					get: vi.fn(() => ({ type: "api_key", key: "x" })),
					list: vi.fn(() => ["opencode"]),
				},
			},
		};

		await cmd.handler("remove opencode", ctx as any);
		expect(remove).toHaveBeenCalledWith("opencode");
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("Removed credentials for opencode"), "info");
	});
});

// ---------------------------------------------------------------------------
// T4 fixture-based parity test (Phase 2 Wave 2):
//
// The redacted auth.json baseline at pi/tests/fixtures/auth-baseline.json was
// captured BEFORE any provider.ts refactor began. The expected parsed shape
// at pi/tests/fixtures/auth-baseline-parsed.json was captured by running the
// pre-refactor parser against that baseline (see _capture-baseline.mjs).
//
// This test deep-equals the post-refactor parser's output against the
// COMMITTED expected fixture. Generating expected from the post-refactor
// parser would be tautological and would not catch a regression.
// ---------------------------------------------------------------------------

describe("provider.ts auth-baseline parity (T4 fixture)", () => {
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = path.dirname(__filename);
	const fixturesDir = path.join(__dirname, "fixtures");
	const inputPath = path.join(fixturesDir, "auth-baseline.json");
	const expectedPath = path.join(fixturesDir, "auth-baseline-parsed.json");

	it("describeConfiguredProviders + per-provider lookup match the committed pre-refactor expected", () => {
		const auth = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
		const expected = JSON.parse(fs.readFileSync(expectedPath, "utf-8"));

		const storage = {
			list: () => Object.keys(auth),
			get: (id: string) => auth[id],
		};

		const actual = {
			round_trip: auth,
			describe: describeConfiguredProviders(storage),
			per_provider: Object.fromEntries(Object.keys(auth).map((id) => [id, storage.get(id)])),
		};

		expect(actual).toEqual(expected);
	});
});
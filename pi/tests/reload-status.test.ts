import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	createReloadStatusState,
	defaultReloadCandidateRoots,
	needsPiReload,
	RELOAD_SCAN_INTERVAL_MS,
	resetReloadStatusBaseline,
} from "../lib/reload-status";

const tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-reload-status-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs.splice(0))
		fs.rmSync(dir, { recursive: true, force: true });
});

describe("reload status detector", () => {
	it("does not flag unchanged candidates", () => {
		const dir = makeTempDir();
		const candidate = path.join(dir, "operator-status.ts");
		fs.writeFileSync(candidate, "export {};\n");
		const state = createReloadStatusState(Date.now() + 60_000);

		expect(
			needsPiReload({
				state,
				roots: [{ path: dir, recursive: true }],
				nowMs: 3_000,
			}),
		).toBe(false);
	});

	it("flags changed candidates", () => {
		const dir = makeTempDir();
		const candidate = path.join(dir, "operator-status.ts");
		fs.writeFileSync(candidate, "export {};\n");
		const state = createReloadStatusState(0);

		expect(
			needsPiReload({
				state,
				roots: [{ path: dir, recursive: true }],
				nowMs: 6_000,
			}),
		).toBe(true);
	});

	it("uses cached state inside the throttle window", () => {
		const dir = makeTempDir();
		const candidate = path.join(dir, "operator-status.ts");
		fs.writeFileSync(candidate, "export {};\n");
		const state = createReloadStatusState(0);

		expect(
			needsPiReload({
				state,
				roots: [{ path: dir, recursive: true }],
				nowMs: 10_000,
			}),
		).toBe(true);
		resetReloadStatusBaseline(state, Date.now() + 60_000);
		state.lastScanMs = 10_000;
		state.cachedNeedsReload = true;
		expect(
			needsPiReload({
				state,
				roots: [{ path: dir, recursive: true }],
				nowMs: 10_000 + RELOAD_SCAN_INTERVAL_MS - 1,
			}),
		).toBe(true);
	});

	it("resets after reload baseline update", () => {
		const dir = makeTempDir();
		const candidate = path.join(dir, "operator-status.ts");
		fs.writeFileSync(candidate, "export {};\n");
		const state = createReloadStatusState(0);

		expect(
			needsPiReload({
				state,
				roots: [{ path: dir, recursive: true }],
				nowMs: 6_000,
			}),
		).toBe(true);
		resetReloadStatusBaseline(state, Date.now() + 60_000);
		expect(
			needsPiReload({
				state,
				roots: [{ path: dir, recursive: true }],
				nowMs: 20_000,
			}),
		).toBe(false);
	});

	it("ignores settings changes limited to model, provider, thinking, and changelog keys", () => {
		const dir = makeTempDir();
		const candidate = path.join(dir, "settings.json");
		fs.writeFileSync(
			candidate,
			JSON.stringify({
				defaultModel: "gpt-5",
				defaultProvider: "openai",
				defaultThinkingLevel: "high",
				hooks: ["keep"],
			}),
		);
		const state = createReloadStatusState(0);
		state.settingsBaselineFingerprintByPath.set(
			path.resolve(candidate),
			JSON.stringify({ hooks: ["keep"] }),
		);

		fs.writeFileSync(
			candidate,
			JSON.stringify({
				defaultModel: "gpt-6",
				defaultProvider: "anthropic",
				defaultThinkingLevel: "low",
				hooks: ["keep"],
			}),
		);

		expect(
			needsPiReload({
				state,
				roots: [{ path: candidate, recursive: false }],
				nowMs: 6_000,
			}),
		).toBe(false);
	});

	it("still flags reload-relevant settings changes", () => {
		const dir = makeTempDir();
		const candidate = path.join(dir, "settings.json");
		fs.writeFileSync(candidate, JSON.stringify({ hooks: ["before"] }));
		const state = createReloadStatusState(0);
		state.settingsBaselineFingerprintByPath.set(
			path.resolve(candidate),
			JSON.stringify({ hooks: ["before"] }),
		);

		fs.writeFileSync(candidate, JSON.stringify({ hooks: ["after"] }));

		expect(
			needsPiReload({
				state,
				roots: [{ path: candidate, recursive: false }],
				nowMs: 6_000,
			}),
		).toBe(true);
	});

	it("bounds traversal to explicit reload roots and excludes generated state", () => {
		const home = makeTempDir();
		const roots = defaultReloadCandidateRoots(home);
		const rootPaths = roots.map((root) => root.path.replaceAll("\\", "/"));

		expect(rootPaths).toContain(
			`${home.replaceAll("\\", "/")}/.dotfiles/pi/extensions`,
		);
		expect(rootPaths).toContain(
			`${home.replaceAll("\\", "/")}/.dotfiles/pi/settings.json`,
		);
		expect(rootPaths.some((root) => root.endsWith("/.dotfiles/pi"))).toBe(
			false,
		);
		expect(rootPaths.some((root) => root.includes("prompt-routing"))).toBe(
			false,
		);
	});
});

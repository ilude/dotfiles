import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, statSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ProfileReload } from "../lib/profile-reload.ts";
import registerReload from "../extensions/profile-reload.ts";
import { createEventBus } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/event-bus.js";
import { requestReloadState } from "../lib/profile-reload-events.ts";

let dir: string;
let service: ProfileReload;
beforeEach(() => { vi.useFakeTimers(); dir = mkdtempSync(join(tmpdir(), "profile-reload-")); service = new ProfileReload(); });
afterEach(() => { service.stop(); vi.useRealTimers(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
const scope = () => ({ agentDir: dir, cwd: dir, home: dir, projectTrusted: false, projectConfigDir: ".pi" });

it("detects changes at two seconds, resets the baseline and cleans up subscriptions/timers", () => {
	const settings = join(dir, "settings.json"); writeFileSync(settings, "{}");
	const changed = vi.fn(); const unsubscribe = service.subscribe(changed);
	service.start(scope(), vi.fn()); changed.mockClear();
	writeFileSync(settings, '{"changed":true}');
	vi.advanceTimersByTime(1999); expect(service.needed).toBe(false);
	vi.advanceTimersByTime(1); expect(service.shouldReload).toBe(true); expect(changed).toHaveBeenCalledTimes(1);
	service.start(scope(), vi.fn()); expect(service.needed).toBe(false); expect(vi.getTimerCount()).toBe(1);
	unsubscribe(); changed.mockClear(); writeFileSync(settings, "{}"); vi.advanceTimersByTime(2000);
	expect(changed).not.toHaveBeenCalled();
	service.stop(); service.stop(); expect(vi.getTimerCount()).toBe(0);
});

it("ignores metadata-only changes but detects same-size content edits with restored mtime", () => {
	mkdirSync(join(dir, "extensions"));
	const file = join(dir, "extensions", "example.ts");
	writeFileSync(file, "before");
	service.start(scope(), vi.fn());
	const original = statSync(file);
	utimesSync(file, original.atime, new Date(original.mtimeMs + 60_000));
	vi.advanceTimersByTime(2000);
	expect(service.needed).toBe(false);
	writeFileSync(file, "after!");
	utimesSync(file, original.atime, original.mtime);
	vi.advanceTimersByTime(2000);
	expect(service.needed).toBe(true);
	writeFileSync(file, "before");
	vi.advanceTimersByTime(2000);
	expect(service.needed).toBe(false);
});

it("ignores live settings and formatting but retains resource and catalog changes", () => {
	const file = join(dir, "settings.json");
	writeFileSync(file, JSON.stringify({ extensions: ["extension.ts"], enabledModels: ["provider/model"] }));
	service.start(scope(), vi.fn());
	const settings = {
		enabledModels: ["provider/model"], extensions: ["extension.ts"],
		defaultModel: "new-model", defaultProvider: "new-provider", defaultThinkingLevel: "high", lastChangelogVersion: "new-version",
	};
	writeFileSync(file, JSON.stringify(settings, null, 2));
	vi.advanceTimersByTime(2000);
	expect(service.needed).toBe(false);
	for (const change of [{ extensions: ["other.ts"] }, { enabledModels: ["provider/other"] }, { providers: { custom: {} } }]) {
		writeFileSync(file, JSON.stringify({ ...settings, ...change }));
		vi.advanceTimersByTime(2000);
		expect(service.needed).toBe(true);
	}
	writeFileSync(file, "invalid JSON");
	vi.advanceTimersByTime(2000);
	expect(service.error).toBeTruthy();
	writeFileSync(file, JSON.stringify(settings));
	vi.advanceTimersByTime(2000);
	expect(service.error).toBeUndefined();
	expect(service.needed).toBe(false);
});

it("detects resource additions and deletions regardless of their timestamps", () => {
	mkdirSync(join(dir, "extensions"));
	const file = join(dir, "extensions", "example.ts");
	service.start(scope(), vi.fn());
	writeFileSync(file, "resource");
	utimesSync(file, new Date(0), new Date(0));
	vi.advanceTimersByTime(2000);
	expect(service.needed).toBe(true);
	service.start(scope(), vi.fn());
	rmSync(file);
	vi.advanceTimersByTime(2000);
	expect(service.needed).toBe(true);
});

it("reports initialization errors once and clears them after a successful reset", () => {
	writeFileSync(join(dir, "settings.json"), "invalid JSON");
	const report = vi.fn(); service.start(scope(), report);
	expect(service.error).toBeTruthy(); expect(service.shouldReload).toBe(false);
	vi.advanceTimersByTime(4000); expect(report).toHaveBeenCalledTimes(1);
	writeFileSync(join(dir, "settings.json"), "{}"); service.start(scope(), report);
	expect(service.error).toBeUndefined(); expect(service.needed).toBe(false);
});

it("registers independent session lifecycle and watches profile lib files without a footer", async () => {
	vi.stubEnv("PI_CODING_AGENT_DIR", dir);
	mkdirSync(join(dir, "lib")); const file = join(dir, "lib", "example.ts"); writeFileSync(file, "before");
	const hooks = new Map<string, (...args: any[]) => any>();
	const events = createEventBus();
	registerReload({ events, on: (name: string, hook: (...args: any[]) => any) => hooks.set(name, hook), getCommands: () => [], getAllTools: () => [] } as unknown as ExtensionAPI);
	const ctx = { cwd: dir, isProjectTrusted: () => false, ui: { getAllThemes: () => [], notify: vi.fn() } };
	await hooks.get("session_start")!({}, ctx);
	writeFileSync(file, "after, changed"); vi.advanceTimersByTime(2000);
	expect(requestReloadState({ events })?.needed).toBe(true);
	await hooks.get("session_shutdown")!({}, ctx); expect(vi.getTimerCount()).toBe(0);
	expect(requestReloadState({ events })).toBeUndefined();
});

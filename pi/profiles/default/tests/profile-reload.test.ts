import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
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

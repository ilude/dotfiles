import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, statSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ProfileReload } from "../lib/profile-reload.ts";
import { reloadRoots, ReloadMonitor } from "../lib/reload-monitor.ts";
import registerReload from "../extensions/profile-reload.ts";
import { createEventBus } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/event-bus.js";
import { requestReloadState } from "../lib/profile-reload-events.ts";

let dir: string;
let service: ProfileReload;
beforeEach(() => { vi.useFakeTimers(); dir = mkdtempSync(join(tmpdir(), "profile-reload-")); service = new ProfileReload(undefined, 2_000); });
afterEach(() => { service.stop(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
const scope = () => ({ agentDir: dir, cwd: dir, home: dir, projectTrusted: false, projectConfigDir: ".pi" });
const advance = async (ms: number) => {
	await vi.advanceTimersByTimeAsync(ms);
	await service.refresh();
};

it("detects changes at two seconds, resets the baseline and cleans up subscriptions/timers", async () => {
	const settings = join(dir, "settings.json"); writeFileSync(settings, "{}");
	const changed = vi.fn(); const unsubscribe = service.subscribe(changed);
	await service.start(scope(), vi.fn()); changed.mockClear();
	writeFileSync(settings, '{"changed":true}');
	await vi.advanceTimersByTimeAsync(1999); expect(service.needed).toBe(false);
	await advance(1); expect(service.shouldReload).toBe(true); expect(changed).toHaveBeenCalledTimes(1);
	await service.start(scope(), vi.fn()); expect(service.needed).toBe(false); expect(vi.getTimerCount()).toBe(1);
	unsubscribe(); changed.mockClear(); writeFileSync(settings, "{}"); await advance(2000);
	expect(changed).not.toHaveBeenCalled();
	service.stop(); service.stop(); expect(vi.getTimerCount()).toBe(0);
});

it("ignores metadata-only changes but detects same-size content edits with restored mtime", async () => {
	mkdirSync(join(dir, "extensions"));
	const file = join(dir, "extensions", "example.ts"); writeFileSync(file, "before");
	await service.start(scope(), vi.fn());
	const original = statSync(file);
	utimesSync(file, original.atime, new Date(original.mtimeMs + 60_000)); await advance(2000);
	expect(service.needed).toBe(false);
	writeFileSync(file, "after!"); utimesSync(file, original.atime, original.mtime); await advance(2000);
	expect(service.needed).toBe(true);
	writeFileSync(file, "before"); await advance(2000); expect(service.needed).toBe(false);
});

it("ignores live settings and formatting but retains resource and catalog changes", async () => {
	const file = join(dir, "settings.json");
	writeFileSync(file, JSON.stringify({ extensions: ["extension.ts"], enabledModels: ["provider/model"] }));
	await service.start(scope(), vi.fn());
	const settings = { enabledModels: ["provider/model"], extensions: ["extension.ts"], defaultModel: "new-model", defaultProvider: "new-provider", defaultThinkingLevel: "high", lastChangelogVersion: "new-version" };
	writeFileSync(file, JSON.stringify(settings, null, 2)); await advance(2000); expect(service.needed).toBe(false);
	for (const change of [{ extensions: ["other.ts"] }, { enabledModels: ["provider/other"] }, { providers: { custom: {} } }]) {
		writeFileSync(file, JSON.stringify({ ...settings, ...change })); await advance(2000); expect(service.needed).toBe(true);
	}
	writeFileSync(file, "invalid JSON"); await advance(2000); expect(service.error).toBeTruthy();
	writeFileSync(file, JSON.stringify(settings)); await advance(2000); expect(service.error).toBeUndefined(); expect(service.needed).toBe(false);
});

it("detects resource additions and deletions regardless of their timestamps", async () => {
	mkdirSync(join(dir, "extensions")); const file = join(dir, "extensions", "example.ts");
	await service.start(scope(), vi.fn()); writeFileSync(file, "resource"); utimesSync(file, new Date(0), new Date(0));
	await advance(2000); expect(service.needed).toBe(true);
	await service.start(scope(), vi.fn()); rmSync(file); await advance(2000); expect(service.needed).toBe(true);
});

it("watches skill definitions but ignores support files that reload does not load", async () => {
	const skill = join(dir, "skills", "example"); mkdirSync(join(skill, "references"), { recursive: true });
	writeFileSync(join(skill, "SKILL.md"), "before"); const reference = join(skill, "references", "notes.md"); writeFileSync(reference, "before");
	await service.start(scope(), vi.fn()); writeFileSync(reference, "after"); await advance(2000); expect(service.needed).toBe(false);
	writeFileSync(join(skill, "SKILL.md"), "after"); await advance(2000); expect(service.needed).toBe(true);
});

it("detects a newly discovered nested skill", async () => {
	mkdirSync(join(dir, "skills")); await service.start(scope(), vi.fn());
	const skill = join(dir, "skills", "new-skill"); mkdirSync(skill); writeFileSync(join(skill, "SKILL.md"), "new");
	await advance(2000); expect(service.needed).toBe(true);
});

it("reports initialization errors once and clears them after a successful reset", async () => {
	writeFileSync(join(dir, "settings.json"), "invalid JSON"); const report = vi.fn();
	await service.start(scope(), report); expect(service.error).toBeTruthy(); expect(service.shouldReload).toBe(false);
	await advance(4000); expect(report).toHaveBeenCalledTimes(1);
	writeFileSync(join(dir, "settings.json"), "{}"); await service.start(scope(), report);
	expect(service.error).toBeUndefined(); expect(service.needed).toBe(false);
});

it("filters loaded provenance to first-party code, including only the shared adapter, and excludes themes", async () => {
	const profile = join(dir, "repo", "pi", "profiles", "default");
	const repository = resolve(profile, "../../..");
	const adapter = join(repository, "modules", "onclave", "extensions", "onclave-pi", "src", "connection.ts");
	const owned = join(profile, "extensions", "own.ts");
	const thirdParty = join(dir, "pnpm", "global", "example", "index.js");
	const themes = join(profile, "themes");
	const roots = await reloadRoots({ agentDir: profile, cwd: dir, home: dir, projectTrusted: false, projectConfigDir: ".pi", loadedPaths: [adapter, owned, thirdParty, themes] });
	expect(roots).toContain(resolve(adapter)); expect(roots).toContain(resolve(owned));
	expect(roots).not.toContain(resolve(thirdParty)); expect(roots).not.toContain(resolve(themes));
});

it("serializes refreshes and catches an edit made during an in-flight scan", async () => {
	mkdirSync(join(dir, "extensions")); const file = join(dir, "extensions", "during-scan.ts"); writeFileSync(file, "before");
	let release!: () => void; let entered!: () => void;
	const gate = new Promise<void>(resolve => { release = resolve; });
	const reached = new Promise<void>(resolve => { entered = resolve; });
	let hold = false; let active = 0; let maxActive = 0;
	class DeferredMonitor extends ReloadMonitor {
		async check(): Promise<void> {
			active++; maxActive = Math.max(maxActive, active);
			if (hold) { hold = false; entered(); await gate; }
			try { await super.check(); } finally { active--; }
		}
	}
	service = new ProfileReload(new DeferredMonitor(), 2_000);
	await service.start(scope(), vi.fn()); hold = true;
	const first = service.refresh(); await reached;
	writeFileSync(file, "changed while scan was in flight");
	const current = service.refresh(); release(); await Promise.all([first, current]);
	expect(service.needed).toBe(true); expect(maxActive).toBe(1);
});

it("ignores theme edits and third-party loaded package paths", async () => {
	const themeDir = join(dir, "themes"); const packageDir = join(dir, "pnpm", "package");
	mkdirSync(themeDir); mkdirSync(packageDir, { recursive: true });
	const theme = join(themeDir, "theme.json"); const packageFile = join(packageDir, "index.js");
	writeFileSync(theme, "before"); writeFileSync(packageFile, "before");
	await service.start({ ...scope(), loadedPaths: [theme, packageFile] }, vi.fn());
	writeFileSync(theme, "after"); writeFileSync(packageFile, "after"); await service.refresh();
	expect(service.needed).toBe(false);
});

it("ignores a superseded session scan and serializes a rebind", async () => {
	const file = join(dir, "settings.json"); writeFileSync(file, "{}");
	const firstScope = { ...scope(), cwd: join(dir, "first") }; const secondScope = scope();
	const first = service.start(firstScope, vi.fn());
	const second = service.start(secondScope, vi.fn());
	await Promise.all([first, second]);
	writeFileSync(file, '{"providers":{"new":{}}}'); await service.refresh();
	expect(service.needed).toBe(true);
});

it("registers independent session lifecycle and watches profile lib files without a footer", async () => {
	vi.stubEnv("PI_CODING_AGENT_DIR", dir);
	mkdirSync(join(dir, "lib")); const file = join(dir, "lib", "example.ts"); writeFileSync(file, "before");
	const hooks = new Map<string, (...args: any[]) => any>(); const events = createEventBus();
	registerReload({ events, on: (name: string, hook: (...args: any[]) => any) => hooks.set(name, hook), getCommands: () => [], getAllTools: () => [] } as unknown as ExtensionAPI);
	const ctx = { cwd: dir, isProjectTrusted: () => false, ui: { getAllThemes: () => [], notify: vi.fn() } };
	await hooks.get("session_start")!({}, ctx); await vi.advanceTimersByTimeAsync(0);
	await new Promise(resolve => events.emit("default:profile-reload:refresh", resolve));
	writeFileSync(file, "after, changed"); await advance(15_000);
	await new Promise(resolve => events.emit("default:profile-reload:refresh", resolve));
	expect(requestReloadState({ events })?.needed).toBe(true);
	await hooks.get("session_shutdown")!({}, ctx); expect(vi.getTimerCount()).toBe(0);
	expect(requestReloadState({ events })).toBeUndefined();
});

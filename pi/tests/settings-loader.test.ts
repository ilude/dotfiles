import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	getProjectLocalSettingsPath,
	getProjectSettingsPath,
	getUserSettingsPath,
	invalidateSettingsCache,
	loadCascadedSettings,
	mergeSettings,
	readMergedSettings,
	getSetting,
} from "../lib/settings-loader.js";

let tmpRoot: string;
let projectRoot: string;
let userPath: string;

function writeJson(p: string, data: unknown) {
	fs.mkdirSync(path.dirname(p), { recursive: true });
	fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf-8");
}

beforeEach(() => {
	tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-settings-loader-"));
	projectRoot = path.join(tmpRoot, "project");
	fs.mkdirSync(projectRoot, { recursive: true });
	userPath = path.join(tmpRoot, "user-settings.json");
	invalidateSettingsCache();
});

afterEach(() => {
	invalidateSettingsCache();
	fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("path helpers", () => {
	it("derives project paths from project root", () => {
		expect(getProjectSettingsPath("/x/y")).toBe(path.join("/x/y", ".pi", "settings.json"));
		expect(getProjectLocalSettingsPath("/x/y")).toBe(
			path.join("/x/y", ".pi", "settings.local.json"),
		);
	});

	it("default user path is ~/.pi/agent/settings.json", () => {
		expect(getUserSettingsPath()).toBe(path.join(os.homedir(), ".pi", "agent", "settings.json"));
	});
});

describe("mergeSettings", () => {
	it("scalar wins per source order (last wins)", () => {
		const a = { model: "haiku", flag: true };
		const b = { model: "sonnet" };
		expect(mergeSettings(a, b)).toEqual({ model: "sonnet", flag: true });
	});

	it("nested objects merge deeply", () => {
		const a = { router: { effort: { max: "high" }, policy: { holdTurns: 0 } } };
		const b = { router: { policy: { holdTurns: 3, k: 2 } } };
		expect(mergeSettings(a, b)).toEqual({
			router: { effort: { max: "high" }, policy: { holdTurns: 3, k: 2 } },
		});
	});

	it("non-append-list arrays are replaced", () => {
		const a = { models: ["a", "b"] };
		const b = { models: ["c"] };
		expect(mergeSettings(a, b)).toEqual({ models: ["c"] });
	});

	it("hooks array appends", () => {
		const a = { hooks: [{ event: "tool_call", hooks: [{ type: "command", command: "x" }] }] };
		const b = { hooks: [{ event: "session_start", hooks: [{ type: "command", command: "y" }] }] };
		const merged = mergeSettings(a, b) as { hooks: unknown[] };
		expect(merged.hooks.length).toBe(2);
	});

	it("permissions array appends", () => {
		const a = { permissions: ["Bash(git *)"] };
		const b = { permissions: ["Read(*.ts)"] };
		expect(mergeSettings(a, b)).toEqual({ permissions: ["Bash(git *)", "Read(*.ts)"] });
	});
});

describe("loadCascadedSettings", () => {
	it("returns empty merged when no sources exist", () => {
		const result = loadCascadedSettings({ projectRoot, skipUser: true });
		expect(result.merged).toEqual({});
		expect(result.sources.user.loaded).toBe(false);
		expect(result.sources.project.loaded).toBe(false);
		expect(result.sources.local.loaded).toBe(false);
	});

	it("loads project-level settings when present", () => {
		writeJson(getProjectSettingsPath(projectRoot), { model: "sonnet" });
		const result = loadCascadedSettings({ projectRoot, skipUser: true });
		expect(result.sources.project.loaded).toBe(true);
		expect(result.merged).toEqual({ model: "sonnet" });
	});

	it("project-local overrides project for scalars", () => {
		writeJson(getProjectSettingsPath(projectRoot), { model: "sonnet", flag: true });
		writeJson(getProjectLocalSettingsPath(projectRoot), { model: "opus" });
		const result = loadCascadedSettings({ projectRoot, skipUser: true });
		expect(result.merged).toEqual({ model: "opus", flag: true });
	});

	it("user file is loaded when userPath is provided", () => {
		writeJson(userPath, { router: { effort: { maxLevel: "high" } } });
		const result = loadCascadedSettings({ projectRoot, userPath, skipProject: true, skipLocal: true });
		expect(result.sources.user.loaded).toBe(true);
		expect((result.merged.router as any).effort.maxLevel).toBe("high");
	});

	it("project file overrides user file for scalars", () => {
		writeJson(userPath, { model: "haiku", flag: false });
		writeJson(getProjectSettingsPath(projectRoot), { model: "sonnet" });
		const result = loadCascadedSettings({ projectRoot, userPath, skipLocal: true });
		expect(result.merged).toEqual({ model: "sonnet", flag: false });
	});

	it("array-append keys concatenate user -> project -> local", () => {
		writeJson(userPath, { hooks: [{ event: "tool_call", hooks: [{ type: "command", command: "u" }] }] });
		writeJson(getProjectSettingsPath(projectRoot), {
			hooks: [{ event: "session_start", hooks: [{ type: "command", command: "p" }] }],
		});
		writeJson(getProjectLocalSettingsPath(projectRoot), {
			hooks: [{ event: "input", hooks: [{ type: "command", command: "l" }] }],
		});
		const result = loadCascadedSettings({ projectRoot, userPath });
		const hooks = result.merged.hooks as Array<{ hooks: Array<{ command: string }> }>;
		expect(hooks.length).toBe(3);
		expect(hooks[0].hooks[0].command).toBe("u");
		expect(hooks[1].hooks[0].command).toBe("p");
		expect(hooks[2].hooks[0].command).toBe("l");
	});

	it("permissions array follows the same append cascade", () => {
		writeJson(userPath, { permissions: ["Bash(git *)"] });
		writeJson(getProjectSettingsPath(projectRoot), { permissions: ["Read(*.ts)"] });
		writeJson(getProjectLocalSettingsPath(projectRoot), { permissions: ["Write(.local/**)"] });
		const result = loadCascadedSettings({ projectRoot, userPath });
		expect(result.merged.permissions).toEqual([
			"Bash(git *)",
			"Read(*.ts)",
			"Write(.local/**)",
		]);
	});

	it("captures parse errors per source without throwing", () => {
		const projectPath = getProjectSettingsPath(projectRoot);
		fs.mkdirSync(path.dirname(projectPath), { recursive: true });
		fs.writeFileSync(projectPath, "not json garbage", "utf-8");
		const result = loadCascadedSettings({ projectRoot, skipUser: true });
		expect(result.sources.project.loaded).toBe(false);
		expect(result.sources.project.error).toBeDefined();
		expect(result.merged).toEqual({});
	});

	it("caches results and invalidate forces reload", () => {
		writeJson(getProjectSettingsPath(projectRoot), { model: "sonnet" });
		const a = loadCascadedSettings({ projectRoot, skipUser: true });
		writeJson(getProjectSettingsPath(projectRoot), { model: "opus" });
		const b = loadCascadedSettings({ projectRoot, skipUser: true });
		expect(b).toBe(a); // same cache reference
		invalidateSettingsCache();
		const c = loadCascadedSettings({ projectRoot, skipUser: true });
		expect(c.merged).toEqual({ model: "opus" });
	});
});

describe("getSetting / readMergedSettings", () => {
	it("returns default when key is missing", () => {
		const v = getSetting("missing.key", "fallback", { projectRoot, skipUser: true });
		expect(v).toBe("fallback");
	});

	it("reads top-level keys", () => {
		writeJson(getProjectSettingsPath(projectRoot), { model: "sonnet" });
		expect(getSetting("model", "haiku", { projectRoot, skipUser: true })).toBe("sonnet");
	});

	it("readMergedSettings returns the merged object", () => {
		writeJson(getProjectSettingsPath(projectRoot), { a: 1 });
		writeJson(getProjectLocalSettingsPath(projectRoot), { b: 2 });
		expect(readMergedSettings({ projectRoot, skipUser: true })).toEqual({ a: 1, b: 2 });
	});
});

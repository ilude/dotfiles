/**
 * Settings loader -- 3-source cascade for pi.
 *
 * Owned by .specs/pi-platform-alignment/plan.md (Phase 1 T3). Centralizes
 * what was previously ad-hoc settings reads in individual extensions
 * (agent-chain, prompt-router, session-hooks, etc.). Today's call sites
 * read a single file; the cascade lets a project override or extend the
 * user-level config.
 *
 * Source order (highest precedence wins for scalars; arrays append):
 *
 *   1. project-local: <project>/.pi/settings.local.json   (gitignored)
 *   2. project:       <project>/.pi/settings.json         (committed)
 *   3. user:          ~/.pi/agent/settings.json
 *
 * Merge semantics:
 *
 *   - Plain values (string/number/bool/null): last source wins (project-local
 *     overrides project overrides user). This matches Claude Code's
 *     last-writer-wins for scalars.
 *   - Arrays: concatenate in source order (user first, then project, then
 *     project-local). The `hooks` and `permissions` keys are the canonical
 *     array-append targets.
 *   - Objects: deep-merged with the same per-key rules.
 *
 * The loader caches results per project root. Call invalidateSettingsCache()
 * after writing a settings file in the same process if you need a re-read.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { getAgentDir } from "./extension-utils.ts";

export interface SettingsSourceInfo {
	path: string;
	loaded: boolean;
	error?: string;
}

export interface CascadedSettings {
	merged: Record<string, unknown>;
	sources: {
		user: SettingsSourceInfo;
		project: SettingsSourceInfo;
		local: SettingsSourceInfo;
	};
}

export interface LoadSettingsOptions {
	projectRoot?: string;
	/** Override the user-level settings path. Use sparingly -- intended for
	 * tests and a transitional bridge for extensions that historically read
	 * from a non-default location (e.g., `~/.dotfiles/pi/settings.json`). */
	userPath?: string;
	skipUser?: boolean;
	skipProject?: boolean;
	skipLocal?: boolean;
}

const ARRAY_APPEND_KEYS: ReadonlySet<string> = new Set(["hooks", "permissions"]);

let cache = new Map<string, CascadedSettings>();

export function invalidateSettingsCache(): void {
	cache = new Map();
}

export function getUserSettingsPath(): string {
	return path.join(getAgentDir(), "settings.json");
}

export function getProjectSettingsPath(projectRoot: string): string {
	return path.join(projectRoot, ".pi", "settings.json");
}

export function getProjectLocalSettingsPath(projectRoot: string): string {
	return path.join(projectRoot, ".pi", "settings.local.json");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readJsonFile(filePath: string): { data?: unknown; error?: string; loaded: boolean } {
	if (!fs.existsSync(filePath)) return { loaded: false };
	try {
		const raw = fs.readFileSync(filePath, "utf-8");
		const parsed = JSON.parse(raw);
		return { data: parsed, loaded: true };
	} catch (err) {
		return {
			loaded: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

/**
 * Merge `b` into `a`. Returns a new object; inputs are not mutated.
 *
 * - Arrays: `a.concat(b)` for keys in ARRAY_APPEND_KEYS, otherwise `b` wins.
 *   The append targets cover the operator-layer/permission-rule expansion
 *   path; other arrays follow scalar semantics.
 * - Plain objects: deep-merged recursively.
 * - Other values: `b` wins (last-writer-wins).
 *
 * Exported so callers can do narrower merges (e.g., merging two project
 * configs without touching the user file).
 */
export function mergeSettings(
	a: Record<string, unknown>,
	b: Record<string, unknown>,
): Record<string, unknown> {
	const out: Record<string, unknown> = { ...a };
	for (const [key, bv] of Object.entries(b)) {
		const av = out[key];
		if (Array.isArray(av) && Array.isArray(bv)) {
			out[key] = ARRAY_APPEND_KEYS.has(key) ? [...av, ...bv] : bv;
			continue;
		}
		if (isPlainObject(av) && isPlainObject(bv)) {
			out[key] = mergeSettings(av, bv);
			continue;
		}
		out[key] = bv;
	}
	return out;
}

function defaultProjectRoot(): string {
	return process.cwd();
}

export function loadCascadedSettings(opts: LoadSettingsOptions = {}): CascadedSettings {
	const projectRoot = opts.projectRoot ?? defaultProjectRoot();
	const cacheKey = JSON.stringify({ projectRoot, opts });
	const cached = cache.get(cacheKey);
	if (cached) return cached;

	const userPath = opts.userPath ?? getUserSettingsPath();
	const projectPath = getProjectSettingsPath(projectRoot);
	const localPath = getProjectLocalSettingsPath(projectRoot);

	const user = opts.skipUser ? { loaded: false } : readJsonFile(userPath);
	const project = opts.skipProject ? { loaded: false } : readJsonFile(projectPath);
	const local = opts.skipLocal ? { loaded: false } : readJsonFile(localPath);

	let merged: Record<string, unknown> = {};
	if (user.loaded && isPlainObject(user.data)) merged = mergeSettings(merged, user.data);
	if (project.loaded && isPlainObject(project.data)) merged = mergeSettings(merged, project.data);
	if (local.loaded && isPlainObject(local.data)) merged = mergeSettings(merged, local.data);

	const result: CascadedSettings = {
		merged,
		sources: {
			user: { path: userPath, loaded: user.loaded, error: user.error },
			project: { path: projectPath, loaded: project.loaded, error: project.error },
			local: { path: localPath, loaded: local.loaded, error: local.error },
		},
	};
	cache.set(cacheKey, result);
	return result;
}

/**
 * Convenience: get a single key from the merged settings, with a default.
 *
 * Dotted paths are NOT expanded -- pass the top-level key. For nested keys
 * read `merged` directly.
 */
export function getSetting<T>(key: string, defaultValue: T, opts?: LoadSettingsOptions): T {
	const settings = loadCascadedSettings(opts);
	const value = settings.merged[key];
	return value === undefined ? defaultValue : (value as T);
}

/**
 * Migration helper for existing call sites that read a single settings file.
 * Returns the merged settings object directly so a call like:
 *   const settings = JSON.parse(fs.readFileSync(...));
 * becomes:
 *   const settings = readMergedSettings();
 */
export function readMergedSettings(opts?: LoadSettingsOptions): Record<string, unknown> {
	return loadCascadedSettings(opts).merged;
}

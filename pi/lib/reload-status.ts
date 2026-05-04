import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const RELOAD_SCAN_INTERVAL_MS = 5_000;

const RELOAD_FILE_EXTENSIONS = new Set([".json", ".md", ".ts"]);
const RELOAD_FILE_NAMES = new Set(["settings.json"]);
const EXCLUDED_DIR_NAMES = new Set([
	".git",
	".pi",
	".pytest_cache",
	"__pycache__",
	"coverage",
	"dist",
	"history",
	"logs",
	"node_modules",
	"sessions",
]);
const EXCLUDED_NAME_FRAGMENTS = ["expertise-log.jsonl"];

export interface ReloadStatusState {
	baselineMs: number;
	lastScanMs: number;
	cachedNeedsReload: boolean;
	settingsBaselineFingerprintByPath: Map<string, string | undefined>;
}

export interface ReloadCandidateRoot {
	path: string;
	recursive: boolean;
}

export function createReloadStatusState(nowMs = Date.now()): ReloadStatusState {
	return {
		baselineMs: nowMs,
		lastScanMs: Number.NEGATIVE_INFINITY,
		cachedNeedsReload: false,
		settingsBaselineFingerprintByPath: snapshotSettingsFingerprints(
			defaultReloadCandidateRoots(),
		),
	};
}

export function resetReloadStatusBaseline(
	state: ReloadStatusState,
	nowMs = Date.now(),
): void {
	state.baselineMs = nowMs;
	state.lastScanMs = Number.NEGATIVE_INFINITY;
	state.cachedNeedsReload = false;
	state.settingsBaselineFingerprintByPath = snapshotSettingsFingerprints(
		defaultReloadCandidateRoots(),
	);
}

export function defaultReloadCandidateRoots(
	home = os.homedir(),
): ReloadCandidateRoot[] {
	const piRoot = path.join(home, ".dotfiles", "pi");
	return [
		{ path: path.join(piRoot, "settings.json"), recursive: false },
		{ path: path.join(piRoot, "extensions"), recursive: true },
		{ path: path.join(piRoot, "lib"), recursive: true },
		{ path: path.join(piRoot, "agents"), recursive: true },
		{ path: path.join(piRoot, "skills"), recursive: true },
		{ path: path.join(piRoot, "multi-team", "agents"), recursive: true },
		{ path: path.join(piRoot, "multi-team", "skills"), recursive: true },
	];
}

export function needsPiReload(options: {
	state: ReloadStatusState;
	roots?: ReloadCandidateRoot[];
	nowMs?: number;
	statSync?: typeof fs.statSync;
	readdirSync?: typeof fs.readdirSync;
}): boolean {
	const nowMs = options.nowMs ?? Date.now();
	if (nowMs - options.state.lastScanMs < RELOAD_SCAN_INTERVAL_MS) {
		return options.state.cachedNeedsReload;
	}

	const statSync = options.statSync ?? fs.statSync;
	const readdirSync = options.readdirSync ?? fs.readdirSync;
	const roots = options.roots ?? defaultReloadCandidateRoots();
	const needsReload = roots.some((root) =>
		rootHasNewerMtime(
			root,
			options.state.baselineMs,
			statSync,
			readdirSync,
			options.state.settingsBaselineFingerprintByPath,
		),
	);
	options.state.lastScanMs = nowMs;
	options.state.cachedNeedsReload = needsReload;
	return needsReload;
}

function rootHasNewerMtime(
	root: ReloadCandidateRoot,
	baselineMs: number,
	statSync: typeof fs.statSync,
	readdirSync: typeof fs.readdirSync,
	settingsBaselineFingerprintByPath: Map<string, string | undefined>,
): boolean {
	try {
		const stats = statSync(root.path);
		if (stats.isFile()) {
			return (
				isReloadableFile(root.path) &&
				stats.mtimeMs > baselineMs &&
				hasReloadRelevantFileChange(
					root.path,
					settingsBaselineFingerprintByPath,
				)
			);
		}
		if (!stats.isDirectory() || !root.recursive || isExcludedPath(root.path))
			return false;
		return directoryHasNewerMtime(root.path, baselineMs, statSync, readdirSync);
	} catch {
		return false;
	}
}

function directoryHasNewerMtime(
	dir: string,
	baselineMs: number,
	statSync: typeof fs.statSync,
	readdirSync: typeof fs.readdirSync,
): boolean {
	let entries: fs.Dirent[];
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return false;
	}
	for (const entry of entries) {
		const entryPath = path.join(dir, entry.name);
		if (isExcludedPath(entryPath)) continue;
		if (entry.isDirectory()) {
			if (directoryHasNewerMtime(entryPath, baselineMs, statSync, readdirSync))
				return true;
		} else if (entry.isFile()) {
			try {
				if (
					isReloadableFile(entryPath) &&
					statSync(entryPath).mtimeMs > baselineMs
				)
					return true;
			} catch {
				// Ignore files that disappear during the scan.
			}
		}
	}
	return false;
}

function isReloadableFile(filePath: string): boolean {
	return (
		RELOAD_FILE_NAMES.has(path.basename(filePath)) ||
		RELOAD_FILE_EXTENSIONS.has(path.extname(filePath))
	);
}

function isExcludedPath(inputPath: string): boolean {
	const parts = inputPath.split(/[\\/]+/);
	return (
		parts.some((part) => EXCLUDED_DIR_NAMES.has(part)) ||
		EXCLUDED_NAME_FRAGMENTS.some((fragment) => inputPath.includes(fragment))
	);
}

function hasReloadRelevantFileChange(
	filePath: string,
	settingsBaselineFingerprintByPath: Map<string, string | undefined>,
): boolean {
	if (path.basename(filePath) !== "settings.json") return true;
	const baselineFingerprint = settingsBaselineFingerprintByPath.get(
		path.resolve(filePath),
	);
	if (
		baselineFingerprint === undefined &&
		!settingsBaselineFingerprintByPath.has(path.resolve(filePath))
	)
		return true;
	return fingerprintSettingsFile(filePath) !== baselineFingerprint;
}

function snapshotSettingsFingerprints(
	roots: ReloadCandidateRoot[],
): Map<string, string | undefined> {
	const fingerprints = new Map<string, string | undefined>();
	for (const root of roots) {
		if (path.basename(root.path) !== "settings.json") continue;
		fingerprints.set(
			path.resolve(root.path),
			fingerprintSettingsFile(root.path),
		);
	}
	return fingerprints;
}

function fingerprintSettingsFile(filePath: string): string | undefined {
	try {
		const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		return JSON.stringify(stripReloadIgnoredSettings(parsed));
	} catch {
		return undefined;
	}
}

function stripReloadIgnoredSettings(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stripReloadIgnoredSettings);
	if (!value || typeof value !== "object") return value;
	const out: Record<string, unknown> = {};
	for (const [key, child] of Object.entries(value)) {
		if (isReloadIgnoredSettingsKey(key)) continue;
		out[key] = stripReloadIgnoredSettings(child);
	}
	return out;
}

function isReloadIgnoredSettingsKey(key: string): boolean {
	return /model|provider|thinking/i.test(key) || key === "lastChangelogVersion";
}

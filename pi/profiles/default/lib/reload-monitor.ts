import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const RESOURCE_DIRS = ["extensions", "prompts", "skills", "themes"] as const;
const CONTEXT_NAMES = ["AGENTS.override.md", "AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"];
const EXCLUDED = new Set(["node_modules", ".git", "sessions", "auth.json", "operator-footer-usage.json", "__pycache__"]);

export interface ReloadScope {
	agentDir: string;
	cwd: string;
	projectTrusted: boolean;
	projectConfigDir: string;
	home?: string;
	/** Canonical provenance supplied by Pi, not guessed package install locations. */
	loadedPaths?: string[];
}

function missing(error: unknown): boolean {
	return ["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "");
}

function resolveResource(value: string, base: string, home: string): string {
	return path.resolve(base, value === "~" ? home : value.replace(/^~[/\\]/, `${home}${path.sep}`));
}

/** Select explicit resource roots, never the whole profile or repository. */
export function reloadRoots(scope: ReloadScope): string[] {
	const roots = new Set<string>();
	const home = scope.home ?? os.homedir();
	const add = (file: string) => roots.add(path.resolve(file));
	const addConfig = (dir: string) => {
		for (const name of ["settings.json", "SYSTEM.md", "APPEND_SYSTEM.md", ...CONTEXT_NAMES]) add(path.join(dir, name));
		for (const name of RESOURCE_DIRS) add(path.join(dir, name));
		let settings: Record<string, unknown>;
		try {
			settings = JSON.parse(fs.readFileSync(path.join(dir, "settings.json"), "utf8").replace(/^\uFEFF/, ""));
		} catch (error) {
			if (missing(error)) return;
			throw error;
		}
		if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
			throw new Error(`Invalid settings in ${path.join(dir, "settings.json")}`);
		}
		for (const kind of RESOURCE_DIRS) {
			const entries = settings[kind];
			if (entries === undefined) continue;
			if (!Array.isArray(entries) || entries.some((entry) => typeof entry !== "string")) {
				throw new Error(`Invalid ${kind} paths in ${path.join(dir, "settings.json")}`);
			}
			for (const entry of entries as string[]) {
				// Exclusions are not watch roots. Loaded provenance covers selected package/glob files.
				if (/^[!-]/.test(entry) || /[*?{}\[\]]/.test(entry)) continue;
				add(resolveResource(entry.replace(/^\+/, ""), dir, home));
			}
		}
	};
	addConfig(scope.agentDir);
	for (const name of ["models.json", "keybindings.json"]) add(path.join(scope.agentDir, name));
	add(path.join(home, ".agents", "skills"));
	if (scope.projectTrusted) addConfig(path.join(scope.cwd, scope.projectConfigDir));
	let current = path.resolve(scope.cwd);
	let insideSkillBoundary = true;
	while (true) {
		// Pi inherits context from ancestors, independently of dynamic project trust.
		for (const name of CONTEXT_NAMES) add(path.join(current, name));
		if (scope.projectTrusted && insideSkillBoundary) add(path.join(current, ".agents", "skills"));
		if (fs.existsSync(path.join(current, ".git"))) insideSkillBoundary = false;
		const parent = path.dirname(current);
		if (parent === current) break;
		current = parent;
	}
	for (const file of scope.loadedPaths ?? []) {
		if (path.isAbsolute(file)) add(file);
	}
	return [...roots].sort();
}

export function reloadSnapshot(roots: string[]): Map<string, string> {
	const snapshot = new Map<string, string>();
	const visited = new Set<string>();
	let count = 0;
	const visit = (file: string) => {
		if (EXCLUDED.has(path.basename(file))) return;
		if (++count > 10_000) throw new Error("Reload monitoring exceeds 10000 filesystem entries");
		let stat: fs.Stats;
		let real: string;
		try {
			stat = fs.statSync(file);
			real = fs.realpathSync(file);
		} catch (error) {
			if (missing(error)) return;
			throw error;
		}
		if (visited.has(real)) return;
		visited.add(real);
		if (stat.isDirectory()) {
			for (const entry of fs.readdirSync(file).sort()) visit(path.join(file, entry));
		} else if (stat.isFile()) {
			snapshot.set(real, `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`);
		}
	};
	for (const root of roots) visit(root);
	return snapshot;
}

export class ReloadMonitor {
	private baseline = new Map<string, string>();
	private roots: string[] = [];
	private initialized = false;
	needed = false;
	error: string | undefined;

	reset(scope: ReloadScope): void {
		this.initialized = false;
		this.error = undefined;
		this.needed = false;
		try {
			this.roots = reloadRoots(scope);
			this.baseline = reloadSnapshot(this.roots);
			this.initialized = true;
		} catch (error) {
			this.error = error instanceof Error ? error.message : String(error);
		}
	}

	check(): void {
		if (!this.initialized) return;
		try {
			const current = reloadSnapshot(this.roots);
			this.needed = current.size !== this.baseline.size || [...current].some(([file, signature]) => this.baseline.get(file) !== signature);
			this.error = undefined;
		} catch (error) {
			this.error = error instanceof Error ? error.message : String(error);
		}
	}
}

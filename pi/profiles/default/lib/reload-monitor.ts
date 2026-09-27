import * as fs from "node:fs/promises";
import { webcrypto } from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";

const RESOURCE_DIRS = ["extensions", "prompts", "skills"] as const;
const CONTEXT_NAMES = ["AGENTS.override.md", "AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"];
const EXCLUDED = new Set(["node_modules", ".git", "sessions", "auth.json", "operator-footer-usage.json", "__pycache__", "themes"]);

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

function isWithin(file: string, root: string): boolean {
	const relative = path.relative(root, file);
	return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function exists(file: string): Promise<boolean> {
	try { await fs.access(file); return true; } catch (error) { if (missing(error)) return false; throw error; }
}

/** Select explicit resource roots, never the whole profile or repository. */
export async function reloadRoots(scope: ReloadScope): Promise<string[]> {
	const roots = new Set<string>();
	const home = scope.home ?? os.homedir();
	const add = (file: string) => roots.add(path.resolve(file));
	const addConfig = async (dir: string) => {
		for (const name of ["settings.json", "SYSTEM.md", "APPEND_SYSTEM.md", ...CONTEXT_NAMES]) add(path.join(dir, name));
		for (const name of RESOURCE_DIRS) add(path.join(dir, name));
		let settings: Record<string, unknown>;
		try {
			settings = JSON.parse((await fs.readFile(path.join(dir, "settings.json"), "utf8")).replace(/^\uFEFF/, ""));
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
				if (/^[!-]/.test(entry) || /[*?{}\[\]]/.test(entry)) continue;
				const resolved = resolveResource(entry.replace(/^\+/, ""), dir, home);
				if (path.basename(resolved) === "themes") continue;
				add(resolved);
			}
		}
	};
	await addConfig(scope.agentDir);
	for (const name of ["models.json", "keybindings.json"]) add(path.join(scope.agentDir, name));
	add(path.join(home, ".agents", "skills"));
	if (scope.projectTrusted) await addConfig(path.join(scope.cwd, scope.projectConfigDir));
	let current = path.resolve(scope.cwd);
	let insideSkillBoundary = true;
	while (true) {
		for (const name of CONTEXT_NAMES) add(path.join(current, name));
		if (scope.projectTrusted && insideSkillBoundary) add(path.join(current, ".agents", "skills"));
		if (await exists(path.join(current, ".git"))) insideSkillBoundary = false;
		const parent = path.dirname(current);
		if (parent === current) break;
		current = parent;
	}

	// Pi's loaded source paths are provenance only. Accept our profile-owned code
	// and the narrowly scoped shared Onclave adapter, never arbitrary packages.
	const profileRoot = path.resolve(scope.agentDir);
	const repositoryRoot = path.resolve(profileRoot, "../../..");
	const ownedRoots = ["extensions", "lib", "commands", "prompts", "skills"].map(name => path.join(profileRoot, name));
	ownedRoots.push(path.join(repositoryRoot, "modules/onclave/extensions/onclave-pi"), path.join(repositoryRoot, "modules/onclave/services/core"));
	for (const file of scope.loadedPaths ?? []) {
		if (!path.isAbsolute(file)) continue;
		const resolved = path.resolve(file);
		const components = resolved.split(path.sep);
		if (components.includes("node_modules") || components.includes("themes")) continue;
		if (ownedRoots.some((root) => isWithin(resolved, root))) add(resolved);
	}
	// Include imported profile implementation even when Pi reports only the entrypoint.
	for (const name of ["lib", "extensions", "commands"]) add(path.join(profileRoot, name));
	for (const name of ["extensions/onclave-pi", "services/core"]) {
		const shared = path.join(repositoryRoot, "modules/onclave", name);
		if (await exists(shared)) add(shared);
	}
	return [...roots].sort();
}

// These selections take effect immediately; resource/catalog configuration still needs reload.
const LIVE_SETTINGS = new Set(["defaultModel", "defaultProvider", "defaultThinkingLevel", "lastChangelogVersion"]);

async function resourceFingerprint(file: string): Promise<string> {
	let content: Buffer | string = await fs.readFile(file);
	if (path.basename(file) === "settings.json") {
		const settings = JSON.parse(content.toString("utf8").replace(/^\uFEFF/, ""));
		if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
			throw new Error(`Invalid settings in ${file}`);
		}
		const relevant = Object.fromEntries(Object.entries(settings).filter(([key]) => !LIVE_SETTINGS.has(key)));
		content = JSON.stringify(relevant, (_key, value) =>
			value && typeof value === "object" && !Array.isArray(value)
				? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)))
				: value);
	}
	const bytes = typeof content === "string" ? new TextEncoder().encode(content) : Uint8Array.from(content);
	const digest = await webcrypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function reloadSnapshot(roots: string[]): Promise<Map<string, string>> {
	const snapshot = new Map<string, string>();
	const visited = new Set<string>();
	let count = 0;
	const visit = async (file: string): Promise<void> => {
		if (EXCLUDED.has(path.basename(file))) return;
		if (++count > 10_000) throw new Error("Reload monitoring exceeds 10000 filesystem entries");
		let stat: Awaited<ReturnType<typeof fs.stat>>;
		let identity = path.resolve(file);
		try {
			const linkStat = await fs.lstat(file);
			if (linkStat.isSymbolicLink()) {
				identity = await fs.realpath(file);
				stat = await fs.stat(identity);
			} else stat = linkStat;
		} catch (error) {
			if (missing(error)) return;
			throw error;
		}
		if (visited.has(identity)) return;
		visited.add(identity);
		if (stat.isDirectory()) {
			const entries = (await fs.readdir(file)).sort();
			if (entries.includes("SKILL.md")) {
				await visit(path.join(file, "SKILL.md"));
				return;
			}
			for (const entry of entries) await visit(path.join(file, entry));
		} else if (stat.isFile()) snapshot.set(identity, await resourceFingerprint(file));
	};
	for (const root of roots) await visit(root);
	return snapshot;
}

export class ReloadMonitor {
	private baseline = new Map<string, string>();
	private roots: string[] = [];
	private initialized = false;
	private generation = 0;
	needed = false;
	error: string | undefined;
	get isInitialized(): boolean { return this.initialized; }

	cancel(): void { this.generation++; }

	async reset(scope: ReloadScope): Promise<void> {
		const generation = ++this.generation;
		this.initialized = false;
		this.error = undefined;
		this.needed = false;
		try {
			const roots = await reloadRoots(scope);
			const baseline = await reloadSnapshot(roots);
			if (generation !== this.generation) return;
			this.roots = roots;
			this.baseline = baseline;
			this.initialized = true;
		} catch (error) {
			if (generation === this.generation) this.error = error instanceof Error ? error.message : String(error);
		}
	}

	async check(): Promise<void> {
		if (!this.initialized) return;
		const generation = this.generation;
		try {
			const current = await reloadSnapshot(this.roots);
			if (generation !== this.generation) return;
			this.needed = current.size !== this.baseline.size || [...current].some(([file, signature]) => this.baseline.get(file) !== signature);
			this.error = undefined;
		} catch (error) {
			if (generation === this.generation) this.error = error instanceof Error ? error.message : String(error);
		}
	}
}

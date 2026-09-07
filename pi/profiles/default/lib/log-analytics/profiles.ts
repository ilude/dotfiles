import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PROFILE_IDS = ["default", "legacy"] as const;
export type ProfileId = (typeof PROFILE_IDS)[number];
export type ProfileRegistry = { active: ProfileId; roots: Record<ProfileId, string> };

/** The loader's repository-owned layout, never the session cwd or a model argument. */
export async function runtimeProfiles(): Promise<ProfileRegistry> {
	const { getAgentDir } = await import("@earendil-works/pi-coding-agent");
	if (process.env.PI_ANALYTICS_SOURCE_ROOT !== undefined) {
		throw new Error("PI_ANALYTICS_SOURCE_ROOT is not supported by default analytics; use the registered profiles");
	}
	const ownRoot = await fs.realpath(fileURLToPath(new URL("../..", import.meta.url)));
	const activeRoot = await fs.realpath(getAgentDir());
	const roots = { default: ownRoot, legacy: path.join(path.dirname(ownRoot), "legacy") };
	for (const id of PROFILE_IDS) {
		// The active alias can be ~/.pi/agent. Do not require unselected legacy to exist.
		if (activeRoot === path.resolve(roots[id]) || (id === "legacy" && activeRoot === await fs.realpath(roots[id]).catch(() => ""))) {
			return { active: id, roots };
		}
	}
	throw new Error("analytics active profile is not registered as default or legacy");
}

export function selectedProfiles(registry: ProfileRegistry, profiles?: readonly ProfileId[]): ProfileId[] {
	const selected = profiles ?? [registry.active];
	if (!selected.length || selected.some(id => !PROFILE_IDS.includes(id))) throw new Error("unknown or empty analytics profiles");
	return PROFILE_IDS.filter(id => selected.includes(id));
}

export function checkCancelled(signal?: AbortSignal): void {
	if (signal?.aborted) throw new Error("analytics query was cancelled");
}

export function contained(root: string, file: string): boolean {
	const relative = path.relative(root, file);
	return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export async function canonicalWithin(root: string, file: string): Promise<string> {
	const canonical = await fs.realpath(file);
	if (!contained(root, canonical)) throw new Error(`analytics path escapes profile: ${file}`);
	return canonical;
}

export function isMissing(error: unknown): boolean {
	return (error as NodeJS.ErrnoException).code === "ENOENT";
}

/** Exact source tree traversal, with link validation and canonical alias deduplication. */
export async function sessionFiles(root: string, signal?: AbortSignal): Promise<string[]> {
	const visited = new Set<string>();
	const files = new Set<string>();
	async function walk(candidate: string, optional = false): Promise<void> {
		checkCancelled(signal);
		let canonical: string;
		try { canonical = await canonicalWithin(root, candidate); }
		catch (error) { if (optional && isMissing(error)) return; throw error; }
		if (visited.has(canonical)) return;
		visited.add(canonical);
		const stat = await fs.stat(canonical);
		if (stat.isDirectory()) {
			for (const entry of await fs.readdir(canonical, { withFileTypes: true })) {
				if (entry.isDirectory() || entry.isSymbolicLink() || entry.name.endsWith(".jsonl")) await walk(path.join(canonical, entry.name));
			}
		} else if (stat.isFile() && candidate.endsWith(".jsonl")) files.add(canonical);
		else if (candidate.endsWith(".jsonl")) throw new Error(`analytics input is not a regular file: ${candidate}`);
	}
	await walk(path.join(root, "sessions"), true);
	return [...files].sort();
}

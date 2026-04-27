/**
 * Skill discovery -- enumerate skill files for auto-registration.
 *
 * Owned by .specs/pi-platform-alignment/plan.md (Phase 3 T7). Replaces the
 * hardcoded skill-loading pattern in pi/extensions/workflow-commands.ts for
 * any new SKILL.md style skill -- existing workflow templates continue to
 * work via their hardcoded handlers; auto-discovery is additive.
 *
 * Two layouts are supported:
 *
 *   1. Subdir layout (Claude Code-compatible):
 *        <root>/<name>/SKILL.md
 *      The .md file MUST have YAML frontmatter with at least `name` and
 *      `description`. The skill command name defaults to the frontmatter
 *      `name`, falling back to the directory name.
 *
 *   2. Flat layout (pi workflow templates):
 *        <root>/<name>.md
 *      Optional frontmatter. The command name defaults to the frontmatter
 *      `name`, falling back to the file basename without extension.
 *
 * Discovery roots searched in order (later sources override earlier on
 * name collision; the loader records both for visibility):
 *
 *   1. Built-in: ~/.dotfiles/pi/skills/*  (pi-skills, workflow, shared)
 *   2. User:     ~/.pi/agent/skills/*
 *
 * Frontmatter parsing reuses pi/lib/yaml-mini.ts; we deliberately accept a
 * loose superset of Claude Code's schema (extra keys are passed through
 * unchanged on the SkillRecord.metadata field).
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { parseYamlMini } from "./yaml-mini.ts";

export type SkillSource = "builtin" | "user" | "custom";

export interface SkillRecord {
	name: string;
	description: string;
	body: string;
	filePath: string;
	source: SkillSource;
	paths?: string[];
	args?: string;
	metadata: Record<string, unknown>;
}

export interface DiscoverSkillsOptions {
	/** Override the search roots. When set, builtin/user defaults are ignored. */
	roots?: Array<{ path: string; source: SkillSource }>;
	/** When set, discovery only reports skills whose `paths:` glob matches. */
	cwd?: string;
}

interface RawFrontmatter {
	body: string;
	frontmatter: Record<string, unknown>;
	hadFrontmatter: boolean;
}

const SKILL_FILE = "SKILL.md";

function defaultRoots(): Array<{ path: string; source: SkillSource }> {
	const home = os.homedir();
	return [
		{ path: path.join(home, ".dotfiles", "pi", "skills"), source: "builtin" },
		{ path: path.join(home, ".pi", "agent", "skills"), source: "user" },
	];
}

/**
 * Strip a leading YAML frontmatter block (delimited by `---` lines) and
 * return the parsed object plus the remaining body. Files without
 * frontmatter return an empty object and the full content as body.
 */
export function splitFrontmatter(content: string): RawFrontmatter {
	const lines = content.split(/\r?\n/);
	if (lines[0] !== "---") {
		return { body: content, frontmatter: {}, hadFrontmatter: false };
	}
	let endIdx = -1;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i] === "---") {
			endIdx = i;
			break;
		}
	}
	if (endIdx === -1) {
		return { body: content, frontmatter: {}, hadFrontmatter: false };
	}
	const fmText = lines.slice(1, endIdx).join("\n");
	const body = lines.slice(endIdx + 1).join("\n");
	const parsed = parseYamlMini(fmText);
	const fm =
		parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	return { body, frontmatter: fm, hadFrontmatter: true };
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const out: string[] = [];
	for (const v of value) if (typeof v === "string") out.push(v);
	return out.length > 0 ? out : undefined;
}

/**
 * Compile a single `paths:` glob to a predicate. Mirrors the simple glob
 * semantics used by permission-rules but on relative paths.
 */
function globToPredicate(glob: string): (cwdRel: string) => boolean {
	let pattern = "^";
	for (let i = 0; i < glob.length; i++) {
		const ch = glob[i];
		if (ch === "*") {
			if (glob[i + 1] === "*") {
				i++;
				pattern += ".*";
				continue;
			}
			pattern += "[^/]*";
			continue;
		}
		if (/[.+^$()|[\]\\{}?]/.test(ch)) {
			pattern += `\\${ch}`;
			continue;
		}
		pattern += ch;
	}
	pattern += "$";
	const regex = new RegExp(pattern);
	return (input: string) => regex.test(input.replace(/\\/g, "/"));
}

function matchesAnyPath(globs: string[], cwd: string): boolean {
	for (const g of globs) {
		const pred = globToPredicate(g);
		if (pred(cwd)) return true;
	}
	return false;
}

function readSkillRecord(
	filePath: string,
	source: SkillSource,
	defaultName: string,
): SkillRecord | null {
	let raw: string;
	try {
		raw = fs.readFileSync(filePath, "utf-8");
	} catch {
		return null;
	}
	const { body, frontmatter, hadFrontmatter } = splitFrontmatter(raw);
	const name = asString(frontmatter.name) ?? defaultName;
	const description = asString(frontmatter.description) ?? "";
	if (!name) return null;
	const record: SkillRecord = {
		name,
		description,
		body,
		filePath,
		source,
		paths: asStringArray(frontmatter.paths),
		args: asString(frontmatter.args),
		metadata: hadFrontmatter ? frontmatter : {},
	};
	return record;
}

function discoverSubdirSkills(rootPath: string, source: SkillSource): SkillRecord[] {
	const out: SkillRecord[] = [];
	let entries: string[];
	try {
		entries = fs.readdirSync(rootPath);
	} catch {
		return out;
	}
	for (const entry of entries) {
		const sub = path.join(rootPath, entry);
		let stat: fs.Stats;
		try {
			stat = fs.statSync(sub);
		} catch {
			continue;
		}
		if (stat.isDirectory()) {
			const skillPath = path.join(sub, SKILL_FILE);
			if (fs.existsSync(skillPath)) {
				const record = readSkillRecord(skillPath, source, entry);
				if (record) out.push(record);
			}
			continue;
		}
		if (entry.toLowerCase().endsWith(".md") && entry.toLowerCase() !== "readme.md") {
			const defaultName = entry.replace(/\.md$/i, "");
			const record = readSkillRecord(sub, source, defaultName);
			if (record) out.push(record);
		}
	}
	return out;
}

/**
 * Scan one or more roots and return all discovered skills. Later sources
 * override earlier ones on name collision -- the override is captured by
 * filtering the final list to one record per name (last wins).
 */
export function discoverSkills(opts: DiscoverSkillsOptions = {}): SkillRecord[] {
	const roots = opts.roots ?? defaultRoots();
	const collected: SkillRecord[] = [];
	for (const root of roots) {
		if (!fs.existsSync(root.path)) continue;
		// Direct subdir scan
		const direct = discoverSubdirSkills(root.path, root.source);
		// One level deeper (e.g., pi/skills/pi-skills/<name>/SKILL.md or pi/skills/workflow/<file>.md)
		let entries: string[];
		try {
			entries = fs.readdirSync(root.path);
		} catch {
			entries = [];
		}
		const nested: SkillRecord[] = [];
		for (const entry of entries) {
			const sub = path.join(root.path, entry);
			try {
				if (fs.statSync(sub).isDirectory()) {
					for (const inner of discoverSubdirSkills(sub, root.source)) nested.push(inner);
				}
			} catch {
				continue;
			}
		}
		collected.push(...direct, ...nested);
	}

	// Dedupe by name with last-wins semantics. Roots later in the list win.
	const byName = new Map<string, SkillRecord>();
	for (const record of collected) byName.set(record.name, record);
	const final = [...byName.values()];

	// Conditional activation via paths:
	if (opts.cwd) {
		const cwd = opts.cwd.replace(/\\/g, "/");
		return final.filter((s) => !s.paths || s.paths.length === 0 || matchesAnyPath(s.paths, cwd));
	}
	return final;
}

/**
 * Fast lookup by name. Returns null when no match. This avoids the override
 * dedupe noise by stopping at the first match.
 */
export function findSkillByName(
	name: string,
	opts: DiscoverSkillsOptions = {},
): SkillRecord | null {
	for (const record of discoverSkills(opts)) {
		if (record.name === name) return record;
	}
	return null;
}

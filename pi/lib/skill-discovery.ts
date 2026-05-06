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
 * name collision). Within the same source priority, top-level skills override
 * skills/shared entries; shared skills are fallback-only.
 *
 *   1. Built-in: ~/.dotfiles/claude/skills/*  (shared Claude Code-style skills)
 *   2. Built-in: ~/.dotfiles/pi/skills/*      (Pi-specific overrides, pi-skills, workflow, shared)
 *   3. User:     ~/.pi/agent/skills/*
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
		{
			path: path.join(home, ".dotfiles", "claude", "skills"),
			source: "builtin",
		},
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

function readDirectoryEntries(rootPath: string): string[] {
	try {
		return fs.readdirSync(rootPath);
	} catch {
		return [];
	}
}

function statOrNull(targetPath: string): fs.Stats | null {
	try {
		return fs.statSync(targetPath);
	} catch {
		return null;
	}
}

function discoverSkillEntry(
	rootPath: string,
	entry: string,
	source: SkillSource,
): SkillRecord | null {
	const sub = path.join(rootPath, entry);
	const stat = statOrNull(sub);
	if (!stat) return null;
	if (stat.isDirectory()) {
		const skillPath = path.join(sub, SKILL_FILE);
		return fs.existsSync(skillPath)
			? readSkillRecord(skillPath, source, entry)
			: null;
	}
	const lowerEntry = entry.toLowerCase();
	if (!lowerEntry.endsWith(".md") || lowerEntry === "readme.md") return null;
	return readSkillRecord(sub, source, entry.replace(/\.md$/i, ""));
}

function discoverSubdirSkills(
	rootPath: string,
	source: SkillSource,
): SkillRecord[] {
	const out: SkillRecord[] = [];
	for (const entry of readDirectoryEntries(rootPath)) {
		const record = discoverSkillEntry(rootPath, entry, source);
		if (record) out.push(record);
	}
	return out;
}

function isSharedSkillPath(filePath: string): boolean {
	return filePath.replace(/\\/g, "/").includes("/shared/");
}

function skillPriority(filePath: string): number {
	return isSharedSkillPath(filePath) ? 0 : 1;
}

interface SkillCandidate {
	record: SkillRecord;
	priority: number;
}

function discoverNestedSkills(rootPath: string, source: SkillSource): SkillRecord[] {
	const out: SkillRecord[] = [];
	for (const entry of readDirectoryEntries(rootPath)) {
		const sub = path.join(rootPath, entry);
		if (!statOrNull(sub)?.isDirectory()) continue;
		out.push(...discoverSubdirSkills(sub, source));
	}
	return out;
}

function collectSkillCandidates(
	roots: Array<{ path: string; source: SkillSource }>,
): SkillCandidate[] {
	const out: SkillCandidate[] = [];
	for (const [rootIndex, root] of roots.entries()) {
		if (!fs.existsSync(root.path)) continue;
		const records = [
			...discoverSubdirSkills(root.path, root.source),
			...discoverNestedSkills(root.path, root.source),
		];
		for (const record of records) {
			out.push({
				record,
				priority: rootIndex * 2 + skillPriority(record.filePath),
			});
		}
	}
	return out;
}

function dedupeSkillCandidates(candidates: SkillCandidate[]): SkillRecord[] {
	const byName = new Map<string, SkillCandidate>();
	for (const candidate of candidates) {
		const existing = byName.get(candidate.record.name);
		if (!existing || candidate.priority >= existing.priority) {
			byName.set(candidate.record.name, candidate);
		}
	}
	return [...byName.values()].map((candidate) => candidate.record);
}

/**
 * Scan one or more roots and return all discovered skills. Later sources
 * override earlier ones on name collision. Within the same source priority,
 * skills/shared entries are fallback-only and lose to top-level skill entries.
 */
export function discoverSkills(
	opts: DiscoverSkillsOptions = {},
): SkillRecord[] {
	const roots = opts.roots ?? defaultRoots();
	const final = dedupeSkillCandidates(collectSkillCandidates(roots));

	// Conditional activation via paths:
	if (opts.cwd) {
		const cwd = opts.cwd.replace(/\\/g, "/");
		return final.filter(
			(s) => !s.paths || s.paths.length === 0 || matchesAnyPath(s.paths, cwd),
		);
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

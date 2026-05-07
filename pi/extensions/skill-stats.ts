import {
	createReadStream,
	existsSync,
	readdirSync,
	readFileSync,
	statSync,
} from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@mariozechner/pi-coding-agent";

export type SkillEvidenceSource =
	| "explicit_slash_command"
	| "prompt_skill_inventory"
	| "expanded_skill_block"
	| "historical_explicit_prompt"
	| "manual_read_candidate"
	| "unknown";

interface SkillEvent {
	skill: string;
	source: SkillEvidenceSource;
	timestamp: Date;
	sessionFile: string;
	turnKey: string;
	candidate: boolean;
}

export interface SkillStatsOptions {
	sessionRoot?: string;
	now?: Date;
	cwd?: string;
}

export interface UnusedSkill {
	name: string;
	description: string;
	location: string;
}

export interface SkillStatsResult {
	generatedAt: Date;
	sessionRootLabel: string;
	windows: Array<number | "all">;
	usage: Map<string, Map<string, number>>;
	sources: Map<string, number>;
	candidates: Map<string, number>;
	diagnostics: Map<string, number>;
	skillMetadata: Map<string, UnusedSkill>;
	unusedSkills: UnusedSkill[];
}

const DEFAULT_WINDOWS = [1, 7, 30];
const VALID_SOURCES = new Set<SkillEvidenceSource>([
	"explicit_slash_command",
	"prompt_skill_inventory",
	"expanded_skill_block",
	"historical_explicit_prompt",
	"manual_read_candidate",
	"unknown",
]);

interface SkillRoot {
	path: string;
	location: string;
}

function defaultSkillRoots(): SkillRoot[] {
	const home = os.homedir();
	return [
		{
			path: path.join(home, ".dotfiles", "claude", "skills"),
			location: "claude",
		},
		{ path: path.join(home, ".dotfiles", "pi", "skills"), location: "pi" },
		{ path: path.join(home, ".pi", "agent", "skills"), location: "pi" },
	];
}

function parseSkillMetadata(
	filePath: string,
	defaultName: string,
	location: string,
): UnusedSkill | null {
	let raw = "";
	try {
		raw = readFileSync(filePath, "utf-8");
	} catch {
		return null;
	}
	let name = defaultName;
	let description = "";
	const lines = raw.split(/\r?\n/);
	if (lines[0] !== "---") return null;
	const frontmatterLines: string[] = [];
	for (const line of lines.slice(1)) {
		if (line === "---") break;
		frontmatterLines.push(line);
	}
	for (let i = 0; i < frontmatterLines.length; i++) {
		const line = frontmatterLines[i];
		const nameMatch = line.match(/^name:\s*(.+)$/);
		if (nameMatch) name = nameMatch[1].trim().replace(/^['"]|['"]$/g, "");
		const descMatch = line.match(/^description:\s*(.+)$/);
		if (!descMatch) continue;
		const first = descMatch[1].trim();
		if ([">", "|", ">-", "|-"].includes(first)) {
			const folded: string[] = [];
			for (const nextLine of frontmatterLines.slice(i + 1)) {
				if (!/^\s+/.test(nextLine)) break;
				folded.push(nextLine.trim());
			}
			description = folded.join(" ");
			continue;
		}
		description = first.replace(/^['"]|['"]$/g, "");
	}
	if (!description) return null;
	return {
		name: safeLabel(name),
		description: safeLabel(description),
		location: safeLabel(location),
	};
}

function discoverSkillMetadataInRoot(
	root: string,
	location: string,
): UnusedSkill[] {
	const out: UnusedSkill[] = [];
	let entries: string[];
	try {
		entries = readdirSync(root);
	} catch {
		return out;
	}
	for (const entry of entries) {
		const entryPath = path.join(root, entry);
		let isDirectory = false;
		try {
			isDirectory = statSync(entryPath).isDirectory();
		} catch {
			continue;
		}
		if (isDirectory) {
			const skillFile = path.join(entryPath, "SKILL.md");
			if (existsSync(skillFile)) {
				const metadata = parseSkillMetadata(skillFile, entry, location);
				if (metadata) out.push(metadata);
			}
			continue;
		}
		if (
			entry.toLowerCase().endsWith(".md") &&
			entry.toLowerCase() !== "readme.md"
		) {
			const metadata = parseSkillMetadata(
				entryPath,
				entry.replace(/\.md$/i, ""),
				location,
			);
			if (metadata) out.push(metadata);
		}
	}
	return out;
}

function loadSkillMetadata(): Map<string, UnusedSkill> {
	const byName = new Map<string, UnusedSkill>();
	for (const root of defaultSkillRoots()) {
		for (const skill of discoverSkillMetadataInRoot(root.path, root.location))
			byName.set(skill.name.toLowerCase(), skill);
		let entries: string[];
		try {
			entries = readdirSync(root.path);
		} catch {
			entries = [];
		}
		for (const entry of entries) {
			const nested = path.join(root.path, entry);
			try {
				if (!statSync(nested).isDirectory()) continue;
				if (existsSync(path.join(nested, "SKILL.md"))) continue;
				const nestedLocation = root.location === "pi" ? entry : root.location;
				for (const skill of discoverSkillMetadataInRoot(nested, nestedLocation))
					byName.set(skill.name.toLowerCase(), skill);
			} catch {}
		}
	}
	return byName;
}

function loadUnusedSkills(
	usedSkills: Set<string>,
	skillMetadata: Map<string, UnusedSkill>,
): UnusedSkill[] {
	return [...skillMetadata.values()]
		.filter((skill) => !usedSkills.has(skill.name.toLowerCase()))
		.sort((a, b) => a.name.localeCompare(b.name));
}

function sessionRoot(): string {
	return path.join(
		process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent"),
		"sessions",
	);
}

function inc(map: Map<string, number>, key: string, by = 1): void {
	map.set(key, (map.get(key) || 0) + by);
}

function safeLabel(value: string): string {
	return (
		[...value]
			.filter((ch) => {
				const code = ch.charCodeAt(0);
				return code >= 32 && code !== 127;
			})
			.join("")
			.replace(/[|`[\]<>]/g, "_")
			.replace(/[\\/]+/g, "/")
			.slice(0, 80) || "unknown"
	);
}

function parseWindows(args: string): {
	windows: Array<number | "all">;
	error?: string;
} {
	const tokens = args.trim().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return { windows: DEFAULT_WINDOWS };
	const days = new Set<number>();
	let all = false;
	for (const token of tokens) {
		if (token.toLowerCase() === "all") {
			all = true;
			continue;
		}
		if (!/^\d+$/.test(token)) return { windows: [], error: token };
		const n = Number(token);
		if (!Number.isInteger(n) || n < 1 || n > 365)
			return { windows: [], error: token };
		days.add(n);
	}
	const windows: Array<number | "all"> = [...days].sort((a, b) => a - b);
	if (all) windows.push("all");
	return { windows };
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function parseTime(value: unknown, fallback: Date): Date | null {
	const raw = asString(value);
	if (!raw) return fallback;
	const d = new Date(raw);
	return Number.isFinite(d.getTime()) ? d : null;
}

function eventFromJson(
	entry: Record<string, unknown>,
	sessionFile: string,
	line: number,
	fallback: Date,
): SkillEvent[] {
	const out: SkillEvent[] = [];
	const data = isObject(entry.data) ? entry.data : undefined;
	if (entry.type === "custom" && entry.customType === "skill-load" && data) {
		const skill = asString(data.skill);
		const source = asString(data.source) as SkillEvidenceSource | undefined;
		const timestamp = parseTime(data.timestamp, fallback);
		if (skill && timestamp && (!source || VALID_SOURCES.has(source))) {
			out.push({
				skill: safeLabel(skill),
				source: source || "unknown",
				timestamp,
				sessionFile,
				turnKey: asString(data.turnId) || String(line),
				candidate:
					source === "manual_read_candidate" ||
					source === "prompt_skill_inventory",
			});
		}
	}
	const text = [entry.text, entry.content, entry.message]
		.map(asString)
		.find(Boolean);
	if (text) {
		for (const m of text.matchAll(/<skill\s+name=["']([^"']+)["']/gi))
			out.push({
				skill: safeLabel(m[1]),
				source: "expanded_skill_block",
				timestamp: fallback,
				sessionFile,
				turnKey: String(line),
				candidate: false,
			});
		for (const m of text.matchAll(/(?:^|\s)\/skill:([A-Za-z0-9_-]+)/g))
			out.push({
				skill: safeLabel(m[1]),
				source: "historical_explicit_prompt",
				timestamp: fallback,
				sessionFile,
				turnKey: String(line),
				candidate: false,
			});
	}
	const toolName = asString(entry.toolName) || asString(entry.name);
	const args = isObject(entry.args)
		? entry.args
		: isObject(entry.parameters)
			? entry.parameters
			: undefined;
	const p = args ? asString(args.path) || asString(args.file_path) : undefined;
	if (toolName === "read" && p && /(^|[\\/])SKILL\.md$/i.test(p)) {
		out.push({
			skill: safeLabel(path.basename(path.dirname(p))),
			source: "manual_read_candidate",
			timestamp: fallback,
			sessionFile,
			turnKey: String(line),
			candidate: true,
		});
	}
	return out;
}

async function* jsonlFiles(root: string): AsyncGenerator<string> {
	let entries: import("node:fs").Dirent[];
	try {
		entries = await fs.readdir(root, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const p = path.join(root, entry.name);
		if (entry.isDirectory()) yield* jsonlFiles(p);
		else if (entry.isFile() && entry.name.endsWith(".jsonl")) yield p;
	}
}

function fileTime(file: string): Date {
	const m = path
		.basename(file)
		.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/);
	return m ? new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`) : new Date(0);
}

export async function collectSkillStats(
	args = "",
	options: SkillStatsOptions = {},
): Promise<{ result?: SkillStatsResult; errorMarkdown?: string }> {
	const parsed = parseWindows(args);
	if (parsed.error)
		return {
			errorMarkdown: `## /skill-stats usage\n\nUse \`/skill-stats [1..365|all ...]\`. Invalid argument: \`${safeLabel(parsed.error)}\`.`,
		};
	const root = options.sessionRoot || sessionRoot();
	const now = options.now || new Date();
	const events: SkillEvent[] = [];
	const diagnostics = new Map<string, number>();
	for await (const file of jsonlFiles(root)) {
		const fallback = fileTime(file);
		const rl = readline.createInterface({
			input: createReadStream(file),
			crlfDelay: Infinity,
		});
		let line = 0;
		for await (const raw of rl) {
			line++;
			try {
				const parsedLine: unknown = JSON.parse(raw);
				if (isObject(parsedLine))
					events.push(
						...eventFromJson(
							parsedLine,
							path.relative(root, file),
							line,
							fallback,
						),
					);
			} catch {
				inc(diagnostics, "malformed_json");
			}
		}
	}
	const deduped = new Map<string, SkillEvent>();
	for (const e of events) {
		if (e.timestamp.getTime() > now.getTime()) {
			inc(diagnostics, "future_event");
			continue;
		}
		const key = `${e.sessionFile}:${e.turnKey}:${e.skill}`;
		const old = deduped.get(key);
		if (
			!old ||
			(old.source !== "explicit_slash_command" &&
				e.source === "explicit_slash_command")
		)
			deduped.set(key, e);
	}
	const usage = new Map<string, Map<string, number>>();
	const sources = new Map<string, number>();
	const candidates = new Map<string, number>();
	const usedSkills = new Set<string>();
	const skillMetadata = loadSkillMetadata();
	for (const w of parsed.windows) usage.set(String(w), new Map());
	for (const e of deduped.values()) {
		inc(e.candidate ? candidates : sources, e.source);
		if (e.candidate) {
			inc(candidates, e.skill);
			continue;
		}
		usedSkills.add(e.skill.toLowerCase());
		for (const w of parsed.windows) {
			const bucket = usage.get(String(w));
			if (
				bucket &&
				(w === "all" || e.timestamp.getTime() >= now.getTime() - w * 86400000)
			)
				inc(bucket, e.skill);
		}
	}
	return {
		result: {
			generatedAt: now,
			sessionRootLabel: "~/.pi/agent/sessions",
			windows: parsed.windows,
			usage,
			sources,
			candidates,
			diagnostics,
			skillMetadata,
			unusedSkills: loadUnusedSkills(usedSkills, skillMetadata),
		},
	};
}

function rows(
	map: Map<string, number>,
	skillMetadata?: Map<string, UnusedSkill>,
): string[] {
	return [...map.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([k, v]) => {
			if (!skillMetadata) return `| ${safeLabel(k)} | ${v} |`;
			const metadata = skillMetadata.get(k.toLowerCase());
			const location = metadata?.location || "unknown";
			const description = metadata?.description || "No description";
			return `| ${safeLabel(k)} | ${safeLabel(location)} | ${v} | ${safeLabel(description)} |`;
		});
}

function unusedSkillRows(skills: UnusedSkill[]): string[] {
	return skills.map(
		(skill) =>
			`| ${safeLabel(skill.name)} | ${safeLabel(skill.location)} | ${safeLabel(skill.description)} |`,
	);
}

export function renderSkillStatsMarkdown(result: SkillStatsResult): string {
	const lines = [
		`# Skill stats`,
		"",
		`Generated: ${result.generatedAt.toISOString()}`,
		`Session root: ${result.sessionRootLabel}`,
		"",
	];
	for (const w of result.windows) {
		lines.push(
			`## Usage (${w === "all" ? "all" : `${w}d`})`,
			"",
			"| Skill | Location | Count | Description |",
			"|---|---|---:|---|",
			...rows(result.usage.get(String(w)) || new Map(), result.skillMetadata),
			"",
		);
	}
	if (result.candidates.size > 0)
		lines.push(
			"## Candidate/manual reads (excluded from usage)",
			"",
			"| Evidence | Count |",
			"|---|---:|",
			...rows(result.candidates),
			"",
		);
	lines.push(
		"## Unused skills",
		"",
		"| Skill | Location | Description |",
		"|---|---|---|",
		...unusedSkillRows(result.unusedSkills),
		"",
	);
	if (result.diagnostics.size > 0)
		lines.push(
			"## Diagnostics",
			"",
			"| Diagnostic | Count |",
			"|---|---:|",
			...rows(result.diagnostics),
			"",
		);
	return lines.join("\n");
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("skill-stats", {
		description: "Show best-effort skill usage from Pi session logs.",
		handler: async (args: string, ctx: ExtensionContext) => {
			const { result, errorMarkdown } = await collectSkillStats(args, {
				cwd: ctx.cwd,
			});
			const markdown =
				errorMarkdown ||
				(result
					? renderSkillStatsMarkdown(result)
					: "## Skill stats unavailable");
			pi.sendMessage(
				{ customType: "skill-stats", content: markdown, display: true },
				{
					triggerTurn: false,
				},
			);
		},
	});
}

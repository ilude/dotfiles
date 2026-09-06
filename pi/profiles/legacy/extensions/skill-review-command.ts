import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import { discoverSkills, type SkillRecord } from "../lib/skill-discovery.js";
import {
	buildSkillReviewArtifacts,
	stableJson,
	validateGeneratedArtifacts,
} from "../lib/skill-review.js";

export interface SkillReviewRunOptions {
	repoRoot?: string;
	cwd?: string;
	outputRoot?: string;
	runId?: string;
	now?: Date;
	skills?: SkillRecord[];
}

export interface SkillReviewRunResult {
	runDir: string;
	runId: string;
	summary: string;
	artifactNames: string[];
}

function normalize(input: string): string {
	return input.replace(/\\/g, "/");
}

function timestamp(date: Date): string {
	return date.toISOString().replace(/[-:.]/g, "");
}

async function resolveRepoRoot(pi: ExtensionAPI, cwd: string): Promise<string> {
	const result = await pi.exec("git", ["rev-parse", "--show-toplevel"], {
		cwd,
		timeout: 10000,
	});
	if (result.code !== 0 || !result.stdout.trim())
		throw new Error(`Could not resolve git repo root: ${result.stderr}`);
	return path.resolve(result.stdout.trim());
}

function assertContained(root: string, target: string): void {
	const relative = path.relative(root, target);
	if (
		relative === "" ||
		(!relative.startsWith("..") && !path.isAbsolute(relative))
	)
		return;
	throw new Error(`Output path escapes repo root: ${normalize(target)}`);
}

function assertNoSymlinkEscape(repoRoot: string, outputRoot: string): void {
	const realRepo = fs.realpathSync(repoRoot);
	let current = outputRoot;
	const pending: string[] = [];
	while (!fs.existsSync(current)) {
		pending.push(current);
		const parent = path.dirname(current);
		if (parent === current) break;
		current = parent;
	}
	const realExisting = fs.realpathSync(current);
	assertContained(realRepo, realExisting);
	for (const target of pending.reverse())
		assertContained(realRepo, path.resolve(target));
}

function hashText(text: string): string {
	return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}

function sourceManifest(
	skills: SkillRecord[],
	repoRoot: string,
): Record<string, string> {
	const out: Record<string, string> = {};
	for (const skill of skills) {
		const rel = normalize(path.relative(repoRoot, skill.filePath));
		out[rel] = hashText(`${skill.name}\n${skill.description}\n${skill.body}`);
	}
	return Object.fromEntries(
		Object.entries(out).sort(([a], [b]) => a.localeCompare(b)),
	);
}

function makeRunDir(outputRoot: string, runId: string): string {
	fs.mkdirSync(outputRoot, { recursive: true });
	let runDir = path.join(outputRoot, runId);
	try {
		fs.mkdirSync(runDir);
		return runDir;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
	}
	for (let i = 1; i <= 99; i++) {
		runDir = path.join(outputRoot, `${runId}-${String(i).padStart(2, "0")}`);
		try {
			fs.mkdirSync(runDir);
			return runDir;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
		}
	}
	throw new Error(
		`Could not create exclusive skill-review run directory for ${runId}`,
	);
}

function atomicText(filePath: string, content: string): void {
	const tmp = `${filePath}.tmp-${process.pid}`;
	fs.writeFileSync(tmp, content, "utf-8");
	fs.renameSync(tmp, filePath);
}

export async function runSkillReview(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	options: SkillReviewRunOptions = {},
): Promise<SkillReviewRunResult> {
	const now = options.now ?? new Date();
	const cwd = options.cwd ?? ctx.cwd ?? process.cwd();
	const repoRoot = path.resolve(
		options.repoRoot ?? (await resolveRepoRoot(pi, cwd)),
	);
	const outputRoot = path.resolve(
		options.outputRoot ?? path.join(repoRoot, ".tmp", "skill-review"),
	);
	assertContained(repoRoot, outputRoot);
	assertNoSymlinkEscape(repoRoot, outputRoot);
	const runId = options.runId ?? timestamp(now);
	const runDir = makeRunDir(outputRoot, runId);
	assertContained(repoRoot, fs.realpathSync(runDir));
	atomicText(
		path.join(runDir, "run-manifest.json"),
		stableJson({
			runId,
			repoRoot: normalize(repoRoot),
			status: "started",
			startedAt: now.toISOString(),
		}),
	);
	const skills = options.skills ?? discoverSkills();
	const before = sourceManifest(skills, repoRoot);
	const artifacts = buildSkillReviewArtifacts({
		repoRoot,
		runId,
		now,
		skills,
		sourceManifests: before,
	});
	const validation = validateGeneratedArtifacts({ ...artifacts });
	if (!validation.ok)
		throw new Error(
			`Skill-review artifact validation failed: ${validation.errors.join("; ")}`,
		);
	for (const [name, body] of Object.entries(artifacts))
		atomicText(path.join(runDir, name), body);
	const after = sourceManifest(skills, repoRoot);
	if (stableJson(before) !== stableJson(after))
		throw new Error(
			"Skill-review source manifest changed during read-only run",
		);
	return {
		runDir: normalize(path.relative(repoRoot, runDir)),
		runId: path.basename(runDir),
		summary: artifacts["summary.md"],
		artifactNames: Object.keys(artifacts).sort(),
	};
}

export default function skillReviewExtension(_pi: ExtensionAPI) {}

/**
 * Workflow Commands Extension
 *
 * Registers shared slash commands. Most commands load skill template files and
 * dispatch them via sendUserMessage(). `/commit` is implemented directly so it
 * can run a tighter git workflow with less conversational back-and-forth.
 *
 *   /commit        — smart git commit with secret scanning
 *   /plan-it       — crystallize conversation context into an executable plan
 *   /review-it     — adversarial review of a plan file
 *   /do-it         — smart task routing by complexity
 *   /research      — parallel multi-angle research on a topic
 *   /exit          — gracefully quit pi
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";

const SKILLS_DIR = path.join(os.homedir(), ".dotfiles", "pi", "skills", "workflow");
const CONVENTIONAL_TYPES = ["feat", "fix", "docs", "chore", "refactor", "test", "perf", "ci", "build"];
const CONVENTIONAL_COMMIT_RE = new RegExp(
	`^(${CONVENTIONAL_TYPES.join("|")})(\\([^)]+\\))?: [a-z0-9].{0,71}$`,
);

const SECRET_PATTERNS = [
	{ label: "OpenAI-style key", regex: /\bsk-[A-Za-z0-9_-]{10,}\b/g },
	{ label: "AWS access key", regex: /\bAKIA[A-Z0-9]{16}\b/g },
	{ label: "Private key / certificate", regex: /-----BEGIN(?: [A-Z]+)?-----/g },
	{ label: "GitHub PAT", regex: /\bghp_[A-Za-z0-9]{20,}\b/g },
	{ label: "GitHub fine-grained PAT", regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
	{ label: "npm token", regex: /\bnpm_[A-Za-z0-9]{20,}\b/g },
	{ label: "Slack bot token", regex: /\bxoxb-[A-Za-z0-9-]{10,}\b/g },
	{ label: "Slack user token", regex: /\bxoxp-[A-Za-z0-9-]{10,}\b/g },
	{ label: "JWT", regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\b/g },
	{ label: "Hardcoded password", regex: /\bPASSWORD\s*=\s*.+/g },
	{ label: "Hardcoded token", regex: /\bTOKEN\s*=\s*.+/g },
];

function loadSkill(name: string) {
	const skillPath = path.join(SKILLS_DIR, name);
	try {
		return fs.readFileSync(skillPath, "utf-8");
	} catch (err) {
		throw new Error(`Failed to load skill ${name} from ${skillPath}: ${err}`);
	}
}

function runGit(cwd: string, args: string[]) {
	const result = spawnSync("git", args, { cwd, encoding: "utf8" });
	return {
		code: result.status ?? 1,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
	};
}

function gitOrThrow(cwd: string, args: string[]) {
	const result = runGit(cwd, args);
	if (result.code !== 0) {
		throw new Error((result.stderr || result.stdout || `git ${args.join(" ")} failed`).trim());
	}
	return result.stdout.trim();
}

function parseLines(output: string) {
	return output
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
}

function uniqueSorted(values: string[]) {
	return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function hasMergeConflicts(statusOutput: string) {
	return parseLines(statusOutput).some((line) => {
		const code = line.slice(0, 2);
		return ["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(code);
	});
}

function listChangedFiles(cwd: string) {
	const headDiff = parseLines(gitOrThrow(cwd, ["diff", "--name-only", "HEAD"]));
	const untracked = parseLines(gitOrThrow(cwd, ["ls-files", "--others", "--exclude-standard"]));
	const staged = parseLines(gitOrThrow(cwd, ["diff", "--cached", "--name-only"]));
	return {
		all: uniqueSorted([...headDiff, ...untracked]),
		staged: uniqueSorted(staged),
	};
}

function parseCommitArgs(rawArgs: string, changedFiles: string[]) {
	const tokens = rawArgs.trim().split(/\s+/).filter(Boolean);
	const push = tokens.includes("push");
	const remaining = tokens.filter((token) => token !== "push");
	const changedSet = new Set(changedFiles);
	return {
		push,
		files: remaining.filter((token) => changedSet.has(token)),
		hint: remaining.filter((token) => !changedSet.has(token)).join(" ").trim(),
	};
}

function scanFileForSecrets(cwd: string, relativePath: string) {
	const absolutePath = path.resolve(cwd, relativePath);
	try {
		if (!fs.statSync(absolutePath).isFile()) return [];
	} catch {
		return [];
	}

	let content;
	try {
		content = fs.readFileSync(absolutePath, "utf8");
	} catch {
		return [];
	}

	const findings: Array<{ path: string; label: string; match: string }> = [];
	for (const pattern of SECRET_PATTERNS) {
		for (const match of content.matchAll(pattern.regex)) {
			findings.push({
				path: relativePath,
				label: pattern.label,
				match: String(match[0]).slice(0, 80),
			});
		}
	}
	return findings;
}

function scanFilesForSecrets(cwd: string, files: string[]) {
	return files.flatMap((file) => scanFileForSecrets(cwd, file));
}

function classifyScopeRoot(file: string) {
	if (["install", "install.ps1", "Brewfile"].includes(file)) return "dotfiles";
	const root = file.split("/")[0] ?? file;
	if (["zsh", "pi", "claude", "opencode", "onyx", "menos"].includes(root)) return root;
	return "repo";
}

function detectScope(files: string[]) {
	const roots = uniqueSorted(files.map(classifyScopeRoot));
	if (roots.length === 1) return roots[0];
	return roots.includes("pi") && roots.length <= 2 ? "pi" : "dotfiles";
}

function isDocsFile(file: string) {
	return [".md", ".rst", ".txt"].some((ext) => file.endsWith(ext));
}

function isTestFile(file: string) {
	return file.includes("test") || file.includes("spec");
}

function isConfigFile(file: string) {
	return ["install", "install.ps1", "Brewfile", "settings.json"].some((name) => file.endsWith(name));
}

function diffIncludesAny(diffText: string, snippets: string[]) {
	return snippets.some((snippet) => diffText.includes(snippet));
}

function detectType(files: string[], diffText: string) {
	if (files.length > 0 && files.every(isDocsFile)) return "docs";
	if (files.length > 0 && files.every(isTestFile)) return "test";
	if (files.every((file) => isDocsFile(file) || isTestFile(file)) && files.some(isDocsFile)) return "docs";
	if (diffIncludesAny(diffText, ["registerCommand(", "registerTool(", "+\t/exit", "+\t/commit"])) return "feat";
	if (diffIncludesAny(diffText, ["fix", "error", "failed", "bug", "prevent", "correct"])) return "fix";
	if (files.every(isConfigFile)) return "chore";
	return "chore";
}

function detectDescription(files: string[], diffText: string) {
	if (files.includes("pi/extensions/workflow-commands.ts")) {
		if (diffIncludesAny(diffText, ["executeCommitCommand", "confirmCommitMessage", "chooseFilesToCommit"])) {
			return "improve commit workflow";
		}
		if (diffText.includes('registerCommand("exit"')) return "add exit command";
		return "update workflow commands";
	}
	if (files.every(isDocsFile)) return "update documentation";
	if (files.every((file) => file.startsWith("pi/"))) return "update pi configuration";
	if (files.some((file) => ["install", "install.ps1", "Brewfile"].includes(file))) {
		return "update install and shell configuration";
	}
	return "update tracked changes";
}

function toConventionalDescription(input: string) {
	return input.trim().toLowerCase().replace(/[.]+$/g, "").replace(/\s+/g, " ").slice(0, 72);
}

function proposeCommitMessage(files: string[], hint: string, diffText: string) {
	const scope = detectScope(files);
	const type = detectType(files, diffText);
	const subject = `${type}(${scope}): ${toConventionalDescription(hint || detectDescription(files, diffText))}`;
	return files.length > 3 ? { subject, body: `Update ${files.length} tracked paths across ${scope}.` } : { subject };
}

function formatCommitMessage(message: { subject: string; body?: string }) {
	return message.body ? `${message.subject}\n\n${message.body}` : message.subject;
}

function isValidConventionalCommit(subject: string) {
	return CONVENTIONAL_COMMIT_RE.test(subject);
}

async function confirmSecretScan(ctx: any, findings: Array<{ path: string; label: string; match: string }>) {
	if (findings.length === 0) return true;
	const preview = findings.slice(0, 8).map((finding) => `- ${finding.path}: ${finding.label} (${finding.match})`).join("\n");
	return ctx.ui.confirm("Secret scan findings", `${preview}${findings.length > 8 ? "\n- ..." : ""}\n\nContinue anyway?`);
}

async function chooseFilesToCommit(ctx: any, changedFiles: string[], stagedFiles: string[], requestedFiles: string[]) {
	if (requestedFiles.length > 0) return { files: requestedFiles, stageAll: true, cancelled: false };
	if (stagedFiles.length === 0) return { files: changedFiles, stageAll: true, cancelled: false };

	const unstagedOrUntracked = changedFiles.filter((file) => !stagedFiles.includes(file));
	if (unstagedOrUntracked.length === 0) return { files: stagedFiles, stageAll: false, cancelled: false };

	const choice = await ctx.ui.select("Commit scope", [
		`Use already staged changes (${stagedFiles.length} file${stagedFiles.length === 1 ? "" : "s"})`,
		`Stage all changed files (${changedFiles.length} file${changedFiles.length === 1 ? "" : "s"})`,
		"Cancel",
	]);
	if (!choice || choice === "Cancel") return { files: [], stageAll: false, cancelled: true };
	if (choice.startsWith("Use already staged changes")) return { files: stagedFiles, stageAll: false, cancelled: false };
	return { files: changedFiles, stageAll: true, cancelled: false };
}

function stageFiles(cwd: string, files: string[]) {
	const addResult = runGit(cwd, ["add", "--", ...files]);
	if (addResult.code !== 0) throw new Error((addResult.stderr || addResult.stdout).trim() || "git add failed");
}

async function confirmCommitMessage(
	ctx: any,
	commitMessage: { subject: string; body?: string },
	filesToCommit: string[],
	cachedStat: string,
	diffStat: string,
) {
	const details = `${formatCommitMessage(commitMessage)}\n\nFiles:\n${filesToCommit.join("\n")}\n\nDiff stat:\n${cachedStat || diffStat}`;
	if (await ctx.ui.confirm("Proposed commit message", details)) return commitMessage;

	const revisedSubject = await ctx.ui.input("Revise commit message", commitMessage.subject);
	if (!revisedSubject) return null;
	const subject = revisedSubject.trim();
	if (!isValidConventionalCommit(subject)) {
		throw new Error("Commit message must match conventional commit format: type(scope): description");
	}
	return { subject, body: commitMessage.body };
}

function commitCurrentChanges(cwd: string, commitMessage: { subject: string; body?: string }) {
	const commitArgs = commitMessage.body
		? ["commit", "-m", commitMessage.subject, "-m", commitMessage.body]
		: ["commit", "-m", commitMessage.subject];
	const commitResult = runGit(cwd, commitArgs);
	if (commitResult.code !== 0) throw new Error((commitResult.stderr || commitResult.stdout).trim() || "git commit failed");
	return gitOrThrow(cwd, ["rev-parse", "--short", "HEAD"]);
}

function pushCurrentBranch(cwd: string) {
	const pushResult = runGit(cwd, ["push"]);
	if (pushResult.code !== 0) throw new Error((pushResult.stderr || pushResult.stdout).trim() || "git push failed");
}

function summarizeCommit(hash: string, subject: string, pushed: boolean) {
	return pushed ? `${hash} ${subject}\nPushed to remote` : `${hash} ${subject}`;
}

function getCommitContext(cwd: string) {
	const diffStat = gitOrThrow(cwd, ["diff", "--stat", "HEAD"]);
	const { all: changedFiles, staged: stagedFiles } = listChangedFiles(cwd);
	if (changedFiles.length === 0) throw new Error("No changed files found");
	return { diffStat, changedFiles, stagedFiles };
}

async function prepareCommitSelection(args: string, ctx: any) {
	const { diffStat, changedFiles, stagedFiles } = getCommitContext(ctx.cwd);
	const findings = scanFilesForSecrets(ctx.cwd, changedFiles);
	if (!(await confirmSecretScan(ctx, findings))) return null;

	const parsedArgs = parseCommitArgs(args, changedFiles);
	const selection = await chooseFilesToCommit(ctx, changedFiles, stagedFiles, parsedArgs.files);
	if (selection.cancelled || selection.files.length === 0) return null;
	if (selection.stageAll) stageFiles(ctx.cwd, selection.files);

	const cachedStat = gitOrThrow(ctx.cwd, ["diff", "--cached", "--stat"]);
	if (!cachedStat.trim()) throw new Error("Nothing is staged for commit");
	const cachedDiff = gitOrThrow(ctx.cwd, ["diff", "--cached", "--no-color"]);
	return { parsedArgs, selection, diffStat, cachedStat, cachedDiff };
}

async function executeCommitCommand(args: string, ctx: any) {
	const status = gitOrThrow(ctx.cwd, ["status", "--short"]);
	if (!status.trim()) return ctx.ui.notify("Working tree is clean", "info");
	if (hasMergeConflicts(status)) return ctx.ui.notify("Resolve merge conflicts before committing", "error");

	const prepared = await prepareCommitSelection(args, ctx);
	if (!prepared) return ctx.ui.notify("Commit cancelled", "warning");

	const proposed = proposeCommitMessage(prepared.selection.files, prepared.parsedArgs.hint, prepared.cachedDiff);
	const commitMessage = await confirmCommitMessage(
		ctx,
		proposed,
		prepared.selection.files,
		prepared.cachedStat,
		prepared.diffStat,
	);
	if (!commitMessage) return ctx.ui.notify("Commit cancelled", "warning");
	if (!isValidConventionalCommit(commitMessage.subject)) {
		return ctx.ui.notify("Proposed commit message does not match conventional commit format", "error");
	}

	const hash = commitCurrentChanges(ctx.cwd, commitMessage);
	if (prepared.parsedArgs.push) pushCurrentBranch(ctx.cwd);
	return ctx.ui.notify(summarizeCommit(hash, commitMessage.subject, prepared.parsedArgs.push), "info");
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("commit", {
		description: "Smart git commit with secret scanning",
		handler: async (args, ctx) => {
			try {
				await executeCommitCommand(args, ctx);
			} catch (err) {
				ctx.ui.notify(err instanceof Error ? err.message : String(err), "error");
			}
		},
	});

	pi.registerCommand("plan-it", {
		description: "Crystallize conversation context into an executable plan document",
		handler: async (args, ctx) => {
			const template = loadSkill("plan-it.md");
			await pi.sendUserMessage(template + (args.trim() ? `\n\nArgs: ${args}` : ""));
		},
	});

	pi.registerCommand("review-it", {
		description: "Adversarial review of a plan file — finds bugs, gaps, and failure modes",
		handler: async (args, ctx) => {
			const template = loadSkill("review-it.md");
			await pi.sendUserMessage(template.replace("$ARGUMENTS", args.trim()) + (args.trim() ? `\n\nArgs: ${args}` : ""));
		},
	});

	pi.registerCommand("do-it", {
		description: "Smart task routing — implements directly, delegates, or plans based on complexity",
		handler: async (args, ctx) => {
			const template = loadSkill("do-it.md");
			await pi.sendUserMessage(template.replace("$ARGUMENTS", args.trim()) + (args.trim() ? `\n\nArgs: ${args}` : ""));
		},
	});

	pi.registerCommand("research", {
		description: "Parallel multi-angle research — primary sources, practical guidance, and alternatives",
		handler: async (args, ctx) => {
			const template = loadSkill("research.md");
			await pi.sendUserMessage(template.replace("$ARGUMENTS", args.trim()) + (args.trim() ? `\n\nArgs: ${args}` : ""));
		},
	});

	pi.registerCommand("gitlab-ticket", {
		description: "Generate a structured GitLab issue from context or description, review, then file via glab",
		handler: async (args, ctx) => {
			const template = loadSkill("gitlab-ticket.md");
			await pi.sendUserMessage(template + (args.trim() ? `\n\nArgs: ${args}` : ""));
		},
	});

	pi.registerCommand("exit", {
		description: "Gracefully quit pi",
		handler: async (_args, ctx) => {
			ctx.shutdown();
		},
	});
}

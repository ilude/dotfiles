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

// Convention exception: direct ctx.ui.notify calls in slash-command flows.
// Risk: notification wording could drift from the rest of the extension set
//   if helper format changes; today uiNotify only adds an extension prefix
//   that would be redundant since the user typed the slash command to trigger
//   each flow.
// Why shared helper is inappropriate: a `[workflow-commands]` prefix on every
//   /commit / /plan-it / /review-it status line would echo back the slash
//   command name and add visual noise to user-facing command output.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { completeSimple, type TextContent } from "@mariozechner/pi-ai";
import { Text } from "@mariozechner/pi-tui";
import { resolveCommitPlanningModelFromRegistry } from "../lib/model-routing";

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

function loadClaudeCommitInstructions() {
	const instructionsPath = path.join(os.homedir(), ".dotfiles", "claude", "shared", "commit-instructions.md");
	try {
		return fs.readFileSync(instructionsPath, "utf-8");
	} catch (err) {
		throw new Error(`Failed to load Claude commit instructions from ${instructionsPath}: ${err}`);
	}
}

interface CommitPlanGroup {
	files: string[];
	subject: string;
	body?: string;
}

interface CommitPlan {
	groups: CommitPlanGroup[];
	warnings?: string[];
}

interface GitRunResult {
	code: number;
	stdout: string;
	stderr: string;
}

interface SecretCandidate {
	path: string;
	label: string;
	match: string;
	line: number;
	context: string;
}

interface SecretReviewFinding {
	path: string;
	label: string;
	classification: "likely_secret" | "example" | "ambiguous";
	reason: string;
	match?: string;
}

interface SecretReviewResult {
	findings: SecretReviewFinding[];
}

interface CommitActivity {
	setPhase(message?: string): void;
	logCommand(command: string, result?: GitRunResult): void;
	logInfo(message: string): void;
	finish(): void;
}

const COMMIT_ACTIVITY_TYPE = "workflow-commit-activity";

function extractJsonObject(text: string) {
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	if (start === -1 || end === -1 || end < start) return undefined;
	return text.slice(start, end + 1);
}

export function parseCommitPlan(text: string): CommitPlan {
	const jsonText = extractJsonObject(text);
	if (!jsonText) throw new Error("Planner did not return JSON");
	const parsed = JSON.parse(jsonText) as CommitPlan;
	if (!parsed || !Array.isArray(parsed.groups) || parsed.groups.length === 0) {
		throw new Error("Planner returned no commit groups");
	}
	for (const group of parsed.groups) {
		if (!Array.isArray(group.files) || group.files.length === 0 || !group.files.every((file) => typeof file === "string")) {
			throw new Error("Planner returned a group without valid files");
		}
		if (typeof group.subject !== "string" || !group.subject.trim()) {
			throw new Error("Planner returned a group without a commit subject");
		}
		if (group.body !== undefined && typeof group.body !== "string") {
			throw new Error("Planner returned a non-string commit body");
		}
	}
	return parsed;
}

export function validateCommitPlan(plan: CommitPlan, changedFiles: string[]) {
	const changedSet = new Set(changedFiles);
	const seen = new Set<string>();
	for (const group of plan.groups) {
		for (const file of group.files) {
			if (!changedSet.has(file)) {
				throw new Error(`Planner referenced unknown file: ${file}`);
			}
			if (seen.has(file)) {
				throw new Error(`Planner assigned file to multiple groups: ${file}`);
			}
			seen.add(file);
		}
		if (!isValidConventionalCommit(group.subject.trim())) {
			throw new Error(`Planner produced invalid conventional commit subject: ${group.subject}`);
		}
	}
	const missing = changedFiles.filter((file) => !seen.has(file));
	if (missing.length > 0) {
		throw new Error(`Planner omitted changed files: ${missing.join(", ")}`);
	}
}

function extractAssistantText(content: unknown) {
	if (!Array.isArray(content)) return "";
	return content
		.filter((block): block is TextContent => !!block && typeof block === "object" && "type" in block && block.type === "text")
		.map((block) => block.text)
		.join("\n");
}

function buildCommitPlanningPrompt(
	claudeInstructions: string,
	context: { files: string[]; diffStat: string; cachedStat: string; cachedDiff: string; hint: string },
) {
	const payload = {
		files: context.files,
		diffStat: context.diffStat,
		cachedStat: context.cachedStat,
		hint: context.hint,
		cachedDiff: context.cachedDiff,
	};
	return `${claudeInstructions}

You are helping Pi's deterministic /commit command.

Your ONLY job is to plan logical commit groups and produce conventional commit messages.
Do NOT tell the user to run shell commands.
Do NOT describe a workflow.
Do NOT omit any listed files.
All files must be assigned to exactly one group.
Return JSON only with this schema:
{
  "groups": [
    {
      "files": ["path"],
      "subject": "type(scope): description",
      "body": "optional body"
    }
  ],
  "warnings": ["optional warning"]
}

Rules:
- Group files into atomic commits.
- Use conventional commit subjects.
- Keep descriptions specific and human.
- If only one commit makes sense, return one group.
- If you are uncertain, cannot infer a split, or think no split is justified, return one group containing all listed files.
- You MUST return a non-empty plain-text response containing exactly one valid JSON object.
- Never return an empty response.
- Prefer no body unless it adds useful why/context.

Commit planning context (JSON):
${JSON.stringify(payload, null, 2)}`;
}

function buildSingleGroupCommitPlan(
	context: { files: string[]; diffStat: string; cachedStat: string; cachedDiff: string; hint: string },
	warning?: string,
): CommitPlan {
	const message = proposeCommitMessage(context.files, context.hint, context.cachedDiff);
	return {
		groups: [
			{
				files: context.files,
				subject: message.subject,
				...(message.body ? { body: message.body } : {}),
			},
		],
		warnings: warning ? [warning] : undefined,
	};
}

async function generateCommitPlanWithLlm(
	_ctxPi: ExtensionAPI,
	ctx: any,
	context: { files: string[]; diffStat: string; cachedStat: string; cachedDiff: string; hint: string },
) {
	const model = await resolveCommitPlanningModelFromRegistry(ctx.modelRegistry, ctx);
	if (!model) {
		throw new Error("No small/mini model available for commit planning");
	}
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth?.ok) {
		throw new Error(auth?.error || "No configured auth available for commit planning model");
	}
	const planningPrompt = buildCommitPlanningPrompt(loadClaudeCommitInstructions(), context);
	const response = await completeSimple(
		model,
		{
			systemPrompt: ctx.getSystemPrompt?.(),
			messages: [{ role: "user", content: planningPrompt, timestamp: Date.now() }],
		},
		{
			apiKey: auth.apiKey,
			headers: auth.headers,
			reasoning: "minimal",
			signal: ctx.signal,
		},
	);
	const planText = extractAssistantText(response.content);
	if (!planText.trim()) {
		return buildSingleGroupCommitPlan(context, "Commit planner returned empty response; used single-commit fallback.");
	}
	const plan = parseCommitPlan(planText);
	validateCommitPlan(plan, context.files);
	return plan;
}

function shouldLogGitCommand(args: string[]) {
	const command = args[0];
	return command !== "diff" && command !== "ls-files" && command !== "rev-parse";
}

function runGit(cwd: string, args: string[], activity?: CommitActivity): GitRunResult {
	const result = spawnSync("git", args, { cwd, encoding: "utf8" });
	const gitResult = {
		code: result.status ?? 1,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
	};
	if (shouldLogGitCommand(args)) {
		activity?.logCommand(`git ${args.join(" ")}`, gitResult);
	}
	return gitResult;
}

function gitOrThrow(cwd: string, args: string[], activity?: CommitActivity) {
	const result = runGit(cwd, args, activity);
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

function listChangedFiles(cwd: string, activity?: CommitActivity) {
	const headDiff = parseLines(gitOrThrow(cwd, ["diff", "--name-only", "HEAD"], activity));
	const untracked = parseLines(gitOrThrow(cwd, ["ls-files", "--others", "--exclude-standard"], activity));
	const staged = parseLines(gitOrThrow(cwd, ["diff", "--cached", "--name-only"], activity));
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

function buildSecretContext(content: string, index: number) {
	const lineStarts = [0];
	for (let i = 0; i < content.length; i++) {
		if (content[i] === "\n") lineStarts.push(i + 1);
	}
	let lineIndex = 0;
	for (let i = 0; i < lineStarts.length; i++) {
		if (lineStarts[i] <= index) lineIndex = i;
		else break;
	}
	const startLine = Math.max(0, lineIndex - 1);
	const endLine = Math.min(lineStarts.length - 1, lineIndex + 1);
	const lines = content.split(/\r?\n/);
	const snippet = lines.slice(startLine, endLine + 1).join("\n");
	return { line: lineIndex + 1, context: snippet.slice(0, 400) };
}

function scanFileForSecrets(cwd: string, relativePath: string): SecretCandidate[] {
	const absolutePath = path.resolve(cwd, relativePath);
	try {
		if (!fs.statSync(absolutePath).isFile()) return [];
	} catch {
		return [];
	}

	let content: string;
	try {
		content = fs.readFileSync(absolutePath, "utf8");
	} catch {
		return [];
	}

	const findings: SecretCandidate[] = [];
	for (const pattern of SECRET_PATTERNS) {
		for (const match of content.matchAll(pattern.regex)) {
			const raw = String(match[0]);
			const index = match.index ?? 0;
			const { line, context } = buildSecretContext(content, index);
			findings.push({
				path: relativePath,
				label: pattern.label,
				match: raw.slice(0, 80),
				line,
				context,
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
	if (["zsh", "pi", "claude", "opencode", "menos"].includes(root)) return root;
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

export function proposeCommitMessage(files: string[], hint: string, diffText: string) {
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

function buildSecretReviewPrompt(findings: SecretCandidate[]) {
	const payload = findings.map((finding) => ({
		path: finding.path,
		label: finding.label,
		match: finding.match,
		line: finding.line,
		context: finding.context,
	}));
	return `You are reviewing candidate secret findings for Pi's /commit workflow.

Classify each candidate as exactly one of:
- likely_secret → appears to be a real credential, private key, token, password assignment, or other sensitive secret that should block commit
- example → documentation, sample text, test fixture, placeholder, redacted value, or obviously non-secret instructional content
- ambiguous → unclear from context; may be real, should require human confirmation

Be skeptical of false positives in markdown docs, comments, tests, examples, and instructional text.
Only mark likely_secret when the content looks like an actual usable secret or credential-bearing assignment.

Return JSON only in this schema:
{
  "findings": [
    {
      "path": "file",
      "label": "pattern label",
      "classification": "likely_secret|example|ambiguous",
      "reason": "short reason",
      "match": "matched text preview"
    }
  ]
}

Candidate findings JSON:
${JSON.stringify(payload, null, 2)}`;
}

function parseSecretReviewResult(text: string): SecretReviewResult {
	const jsonText = extractJsonObject(text);
	if (!jsonText) throw new Error("Secret reviewer did not return JSON");
	const parsed = JSON.parse(jsonText) as SecretReviewResult;
	if (!parsed || !Array.isArray(parsed.findings)) throw new Error("Secret reviewer returned invalid findings");
	return parsed;
}

async function reviewSecretFindingsWithLlm(ctx: any, findings: SecretCandidate[]): Promise<SecretReviewFinding[]> {
	if (findings.length === 0) return [];
	const model = await resolveCommitPlanningModelFromRegistry(ctx.modelRegistry, ctx);
	if (!model) throw new Error("No small/mini model available for secret review");
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth?.ok) throw new Error(auth?.error || "No configured auth available for secret review model");
	const response = await completeSimple(
		model,
		{
			systemPrompt: ctx.getSystemPrompt?.(),
			messages: [{ role: "user", content: buildSecretReviewPrompt(findings), timestamp: Date.now() }],
		},
		{
			apiKey: auth.apiKey,
			headers: auth.headers,
			reasoning: "minimal",
			signal: ctx.signal,
		},
	);
	const text = extractAssistantText(response.content);
	if (!text.trim()) throw new Error("Secret reviewer returned no assistant text");
	return parseSecretReviewResult(text).findings;
}

async function confirmSecretScan(ctx: any, findings: SecretCandidate[]) {
	if (findings.length === 0) return true;
	const reviewed = await reviewSecretFindingsWithLlm(ctx, findings);
	const blocking = reviewed.filter((finding) => finding.classification === "likely_secret" || finding.classification === "ambiguous");
	if (blocking.length === 0) return true;
	const preview = blocking
		.slice(0, 8)
		.map((finding) => `- ${finding.path}: ${finding.label} [${finding.classification}]${finding.match ? ` (${finding.match})` : ""} — ${finding.reason}`)
		.join("\n");
	throw new Error(
		`Potential secrets detected after review:\n${preview}${blocking.length > 8 ? "\n- ..." : ""}\n\nRemove the secrets, redact them, or exclude the files before committing.`,
	);
}

export async function chooseFilesToCommit(_ctx: any, changedFiles: string[], _stagedFiles: string[], requestedFiles: string[]) {
	if (requestedFiles.length > 0) return { files: requestedFiles, stageAll: true, cancelled: false };
	return { files: changedFiles, stageAll: true, cancelled: false };
}

function stageFiles(cwd: string, files: string[], activity?: CommitActivity) {
	const addResult = runGit(cwd, ["add", "--", ...files], activity);
	if (addResult.code !== 0) throw new Error((addResult.stderr || addResult.stdout).trim() || "git add failed");
}

function unstageFiles(cwd: string, files: string[], activity?: CommitActivity) {
	const resetResult = runGit(cwd, ["reset", "HEAD", "--", ...files], activity);
	if (resetResult.code !== 0) throw new Error((resetResult.stderr || resetResult.stdout).trim() || "git reset failed");
}

export async function confirmCommitMessage(
	_ctx: any,
	commitMessage: { subject: string; body?: string },
	_filesToCommit: string[],
	_cachedStat: string,
	_diffStat: string,
) {
	if (!isValidConventionalCommit(commitMessage.subject)) {
		throw new Error("Commit message must match conventional commit format: type(scope): description");
	}
	return commitMessage;
}

function commitCurrentChanges(cwd: string, commitMessage: { subject: string; body?: string }, activity?: CommitActivity) {
	const commitArgs = commitMessage.body
		? ["commit", "-m", commitMessage.subject, "-m", commitMessage.body]
		: ["commit", "-m", commitMessage.subject];
	const commitResult = runGit(cwd, commitArgs, activity);
	if (commitResult.code !== 0) throw new Error((commitResult.stderr || commitResult.stdout).trim() || "git commit failed");
	return gitOrThrow(cwd, ["rev-parse", "--short", "HEAD"], activity);
}

function pushCurrentBranch(cwd: string, activity?: CommitActivity) {
	const pushResult = runGit(cwd, ["push"], activity);
	if (pushResult.code !== 0) throw new Error((pushResult.stderr || pushResult.stdout).trim() || "git push failed");
}

function summarizeCommit(hash: string, subject: string, pushed: boolean) {
	return pushed ? `${hash} ${subject}\nPushed to remote` : `${hash} ${subject}`;
}

function formatGitOutput(result?: GitRunResult) {
	if (!result) return ["ok"];
	const outputLines: string[] = [];
	const stdout = result.stdout.trim();
	const stderr = result.stderr.trim();
	if (stdout) {
		for (const line of stdout.split(/\r?\n/)) outputLines.push(line);
	}
	if (stderr) {
		for (const line of stderr.split(/\r?\n/)) outputLines.push(`stderr: ${line}`);
	}
	if (outputLines.length === 0) {
		outputLines.push(result.code === 0 ? "ok" : `exit ${result.code}`);
	}
	return outputLines;
}

function createCommitActivity(pi: ExtensionAPI, ctx: any, commandText: string): CommitActivity {
	const fallbackLines: string[] = [];
	const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
	let spinnerIndex = 0;
	let spinnerTimer: ReturnType<typeof setInterval> | undefined;

	const stopSpinner = () => {
		if (spinnerTimer) {
			clearInterval(spinnerTimer);
			spinnerTimer = undefined;
		}
		ctx.ui.setStatus?.("commit-spinner", undefined);
	};

	const startSpinner = (phase: string) => {
		stopSpinner();
		const tick = () => {
			ctx.ui.setStatus?.("commit-spinner", `${spinnerFrames[spinnerIndex]} ${phase}`);
			spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
		};
		tick();
		spinnerTimer = setInterval(tick, 120);
	};

	const emit = (content: string) => {
		if (typeof pi.sendMessage === "function") {
			pi.sendMessage({
				customType: COMMIT_ACTIVITY_TYPE,
				content,
				display: true,
			});
			return;
		}
		fallbackLines.push(content);
		ctx.ui.setWidget?.("commit-progress", fallbackLines.slice(-10), { placement: "aboveEditor" });
	};

	emit(commandText);

	return {
		setPhase(message?: string) {
			const phase = message ?? "done";
			emit(`phase: ${phase}`);
			if (phase === "planning commits") startSpinner(phase);
			else stopSpinner();
		},
		logCommand(command: string, result?: GitRunResult) {
			const output = formatGitOutput(result)
				.map((line) => `  ${line}`)
				.join("\n");
			const content = output ? `$ ${command}\n${output}` : `$ ${command}`;
			emit(content);
		},
		logInfo(message: string) {
			emit(message);
		},
		finish() {
			stopSpinner();
			emit("phase: done");
		},
	};
}

function getCommitContext(cwd: string, activity?: CommitActivity) {
	const diffStat = gitOrThrow(cwd, ["diff", "--stat", "HEAD"], activity);
	const { all: changedFiles, staged: stagedFiles } = listChangedFiles(cwd, activity);
	if (changedFiles.length === 0) throw new Error("No changed files found");
	return { diffStat, changedFiles, stagedFiles };
}

async function prepareCommitSelection(args: string, ctx: any, activity?: CommitActivity) {
	const { diffStat, changedFiles, stagedFiles } = getCommitContext(ctx.cwd, activity);
	const findings = scanFilesForSecrets(ctx.cwd, changedFiles);
	if (!(await confirmSecretScan(ctx, findings))) return null;

	const parsedArgs = parseCommitArgs(args, changedFiles);
	const selection = await chooseFilesToCommit(ctx, changedFiles, stagedFiles, parsedArgs.files);
	if (selection.cancelled || selection.files.length === 0) return null;
	if (selection.stageAll) stageFiles(ctx.cwd, selection.files, activity);

	const cachedStat = gitOrThrow(ctx.cwd, ["diff", "--cached", "--stat"], activity);
	if (!cachedStat.trim()) throw new Error("Nothing is staged for commit");
	const cachedDiff = gitOrThrow(ctx.cwd, ["diff", "--cached", "--no-color"], activity);
	return { parsedArgs, selection, diffStat, cachedStat, cachedDiff };
}

async function executeCommitCommand(pi: ExtensionAPI, args: string, ctx: any) {
	const commandText = `/commit${args.trim() ? ` ${args.trim()}` : ""}`;
	const activity = createCommitActivity(pi, ctx, commandText);
	ctx.ui.notify(`Starting ${commandText}…`, "info");
	activity.setPhase("preparing");
	try {
		const status = gitOrThrow(ctx.cwd, ["status", "--short"], activity);
		if (!status.trim()) {
			activity.finish();
			return ctx.ui.notify("Working tree is clean", "info");
		}
		if (hasMergeConflicts(status)) {
			activity.finish();
			return ctx.ui.notify("Resolve merge conflicts before committing", "error");
		}

		const prepared = await prepareCommitSelection(args, ctx, activity);
		if (!prepared) {
			activity.finish();
			return ctx.ui.notify("Commit cancelled", "warning");
		}
		activity.setPhase("planning commits");

		let plan: CommitPlan | undefined;
		try {
			plan = await generateCommitPlanWithLlm(pi, ctx, {
				files: prepared.selection.files,
				diffStat: prepared.diffStat,
				cachedStat: prepared.cachedStat,
				cachedDiff: prepared.cachedDiff,
				hint: prepared.parsedArgs.hint,
			});
		} catch (err) {
			ctx.ui.notify(
				`Commit planner unavailable, falling back to single commit: ${err instanceof Error ? err.message : String(err)}`,
				"warning",
			);
		}

		if (!plan) {
			activity.setPhase("creating commit");
			const proposed = proposeCommitMessage(prepared.selection.files, prepared.parsedArgs.hint, prepared.cachedDiff);
			const commitMessage = await confirmCommitMessage(
				ctx,
				proposed,
				prepared.selection.files,
				prepared.cachedStat,
				prepared.diffStat,
			);
			if (!commitMessage) {
				activity.finish();
				return ctx.ui.notify("Commit cancelled", "warning");
			}
			if (!isValidConventionalCommit(commitMessage.subject)) {
				activity.finish();
				return ctx.ui.notify("Proposed commit message does not match conventional commit format", "error");
			}
			const hash = commitCurrentChanges(ctx.cwd, commitMessage, activity);
			if (prepared.parsedArgs.push) {
				activity.setPhase("pushing");
				pushCurrentBranch(ctx.cwd, activity);
			}
			activity.finish();
			return ctx.ui.notify(summarizeCommit(hash, commitMessage.subject, prepared.parsedArgs.push), "info");
		}

		const commitSummaries: string[] = [];
		unstageFiles(ctx.cwd, prepared.selection.files, activity);
		for (const [index, group] of plan.groups.entries()) {
			activity.setPhase(`creating commit ${index + 1}/${plan.groups.length}`);
			stageFiles(ctx.cwd, group.files, activity);
			const stagedStat = gitOrThrow(ctx.cwd, ["diff", "--cached", "--stat"], activity);
			const commitMessage = await confirmCommitMessage(
				ctx,
				{ subject: group.subject.trim(), body: group.body?.trim() || undefined },
				group.files,
				stagedStat,
				prepared.diffStat,
			);
			if (!commitMessage) {
				unstageFiles(ctx.cwd, group.files, activity);
				activity.finish();
				return ctx.ui.notify("Commit cancelled", "warning");
			}
			const hash = commitCurrentChanges(ctx.cwd, commitMessage, activity);
			commitSummaries.push(`${hash} ${commitMessage.subject}`);
		}
		if (prepared.parsedArgs.push) {
			activity.setPhase("pushing");
			pushCurrentBranch(ctx.cwd, activity);
			activity.logInfo("Pushed to remote");
		}
		activity.finish();
		return ctx.ui.notify(commitSummaries.join("\n"), "info");
	} catch (err) {
		activity.finish();
		throw err;
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("input", async (event, ctx) => {
		if (event.source === "extension") {
			return { action: "continue" };
		}
		if (event.text.trim().toLowerCase() === "exit") {
			ctx.shutdown();
			return { action: "handled" };
		}
		return { action: "continue" };
	});

	if (typeof pi.registerMessageRenderer === "function") {
		pi.registerMessageRenderer(COMMIT_ACTIVITY_TYPE, (message, _options, theme) => {
			const text = typeof message.content === "string" ? message.content : String(message.content ?? "");
			const styled = text
				.split("\n")
				.map((line) => {
					if (line === "Pushed to remote") {
						return theme.bold(theme.fg("success", line));
					}
					if (line.startsWith("  ") || line.startsWith("stderr:")) {
						return theme.fg("toolOutput", line);
					}
					return theme.bold(theme.fg("text", line));
				})
				.join("\n");
			return new Text(theme.bold(theme.fg("success", "> ")) + styled, 0, 0);
		});
	}

	pi.registerCommand("commit", {
		description: "Smart git commit with LLM grouping + deterministic execution",
		handler: async (args, ctx) => {
			try {
				await executeCommitCommand(pi, args, ctx);
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
		description: "Generate a structured GitLab issue, then optionally create an issue-numbered branch and draft MR",
		handler: async (args, ctx) => {
			const template = loadSkill("gitlab-ticket.md");
			const followOn = "\n\nFollow the full GitLab workflow in the skill: issue first, then if the user wants follow-on work, prefer an <issue-number>-<kebab-case-title> branch name and a draft MR by default.";
			await pi.sendUserMessage(template + followOn + (args.trim() ? `\n\nArgs: ${args}` : ""));
		},
	});

	pi.registerCommand("exit", {
		description: "Gracefully quit pi",
		handler: async (_args, ctx) => {
			ctx.shutdown();
		},
	});
}

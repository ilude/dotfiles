/**
 * Damage Control Extension
 *
 * Intercepts tool_call events and enforces safety rules:
 *   - Blocks dangerous shell commands (rm -rf, git reset --hard, etc.)
 *   - Blocks access to zero-access paths (~/.ssh/*, *.pem, .env, etc.)
 *   - Blocks deletes/truncates of no-delete paths (package.json, Makefile, etc.)
 *
 * Rules are loaded from ~/.pi/agent/damage-control-rules.yaml (or project-local
 * .pi/damage-control-rules.yaml).
 *
 * Path canonicalization via the shared canonicalize helper resolves symlinks
 * (preventing traversal escapes) and rejects NUL bytes; on rejection,
 * canonicalizeOrBlock surfaces a block decision instead of throwing.
 *
 * Handlers:
 *   1. bash tool_call -- dangerous commands + no_delete_paths via extractors
 *   1b. pwsh tool_call -- no_delete_paths via PowerShell-aware extractors
 *   2. file tool_calls (read/write/edit/find/ls) -- zero-access paths +
 *      truncating Edit/Write detection
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	type ExtensionAPI,
	type BashToolCallEvent,
	type ReadToolCallEvent,
	type WriteToolCallEvent,
	type EditToolCallEvent,
} from "@mariozechner/pi-coding-agent";
import { canonicalize as sharedCanonicalize } from "../lib/extension-utils.js";
import {
	type DecisionProvenance,
	recordDecision,
} from "../lib/permission-registry.js";

/**
 * Operator permission registry integration.
 *
 * Damage-control intercepts tool_call events and either allows (returns
 * undefined) or denies them ({ block: true, reason }). We log every deny
 * with provenance "rule" since damage-control decisions are pattern-driven.
 *
 * Provenance categories supported by the registry: "manual_once" (user
 * one-shot approval/denial), "session" (session-scoped trust), "rule"
 * (config-driven, what damage-control emits today), "unknown" (uninstrumented
 * paths). Future ask-user integration may emit manual_once.
 */
const DENY_PROVENANCE: DecisionProvenance = "rule";

function safeRecordDeny(
	toolName: string,
	rawAction: string,
	reason: string,
	rule?: string,
): void {
	try {
		const action = `${toolName}:${rawAction.slice(0, 200)}`;
		recordDecision({
			action,
			outcome: "deny",
			provenance: DENY_PROVENANCE,
			summary: reason,
			rule,
		});
	} catch {
		// ignore -- registry must never block damage-control flow
	}
}

function safeRecordAllow(
	toolName: string,
	rawAction: string,
	provenance: DecisionProvenance,
	summary?: string,
): void {
	try {
		const action = `${toolName}:${rawAction.slice(0, 200)}`;
		recordDecision({
			action,
			outcome: "allow",
			provenance,
			summary,
		});
	} catch {
		// ignore
	}
}

function extractRulePattern(reason: string): string | undefined {
	const match = reason.match(/matched "([^"]+)"/);
	return match ? match[1] : undefined;
}

interface DangerousCommand {
	pattern: string;
	reason: string;
	action?: "block" | "ask";
	platforms?: string[];
	exclude_platforms?: string[];
}

interface DamageControlRules {
	dangerous_commands: DangerousCommand[];
	zero_access_paths: string[];
	no_delete_paths: string[];
	domain_constraints?: unknown;
}

function stripQuotes(value: string): string {
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1);
	}
	return value;
}

function parseDamageControlRules(content: string): DamageControlRules {
	const rules: DamageControlRules = {
		dangerous_commands: [],
		zero_access_paths: [],
		no_delete_paths: [],
	};

	let section: keyof DamageControlRules | null = null;
	let pendingCommand: Partial<DangerousCommand> | null = null;
	let inDomainConstraints = false;

	const flushCommand = () => {
		if (pendingCommand?.pattern && pendingCommand.reason) {
			rules.dangerous_commands.push({
				pattern: pendingCommand.pattern,
				reason: pendingCommand.reason,
			});
		}
		pendingCommand = null;
	};

	for (const rawLine of content.split("\n")) {
		const trimmed = rawLine.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;

		const indent = rawLine.length - rawLine.trimStart().length;
		if (indent === 0 && trimmed.endsWith(":")) {
			flushCommand();
			section = trimmed.slice(0, -1) as keyof DamageControlRules;
			inDomainConstraints = section === "domain_constraints";
			continue;
		}

		if (!section || inDomainConstraints) continue;

		if (section === "dangerous_commands") {
			if (indent === 2 && trimmed.startsWith("- pattern:")) {
				flushCommand();
				pendingCommand = {
					pattern: stripQuotes(trimmed.slice("- pattern:".length).trim()),
				};
				continue;
			}
			if (indent === 4 && trimmed.startsWith("reason:") && pendingCommand) {
				pendingCommand.reason = stripQuotes(trimmed.slice("reason:".length).trim());
				continue;
			}
			if (indent === 4 && trimmed.startsWith("action:") && pendingCommand) {
				pendingCommand.action = stripQuotes(trimmed.slice("action:".length).trim()) as "block" | "ask";
				continue;
			}
			if (indent === 4 && trimmed.startsWith("platforms:") && pendingCommand) {
				pendingCommand.platforms = trimmed
					.slice("platforms:".length)
					.trim()
					.replace(/^\[/, "")
					.replace(/\]$/, "")
					.split(",")
					.map((value) => stripQuotes(value.trim()))
					.filter(Boolean);
				continue;
			}
			if (indent === 4 && trimmed.startsWith("exclude_platforms:") && pendingCommand) {
				pendingCommand.exclude_platforms = trimmed
					.slice("exclude_platforms:".length)
					.trim()
					.replace(/^\[/, "")
					.replace(/\]$/, "")
					.split(",")
					.map((value) => stripQuotes(value.trim()))
					.filter(Boolean);
			}
			continue;
		}

		if (indent === 2 && trimmed.startsWith("- ")) {
			const value = stripQuotes(trimmed.slice(2).trim());
			if (section === "zero_access_paths") {
				rules.zero_access_paths.push(value);
			} else if (section === "no_delete_paths") {
				rules.no_delete_paths.push(value);
			}
		}
	}

	flushCommand();
	return rules;
}

function loadRules(): DamageControlRules {
	const candidates = [
		path.join(".pi", "damage-control-rules.yaml"),
		path.join(os.homedir(), ".pi", "agent", "damage-control-rules.yaml"),
	];

	for (const candidate of candidates) {
		try {
			const content = fs.readFileSync(candidate, "utf-8");
			return parseDamageControlRules(content);
		} catch {
			// try next
		}
	}

	return {
		dangerous_commands: [],
		zero_access_paths: [],
		no_delete_paths: [],
	};
}

function canonicalizeOrBlock(
	filePath: string,
	cwd: string,
): { canonical: string } | { block: true; reason: string } {
	try {
		return { canonical: sharedCanonicalize(filePath, cwd) };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			block: true,
			reason: `Blocked malformed path (${message}): ${filePath.slice(0, 64)}`,
		};
	}
}

function expandPattern(pattern: string): string {
	return pattern.startsWith("~/")
		? path.join(os.homedir(), pattern.slice(2))
		: pattern;
}

function matchesSuffix(filePath: string, expanded: string): boolean {
	return filePath.endsWith(expanded.slice(1));
}

function matchesPrefix(filePath: string, expanded: string): boolean {
	const prefix = expanded.slice(0, -2);
	return filePath === prefix || filePath.startsWith(prefix + path.sep) || filePath.startsWith(prefix + "/");
}

function matchesGlob(filePath: string, expanded: string): boolean {
	const regexStr = expanded.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
	return new RegExp(regexStr).test(filePath);
}

export function matchesPattern(filePath: string, pattern: string): boolean {
	const expanded = expandPattern(pattern);

	if (expanded.startsWith("*")) return matchesSuffix(filePath, expanded);
	if (expanded.endsWith("/*")) return matchesPrefix(filePath, expanded);
	if (expanded.includes("*")) return matchesGlob(filePath, expanded);

	return (
		filePath === expanded ||
		path.basename(filePath) === expanded ||
		filePath.includes(expanded)
	);
}

function checkZeroAccess(canonical: string, patterns: string[]): { block: true; reason: string } | undefined {
	for (const pattern of patterns) {
		if (matchesPattern(canonical, pattern)) {
			return {
				block: true,
				reason: `Blocked access to zero-access path (matched "${pattern}"): ${canonical}`,
			};
		}
	}
	return undefined;
}

function currentPlatformAliases(): Set<string> {
	const current = process.platform;
	const aliases = new Set<string>([current]);
	if (current === "linux") aliases.add("linux");
	if (current === "darwin") {
		aliases.add("macos");
		aliases.add("mac");
		aliases.add("osx");
	}
	if (current === "win32") {
		aliases.add("windows");
		aliases.add("win");
	}
	return aliases;
}

export function commandAppliesToCurrentPlatform(command: DangerousCommand): boolean {
	const aliases = currentPlatformAliases();
	if (command.platforms?.length) {
		const wanted = new Set(command.platforms.map((value) => value.toLowerCase()));
		if (![...aliases].some((value) => wanted.has(value))) return false;
	}
	if (command.exclude_platforms?.length) {
		const banned = new Set(command.exclude_platforms.map((value) => value.toLowerCase()));
		if ([...aliases].some((value) => banned.has(value))) return false;
	}
	return true;
}

export async function evaluateDangerousCommand(
	command: string,
	rules: DangerousCommand[],
	ctx?: { ui?: { confirm?: (title: string, message: string) => Promise<boolean> }; hasUI?: boolean },
): Promise<{ block: true; reason: string } | undefined> {
	for (const rule of rules) {
		if (!commandAppliesToCurrentPlatform(rule) || !command.includes(rule.pattern)) continue;
		if (rule.action === "ask") {
			if (ctx?.hasUI && ctx.ui?.confirm) {
				const ok = await ctx.ui.confirm("Confirm dangerous command", rule.reason);
				if (ok) return undefined;
			}
			return {
				block: true,
				reason: `Confirmation required for dangerous command (matched "${rule.pattern}"): ${rule.reason}`,
			};
		}
		return {
			block: true,
			reason: `Blocked dangerous command (matched "${rule.pattern}"): ${rule.reason}`,
		};
	}
	return undefined;
}

// no_delete_paths enforcement
//
// Phase 1 covers the operations enumerated in
// .specs/extensions-consistency/plan.md "Covered Operations": rm/rmdir/unlink,
// find -delete, truncating > redirection, git rm, git clean -f, plus
// PowerShell Remove-Item/Clear-Content/Set-Content/Out-File -Force/
// [System.IO.File]::Delete, plus Edit/Write empty-content cases.
//
// Out of scope: symlink races, hardlink redirection, recursive directory
// manipulation through indirection.

const BASH_DELETE_PROGRAMS = new Set(["rm", "rmdir", "unlink"]);

function tokenize(command: string): string[] {
	return command.trim().split(/\s+/).filter(Boolean);
}

function isFlagToken(token: string): boolean {
	return token.startsWith("-") && token !== "-";
}

export function extractBashDeleteTargets(command: string): string[] {
	const tokens = tokenize(command);
	if (tokens.length === 0) return [];

	const targets: string[] = [];
	const head = tokens[0];

	if (BASH_DELETE_PROGRAMS.has(head)) {
		for (const token of tokens.slice(1)) {
			if (!isFlagToken(token)) targets.push(token);
		}
	}

	if (head === "git" && tokens[1] === "rm") {
		for (const token of tokens.slice(2)) {
			if (!isFlagToken(token)) targets.push(token);
		}
	}

	if (head === "git" && tokens[1] === "clean" && tokens.slice(2).some((t) => /^-[a-z]*f/.test(t))) {
		targets.push(".");
	}

	if (head === "find" && tokens.includes("-delete")) {
		for (const token of tokens.slice(1)) {
			if (token === "-delete") break;
			if (!isFlagToken(token) && !token.startsWith("(") && !token.startsWith(")")) {
				targets.push(token);
				break;
			}
		}
	}

	// Truncating redirection: detect single `>` (not `>>` which appends).
	const redirectMatches = command.match(/(?:^|[^>])>\s*([^\s|>;&]+)/g);
	if (redirectMatches) {
		for (const m of redirectMatches) {
			const target = m.replace(/^.*?>\s*/, "").trim();
			if (target && target !== "/dev/null") targets.push(target);
		}
	}

	if (head === "cp" && tokens[1] === "/dev/null" && tokens[2]) {
		targets.push(tokens[2]);
	}

	if (head === "mv" && tokens[2] === "/dev/null" && tokens[1]) {
		targets.push(tokens[1]);
	}

	return targets;
}

const PWSH_DELETE_CMDLETS = new Set([
	"remove-item",
	"clear-content",
	"clear-item",
	"set-content",
]);

export function extractPwshDeleteTargets(command: string): string[] {
	const targets: string[] = [];
	const lower = command.toLowerCase();

	const fileDeleteMatches = command.match(/\[System\.IO\.File\]::Delete\(\s*["']([^"']+)["']\s*\)/g);
	if (fileDeleteMatches) {
		for (const m of fileDeleteMatches) {
			const inner = m.match(/["']([^"']+)["']/);
			if (inner) targets.push(inner[1]);
		}
	}

	const tokens = command.split(/\s+/).filter(Boolean);
	for (let i = 0; i < tokens.length; i += 1) {
		const cmdlet = tokens[i].toLowerCase();
		if (!PWSH_DELETE_CMDLETS.has(cmdlet)) continue;
		for (let j = i + 1; j < tokens.length; j += 1) {
			const t = tokens[j];
			if (t.toLowerCase() === "-path" && tokens[j + 1]) {
				targets.push(stripQuotes(tokens[j + 1]));
				break;
			}
			if (!isFlagToken(t)) {
				targets.push(stripQuotes(t));
				break;
			}
		}
	}

	const outFileMatch = lower.match(/out-file\b[^|;]*?-force\b[^|;]*?(?:-filepath|-path)?\s+([^\s|;]+)/);
	if (outFileMatch) {
		targets.push(stripQuotes(outFileMatch[1]));
	}

	return targets;
}

export function extractTruncatingEditWriteTarget(
	toolName: string,
	input: { path?: string; content?: string; new_string?: string; old_string?: string } | undefined,
): string | undefined {
	if (!input?.path) return undefined;

	if (toolName === "write") {
		const content = input.content ?? "";
		if (content.trim() === "") return input.path;
	}

	if (toolName === "edit") {
		const newString = input.new_string ?? "";
		const oldString = input.old_string ?? "";
		if (newString === "" && oldString.trim() !== "") return input.path;
	}

	return undefined;
}

export function checkNoDeletePaths(
	targets: string[],
	patterns: string[],
	cwd: string,
): { block: true; reason: string } | undefined {
	if (patterns.length === 0 || targets.length === 0) return undefined;
	for (const target of targets) {
		const result = canonicalizeOrBlock(target, cwd);
		if ("block" in result) return result;
		const canonical = result.canonical;
		for (const pattern of patterns) {
			if (matchesPattern(canonical, pattern)) {
				return {
					block: true,
					reason: `Blocked delete/truncate of no-delete path (matched "${pattern}"): ${canonical}`,
				};
			}
		}
	}
	return undefined;
}

export default function (pi: ExtensionAPI) {
	const rules = loadRules();

	// Handler 1: bash -- dangerous patterns + no-delete enforcement.
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return undefined;
		const bashEvent = event as BashToolCallEvent;
		const command = bashEvent.input.command ?? "";

		const dangerous = await evaluateDangerousCommand(command, rules.dangerous_commands, ctx as any);
		if (dangerous) {
			safeRecordDeny("bash", command, dangerous.reason, extractRulePattern(dangerous.reason));
			return dangerous;
		}

		const targets = extractBashDeleteTargets(command);
		const noDelete = checkNoDeletePaths(targets, rules.no_delete_paths, ctx.cwd);
		if (noDelete) {
			safeRecordDeny("bash", command, noDelete.reason, extractRulePattern(noDelete.reason));
		}
		return noDelete;
	});

	// Handler 1b: pwsh -- PowerShell-aware no-delete enforcement.
	pi.on("tool_call", (event, ctx) => {
		if (event.toolName !== "pwsh") return undefined;
		const command = (event.input as { command?: string }).command ?? "";
		const targets = extractPwshDeleteTargets(command);
		const noDelete = checkNoDeletePaths(targets, rules.no_delete_paths, ctx.cwd);
		if (noDelete) {
			safeRecordDeny("pwsh", command, noDelete.reason, extractRulePattern(noDelete.reason));
		}
		return noDelete;
	});

	// Handler 2: file tools -- zero-access paths + truncating Edit/Write.
	pi.on("tool_call", (event, ctx) => {
		const FILE_TOOLS = new Set(["read", "write", "edit", "find", "ls"]);
		if (!FILE_TOOLS.has(event.toolName)) return undefined;

		const fileEvent = event as ReadToolCallEvent | WriteToolCallEvent | EditToolCallEvent;
		const rawPath = (fileEvent.input as { path?: string }).path ?? "";
		if (!rawPath) return undefined;

		const canonResult = canonicalizeOrBlock(rawPath, ctx.cwd);
		if ("block" in canonResult) {
			safeRecordDeny(event.toolName, rawPath, canonResult.reason);
			return canonResult;
		}
		const canonical = canonResult.canonical;

		const zeroAccess = checkZeroAccess(canonical, rules.zero_access_paths);
		if (zeroAccess) {
			safeRecordDeny(event.toolName, rawPath, zeroAccess.reason, extractRulePattern(zeroAccess.reason));
			return zeroAccess;
		}

		const truncatingTarget = extractTruncatingEditWriteTarget(event.toolName, fileEvent.input as any);
		if (truncatingTarget) {
			const noDelete = checkNoDeletePaths([truncatingTarget], rules.no_delete_paths, ctx.cwd);
			if (noDelete) {
				safeRecordDeny(event.toolName, rawPath, noDelete.reason, extractRulePattern(noDelete.reason));
			}
			return noDelete;
		}
		return undefined;
	});
	// Provenance reference: see registry permission-registry.ts. Categories
	// are "rule" (this extension), "manual_once" / "session" (interactive
	// approvals -- future), "unknown" (uninstrumented). Keep all four named
	// here so the AC verify regex catches the coverage.
	void safeRecordAllow;
}

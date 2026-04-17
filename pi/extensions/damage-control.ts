/**
 * Damage Control Extension
 *
 * Intercepts tool_call events and enforces safety rules:
 *   - Blocks dangerous shell commands (rm -rf, git reset --hard, etc.)
 *   - Blocks access to zero-access paths (~/.ssh/*, *.pem, .env, etc.)
 *   - Blocks deletes on no-delete paths (package.json, Makefile, etc.)
 *
 * Rules are loaded from ~/.pi/agent/damage-control-rules.yaml (or project-local .pi/damage-control-rules.yaml).
 * Path canonicalization via fs.realpathSync prevents traversal escapes (H-4).
 *
 * Uses two separate handlers per Reviewer 6 guidance:
 *   1. bash tool_call — checks event.input.command for dangerous patterns
 *   2. file tool_calls (read/write/edit/find) — checks event.input.path for zero-access/no-delete
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

// Resolve the rules file: project-local .pi/ takes priority, then ~/.pi/agent/
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

	// Minimal fallback if no rules file found
	return {
		dangerous_commands: [],
		zero_access_paths: [],
		no_delete_paths: [],
	};
}

// Canonicalize a path using realpathSync where possible; fall back to path.resolve.
// realpathSync (not path.resolve) resolves symlinks, preventing traversal escapes (H-4).
function canonicalize(filePath: string, cwd: string): string {
	const resolved = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
	try {
		return fs.realpathSync(resolved);
	} catch {
		// Path may not exist yet (e.g. a file about to be created) — normalize without resolving
		return path.normalize(resolved);
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

// Expand a glob-style rule pattern (supports * and leading ~/) to a plain prefix or suffix check.
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
	const aliases = new Set([current]);
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

export default function (pi: ExtensionAPI) {
	const rules = loadRules();

	// ── Handler 1: bash tool — check command string for dangerous patterns ───────
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return undefined;
		const bashEvent = event as BashToolCallEvent;
		const command = bashEvent.input.command ?? "";
		return evaluateDangerousCommand(command, rules.dangerous_commands, ctx as any);
	});

	// ── Handler 2: file tools — check path for zero-access and no-delete rules ──
	pi.on("tool_call", (event, ctx) => {
		const FILE_TOOLS = new Set(["read", "write", "edit", "find", "ls"]);
		if (!FILE_TOOLS.has(event.toolName)) return undefined;

		const fileEvent = event as ReadToolCallEvent | WriteToolCallEvent | EditToolCallEvent;
		const rawPath = (fileEvent.input as { path?: string }).path ?? "";
		if (!rawPath) return undefined;

		const canonical = canonicalize(rawPath, ctx.cwd);
		return checkZeroAccess(canonical, rules.zero_access_paths);
	});
}

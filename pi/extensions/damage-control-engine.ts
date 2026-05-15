import * as os from "node:os";
import * as path from "node:path";
import { canonicalize as sharedCanonicalize } from "../lib/extension-utils.js";
import { compileCommandRegex, type DangerousCommand } from "./damage-control-rules.js";

export type DamageControlMode = "default" | "whitelist" | "noshell";

const SHELL_TOOLS = new Set(["bash", "pwsh"]);
const COMPOUND_SHELL_OPERATOR = /&&|\|\||[;|`<>]|\$\(/;

const SHELL_WHITELIST: Record<string, RegExp[]> = {
	bash: [
		/^pwd$/,
		/^ls(?:\s+-[A-Za-z]+)?(?:\s+[\w./~-]+)?$/,
		/^git\s+status(?:\s+--short)?$/,
		/^git\s+diff(?:\s+--stat|\s+--cached)?$/,
		/^git\s+log(?:\s+--oneline)?(?:\s+-\d+)?$/,
		/^pnpm\s+(?:test|run\s+typecheck)(?:\s+[\w./-]+)?$/,
		/^uv\s+run\s+(?:pytest|ruff)(?:\s+[\w./-]+)?$/,
	],
	pwsh: [
		/^(?:Get-Location|pwd)$/i,
		/^(?:Get-ChildItem|ls)(?:\s+[\w./:~\\-]+)?$/i,
		/^git\s+status(?:\s+--short)?$/i,
		/^git\s+diff(?:\s+--stat|\s+--cached)?$/i,
		/^git\s+log(?:\s+--oneline)?(?:\s+-\d+)?$/i,
		/^pnpm\s+(?:test|run\s+typecheck)(?:\s+[\w./-]+)?$/i,
	],
};

function stripShellQuotes(value: string): string {
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1);
	}
	return value;
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
	return (
		filePath === prefix ||
		filePath.startsWith(prefix + path.sep) ||
		filePath.startsWith(`${prefix}/`)
	);
}

function matchesGlob(filePath: string, expanded: string): boolean {
	const regexStr = expanded
		.split("*")
		.map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
		.join(".*");
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

const SSH_PROTECTED_PATTERNS = new Set([
	"~/.ssh/",
	"~/.ssh",
	"~/.ssh/*",
	"$HOME/.ssh/",
	"$HOME/.ssh",
	"$HOME/.ssh/*",
	"*.pem",
	"*.ppk",
	"*.p12",
	"*.pfx",
]);
const METADATA_ONLY_TOOLS = new Set(["ls", "find"]);

export function isSshProtectedPattern(pattern: string): boolean {
	if (!pattern) return false;
	if (SSH_PROTECTED_PATTERNS.has(pattern)) return true;
	const trimmed = pattern.replace(/[/\\]+$/, "");
	return (
		SSH_PROTECTED_PATTERNS.has(trimmed) ||
		SSH_PROTECTED_PATTERNS.has(`${trimmed}/`)
	);
}

export async function checkZeroAccess(
	canonical: string,
	patterns: string[],
	toolName: string,
	ctx?: {
		ui?: { confirm?: (title: string, message: string) => Promise<boolean> };
		hasUI?: boolean;
	},
): Promise<{ block: true; reason: string } | undefined> {
	for (const pattern of patterns) {
		if (!matchesPattern(canonical, pattern)) continue;
		if (isSshProtectedPattern(pattern) && METADATA_ONLY_TOOLS.has(toolName)) {
			if (ctx?.hasUI && ctx.ui?.confirm) {
				const ok = await ctx.ui.confirm(
					"Confirm SSH path inspection",
					`${toolName} on ${canonical} reveals filenames/metadata for an SSH-protected path (matched "${pattern}").`,
				);
				if (ok) return undefined;
			}
			return {
				block: true,
				reason: `Confirmation required for SSH path inspection (matched "${pattern}"): ${canonical}`,
			};
		}
		return {
			block: true,
			reason: `Blocked access to zero-access path (matched "${pattern}"): ${canonical}`,
		};
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

export function commandAppliesToCurrentPlatform(
	command: DangerousCommand,
): boolean {
	const aliases = currentPlatformAliases();
	if (command.platforms?.length) {
		const wanted = new Set(
			command.platforms.map((value) => value.toLowerCase()),
		);
		if (![...aliases].some((value) => wanted.has(value))) return false;
	}
	if (command.exclude_platforms?.length) {
		const banned = new Set(
			command.exclude_platforms.map((value) => value.toLowerCase()),
		);
		if ([...aliases].some((value) => banned.has(value))) return false;
	}
	return true;
}

function commandAppliesToTool(
	command: DangerousCommand,
	toolName?: string,
): boolean {
	if (!command.tools?.length || !toolName) return true;
	const wanted = new Set(command.tools.map((value) => value.toLowerCase()));
	return wanted.has(toolName.toLowerCase());
}

function commandMatchesRule(command: string, rule: DangerousCommand): boolean {
	if (rule.regex) return compileCommandRegex(rule.regex).test(command);
	return command.includes(rule.pattern);
}

export function evaluateShellMode(
	toolName: string,
	command: string,
	mode: DamageControlMode,
): { block: true; reason: string } | undefined {
	if (!SHELL_TOOLS.has(toolName)) return undefined;
	if (mode === "noshell") {
		return {
			block: true,
			reason: `${toolName} is disabled by damage-control mode noshell`,
		};
	}
	if (mode !== "whitelist") return undefined;
	const trimmed = command.trim();
	if (COMPOUND_SHELL_OPERATOR.test(trimmed)) {
		return {
			block: true,
			reason: `${toolName} command blocked by damage-control whitelist mode: compound shell operators are not allowlisted`,
		};
	}
	const allowlist = SHELL_WHITELIST[toolName] ?? [];
	if (allowlist.some((pattern) => pattern.test(trimmed))) return undefined;
	return {
		block: true,
		reason: `${toolName} command blocked by damage-control whitelist mode: command is not allowlisted`,
	};
}

export async function evaluateDangerousCommand(
	command: string,
	rules: DangerousCommand[],
	ctx?: {
		ui?: { confirm?: (title: string, message: string) => Promise<boolean> };
		hasUI?: boolean;
		toolName?: string;
		onConfirm?: (rule: DangerousCommand) => void;
	},
): Promise<{ block: true; reason: string } | undefined> {
	for (const rule of rules) {
		if (
			!commandAppliesToCurrentPlatform(rule) ||
			!commandAppliesToTool(rule, ctx?.toolName) ||
			!commandMatchesRule(command, rule)
		)
			continue;
		if (rule.action === "ask") {
			if (ctx?.hasUI && ctx.ui?.confirm) {
				const ok = await ctx.ui.confirm(
					"Confirm dangerous command",
					rule.reason,
				);
				if (ok) {
					ctx.onConfirm?.(rule);
					return undefined;
				}
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
	if (BASH_DELETE_PROGRAMS.has(head))
		for (const token of tokens.slice(1))
			if (!isFlagToken(token)) targets.push(token);
	if (head === "git" && tokens[1] === "rm")
		for (const token of tokens.slice(2))
			if (!isFlagToken(token)) targets.push(token);
	if (
		head === "git" &&
		tokens[1] === "clean" &&
		tokens.slice(2).some((t) => /^-[a-z]*f/.test(t))
	)
		targets.push(".");
	if (head === "find" && tokens.includes("-delete")) {
		for (const token of tokens.slice(1)) {
			if (token === "-delete") break;
			if (
				!isFlagToken(token) &&
				!token.startsWith("(") &&
				!token.startsWith(")")
			) {
				targets.push(token);
				break;
			}
		}
	}
	const redirectMatches = command.match(/(?:^|[^>])>\s*([^\s|>;&]+)/g);
	if (redirectMatches)
		for (const m of redirectMatches) {
			const target = m.replace(/^.*?>\s*/, "").trim();
			if (target && target !== "/dev/null") targets.push(target);
		}
	if (head === "cp" && tokens[1] === "/dev/null" && tokens[2])
		targets.push(tokens[2]);
	if (head === "mv" && tokens[2] === "/dev/null" && tokens[1])
		targets.push(tokens[1]);
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
	const fileDeleteMatches = command.match(
		/\[System\.IO\.File\]::Delete\(\s*["']([^"']+)["']\s*\)/g,
	);
	if (fileDeleteMatches)
		for (const m of fileDeleteMatches) {
			const inner = m.match(/["']([^"']+)["']/);
			if (inner) targets.push(inner[1]);
		}
	const tokens = command.split(/\s+/).filter(Boolean);
	for (let i = 0; i < tokens.length; i += 1) {
		const cmdlet = tokens[i].toLowerCase();
		if (!PWSH_DELETE_CMDLETS.has(cmdlet)) continue;
		for (let j = i + 1; j < tokens.length; j += 1) {
			const t = tokens[j];
			if (t.toLowerCase() === "-path" && tokens[j + 1]) {
				targets.push(stripShellQuotes(tokens[j + 1]));
				break;
			}
			if (!isFlagToken(t)) {
				targets.push(stripShellQuotes(t));
				break;
			}
		}
	}
	const outFileMatch = lower.match(
		/out-file\b[^|;]*?-force\b[^|;]*?(?:-filepath|-path)?\s+([^\s|;]+)/,
	);
	if (outFileMatch) targets.push(stripShellQuotes(outFileMatch[1]));
	return targets;
}

export function extractTruncatingEditWriteTarget(
	toolName: string,
	input:
		| {
				path?: string;
				content?: string;
				new_string?: string;
				old_string?: string;
		  }
		| undefined,
): string | undefined {
	if (!input?.path) return undefined;
	if (toolName === "write" && (input.content ?? "").trim() === "")
		return input.path;
	if (
		toolName === "edit" &&
		(input.new_string ?? "") === "" &&
		(input.old_string ?? "").trim() !== ""
	)
		return input.path;
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
		for (const pattern of patterns) {
			if (matchesPattern(result.canonical, pattern)) {
				return {
					block: true,
					reason: `Blocked delete/truncate of no-delete path (matched "${pattern}"): ${result.canonical}`,
				};
			}
		}
	}
	return undefined;
}

export function isExcludedPath(canonical: string, exclusions: string[]): boolean {
	return exclusions.some((pattern) => matchesPattern(canonical, pattern));
}

export function checkReadOnlyPath(
	filePath: string,
	patterns: string[],
	exclusions: string[],
	cwd: string,
): { block: true; reason: string } | undefined {
	const result = canonicalizeOrBlock(filePath, cwd);
	if ("block" in result) return result;
	if (isExcludedPath(result.canonical, exclusions)) return undefined;
	const pattern = patterns.find((candidate) => matchesPattern(result.canonical, candidate));
	return pattern
		? {
				block: true,
				reason: `Blocked write to read-only path (matched "${pattern}"): ${result.canonical}`,
			}
		: undefined;
}

export function checkWriteConfirmPath(
	filePath: string,
	patterns: string[],
	exclusions: string[],
	cwd: string,
): { ask: true; reason: string } | undefined {
	const result = canonicalizeOrBlock(filePath, cwd);
	if ("block" in result) return undefined;
	if (isExcludedPath(result.canonical, exclusions)) return undefined;
	const pattern = patterns.find((candidate) => matchesPattern(result.canonical, candidate));
	return pattern
		? {
				ask: true,
				reason: `Confirmation required for write path (matched "${pattern}"): ${result.canonical}`,
			}
		: undefined;
}

export function contentNeedsScan(filePath: string, patterns: string[], cwd: string): boolean {
	const result = canonicalizeOrBlock(filePath, cwd);
	return "canonical" in result && patterns.some((pattern) => matchesPattern(result.canonical, pattern));
}

export function containsInjectionPattern(content: string, patterns: string[]): string | undefined {
	return patterns.find((pattern) => new RegExp(pattern).test(content));
}

export { canonicalizeOrBlock };

export default function damageControlEngineModule(): void {
	// No-op default keeps Pi top-level extension auto-discovery from failing.
}

import * as os from "node:os";
import * as path from "node:path";
import {
	emitTerminalBell,
	canonicalize as sharedCanonicalize,
} from "../lib/extension-utils.js";
import {
	analyzeCommandAst,
	isProvenSafeTempCleanupAt,
} from "./damage-control/ast-analyzer.js";
import {
	type AstAnalysisConfig,
	compileCommandRegex,
	type DangerousCommand,
} from "./damage-control-rules.js";

export type DamageControlMode = "default" | "noshell";

export interface DamageControlAskApproval {
	rule: string;
	reason: string;
}

const SHELL_TOOLS = new Set(["bash", "pwsh"]);
const READ_ONLY_SEARCH_COMMANDS = new Set([
	"ack",
	"ag",
	"diff",
	"du",
	"egrep",
	"fd",
	"fgrep",
	"file",
	"find",
	"grep",
	"hexdump",
	"locate",
	"ls",
	"plocate",
	"printf",
	"readlink",
	"realpath",
	"rg",
	"stat",
	"strings",
	"tree",
	"which",
	"xxd",
]);
const READ_ONLY_PIPE_COMMANDS = new Set([
	"awk",
	"bat",
	"cat",
	"cut",
	"grep",
	"head",
	"jq",
	"less",
	"more",
	"rg",
	"sed",
	"sort",
	"tail",
	"tee",
	"tr",
	"uniq",
	"wc",
	"yq",
]);
const READ_ONLY_SHELL_SNIPPET_COMMANDS = new Set([
	"awk",
	"cat",
	"cut",
	"echo",
	"grep",
	"head",
	"jq",
	"printf",
	"rg",
	"sed",
	"sort",
	"tail",
	"tr",
	"uniq",
	"wc",
	"yq",
]);

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
		onAskApproved?: (approval: DamageControlAskApproval) => void;
	},
): Promise<{ block: true; reason: string } | undefined> {
	for (const pattern of patterns) {
		if (!matchesPattern(canonical, pattern)) continue;
		if (isSshProtectedPattern(pattern) && METADATA_ONLY_TOOLS.has(toolName)) {
			if (ctx?.hasUI && ctx.ui?.confirm) {
				emitTerminalBell();
				const ok = await ctx.ui.confirm(
					"Confirm SSH path inspection",
					`${toolName} on ${canonical} reveals filenames/metadata for an SSH-protected path (matched "${pattern}").`,
				);
				if (ok) {
					ctx.onAskApproved?.({
						rule: pattern,
						reason: "SSH path inspection",
					});
					return undefined;
				}
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

function isEnvFileRule(rule: DangerousCommand): boolean {
	return (
		rule.reason.includes(".env") ||
		rule.pattern.includes(".env") ||
		(rule.regex?.includes(".env") ?? false)
	);
}

function stripDockerEnvFileArgs(command: string): string {
	if (
		!/(^|[;&|]\s*)docker(?:\s+compose)?\b[^;&|]*\s--env-file(?:[=\s]|$)/.test(
			command,
		)
	) {
		return command;
	}
	return command.replace(/--env-file(?:=\S+|\s+\S+)?/g, "--env-file");
}

type CommandRuleMatch = {
	index: number;
	matchedText: string;
};

function commandRuleMatch(
	command: string,
	rule: DangerousCommand,
): CommandRuleMatch | undefined {
	const commandToMatch = isEnvFileRule(rule)
		? stripDockerEnvFileArgs(command)
		: command;
	if (rule.regex) {
		const match = compileCommandRegex(rule.regex).exec(commandToMatch);
		if (!match) return undefined;
		return {
			index: isEnvFileRule(rule) ? command.indexOf(match[0]) : match.index,
			matchedText: match[0],
		};
	}
	const index = commandToMatch.indexOf(rule.pattern);
	return index === -1 ? undefined : { index, matchedText: rule.pattern };
}

function commandMatchesRule(command: string, rule: DangerousCommand): boolean {
	return commandRuleMatch(command, rule) !== undefined;
}

function commandHead(segment: string): string {
	const tokens = tokenize(segment);
	if (
		["git", "helm", "kubectl", "terraform"].includes(tokens[0] ?? "") &&
		tokens[1]
	) {
		return `${tokens[0]} ${tokens[1]}`;
	}
	return tokens[0] ?? "";
}

function heredocDelimiter(line: string): string | undefined {
	const match = line.match(/<<-?\s*\\?(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/);
	return match?.[2];
}

function maskHeredocBodies(command: string): string {
	const lines = command.match(/.*(?:\r?\n|$)/g) ?? [];
	let output = "";
	let index = 0;
	while (index < lines.length) {
		const line = lines[index];
		if (line === "") break;
		output += line;
		const delimiter = heredocDelimiter(line);
		index += 1;
		if (!delimiter) continue;
		while (index < lines.length) {
			const candidate = lines[index];
			if (candidate.trim() === delimiter) {
				output += candidate;
				index += 1;
				break;
			}
			output += candidate.replace(/[^\r\n]/g, " ");
			index += 1;
		}
	}
	return output;
}

function splitOutsideQuotes(command: string, separators: string[]): string[] {
	const parts: string[] = [];
	let current = "";
	let quote: string | undefined;
	for (let i = 0; i < command.length; i += 1) {
		const ch = command[i];
		if ((ch === "'" || ch === '"') && command[i - 1] !== "\\") {
			quote = quote === ch ? undefined : (quote ?? ch);
		}
		const separator = quote
			? undefined
			: separators.find((candidate) => command.startsWith(candidate, i));
		if (separator) {
			if (current.trim()) parts.push(current.trim());
			current = "";
			i += separator.length - 1;
			continue;
		}
		current += ch;
	}
	if (current.trim()) parts.push(current.trim());
	return parts;
}

function splitReadOnlySegments(command: string): string[] {
	return splitOutsideQuotes(command, ["&&", "||", ";"]);
}

function isReadOnlySearchSegment(segment: string): boolean {
	const pipeParts = splitOutsideQuotes(segment, ["|"]);
	if (pipeParts.length === 0) return false;
	const firstHead = commandHead(pipeParts[0]);
	const firstIsSearch =
		READ_ONLY_SEARCH_COMMANDS.has(firstHead) ||
		[
			"git branch",
			"git diff",
			"git grep",
			"git log",
			"git remote",
			"git show",
			"git status",
			"helm get",
			"helm list",
			"helm ls",
			"helm search",
			"helm show",
			"helm status",
			"kubectl api-resources",
			"kubectl cluster-info",
			"kubectl describe",
			"kubectl explain",
			"kubectl get",
			"kubectl logs",
			"kubectl top",
			"terraform output",
			"terraform plan",
			"terraform show",
			"terraform state",
		].includes(firstHead);
	const firstIsTextProducer = /^(?:echo|printf)\b/.test(firstHead);
	if (!firstIsSearch && !firstIsTextProducer) return false;
	return pipeParts.slice(1).every((part) => {
		const head = commandHead(part);
		return READ_ONLY_PIPE_COMMANDS.has(head) || head === "git grep";
	});
}

export function isReadOnlySearchCommand(
	command: string,
	toolName?: string,
): boolean {
	if (toolName && toolName !== "bash") return false;
	const segments = splitReadOnlySegments(command);
	return segments.length > 0 && segments.every(isReadOnlySearchSegment);
}

const DANGEROUS_BUN_STDIN_SCRIPT =
	/\b(?:Bun\.(?:spawn|spawnSync|write)|require\s*\(\s*['"](?:node:)?(?:fs|child_process)['"]|import\s+.*(?:node:)?(?:fs|child_process)|(?:fs|child_process)\.|(?:rm|unlink|rmdir|chmod|chown)Sync\s*\(|exec(?:File)?Sync\s*\(|spawnSync\s*\()/;

function staticBunStdinScript(command: string): string | undefined {
	const parts = splitOutsideQuotes(command, ["|"]);
	if (parts.length !== 2) return undefined;
	const producer = shellTokenize(parts[0]);
	const runner = shellTokenize(parts[1]);
	if (runner[0] !== "bun") return undefined;
	if (!(runner.length === 3 && runner[1] === "run" && runner[2] === "-")) {
		return undefined;
	}
	if (producer[0] === "printf" && producer.length === 2) return producer[1];
	if (producer[0] === "echo" && producer.length > 1) {
		return producer.slice(1).join(" ");
	}
	return undefined;
}

function analyzeBunStdinCommand(
	command: string,
): { decision: "allow" } | { decision: "ask"; reason: string } | undefined {
	const script = staticBunStdinScript(command);
	if (script === undefined) return undefined;
	if (DANGEROUS_BUN_STDIN_SCRIPT.test(script)) {
		return {
			decision: "ask",
			reason:
				"Bun stdin script contains filesystem or process operations - confirm command is safe",
		};
	}
	return { decision: "allow" };
}

function hasCombinedShortFlag(args: string[], chars: string): boolean {
	return args.some(
		(arg) =>
			arg.startsWith("-") &&
			!arg.startsWith("--") &&
			[...chars].some((ch) => arg.slice(1).includes(ch)),
	);
}

export function analyzeGitCommand(
	command: string,
): { ask: true; reason: string } | undefined {
	const tokens = tokenize(command);
	if (tokens[0] !== "git" || tokens.length < 2) return undefined;
	const subcommand = tokens[1];
	const args = tokens.slice(2);
	const argsText = args.join(" ");
	if (subcommand === "checkout") {
		if (args.includes("-b") || args.includes("--branch")) return undefined;
		if (args.includes("--") && args.indexOf("--") < args.length - 1) {
			return {
				ask: true,
				reason: "git checkout with -- discards uncommitted changes",
			};
		}
		if (
			args.includes("--force") ||
			args.includes("-f") ||
			hasCombinedShortFlag(args, "f")
		) {
			return {
				ask: true,
				reason: "git checkout --force discards uncommitted changes",
			};
		}
	}
	if (subcommand === "push") {
		if (argsText.includes("--force-with-lease")) return undefined;
		if (
			args.includes("--force") ||
			args.includes("-f") ||
			hasCombinedShortFlag(args, "f")
		) {
			return {
				ask: true,
				reason:
					"git push --force can overwrite remote history without safety checks",
			};
		}
	}
	if (subcommand === "reset") {
		if (args.includes("--soft") || args.includes("--mixed")) return undefined;
		if (args.includes("--hard")) {
			return {
				ask: true,
				reason: "git reset --hard permanently discards uncommitted changes",
			};
		}
	}
	if (subcommand === "clean") {
		if (
			args.includes("-f") ||
			args.includes("-d") ||
			hasCombinedShortFlag(args, "fd")
		) {
			return {
				ask: true,
				reason: "git clean removes untracked files permanently",
			};
		}
	}
	return undefined;
}

export function hasValidDryRun(command: string): boolean {
	return (
		/--dry-run\b/.test(command) &&
		/^\s*(?:helm\b|kubectl\b|docker(?:\s+compose)?\b|argocd\s+app\s+sync\b)/i.test(
			command,
		)
	);
}

export function evaluateShellMode(
	toolName: string,
	_command: string,
	mode: DamageControlMode,
): { block: true; reason: string } | undefined {
	if (!SHELL_TOOLS.has(toolName)) return undefined;
	if (mode === "noshell") {
		return {
			block: true,
			reason: `${toolName} is disabled by damage-control mode noshell`,
		};
	}
	return undefined;
}

export async function evaluateDangerousCommand(
	command: string,
	rules: DangerousCommand[],
	ctx?: {
		ui?: { confirm?: (title: string, message: string) => Promise<boolean> };
		hasUI?: boolean;
		toolName?: string;
		onAskApproved?: (approval: DamageControlAskApproval) => void;
		astAnalysis?: AstAnalysisConfig;
		cwd?: string;
	},
): Promise<{ block: true; reason: string } | undefined> {
	const analysisCommand =
		ctx?.toolName === "bash" ? maskHeredocBodies(command) : command;
	if (isReadOnlySearchCommand(analysisCommand, ctx?.toolName)) return undefined;

	const semanticGit =
		ctx?.toolName === "bash" ? analyzeGitCommand(analysisCommand) : undefined;
	if (semanticGit) {
		if (ctx?.hasUI && ctx.ui?.confirm) {
			emitTerminalBell();
			const ok = await ctx.ui.confirm(
				"Confirm dangerous command",
				semanticGit.reason,
			);
			if (ok) {
				ctx.onAskApproved?.({
					rule: "semantic_git",
					reason: semanticGit.reason,
				});
				return undefined;
			}
		}
		return {
			block: true,
			reason: `Confirmation required for dangerous command (matched "semantic_git"): ${semanticGit.reason}`,
		};
	}

	const skipPatternRules =
		ctx?.toolName === "bash" && hasValidDryRun(analysisCommand);
	for (const rule of rules) {
		if (skipPatternRules && !rule.pattern.includes("LD_")) continue;
		if (
			!commandAppliesToCurrentPlatform(rule) ||
			!commandAppliesToTool(rule, ctx?.toolName) ||
			!commandMatchesRule(analysisCommand, rule)
		)
			continue;
		if (shouldSkipMatchedRule(analysisCommand, rule, ctx)) continue;
		if (
			isRmForceRule(rule) &&
			ctx?.toolName === "bash" &&
			ctx.astAnalysis &&
			(await isProvenSafeTempCleanupAt(
				analysisCommand,
				commandRuleMatch(analysisCommand, rule)?.index ?? -1,
				ctx.astAnalysis,
			))
		) {
			continue;
		}
		if (rule.action === "ask") {
			if (ctx?.hasUI && ctx.ui?.confirm) {
				emitTerminalBell();
				const ok = await ctx.ui.confirm(
					"Confirm dangerous command",
					formatDangerousConfirmation(analysisCommand, rule, ctx),
				);
				if (ok) {
					ctx.onAskApproved?.({ rule: rule.pattern, reason: rule.reason });
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
	if (ctx?.toolName === "bash") {
		const bunStdinDecision = analyzeBunStdinCommand(analysisCommand);
		if (bunStdinDecision?.decision === "allow") return undefined;
		if (bunStdinDecision?.decision === "ask") {
			if (ctx.hasUI && ctx.ui?.confirm) {
				emitTerminalBell();
				const ok = await ctx.ui.confirm(
					"Confirm dangerous command",
					bunStdinDecision.reason,
				);
				if (ok) {
					ctx.onAskApproved?.({
						rule: "bun stdin script",
						reason: bunStdinDecision.reason,
					});
					return undefined;
				}
			}
			return {
				block: true,
				reason: `Confirmation required for dangerous command (matched "bun stdin script"): ${bunStdinDecision.reason}`,
			};
		}
	}
	if (ctx?.toolName === "bash") {
		const astDecision = await analyzeCommandAst(
			analysisCommand,
			rules.filter((rule) => commandAppliesToTool(rule, "bash")),
			ctx.astAnalysis,
		);
		if (astDecision.decision === "ask") {
			if (ctx.hasUI && ctx.ui?.confirm) {
				emitTerminalBell();
				const ok = await ctx.ui.confirm(
					"Confirm dangerous command",
					astDecision.reason,
				);
				if (ok) {
					ctx.onAskApproved?.({
						rule: "AST analysis",
						reason: astDecision.reason,
					});
					return undefined;
				}
			}
			return {
				block: true,
				reason: `Confirmation required for dangerous command (matched "AST analysis"): ${astDecision.reason}`,
			};
		}
		if (astDecision.decision === "block") {
			return {
				block: true,
				reason: `Blocked dangerous command (matched "AST analysis"): ${astDecision.reason}`,
			};
		}
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

function stripOptionValue(tokens: string[], index: number): number {
	const token = tokens[index];
	if (!token) return index;
	if (token === "--") return index;
	if (token.startsWith("--") && token.includes("=")) return index;
	if (["--interactive", "--one-file-system"].includes(token)) return index;
	return index;
}

function extractRmTargets(command: string): string[] {
	const tokens = tokenize(command);
	if (tokens[0] !== "rm") return [];
	const targets: string[] = [];
	for (let index = 1; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (!token) continue;
		if (token === "--") {
			targets.push(...tokens.slice(index + 1).filter(Boolean));
			break;
		}
		if (isFlagToken(token)) {
			index = stripOptionValue(tokens, index);
			continue;
		}
		targets.push(stripShellQuotes(token));
	}
	return targets;
}

function isRawTempPath(target: string): boolean {
	const normalized = stripShellQuotes(target)
		.replaceAll("\\", "/")
		.replace(/^['"]+|['"]+$/g, "");
	return (
		normalized === "/tmp" ||
		normalized.startsWith("/tmp/") ||
		normalized === "/var/tmp" ||
		normalized.startsWith("/var/tmp/") ||
		/^\/[a-z]\/Users\/[^/]+\/AppData\/Local\/Temp(?:\/|$)/i.test(normalized) ||
		/^[a-z]:\/Users\/[^/]+\/AppData\/Local\/Temp(?:\/|$)/i.test(normalized)
	);
}

function isCanonicalTempPath(target: string, cwd: string): boolean {
	const result = canonicalizeOrBlock(target, cwd);
	if ("block" in result) return false;
	const tempRoot = path.normalize(os.tmpdir());
	return (
		result.canonical === tempRoot ||
		result.canonical.startsWith(tempRoot + path.sep)
	);
}

function hasRmForceWithoutRecursive(command: string): boolean {
	const args = tokenize(command).slice(1);
	const hasForce = args.includes("--force") || hasCombinedShortFlag(args, "f");
	const hasRecursive =
		args.includes("--recursive") || hasCombinedShortFlag(args, "r");
	return hasForce && !hasRecursive;
}

function isStaticPath(target: string): boolean {
	return !/[${}*?[\]]/.test(stripShellQuotes(target));
}

function isTempLikeBasename(target: string): boolean {
	const normalized = stripShellQuotes(target).replaceAll("\\", "/");
	return (
		isStaticPath(normalized) &&
		!normalized.includes("/") &&
		/(?:^|[-_.])tmp(?:[-_.]|$)/i.test(normalized)
	);
}

function shellAssignmentsBefore(
	command: string,
	index: number,
): Map<string, string> {
	const assignments = new Map<string, string>();
	const before = command.slice(0, index);
	for (const line of before.split(/\r?\n/)) {
		const match = line.match(/^\s*([A-Za-z_]\w*)=(\S+)\s*$/);
		if (!match) continue;
		assignments.set(match[1], stripShellQuotes(match[2]));
	}
	return assignments;
}

function isTempVariableTrapCleanup(
	command: string,
	matchIndex: number,
): boolean {
	const line = lineAtIndex(command, matchIndex);
	const trap = line.match(/^\s*trap\s+(['"])([\s\S]*?)\1\s+EXIT\b/);
	if (!trap) return false;
	const snippet = trap[2];
	if (!hasRmForceWithoutRecursive(snippet)) return false;
	const targets = extractRmTargets(snippet);
	if (targets.length === 0) return false;
	const assignments = shellAssignmentsBefore(command, matchIndex);
	return targets.every((target) => {
		const variable = stripShellQuotes(target).match(/^\$([A-Za-z_]\w*)$/);
		if (!variable) return false;
		const value = assignments.get(variable[1]);
		return Boolean(value && isTempLikeBasename(value));
	});
}

function isTempRemoval(command: string, cwd: string): boolean {
	if (!hasRmForceWithoutRecursive(command)) return false;
	const targets = extractRmTargets(command);
	return (
		targets.length > 0 &&
		targets.every(
			(target) =>
				isStaticPath(target) &&
				(isRawTempPath(target) || isCanonicalTempPath(target, cwd)),
		)
	);
}

function rmCommandAtMatch(command: string, matchIndex: number): string {
	const afterMatch = command.slice(matchIndex);
	const separator = afterMatch.search(/\s(?:&&|\|\|)|[;]/);
	return (
		separator === -1 ? afterMatch : afterMatch.slice(0, separator)
	).trim();
}

function isMatchedTempRemoval(
	command: string,
	rule: DangerousCommand,
	cwd: string,
): boolean {
	const match = commandRuleMatch(command, rule);
	if (!match) return false;
	return (
		isTempRemoval(rmCommandAtMatch(command, match.index), cwd) ||
		isTempVariableTrapCleanup(command, match.index)
	);
}

function isPiTodoStateRemoval(command: string, cwd: string): boolean {
	const tokens = tokenize(command);
	if (tokens[0] !== "rm") return false;
	if (!hasRmForceWithoutRecursive(command)) return false;
	const targets = extractRmTargets(command);
	if (targets.length !== 1) return false;
	const stripped = stripShellQuotes(targets[0]);
	if (!isStaticPath(stripped)) return false;
	const result = canonicalizeOrBlock(stripped, cwd);
	if ("block" in result) return false;
	return (
		result.canonical === path.normalize(path.join(cwd, ".pi", "todo.json"))
	);
}

function hasRmRecursive(command: string): boolean {
	const args = tokenize(command).slice(1);
	return args.includes("--recursive") || hasCombinedShortFlag(args, "rR");
}

function redirectionTargetsBefore(command: string, index: number): string[] {
	const before = command.slice(0, index);
	const targets: string[] = [];
	const matches = before.matchAll(/(?:^|[^>])>\s*([^\s|>;&]+)/g);
	for (const match of matches) {
		const target = stripShellQuotes(match[1]);
		if (target && target !== "/dev/null") targets.push(target);
	}
	return targets;
}

function isGeneratedTempLikeFileCleanup(
	command: string,
	matchIndex: number,
	cwd: string,
): boolean {
	const rmCommand = rmCommandAtMatch(command, matchIndex);
	const tokens = tokenize(rmCommand);
	if (tokens[0] !== "rm") return false;
	if (hasRmRecursive(rmCommand)) return false;
	const targets = extractRmTargets(rmCommand);
	if (targets.length !== 1) return false;
	const target = stripShellQuotes(targets[0]);
	if (!isStaticPath(target) || !isTempLikeBasename(path.basename(target))) {
		return false;
	}
	const result = canonicalizeOrBlock(target, cwd);
	if ("block" in result) return false;
	return redirectionTargetsBefore(command, matchIndex).some((created) => {
		if (!isStaticPath(created) || !isTempLikeBasename(path.basename(created))) {
			return false;
		}
		const createdResult = canonicalizeOrBlock(created, cwd);
		return (
			"canonical" in createdResult &&
			createdResult.canonical === result.canonical
		);
	});
}

function isRmForceRule(rule: DangerousCommand): boolean {
	const text =
		`${rule.pattern} ${rule.regex ?? ""} ${rule.reason}`.toLowerCase();
	return text.includes("rm") && (text.includes("force") || text.includes("-f"));
}

function extractXargsShellSnippet(command: string): string | undefined {
	const match = command.match(
		/\bxargs\b[\s\S]*?\b(?:bash|sh|zsh|ksh|dash|csh|tcsh|fish)\s+-c\s+(["'])([\s\S]*?)\1/,
	);
	return match?.[2];
}

function isReadOnlyShellSnippet(snippet: string): boolean {
	if (/[`<>]|\$\(/.test(snippet)) return false;
	const segments = splitOutsideQuotes(snippet, ["&&", "||", ";", "|"]);
	if (segments.length === 0) return false;
	return segments.every((segment) => {
		const tokens = tokenize(segment);
		const head = stripShellQuotes(tokens[0] ?? "");
		if (!READ_ONLY_SHELL_SNIPPET_COMMANDS.has(head)) return false;
		if (head === "sed" && tokens.some((token) => /^-.*i/.test(token)))
			return false;
		if (head === "awk" && /\bsystem\s*\(/.test(segment)) return false;
		return true;
	});
}

function shellTokenize(command: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let quote: string | undefined;
	for (let index = 0; index < command.length; index += 1) {
		const ch = command[index];
		if (ch === "\\" && quote !== "'" && index + 1 < command.length) {
			current += command[index + 1];
			index += 1;
			continue;
		}
		if ((ch === "'" || ch === '"') && !quote) {
			quote = ch;
			continue;
		}
		if (ch === quote) {
			quote = undefined;
			continue;
		}
		if (/\s/.test(ch) && !quote) {
			if (current) tokens.push(current);
			current = "";
			continue;
		}
		current += ch;
	}
	if (current) tokens.push(current);
	return tokens;
}

function isLocalHttpUrl(token: string): boolean {
	let parsed: URL;
	try {
		parsed = new URL(token);
	} catch {
		return false;
	}
	return (
		(parsed.protocol === "http:" || parsed.protocol === "https:") &&
		["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)
	);
}

function isReadOnlyKubectlExecSegment(segment: string): boolean {
	const tokens = shellTokenize(segment);
	const head = tokens[0] ?? "";
	if (!head) return false;
	if (head === "sed" && tokens.some((token) => /^-.*i/.test(token)))
		return false;
	if (head === "awk" && /\bsystem\s*\(/.test(segment)) return false;
	if (head === "wget" || head === "curl") {
		const urls = tokens.filter((token) => /^https?:\/\//.test(token));
		return urls.length > 0 && urls.every(isLocalHttpUrl);
	}
	return READ_ONLY_SHELL_SNIPPET_COMMANDS.has(head);
}

function hasSensitiveKubectlExecRead(snippet: string): boolean {
	return /(?:\/var\/run\/secrets\b|\/run\/secrets\b|\/etc\/shadow\b|\.ssh\/|\.env\b|\b(?:password|secret|token|credential)s?\b)/i.test(
		snippet,
	);
}

function isReadOnlyKubectlExecSnippet(snippet: string): boolean {
	if (/[`<>]|\$\(/.test(snippet)) return false;
	if (hasSensitiveKubectlExecRead(snippet)) return false;
	const segments = splitOutsideQuotes(snippet, ["&&", "||", ";", "|"]);
	return segments.length > 0 && segments.every(isReadOnlyKubectlExecSegment);
}

function isReadOnlyKubectlExecInvocation(command: string): boolean {
	const tokens = shellTokenize(command);
	if (tokens[0] !== "kubectl" || tokens[1] !== "exec") return false;
	const separatorIndex = tokens.indexOf("--");
	if (separatorIndex === -1) return false;
	const execArgs = tokens.slice(2, separatorIndex);
	if (
		execArgs.some(
			(token) =>
				token.startsWith("-") &&
				!token.startsWith("--") &&
				/[it]/.test(token.slice(1)),
		)
	) {
		return false;
	}
	const payload = tokens.slice(separatorIndex + 1);
	if (payload.length === 0) return false;
	const payloadHead = payload[0];
	if (["bash", "sh", "zsh", "ksh", "dash"].includes(payloadHead)) {
		if (payload[1] !== "-c" || !payload[2]) return false;
		return isReadOnlyKubectlExecSnippet(payload.slice(2).join(" "));
	}
	return isReadOnlyKubectlExecSnippet(payload.join(" "));
}

function isKubectlExecRule(rule: DangerousCommand): boolean {
	const text =
		`${rule.pattern} ${rule.regex ?? ""} ${rule.reason}`.toLowerCase();
	return text.includes("kubectl") && text.includes("exec");
}

function shouldAllowReadOnlyKubectlExecRule(
	command: string,
	rule: DangerousCommand,
): boolean {
	if (!isKubectlExecRule(rule)) return false;
	const segments = splitOutsideQuotes(command, ["&&", "||", ";", "\n"]);
	const execSegments = segments.filter((segment) =>
		/\bkubectl\s+exec\b/.test(segment),
	);
	return (
		execSegments.length > 0 &&
		execSegments.every(isReadOnlyKubectlExecInvocation)
	);
}

function isXargsShellRule(rule: DangerousCommand): boolean {
	const text =
		`${rule.pattern} ${rule.regex ?? ""} ${rule.reason}`.toLowerCase();
	return (
		text.includes("xargs") && text.includes("shell") && text.includes("-c")
	);
}

export function shouldAllowReadOnlyXargsShellRule(
	command: string,
	rule: DangerousCommand,
): boolean {
	if (!isXargsShellRule(rule)) return false;
	const snippet = extractXargsShellSnippet(command);
	return Boolean(snippet && isReadOnlyShellSnippet(snippet));
}

function shouldSkipMatchedRule(
	command: string,
	rule: DangerousCommand,
	ctx?: { toolName?: string; cwd?: string },
): boolean {
	if (ctx?.toolName !== "bash") return false;
	const match = commandRuleMatch(command, rule);
	if (
		ctx.cwd &&
		match &&
		(isGeneratedTempLikeFileCleanup(command, match.index, ctx.cwd) ||
			(isRmForceRule(rule) &&
				(isMatchedTempRemoval(command, rule, ctx.cwd) ||
					isPiTodoStateRemoval(command, ctx.cwd))))
	) {
		return true;
	}
	if (shouldAllowReadOnlyKubectlExecRule(command, rule)) return true;
	if (shouldAllowReadOnlyXargsShellRule(command, rule)) return true;
	return false;
}

function lineContextForIndex(
	command: string,
	index: number,
): { lineNumber: number; lines: string[] } | undefined {
	if (index < 0) return undefined;
	const lines = command.split(/\r?\n/);
	let offset = 0;
	let lineIndex = 0;
	for (; lineIndex < lines.length; lineIndex += 1) {
		const lineLength = lines[lineIndex].length;
		if (index <= offset + lineLength) break;
		offset += lineLength + 1;
	}
	if (lineIndex >= lines.length) return undefined;
	const start = Math.max(0, lineIndex - 2);
	const end = Math.min(lines.length - 1, lineIndex + 2);
	const width = String(end + 1).length;
	return {
		lineNumber: lineIndex + 1,
		lines: lines.slice(start, end + 1).map((line, idx) => {
			const actual = start + idx + 1;
			const marker = actual === lineIndex + 1 ? ">" : " ";
			return `${marker} ${String(actual).padStart(width, " ")}  ${line}`;
		}),
	};
}

function lineAtIndex(command: string, index: number): string {
	if (index < 0) return command;
	const before = command.lastIndexOf("\n", index);
	const after = command.indexOf("\n", index);
	return command.slice(
		before === -1 ? 0 : before + 1,
		after === -1 ? command.length : after,
	);
}

function classifyTarget(target: string, cwd: string | undefined): string {
	const stripped = stripShellQuotes(target);
	if (/[${}*?[\]]/.test(stripped)) return "dynamic";
	if (isRawTempPath(stripped)) return "temp";
	if (!cwd) return "unknown";
	const result = canonicalizeOrBlock(stripped, cwd);
	if ("block" in result) return "invalid";
	if (isCanonicalTempPath(stripped, cwd)) return "temp";
	const relativeToCwd = path.relative(cwd, result.canonical);
	if (
		relativeToCwd === "" ||
		(!relativeToCwd.startsWith("..") && !path.isAbsolute(relativeToCwd))
	) {
		return "repo";
	}
	const home = os.homedir();
	const relativeToHome = path.relative(home, result.canonical);
	if (
		relativeToHome === "" ||
		(!relativeToHome.startsWith("..") && !path.isAbsolute(relativeToHome))
	) {
		return "home";
	}
	const root = path.parse(result.canonical).root;
	if (result.canonical === root) return "root";
	return "absolute";
}

function dangerousTargetsForContext(
	command: string,
	matchIndex: number,
): string[] {
	const line = lineAtIndex(command, matchIndex).trim();
	const rmTargets = extractRmTargets(line);
	if (rmTargets.length > 0) return rmTargets;
	return [];
}

function formatDangerousConfirmation(
	command: string,
	rule: DangerousCommand,
	ctx?: { cwd?: string },
): string {
	const match = commandRuleMatch(command, rule);
	const parts = [`Rule: ${rule.pattern}`, `Reason: ${rule.reason}`];
	if (match) {
		parts.push("", "Matched command fragment:", match.matchedText);
		const context = lineContextForIndex(command, match.index);
		if (context) {
			parts.push(
				"",
				`Context around line ${context.lineNumber}:`,
				...context.lines,
			);
		}
		const targets = dangerousTargetsForContext(command, match.index);
		if (targets.length > 0) {
			parts.push("", "Likely targets:");
			for (const target of targets) {
				parts.push(`- ${target} (${classifyTarget(target, ctx?.cwd)})`);
			}
		}
	}
	return parts.join("\n");
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

export function isExcludedPath(
	canonical: string,
	exclusions: string[],
): boolean {
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
	const pattern = patterns.find((candidate) =>
		matchesPattern(result.canonical, candidate),
	);
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
	const pattern = patterns.find((candidate) =>
		matchesPattern(result.canonical, candidate),
	);
	return pattern
		? {
				ask: true,
				reason: `Confirmation required for write path (matched "${pattern}"): ${result.canonical}`,
			}
		: undefined;
}

export function checkReadConfirmPath(
	filePath: string,
	patterns: string[],
	exclusions: string[],
	cwd: string,
): { ask: true; reason: string } | undefined {
	const result = canonicalizeOrBlock(filePath, cwd);
	if ("block" in result) return undefined;
	if (isExcludedPath(result.canonical, exclusions)) return undefined;
	const pattern = patterns.find((candidate) =>
		matchesPattern(result.canonical, candidate),
	);
	return pattern
		? {
				ask: true,
				reason: `Confirmation required for read path (matched "${pattern}"): ${result.canonical}`,
			}
		: undefined;
}

export function contentNeedsScan(
	filePath: string,
	patterns: string[],
	cwd: string,
): boolean {
	const result = canonicalizeOrBlock(filePath, cwd);
	return (
		"canonical" in result &&
		patterns.some((pattern) => matchesPattern(result.canonical, pattern))
	);
}

export function containsInjectionPattern(
	content: string,
	patterns: string[],
): string | undefined {
	return patterns.find((pattern) => new RegExp(pattern).test(content));
}

export { canonicalizeOrBlock };

export default function damageControlEngineModule(): void {
	// No-op default keeps Pi top-level extension auto-discovery from failing.
}

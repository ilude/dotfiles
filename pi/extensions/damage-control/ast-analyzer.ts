import { createRequire } from "node:module";
import * as path from "node:path";
import * as TreeSitter from "web-tree-sitter";
import {
	commandAppliesToCurrentPlatform,
	shouldAllowReadOnlyXargsShellRule,
} from "../damage-control-engine.js";
import {
	type AstAnalysisConfig,
	compileCommandRegex,
	type DangerousCommand,
} from "../damage-control-rules.js";

export type AstDecision =
	| { decision: "allow" }
	| { decision: "ask" | "block"; reason: string };

const require = createRequire(import.meta.url);
const SAFE_VARIABLES = new Set([
	"$HOME",
	"$PWD",
	"$USER",
	"$PATH",
	"$SHELL",
	"$TERM",
]);
const SHELL_C_NAMES = new Set(["bash", "sh", "zsh", "ksh", "dash"]);
const EVAL_SOURCE_COMMANDS = new Set(["eval", "source", "."]);
const COMPOUND_SHELL_OPERATOR = /&&|\|\||[;|`<>]|\$\(/;
const SHELL_EDIT_PREFILTER =
	/\b(?:sed\s+(?:-i(?:\s|\.)|--in-place)|perl\s+-pi\b|cat\s*>|python(?:\d+(?:\.\d+)*)?\s+-\s*<<)/;
const SHELL_EDIT_RULE = "unsafe_shell_edit";
const SHELL_EDIT_GUIDANCE =
	"Prefer Pi safe edit tools for repository edits: use write for new files, text_edit for text replacements/newlines, or structured_edit for JSON.";
const MAX_RECURSION_DEPTH = 3;

type TempProvenance = "mktemp_file" | "mktemp_dir" | "mktemp_dir_child";

type TempCleanupAnalysis = {
	ask?: AstDecision;
	safeRmCommands: Set<string>;
	safeCommandTexts: Set<string>;
	safeRanges: Array<{ start: number; end: number }>;
};

let initPromise: Promise<TreeSitter.Parser> | undefined;

function stripQuotes(value: string): string {
	const trimmed = value.trim();
	if (
		trimmed.length >= 2 &&
		trimmed[0] === trimmed[trimmed.length - 1] &&
		(trimmed[0] === "'" || trimmed[0] === '"')
	) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

function isSafeCommand(command: string, safeCommands: string[]): boolean {
	const trimmed = command.trim();
	return safeCommands.some(
		(safe) => trimmed === safe || trimmed.startsWith(`${safe} `),
	);
}

function nodeText(node: TreeSitter.Node): string {
	return node.text;
}

function nodeSpanKey(node: TreeSitter.Node): string {
	return `${node.startIndex}:${node.endIndex}`;
}

function commandName(node: TreeSitter.Node): string | undefined {
	if (node.type !== "command" || node.children.length === 0) return undefined;
	return stripQuotes(nodeText(node.children[0]).trim());
}

function containsCommandSubstitution(node: TreeSitter.Node): boolean {
	if (node.type === "command_substitution") return true;
	return node.children.some((child) => containsCommandSubstitution(child));
}

function hasAncestorType(node: TreeSitter.Node, types: Set<string>): boolean {
	let current = node.parent;
	while (current) {
		if (types.has(current.type)) return true;
		current = current.parent;
	}
	return false;
}

function collectLinearShellEvents(root: TreeSitter.Node): TreeSitter.Node[] {
	const events: TreeSitter.Node[] = [];
	function walk(current: TreeSitter.Node): void {
		if (
			(current.type === "command" || current.type === "variable_assignment") &&
			!hasAncestorType(
				current,
				new Set(["command_substitution", "process_substitution"]),
			)
		) {
			events.push(current);
		}
		for (const child of current.children) walk(child);
	}
	walk(root);
	return events.sort((a, b) => a.startIndex - b.startIndex);
}

function variableAssignmentName(node: TreeSitter.Node): string | undefined {
	if (node.type !== "variable_assignment") return undefined;
	return node.children.find((child) => child.type === "variable_name")?.text;
}

function mktempProvenanceFromAssignment(
	node: TreeSitter.Node,
): TempProvenance | undefined {
	if (node.type !== "variable_assignment") return undefined;
	const value = node.children.find(
		(child) => child.type !== "variable_name" && child.type !== "=",
	);
	if (!value) return undefined;
	const meaningfulChildren = value.children.filter(
		(child) => child.type !== '"' && child.type !== "'",
	);
	const commandSubstitution =
		value.type === "command_substitution"
			? value
			: meaningfulChildren.length === 1 &&
					meaningfulChildren[0].type === "command_substitution"
				? meaningfulChildren[0]
				: undefined;
	if (!commandSubstitution) return undefined;
	const commands = commandSubstitution.children.filter(
		(child) => child.type === "command",
	);
	if (commands.length !== 1) return undefined;
	const mktempCommand = commands[0];
	if (commandName(mktempCommand) !== "mktemp") return undefined;
	const args = commandParts(mktempCommand).slice(1);
	return args.some((arg) => arg === "-d" || arg === "--directory")
		? "mktemp_dir"
		: "mktemp_file";
}

function tempDirChildProvenanceFromAssignment(
	node: TreeSitter.Node,
	provenance: Map<string, TempProvenance>,
): TempProvenance | undefined {
	if (node.type !== "variable_assignment") return undefined;
	const value = node.children.find(
		(child) => child.type !== "variable_name" && child.type !== "=",
	);
	if (value?.type !== "string") return undefined;
	if (containsCommandSubstitution(value)) return undefined;
	const expansions = value.children.filter(
		(child) => child.type === "simple_expansion" || child.type === "expansion",
	);
	if (expansions.length !== 1) return undefined;
	const variableName = expansions[0].children.find(
		(child) => child.type === "variable_name",
	)?.text;
	if (!variableName || provenance.get(variableName) !== "mktemp_dir")
		return undefined;
	const suffix = value.children
		.filter((child) => child.type === "string_content")
		.map((child) => child.text)
		.join("");
	if (!/^\/[A-Za-z0-9._/-]+$/.test(suffix)) return undefined;
	if (suffix.includes("..") || suffix.includes("//")) return undefined;
	return "mktemp_dir_child";
}

function isQuotedExactVariable(node: TreeSitter.Node): string | undefined {
	if (node.type !== "string") return undefined;
	const expansions = node.children.filter(
		(child) => child.type === "simple_expansion",
	);
	if (expansions.length !== 1) return undefined;
	if (node.children.some((child) => child.type === "string_content"))
		return undefined;
	const variableName = expansions[0].children.find(
		(child) => child.type === "variable_name",
	)?.text;
	return variableName ? `$${variableName}` : undefined;
}

function rmCommandDetails(node: TreeSitter.Node):
	| {
			hasForce: boolean;
			hasRecursive: boolean;
			targets: TreeSitter.Node[];
	  }
	| undefined {
	if (commandName(node) !== "rm") return undefined;
	let hasForce = false;
	let hasRecursive = false;
	const targets: TreeSitter.Node[] = [];
	let afterDoubleDash = false;
	for (const child of node.children.slice(1)) {
		const text = nodeText(child).trim();
		if (!text) continue;
		if (!afterDoubleDash && text === "--") {
			afterDoubleDash = true;
			continue;
		}
		if (!afterDoubleDash && child.type === "word" && text.startsWith("-")) {
			if (text === "--force") hasForce = true;
			if (text === "--recursive") hasRecursive = true;
			if (/^-[A-Za-z]+$/.test(text)) {
				hasForce ||= text.includes("f");
				hasRecursive ||= text.includes("r") || text.includes("R");
			}
			continue;
		}
		targets.push(child);
	}
	return { hasForce, hasRecursive, targets };
}

function isSafeTempRmCommand(
	node: TreeSitter.Node,
	provenance: Map<string, TempProvenance>,
): boolean {
	const details = rmCommandDetails(node);
	if (!details?.hasForce || details.targets.length === 0) return false;
	return details.targets.every((target) => {
		if (containsCommandSubstitution(target)) return false;
		const variable = isQuotedExactVariable(target);
		if (!variable) return false;
		const source = provenance.get(variable.slice(1));
		if (!source) return false;
		return details.hasRecursive ? source === "mktemp_dir" : true;
	});
}

function trapCleanupDetails(
	node: TreeSitter.Node,
): { rawString: TreeSitter.Node; snippet: string } | undefined {
	if (commandName(node) !== "trap") return undefined;
	const parts = node.children.slice(1);
	if (parts.length !== 2) return undefined;
	const [rawString, signal] = parts;
	if (!["raw_string", "string"].includes(rawString.type)) return undefined;
	if (signal.text !== "EXIT") return undefined;
	return { rawString, snippet: stripQuotes(rawString.text) };
}

function analyzeTrapCleanup(
	parser: TreeSitter.Parser,
	node: TreeSitter.Node,
	provenance: Map<string, TempProvenance>,
): { safeRanges: Array<{ start: number; end: number }>; allSafe: boolean } {
	const trap = trapCleanupDetails(node);
	if (!trap) return { safeRanges: [], allSafe: false };
	const root = parse(parser, trap.snippet);
	const commands = collectLinearShellEvents(root).filter(
		(event) => event.type === "command",
	);
	if (commands.length === 0) return { safeRanges: [], allSafe: false };
	const innerOffset = trap.rawString.startIndex + 1;
	const safeRanges: Array<{ start: number; end: number }> = [];
	for (const command of commands) {
		if (!isSafeTempRmCommand(command, provenance))
			return { safeRanges: [], allSafe: false };
		safeRanges.push({
			start: innerOffset + command.startIndex,
			end: innerOffset + command.endIndex,
		});
	}
	return { safeRanges, allSafe: true };
}

function shellCommandExecutesTempTarget(
	node: TreeSitter.Node,
	provenance: Map<string, TempProvenance>,
): string | undefined {
	const name = commandName(node);
	if (!name || !SHELL_C_NAMES.has(name)) return undefined;
	for (const child of node.children.slice(1)) {
		const variable = isQuotedExactVariable(child);
		if (variable && provenance.has(variable.slice(1))) return variable;
	}
	return undefined;
}

function analyzeTempCleanup(
	root: TreeSitter.Node,
	parser: TreeSitter.Parser,
): TempCleanupAnalysis {
	const provenance = new Map<string, TempProvenance>();
	const safeRmCommands = new Set<string>();
	const safeCommandTexts = new Set<string>();
	const safeRanges: Array<{ start: number; end: number }> = [];
	for (const event of collectLinearShellEvents(root)) {
		if (event.type === "variable_assignment") {
			const variable = variableAssignmentName(event);
			if (!variable) continue;
			const source =
				mktempProvenanceFromAssignment(event) ??
				tempDirChildProvenanceFromAssignment(event, provenance);
			if (source) provenance.set(variable, source);
			else provenance.delete(variable);
			continue;
		}
		if (event.type !== "command") continue;
		const trap = analyzeTrapCleanup(parser, event, provenance);
		if (trap.allSafe) {
			safeCommandTexts.add(nodeText(event));
			for (const range of trap.safeRanges) safeRanges.push(range);
			continue;
		}
		const executedTemp = shellCommandExecutesTempTarget(event, provenance);
		if (executedTemp) {
			return {
				ask: {
					decision: "ask",
					reason: `${commandName(event)} executes temp file ${executedTemp} - payload must be reviewed separately`,
				},
				safeRmCommands,
				safeCommandTexts,
				safeRanges,
			};
		}
		if (isSafeTempRmCommand(event, provenance)) {
			safeRmCommands.add(nodeSpanKey(event));
			safeCommandTexts.add(nodeText(event));
			safeRanges.push({ start: event.startIndex, end: event.endIndex });
		}
	}
	return { safeRmCommands, safeCommandTexts, safeRanges };
}

function bashWasmPath(): string {
	return path.join(
		path.dirname(require.resolve("tree-sitter-bash/package.json")),
		"tree-sitter-bash.wasm",
	);
}

async function getParser(): Promise<TreeSitter.Parser> {
	if (!initPromise) {
		initPromise = (async () => {
			await TreeSitter.Parser.init();
			const language = await TreeSitter.Language.load(bashWasmPath());
			const parser = new TreeSitter.Parser();
			parser.setLanguage(language);
			return parser;
		})();
	}
	return initPromise;
}

function parse(parser: TreeSitter.Parser, command: string): TreeSitter.Node {
	const tree = parser.parse(command);
	if (!tree) throw new Error("Tree-sitter returned no parse tree");
	return tree.rootNode;
}

function commandParts(node: TreeSitter.Node): string[] {
	return node.children.map((child) => nodeText(child).trim()).filter(Boolean);
}

function collectCommandNode(
	parser: TreeSitter.Parser,
	node: TreeSitter.Node,
	commands: string[],
	depth: number,
): void {
	const parts = commandParts(node);
	if (parts.length === 0) return;
	const commandName = stripQuotes(parts[0]);
	commands.push([commandName, ...parts.slice(1)].join(" "));
	if (!SHELL_C_NAMES.has(commandName)) return;
	for (let i = 1; i < parts.length - 1; i += 1) {
		if (parts[i] !== "-c") continue;
		const inner = stripQuotes(parts[i + 1]);
		if (inner)
			collectCommands(parse(parser, inner), parser, commands, depth + 1);
		break;
	}
}

function collectCommands(
	root: TreeSitter.Node,
	parser: TreeSitter.Parser,
	commands: string[],
	depth = 0,
): void {
	if (depth > MAX_RECURSION_DEPTH) return;
	if (root.type === "command" && root.children.length > 0) {
		collectCommandNode(parser, root, commands, depth);
	}
	for (const child of root.children)
		collectCommands(child, parser, commands, depth);
}

function extractedCommands(
	root: TreeSitter.Node,
	parser: TreeSitter.Parser,
): string[] {
	const commands: string[] = [];
	collectCommands(root, parser, commands);
	return commands;
}

function checkExtractedCommands(
	commands: string[],
	rules: DangerousCommand[],
	safeRmTexts = new Set<string>(),
): AstDecision | undefined {
	for (const command of commands) {
		if (safeRmTexts.has(command)) continue;
		for (const rule of rules) {
			if (!commandAppliesToCurrentPlatform(rule)) continue;
			if (shouldAllowReadOnlyXargsShellRule(command, rule)) continue;
			const regex = rule.regex ? compileCommandRegex(rule.regex) : undefined;
			const matched = regex
				? regex.test(command)
				: command.includes(rule.pattern);
			if (!matched) continue;
			if (rule.action === "ask")
				return { decision: "ask", reason: rule.reason };
			return { decision: "block", reason: rule.reason };
		}
	}
	return undefined;
}

function variablesFromNode(node: TreeSitter.Node): Set<string> {
	const variables = new Set<string>();
	function walk(current: TreeSitter.Node): void {
		if (current.type === "expansion" || current.type === "simple_expansion")
			variables.add(nodeText(current));
		for (const child of current.children) walk(child);
	}
	walk(node);
	return variables;
}

function unsafeVariables(variables: Set<string>): string[] {
	return [...variables]
		.filter((variable) => !SAFE_VARIABLES.has(variable))
		.sort();
}

function checkVariableExpansion(
	node: TreeSitter.Node,
	dangerousCommands: string[],
	safeRmCommands: Set<string>,
): AstDecision | undefined {
	if (node.type === "command" && node.children.length > 0) {
		const commandName = stripQuotes(nodeText(node.children[0]).trim());
		if (commandName === "rm" && safeRmCommands.has(nodeSpanKey(node))) {
			return undefined;
		}
		if (dangerousCommands.includes(commandName)) {
			const variables = new Set<string>();
			for (const child of node.children.slice(1)) {
				for (const variable of variablesFromNode(child))
					variables.add(variable);
			}
			const unsafe = unsafeVariables(variables);
			if (unsafe.length > 0) {
				return {
					decision: "ask",
					reason: `Variable expansion in ${commandName} arguments: ${unsafe.join(", ")}`,
				};
			}
		}
	}
	for (const child of node.children) {
		const result = checkVariableExpansion(
			child,
			dangerousCommands,
			safeRmCommands,
		);
		if (result) return result;
	}
	return undefined;
}

function checkEvalSourceNode(
	parser: TreeSitter.Parser,
	node: TreeSitter.Node,
	rules: DangerousCommand[],
	astConfig: AstAnalysisConfig,
	depth: number,
): AstDecision | undefined {
	if (node.type !== "command" || node.children.length === 0) return undefined;
	const commandName = stripQuotes(nodeText(node.children[0]).trim());
	if (!EVAL_SOURCE_COMMANDS.has(commandName)) return undefined;
	for (const arg of node.children.slice(1)) {
		if (arg.type === "expansion" || arg.type === "simple_expansion") {
			return {
				decision: "ask",
				reason: `${commandName} with dynamic argument ${nodeText(arg)} - value unknown at analysis time`,
			};
		}
		const unsafe = unsafeVariables(variablesFromNode(arg));
		if (unsafe.length > 0) {
			return {
				decision: "ask",
				reason: `${commandName} with dynamic argument containing ${unsafe.join(", ")}`,
			};
		}
		if (
			commandName === "eval" &&
			["string", "raw_string", "word"].includes(arg.type)
		) {
			const inner = stripQuotes(nodeText(arg));
			if (!inner || depth > MAX_RECURSION_DEPTH) continue;
			const innerRoot = parse(parser, inner);
			const extracted = checkExtractedCommands(
				extractedCommands(innerRoot, parser),
				rules,
			);
			if (extracted) return extracted;
			const nestedEval = checkEvalSource(
				innerRoot,
				parser,
				rules,
				astConfig,
				depth + 1,
			);
			if (nestedEval) return nestedEval;
		}
	}
	return undefined;
}

function checkEvalSource(
	root: TreeSitter.Node,
	parser: TreeSitter.Parser,
	rules: DangerousCommand[],
	astConfig: AstAnalysisConfig,
	depth = 0,
): AstDecision | undefined {
	if (depth > MAX_RECURSION_DEPTH) return undefined;
	const current = checkEvalSourceNode(parser, root, rules, astConfig, depth);
	if (current) return current;
	for (const child of root.children) {
		const result = checkEvalSource(child, parser, rules, astConfig, depth);
		if (result) return result;
	}
	return undefined;
}

async function runAnalysis(
	parser: TreeSitter.Parser,
	command: string,
	rules: DangerousCommand[],
	astConfig: AstAnalysisConfig,
): Promise<AstDecision> {
	const root = parse(parser, command);
	const tempCleanup = analyzeTempCleanup(root, parser);
	const extracted = checkExtractedCommands(
		extractedCommands(root, parser),
		rules,
		tempCleanup.safeCommandTexts,
	);
	if (extracted) return extracted;
	if (tempCleanup.ask) return tempCleanup.ask;
	const variable = checkVariableExpansion(
		root,
		astConfig.dangerousCommands ?? [],
		tempCleanup.safeRmCommands,
	);
	if (variable) return variable;
	const evalSource = checkEvalSource(root, parser, rules, astConfig);
	if (evalSource) return evalSource;
	return { decision: "allow" };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error("timeout")), timeoutMs);
		promise.then(
			(value) => {
				clearTimeout(timeout);
				resolve(value);
			},
			(error: unknown) => {
				clearTimeout(timeout);
				reject(error);
			},
		);
	});
}

function hasTruncatingRedirect(node: TreeSitter.Node): boolean {
	if (
		node.type.includes("redirect") &&
		/(?<![<>])(?:\d*)>\|?(?!>)/.test(nodeText(node))
	) {
		return true;
	}
	return node.children.some((child) => hasTruncatingRedirect(child));
}

function commandArguments(node: TreeSitter.Node): string[] {
	return node.children
		.slice(1)
		.map((child) => stripQuotes(nodeText(child).trim()))
		.filter(Boolean);
}

function isInPlaceSed(node: TreeSitter.Node): boolean {
	if (commandName(node) !== "sed") return false;
	return commandArguments(node).some(
		(argument) =>
			/^-i(?:$|[^A-Za-z])/.test(argument) ||
			/^--in-place(?:=|$)/.test(argument),
	);
}

function isInPlacePerl(node: TreeSitter.Node): boolean {
	if (commandName(node) !== "perl") return false;
	return commandArguments(node).some((argument) =>
		/^-[A-Za-z]*pi[A-Za-z]*$/.test(argument),
	);
}

function redirectScope(node: TreeSitter.Node): TreeSitter.Node {
	return node.parent?.type.includes("redirect") ? node.parent : node;
}

function isTruncatingCat(node: TreeSitter.Node): boolean {
	return (
		commandName(node) === "cat" &&
		hasTruncatingRedirect(redirectScope(node))
	);
}

function collectHeredocBodyText(node: TreeSitter.Node): string {
	if (node.type === "heredoc_body") return nodeText(node);
	return node.children.map((child) => collectHeredocBodyText(child)).join("\n");
}

function isMutatingPythonHeredoc(
	node: TreeSitter.Node,
	originalCommand: string,
): boolean {
	const name = commandName(node);
	if (!name || !/^python(?:\d+(?:\.\d+)*)?$/.test(name)) return false;
	if (!new RegExp(`\\b${name}\\s+-\\s*<<`).test(originalCommand))
		return false;
	const script = collectHeredocBodyText(redirectScope(node));
	return (
		/\.write_text\s*\(/.test(script) ||
		/\bopen\s*\([^\n)]*,\s*["']w["']/.test(script)
	);
}

function containsUnsafeShellEdit(
	node: TreeSitter.Node,
	originalCommand: string,
): boolean {
	if (
		node.type === "command" &&
		(isInPlaceSed(node) ||
			isInPlacePerl(node) ||
			isTruncatingCat(node) ||
			isMutatingPythonHeredoc(node, originalCommand))
	) {
		return true;
	}
	return node.children.some((child) =>
		containsUnsafeShellEdit(child, originalCommand),
	);
}

export async function analyzeUnsafeShellEdit(
	command: string,
	astConfig?: AstAnalysisConfig,
): Promise<{ block: true; reason: string } | undefined> {
	if (!SHELL_EDIT_PREFILTER.test(command)) return undefined;
	try {
		const parser = await getParser();
		const root = parse(parser, command);
		const analysis = (async () =>
			containsUnsafeShellEdit(root, command))();
		const matched =
			astConfig?.timeoutMs && astConfig.timeoutMs > 0
				? await withTimeout(analysis, astConfig.timeoutMs)
				: await analysis;
		if (!matched) return undefined;
		return {
			block: true,
			reason: `Blocked unsafe shell edit (matched "${SHELL_EDIT_RULE}"): ${SHELL_EDIT_GUIDANCE}`,
		};
	} catch {
		return {
			block: true,
			reason: `Blocked ambiguous shell edit (matched "${SHELL_EDIT_RULE}"): structural analysis failed. ${SHELL_EDIT_GUIDANCE}`,
		};
	}
}

export async function isProvenSafeTempCleanupAt(
	command: string,
	matchIndex: number,
	astConfig: AstAnalysisConfig | undefined,
): Promise<boolean> {
	if (!astConfig?.enabled || matchIndex < 0) return false;
	try {
		const parser = await getParser();
		const analysis = (async () => {
			const root = parse(parser, command);
			const tempCleanup = analyzeTempCleanup(root, parser);
			if (tempCleanup.ask) return false;
			return tempCleanup.safeRanges.some(
				(range) => range.start <= matchIndex && matchIndex < range.end,
			);
		})();
		return astConfig.timeoutMs && astConfig.timeoutMs > 0
			? await withTimeout(analysis, astConfig.timeoutMs)
			: await analysis;
	} catch {
		return false;
	}
}

export async function analyzeCommandAst(
	command: string,
	rules: DangerousCommand[],
	astConfig: AstAnalysisConfig | undefined,
): Promise<AstDecision> {
	if (!astConfig?.enabled) return { decision: "allow" };
	if (
		!COMPOUND_SHELL_OPERATOR.test(command) &&
		isSafeCommand(command, astConfig.safeCommands ?? [])
	) {
		return { decision: "allow" };
	}
	try {
		const parser = await getParser();
		const analysis = runAnalysis(parser, command, rules, astConfig);
		return astConfig.timeoutMs && astConfig.timeoutMs > 0
			? await withTimeout(analysis, astConfig.timeoutMs)
			: await analysis;
	} catch (error) {
		return {
			decision: "ask",
			reason:
				error instanceof Error && error.message === "timeout"
					? "Command too complex to analyze within timeout"
					: "AST analysis error - confirm command is safe",
		};
	}
}

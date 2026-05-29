import { createRequire } from "node:module";
import * as path from "node:path";
import * as TreeSitter from "web-tree-sitter";
import { commandAppliesToCurrentPlatform } from "../damage-control-engine.js";
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
const MAX_RECURSION_DEPTH = 3;

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
): AstDecision | undefined {
	for (const command of commands) {
		for (const rule of rules) {
			if (!commandAppliesToCurrentPlatform(rule)) continue;
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
): AstDecision | undefined {
	if (node.type === "command" && node.children.length > 0) {
		const commandName = stripQuotes(nodeText(node.children[0]).trim());
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
		const result = checkVariableExpansion(child, dangerousCommands);
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
	command: string,
	rules: DangerousCommand[],
	astConfig: AstAnalysisConfig,
): Promise<AstDecision> {
	const parser = await getParser();
	const root = parse(parser, command);
	const extracted = checkExtractedCommands(
		extractedCommands(root, parser),
		rules,
	);
	if (extracted) return extracted;
	const variable = checkVariableExpansion(
		root,
		astConfig.dangerousCommands ?? [],
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
		const analysis = runAnalysis(command, rules, astConfig);
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

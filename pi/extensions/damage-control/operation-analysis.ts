import { createRequire } from "node:module";
import * as path from "node:path";
import * as TreeSitter from "web-tree-sitter";

export type OperationLanguage =
	| "bash"
	| "powershell"
	| "python"
	| "javascript"
	| "typescript";

export type EffectKind =
	| "filesystem"
	| "git"
	| "docker"
	| "subprocess"
	| "network";

export type OperationKind =
	| "read"
	| "write"
	| "delete"
	| "execute"
	| "fetch"
	| "clone"
	| "pull"
	| "push"
	| "inspect"
	| "prune"
	| "unknown";

export type ParserRange = { start: number; end: number };

export type KnownEffect = {
	status: "known";
	language: OperationLanguage;
	kind: EffectKind;
	operation: OperationKind;
	executable?: string;
	arguments?: string[];
	target?: string;
	range: ParserRange;
};

export type UncertainEffect = {
	status: "uncertain";
	language: OperationLanguage;
	reason: string;
	range?: ParserRange;
};

export type OperationEffect = KnownEffect | UncertainEffect;

export type OperationAnalysis =
	| { status: "known"; language: OperationLanguage; effects: KnownEffect[]; protected: boolean }
	| {
			status: "uncertain";
			language: OperationLanguage;
			effects: KnownEffect[];
			protected: boolean;
			reason: string;
		};

const require = createRequire(import.meta.url);
const MAX_RECURSION_DEPTH = 3;
const parserPromises = new Map<OperationLanguage, Promise<TreeSitter.Parser>>();

const PACKAGE_NAMES: Record<OperationLanguage, string> = {
	bash: "tree-sitter-bash",
	powershell: "tree-sitter-powershell",
	python: "tree-sitter-python",
	javascript: "tree-sitter-javascript",
	typescript: "tree-sitter-typescript",
};

function wasmPath(language: OperationLanguage): string {
	const packageName = PACKAGE_NAMES[language];
	const fileName =
		language === "typescript" ? "tree-sitter-typescript.wasm" : `${packageName}.wasm`;
	return path.join(path.dirname(require.resolve(`${packageName}/package.json`)), fileName);
}

export async function getOperationParser(
	language: OperationLanguage,
): Promise<TreeSitter.Parser> {
	let parserPromise = parserPromises.get(language);
	if (!parserPromise) {
		parserPromise = (async () => {
			await TreeSitter.Parser.init();
			const grammar = await TreeSitter.Language.load(wasmPath(language));
			const parser = new TreeSitter.Parser();
			parser.setLanguage(grammar);
			return parser;
		})();
		parserPromises.set(language, parserPromise);
	}
	return parserPromise;
}

export const getBashParser = (): Promise<TreeSitter.Parser> =>
	getOperationParser("bash");

function range(node: TreeSitter.Node): ParserRange {
	return { start: node.startIndex, end: node.endIndex };
}

function clean(text: string): string {
	const value = text.trim();
	if (value.length >= 2 && ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))))
		return value.slice(1, -1);
	return value;
}

function hasParserError(node: TreeSitter.Node): TreeSitter.Node | undefined {
	if (node.type === "ERROR" || node.isMissing) return node;
	for (const child of node.children) {
		const error = hasParserError(child);
		if (error) return error;
	}
	return undefined;
}

function commandName(node: TreeSitter.Node, language: OperationLanguage): string | undefined {
	if (language === "bash") {
		return node.childForFieldName("name")?.text ?? node.children[0]?.text;
	}
	return node.childForFieldName("command_name")?.text ?? node.children.find((child) => child.type === "command_name")?.text;
}

function commandArguments(node: TreeSitter.Node, language: OperationLanguage): string[] {
	if (language === "bash") return node.children.slice(1).map((child) => clean(child.text)).filter(Boolean);
	const elements = node.childForFieldName("command_elements");
	return (elements?.children ?? node.children.slice(1)).map((child) => clean(child.text)).filter(Boolean);
}

function firstLiteral(node: TreeSitter.Node): string | undefined {
	if (["string", "string_fragment", "string_content"].includes(node.type)) return clean(node.text);
	for (const child of node.children) {
		const literal = firstLiteral(child);
		if (literal !== undefined) return literal;
	}
	return undefined;
}

function effectForCall(
	node: TreeSitter.Node,
	language: OperationLanguage,
): KnownEffect | null | undefined {
	const functionNode = node.childForFieldName("function");
	if (!functionNode) return undefined;
	const name = functionNode.text;
	const lower = name.toLowerCase();
	const args = node.childForFieldName("arguments");
	const target = args ? firstLiteral(args) : undefined;
	const base = { status: "known" as const, language, executable: name, arguments: args ? args.children.map((child) => clean(child.text)).filter(Boolean) : [], range: range(node) };
	if (["path", "print", "console.log"].includes(lower)) return null;
	if (lower.endsWith(".write_text") || ["path.write_text", "pathlib.path.write_text", "fs.writefile", "fs.writefilesync"].includes(lower))
		return { ...base, kind: "filesystem", operation: "write", target };
	if (["fs.readfile", "fs.readfilesync"].includes(lower))
		return { ...base, kind: "filesystem", operation: "read", target };
	if (lower === "open") {
		const mode = base.arguments?.[1]?.replaceAll("'", "").replaceAll('"', "");
		return { ...base, kind: "filesystem", operation: mode && /[wax+]/.test(mode) ? "write" : "read", target };
	}
	if (["fs.rmsync", "fs.unlink", "fs.unlinksync", "os.remove", "path.unlink"].includes(lower))
		return { ...base, kind: "filesystem", operation: "delete", target };
	if (["fetch", "requests.get", "requests.post", "urllib.request.urlopen"].includes(lower))
		return { ...base, kind: "network", operation: "fetch", target };
	if (["child_process.exec", "child_process.execsync", "subprocess.run", "subprocess.popen", "os.system"].includes(lower))
		return { ...base, kind: "subprocess", operation: "execute", target };
	return undefined;
}

function effectForCommand(
	node: TreeSitter.Node,
	language: OperationLanguage,
): KnownEffect | null | undefined {
	const executable = commandName(node, language);
	if (!executable) return undefined;
	const args = commandArguments(node, language);
	const name = clean(executable).toLowerCase();
	const base = { status: "known" as const, language, executable: clean(executable), arguments: args, range: range(node) };
	if (name === "git") {
		const subcommand = args.find((arg) => !arg.startsWith("-"));
		const operation: OperationKind =
			subcommand === "clone" ? "clone" : subcommand === "fetch" ? "fetch" : subcommand === "pull" ? "pull" : subcommand === "push" ? "push" : subcommand === "rm" ? "delete" : "unknown";
		const subcommandIndex = args.findIndex((arg) => !arg.startsWith("-"));
		const positional = subcommandIndex === -1 ? [] : args.slice(subcommandIndex + 1).filter((arg) => !arg.startsWith("-"));
		return { ...base, kind: "git", operation, target: positional.at(-1) };
	}
	if (["rm", "remove-item", "del", "erase", "rmdir"].includes(name))
		return { ...base, kind: "filesystem", operation: "delete", target: args.filter((arg) => !arg.startsWith("-")).at(-1) };
	if (["cat", "get-content", "type"].includes(name))
		return { ...base, kind: "filesystem", operation: "read", target: args.filter((arg) => !arg.startsWith("-")).at(-1) };
	if (["cp", "copy-item", "mv", "move-item", "set-content", "add-content", "out-file", "mkdir", "new-item"].includes(name))
		return { ...base, kind: "filesystem", operation: "write", target: args.filter((arg) => !arg.startsWith("-")).at(-1) };
	if (["curl", "wget", "invoke-webrequest", "invoke-restmethod"].includes(name))
		return { ...base, kind: "network", operation: "fetch", target: args.find((arg) => !arg.startsWith("-")) };
	if (["docker", "podman"].includes(name))
		return { ...base, kind: "docker", operation: args.includes("prune") ? "prune" : "unknown", target: args.find((arg) => !arg.startsWith("-")) };
	if (["printf", "echo", "test", "true", "false", "pwd", "cd", "set-location", "set-location", "write-output"].includes(name)) return null;
	if (language === "bash" && [".", "source", "eval", "exec", "command", "builtin"].includes(name)) {
		return undefined;
	}
	if (["python", "python3", "node", "bun", "deno"].includes(name)) return { ...base, kind: "subprocess", operation: "execute" };
	return undefined;
}

function hasDynamicArgument(effect: KnownEffect): boolean {
	return (effect.arguments ?? []).some((argument) => /[$`*?()]|\$\{/.test(argument));
}

function collectEffects(
	node: TreeSitter.Node,
	language: OperationLanguage,
	effects: KnownEffect[],
	uncertain: { reason?: string; range?: ParserRange },
	depth: number,
): void {
	const executableNode =
		node.type === "command" || node.type === "call" || node.type === "call_expression";
	if (executableNode && depth > MAX_RECURSION_DEPTH) {
		uncertain.reason = "analysis recursion exceeded depth three";
		uncertain.range = range(node);
		return;
	}
	if (node.type === "command") {
		const effect = effectForCommand(node, language);
		if (effect === undefined) {
			uncertain.reason = `unsupported executable construct: ${node.text}`;
			uncertain.range = range(node);
		} else if (effect) {
			effects.push(effect);
			if (hasDynamicArgument(effect)) {
				uncertain.reason = "dynamic executable argument";
				uncertain.range = effect.range;
			}
		}
	}
	if (node.type === "call" || node.type === "call_expression") {
		const effect = effectForCall(node, language);
		if (effect === undefined) {
			uncertain.reason = `unsupported executable construct: ${node.text}`;
			uncertain.range = range(node);
		} else if (effect) {
			effects.push(effect);
			if (hasDynamicArgument(effect)) {
				uncertain.reason = "dynamic executable argument";
				uncertain.range = effect.range;
			}
		}
	}
	for (const child of node.children) {
		collectEffects(child, language, effects, uncertain, depth + (executableNode ? 1 : 0));
	}
}

function hasSensitiveReadWithSink(effects: KnownEffect[]): boolean {
	const sensitiveRead = effects.some(
		(effect) => effect.kind === "filesystem" && effect.operation === "read" && effect.target?.toLowerCase().endsWith(".env"),
	);
	const sink = effects.some(
		(effect) => effect.kind === "network" || effect.kind === "subprocess",
	);
	return sensitiveRead && sink;
}

export function aggregateOperationEffects(effects: KnownEffect[]): {
	effects: KnownEffect[];
	protected: boolean;
} {
	return { effects: [...effects], protected: hasSensitiveReadWithSink(effects) };
}

export async function analyzeOperation(
	source: string,
	language: OperationLanguage,
	options: { timeoutMs?: number } = {},
): Promise<OperationAnalysis> {
	try {
		const parser = await getOperationParser(language);
		const deadline = options.timeoutMs && options.timeoutMs > 0 ? Date.now() + options.timeoutMs : undefined;
		const tree = parser.parse(source, null, {
			progressCallback: (state: TreeSitter.ParseState) => {
				if (deadline && Date.now() >= deadline) throw new Error("parser timeout");
				void state;
			},
		});
		if (!tree) throw new Error("parser returned no tree");
		const syntaxError = hasParserError(tree.rootNode);
		const effects: KnownEffect[] = [];
		const uncertain: { reason?: string; range?: ParserRange } = {};
		if (syntaxError) {
			uncertain.reason = `parser recovery node: ${syntaxError.type}`;
			uncertain.range = range(syntaxError);
		}
		collectEffects(tree.rootNode, language, effects, uncertain, 0);
		const protectedEffect = hasSensitiveReadWithSink(effects);
		return uncertain.reason
			? { status: "uncertain", language, effects, protected: protectedEffect, reason: uncertain.reason }
			: { status: "known", language, effects, protected: protectedEffect };
	} catch (error) {
		return {
			status: "uncertain",
			language,
			effects: [],
			protected: false,
			reason: error instanceof Error ? `parser unavailable: ${error.message}` : "parser unavailable",
		};
	}
}

export const analyzeCommandEffects = analyzeOperation;
export const parseOperationEffects = analyzeOperation;

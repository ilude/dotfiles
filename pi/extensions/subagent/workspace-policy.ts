import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const GOVERNED_NATIVE_PATH_TOOLS = new Set([
	"read",
	"write",
	"edit",
	"text_edit",
	"structured_edit",
	"grep",
	"find",
	"ls",
	"glob",
]);

export const GOVERNED_SHELL_TOOLS = new Set(["bash", "pwsh"]);

export type WorkspacePolicyDenyCode =
	| "workspace_root_invalid"
	| "workspace_root_filesystem_root"
	| "workspace_root_widened"
	| "path_invalid"
	| "path_escape"
	| "filesystem_root_target"
	| "dynamic_recursive_target";

export interface WorkspacePolicy {
	readonly workspaceRoot: string;
}

export interface WorkspaceAllow {
	readonly outcome: "allow";
	readonly governed: boolean;
	readonly workspaceRoot: string;
	readonly targets: readonly string[];
	readonly reason?: "outside-policy";
}

export interface WorkspaceDeny {
	readonly outcome: "deny";
	readonly code: WorkspacePolicyDenyCode;
	readonly governed: true;
	readonly workspaceRoot?: string;
	readonly target?: string;
	readonly reason: string;
}

export type WorkspacePolicyResult = WorkspaceAllow | WorkspaceDeny;

export type WorkspaceRootResult =
	| {
			readonly outcome: "allow";
			readonly policy: WorkspacePolicy;
			readonly workspaceRoot: string;
		}
	| {
			readonly outcome: "deny";
			readonly code:
				| "workspace_root_invalid"
				| "workspace_root_filesystem_root"
				| "workspace_root_widened";
			readonly reason: string;
		};

interface StaticToken {
	readonly value: string;
	readonly dynamic: boolean;
}

interface CommandSegment {
	readonly tokens: readonly StaticToken[];
}

function errorCode(error: unknown): string | undefined {
	return error && typeof error === "object" && "code" in error
		? (error as NodeJS.ErrnoException).code
		: undefined;
}

function canonicalExistingDirectory(value: string):
	| { ok: true; canonical: string }
	| { ok: false; reason: string } {
	if (!value || value.includes("\0")) {
		return { ok: false, reason: "Workspace root must be a non-empty path." };
	}
	const absolute = path.resolve(value);
	try {
		const canonical = fs.realpathSync.native(absolute);
		if (!fs.statSync(canonical).isDirectory()) {
			return { ok: false, reason: "Workspace root must be an existing directory." };
		}
		return { ok: true, canonical };
	} catch (error) {
		return {
			ok: false,
			reason: `Workspace root cannot be canonicalized: ${
				error instanceof Error ? error.message : String(error)
			}`,
		};
	}
}

function isFilesystemRoot(value: string): boolean {
	return path.resolve(value) === path.parse(value).root;
}

function isInside(root: string, candidate: string): boolean {
	const relative = path.relative(root, candidate);
	return (
		relative === "" ||
		(!path.isAbsolute(relative) &&
			relative !== ".." &&
			!relative.startsWith(`..${path.sep}`))
	);
}

function canonicalizeWithNearestExistingAncestor(value: string):
	| { ok: true; canonical: string }
	| { ok: false; reason: string } {
	const missing: string[] = [];
	let candidate = path.resolve(value);
	while (true) {
		try {
			const canonicalAncestor = fs.realpathSync.native(candidate);
			if (missing.length > 0 && !fs.statSync(canonicalAncestor).isDirectory()) {
				return {
					ok: false,
					reason: "The nearest existing path ancestor is not a directory.",
				};
			}
			return {
				ok: true,
				canonical: path.resolve(canonicalAncestor, ...missing),
			};
		} catch (error) {
			if (errorCode(error) !== "ENOENT") {
				return {
					ok: false,
					reason: `Path cannot be canonicalized: ${
						error instanceof Error ? error.message : String(error)
					}`,
				};
			}
			const parent = path.dirname(candidate);
			if (parent === candidate) {
				return { ok: false, reason: "Path has no existing ancestor." };
			}
			missing.unshift(path.basename(candidate));
			candidate = parent;
		}
	}
}

type WorkspaceRootDenyCode =
	| "workspace_root_invalid"
	| "workspace_root_filesystem_root"
	| "workspace_root_widened";

function rootDeny(
	code: WorkspaceRootDenyCode,
	reason: string,
): WorkspaceRootResult {
	return { outcome: "deny", code, reason };
}

export function resolveWorkspaceRoot(
	parentWorkspaceRoot: string,
	requestedWorkspaceRoot?: string,
	options: { readonly allowExternal?: boolean } = {},
): WorkspaceRootResult {
	const parent = canonicalExistingDirectory(parentWorkspaceRoot);
	if (!parent.ok) return rootDeny("workspace_root_invalid", parent.reason);
	if (isFilesystemRoot(parent.canonical)) {
		return rootDeny(
			"workspace_root_filesystem_root",
			"A filesystem root cannot be used as a workspace root.",
		);
	}

	const requested = requestedWorkspaceRoot ?? parent.canonical;
	const requestedAbsolute = path.isAbsolute(requested)
		? requested
		: path.resolve(parent.canonical, requested);
	const child = canonicalExistingDirectory(requestedAbsolute);
	if (!child.ok) return rootDeny("workspace_root_invalid", child.reason);
	if (isFilesystemRoot(child.canonical)) {
		return rootDeny(
			"workspace_root_filesystem_root",
			"A filesystem root cannot be used as a workspace root.",
		);
	}
	if (options.allowExternal !== true && !isInside(parent.canonical, child.canonical)) {
		return rootDeny(
			"workspace_root_widened",
			"A child cannot widen its assigned workspace root.",
		);
	}
	return {
		outcome: "allow",
		policy: Object.freeze({ workspaceRoot: child.canonical }),
		workspaceRoot: child.canonical,
	};
}

export function createWorkspacePolicy(
	parentWorkspaceRoot: string,
	requestedWorkspaceRoot?: string,
	options: { readonly allowExternal?: boolean } = {},
): WorkspaceRootResult {
	return resolveWorkspaceRoot(parentWorkspaceRoot, requestedWorkspaceRoot, options);
}

function policyRoot(policy: WorkspacePolicy):
	| { ok: true; canonical: string }
	| { ok: false; result: WorkspaceDeny } {
	const root = canonicalExistingDirectory(policy.workspaceRoot);
	if (!root.ok) {
		return {
			ok: false,
			result: {
				outcome: "deny",
				code: "workspace_root_invalid",
				governed: true,
				reason: root.reason,
			},
		};
	}
	if (isFilesystemRoot(root.canonical)) {
		return {
			ok: false,
			result: {
				outcome: "deny",
				code: "workspace_root_filesystem_root",
				governed: true,
				reason: "A filesystem root cannot be used as a workspace root.",
			},
		};
	}
	return { ok: true, canonical: root.canonical };
}

function pathValues(input: unknown): string[] {
	if (!input || typeof input !== "object") return [];
	const record = input as Record<string, unknown>;
	const values: string[] = [];
	if (typeof record.path === "string") values.push(record.path);
	if (Array.isArray(record.paths)) {
		for (const value of record.paths) {
			if (typeof value === "string") values.push(value);
		}
	}
	return values;
}

function denyPath(
	workspaceRoot: string,
	code: WorkspacePolicyDenyCode,
	reason: string,
	target?: string,
): WorkspaceDeny {
	return {
		outcome: "deny",
		code,
		governed: true,
		workspaceRoot,
		target,
		reason,
	};
}

function checkCanonicalTargets(
	workspaceRoot: string,
	targets: readonly string[],
	cwd: string,
): WorkspacePolicyResult {
	const canonicalTargets: string[] = [];
	for (const target of targets) {
		if (!target || target.includes("\0")) {
			return denyPath(
				workspaceRoot,
				"path_invalid",
				"A governed path must be a non-empty path without NUL bytes.",
				target,
			);
		}
		const resolved = canonicalizeWithNearestExistingAncestor(
			path.isAbsolute(target) ? target : path.resolve(cwd, target),
		);
		if (!resolved.ok) {
			return denyPath(
				workspaceRoot,
				"path_invalid",
				resolved.reason,
				target,
			);
		}
		if (isFilesystemRoot(resolved.canonical)) {
			return denyPath(
				workspaceRoot,
				"filesystem_root_target",
				"A filesystem root cannot be accessed by a governed workspace tool.",
				target,
			);
		}
		if (!isInside(workspaceRoot, resolved.canonical)) {
			return denyPath(
				workspaceRoot,
				"path_escape",
				"The governed path escapes the assigned workspace.",
				target,
			);
		}
		canonicalTargets.push(resolved.canonical);
	}
	return {
		outcome: "allow",
		governed: true,
		workspaceRoot,
		targets: canonicalTargets,
	};
}

export function checkNativePathTool(
	policy: WorkspacePolicy,
	toolName: string,
	input: unknown,
	cwd: string,
): WorkspacePolicyResult {
	if (!GOVERNED_NATIVE_PATH_TOOLS.has(toolName)) {
		return {
			outcome: "allow",
			governed: false,
			workspaceRoot: policy.workspaceRoot,
			targets: [],
			reason: "outside-policy",
		};
	}
	const root = policyRoot(policy);
	if (!root.ok) return root.result;
	const targets = pathValues(input);
	return checkCanonicalTargets(
		root.canonical,
		targets.length > 0 ? targets : ["."],
		cwd,
	);
}

function shellTokenize(command: string): StaticToken[] | undefined {
	const tokens: StaticToken[] = [];
	let value = "";
	let dynamic = false;
	let quote: "'" | '"' | undefined;
	const flush = () => {
		if (value) tokens.push({ value, dynamic });
		value = "";
		dynamic = false;
	};
	for (let index = 0; index < command.length; index += 1) {
		const character = command[index] ?? "";
		if (quote) {
			if (character === quote) {
				quote = undefined;
				continue;
			}
			if (quote === '"' && character === "$") dynamic = true;
			value += character;
			continue;
		}
		if (character === "'" || character === '"') {
			quote = character;
			continue;
		}
		if (character === "\\") {
			if (index + 1 >= command.length) return undefined;
			value += command[index + 1] ?? "";
			index += 1;
			continue;
		}
		if (character === "$" || character === "`") dynamic = true;
		if (/[|;&\n]/.test(character)) {
			flush();
			if (character === "&" && command[index + 1] === "&") index += 1;
			else if (character === "|" && command[index + 1] === "|") index += 1;
			continue;
		}
		if (/[<>()[\]{}]/.test(character)) return undefined;
		if (/\s/.test(character)) {
			flush();
			continue;
		}
		if (/[?*\[]/.test(character)) dynamic = true;
		value += character;
	}
	if (quote) return undefined;
	flush();
	return tokens;
}

function commandSegments(command: string): CommandSegment[] | undefined {
	const segments: CommandSegment[] = [];
	let current = "";
	let quote: "'" | '"' | undefined;
	for (let index = 0; index < command.length; index += 1) {
		const character = command[index] ?? "";
		if (quote) {
			current += character;
			if (character === quote && command[index - 1] !== "\\") quote = undefined;
			continue;
		}
		if (character === "'" || character === '"') {
			quote = character;
			current += character;
			continue;
		}
		if (/[|;&\n]/.test(character)) {
			if (current.trim()) {
				const tokens = shellTokenize(current);
				if (!tokens) return undefined;
				segments.push({ tokens });
			}
			current = "";
			if (character === "&" && command[index + 1] === "&") index += 1;
			else if (character === "|" && command[index + 1] === "|") index += 1;
			continue;
		}
		current += character;
	}
	if (quote) return undefined;
	if (current.trim()) {
		const tokens = shellTokenize(current);
		if (!tokens) return undefined;
		segments.push({ tokens });
	}
	return segments;
}

function commandName(token: StaticToken | undefined): string | undefined {
	if (!token || token.dynamic) return undefined;
	return path.basename(token.value).toLowerCase();
}

function optionValue(
	tokens: readonly StaticToken[],
	index: number,
): { value?: StaticToken; nextIndex: number } {
	return { value: tokens[index + 1], nextIndex: index + 1 };
}

function recursiveTargets(
	name: string,
	tokens: readonly StaticToken[],
): { recursive: false } | { recursive: true; targets: readonly StaticToken[] } | { dynamic: true } {
	const args = tokens.slice(1);
	if (name === "rg") {
		if (args.some((token) => token.value === "--no-recursive")) {
			return { recursive: false };
		}
		const positional: StaticToken[] = [];
		let filesMode = false;
		let patternProvided = false;
		for (let index = 0; index < args.length; index += 1) {
			const token = args[index];
			if (token.value === "--") {
				positional.push(...args.slice(index + 1));
				break;
			}
			if (token.value === "--files") {
				filesMode = true;
				continue;
			}
			if (token.value.startsWith("-") && !token.dynamic) {
				if (["-e", "--regexp", "-g", "--glob", "-f", "--file"].includes(token.value)) {
					const value = optionValue(args, index);
					if (!value.value || value.value.dynamic) return { dynamic: true };
					if (token.value === "-e" || token.value === "--regexp") patternProvided = true;
					index = value.nextIndex;
				}
				continue;
			}
			positional.push(token);
		}
		const targets = filesMode || patternProvided ? positional : positional.slice(1);
		return {
			recursive: true,
			targets: targets.length > 0 ? targets : [{ value: ".", dynamic: false }],
		};
	}
	if (name === "grep") {
		const recursive = args.some(
			(token) =>
				token.value === "--recursive" ||
				token.value === "-r" ||
				token.value === "-R" ||
				(!token.dynamic && /^-[^-]*[rR]/.test(token.value)),
		);
		if (!recursive) return { recursive: false };
		const positional: StaticToken[] = [];
		let patternProvided = false;
		for (let index = 0; index < args.length; index += 1) {
			const token = args[index];
			if (token.value === "--") {
				positional.push(...args.slice(index + 1));
				break;
			}
			if (!token.dynamic && token.value.startsWith("-")) {
				if (
					[
						"-e",
						"--regexp",
						"-f",
						"--file",
						"--include",
						"--exclude",
						"--exclude-dir",
					].includes(token.value)
				) {
					const value = optionValue(args, index);
					if (!value.value || value.value.dynamic) return { dynamic: true };
					if (token.value === "-e" || token.value === "--regexp") patternProvided = true;
					index = value.nextIndex;
				}
				continue;
			}
			positional.push(token);
		}
		const targets = patternProvided ? positional : positional.slice(1);
		return {
			recursive: true,
			targets: targets.length > 0 ? targets : [{ value: ".", dynamic: false }],
		};
	}
	if (name === "find") {
		const targets: StaticToken[] = [];
		let started = false;
		for (const token of args) {
			if (!started && ["-H", "-L", "-P"].includes(token.value)) continue;
			if (token.value === "--") {
				started = true;
				continue;
			}
			if (
				!token.dynamic &&
				(token.value.startsWith("-") || /^[()!]$/.test(token.value))
			) {
				break;
			}
			targets.push(token);
			started = true;
		}
		return {
			recursive: true,
			targets: targets.length > 0 ? targets : [{ value: ".", dynamic: false }],
		};
	}
	return { recursive: false };
}

function staticShellPath(token: StaticToken): string | undefined {
	if (token.dynamic) return undefined;
	if (token.value === "~") return os.homedir();
	if (token.value.startsWith("~/")) return path.join(os.homedir(), token.value.slice(2));
	return token.value;
}

export function checkWorkspaceShellCommand(
	policy: WorkspacePolicy,
	command: string,
	cwd: string,
): WorkspacePolicyResult {
	const root = policyRoot(policy);
	if (!root.ok) return root.result;
	const segments = commandSegments(command);
	if (!segments) {
		return {
			outcome: "allow",
			governed: false,
			workspaceRoot: root.canonical,
			targets: [],
			reason: "outside-policy",
		};
	}
	let currentCwd = cwd;
	let governedSearch = false;
	const governedTargets: string[] = [];
	for (const segment of segments) {
		const [head, ...args] = segment.tokens;
		if (commandName(head) === "cd") {
			const target = args[0];
			if (target && args.length === 1) {
				const staticTarget = staticShellPath(target);
				if (staticTarget === undefined) currentCwd = "";
				else currentCwd = path.isAbsolute(staticTarget)
					? staticTarget
					: path.resolve(currentCwd, staticTarget);
			} else {
				currentCwd = "";
			}
			continue;
		}
		const name = commandName(head);
		if (!name || !["rg", "grep", "find"].includes(name)) continue;
		const parsed = recursiveTargets(name, segment.tokens);
		if ("dynamic" in parsed) {
			return denyPath(
				root.canonical,
				"dynamic_recursive_target",
				"A recursive search target could not be resolved statically.",
			);
		}
		if (!parsed.recursive) continue;
		if (!currentCwd) {
			return denyPath(
				root.canonical,
				"dynamic_recursive_target",
				"A recursive search has an unresolved working directory.",
			);
		}
		const targets: string[] = [];
		for (const target of parsed.targets) {
			const staticTarget = staticShellPath(target);
			if (staticTarget === undefined) {
				return denyPath(
					root.canonical,
					"dynamic_recursive_target",
					"A recursive search target could not be resolved statically.",
				);
			}
			targets.push(staticTarget);
		}
		const checked = checkCanonicalTargets(
			root.canonical,
			targets,
			currentCwd,
		);
		if (checked.outcome === "deny") return checked;
		governedSearch = true;
		governedTargets.push(...checked.targets);
	}
	return {
		outcome: "allow",
		governed: governedSearch,
		workspaceRoot: root.canonical,
		targets: governedTargets,
		...(governedSearch ? {} : { reason: "outside-policy" as const }),
	};
}

export function checkWorkspaceTool(
	policy: WorkspacePolicy,
	toolName: string,
	input: unknown,
	cwd: string,
): WorkspacePolicyResult {
	if (GOVERNED_NATIVE_PATH_TOOLS.has(toolName)) {
		return checkNativePathTool(policy, toolName, input, cwd);
	}
	if (GOVERNED_SHELL_TOOLS.has(toolName)) {
		const command =
			input && typeof input === "object" && typeof (input as { command?: unknown }).command === "string"
				? (input as { command: string }).command
				: "";
		return checkWorkspaceShellCommand(policy, command, cwd);
	}
	return {
		outcome: "allow",
		governed: false,
		workspaceRoot: policy.workspaceRoot,
		targets: [],
		reason: "outside-policy",
	};
}

export const evaluateWorkspacePathTool = checkNativePathTool;
export const evaluateWorkspaceShell = checkWorkspaceShellCommand;
export const evaluateWorkspaceTool = checkWorkspaceTool;

export default function workspacePolicyModule(): void {
	// No-op default keeps Pi top-level extension auto-discovery from registering this helper.
}

import * as fs from "node:fs";
import path from "node:path";

export const DIRECT_FILE_MUTATION_TOOLS = new Set([
	"edit",
	"write",
	"text_edit",
	"structured_edit",
]);

export const COMMAND_MUTATION_TOOLS = new Set(["bash", "pwsh"]);

export interface ScopePolicyEnvironment {
	repositoryRoot: string;
	scopes: string[];
}

export class ScopeContainmentError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ScopeContainmentError";
	}
}

function portablePath(value: string): string {
	return value.replaceAll("\\", "/");
}

function isAbsolutePortable(value: string): boolean {
	return path.posix.isAbsolute(value) || /^[A-Za-z]:\//.test(value);
}

function errorCode(error: unknown): string | undefined {
	return error && typeof error === "object" && "code" in error
		? (error as NodeJS.ErrnoException).code
		: undefined;
}

function normalizeLexicalScope(scope: string): string {
	const portable = portablePath(scope.trim());
	if (!portable) throw new ScopeContainmentError("Modification scope must not be empty.");
	if (isAbsolutePortable(portable))
		throw new ScopeContainmentError(
			`Modification scope must be repository-relative: ${scope}`,
		);
	const candidate = path.posix.normalize(portable).replace(/^\.\//, "");
	if (
		candidate === "." ||
		candidate === ".." ||
		candidate.startsWith("../")
	)
		throw new ScopeContainmentError(
			`Modification scope must stay inside the repository: ${scope}`,
		);
	return candidate.replace(/\/$/, "");
}

export function canonicalizeRepositoryRoot(repositoryRoot: string): string {
	const absoluteRoot = path.resolve(repositoryRoot);
	let canonicalRoot: string;
	try {
		canonicalRoot = fs.realpathSync.native(absoluteRoot);
	} catch (error) {
		throw new ScopeContainmentError(
			`Repository root cannot be canonicalized: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
	try {
		if (!fs.statSync(canonicalRoot).isDirectory())
			throw new ScopeContainmentError("Repository root must be a directory.");
	} catch (error) {
		if (error instanceof ScopeContainmentError) throw error;
		throw new ScopeContainmentError(
			`Repository root cannot be inspected: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
	return canonicalRoot;
}

function canonicalizeWithNearestExistingAncestor(target: string): string {
	const missing: string[] = [];
	let candidate = path.resolve(target);
	while (true) {
		try {
			const canonicalAncestor = fs.realpathSync.native(candidate);
			if (missing.length > 0 && !fs.statSync(canonicalAncestor).isDirectory()) {
				throw new ScopeContainmentError(
					"The nearest existing path ancestor is not a directory.",
				);
			}
			return path.resolve(canonicalAncestor, ...missing);
		} catch (error) {
			if (error instanceof ScopeContainmentError) throw error;
			if (errorCode(error) !== "ENOENT") {
				throw new ScopeContainmentError(
					`Path cannot be canonicalized: ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
			}
			const parent = path.dirname(candidate);
			if (parent === candidate)
				throw new ScopeContainmentError("Path has no existing ancestor.");
			missing.unshift(path.basename(candidate));
			candidate = parent;
		}
	}
}

function isInsideRepository(
	canonicalPath: string,
	canonicalRepositoryRoot: string,
): boolean {
	const relative = portablePath(
		path.relative(canonicalRepositoryRoot, canonicalPath),
	);
	return !(
		isAbsolutePortable(relative) ||
		relative === ".." ||
		relative.startsWith("../")
	);
}

function repositoryRelativePath(
	canonicalPath: string,
	canonicalRepositoryRoot: string,
): string {
	const relative = portablePath(
		path.relative(canonicalRepositoryRoot, canonicalPath),
	);
	if (!relative || relative === ".")
		throw new ScopeContainmentError(
			"Modification scope must not be the repository root.",
		);
	return relative;
}

export function normalizeRepositoryScopes(
	scopes: readonly string[],
	repositoryRoot?: string,
): string[] {
	const lexicalScopes = scopes.map(normalizeLexicalScope);
	if (repositoryRoot === undefined)
		return [...new Set(lexicalScopes)].sort();

	const canonicalRoot = canonicalizeRepositoryRoot(repositoryRoot);
	const normalized = new Set<string>();
	for (const scope of lexicalScopes) {
		const canonicalScope = canonicalizeWithNearestExistingAncestor(
			path.resolve(canonicalRoot, scope),
		);
		if (!isInsideRepository(canonicalScope, canonicalRoot)) {
			throw new ScopeContainmentError(
				`Modification scope escapes the repository through a symlink or junction: ${scope} (repository root: ${canonicalRoot}; supplied scope: ${scope}; resolved target: ${canonicalScope})`,
			);
		}
		normalized.add(repositoryRelativePath(canonicalScope, canonicalRoot));
	}
	return [...normalized].sort();
}

function canonicalizePolicy(policy: ScopePolicyEnvironment): ScopePolicyEnvironment {
	const repositoryRoot = canonicalizeRepositoryRoot(policy.repositoryRoot);
	return {
		repositoryRoot,
		scopes: normalizeRepositoryScopes(policy.scopes, repositoryRoot),
	};
}

export function encodeScopePolicyEnvironment(
	policy: ScopePolicyEnvironment,
): string {
	return JSON.stringify(canonicalizePolicy(policy));
}

export function decodeScopePolicyEnvironment(
	value: string | undefined,
): ScopePolicyEnvironment | undefined {
	if (!value) return undefined;
	let decoded: unknown;
	try {
		decoded = JSON.parse(value);
	} catch {
		throw new ScopeContainmentError("Invalid PI_SUBAGENT_SCOPE_POLICY JSON.");
	}
	if (!decoded || typeof decoded !== "object")
		throw new ScopeContainmentError("Invalid PI_SUBAGENT_SCOPE_POLICY payload.");
	const candidate = decoded as Record<string, unknown>;
	if (
		typeof candidate.repositoryRoot !== "string" ||
		!Array.isArray(candidate.scopes) ||
		!candidate.scopes.every((scope) => typeof scope === "string")
	)
		throw new ScopeContainmentError("Invalid PI_SUBAGENT_SCOPE_POLICY payload.");
	return canonicalizePolicy({
		repositoryRoot: candidate.repositoryRoot,
		scopes: candidate.scopes,
	});
}

export function collectDirectMutationPaths(
	toolName: string,
	input: unknown,
): string[] {
	if (!DIRECT_FILE_MUTATION_TOOLS.has(toolName)) return [];
	if (!input || typeof input !== "object") return [];
	const candidate = input as Record<string, unknown>;
	const paths: string[] = [];
	if (typeof candidate.path === "string") paths.push(candidate.path);
	if (Array.isArray(candidate.paths)) {
		for (const value of candidate.paths) {
			if (typeof value === "string") paths.push(value);
		}
	}
	return paths;
}

function isPathInsideScope(
	canonicalPath: string,
	policy: ScopePolicyEnvironment,
): boolean {
	const relative = portablePath(
		path.relative(policy.repositoryRoot, canonicalPath),
	);
	if (
		!relative ||
		isAbsolutePortable(relative) ||
		relative === ".." ||
		relative.startsWith("../")
	)
		return false;
	return policy.scopes.some(
		(scope) => relative === scope || relative.startsWith(`${scope}/`),
	);
}

export function directMutationViolation(
	toolName: string,
	input: unknown,
	cwd: string,
	policy: ScopePolicyEnvironment,
): string | undefined {
	const targets = collectDirectMutationPaths(toolName, input);
	if (targets.length === 0) return undefined;
	let canonicalPolicy: ScopePolicyEnvironment;
	try {
		canonicalPolicy = canonicalizePolicy(policy);
	} catch (error) {
		return `Direct file mutation scope cannot be canonicalized: ${
			error instanceof Error ? error.message : String(error)
		}`;
	}
	for (const target of targets) {
		const normalizedTarget = target.startsWith("@") ? target.slice(1) : target;
		let canonicalTarget: string;
		try {
			canonicalTarget = canonicalizeWithNearestExistingAncestor(
				path.resolve(cwd, normalizedTarget),
			);
		} catch (error) {
			return `Direct file mutation target cannot be canonicalized: ${
				error instanceof Error ? error.message : String(error)
			} (repository root: ${canonicalPolicy.repositoryRoot}; supplied scope: ${policy.scopes.join(", ")}; resolved target: <unresolved>)`;
		}
		if (
			!isInsideRepository(canonicalTarget, canonicalPolicy.repositoryRoot) ||
			!isPathInsideScope(canonicalTarget, canonicalPolicy)
		)
			return `Direct file mutation is outside the assigned scope: ${target} (repository root: ${canonicalPolicy.repositoryRoot}; supplied scope: ${policy.scopes.join(", ")}; resolved target: ${canonicalTarget})`;
	}
	return undefined;
}

export function toolsForScopedModifier(tools: readonly string[]): string[] {
	return tools.filter((tool) => !COMMAND_MUTATION_TOOLS.has(tool));
}

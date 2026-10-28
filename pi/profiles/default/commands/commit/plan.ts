import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { normalizeRepositoryId } from "../../lib/path-identity.ts";

export interface StatusEntry { xy: string; path: string; source?: string }
export interface CommitPlan {
	repo: string;
	commits: Array<{ subject: string; paths: string[] }>;
	exclusions: Array<{ path: string; reason: string }>;
}
export type PlanValidation = { ok: true; plan: CommitPlan } | { ok: false; errors: string[] };
export interface PlanExecutionResult {
	ok: boolean;
	commits: Array<{ hash: string; subject: string; paths: string[] }>;
	remaining: StatusEntry[];
	error?: string;
}

/** Porcelain v1 -z puts the destination before the unprefixed rename source. */
export function parseCommitStatus(status: string): StatusEntry[] {
	const records = status.split("\0");
	const entries: StatusEntry[] = [];
	for (let i = 0; i < records.length; i++) {
		const record = records[i];
		if (!record) continue;
		if (record.length < 4 || record[2] !== " ") throw new Error("Malformed Git status record.");
		const entry: StatusEntry = { xy: record.slice(0, 2), path: record.slice(3) };
		if (/[RC]/.test(entry.xy)) {
			const source = records[++i];
			if (!source) throw new Error("Missing Git rename/copy source.");
			entry.source = source;
		}
		entries.push(entry);
	}
	return entries;
}

function object(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validPath(value: unknown): value is string {
	if (typeof value !== "string" || !value || value.includes("\0") || /^[\\/]/.test(value) || /^[A-Za-z]:/.test(value)) return false;
	const parts = value.split(process.platform === "win32" ? /[\\/]/ : /\//);
	return !parts.some(part => part === ".." || part === "." || part === "");
}

/** Validate the entire proposal before touching the index. Paths must match Git, not shell spelling. */
export function validateCommitPlan(input: unknown, status: string, expectedRepo = "."): PlanValidation {
	const errors: string[] = [];
	let entries: StatusEntry[];
	try { entries = parseCommitStatus(status); }
	catch (error) { return { ok: false, errors: [String(error)] }; }
	if (!object(input)) return { ok: false, errors: ["Commit plan must be an object."] };
	if (typeof input.repo !== "string" || normalizeRepositoryId(input.repo) !== normalizeRepositoryId(expectedRepo))
		errors.push(`Repository must be ${JSON.stringify(expectedRepo)}.`);
	const known = new Set(entries.flatMap(entry => entry.source ? [entry.path, entry.source] : [entry.path]));
	const assigned = new Map<string, string>();
	const assign = (value: unknown, group: string): value is string => {
		if (!validPath(value)) { errors.push(`Invalid repository-relative path: ${JSON.stringify(value)}.`); return false; }
		if (!known.has(value)) errors.push(`Unknown path: ${JSON.stringify(value)}.`);
		if (assigned.has(value)) errors.push(`Duplicate path: ${JSON.stringify(value)}.`);
		else assigned.set(value, group);
		return true;
	};
	const plan: CommitPlan = { repo: normalizeRepositoryId(expectedRepo), commits: [], exclusions: [] };
	if (!Array.isArray(input.commits)) errors.push("commits must be an array.");
	else input.commits.forEach((commit: unknown, i: number) => {
		if (!object(commit)) { errors.push(`Commit ${i + 1} must be an object.`); return; }
		const subject = commit.subject;
		if (typeof subject !== "string" || !subject || subject.trim() !== subject || /[\r\n\0]/.test(subject))
			errors.push(`Commit ${i + 1} subject must be non-empty, trimmed, and single-line.`);
		const paths: string[] = [];
		if (!Array.isArray(commit.paths) || !commit.paths.length) errors.push(`Commit ${i + 1} must have non-empty paths.`);
		else for (const value of commit.paths) if (assign(value, `commit ${i + 1}`)) paths.push(value);
		if (typeof subject === "string") plan.commits.push({ subject, paths });
	});
	if (!Array.isArray(input.exclusions)) errors.push("exclusions must be an array.");
	else for (const exclusion of input.exclusions) {
		if (!object(exclusion)) { errors.push("Each exclusion must be an object."); continue; }
		const reason = exclusion.reason;
		if (typeof reason !== "string" || !reason.trim()) errors.push(`Exclusion ${JSON.stringify(exclusion.path)} needs a non-empty reason.`);
		if (assign(exclusion.path, "excluded") && typeof reason === "string") plan.exclusions.push({ path: exclusion.path, reason: reason.trim() });
	}
	for (const path of known) if (!assigned.has(path)) errors.push(`Missing path: ${JSON.stringify(path)}.`);
	for (const entry of entries) {
		if (entry.source && assigned.has(entry.path) && assigned.has(entry.source) && assigned.get(entry.path) !== assigned.get(entry.source))
			errors.push(`Rename/copy paths must stay in the same commit or both be excluded: ${JSON.stringify(entry.source)}, ${JSON.stringify(entry.path)}.`);
		if (/U|AA|DD/.test(entry.xy)) errors.push(`Unresolved conflict: ${JSON.stringify(entry.path)}.`);
	}
	return errors.length ? { ok: false, errors } : { ok: true, plan };
}

const STATUS_ARGS = ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignore-submodules=dirty"];
const nulPaths = (output: string) => output.split("\0").filter(Boolean);
const samePaths = (left: string[], right: string[]) => {
	const sorted = [...right].sort();
	return left.length === right.length && [...left].sort().every((value, index) => value === sorted[index]);
};

/** Execute only reviewed index contents. No worktree writes, hook bypass, or mutation retries. */
export async function executeCommitPlan(exec: ExtensionAPI["exec"], repository: string, signal: AbortSignal | undefined, plan: CommitPlan): Promise<PlanExecutionResult> {
	const result: PlanExecutionResult = { ok: false, commits: [], remaining: [] };
	const git = async (args: string[], observe = false): Promise<string> => {
		const requestSignal = observe ? undefined : signal;
		requestSignal?.throwIfAborted();
		const output = await exec("git", ["-C", repository, ...args], { signal: requestSignal, timeout: 15_000 });
		if (output.killed || output.code !== 0) throw new Error(`Git ${args[0]} failed: ${output.killed ? "cancelled or timed out" : output.stderr.trim()}`);
		return output.stdout;
	};
	const head = async (observe = false): Promise<string> => {
		const requestSignal = observe ? undefined : signal;
		requestSignal?.throwIfAborted();
		const output = await exec("git", ["-C", repository, "rev-parse", "--verify", "--quiet", "HEAD"], { signal: requestSignal, timeout: 15_000 });
		if (!output.killed && output.code === 1) return "";
		if (output.killed || output.code !== 0) throw new Error(`Git HEAD lookup failed: ${output.stderr.trim()}`);
		return output.stdout.trim();
	};
	try {
		const validation = validateCommitPlan(plan, await git(STATUS_ARGS), plan.repo);
		if (!validation.ok) throw new Error(validation.errors.join("\n"));
		// Save the reviewed index tree before any reset. Restaging from the worktree
		// could silently include a hook's edits or overwrite index-only contents.
		const tree = (await git(["write-tree"])).trim();
		let before = await head();
		const resetIndex = async () => { await git(before ? ["read-tree", before] : ["read-tree", "--empty"]); };
		if (!plan.commits.length) await resetIndex();
		for (const group of plan.commits) {
			await resetIndex();
			await git(["--literal-pathspecs", "restore", "--source", tree, "--staged", "--", ...group.paths]);
			const staged = nulPaths(await git(["diff", "--cached", "--no-renames", "--name-only", "-z"]));
			if (!samePaths(staged, group.paths)) throw new Error(`Staged paths do not match reviewed group ${JSON.stringify(group.subject)}: ${JSON.stringify(staged)}.`);
			// Even a failing post-commit command can leave a new HEAD. Observe it
			// below rather than assuming the process result describes actual Git state.
			let commitError: unknown;
			try { await git(["commit", "-m", group.subject]); } catch (error) { commitError = error; }
			const after = await head(true);
			if (after && after !== before) {
				const paths = nulPaths(await git(["diff-tree", "--root", "--no-commit-id", "--no-renames", "--name-only", "-r", "-z", after], true));
				const subject = (await git(["log", "-1", "--format=%s", after], true)).trimEnd();
				result.commits.push({ hash: after, subject, paths });
				if (!samePaths(paths, group.paths)) throw new Error(`Commit ${after} paths differ from reviewed group: ${JSON.stringify(paths)}.`);
			} else if (!commitError) throw new Error(`HEAD did not advance for ${JSON.stringify(group.subject)}.`);
			if (commitError) throw commitError;
			before = after;
		}
		signal?.throwIfAborted();
	} catch (error) { result.error = error instanceof Error ? error.message : String(error); }
	// Cancellation must not hide commits/status already produced by Git.
	try {
		const output = await exec("git", ["-C", repository, ...STATUS_ARGS], { timeout: 15_000 });
		if (output.killed || output.code !== 0) throw new Error(output.stderr.trim() || "Git status failed.");
		result.remaining = parseCommitStatus(output.stdout);
		const excluded = new Set(plan.exclusions.map(entry => entry.path));
		const unfinished = result.remaining.filter(entry => {
			const staged = entry.xy !== "??" && entry.xy[0] !== " ";
			return staged || !excluded.has(entry.path) || (entry.source !== undefined && !excluded.has(entry.source));
		});
		if (unfinished.length) result.error = [result.error, `Unfinished eligible changes: ${unfinished.map(entry => `${entry.xy} ${JSON.stringify(entry.path)}`).join(", ")}.`].filter(Boolean).join("\n");
	} catch (error) { result.error = [result.error, `Status reporting failed: ${String(error)}`].filter(Boolean).join("\n"); }
	result.ok = !result.error;
	return result;
}

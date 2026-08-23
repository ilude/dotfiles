import * as fs from "node:fs";
import * as path from "node:path";

const OWNERSHIP_VERSION = 1;

export type WorkflowOwner = "plan-it" | "do-it" | "goal";
export type WorkflowWorktreeState = "active" | "complete";

export interface WorkflowWorktreeOwnership {
	version: 1;
	workflow: WorkflowOwner;
	workflowId: string;
	repoRoot: string;
	primaryWorktree: string;
	primaryBranch: string;
	initialPrimaryHead: string;
	branch: string;
	worktree: string;
	createdAt: string;
	updatedAt: string;
	state: WorkflowWorktreeState;
	mergedHead?: string;
}

export interface WorkflowWorktree {
	ownership: WorkflowWorktreeOwnership;
	resumed: boolean;
}

export interface WorkflowGitResult {
	code: number;
	stdout: string;
	stderr: string;
}

export type WorkflowGitRunner = (cwd: string, args: string[]) => Promise<WorkflowGitResult>;

function normalize(value: string): string {
	return path.resolve(value);
}

function safeSlug(value: string): string {
	const slug = value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[._-]+|[._-]+$/g, "").slice(0, 70);
	return slug || "workflow";
}

function assertSafeSlug(slug: string): string {
	const normalized = safeSlug(slug);
	if (normalized !== slug || slug === "." || slug === "..")
		throw new Error("workflow slug must contain only lowercase letters, numbers, dots, underscores, or hyphens");
	return normalized;
}

function parseLine(result: WorkflowGitResult, label: string): string {
	if (result.code !== 0 || !result.stdout.trim())
		throw new Error(`${label}: ${(result.stderr || result.stdout).trim() || "git command failed"}`);
	return result.stdout.trim();
}

function ownershipPath(root: string, slug: string): string {
	return path.join(root, ".worktrees", `${slug}.workflow.json`);
}

function writeOwnership(filePath: string, ownership: WorkflowWorktreeOwnership): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	const temporary = `${filePath}.tmp-${process.pid}`;
	fs.writeFileSync(temporary, `${JSON.stringify(ownership, null, 2)}\n`, "utf8");
	fs.renameSync(temporary, filePath);
}

function readOwnership(filePath: string): WorkflowWorktreeOwnership | undefined {
	if (!fs.existsSync(filePath)) return undefined;
	const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<WorkflowWorktreeOwnership>;
	if (parsed.version !== OWNERSHIP_VERSION || !["plan-it", "do-it", "goal"].includes(parsed.workflow ?? "") || typeof parsed.workflowId !== "string" || typeof parsed.repoRoot !== "string" || typeof parsed.primaryWorktree !== "string" || typeof parsed.primaryBranch !== "string" || typeof parsed.initialPrimaryHead !== "string" || typeof parsed.branch !== "string" || typeof parsed.worktree !== "string" || (parsed.state !== "active" && parsed.state !== "complete"))
		throw new Error(`Invalid workflow ownership record: ${filePath}`);
	return parsed as WorkflowWorktreeOwnership;
}

async function repoRoot(cwd: string, git: WorkflowGitRunner): Promise<string> {
	const commonDir = path.resolve(cwd, parseLine(await git(cwd, ["rev-parse", "--git-common-dir"]), "resolve common Git directory"));
	if (path.basename(commonDir) !== ".git") throw new Error("workflow worktrees require a non-bare Git repository");
	return normalize(path.dirname(commonDir));
}

function ownershipRoot(location: string): string {
	const normalized = normalize(location);
	const parent = path.dirname(normalized);
	return path.basename(parent) === ".worktrees" ? path.dirname(parent) : normalized;
}

export function readWorkflowOwnershipRecord(location: string, slug: string): WorkflowWorktreeOwnership | undefined {
	return readOwnership(ownershipPath(ownershipRoot(location), assertSafeSlug(slug)));
}

export function readWorkflowOwnershipForWorktree(location: string): WorkflowWorktreeOwnership | undefined {
	const normalized = normalize(location);
	const parent = path.dirname(normalized);
	if (path.basename(parent) !== ".worktrees") return undefined;
	return readWorkflowOwnershipRecord(normalized, path.basename(normalized));
}

export interface ListedWorktree {
	path: string;
	branch?: string;
}

export function parseWorktreeListPorcelain(output: string): ListedWorktree[] {
	const records: ListedWorktree[] = [];
	let current: ListedWorktree | undefined;
	for (const line of output.split(/\r?\n/)) {
		if (!line) {
			if (current) records.push(current);
			current = undefined;
			continue;
		}
		if (line.startsWith("worktree ")) {
			if (current) records.push(current);
			current = { path: normalize(line.slice("worktree ".length)) };
		} else if (current && line.startsWith("branch ")) {
			const ref = line.slice("branch ".length);
			current.branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
		}
	}
	if (current) records.push(current);
	return records;
}

async function listWorktrees(root: string, git: WorkflowGitRunner): Promise<ListedWorktree[]> {
	const result = await git(root, ["worktree", "list", "--porcelain"]);
	if (result.code !== 0) throw new Error(`list Git worktrees: ${result.stderr.trim() || result.stdout.trim()}`);
	return parseWorktreeListPorcelain(result.stdout);
}

async function primaryState(root: string, git: WorkflowGitRunner): Promise<{ worktree: string; branch: string; head: string }> {
	const commonDir = path.resolve(root, parseLine(await git(root, ["rev-parse", "--git-common-dir"]), "resolve common Git directory"));
	const primaryCandidate = path.basename(commonDir) === ".git" ? path.dirname(commonDir) : undefined;
	const primary = (await listWorktrees(root, git)).find((entry) => primaryCandidate && normalize(entry.path) === normalize(primaryCandidate));
	if (!primary?.branch) throw new Error("could not identify the primary worktree and checked-out branch");
	const status = await git(primary.path, ["status", "--porcelain=v1"]);
	if (status.code !== 0) throw new Error(`inspect primary worktree: ${status.stderr.trim()}`);
	if (status.stdout.trim()) throw new Error("primary worktree is dirty; clean it before creating or merging a workflow worktree");
	const unmerged = await git(primary.path, ["diff", "--name-only", "--diff-filter=U"]);
	if (unmerged.code !== 0) throw new Error(`inspect unmerged paths: ${unmerged.stderr.trim()}`);
	if (unmerged.stdout.trim()) throw new Error("primary worktree has unmerged paths");
	const head = parseLine(await git(primary.path, ["rev-parse", "HEAD"]), "resolve primary HEAD");
	return { worktree: primary.path, branch: primary.branch, head };
}

function assertOwned(ownership: WorkflowWorktreeOwnership, root: string, workflow: WorkflowOwner, workflowId: string): void {
	if (ownership.repoRoot !== root) throw new Error("workflow ownership belongs to another repository");
	if (ownership.workflow !== workflow && !(ownership.workflow === "plan-it" && (workflow === "do-it" || workflow === "goal")))
		throw new Error("workflow worktree is owned by another workflow invocation");
	if (normalize(ownership.worktree) !== normalize(path.join(root, ".worktrees", path.basename(ownership.worktree))))
		throw new Error("workflow worktree is outside repository-root .worktrees");
	if (ownership.workflow === workflow && ownership.workflowId !== workflowId)
		throw new Error("workflow worktree is owned by another invocation");
}

export async function ensureWorkflowWorktree(input: { cwd: string; workflow: WorkflowOwner; workflowId: string; slug: string; runner: WorkflowGitRunner }): Promise<WorkflowWorktree> {
	const root = await repoRoot(input.cwd, input.runner);
	const slug = assertSafeSlug(input.slug);
	const metadataPath = ownershipPath(root, slug);
	const existing = readOwnership(metadataPath);
	if (existing) {
		assertOwned(existing, root, input.workflow, input.workflowId);
		if (!fs.existsSync(existing.worktree)) throw new Error("owned workflow worktree is missing; preserve the ownership record for recovery");
		const listed = await listWorktrees(root, input.runner);
		if (!listed.some((entry) => normalize(entry.path) === normalize(existing.worktree))) throw new Error("owned workflow worktree is not registered with Git");
		const transferred = existing.workflow === input.workflow && existing.workflowId === input.workflowId ? existing : { ...existing, workflow: input.workflow, workflowId: input.workflowId, updatedAt: new Date().toISOString() };
		if (transferred !== existing) writeOwnership(metadataPath, transferred);
		return { ownership: transferred, resumed: true };
	}
	const primary = await primaryState(root, input.runner);
	const worktree = path.join(root, ".worktrees", slug);
	const branch = `workflow/${slug}`;
	if (fs.existsSync(worktree)) throw new Error(`workflow worktree path already exists: ${worktree}`);
	const added = await input.runner(primary.worktree, ["worktree", "add", "-b", branch, worktree, primary.branch]);
	if (added.code !== 0) throw new Error(`create workflow worktree: ${added.stderr.trim() || added.stdout.trim()}`);
	const now = new Date().toISOString();
	const ownership: WorkflowWorktreeOwnership = { version: 1, workflow: input.workflow, workflowId: input.workflowId, repoRoot: root, primaryWorktree: primary.worktree, primaryBranch: primary.branch, initialPrimaryHead: primary.head, branch, worktree: normalize(worktree), createdAt: now, updatedAt: now, state: "active" };
	writeOwnership(metadataPath, ownership);
	return { ownership, resumed: false };
}

export async function closeWorkflowWorktree(input: { worktree: WorkflowWorktree; planPath?: string; archivePlan?: (cwd: string, planPath: string) => Promise<void> | void; runner: WorkflowGitRunner }): Promise<WorkflowWorktreeOwnership> {
	const ownership = input.worktree.ownership;
	if (ownership.state !== "active") throw new Error("workflow worktree is already complete");
	const worktreeStatus = await input.runner(ownership.worktree, ["status", "--porcelain=v1"]);
	if (worktreeStatus.code !== 0) throw new Error(`inspect workflow worktree: ${worktreeStatus.stderr.trim()}`);
	const unmerged = await input.runner(ownership.worktree, ["diff", "--name-only", "--diff-filter=U"]);
	if (unmerged.code !== 0 || unmerged.stdout.trim()) throw new Error("workflow worktree has unmerged paths; recovery worktree preserved");
	if (input.planPath) {
		if (!input.archivePlan) throw new Error("archivePlan is required for plan closeout");
		await input.archivePlan(ownership.worktree, input.planPath);
	}
	const finalStatus = await input.runner(ownership.worktree, ["status", "--porcelain=v1"]);
	if (finalStatus.code !== 0) throw new Error(`inspect workflow artifacts: ${finalStatus.stderr.trim()}`);
	if (finalStatus.stdout.trim()) {
		const checked = await input.runner(ownership.worktree, ["diff", "--check"]);
		if (checked.code !== 0) throw new Error(`workflow diff check failed: ${checked.stderr.trim() || checked.stdout.trim()}`);
		for (const args of [["add", "-A"], ["commit", "-m", `chore(workflow): close ${ownership.workflowId}`]] as string[][]) {
			const result = await input.runner(ownership.worktree, args);
			if (result.code !== 0) throw new Error(`${args[0]} workflow closeout: ${result.stderr.trim() || result.stdout.trim()}`);
		}
	}
	const primary = await primaryState(ownership.primaryWorktree, input.runner);
	if (primary.branch !== ownership.primaryBranch) throw new Error("primary branch changed; recovery worktree preserved");
	const merged = await input.runner(primary.worktree, ["merge", "--no-ff", ownership.branch, "-m", `Merge ${ownership.branch}`]);
	if (merged.code !== 0) throw new Error(`merge workflow branch failed; recovery worktree preserved: ${merged.stderr.trim() || merged.stdout.trim()}`);
	const ancestor = await input.runner(primary.worktree, ["merge-base", "--is-ancestor", ownership.branch, "HEAD"]);
	if (ancestor.code !== 0) throw new Error("merged HEAD does not contain the workflow branch; recovery worktree preserved");
	const mergedHead = parseLine(await input.runner(primary.worktree, ["rev-parse", "HEAD"]), "verify merged HEAD");
	const updated: WorkflowWorktreeOwnership = { ...ownership, updatedAt: new Date().toISOString(), state: "complete", mergedHead };
	writeOwnership(ownershipPath(ownership.repoRoot, path.basename(ownership.worktree)), updated);
	const removed = await input.runner(primary.worktree, ["worktree", "remove", ownership.worktree]);
	if (removed.code !== 0) throw new Error(`remove workflow worktree after merge: ${removed.stderr.trim()}`);
	const deleted = await input.runner(primary.worktree, ["branch", "-d", ownership.branch]);
	if (deleted.code !== 0) throw new Error(`remove workflow branch after merge: ${deleted.stderr.trim()}`);
	fs.unlinkSync(ownershipPath(ownership.repoRoot, path.basename(ownership.worktree)));
	return updated;
}

export function workflowSlugFromPlan(planPath: string): string {
	const match = planPath.replace(/\\/g, "/").match(/^\.specs\/([a-z0-9]+(?:-[a-z0-9]+)*)\/plan\.md$/);
	return match?.[1] ?? "workflow";
}

export function workflowSlugFromRequest(request: string): string {
	return safeSlug(request.trim()).replace(/[._]+/g, "-");
}

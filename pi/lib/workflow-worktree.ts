import * as fs from "node:fs";
import * as path from "node:path";
import { readLinkedPlan } from "./plan-state.js";

const OWNERSHIP_VERSION = 1;
const IN_PLACE_OWNERSHIP_VERSION = 1;

const inPlaceOwnershipPath = (root: string, slug: string): string =>
	path.join(root, ".worktrees", `${slug}.in-place.workflow.json`);

export type WorkflowOwner = "plan-it" | "do-it" | "goal";
export type WorkflowWorktreeState = "active" | "complete";
export type WorkflowCloseoutStage = "active" | "archived" | "committed" | "merged";

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
	// Optional for v1 records created before canonical plan ownership.
	planPath?: string;
	closeoutStage?: WorkflowCloseoutStage;
	mergedHead?: string;
}

export interface WorkflowWorktree {
	ownership: WorkflowWorktreeOwnership;
	resumed: boolean;
}

export interface InPlaceWorkflowOwnership {
	version: 1;
	workflow: "do-it";
	workflowId: string;
	repoRoot: string;
	worktree: string;
	branch: string;
	baselineHead: string;
	planPath?: string;
	createdAt: string;
	updatedAt: string;
	state: "active" | "complete";
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

function writeOwnership(filePath: string, ownership: object): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	const temporary = `${filePath}.tmp-${process.pid}`;
	fs.writeFileSync(temporary, `${JSON.stringify(ownership, null, 2)}\n`, "utf8");
	fs.renameSync(temporary, filePath);
}

function readOwnership(filePath: string): WorkflowWorktreeOwnership | undefined {
	if (!fs.existsSync(filePath)) return undefined;
	const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<WorkflowWorktreeOwnership>;
	if (parsed.version !== OWNERSHIP_VERSION || !["plan-it", "do-it", "goal"].includes(parsed.workflow ?? "") || typeof parsed.workflowId !== "string" || typeof parsed.repoRoot !== "string" || typeof parsed.primaryWorktree !== "string" || typeof parsed.primaryBranch !== "string" || typeof parsed.initialPrimaryHead !== "string" || typeof parsed.branch !== "string" || typeof parsed.worktree !== "string" || (parsed.state !== "active" && parsed.state !== "complete") || (parsed.planPath !== undefined && !/^\.specs\/[a-z0-9]+(?:-[a-z0-9]+)*\/plan\.md$/.test(parsed.planPath)) || (parsed.closeoutStage !== undefined && !["active", "archived", "committed", "merged"].includes(parsed.closeoutStage)))
		throw new Error(`Invalid workflow ownership record: ${filePath}`);
	return parsed as WorkflowWorktreeOwnership;
}

export async function resolveWorkflowRepoRoot(cwd: string, git: WorkflowGitRunner): Promise<string> {
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

function inPlaceOwnershipRoot(location: string, slug: string): string {
	let current = normalize(location);
	const safe = assertSafeSlug(slug);
	while (true) {
		if (fs.existsSync(inPlaceOwnershipPath(current, safe))) return current;
		const parent = path.dirname(current);
		if (parent === current) return normalize(location);
		current = parent;
	}
}

export function readInPlaceWorkflowOwnership(location: string, slug: string): InPlaceWorkflowOwnership | undefined {
	const root = inPlaceOwnershipRoot(location, slug);
	const filePath = inPlaceOwnershipPath(root, assertSafeSlug(slug));
	if (!fs.existsSync(filePath)) return undefined;
	const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<InPlaceWorkflowOwnership>;
	if (parsed.version !== IN_PLACE_OWNERSHIP_VERSION || parsed.workflow !== "do-it" || typeof parsed.workflowId !== "string" || typeof parsed.repoRoot !== "string" || typeof parsed.worktree !== "string" || typeof parsed.branch !== "string" || typeof parsed.baselineHead !== "string" || (parsed.planPath !== undefined && !/^\.specs\/[a-z0-9]+(?:-[a-z0-9]+)*\/plan\.md$/.test(parsed.planPath)) || (parsed.state !== "active" && parsed.state !== "complete"))
		throw new Error(`Invalid in-place workflow ownership record: ${filePath}`);
	return parsed as InPlaceWorkflowOwnership;
}

export function readActiveInPlaceWorkflowOwnership(location: string): InPlaceWorkflowOwnership | undefined {
	const root = normalize(location);
	const directory = path.join(root, ".worktrees");
	if (!fs.existsSync(directory)) return undefined;
	const matches = fs.readdirSync(directory).filter((name) => name.endsWith(".in-place.workflow.json"));
	const active = matches.map((name) => readInPlaceWorkflowOwnership(root, name.slice(0, -".in-place.workflow.json".length))).filter((record): record is InPlaceWorkflowOwnership => Boolean(record && record.state === "active"));
	if (active.length > 1) throw new Error("multiple active in-place workflow ownership records exist");
	return active[0];
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

function hasBlockingPrimaryChanges(status: string, allowUntrackedCanonicalPlans: boolean): boolean {
	return status.split(/\r?\n/).filter(Boolean).some((line) =>
		!allowUntrackedCanonicalPlans || !/^\?\? \.specs\/[^/]+\/plan\.md$/.test(line),
	);
}

async function primaryState(root: string, git: WorkflowGitRunner, requireClean = true, allowUntrackedCanonicalPlans = false): Promise<{ worktree: string; branch: string; head: string }> {
	const commonDir = path.resolve(root, parseLine(await git(root, ["rev-parse", "--git-common-dir"]), "resolve common Git directory"));
	const primaryCandidate = path.basename(commonDir) === ".git" ? path.dirname(commonDir) : undefined;
	const primary = (await listWorktrees(root, git)).find((entry) => primaryCandidate && normalize(entry.path) === normalize(primaryCandidate));
	if (!primary?.branch) throw new Error("could not identify the primary worktree and checked-out branch");
	const status = await git(primary.path, ["status", "--porcelain=v1", "--untracked-files=all"]);
	if (status.code !== 0) throw new Error(`inspect primary worktree: ${status.stderr.trim()}`);
	if (requireClean && hasBlockingPrimaryChanges(status.stdout, allowUntrackedCanonicalPlans)) throw new Error("primary worktree is dirty; clean it before creating or merging a workflow worktree");
	const unmerged = await git(primary.path, ["diff", "--name-only", "--diff-filter=U"]);
	if (unmerged.code !== 0) throw new Error(`inspect unmerged paths: ${unmerged.stderr.trim()}`);
	if (unmerged.stdout.trim()) throw new Error("primary worktree has unmerged paths");
	const head = parseLine(await git(primary.path, ["rev-parse", "HEAD"]), "resolve primary HEAD");
	return { worktree: primary.path, branch: primary.branch, head };
}

function assertOwned(ownership: WorkflowWorktreeOwnership, root: string, workflow: WorkflowOwner, workflowId: string, planPath?: string): void {
	if (ownership.repoRoot !== root) throw new Error("workflow ownership belongs to another repository");
	if (ownership.workflow !== workflow && !(ownership.workflow === "plan-it" && (workflow === "do-it" || workflow === "goal")))
		throw new Error("workflow worktree is owned by another workflow invocation");
	if (normalize(ownership.worktree) !== normalize(path.join(root, ".worktrees", path.basename(ownership.worktree))))
		throw new Error("workflow worktree is outside repository-root .worktrees");
	if (ownership.workflow === workflow && ownership.workflowId !== workflowId)
		throw new Error("workflow worktree is owned by another invocation");
	if (ownership.planPath && planPath && ownership.planPath !== planPath)
		throw new Error("workflow ownership plan path does not match the requested canonical plan");
}

export async function ensureInPlaceWorkflow(input: { cwd: string; workflowId: string; slug: string; planPath?: string; runner: WorkflowGitRunner }): Promise<{ ownership: InPlaceWorkflowOwnership; resumed: boolean }> {
	const worktree = normalize(parseLine(await input.runner(input.cwd, ["rev-parse", "--show-toplevel"]), "resolve invoking worktree"));
	const root = worktree;
	const branch = parseLine(await input.runner(worktree, ["branch", "--show-current"]), "resolve invoking branch");
	if (!branch) throw new Error("in-place execution requires a checked-out branch");
	const existing = readInPlaceWorkflowOwnership(root, input.slug);
	if (existing) {
		if (existing.state !== "active") throw new Error("in-place workflow is already complete");
		if (existing.repoRoot !== root || existing.worktree !== worktree || existing.branch !== branch || existing.workflowId !== input.workflowId || existing.planPath !== input.planPath)
			throw new Error("in-place workflow ownership does not match the invoking worktree, branch, or plan");
		return { ownership: existing, resumed: true };
	}
	const status = await input.runner(worktree, ["status", "--porcelain=v1", "--untracked-files=all"]);
	if (status.code !== 0) throw new Error(`inspect invoking worktree: ${status.stderr.trim() || status.stdout.trim()}`);
	const allowed = input.planPath ? new Set([`?? ${input.planPath}`, ` M ${input.planPath}`, `M  ${input.planPath}`, `MM ${input.planPath}`]) : new Set<string>();
	if (status.stdout.split(/\r?\n/).filter(Boolean).some((entry) => !allowed.has(entry)) || (!input.planPath && status.stdout.trim()))
		throw new Error("in-place execution requires a clean invoking worktree, except for the exact canonical plan");
	const baselineHead = parseLine(await input.runner(worktree, ["rev-parse", "HEAD"]), "resolve in-place baseline");
	const now = new Date().toISOString();
	const ownership: InPlaceWorkflowOwnership = { version: 1, workflow: "do-it", workflowId: input.workflowId, repoRoot: root, worktree, branch, baselineHead, ...(input.planPath ? { planPath: input.planPath } : {}), createdAt: now, updatedAt: now, state: "active" };
	writeOwnership(inPlaceOwnershipPath(root, assertSafeSlug(input.slug)), ownership);
	return { ownership, resumed: false };
}

export async function verifyInPlaceWorkflow(input: { ownership: InPlaceWorkflowOwnership; cwd: string; planPath?: string; runner: WorkflowGitRunner }): Promise<InPlaceWorkflowOwnership> {
	const ownership = input.ownership;
	const worktree = normalize(parseLine(await input.runner(input.cwd, ["rev-parse", "--show-toplevel"]), "resolve invoking worktree"));
	const branch = parseLine(await input.runner(worktree, ["branch", "--show-current"]), "resolve invoking branch");
	if (ownership.state !== "active") throw new Error("in-place workflow is already complete");
	if (worktree !== ownership.worktree || branch !== ownership.branch || (input.planPath ?? ownership.planPath) !== ownership.planPath)
		throw new Error("in-place workflow verifier requires the original worktree, branch, and plan");
	const descendant = await input.runner(worktree, ["merge-base", "--is-ancestor", ownership.baselineHead, "HEAD"]);
	if (descendant.code !== 0) throw new Error("in-place workflow HEAD is not a descendant of its baseline");
	if (ownership.baselineHead === parseLine(await input.runner(worktree, ["rev-parse", "HEAD"]), "resolve in-place HEAD"))
		throw new Error("in-place workflow has no commit beyond its baseline");
	const status = await input.runner(worktree, ["status", "--porcelain=v1", "--untracked-files=all"]);
	if (status.code !== 0 || status.stdout.trim()) throw new Error("in-place workflow worktree is not clean");
	if (ownership.planPath) {
		const slug = workflowSlugFromPlan(ownership.planPath);
		const archived = path.join(worktree, ".specs", "archive", slug, "plan.md");
		if (!fs.existsSync(archived) || fs.existsSync(path.join(worktree, ownership.planPath))) throw new Error("completed plan was not archived in the invoking worktree");
		if (!readLinkedPlan(archived).complete) throw new Error("archived plan is not complete");
	}
	const completed = { ...ownership, state: "complete" as const, updatedAt: new Date().toISOString() };
	const slug = ownership.planPath ? workflowSlugFromPlan(ownership.planPath) : workflowSlugFromRequest(ownership.workflowId.replace(/^do-it:/, ""));
	writeOwnership(inPlaceOwnershipPath(ownership.repoRoot, slug), completed);
	return completed;
}

export async function ensureWorkflowWorktree(input: { cwd: string; workflow: WorkflowOwner; workflowId: string; slug: string; planPath?: string; runner: WorkflowGitRunner; allowDirtyPrimary?: boolean }): Promise<WorkflowWorktree> {
	const root = await resolveWorkflowRepoRoot(input.cwd, input.runner);
	const slug = assertSafeSlug(input.slug);
	const metadataPath = ownershipPath(root, slug);
	const existing = readOwnership(metadataPath);
	if (existing) {
		assertOwned(existing, root, input.workflow, input.workflowId, input.planPath);
		if (!fs.existsSync(existing.worktree)) throw new Error("owned workflow worktree is missing; preserve the ownership record for recovery");
		const listed = await listWorktrees(root, input.runner);
		if (!listed.some((entry) => normalize(entry.path) === normalize(existing.worktree))) throw new Error("owned workflow worktree is not registered with Git");
		const transferred = existing.workflow === input.workflow && existing.workflowId === input.workflowId && (!input.planPath || existing.planPath === input.planPath)
			? existing
			: { ...existing, workflow: input.workflow, workflowId: input.workflowId, ...(input.planPath ? { planPath: input.planPath } : {}), updatedAt: new Date().toISOString() };
		if (transferred !== existing) writeOwnership(metadataPath, transferred);
		return { ownership: transferred, resumed: true };
	}
	const primary = await primaryState(root, input.runner, input.workflow !== "plan-it" && !input.allowDirtyPrimary);
	const worktree = path.join(root, ".worktrees", slug);
	const branch = `workflow/${slug}`;
	if (fs.existsSync(worktree)) throw new Error(`workflow worktree path already exists: ${worktree}`);
	const added = await input.runner(primary.worktree, ["worktree", "add", "-b", branch, worktree, primary.branch]);
	if (added.code !== 0) throw new Error(`create workflow worktree: ${added.stderr.trim() || added.stdout.trim()}`);
	const now = new Date().toISOString();
	const ownership: WorkflowWorktreeOwnership = { version: 1, workflow: input.workflow, workflowId: input.workflowId, repoRoot: root, primaryWorktree: primary.worktree, primaryBranch: primary.branch, initialPrimaryHead: primary.head, branch, worktree: normalize(worktree), createdAt: now, updatedAt: now, state: "active", ...(input.planPath ? { planPath: input.planPath } : {}) };
	writeOwnership(metadataPath, ownership);
	return { ownership, resumed: false };
}

export type PlanMaterialization = "transferred" | "ignored" | "tracked" | "updated" | "resumed";

export async function materializePlanInWorkflowWorktree(input: {
	worktree: WorkflowWorktree;
	planPath: string;
	runner: WorkflowGitRunner;
}): Promise<PlanMaterialization> {
	const planPath = input.planPath.replace(/^@/, "").replace(/\\/g, "/");
	const slug = workflowSlugFromPlan(planPath);
	if (slug === "workflow" || path.basename(input.worktree.ownership.worktree) !== slug)
		throw new Error("plan path does not match the owned workflow worktree");
	if (input.worktree.ownership.planPath && input.worktree.ownership.planPath !== planPath)
		throw new Error("plan path does not match the owned canonical plan");
	const relativeSpecDir = path.posix.dirname(planPath);
	const sourceDir = path.join(input.worktree.ownership.primaryWorktree, relativeSpecDir);
	const sourcePlan = path.join(input.worktree.ownership.primaryWorktree, planPath);
	const targetDir = path.join(input.worktree.ownership.worktree, relativeSpecDir);
	const targetPlan = path.join(input.worktree.ownership.worktree, planPath);
	if (!fs.existsSync(sourcePlan)) {
		if (fs.existsSync(targetPlan)) return "resumed";
		throw new Error(`canonical plan does not exist in the primary repository: ${input.planPath}`);
	}
	const ignored = await input.runner(input.worktree.ownership.primaryWorktree, [
		"check-ignore",
		"-q",
		"--",
		input.planPath,
	]);
	if (ignored.code === 0) {
		if (!fs.existsSync(targetPlan)) {
			fs.mkdirSync(path.dirname(targetDir), { recursive: true });
			fs.cpSync(sourceDir, targetDir, { recursive: true, errorOnExist: true, force: false });
		}
		if (fs.readFileSync(targetPlan, "utf8") !== fs.readFileSync(sourcePlan, "utf8"))
			throw new Error("copied ignored plan verification failed; primary spec preserved");
		return "ignored";
	}
	if (ignored.code !== 1)
		throw new Error(`inspect plan ignore policy: ${ignored.stderr.trim() || ignored.stdout.trim()}`);
	const status = await input.runner(input.worktree.ownership.primaryWorktree, [
		"status",
		"--porcelain=v1",
		"--",
		relativeSpecDir,
	]);
	if (status.code !== 0)
		throw new Error(`inspect canonical plan state: ${status.stderr.trim() || status.stdout.trim()}`);
	const entries = status.stdout.split(/\r?\n/).filter(Boolean);
	if (entries.length === 0) {
		if (!fs.existsSync(targetPlan))
			throw new Error("clean tracked plan is missing from the implementation worktree");
		return "tracked";
	}
	const normalizedPlanPath = planPath;
	const modifiedPlanOnly = entries.length === 1
		&& entries[0].startsWith("M ")
		&& entries[0].slice(2).replace(/\\/g, "/") === normalizedPlanPath;
	if (modifiedPlanOnly) {
		if (!fs.existsSync(targetPlan))
			throw new Error("modified tracked plan is missing from the implementation worktree");
		const committedPlan = fs.readFileSync(targetPlan);
		fs.copyFileSync(sourcePlan, targetPlan);
		if (fs.readFileSync(targetPlan, "utf8") !== fs.readFileSync(sourcePlan, "utf8"))
			throw new Error("modified tracked plan transfer verification failed; primary spec preserved");
		fs.writeFileSync(sourcePlan, committedPlan);
		const restored = await input.runner(input.worktree.ownership.primaryWorktree, [
			"status",
			"--porcelain=v1",
			"--",
			input.planPath,
		]);
		if (restored.code !== 0 || restored.stdout.trim())
			throw new Error("modified tracked plan transferred but primary plan cleanup failed");
		return "updated";
	}
	if (!entries.every((entry) => entry.startsWith("?? ")))
		throw new Error("canonical spec has unsupported tracked or mixed changes; commit or restore them before /do-it");
	fs.mkdirSync(path.dirname(targetDir), { recursive: true });
	fs.cpSync(sourceDir, targetDir, { recursive: true, errorOnExist: true, force: false });
	if (!fs.existsSync(targetPlan) || fs.readFileSync(targetPlan, "utf8") !== fs.readFileSync(sourcePlan, "utf8"))
		throw new Error("copied plan verification failed; primary spec preserved");
	fs.rmSync(sourceDir, { recursive: true });
	return "transferred";
}

function removeOwnedResidualWorktree(ownership: WorkflowWorktreeOwnership): void {
	const residual = path.resolve(ownership.worktree);
	const expected = path.resolve(ownership.repoRoot, ".worktrees", path.basename(residual));
	if (normalize(residual) !== normalize(expected))
		throw new Error("workflow worktree residual is outside repository-root .worktrees");
	if (!fs.existsSync(residual)) return;
	const stat = fs.lstatSync(residual);
	if (!stat.isDirectory() || stat.isSymbolicLink())
		throw new Error("workflow worktree residual is not a removable owned directory");
	const removablePath = process.platform === "win32" ? path.toNamespacedPath(residual) : residual;
	fs.rmSync(removablePath, { recursive: true, force: true });
	if (fs.existsSync(residual))
		throw new Error("remove workflow worktree residual directory failed");
}

export async function verifyAndCleanupWorkflowWorktree(input: {
	worktree: WorkflowWorktree;
	planPath?: string;
	runner: WorkflowGitRunner;
}): Promise<WorkflowWorktreeOwnership> {
	const ownership = input.worktree.ownership;
	if (ownership.state !== "active") throw new Error("workflow worktree is already complete");
	if (!fs.existsSync(ownership.worktree)) throw new Error("workflow worktree is missing; recovery worktree preserved");
	const planPath = input.planPath?.replace(/^@/, "").replace(/\\/g, "/");
	if (ownership.planPath && planPath && ownership.planPath !== planPath)
		throw new Error("workflow closeout plan path does not match ownership");
	let expectedArchivedPlan: string | undefined;
	if (planPath) {
		const slug = workflowSlugFromPlan(planPath);
		const source = path.join(ownership.worktree, planPath);
		const archived = path.join(ownership.worktree, ".specs", "archive", slug, "plan.md");
		if (fs.existsSync(source) || !fs.existsSync(archived))
			throw new Error("completed plan was not archived in the workflow worktree; recovery worktree preserved");
		const plan = readLinkedPlan(archived);
		if (!plan.complete) throw new Error(`archived plan is not complete: ${plan.blockers.join("; ")}`);
		expectedArchivedPlan = fs.readFileSync(archived, "utf8");
	}
	const status = await input.runner(ownership.worktree, ["status", "--porcelain=v1"]);
	if (status.code !== 0) throw new Error(`inspect workflow worktree: ${status.stderr.trim()}`);
	if (status.stdout.trim()) throw new Error("workflow worktree is not clean after model closeout; recovery worktree preserved");
	const unmerged = await input.runner(ownership.worktree, ["diff", "--name-only", "--diff-filter=U"]);
	if (unmerged.code !== 0 || unmerged.stdout.trim()) throw new Error("workflow worktree has unmerged paths; recovery worktree preserved");
	const primary = await primaryState(ownership.primaryWorktree, input.runner, true, true);
	if (primary.branch !== ownership.primaryBranch) throw new Error("primary branch changed; recovery worktree preserved");
	const branchHead = parseLine(await input.runner(primary.worktree, ["rev-parse", ownership.branch]), "resolve workflow branch before closeout");
	const merged = await input.runner(primary.worktree, ["merge-base", "--is-ancestor", ownership.branch, "HEAD"]);
	if (merged.code !== 0) throw new Error("workflow branch is not merged into the primary branch; recovery worktree preserved");
	const mergedHead = parseLine(await input.runner(primary.worktree, ["rev-parse", "HEAD"]), "verify merged HEAD");
	const parents = parseLine(await input.runner(primary.worktree, ["rev-list", "--parents", "-n", "1", "HEAD"]), "verify merge commit").split(/\s+/).slice(1);
	if (parents.length < 2 || !parents.includes(branchHead))
		throw new Error("primary HEAD is not the required --no-ff merge of the workflow branch; recovery worktree preserved");
	if (planPath && expectedArchivedPlan !== undefined) {
		const slug = workflowSlugFromPlan(planPath);
		const primarySource = path.join(ownership.primaryWorktree, planPath);
		const primaryArchive = path.join(ownership.primaryWorktree, ".specs", "archive", slug, "plan.md");
		if (fs.existsSync(primarySource) || !fs.existsSync(primaryArchive))
			throw new Error("merged primary tree does not contain the required archived plan state; recovery worktree preserved");
		if (fs.readFileSync(primaryArchive, "utf8") !== expectedArchivedPlan)
			throw new Error("merged primary archive does not match the completed workflow plan; recovery worktree preserved");
	}
	let listed = await listWorktrees(primary.worktree, input.runner);
	if (listed.some((entry) => normalize(entry.path) === normalize(ownership.worktree))) {
		const removed = await input.runner(primary.worktree, ["worktree", "remove", ownership.worktree]);
		listed = await listWorktrees(primary.worktree, input.runner);
		if (listed.some((entry) => normalize(entry.path) === normalize(ownership.worktree)))
			throw new Error(`remove workflow worktree after verified closeout: ${removed.stderr.trim() || removed.stdout.trim() || "worktree remains registered"}`);
	}
	removeOwnedResidualWorktree(ownership);
	const branch = await input.runner(primary.worktree, ["show-ref", "--verify", "--quiet", `refs/heads/${ownership.branch}`]);
	if (branch.code === 0) {
		const deleted = await input.runner(primary.worktree, ["branch", "-d", ownership.branch]);
		if (deleted.code !== 0) throw new Error(`remove workflow branch after verified closeout: ${deleted.stderr.trim() || deleted.stdout.trim()}`);
	} else if (branch.code !== 1) {
		throw new Error(`inspect workflow branch after verified closeout: ${branch.stderr.trim() || branch.stdout.trim()}`);
	}
	fs.rmSync(ownershipPath(ownership.repoRoot, path.basename(ownership.worktree)), { force: true });
	return { ...ownership, state: "complete", closeoutStage: "merged", mergedHead };
}

export async function verifyRetainedWorkflowWorktree(input: {
	worktree: WorkflowWorktree;
	planPath: string;
	runner: WorkflowGitRunner;
}): Promise<WorkflowWorktreeOwnership> {
	const ownership = input.worktree.ownership;
	if (ownership.state !== "active") throw new Error("workflow worktree is already complete");
	if (!fs.existsSync(ownership.worktree)) throw new Error("workflow worktree is missing; retained worktree preserved");
	const planPath = input.planPath.replace(/^@/, "").replace(/\\/g, "/");
	if (ownership.planPath && ownership.planPath !== planPath)
		throw new Error("workflow closeout plan path does not match ownership");
	const slug = workflowSlugFromPlan(planPath);
	const source = path.join(ownership.worktree, planPath);
	const archived = path.join(ownership.worktree, ".specs", "archive", slug, "plan.md");
	if (fs.existsSync(source) || !fs.existsSync(archived))
		throw new Error("completed plan was not archived in the retained workflow worktree");
	const plan = readLinkedPlan(archived);
	if (!plan.complete) throw new Error(`archived plan is not complete: ${plan.blockers.join("; ")}`);
	const archivedPlanPath = `.specs/archive/${slug}/plan.md`;
	const ignored = await input.runner(ownership.primaryWorktree, ["check-ignore", "-q", "--", archivedPlanPath]);
	if (ignored.code !== 0 && ignored.code !== 1)
		throw new Error(`inspect retained plan ignore policy: ${ignored.stderr.trim() || ignored.stdout.trim()}`);
	if (ignored.code === 0) {
		const tracked = await input.runner(ownership.worktree, ["ls-files", "--error-unmatch", "--", archivedPlanPath]);
		if (tracked.code === 0) throw new Error("ignored retained plan was committed on the workflow branch");
		if (tracked.code !== 1) throw new Error(`inspect retained plan tracking state: ${tracked.stderr.trim() || tracked.stdout.trim()}`);
	}
	const status = await input.runner(ownership.worktree, ["status", "--porcelain=v1"]);
	if (status.code !== 0) throw new Error(`inspect workflow worktree: ${status.stderr.trim()}`);
	if (status.stdout.trim()) throw new Error("workflow worktree is not clean after retained closeout");
	const unmerged = await input.runner(ownership.worktree, ["diff", "--name-only", "--diff-filter=U"]);
	if (unmerged.code !== 0 || unmerged.stdout.trim()) throw new Error("workflow worktree has unmerged paths; retained worktree preserved");
	const primary = await primaryState(ownership.primaryWorktree, input.runner, true, true);
	if (primary.branch !== ownership.primaryBranch) throw new Error("primary branch changed; retained worktree preserved");
	const branchHead = parseLine(await input.runner(primary.worktree, ["rev-parse", ownership.branch]), "resolve retained workflow branch");
	if (branchHead === ownership.initialPrimaryHead)
		throw new Error("retained workflow branch has no closeout commit");
	const basedOnInitial = await input.runner(primary.worktree, ["merge-base", "--is-ancestor", ownership.initialPrimaryHead, ownership.branch]);
	if (basedOnInitial.code !== 0) throw new Error("retained workflow branch no longer descends from its initial primary HEAD");
	const merged = await input.runner(primary.worktree, ["merge-base", "--is-ancestor", ownership.branch, "HEAD"]);
	if (merged.code === 0) throw new Error("retained workflow branch was merged into the primary branch");
	if (merged.code !== 1) throw new Error(`inspect retained workflow merge state: ${merged.stderr.trim() || merged.stdout.trim()}`);
	const completed = { ...ownership, state: "complete" as const, closeoutStage: "committed" as const, updatedAt: new Date().toISOString() };
	writeOwnership(ownershipPath(ownership.repoRoot, path.basename(ownership.worktree)), completed);
	return completed;
}

export async function closeWorkflowWorktree(input: { worktree: WorkflowWorktree; planPath?: string; archivePlan?: (cwd: string, planPath: string) => Promise<void> | void; runner: WorkflowGitRunner }): Promise<WorkflowWorktreeOwnership> {
	const original = input.worktree.ownership;
	if (original.state !== "active") throw new Error("workflow worktree is already complete");
	const planPath = input.planPath?.replace(/^@/, "").replace(/\\/g, "/");
	if (original.planPath && planPath && original.planPath !== planPath)
		throw new Error("workflow closeout plan path does not match ownership");
	let ownership: WorkflowWorktreeOwnership = planPath && !original.planPath
		? { ...original, planPath }
		: original;
	const metadata = ownershipPath(ownership.repoRoot, path.basename(ownership.worktree));
	const stage = ownership.closeoutStage ?? "active";
	if (planPath && stage === "active") {
		if (!input.archivePlan) throw new Error("archivePlan is required for plan closeout");
		const slug = workflowSlugFromPlan(planPath);
		const sourcePlan = path.join(ownership.worktree, planPath);
		const archivePlan = path.join(ownership.worktree, ".specs", "archive", slug, "plan.md");
		if (fs.existsSync(sourcePlan)) await input.archivePlan(ownership.worktree, planPath);
		else if (!fs.existsSync(archivePlan)) throw new Error("workflow plan is missing before archival; recovery worktree preserved");
		ownership = { ...ownership, planPath, closeoutStage: "archived", updatedAt: new Date().toISOString() };
		writeOwnership(metadata, ownership);
	}
	if (stage === "active" || stage === "archived") {
		if (!fs.existsSync(ownership.worktree)) throw new Error("workflow worktree is missing; preserve the ownership record for recovery");
		const worktreeStatus = await input.runner(ownership.worktree, ["status", "--porcelain=v1"]);
		if (worktreeStatus.code !== 0) throw new Error(`inspect workflow worktree: ${worktreeStatus.stderr.trim()}`);
		const unmerged = await input.runner(ownership.worktree, ["diff", "--name-only", "--diff-filter=U"]);
		if (unmerged.code !== 0 || unmerged.stdout.trim()) throw new Error("workflow worktree has unmerged paths; recovery worktree preserved");
		if (worktreeStatus.stdout.trim()) {
			const checked = await input.runner(ownership.worktree, ["diff", "--check"]);
			if (checked.code !== 0) throw new Error(`workflow diff check failed: ${checked.stderr.trim() || checked.stdout.trim()}`);
			for (const args of [["add", "-A"], ["commit", "-m", `chore(workflow): close ${ownership.workflowId}`]] as string[][]) {
				const result = await input.runner(ownership.worktree, args);
				if (result.code !== 0) throw new Error(`${args[0]} workflow closeout: ${result.stderr.trim() || result.stdout.trim()}`);
			}
		}
		ownership = { ...ownership, closeoutStage: "committed", updatedAt: new Date().toISOString() };
		writeOwnership(metadata, ownership);
	}
	const primary = await primaryState(ownership.primaryWorktree, input.runner, true, true);
	if (primary.branch !== ownership.primaryBranch) throw new Error("primary branch changed; recovery worktree preserved");
	let mergedHead = ownership.mergedHead;
	if ((ownership.closeoutStage ?? "active") !== "merged") {
		const ancestor = await input.runner(primary.worktree, ["merge-base", "--is-ancestor", ownership.branch, "HEAD"]);
		if (ancestor.code !== 0) {
			const merged = await input.runner(primary.worktree, ["merge", "--no-ff", ownership.branch, "-m", `Merge ${ownership.branch}`]);
			if (merged.code !== 0) throw new Error(`merge workflow branch failed; recovery worktree preserved: ${merged.stderr.trim() || merged.stdout.trim()}`);
		}
		const verified = await input.runner(primary.worktree, ["merge-base", "--is-ancestor", ownership.branch, "HEAD"]);
		if (verified.code !== 0) throw new Error("merged HEAD does not contain the workflow branch; recovery worktree preserved");
		mergedHead = parseLine(await input.runner(primary.worktree, ["rev-parse", "HEAD"]), "verify merged HEAD");
		ownership = { ...ownership, closeoutStage: "merged", mergedHead, updatedAt: new Date().toISOString() };
		writeOwnership(metadata, ownership);
	}
	let listed = await listWorktrees(primary.worktree, input.runner);
	if (listed.some((entry) => normalize(entry.path) === normalize(ownership.worktree))) {
		const removed = await input.runner(primary.worktree, ["worktree", "remove", ownership.worktree]);
		listed = await listWorktrees(primary.worktree, input.runner);
		if (listed.some((entry) => normalize(entry.path) === normalize(ownership.worktree)))
			throw new Error(`remove workflow worktree after merge: ${removed.stderr.trim() || removed.stdout.trim() || "worktree remains registered"}`);
	}
	removeOwnedResidualWorktree(ownership);
	const branch = await input.runner(primary.worktree, ["show-ref", "--verify", "--quiet", `refs/heads/${ownership.branch}`]);
	if (branch.code === 0) {
		const deleted = await input.runner(primary.worktree, ["branch", "-d", ownership.branch]);
		if (deleted.code !== 0) throw new Error(`remove workflow branch after merge: ${deleted.stderr.trim() || deleted.stdout.trim()}`);
	} else if (branch.code !== 1) {
		throw new Error(`inspect workflow branch after merge: ${branch.stderr.trim() || branch.stdout.trim()}`);
	}
	fs.rmSync(metadata, { force: true });
	return { ...ownership, state: "complete", mergedHead };
}

export function workflowSlugFromPlan(planPath: string): string {
	const match = planPath.replace(/\\/g, "/").match(/^\.specs\/([a-z0-9]+(?:-[a-z0-9]+)*)\/plan\.md$/);
	return match?.[1] ?? "workflow";
}

export function workflowSlugFromRequest(request: string): string {
	return safeSlug(request.trim()).replace(/[._]+/g, "-");
}

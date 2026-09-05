import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseLinkedPlan, parsePersistedPlanRoutingState, type LinkedPlanState } from "./plan-state.js";
import {
	parseWorktreeListPorcelain,
	readInPlaceWorkflowOwnership,
	readWorkflowOwnershipRecord,
	type InPlaceWorkflowOwnership,
	type ListedWorktree,
	type WorkflowGitResult,
	type WorkflowWorktreeOwnership,
	type WorkflowGitRunner,
	workflowSlugFromPlan,
} from "./workflow-worktree.js";

export type WorkflowObservationError = { path?: string; message: string };
export type WorkflowSourceKind = "primary" | "owned" | "archive";
export type WorkflowEvidenceState = "observed" | "not-observed" | "unknown";

export interface WorkflowSourceObservation {
	kind: WorkflowSourceKind;
	path: string;
	workspace: string;
	relativePath: string;
	exists: boolean;
	revision?: string;
	comparisonRevision?: string;
	content?: string;
	routing?: ReturnType<typeof parsePersistedPlanRoutingState>;
	plan?: LinkedPlanState;
	error?: string;
}

export interface WorkflowStateFacts {
	implementation: WorkflowEvidenceState;
	validation: WorkflowEvidenceState;
	integration: WorkflowEvidenceState;
	retention: WorkflowEvidenceState;
	resources: WorkflowEvidenceState;
	cleanup: WorkflowEvidenceState;
	uncertainty: string[];
}

export interface WorkflowObservation {
	canonicalPath: string;
	repositoryRoot: string;
	primary: WorkflowSourceObservation;
	owned?: WorkflowSourceObservation;
	archive?: WorkflowSourceObservation;
	ownership?: WorkflowWorktreeOwnership;
	inPlaceOwnership?: InPlaceWorkflowOwnership;
	registeredWorktree?: ListedWorktree;
	selected?: WorkflowSourceObservation;
	selection: "primary" | "owned" | "archive" | "conflict" | "missing";
	comparisonRevision?: string;
	facts: WorkflowStateFacts;
	conflicts: string[];
	errors: WorkflowObservationError[];
}

export interface WorkflowObservationSet {
	repositoryRoot: string;
	observations: WorkflowObservation[];
	errors: WorkflowObservationError[];
	complete: boolean;
}

const PLAN_PATH = /^\.specs\/[a-z0-9]+(?:-[a-z0-9]+)*\/plan\.md$/;

function normalizePlanPath(value: string): string {
	const normalized = value.replace(/^@/, "").replace(/\\/g, "/");
	if (!PLAN_PATH.test(normalized)) throw new Error("workflow observation requires a canonical plan path");
	return normalized;
}

function resultText(result: WorkflowGitResult): string {
	return (result.stderr || result.stdout).trim() || "git inspection failed";
}

async function gitText(runner: WorkflowGitRunner, cwd: string, args: string[], label: string, errors: WorkflowObservationError[], signal?: AbortSignal): Promise<string | undefined> {
	const result = await runner(cwd, args, signal);
	if (result.code !== 0) {
		errors.push({ message: `${label}: ${resultText(result)}` });
		return undefined;
	}
	return result.stdout.trim();
}

function source(workspace: string, relativePath: string, kind: WorkflowSourceKind): WorkflowSourceObservation {
	const pathname = path.join(workspace, relativePath);
	if (!fs.existsSync(pathname)) return { kind, path: pathname, workspace, relativePath, exists: false };
	try {
		if (!fs.lstatSync(pathname).isFile()) return { kind, path: pathname, workspace, relativePath, exists: false, error: "path is not a regular file" };
		const content = fs.readFileSync(pathname, "utf8");
		return { kind, path: pathname, workspace, relativePath, exists: true, content, routing: parsePersistedPlanRoutingState(content), plan: parseLinkedPlan(pathname, content) };
	} catch (error) {
		return { kind, path: pathname, workspace, relativePath, exists: true, error: error instanceof Error ? error.message : String(error) };
	}
}

function addSourceError(observation: WorkflowObservation, item?: WorkflowSourceObservation): void {
	if (item?.error) observation.errors.push({ path: item.path, message: item.error });
}

async function inspectSourceRevision(source: WorkflowSourceObservation, cwd: string, relativePath: string, runner: WorkflowGitRunner, errors: WorkflowObservationError[], signal?: AbortSignal): Promise<void> {
	if (!source.exists || source.error) return;
	const head = await gitText(runner, cwd, ["rev-parse", "HEAD"], `resolve ${source.kind} revision`, errors, signal);
	const index = await gitText(runner, cwd, ["rev-parse", `:${relativePath}`], `resolve ${source.kind} index revision`, errors, signal);
	const worktree = await gitText(runner, cwd, ["hash-object", "--", relativePath], `resolve ${source.kind} worktree revision`, errors, signal);
	const status = await gitText(runner, cwd, ["--no-optional-locks", "status", "--porcelain=v1", "--untracked-files=all", "--", relativePath], `inspect ${source.kind} worktree state`, errors, signal);
	source.revision = head;
	source.comparisonRevision = createHash("sha256").update(JSON.stringify({ head, index: index ?? null, worktree: worktree ?? null, status: status ?? null })).digest("hex");
}

function factsFor(observation: WorkflowObservation, evidence: { integration: boolean; retained: boolean; resources: boolean; cleanup: boolean }): WorkflowStateFacts {
	const selected = observation.selected;
	const complete = selected?.routing?.complete === true || selected?.plan?.complete === true;
	const uncertainty: string[] = [];
	if (!selected) uncertainty.push("no readable plan source was selected");
	if (selected?.error) uncertainty.push(`selected source could not be parsed: ${selected.path}`);
	if (selected && selected.routing?.needsReconciliation) uncertainty.push("persisted routing state disagrees between plan fields");
	if (complete && selected?.content?.includes("## Validation")) uncertainty.push("validation is recorded in the plan; current behavior is not certified by inspection");
	if (observation.ownership && !observation.registeredWorktree) uncertainty.push("ownership exists but Git registration was not observed");
	return {
		implementation: complete ? "observed" : selected ? "unknown" : "not-observed",
		validation: "unknown",
		integration: evidence.integration ? "observed" : "unknown",
		retention: evidence.retained ? "observed" : observation.ownership || observation.inPlaceOwnership ? "unknown" : "not-observed",
		resources: evidence.resources ? "observed" : observation.ownership || observation.inPlaceOwnership ? "unknown" : "not-observed",
		cleanup: evidence.cleanup ? "observed" : "unknown",
		uncertainty,
	};
}

export async function observeWorkflow(input: { cwd: string; planPath: string; runner: WorkflowGitRunner; repositoryRoot?: string; registeredWorktrees?: ListedWorktree[]; signal?: AbortSignal }): Promise<WorkflowObservation> {
	const canonicalPath = normalizePlanPath(input.planPath);
	const errors: WorkflowObservationError[] = [];
	const repositoryRoot = path.resolve(input.repositoryRoot ?? (await gitText(input.runner, input.cwd, ["rev-parse", "--show-toplevel"], "resolve repository root", errors, input.signal)) ?? input.cwd);
	const slug = workflowSlugFromPlan(canonicalPath);
	const primary = source(repositoryRoot, canonicalPath, "primary");
	let ownership: WorkflowWorktreeOwnership | undefined;
	let inPlaceOwnership: InPlaceWorkflowOwnership | undefined;
	try { ownership = readWorkflowOwnershipRecord(repositoryRoot, slug); }
	catch (error) { errors.push({ path: path.join(repositoryRoot, ".worktrees", `${slug}.workflow.json`), message: error instanceof Error ? error.message : String(error) }); }
	try { inPlaceOwnership = readInPlaceWorkflowOwnership(repositoryRoot, slug); }
	catch (error) { errors.push({ path: path.join(repositoryRoot, ".worktrees", `${slug}.in-place.workflow.json`), message: error instanceof Error ? error.message : String(error) }); }
	const ownerWorktree = ownership?.worktree ?? inPlaceOwnership?.worktree;
	const owned = ownerWorktree ? source(ownerWorktree, canonicalPath, "owned") : undefined;
	const archivePath = path.join(".specs", "archive", slug, "plan.md");
	const archive = ownerWorktree ? source(ownerWorktree, archivePath, "archive") : source(repositoryRoot, archivePath, "archive");
	await inspectSourceRevision(primary, repositoryRoot, canonicalPath, input.runner, errors, input.signal);
	if (owned) await inspectSourceRevision(owned, ownerWorktree!, canonicalPath, input.runner, errors, input.signal);
	if (archive && archive.exists && !archive.error) archive.comparisonRevision = createHash("sha256").update(archive.content ?? "").digest("hex");
	const observation: WorkflowObservation = { canonicalPath, repositoryRoot, primary, ...(owned ? { owned } : {}), archive, ...(ownership ? { ownership } : {}), ...(inPlaceOwnership ? { inPlaceOwnership } : {}), selection: "missing", comparisonRevision: primary.comparisonRevision, conflicts: [], errors, facts: { implementation: "unknown", validation: "unknown", integration: "unknown", retention: "unknown", resources: "unknown", cleanup: "unknown", uncertainty: [] } };
	addSourceError(observation, primary); addSourceError(observation, owned); addSourceError(observation, archive);
	let worktrees = input.registeredWorktrees;
	if (!worktrees) {
		const result = await input.runner(repositoryRoot, ["worktree", "list", "--porcelain"], input.signal);
		worktrees = result.code === 0 ? parseWorktreeListPorcelain(result.stdout) : [];
		if (result.code !== 0) observation.errors.push({ message: `inspect registered worktrees: ${resultText(result)}` });
	}
	if (ownership) observation.registeredWorktree = worktrees.find((item) => path.resolve(item.path) === path.resolve(ownership!.worktree));
	if (!observation.registeredWorktree && inPlaceOwnership) observation.registeredWorktree = worktrees.find((item) => path.resolve(item.path) === path.resolve(inPlaceOwnership!.worktree));
	if (ownership && primary.comparisonRevision) {
		const current = await input.runner(repositoryRoot, ["--no-optional-locks", "status", "--porcelain=v1", "--untracked-files=all", "--", canonicalPath], input.signal);
		const ownedCurrent = owned ? await input.runner(ownerWorktree!, ["--no-optional-locks", "status", "--porcelain=v1", "--untracked-files=all", "--", canonicalPath], input.signal) : { code: 0, stdout: "", stderr: "" };
		const primaryCommitted = await input.runner(repositoryRoot, ["diff", "--quiet", ownership.initialPrimaryHead, "HEAD", "--", canonicalPath], input.signal);
		const ownedCommitted = owned ? await input.runner(ownerWorktree!, ["diff", "--quiet", ownership.initialPrimaryHead, "HEAD", "--", canonicalPath], input.signal) : { code: 0, stdout: "", stderr: "" };
		if (current.code !== 0) observation.errors.push({ message: `inspect current primary plan state: ${resultText(current)}` });
		if (ownedCurrent.code !== 0) observation.errors.push({ path: owned?.path, message: `inspect current owned plan state: ${resultText(ownedCurrent)}` });
		if (primaryCommitted.code !== 0 && primaryCommitted.code !== 1) observation.errors.push({ message: `compare primary plan revision: ${resultText(primaryCommitted)}` });
		if (ownedCommitted.code !== 0 && ownedCommitted.code !== 1) observation.errors.push({ path: owned?.path, message: `compare owned plan revision: ${resultText(ownedCommitted)}` });
		const primaryChanged = current.code === 0 && (Boolean(current.stdout.trim()) || primaryCommitted.code === 1);
		const ownedChanged = Boolean(owned && ownedCurrent.code === 0 && (Boolean(ownedCurrent.stdout.trim()) || ownedCommitted.code === 1));
		if (primary.exists && owned?.exists && primary.content !== owned.content && primaryChanged && ownedChanged) observation.conflicts.push("primary and owned plan content differ after independent changes");
		observation.comparisonRevision = primary.comparisonRevision;
	}
	const preferred = ownership && archive?.exists && !archive.error && archive.routing?.complete
		? archive
		: owned?.exists && !owned.error
			? owned
			: primary.exists && !primary.error
				? primary
				: undefined;
	if (observation.conflicts.length > 0) observation.selection = "conflict";
	else if (preferred) { observation.selected = preferred; observation.selection = preferred.kind; }
	else observation.selection = "missing";
	const registered = Boolean(observation.registeredWorktree && fs.existsSync(observation.registeredWorktree.path));
	let integration = false;
	let retained = false;
	let cleanup = false;
	if (registered && ownership?.branch) {
		const branchHead = await input.runner(repositoryRoot, ["rev-parse", ownership.branch], input.signal);
		if (branchHead.code !== 0) observation.errors.push({ message: `resolve owned branch revision: ${resultText(branchHead)}` });
		const merged = branchHead.code === 0
			? await input.runner(repositoryRoot, ["merge-base", "--is-ancestor", branchHead.stdout.trim(), "HEAD"], input.signal)
			: undefined;
		if (merged && merged.code !== 0 && merged.code !== 1) observation.errors.push({ message: `inspect owned branch integration: ${resultText(merged)}` });
		integration = merged?.code === 0;
		retained = registered && Boolean(archive?.exists && !archive.error && !primary.exists);
	}
	if (!integration && archive?.workspace === repositoryRoot && archive.exists && !archive.error && !primary.exists) {
		const archived = await input.runner(repositoryRoot, ["cat-file", "-e", `HEAD:${archive.relativePath}`], input.signal);
		const sourceAbsent = await input.runner(repositoryRoot, ["cat-file", "-e", `HEAD:${primary.relativePath}`], input.signal);
		integration = archived.code === 0 && sourceAbsent.code !== 0;
		cleanup = integration && !observation.registeredWorktree && !observation.ownership && !observation.inPlaceOwnership;
	}
	observation.facts = factsFor(observation, { integration, retained, resources: registered, cleanup });
	return observation;
}

export async function discoverWorkflows(input: { cwd: string; runner: WorkflowGitRunner; signal?: AbortSignal }): Promise<WorkflowObservationSet> {
	const errors: WorkflowObservationError[] = [];
	const rootResult = await input.runner(input.cwd, ["rev-parse", "--show-toplevel"], input.signal);
	if (rootResult.code !== 0) return { repositoryRoot: path.resolve(input.cwd), observations: [], errors: [{ message: `resolve repository root: ${resultText(rootResult)}` }], complete: false };
	const repositoryRoot = path.resolve(rootResult.stdout.trim());
	const registeredResult = await input.runner(repositoryRoot, ["worktree", "list", "--porcelain"], input.signal);
	const registeredWorktrees = registeredResult.code === 0 ? parseWorktreeListPorcelain(registeredResult.stdout) : undefined;
	if (!registeredWorktrees) errors.push({ message: `inspect registered worktrees: ${resultText(registeredResult)}` });
	const paths = new Set<string>();
	const specs = path.join(repositoryRoot, ".specs");
	if (fs.existsSync(specs)) for (const entry of fs.readdirSync(specs, { withFileTypes: true })) if (entry.isDirectory() && entry.name !== "archive" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name) && fs.existsSync(path.join(specs, entry.name, "plan.md"))) paths.add(`.specs/${entry.name}/plan.md`);
	const records = path.join(repositoryRoot, ".worktrees");
	if (fs.existsSync(records)) for (const entry of fs.readdirSync(records)) if (entry.endsWith(".workflow.json") || entry.endsWith(".in-place.workflow.json")) try {
		const slug = entry.replace(/\.in-place\.workflow\.json$|\.workflow\.json$/, "");
		const record = entry.endsWith(".in-place.workflow.json") ? readInPlaceWorkflowOwnership(repositoryRoot, slug) : readWorkflowOwnershipRecord(repositoryRoot, slug);
		if (record?.planPath) paths.add(record.planPath);
	} catch (error) { errors.push({ path: path.join(records, entry), message: error instanceof Error ? error.message : String(error) }); }
	const observations: WorkflowObservation[] = [];
	for (const planPath of [...paths].sort()) try {
		const observation = await observeWorkflow({ ...input, planPath, repositoryRoot, registeredWorktrees });
		observations.push(observation);
		errors.push(...observation.errors);
	} catch (error) { errors.push({ path: planPath, message: error instanceof Error ? error.message : String(error) }); }
	return { repositoryRoot, observations, errors, complete: errors.length === 0 };
}

export function selectWorkflowSource(observation: WorkflowObservation): WorkflowSourceObservation {
	if (observation.selection === "conflict") throw new Error(`workflow source conflict for ${observation.canonicalPath}: ${observation.conflicts.join("; ")}`);
	if (!observation.selected) throw new Error(`workflow plan is missing: ${observation.canonicalPath}`);
	return observation.selected;
}

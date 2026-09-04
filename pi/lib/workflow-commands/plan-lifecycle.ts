import * as fs from "node:fs";
import * as path from "node:path";
import { parseLinkedPlan, parsePersistedPlanRoutingState } from "../plan-state.js";

export const PLAN_LIFECYCLE_ENTRY_TYPE = "workflow.plan-lifecycle";
export const PLAN_LIFECYCLE_VERSION = 1;

export type PlanRisk = "low" | "material";
export type PlanMode = "standard" | "quick";
export type PlanReviewerRole = "adversary" | "proponent" | "specialist" | "subtractive";
export type PlanReviewOutcome = "supported" | "no_finding" | "failed" | "covered";
export type PlanDisposition =
	| "required_repair"
	| "rejected"
	| "deferred"
	| "operator_decision"
	| "no_change";
export type PlanInspector = "primary" | "read_only_leaf";
export type PlanLifecycleStage =
	| "started"
	| "draft"
	| "blocked"
	| "ready"
	// Legacy stages are accepted when restoring existing snapshots only.
	| "risk_selected"
	| "reviewing"
	| "review_settled"
	| "adjudicated"
	| "operator_decision"
	| "accepted"
	| "repaired"
	| "inspected";

export interface PlanReviewRecord {
	role: PlanReviewerRole;
	concern?: string;
	outcome: PlanReviewOutcome;
	strategy?: string;
	attempt: number;
}

export interface PlanDispositionRecord {
	role: PlanReviewerRole;
	disposition: PlanDisposition;
}

export interface PlanLifecycleSnapshot {
	version: 1;
	invocationId: string;
	request: string;
	mode?: PlanMode;
	stage: PlanLifecycleStage;
	planPath?: string;
	blockedConcern?: string;
	risk?: PlanRisk;
	draftInspectedBy?: PlanInspector;
	finalInspectedBy?: PlanInspector;
	reviewers: PlanReviewRecord[];
	dispositions: PlanDispositionRecord[];
	repair: "none" | "applied";
}

export type PlanProgressInput =
	| { action: "draft"; planPath: string }
	| {
			action: "review";
			role: PlanReviewerRole;
			concern?: string;
			outcome: PlanReviewOutcome;
			strategy?: string;
		}
	| { action: "blocked"; concern: string }
	| { action: "ready" };

type PlanLifecycleHost = object;

type PlanLifecycleController = {
	start(request: string): Promise<PlanLifecycleSnapshot>;
	current(): PlanLifecycleSnapshot | undefined;
};

const planLifecycleControllers = new WeakMap<
	PlanLifecycleHost,
	PlanLifecycleController
>();

export function registerPlanLifecycleController(
	host: PlanLifecycleHost,
	controller: PlanLifecycleController,
): void {
	planLifecycleControllers.set(host, controller);
}

export function startPlanLifecycle(
	host: PlanLifecycleHost,
	request: string,
): Promise<PlanLifecycleSnapshot> {
	const controller = planLifecycleControllers.get(host);
	if (!controller)
		throw new Error("The /plan-it lifecycle controller is unavailable.");
	return controller.start(request);
}

export function currentPlanLifecycle(
	host: PlanLifecycleHost,
): PlanLifecycleSnapshot | undefined {
	return planLifecycleControllers.get(host)?.current();
}

export interface PlanContractValidation {
	valid: boolean;
	errors: string[];
	taskKeys: string[];
}

export type PlanValidationMode = "ready" | "execution-preflight";

export interface DoItCompletion {
	value: string;
	label: string;
}

const doItPlanCache = new Map<string, string[]>();
const PLAN_PATH_PATTERN = /^\.specs\/[a-z0-9]+(?:-[a-z0-9]+)*\/plan\.md$/;

export function canonicalPlanPathFromInput(value: string): string | undefined {
	const normalized = value.trim().replace(/\\/g, "/");
	const match = normalized.match(/^@?(\.specs\/[a-z0-9]+(?:-[a-z0-9]+)*\/plan\.md)[.,!?;:)]{0,4}$/);
	return match?.[1];
}

const TASK_PATTERN = /^- \[[ x]\] \*\*(T[1-9][0-9]*): .+\*\*$/gm;
const MAX_PLAN_DIAGNOSTICS = 8;

function planSection(content: string, heading: string): string {
	const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = new RegExp(`^${escapedHeading}[ \\t]*\\r?$`, "m").exec(content);
	if (!match) return "";
	const remainder = content.slice(match.index + match[0].length).replace(/^\n/, "");
	const nextHeading = /^## /m.exec(remainder);
	return nextHeading ? remainder.slice(0, nextHeading.index) : remainder;
}

function hasPlanHeading(content: string, heading: string): boolean {
	const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`^${escapedHeading}[ \\t]*\\r?$`, "m").test(content);
}

export function refreshDoItPlanCache(cwd: string): string[] {
	const root = path.resolve(cwd);
	const specs = path.join(root, ".specs");
	const active: string[] = [];
	if (fs.existsSync(specs)) {
		for (const entry of fs.readdirSync(specs, { withFileTypes: true })) {
			if (!entry.isDirectory() || entry.name === "archive" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name)) continue;
			const relative = `.specs/${entry.name}/plan.md`;
			const absolute = path.join(root, relative);
			if (!fs.existsSync(absolute)) continue;
			const content = fs.readFileSync(absolute, "utf8");
			const routing = parsePersistedPlanRoutingState(content);
			if (routing.complete || routing.needsReconciliation) continue;
			if (validatePlanContract(content, relative, "execution-preflight").valid) active.push(relative);
		}
	}
	active.sort();
	doItPlanCache.set(root, active);
	return [...active];
}

export function getCachedDoItPlans(cwd: string): string[] {
	return [...(doItPlanCache.get(path.resolve(cwd)) ?? [])];
}

export function getDoItArgumentCompletions(prefix: string, plans: string[]): DoItCompletion[] | null {
	const normalized = prefix.trimStart();
	if (normalized === "--") return null;
	const tokens = normalized.split(/\s+/).filter(Boolean);
	if (tokens.includes("--")) return null;
	const selected: Set<string> = new Set(tokens.filter((token) => token === "--no-clear" || token === "--in-place" || token === "--no-merge"));
	const hasTrailingSpace = /\s$/.test(normalized);
	const partial = hasTrailingSpace ? "" : tokens.at(-1) ?? "";
	const completedTokens = hasTrailingSpace ? tokens : tokens.slice(0, -1);
	if (completedTokens.some((token) => !selected.has(token))) return null;
	const candidates: string[] = ["--no-clear", "--in-place", "--no-merge", ...plans].filter((value) => !selected.has(value));
	const filtered = candidates.filter((value) => value.startsWith(partial));
	return filtered.length > 0 ? filtered.map((value) => ({ value, label: value })) : null;
}

function requireStage(
	snapshot: PlanLifecycleSnapshot,
	allowed: PlanLifecycleStage[],
	action: PlanProgressInput["action"],
): void {
	if (!allowed.includes(snapshot.stage))
		throw new Error(
			`plan_progress ${action} is invalid while the lifecycle is ${snapshot.stage}.`,
		);
}

function requiredText(value: string, label: string): string {
	const normalized = value.trim();
	if (!normalized) throw new Error(`${label} is required.`);
	if (normalized.length > 120) throw new Error(`${label} must be at most 120 characters.`);
	return normalized;
}

export function createPlanLifecycleSnapshot(
	invocationId: string,
	request: string,
	mode: PlanMode = "standard",
): PlanLifecycleSnapshot {
	return {
		version: PLAN_LIFECYCLE_VERSION,
		invocationId,
		request: request.trim().slice(0, 500),
		mode,
		stage: "started",
		reviewers: [],
		dispositions: [],
		repair: "none",
	};
}

const PLAN_LIFECYCLE_STAGES: readonly PlanLifecycleStage[] = [
	"started",
	"draft",
	"blocked",
	"ready",
	"risk_selected",
	"reviewing",
	"review_settled",
	"adjudicated",
	"operator_decision",
	"accepted",
	"repaired",
	"inspected",
];

function isPlanLifecycleStage(value: unknown): value is PlanLifecycleStage {
	return (
		typeof value === "string" &&
		PLAN_LIFECYCLE_STAGES.includes(value as PlanLifecycleStage)
	);
}

export function isPlanLifecycleSnapshot(
	value: unknown,
): value is PlanLifecycleSnapshot {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Partial<PlanLifecycleSnapshot>;
	return (
		candidate.version === PLAN_LIFECYCLE_VERSION &&
		typeof candidate.invocationId === "string" &&
		typeof candidate.request === "string" &&
		(candidate.mode === undefined ||
			candidate.mode === "standard" ||
			candidate.mode === "quick") &&
		isPlanLifecycleStage(candidate.stage) &&
		Array.isArray(candidate.reviewers) &&
		Array.isArray(candidate.dispositions) &&
		(candidate.repair === "none" || candidate.repair === "applied")
	);
}

function unresolvedSupportedReviews(reviewers: PlanReviewRecord[]): PlanReviewRecord[] {
	return reviewers.filter(
		(review, index) => review.outcome === "supported" && !reviewers.slice(index + 1).some(
			(later) => later.role === review.role && later.concern === review.concern && later.outcome === "covered",
		),
	);
}

export function transitionPlanLifecycle(
	current: PlanLifecycleSnapshot,
	input: PlanProgressInput,
): PlanLifecycleSnapshot {
	const snapshot: PlanLifecycleSnapshot = {
		...current,
		reviewers: current.reviewers.map((review) => ({ ...review })),
		dispositions: current.dispositions.map((item) => ({ ...item })),
	};

	if (snapshot.stage === "ready") return snapshot;

	switch (input.action) {
		case "draft": {
			requireStage(snapshot, ["started", "blocked"], input.action);
			const planPath = input.planPath.replace(/^@/, "").replace(/\\/g, "/");
			if (!PLAN_PATH_PATTERN.test(planPath))
				throw new Error(
					"plan_progress requires a canonical .specs/{slug}/plan.md path.",
				);
			if (snapshot.planPath && snapshot.planPath !== planPath)
				throw new Error("A blocked plan lifecycle cannot resume with a different plan path.");
			return { ...snapshot, planPath, stage: "draft", blockedConcern: undefined };
		}
		case "review": {
			requireStage(snapshot, ["draft"], input.action);
			const concern = input.concern?.trim() || undefined;
			const strategy = input.strategy?.trim() || undefined;
			const pendingSupported = unresolvedSupportedReviews(snapshot.reviewers);
			const subtractive = snapshot.reviewers.filter(
				(review) => review.role === "subtractive",
			);
			if (input.role === "subtractive") {
				if (pendingSupported.some((review) => review.role !== "subtractive"))
					throw new Error("Supported subject-matter findings must be repaired before the final subtractive review.");
				const previous = subtractive.at(-1);
				if (previous && previous.outcome !== "failed" && !(previous.outcome === "supported" && input.outcome === "covered"))
					throw new Error("The final subtractive review is already complete.");
						} else {
				if (subtractive.length > 0)
					throw new Error("Subject-matter review cannot continue after the final subtractive review starts.");
				const subjectMatterReviews = snapshot.reviewers.filter(
					(review) => review.role !== "subtractive",
				);
				const resolvesSupportedFinding = input.outcome === "covered" && snapshot.reviewers.some(
					(review) => review.role === input.role && review.concern === concern && review.outcome === "supported",
				);
				if (subjectMatterReviews.length >= 4 && !resolvesSupportedFinding)
					throw new Error("Subject-matter review cannot exceed four records.");
			}
			const prior = snapshot.reviewers.filter((review) => review.role === input.role);
			snapshot.reviewers.push({
				role: input.role,
				...(concern ? { concern } : {}),
				outcome: input.outcome,
				...(strategy ? { strategy } : {}),
				attempt: prior.length + 1,
			});
			return snapshot;
		}
		case "blocked":
			requireStage(snapshot, ["draft", "blocked", "risk_selected", "reviewing", "review_settled", "adjudicated", "operator_decision", "accepted", "repaired", "inspected"], input.action);
			return { ...snapshot, blockedConcern: requiredText(input.concern, "Blocker concern"), stage: "blocked" };
		case "ready": {
			requireStage(snapshot, ["draft", "blocked", "risk_selected", "reviewing", "review_settled", "adjudicated", "operator_decision", "accepted", "repaired", "inspected"], input.action);
			if (snapshot.mode === "quick") {
				if (unresolvedSupportedReviews(snapshot.reviewers).length > 0)
					throw new Error("Supported review findings must be repaired before plan readiness.");
				return { ...snapshot, stage: "ready" };
			}
			const pendingSupported = unresolvedSupportedReviews(snapshot.reviewers);
			const completedSubtractive = snapshot.reviewers.filter(
				(review) => review.role === "subtractive" && (review.outcome === "covered" || review.outcome === "no_finding"),
			);
			if (pendingSupported.length > 0)
				throw new Error("Supported review findings must be repaired before plan readiness.");
			if (completedSubtractive.length !== 1 || snapshot.reviewers.at(-1)?.role !== "subtractive")
				throw new Error("Plan readiness requires one final completed subtractive review.");
			return { ...snapshot, stage: "ready" };
		}
	}
}

export type PlanCloseoutPolicy = "merge" | "retain";

export function parsePlanCloseoutPolicy(content: string): PlanCloseoutPolicy {
	const retentionSection =
		content.split("## Retention", 2)[1]?.split(/^## /m, 1)[0] ?? "";
	return /^\s*-\s+Closeout:\s+Retain the committed workflow branch and worktree; do not merge into the primary branch\.\s*$/im.test(
		retentionSection,
	)
		? "retain"
		: "merge";
}

export function validatePlanContract(
	content: string,
	planPath: string,
	mode: PlanValidationMode = "ready",
): PlanContractValidation {
	const errors: string[] = [];
	const addError = (message: string): void => {
		if (errors.length < MAX_PLAN_DIAGNOSTICS && !errors.includes(message))
			errors.push(message);
	};
	const normalizedPath = planPath.replace(/\\/g, "/");
	if (!PLAN_PATH_PATTERN.test(normalizedPath))
		addError("Plan path is not canonical.");
	if (!hasPlanHeading(content, "## Tasks")) addError("Missing ## Tasks.");
	if (mode === "ready") {
		for (const heading of [
			"## Objective",
			"## Completion Evidence",
			"## Boundaries",
			"## Validation",
			"## Retention",
			"## Execution Status",
		]) {
			if (!hasPlanHeading(content, heading)) addError(`Missing ${heading}.`);
		}
		const completionSection = planSection(content, "## Completion Evidence");
		if (!/^\s*-\s+Evidence:\s*\S/im.test(completionSection))
			addError("Completion Evidence is missing Evidence:.");
		if (!/^\s*-\s+Fails when:\s*\S/im.test(completionSection))
			addError("Completion Evidence is missing Fails when:.");
	}
	const allowedStatuses =
		mode === "execution-preflight"
			? "ready|in_progress|in-progress|complete|completed"
			: "ready";
	if (
		!new RegExp(
			`^---\\r?\\n[\\s\\S]*?^status:\\s*(?:${allowedStatuses})\\s*$`,
			"m",
		).test(content)
	)
		addError(
			mode === "execution-preflight"
				? "Plan frontmatter status must be ready, in_progress, in-progress, complete, or completed."
				: "Plan frontmatter status must be ready.",
		);
	const taskKeys = [...content.matchAll(TASK_PATTERN)].map((match) => match[1]);
	if (taskKeys.length < 1 || taskKeys.length > 16)
		addError("Plan must contain one to sixteen executable tasks.");
	if (new Set(taskKeys).size !== taskKeys.length)
		addError("Plan task keys must be unique.");
	if (mode === "ready") {
		const taskSection = planSection(content, "## Tasks");
		for (const key of taskKeys) {
			const start = taskSection.indexOf(`**${key}:`);
			const next = taskKeys
				.map((candidate) => taskSection.indexOf(`**${candidate}:`, start + 1))
				.filter((index) => index > start)
				.sort((left, right) => left - right)[0];
			const block = taskSection.slice(start, next ?? undefined);
			for (const field of ["Files:", "Change:", "Done when:", "Verify:"])
				if (!block.includes(field)) addError(`${key} is missing ${field}`);
		}
	}
	try {
		parseLinkedPlan(normalizedPath, content);
	} catch (error) {
		addError(
			error instanceof Error ? `Plan dependency syntax: ${error.message}` : String(error),
		);
	}
	if (mode === "ready") {
		const validationSection = planSection(content, "## Validation");
		if (!/^\s*-\s+\[[ xX]\]\s+\S/im.test(validationSection))
			addError("Validation must contain a checklist item.");
		if (!/^\s*-\s+State:\s*\S/im.test(planSection(content, "## Execution Status")))
			addError("Execution Status must declare State.");
		if (!content.includes(`/do-it ${normalizedPath}`))
			addError("Execution Status must contain the canonical /do-it resume command.");
		if (!content.includes(`.specs/archive/${normalizedPath.split("/")[1]}/`))
			addError("Retention must name the canonical archive directory.");
	}
	return { valid: errors.length === 0, errors, taskKeys };
}

export function validatePlanFile(
	cwd: string,
	planPath: string,
	mode: PlanValidationMode = "ready",
): PlanContractValidation {
	const normalizedPath = planPath.replace(/\\/g, "/");
	try {
		const absolutePath = path.resolve(cwd, normalizedPath);
		const repositoryRoot = fs.realpathSync(path.resolve(cwd));
		const resolvedPlan = fs.realpathSync(absolutePath);
		if (
			resolvedPlan !== repositoryRoot &&
			!resolvedPlan.startsWith(`${repositoryRoot}${path.sep}`)
		)
			return { valid: false, errors: ["Plan path escapes the workspace."], taskKeys: [] };
		if (!fs.lstatSync(absolutePath).isFile())
			return { valid: false, errors: ["Plan path is not a regular file."], taskKeys: [] };
		return validatePlanContract(
			fs.readFileSync(absolutePath, "utf8"),
			normalizedPath,
			mode,
		);
	} catch (error) {
		return {
			valid: false,
			errors: [error instanceof Error ? error.message : String(error)].slice(
				0,
			MAX_PLAN_DIAGNOSTICS,
			),
			taskKeys: [],
		};
	}
}

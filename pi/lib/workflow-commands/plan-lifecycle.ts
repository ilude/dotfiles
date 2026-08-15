import * as fs from "node:fs";
import * as path from "node:path";

export const PLAN_LIFECYCLE_ENTRY_TYPE = "workflow.plan-lifecycle";
export const PLAN_LIFECYCLE_VERSION = 1;

export type PlanRisk = "low" | "material";
export type PlanReviewerRole = "adversary" | "proponent" | "specialist";
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
	| "risk_selected"
	| "reviewing"
	| "review_settled"
	| "adjudicated"
	| "operator_decision"
	| "accepted"
	| "repaired"
	| "inspected"
	| "ready";

export interface PlanReviewRecord {
	role: PlanReviewerRole;
	concern: string;
	outcome: PlanReviewOutcome;
	strategy: string;
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
	stage: PlanLifecycleStage;
	planPath?: string;
	risk?: PlanRisk;
	draftInspectedBy?: PlanInspector;
	finalInspectedBy?: PlanInspector;
	reviewers: PlanReviewRecord[];
	dispositions: PlanDispositionRecord[];
	repair: "none" | "applied";
}

export type PlanProgressInput =
	| { action: "draft"; planPath: string }
	| { action: "risk"; risk: PlanRisk; inspectedBy: PlanInspector }
	| {
			action: "review";
			role: PlanReviewerRole;
			concern: string;
			outcome: PlanReviewOutcome;
			strategy: string;
		}
	| { action: "settle_review" }
	| { action: "adjudicate"; dispositions: PlanDispositionRecord[] }
	| { action: "repair" }
	| { action: "accept" }
	| { action: "inspect"; inspectedBy: PlanInspector }
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

const PLAN_PATH_PATTERN = /^\.specs\/[a-z0-9]+(?:-[a-z0-9]+)*\/plan\.md$/;
const TASK_PATTERN = /^- \[[ x]\] \*\*(T[1-9][0-9]*): .+\*\*$/gm;

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

function latestReviews(snapshot: PlanLifecycleSnapshot): Map<PlanReviewerRole, PlanReviewRecord> {
	const latest = new Map<PlanReviewerRole, PlanReviewRecord>();
	for (const review of snapshot.reviewers) latest.set(review.role, review);
	return latest;
}

export function createPlanLifecycleSnapshot(
	invocationId: string,
	request: string,
): PlanLifecycleSnapshot {
	return {
		version: PLAN_LIFECYCLE_VERSION,
		invocationId,
		request: request.trim().slice(0, 500),
		stage: "started",
		reviewers: [],
		dispositions: [],
		repair: "none",
	};
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
		typeof candidate.stage === "string" &&
		Array.isArray(candidate.reviewers) &&
		Array.isArray(candidate.dispositions) &&
		(candidate.repair === "none" || candidate.repair === "applied")
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

	switch (input.action) {
		case "draft": {
			requireStage(snapshot, ["started"], input.action);
			const planPath = input.planPath.replace(/^@/, "").replace(/\\/g, "/");
			if (!PLAN_PATH_PATTERN.test(planPath))
				throw new Error(
					"plan_progress requires a canonical .specs/{slug}/plan.md path.",
				);
			return { ...snapshot, planPath, stage: "draft" };
		}
		case "risk":
			requireStage(snapshot, ["draft"], input.action);
			return {
				...snapshot,
				risk: input.risk,
				draftInspectedBy: input.inspectedBy,
				stage: "risk_selected",
			};
		case "review": {
			requireStage(snapshot, ["risk_selected", "reviewing"], input.action);
			if (snapshot.risk !== "material")
				throw new Error("Low-risk plans cannot launch reviewers.");
			const concern = requiredText(input.concern, "Reviewer concern");
			const strategy = requiredText(input.strategy, "Reviewer strategy");
			const prior = snapshot.reviewers.filter(
				(review) => review.role === input.role,
			);
			if (prior.length > 0) {
				const previous = prior.at(-1);
				if (prior.length >= 2 || previous?.outcome !== "failed")
					throw new Error(
						`The ${input.role} perspective cannot be run again.`,
					);
				if (previous.strategy === strategy)
					throw new Error(
						"A failed perspective retry requires a materially different strategy.",
					);
			} else {
				const roles = new Set(snapshot.reviewers.map((review) => review.role));
				if (roles.size === 0 && input.role !== "adversary")
					throw new Error("Material-risk review starts with one adversary.");
				if (roles.size === 1 && input.role === "adversary")
					throw new Error(
						"The second material-risk perspective must be a proponent or specialist.",
					);
				if (roles.size >= 2)
					throw new Error("Material-risk review cannot exceed two perspectives.");
			}
			snapshot.reviewers.push({
				role: input.role,
				concern,
				outcome: input.outcome,
				strategy,
				attempt: prior.length + 1,
			});
			return { ...snapshot, stage: "reviewing" };
		}
		case "settle_review": {
			requireStage(
				snapshot,
				["risk_selected", "reviewing"],
				input.action,
			);
			if (snapshot.risk === "low") {
				if (snapshot.reviewers.length > 0)
					throw new Error("Low-risk review cannot contain reviewer records.");
				return { ...snapshot, stage: "review_settled" };
			}
			const latest = latestReviews(snapshot);
			if (
				latest.size !== 2 ||
				!latest.has("adversary") ||
				(!latest.has("proponent") && !latest.has("specialist"))
			)
				throw new Error(
					"Material-risk review requires one adversary and one proponent or specialist.",
				);
			if ([...latest.values()].some((review) => review.outcome === "failed"))
				throw new Error(
					"A failed perspective must be retried with a new strategy or marked covered by remaining evidence.",
				);
			return { ...snapshot, stage: "review_settled" };
		}
		case "adjudicate": {
			requireStage(snapshot, ["review_settled"], input.action);
			const latest = latestReviews(snapshot);
			if (snapshot.risk === "low" && input.dispositions.length !== 0)
				throw new Error("Low-risk plans have no reviewer claims to adjudicate.");
			if (snapshot.risk === "material") {
				const roles = input.dispositions.map((item) => item.role);
				if (
					roles.length !== latest.size ||
					new Set(roles).size !== roles.length ||
					roles.some((role) => !latest.has(role))
				)
					throw new Error(
						"Adjudication must classify each settled reviewer perspective exactly once.",
					);
			}
			const dispositions = input.dispositions.map((item) => ({ ...item }));
			return {
				...snapshot,
				dispositions,
				stage: dispositions.some(
					(item) => item.disposition === "operator_decision",
				)
					? "operator_decision"
					: "adjudicated",
			};
		}
		case "repair":
			requireStage(snapshot, ["adjudicated"], input.action);
			if (
				!snapshot.dispositions.some(
					(item) => item.disposition === "required_repair",
				)
			)
				throw new Error("No required repair was adjudicated.");
			if (snapshot.repair === "applied")
				throw new Error("Only one coherent repair pass is allowed.");
			return { ...snapshot, repair: "applied", stage: "repaired" };
		case "accept":
			requireStage(snapshot, ["adjudicated"], input.action);
			if (
				snapshot.dispositions.some(
					(item) => item.disposition === "required_repair",
				)
			)
				throw new Error("Required repairs must be applied before inspection.");
			return { ...snapshot, stage: "accepted" };
		case "inspect":
			requireStage(snapshot, ["accepted", "repaired"], input.action);
			return {
				...snapshot,
				finalInspectedBy: input.inspectedBy,
				stage: "inspected",
			};
		case "ready":
			requireStage(snapshot, ["inspected"], input.action);
			return { ...snapshot, stage: "ready" };
	}
}

export function validatePlanContract(
	content: string,
	planPath: string,
): PlanContractValidation {
	const errors: string[] = [];
	if (!PLAN_PATH_PATTERN.test(planPath.replace(/\\/g, "/")))
		errors.push("Plan path is not canonical.");
	for (const heading of [
		"## Objective",
		"## Boundaries",
		"## Tasks",
		"## Validation",
		"## Retention",
		"## Execution Status",
	]) {
		if (!content.includes(heading)) errors.push(`Missing ${heading}.`);
	}
	if (!/^---\r?\n[\s\S]*?^status:\s*ready\s*$/m.test(content))
		errors.push("Plan frontmatter status must be ready.");
	const taskKeys = [...content.matchAll(TASK_PATTERN)].map((match) => match[1]);
	if (taskKeys.length < 1 || taskKeys.length > 16)
		errors.push("Plan must contain one to sixteen executable tasks.");
	if (new Set(taskKeys).size !== taskKeys.length)
		errors.push("Plan task keys must be unique.");
	const taskSection = content.split("## Tasks", 2)[1]?.split(/^## /m, 1)[0] ?? "";
	for (const key of taskKeys) {
		const start = taskSection.indexOf(`**${key}:`);
		const next = taskKeys
			.map((candidate) => taskSection.indexOf(`**${candidate}:`, start + 1))
			.filter((index) => index > start)
			.sort((left, right) => left - right)[0];
		const block = taskSection.slice(start, next ?? undefined);
		for (const field of ["Files:", "Change:", "Done when:", "Verify:"])
			if (!block.includes(field)) errors.push(`${key} is missing ${field}`);
	}
	if (!content.includes(`/do-it ${planPath}`))
		errors.push("Execution Status must contain the canonical /do-it resume command.");
	if (!content.includes(`.specs/archive/${planPath.split("/")[1]}/`))
		errors.push("Retention must name the canonical archive directory.");
	return { valid: errors.length === 0, errors, taskKeys };
}

export function validatePlanFile(
	cwd: string,
	planPath: string,
): PlanContractValidation {
	const normalizedPath = planPath.replace(/\\/g, "/");
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
	const content = fs.readFileSync(absolutePath, "utf8");
	return validatePlanContract(content, normalizedPath);
}

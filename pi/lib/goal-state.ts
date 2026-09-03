export const GOAL_PUBLIC_STATES = [
	"running",
	"waiting_for_operator",
	"completed",
	"stopped",
	"failed",
] as const;

export type GoalPublicState = (typeof GOAL_PUBLIC_STATES)[number];
export type GoalMode = "inline" | "file";

export type GoalCondition = {
	id: string;
	description: string;
};

export type GoalConditionMode = "structured" | "legacy_compatibility";

export function reconcileGoalConditions(
	existing: readonly GoalCondition[] | undefined,
	descriptions: readonly string[],
): GoalCondition[] {
	const prior = existing ?? [];
	const highest = prior.reduce((max, condition) => {
		const match = /^G(\d+)$/.exec(condition.id);
		return Math.max(max, match ? Number(match[1]) : 0);
	}, 0);
	let nextId = highest + 1;
	const used = new Set<string>();
	return descriptions.map((description, index) => {
		const trimmed = description.trim();
		if (!trimmed) throw new Error("goal condition description is required");
		const exact = prior.find(
			(condition) => !used.has(condition.id) && condition.description === trimmed,
		);
		const priorCondition = exact ?? prior.find((condition) => !used.has(condition.id) && prior.indexOf(condition) === index);
		if (priorCondition) {
			used.add(priorCondition.id);
			return { ...priorCondition, description: trimmed };
		}
		return { id: `G${nextId++}`, description: trimmed };
	});
}

export function validateGoalTaskCoverage(
	conditions: readonly GoalCondition[],
	tasks: readonly { goalId?: string; covers?: readonly string[] }[],
	goalId: string,
): void {
	const current = new Set(conditions.map((condition) => condition.id));
	if (current.size !== conditions.length)
		throw new Error("goal conditions must have unique IDs");
	const covered = new Set<string>();
	for (const task of tasks) {
		if (task.goalId !== goalId) continue;
		if (!task.covers?.length)
			throw new Error("goal-linked task must cover at least one current condition");
		for (const id of task.covers) {
			if (!current.has(id))
				throw new Error(`goal-linked task references unknown condition: ${id}`);
			covered.add(id);
		}
	}
	for (const condition of conditions)
		if (!covered.has(condition.id))
			throw new Error(`goal condition ${condition.id} has no task coverage`);
}

export type GoalFailureOutcome =
	| "error"
	| "inconclusive"
	| "schema_invalid"
	| "verifier_contradiction"
	| "capability_rejected"
	| "cancelled"
	| "damage_control_denied"
	| "infrastructure_failure"
	| "not_found"
	| "success";

export type GoalStrategy = {
	agent?: string;
	capabilities?: string;
	evidenceSource?: string;
	inputPartition?: string;
	testedAssumption?: string;
	toolApproach?: string;
	validationMethod?: string;
};

export type GoalAttempt = {
	id: string;
	startedAt: string;
	ownerPid: number;
	ownerInstanceId: string;
	strategy: GoalStrategy;
	recovery: boolean;
};

export type GoalWaitReason =
	| "operator_decision"
	| "access_or_credential"
	| "external_dependency"
	| "safety_boundary"
	| "objective_conflict"
	| "recovery_exhausted";

export type GoalRecoveryPhase =
	| "ordinary"
	| "re_evaluation_required"
	| "recovery_ready"
	| "needs_operator";

export type GoalWorkItem = {
	key: string;
	taskId: string;
	required: boolean;
	qualifyingFailures: number;
	phase: GoalRecoveryPhase;
	activeAttempt?: GoalAttempt;
	lastOrdinaryStrategy?: GoalStrategy;
	reEvaluation?: {
		recordedAt: string;
		evidence: string;
		assumptions: string;
		strategy: string;
	};
	recoveryStrategies: GoalStrategy[];
	lastOutcome?: GoalFailureOutcome;
	needsOperatorReason?: string;
	wait?: {
		reason: GoalWaitReason;
		evidence: string;
		operatorAction: string;
		recordedAt: string;
	};
	interruptedReason?: string;
	interruptedStrategy?: GoalStrategy;
	reconciledInterruptedStrategy?: GoalStrategy;
	approvalGate?: {
		decisionId: string;
		blocker: string;
		strategy: GoalStrategy;
		saferAlternativeUsed: boolean;
	};
};

export type GoalValidationEvidence = {
	command: string;
	passed: boolean;
	recordedAt: string;
	summary?: string;
};

export type GoalConditionJudgmentReceipt = {
	id: string;
	evidence: string;
	passed: true;
};

export type GoalMergeReceipt = {
	version: 1;
	primaryGitDir: string;
	primaryWorktree: string;
	primaryBranch: string;
	initialBaseline: string;
	mergedCommit: string;
	archivedPlanPath: string;
	archivedPlanBlob: string;
	artifacts: string[];
	report: {
		summary: string;
		validation: string;
		knownGaps: string;
		nextSteps: string;
		conditionJudgments: GoalConditionJudgmentReceipt[];
		integrationJudgment: string;
	};
};

export type UnattendedGoal = {
	schemaVersion: 1;
	id: string;
	mode: GoalMode;
	state: GoalPublicState;
	startedAt: string;
	updatedAt: string;
	workspace: string;
	scope: string[];
	summary: string;
	preview: string;
	objectiveHash: string;
	objectiveText?: string;
	objectivePath?: string;
	objectiveSizeBytes?: number;
	plans: string[];
	items: Record<string, GoalWorkItem>;
	conditions: GoalCondition[];
	conditionMode: GoalConditionMode;
	completionContract: {
		requireLinkedPlanTasks: true;
		requireLinkedRootTasks: true;
		requireValidationEvidence: true;
		requireRepositoryState: true;
	};
	validations: GoalValidationEvidence[];
	changedArtifacts: string[];
	blockers: string[];
	knownGaps: string[];
	completedAt?: string;
	stoppedAt?: string;
	finalHead?: string;
	finalBranch?: string;
	finalWorktree?: string;
	closeoutState?: "archived_pending_commit";
	archivedPlanPath?: string;
	mergeReceipt?: GoalMergeReceipt;
	closeout?: string;
};

const REEVALUATION_OUTCOMES = new Set<GoalFailureOutcome>([
	"error",
	"inconclusive",
	"schema_invalid",
	"verifier_contradiction",
	"not_found",
	"infrastructure_failure",
	"capability_rejected",
	"damage_control_denied",
]);

const STRATEGY_KEYS: Array<keyof GoalStrategy> = [
	"agent",
	"capabilities",
	"evidenceSource",
	"inputPartition",
	"testedAssumption",
	"toolApproach",
	"validationMethod",
];

export const RECOVERY_ATTEMPT_LIMIT = 2;

function normalizedStrategy(strategy: GoalStrategy): GoalStrategy {
	return Object.fromEntries(
		STRATEGY_KEYS.flatMap((key) => {
			const value = strategy[key]?.trim();
			return value ? [[key, value]] : [];
		}),
	) as GoalStrategy;
}

function sameStrategy(left: GoalStrategy, right: GoalStrategy): boolean {
	return STRATEGY_KEYS.every(
		(key) => (left[key]?.trim() ?? "") === (right[key]?.trim() ?? ""),
	);
}

function hasStrategyComponent(strategy: GoalStrategy): boolean {
	return STRATEGY_KEYS.some((key) => Boolean(strategy[key]?.trim()));
}

export function goalStrategiesMateriallyDiffer(
	left: GoalStrategy,
	right: GoalStrategy,
): boolean {
	return hasStrategyComponent(left) && !sameStrategy(left, right);
}

export function createGoalWorkItem(
	key: string,
	taskId: string,
	required = true,
): GoalWorkItem {
	return {
		key,
		taskId,
		required,
		qualifyingFailures: 0,
		phase: "ordinary",
		recoveryStrategies: [],
	};
}

export function beginGoalAttempt(
	item: GoalWorkItem,
	input: {
		attemptId: string;
		ownerPid: number;
		ownerInstanceId: string;
		startedAt: string;
		strategy: GoalStrategy;
	},
): GoalWorkItem {
	if (item.activeAttempt)
		throw new Error(`work item ${item.key} already has an active attempt`);
	if (item.phase === "re_evaluation_required")
		throw new Error(
			`work item ${item.key} requires autonomous re-evaluation before another attempt`,
		);
	if (item.phase === "needs_operator")
		throw new Error(`work item ${item.key} needs operator input`);
	const strategy = normalizedStrategy(input.strategy);
	const recovery = item.phase === "recovery_ready";
	if (recovery) {
		if (!hasStrategyComponent(strategy))
			throw new Error("recovery strategy must change a deterministic component");
		if (
			item.lastOrdinaryStrategy &&
			sameStrategy(strategy, item.lastOrdinaryStrategy)
		)
			throw new Error(
				"recovery strategy must differ from the suspended ordinary strategy",
			);
		if (item.recoveryStrategies.some((prior) => sameStrategy(prior, strategy)))
			throw new Error("recovery strategy must differ from prior recovery attempts");
		if (item.recoveryStrategies.length >= RECOVERY_ATTEMPT_LIMIT)
			throw new Error(`work item ${item.key} needs operator input`);
	}
	return {
		...item,
		activeAttempt: {
			id: input.attemptId,
			ownerPid: input.ownerPid,
			ownerInstanceId: input.ownerInstanceId,
			startedAt: input.startedAt,
			strategy,
			recovery,
		},
	};
}

export function recordGoalOutcome(
	item: GoalWorkItem,
	outcome: GoalFailureOutcome,
): GoalWorkItem {
	const attempt = item.activeAttempt;
	if (!attempt)
		throw new Error(`work item ${item.key} has no active attempt to settle`);
	const next: GoalWorkItem = {
		...item,
		lastOutcome: outcome,
	};
	delete next.activeAttempt;

	if (outcome === "success") {
		return {
			...next,
			qualifyingFailures: 0,
			phase: "ordinary",
			recoveryStrategies: [],
		};
	}
	if (!REEVALUATION_OUTCOMES.has(outcome)) return next;

	next.qualifyingFailures += 1;
	if (!attempt.recovery) {
		next.lastOrdinaryStrategy = attempt.strategy;
		next.phase = "re_evaluation_required";
		return next;
	}

	next.recoveryStrategies = [...next.recoveryStrategies, attempt.strategy];
	if (next.recoveryStrategies.length >= RECOVERY_ATTEMPT_LIMIT) {
		next.phase = "needs_operator";
		next.needsOperatorReason =
			"recovery_exhausted: two materially different recovery attempts failed";
		next.wait = {
			reason: "recovery_exhausted",
			evidence: "Two materially different recovery attempts returned non-success outcomes.",
			operatorAction: "Choose a new strategy, change the objective, or stop this work item.",
			recordedAt: new Date().toISOString(),
		};
	} else {
		next.phase = "re_evaluation_required";
	}
	return next;
}

export function recordGoalReEvaluation(
	item: GoalWorkItem,
	input: { evidence: string; assumptions: string; strategy: string; at: string },
): GoalWorkItem {
	if (item.phase !== "re_evaluation_required")
		throw new Error(`work item ${item.key} does not require re-evaluation`);
	for (const [label, value] of [
		["evidence", input.evidence],
		["assumptions", input.assumptions],
		["strategy", input.strategy],
	] as const)
		if (!value.trim()) throw new Error(`re-evaluation ${label} is required`);
	return {
		...item,
		phase: "recovery_ready",
		reEvaluation: {
			recordedAt: input.at,
			evidence: input.evidence.trim(),
			assumptions: input.assumptions.trim(),
			strategy: input.strategy.trim(),
		},
	};
}

export function recordGoalWait(
	item: GoalWorkItem,
	input: {
		reason: GoalWaitReason;
		evidence: string;
		operatorAction: string;
		at: string;
	},
): GoalWorkItem {
	if (item.activeAttempt)
		throw new Error(`work item ${item.key} has an active attempt to settle first`);
	const evidence = input.evidence.trim();
	const operatorAction = input.operatorAction.trim();
	if (!evidence) throw new Error("terminal wait evidence is required");
	if (!operatorAction) throw new Error("terminal wait operator action is required");
	if (evidence.length > 500 || operatorAction.length > 500)
		throw new Error("terminal wait evidence and operator action must be at most 500 characters");
	return {
		...item,
		phase: "needs_operator",
		needsOperatorReason: `${input.reason}: ${evidence}`,
		wait: {
			reason: input.reason,
			evidence,
			operatorAction,
			recordedAt: input.at,
		},
	};
}

export function goalFailureQualifies(outcome: GoalFailureOutcome): boolean {
	return REEVALUATION_OUTCOMES.has(outcome);
}

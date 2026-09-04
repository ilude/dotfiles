import fs from "node:fs";

export type PlanVerificationType = "deterministic" | "live";

export type LiveAttemptLedgerRow = {
	task: string;
	attempt: string;
	preconditions: string;
	result: string;
	cleanup: string;
	disposition: string;
};

export type LinkedPlanTask = {
	key: string;
	summary: string;
	checked: boolean;
	state?: string;
	doneWhen?: string;
	verify?: string;
	verificationType: PlanVerificationType;
	maxAttempts?: number;
	session?: string;
	terminalOutcomes?: string[];
	required: boolean;
	dependsOn: string[];
	line: number;
};

export type LinkedPlanState = {
	path: string;
	tasks: LinkedPlanTask[];
	liveAttemptLedger: LiveAttemptLedgerRow[];
	complete: boolean;
	blockers: string[];
};

export type PlanTaskSelection =
	| { task?: LinkedPlanTask; operatorDecision?: undefined }
	| { task: LinkedPlanTask; operatorDecision: string };

export type PersistedPlanRoutingState = {
	status?: string;
	executionState?: string;
	complete: boolean;
	needsReconciliation: boolean;
};

function persistedValue(value: string): string {
	return value.replace(/\s+#.*$/, "").trim().replace(/^(["'])(.*)\1$/, "$2").toLowerCase();
}

export function parsePersistedPlanRoutingState(content: string): PersistedPlanRoutingState {
	const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	const status = frontmatter?.[1].match(/^status:\s*(\S.*)$/im)?.[1];
	const execution = content.split("## Execution Status", 2)[1] ?? "";
	const executionState = execution.match(/^\s*-\s+State:\s*(\S.*)$/im)?.[1];
	const normalizedStatus = status === undefined ? undefined : persistedValue(status);
	const normalizedExecutionState = executionState === undefined ? undefined : persistedValue(executionState);
	const statusComplete = normalizedStatus === "complete" || normalizedStatus === "completed";
	const executionComplete = normalizedExecutionState === "complete" || normalizedExecutionState === "completed";
	return {
		status: normalizedStatus,
		executionState: normalizedExecutionState,
		complete: normalizedStatus === undefined ? executionComplete : statusComplete,
		needsReconciliation:
			normalizedStatus !== undefined &&
			normalizedExecutionState !== undefined &&
			statusComplete !== executionComplete,
	};
}

const TASK_PATTERN = /^\s*- \[([ xX])\]\s+\*\*([A-Za-z][A-Za-z0-9_-]*):\s*([^*]+)\*\*/;
const STATE_PATTERN = /^\s*-\s+State:\s*(\S.*)$/i;
const OPTIONAL_PATTERN = /^\s*-\s+(?:Required:\s*false|Optional:\s*true)\s*$/i;
const DEPENDS_ON_PATTERN = /^\s*-\s+Depends on:\s*(\S.*)$/i;
const DONE_WHEN_PATTERN = /^\s*-\s+Done when:\s*(\S.*)$/i;
const VERIFY_PATTERN = /^\s*-\s+Verify:\s*(?:(deterministic|live)\s+)?(\S.*)$/i;
const MAX_ATTEMPTS_PATTERN = /^\s*-\s+Max attempts:\s*(\S.*)$/i;
const SESSION_PATTERN = /^\s*-\s+Session:\s*(\S.*)$/i;
const TERMINAL_OUTCOMES_PATTERN = /^\s*-\s+Terminal outcomes:\s*(\S.*)$/i;
const LIVE_LEDGER_HEADING = "## Live attempt ledger";
const NONTERMINAL_STATES = new Set([
	"active",
	"blocked",
	"in_progress",
	"in-progress",
	"pending",
	"running",
]);

function validateTaskGraph(tasks: LinkedPlanTask[]): void {
	const keys = new Set<string>();
	for (const task of tasks) {
		if (keys.has(task.key)) throw new Error(`duplicate plan task key: ${task.key}`);
		keys.add(task.key);
	}
	for (const task of tasks) {
		if (task.dependsOn.includes(task.key))
			throw new Error(`plan task ${task.key} cannot depend on itself`);
		for (const dependency of task.dependsOn)
			if (!keys.has(dependency))
				throw new Error(
					`plan task ${task.key} has missing dependency: ${dependency}`,
				);
	}
	const visiting = new Set<string>();
	const visited = new Set<string>();
	const byKey = new Map(tasks.map((task) => [task.key, task] as const));
	const visit = (key: string): void => {
		if (visited.has(key)) return;
		if (visiting.has(key)) throw new Error(`plan task dependency cycle includes ${key}`);
		visiting.add(key);
		for (const dependency of byKey.get(key)?.dependsOn ?? []) visit(dependency);
		visiting.delete(key);
		visited.add(key);
	};
	for (const task of tasks) visit(task.key);
}

function parseLiveAttemptLedger(content: string): LiveAttemptLedgerRow[] {
	const section = content.split(LIVE_LEDGER_HEADING, 2)[1]?.split(/^## /m, 1)[0];
	if (!section) return [];
	const tableLines = section.split(/\r?\n/).filter((line) => /^\s*\|.*\|\s*$/.test(line));
	const headerIndex = tableLines.findIndex((line) => {
		const cells = line.split("|").slice(1, -1).map((cell) => cell.trim().toLowerCase());
		return cells.join("|") === "task|attempt|preconditions|result|cleanup|disposition";
	});
	if (headerIndex < 0) return [];
	return tableLines.slice(headerIndex + 2).flatMap((line) => {
		const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
		if (cells.length !== 6 || cells.every((cell) => /^-+$/.test(cell))) return [];
		return [{ task: cells[0], attempt: cells[1], preconditions: cells[2], result: cells[3], cleanup: cells[4], disposition: cells[5] }];
	});
}

function liveTaskRejected(task: LinkedPlanTask, ledger: LiveAttemptLedgerRow[]): boolean {
	return task.verificationType === "live" && ledger.some(
		(row) => row.task.toLowerCase() === task.key.toLowerCase() && row.result.toLowerCase() === "rejected",
	);
}

export function parseLinkedPlan(path: string, content: string): LinkedPlanState {
	const lines = content.split(/\r?\n/);
	const liveAttemptLedger = parseLiveAttemptLedger(content);
	const tasks: LinkedPlanTask[] = [];
	let current: LinkedPlanTask | undefined;
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		const taskMatch = line.match(TASK_PATTERN);
		if (taskMatch) {
			current = {
				key: taskMatch[2],
				summary: taskMatch[3].trim(),
				checked: taskMatch[1].toLowerCase() === "x",
				verificationType: "deterministic",
				required: true,
				dependsOn: [],
				line: index + 1,
			};
			tasks.push(current);
			continue;
		}
		if (!current) continue;
		const stateMatch = line.match(STATE_PATTERN);
		if (stateMatch) current.state = stateMatch[1].trim().toLowerCase();
		const doneWhenMatch = line.match(DONE_WHEN_PATTERN);
		if (doneWhenMatch) current.doneWhen = doneWhenMatch[1].trim();
		const verifyMatch = line.match(VERIFY_PATTERN);
		if (verifyMatch) {
			current.verificationType = verifyMatch[1]?.toLowerCase() === "live" ? "live" : "deterministic";
			current.verify = verifyMatch[2].trim();
		}
		const maxAttemptsMatch = line.match(MAX_ATTEMPTS_PATTERN);
		if (maxAttemptsMatch && /^\d+$/.test(maxAttemptsMatch[1]))
			current.maxAttempts = Number.parseInt(maxAttemptsMatch[1], 10);
		const sessionMatch = line.match(SESSION_PATTERN);
		if (sessionMatch) current.session = sessionMatch[1].trim();
		const terminalOutcomesMatch = line.match(TERMINAL_OUTCOMES_PATTERN);
		if (terminalOutcomesMatch)
			current.terminalOutcomes = terminalOutcomesMatch[1].split("|").map((outcome) => outcome.trim().toLowerCase()).filter(Boolean);
		if (OPTIONAL_PATTERN.test(line)) current.required = false;
		const dependencyMatch = line.match(DEPENDS_ON_PATTERN);
		if (dependencyMatch) {
			const value = dependencyMatch[1].trim();
			current.dependsOn = /^(?:none|n\/a)$/i.test(value)
				? []
				: value
						.split(",")
						.map((dependency) => dependency.trim())
						.filter(Boolean);
			if (new Set(current.dependsOn).size !== current.dependsOn.length)
				throw new Error(`plan task ${current.key} has duplicate dependencies`);
		}
	}
	validateTaskGraph(tasks);
	const required = tasks.filter((task) => task.required);
	const blockers = required.flatMap((task) => {
		const state = task.state ? ` (${task.state})` : "";
		if (!task.checked && !liveTaskRejected(task, liveAttemptLedger))
			return [`${task.key}${state} is not complete`];
		if (task.state && NONTERMINAL_STATES.has(task.state))
			return [`${task.key}${state} is not terminal`];
		return [];
	});
	if (tasks.length === 0) blockers.push("plan has no executable task checklist");
	return { path, tasks, liveAttemptLedger, complete: blockers.length === 0, blockers };
}

export function selectNextPlanTask(plan: LinkedPlanState): PlanTaskSelection {
	const completed = new Set(
		plan.tasks.filter((task) => task.checked || liveTaskRejected(task, plan.liveAttemptLedger)).map((task) => task.key),
	);
	const task = plan.tasks.find(
		(candidate) => candidate.required && !completed.has(candidate.key) && candidate.dependsOn.every((dependency) => completed.has(dependency)),
	);
	if (!task || task.verificationType !== "live" || task.maxAttempts === undefined)
		return { task };
	const rows = plan.liveAttemptLedger.filter((row) => row.task.toLowerCase() === task.key.toLowerCase());
	const authorized = rows.filter((row) => row.disposition.toLowerCase().startsWith("operator authorized")).length;
	const effectiveCap = task.maxAttempts + authorized;
	if (rows.length < effectiveCap) return { task };
	return {
		task,
		operatorDecision: `${task.key} has ${rows.length} recorded live attempts against an effective cap of ${effectiveCap}. Ask the operator whether to authorize one additional attempt or accept a terminal outcome.`,
	};
}

export function readLinkedPlan(path: string): LinkedPlanState {
	return parseLinkedPlan(path, fs.readFileSync(path, "utf8"));
}

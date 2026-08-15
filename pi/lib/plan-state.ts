import fs from "node:fs";

export type LinkedPlanTask = {
	key: string;
	summary: string;
	checked: boolean;
	state?: string;
	required: boolean;
	dependsOn: string[];
	line: number;
};

export type LinkedPlanState = {
	path: string;
	tasks: LinkedPlanTask[];
	complete: boolean;
	blockers: string[];
};

const TASK_PATTERN = /^\s*- \[([ xX])\]\s+\*\*([A-Za-z][A-Za-z0-9_-]*):\s*([^*]+)\*\*/;
const STATE_PATTERN = /^\s*-\s+State:\s*(\S.*)$/i;
const OPTIONAL_PATTERN = /^\s*-\s+(?:Required:\s*false|Optional:\s*true)\s*$/i;
const DEPENDS_ON_PATTERN = /^\s*-\s+Depends on:\s*(\S.*)$/i;
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

export function parseLinkedPlan(path: string, content: string): LinkedPlanState {
	const lines = content.split(/\r?\n/);
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
		if (!task.checked) return [`${task.key}${state} is not complete`];
		if (task.state && NONTERMINAL_STATES.has(task.state))
			return [`${task.key}${state} is not terminal`];
		return [];
	});
	if (tasks.length === 0) blockers.push("plan has no executable task checklist");
	return { path, tasks, complete: blockers.length === 0, blockers };
}

export function readLinkedPlan(path: string): LinkedPlanState {
	return parseLinkedPlan(path, fs.readFileSync(path, "utf8"));
}

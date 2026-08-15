import fs from "node:fs";

export type LinkedPlanTask = {
	key: string;
	summary: string;
	checked: boolean;
	state?: string;
	required: boolean;
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
const NONTERMINAL_STATES = new Set([
	"active",
	"blocked",
	"in_progress",
	"in-progress",
	"pending",
	"running",
]);

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
				line: index + 1,
			};
			tasks.push(current);
			continue;
		}
		if (!current) continue;
		const stateMatch = line.match(STATE_PATTERN);
		if (stateMatch) current.state = stateMatch[1].trim().toLowerCase();
		if (OPTIONAL_PATTERN.test(line)) current.required = false;
	}
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

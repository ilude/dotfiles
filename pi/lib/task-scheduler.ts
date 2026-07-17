import type { TaskRecordV1 } from "./task-registry.ts";
import { enforcedToolsAreReadOnly } from "./tool-capabilities.ts";

export interface ScheduledTask {
	record: TaskRecordV1;
	readOnly: boolean;
}

function staticScopePrefix(scope: string): string {
	const wildcard = scope.search(/[*?[\]{}]/);
	return (wildcard < 0 ? scope : scope.slice(0, wildcard)).replace(/\/+$/, "");
}

export function scopesOverlap(left: string, right: string): boolean {
	const leftPrefix = staticScopePrefix(left);
	const rightPrefix = staticScopePrefix(right);
	if (!leftPrefix || !rightPrefix) return true;
	return (
		leftPrefix === rightPrefix ||
		leftPrefix.startsWith(`${rightPrefix}/`) ||
		rightPrefix.startsWith(`${leftPrefix}/`)
	);
}

export function scheduledTasksConflict(
	left: ScheduledTask,
	right: ScheduledTask,
): boolean {
	if (left.readOnly || right.readOnly) return false;
	const leftScope = left.record.scope;
	const rightScope = right.record.scope;
	if (!leftScope?.length || !rightScope?.length) return true;
	return leftScope.some((leftEntry) =>
		rightScope.some((rightEntry) => scopesOverlap(leftEntry, rightEntry)),
	);
}

export function executionIsReadOnly(
	record: TaskRecordV1,
	resolveAgentTools: (agent: string) => readonly string[] | undefined,
): boolean {
	const execution = record.execution;
	if (execution?.kind !== "subagent") return false;
	return enforcedToolsAreReadOnly(resolveAgentTools(execution.agent));
}

export function criticalPathDepths(
	records: readonly TaskRecordV1[],
): Map<string, number> {
	const byId = new Map(records.map((record) => [record.id, record]));
	const dependents = new Map<string, string[]>();
	for (const record of records) {
		for (const blocker of record.blockedBy ?? []) {
			if (!byId.has(blocker)) continue;
			const current = dependents.get(blocker) ?? [];
			current.push(record.id);
			dependents.set(blocker, current);
		}
	}
	const depths = new Map<string, number>();
	const depth = (id: string): number => {
		const cached = depths.get(id);
		if (cached !== undefined) return cached;
		const children = dependents.get(id) ?? [];
		const value = children.length
			? 1 + Math.max(...children.map((child) => depth(child)))
			: 0;
		depths.set(id, value);
		return value;
	};
	for (const record of records) depth(record.id);
	return depths;
}

export function sortCriticalPathFirst(
	ready: readonly TaskRecordV1[],
	allRecords: readonly TaskRecordV1[],
): TaskRecordV1[] {
	const depths = criticalPathDepths(allRecords);
	return [...ready].sort((left, right) => {
		const depthDifference =
			(depths.get(right.id) ?? 0) - (depths.get(left.id) ?? 0);
		if (depthDifference !== 0) return depthDifference;
		const createdDifference = left.createdAt.localeCompare(right.createdAt);
		return createdDifference || left.id.localeCompare(right.id);
	});
}

export type EdgeKind =
	| "exact"
	| "deterministic"
	| "unique_inferred"
	| "unmatched";
export type CorrelationRecord = Readonly<
	Record<string, string | number | null | undefined>
>;

export type CorrelationEdge = {
	left: string;
	right: string | null;
	kind: EdgeKind;
	provenance: "direct" | "legacy" | "inference" | "none";
	ambiguity_count: number;
};

export type EdgeRule = {
	scope?: string;
	windowMs: number;
	directional: "forward" | "backward" | "either";
	exactKeys?: readonly string[];
	deterministicKeys?: readonly string[];
	sharedExactKeys?: readonly string[];
	sharedDeterministicKeys?: readonly string[];
	leftIdKey: string;
	rightIdKey: string;
};

function field(record: CorrelationRecord, key: string): string | undefined {
	const value = record[key];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function timestamp(record: CorrelationRecord): number | undefined {
	for (const key of ["timestamp", "ts", "occurred_at", "created_at"]) {
		const value = field(record, key);
		if (!value) continue;
		const parsed = Date.parse(value);
		if (!Number.isNaN(parsed)) return parsed;
	}
	return undefined;
}

function inWindow(
	left: CorrelationRecord,
	right: CorrelationRecord,
	rule: EdgeRule,
): boolean {
	const leftTime = timestamp(left);
	const rightTime = timestamp(right);
	if (leftTime === undefined || rightTime === undefined) return false;
	const delta = rightTime - leftTime;
	if (rule.directional === "forward")
		return delta >= 0 && delta <= rule.windowMs;
	if (rule.directional === "backward")
		return delta <= 0 && -delta <= rule.windowMs;
	return Math.abs(delta) <= rule.windowMs;
}

function sameScope(
	left: CorrelationRecord,
	right: CorrelationRecord,
	scope: string | undefined,
): boolean {
	if (!scope) return true;
	const leftValue = field(left, scope);
	return leftValue !== undefined && leftValue === field(right, scope);
}

function sharedKeyCompatible(left: CorrelationRecord, right: CorrelationRecord, key: string): boolean {
	if (key !== "id") return true;
	const leftNamespace = field(left, "namespace") ?? field(left, "source_namespace");
	const rightNamespace = field(right, "namespace") ?? field(right, "source_namespace");
	return leftNamespace === undefined || rightNamespace === undefined || leftNamespace === rightNamespace;
}

export function correlateEdges(
	leftRecords: readonly CorrelationRecord[],
	rightRecords: readonly CorrelationRecord[],
	rule: EdgeRule,
): CorrelationEdge[] {
	const normalizedLeft = leftRecords.map(normalizeLegacyIds);
	const normalizedRight = rightRecords.map(normalizeLegacyIds);
	const exactKeys = rule.sharedExactKeys ?? rule.exactKeys ?? [];
	const deterministicKeys = rule.sharedDeterministicKeys ?? rule.deterministicKeys ?? [];
	return normalizedLeft.map((left, index) => {
		const leftId = field(left, rule.leftIdKey) ?? `left-${index}`;
		const exact = exactKeys
			.flatMap((key) => {
				const value = field(left, key);
				return value
					? normalizedRight.filter((right) => sameScope(left, right, rule.scope) && sharedKeyCompatible(left, right, key) && field(right, key) === value)
					: [];
			})
			.filter((right, position, rows) => rows.indexOf(right) === position);
		if (exact.length === 1) {
			return {
				left: leftId,
				right: field(exact[0], rule.rightIdKey) ?? null,
				kind: "exact",
				provenance: "direct",
				ambiguity_count: 0,
			};
		}
		if (exact.length > 1) return unmatched(leftId, exact.length);

		const deterministic = deterministicKeys
			.flatMap((key) => {
				const value = field(left, key);
				return value
					? normalizedRight.filter((right) => sameScope(left, right, rule.scope) && sharedKeyCompatible(left, right, key) && field(right, key) === value)
					: [];
			})
			.filter((right, position, rows) => rows.indexOf(right) === position);
		if (deterministic.length === 1) {
			return {
				left: leftId,
				right: field(deterministic[0], rule.rightIdKey) ?? null,
				kind: "deterministic",
				provenance: "direct",
				ambiguity_count: 0,
			};
		}
		if (deterministic.length > 1)
			return unmatched(leftId, deterministic.length);

		const candidates = normalizedRight.filter(
			(right) =>
				sameScope(left, right, rule.scope) && inWindow(left, right, rule),
		);
		if (candidates.length === 1) {
			return {
				left: leftId,
				right: field(candidates[0], rule.rightIdKey) ?? null,
				kind: "unique_inferred",
				provenance: "inference",
				ambiguity_count: 0,
			};
		}
		return unmatched(leftId, candidates.length);
	});
}

function unmatched(left: string, ambiguityCount: number): CorrelationEdge {
	return {
		left,
		right: null,
		kind: "unmatched",
		provenance: "none",
		ambiguity_count: ambiguityCount,
	};
}

export function edgeIsDecisionSafe(
	edge: CorrelationEdge,
): edge is CorrelationEdge & { right: string } {
	return (
		edge.right !== null &&
		(edge.kind === "exact" || edge.kind === "deterministic")
	);
}

export function normalizeLegacyIds(record: CorrelationRecord): CorrelationRecord {
	const aliases: Record<string, string> = {
		session: "session_id",
		turn: "turn_id",
		trace: "trace_id",
		toolCallId: "tool_call_id",
		workflowEpisodeId: "workflow_episode_id",
	};
	const normalized = { ...record } as Record<string, string | number | null | undefined>;
	for (const [legacy, current] of Object.entries(aliases)) {
		if (normalized[current] === undefined && normalized[legacy] !== undefined)
			normalized[current] = normalized[legacy];
	}
	return normalized;
}

export interface LizardFunctionMetrics {
	name: string;
	signature?: string;
	ccn: number;
	parameters: number;
	length: number;
	startLine: number;
}

export interface LizardThresholds {
	ccn: number;
	parameters: number;
	length: number;
}

export interface LizardViolation {
	functionName: string;
	metric: keyof LizardThresholds;
	current: number;
	baseline?: number;
	limit: number;
}

export const LIZARD_THRESHOLDS: LizardThresholds = {
	ccn: 8,
	length: 250,
	parameters: 7,
};

function splitCsvLine(line: string): string[] {
	const fields: string[] = [];
	let field = "";
	let quoted = false;
	for (let index = 0; index < line.length; index++) {
		const character = line[index];
		if (character === '"') {
			if (quoted && line[index + 1] === '"') {
				field += character;
				index++;
			} else quoted = !quoted;
		} else if (character === "," && !quoted) {
			fields.push(field);
			field = "";
		} else field += character;
	}
	fields.push(field);
	return fields;
}

export function parseLizardCsv(output: string): LizardFunctionMetrics[] {
	return output
		.split(/\r?\n/)
		.filter(Boolean)
		.map(splitCsvLine)
		.map((fields) => ({
			name: fields[7] ?? "",
			signature: fields[8] ?? "",
			ccn: Number(fields[1]),
			parameters: Number(fields[3]),
			length: Number(fields[4]),
			startLine: Number(fields[9]),
		}))
		.filter(
			(metric) =>
				metric.name.length > 0 &&
				Number.isFinite(metric.ccn) &&
				Number.isFinite(metric.parameters) &&
				Number.isFinite(metric.length) &&
				Number.isFinite(metric.startLine),
		);
}

export type BaselineLineMapper = (baselineLine: number) => number | undefined;

interface DiffHunk {
	oldStart: number;
	oldCount: number;
	newCount: number;
}

export function parseGitDiffLineMapper(output: string): BaselineLineMapper {
	const hunks: DiffHunk[] = [];
	for (const line of output.split(/\r?\n/)) {
		const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
		if (!match) continue;
		hunks.push({
			oldStart: Number(match[1]),
			oldCount: match[2] === undefined ? 1 : Number(match[2]),
			newCount: match[4] === undefined ? 1 : Number(match[4]),
		});
	}
	return (baselineLine) => {
		let delta = 0;
		for (const hunk of hunks) {
			if (hunk.oldCount === 0) {
				if (baselineLine > hunk.oldStart) delta += hunk.newCount;
				continue;
			}
			const oldEnd = hunk.oldStart + hunk.oldCount - 1;
			if (baselineLine < hunk.oldStart) break;
			if (baselineLine <= oldEnd) return undefined;
			delta += hunk.newCount - hunk.oldCount;
		}
		return baselineLine + delta;
	};
}

interface IndexedLizardMetric {
	index: number;
	metric: LizardFunctionMetrics;
}

function groupBaselineMetrics(
	baseline: LizardFunctionMetrics[],
): Map<string, LizardFunctionMetrics[]> {
	const groups = new Map<string, LizardFunctionMetrics[]>();
	for (const metric of baseline) {
		const group = groups.get(metric.name) ?? [];
		group.push(metric);
		groups.set(metric.name, group);
	}
	return groups;
}

function groupCurrentMetrics(
	current: LizardFunctionMetrics[],
): Map<string, IndexedLizardMetric[]> {
	const groups = new Map<string, IndexedLizardMetric[]>();
	current.forEach((metric, index) => {
		const group = groups.get(metric.name) ?? [];
		group.push({ index, metric });
		groups.set(metric.name, group);
	});
	return groups;
}

function matchMappedMetrics(
	available: LizardFunctionMetrics[],
	unmatched: IndexedLizardMetric[],
	lineMapper: BaselineLineMapper,
	matches: Map<number, LizardFunctionMetrics>,
): void {
	for (
		let baselineIndex = available.length - 1;
		baselineIndex >= 0;
		baselineIndex--
	) {
		const mappedLine = lineMapper(available[baselineIndex].startLine);
		if (mappedLine === undefined) continue;
		const currentIndex = unmatched.findIndex(
			(item) => item.metric.startLine === mappedLine,
		);
		if (currentIndex < 0) continue;
		const [currentMatch] = unmatched.splice(currentIndex, 1);
		matches.set(currentMatch.index, available.splice(baselineIndex, 1)[0]);
	}
}

const isCompatibleFallback = (
	current: LizardFunctionMetrics,
	baseline: LizardFunctionMetrics,
): boolean =>
	current.signature === baseline.signature ||
	current.startLine === baseline.startLine;

function matchBaselineMetrics(
	current: LizardFunctionMetrics[],
	baseline: LizardFunctionMetrics[],
	lineMapper?: BaselineLineMapper,
): Map<number, LizardFunctionMetrics> {
	const baselineGroups = groupBaselineMetrics(baseline);
	const matches = new Map<number, LizardFunctionMetrics>();
	for (const [name, currentGroup] of groupCurrentMetrics(current)) {
		const available = [...(baselineGroups.get(name) ?? [])];
		const unmatched = [...currentGroup];
		if (lineMapper)
			matchMappedMetrics(available, unmatched, lineMapper, matches);
		if (
			unmatched.length === 1 &&
			available.length === 1 &&
			isCompatibleFallback(unmatched[0].metric, available[0])
		)
			matches.set(unmatched[0].index, available[0]);
	}
	return matches;
}

export function evaluateDifferentialLizard(
	current: LizardFunctionMetrics[],
	baseline: LizardFunctionMetrics[] | undefined,
	thresholds: LizardThresholds = LIZARD_THRESHOLDS,
	lineMapper?: BaselineLineMapper,
): LizardViolation[] {
	const baselineMatches = matchBaselineMetrics(
		current,
		baseline ?? [],
		lineMapper,
	);
	const violations: LizardViolation[] = [];
	current.forEach((currentMetric, index) => {
		const previous = baselineMatches.get(index);
		for (const metric of Object.keys(thresholds) as Array<
			keyof LizardThresholds
		>) {
			const value = currentMetric[metric];
			const limit = thresholds[metric];
			const baselineValue = previous?.[metric];
			if (
				value > limit &&
				(baselineValue === undefined || value > baselineValue)
			) {
				violations.push({
					functionName: currentMetric.name,
					metric,
					current: value,
					...(baselineValue === undefined ? {} : { baseline: baselineValue }),
					limit,
				});
			}
		}
	});
	return violations;
}

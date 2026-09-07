export const CLAUDE_FAMILIES = ["fable", "opus", "sonnet", "haiku"] as const;
export type ClaudeFamily = (typeof CLAUDE_FAMILIES)[number];

const CLAUDE_MINIMUM_MAJOR: Record<ClaudeFamily, number> = {
	fable: 5,
	opus: 5,
	sonnet: 5,
	haiku: 4,
};
const GPT_VARIANTS = ["sol", "terra", "luna", ""] as const;

type VersionedModel = {
	id: string;
	version: number[];
	snapshot?: boolean;
};

function compareVersion(left: number[], right: number[]): number {
	const length = Math.max(left.length, right.length);
	for (let index = 0; index < length; index++) {
		const delta = (left[index] ?? 0) - (right[index] ?? 0);
		if (delta !== 0) return delta;
	}
	return 0;
}

function latest<T extends VersionedModel>(models: T[]): T | undefined {
	return models.sort((left, right) => {
		const version = compareVersion(left.version, right.version);
		if (version !== 0) return version;
		if (left.snapshot !== right.snapshot) return left.snapshot ? -1 : 1;
		return left.id.localeCompare(right.id);
	}).at(-1);
}

export function selectLatestClaudeModelIds(
	modelIds: readonly string[],
	namespace: "anthropic" | "us.anthropic",
	minimumMajor?: number,
): string[] {
	const escapedNamespace = namespace.replaceAll(".", "[.]");
	const pattern = new RegExp(
		`^${escapedNamespace}[.]claude-(fable|opus|sonnet|haiku)-(\\d+(?:-\\d+)*?)(?:(?:-(\\d{8}))?(?:-v\\d+:\\d+)?)?$`,
	);
	const candidates = modelIds.flatMap((id) => {
		const match = pattern.exec(id);
		if (!match?.[1] || !match[2]) return [];
		const family = match[1] as ClaudeFamily;
		const version = match[2]
			.split("-")
			.map((part) => Number.parseInt(part, 10));
		const requiredMajor = minimumMajor ?? CLAUDE_MINIMUM_MAJOR[family];
		if ((version[0] ?? 0) < requiredMajor) return [];
		return [{ id, family, version, snapshot: match[3] !== undefined }];
	});

	return CLAUDE_FAMILIES.flatMap((family) => {
		const selected = latest(
			candidates.filter((candidate) => candidate.family === family),
		);
		return selected ? [selected.id] : [];
	});
}

export function selectLatestGptModelIds(
	modelIds: readonly string[],
	minimumVersion: readonly [number, number] = [5, 6],
): string[] {
	const candidates = modelIds.flatMap((id) => {
		const match = /^openai[.]gpt-(\d+)[.](\d+)(?:-(luna|terra|sol))?$/.exec(id);
		if (!match?.[1] || !match[2]) return [];
		const version: [number, number] = [
			Number.parseInt(match[1], 10),
			Number.parseInt(match[2], 10),
		];
		if (compareVersion(version, [...minimumVersion]) < 0) return [];
		return [{ id, variant: match[3] ?? "", version }];
	});
	const newest = latest(candidates);
	if (!newest) return [];

	return GPT_VARIANTS.flatMap((variant) => {
		const selected = candidates.find(
			(candidate) =>
				candidate.variant === variant &&
				compareVersion(candidate.version, newest.version) === 0,
		);
		return selected ? [selected.id] : [];
	});
}

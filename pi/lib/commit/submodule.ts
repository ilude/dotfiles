function normalizedPath(value: string): string {
	return value.replaceAll("\\", "/");
}

export function dirtyOnlySubmodulePaths(rawDiffIndex: string): Set<string> {
	const records = rawDiffIndex.split("\0").filter(Boolean);
	const dirtyOnly = new Set<string>();
	for (let index = 0; index < records.length; ) {
		const header = records[index++] ?? "";
		if (!header.startsWith(":")) continue;
		const parts = header.slice(1).split(" ");
		const [oldMode, newMode, oldOid, newOid, rawStatus] = parts;
		const firstPath = records[index++] ?? "";
		const status = rawStatus?.[0] ?? "";
		if (status === "R" || status === "C") index += 1;
		if (
			status === "M" &&
			oldMode === "160000" &&
			newMode === "160000" &&
			oldOid === newOid &&
			firstPath
		)
			dirtyOnly.add(normalizedPath(firstPath));
	}
	return dirtyOnly;
}

export function excludeDirtyOnlySubmodules(
	paths: string[],
	rawDiffIndex: string,
): string[] {
	const excluded = dirtyOnlySubmodulePaths(rawDiffIndex);
	return paths.filter((path) => !excluded.has(normalizedPath(path)));
}

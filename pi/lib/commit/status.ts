export const PORCELAIN_V2_STATUS_ARGS = [
	"status",
	"--porcelain=v2",
	"--branch",
	"-z",
	"--untracked-files=all",
] as const;

export interface PorcelainV2StatusEntry {
	kind: "1" | "2" | "u" | "?" | "!";
	x: string;
	y: string;
	path: string;
	submodule?: string;
}

export interface ChangedFilesSnapshot {
	all: string[];
	staged: string[];
	untracked: string[];
	hasHead: boolean;
	hasDirtySubmodule: boolean;
}

export function normalizeGitPath(file: string): string {
	return file.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function uniqueGitPaths(values: string[]): string[] {
	return [...new Set(values.filter(Boolean).map(normalizeGitPath))].sort((a, b) =>
		a.localeCompare(b),
	);
}

export function parsePorcelainV2Status(
	output: string,
): PorcelainV2StatusEntry[] {
	const records = output.split("\0").filter(Boolean);
	const entries: PorcelainV2StatusEntry[] = [];
	for (let index = 0; index < records.length; index += 1) {
		const record = records[index];
		if (!record || record.startsWith("# ")) continue;
		const kind = record[0];
		if (kind === "?" || kind === "!") {
			entries.push({
				kind,
				x: kind,
				y: kind,
				path: normalizeGitPath(record.slice(2)),
			});
			continue;
		}
		if (kind !== "1" && kind !== "2" && kind !== "u") continue;
		const fields = record.split(" ");
		const xy = fields[1] ?? "..";
		const pathIndex = kind === "1" ? 8 : kind === "2" ? 9 : 10;
		entries.push({
			kind,
			x: xy[0] === "." ? " " : (xy[0] ?? " "),
			y: xy[1] === "." ? " " : (xy[1] ?? " "),
			submodule: fields[2],
			path: normalizeGitPath(fields.slice(pathIndex).join(" ")),
		});
		if (kind === "2") index += 1;
	}
	return entries;
}

export function isDirtySubmodule(entry: PorcelainV2StatusEntry): boolean {
	return (
		entry.submodule?.startsWith("S") === true &&
		(entry.submodule[2] === "M" || entry.submodule[3] === "U")
	);
}

export function isDirtyOnlySubmodule(entry: PorcelainV2StatusEntry): boolean {
	return (
		entry.x === " " &&
		entry.submodule?.[1] !== "C" &&
		isDirtySubmodule(entry)
	);
}

export function changedFilesFromStatus(
	statusOutput: string,
): ChangedFilesSnapshot {
	const entries = parsePorcelainV2Status(statusOutput);
	const committable = entries.filter((entry) => !isDirtyOnlySubmodule(entry));
	const records = statusOutput.split("\0");
	return {
		all: uniqueGitPaths(committable.map((entry) => entry.path)),
		staged: uniqueGitPaths(
			committable
				.filter(
					(entry) =>
						entry.x !== " " && entry.x !== "?" && entry.x !== "!",
				)
				.map((entry) => entry.path),
		),
		untracked: uniqueGitPaths(
			committable
				.filter((entry) => entry.kind === "?")
				.map((entry) => entry.path),
		),
		hasHead: !records.includes("# branch.oid (initial)"),
		hasDirtySubmodule: entries.some(isDirtySubmodule),
	};
}

const UNMERGED_STATUS_PAIRS = new Set([
	"DD",
	"AU",
	"UD",
	"UA",
	"DU",
	"AA",
	"UU",
]);

export function statusHasUnmergedPaths(statusOutput: string): boolean {
	if (parsePorcelainV2Status(statusOutput).some((entry) => entry.kind === "u")) {
		return true;
	}
	return statusOutput
		.split("\0")
		.some((record) => UNMERGED_STATUS_PAIRS.has(record.slice(0, 2)));
}

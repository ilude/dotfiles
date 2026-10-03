// NUL records preserve spaces, tabs, newlines, and rename source/destination pairs.
export function formatStatus(output: string): string {
	const records = output.split("\0");
	const lines: string[] = [];
	for (let i = 0; i < records.length; i++) {
		const record = records[i];
		if (!record) continue;
		const xy = record.slice(0, 2);
		const destination = JSON.stringify(record.slice(3));
		const source = /[RC]/.test(xy) ? ` <- ${JSON.stringify(records[++i])}` : "";
		lines.push(`${xy} ${destination}${source}`);
	}
	return `XY: index/worktree; ?? = untracked. Paths are repository-relative JSON-quoted strings.\n${lines.join("\n") || "Working tree clean."}`;
}

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";

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

export function page(text: string, offset = 0): string {
	if (offset > text.length) throw new Error("Offset exceeds current output; restart at offset 0.");
	const end = Math.min(text.length, offset + 12000);
	return `${text.slice(offset, end)}\n\n[Characters ${offset}-${end} of ${text.length}. ${end < text.length ? `More unread output: repeat the same request with offset=${end}.` : "End of output."} Output is live; restart pagination after Git changes.]`;
}

export function gitReviewTool(pi: ExtensionAPI) {
	return {
		name: "commit_git_review",
		label: "Commit Git Review",
		description: "Read-only Git status, diff summary, or diff for explicit repository-relative paths. Returns at most 12000 characters per page; use offset to read all pages. staged selects index vs worktree diffs. Untracked file contents are NOT in diffs: use read. No secret redaction or automatic file exclusions. Binary diffs report metadata only.",
		parameters: Type.Object({
			action: StringEnum(["status", "summary", "diff"] as const),
			paths: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
			staged: Type.Optional(Type.Boolean()),
			offset: Type.Optional(Type.Integer({ minimum: 0 })),
		}),
		async execute(_id: string, params: { action: string; paths?: string[]; staged?: boolean; offset?: number }, signal: AbortSignal | undefined, _update: unknown, ctx: { cwd: string }) {
			const git = async (cwd: string, args: string[]) => {
				const result = await pi.exec("git", ["--no-pager", "--literal-pathspecs", "-C", cwd, ...args], { signal, timeout: 15000 });
				if (result.killed || result.code !== 0) {
					throw new Error(`Git ${args[0]} failed (${result.killed ? "cancelled or timed out" : `exit ${result.code}`}): ${result.stderr.trim()}`);
				}
				return result.stdout;
			};
			const root = (await git(ctx.cwd, ["rev-parse", "--show-toplevel"])).trimEnd();
			let output: string;
			if (params.action === "status") {
				output = formatStatus(await git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]));
			} else {
				if (params.action === "diff" && !params.paths?.length) throw new Error("diff requires explicit paths; use summary first.");
				output = await git(root, ["diff", "--no-ext-diff", "--no-textconv", "--no-color", ...(params.staged ? ["--cached"] : []), ...(params.action === "summary" ? ["--stat"] : []), "--", ...(params.paths ?? [])]);
				output ||= "No tracked differences. Untracked contents require read.";
			}
			return { content: [{ type: "text" as const, text: page(output, params.offset) }], details: {} };
		},
	};
}

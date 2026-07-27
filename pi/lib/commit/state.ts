import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { git } from "./git";
import type { CommitPathEntry } from "./types";

function requiredGit(cwd: string, args: string[]): string {
	const result = git(cwd, args);
	if (result.code !== 0) {
		throw new Error(
			result.stderr.trim() ||
				result.stdout.trim() ||
				`git ${args.join(" ")} failed`,
		);
	}
	return result.stdout;
}

export function indexStateFingerprint(repoRoot: string): string {
	return requiredGit(repoRoot, ["write-tree"]).trim();
}

export function worktreeStateFingerprint(
	repoRoot: string,
	entries: CommitPathEntry[],
): string {
	const paths = entries.map((entry) => entry.path).sort();
	const hash = createHash("sha256");
	const head = git(repoRoot, ["rev-parse", "--verify", "HEAD"]);
	if (head.code === 0) {
		hash.update(head.stdout);
		if (paths.length > 0) {
			hash.update(
				requiredGit(repoRoot, [
					"diff",
					"--binary",
					"--no-ext-diff",
					"HEAD",
					"--",
					...paths,
				]),
			);
		}
	} else {
		hash.update("unborn-head");
	}
	for (const entry of entries) {
		if (entry.classification !== "untracked") continue;
		const absolute = path.resolve(repoRoot, entry.path);
		const relative = path.relative(repoRoot, absolute);
		if (relative.startsWith("..") || path.isAbsolute(relative)) {
			throw new Error(`Commit path escapes the repository: ${entry.path}`);
		}
		hash.update(entry.path);
		hash.update(readFileSync(absolute));
	}
	return hash.digest("hex");
}

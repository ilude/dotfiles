import { existsSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Walk managed submodules, not orphan gitlinks embedded in vendored references. */
export async function discoverCommitRepositories(
	pi: Pick<ExtensionAPI, "exec">,
	root: string,
	signal?: AbortSignal,
	timeout = 15_000,
): Promise<string[]> {
	const repositories: string[] = [];
	const seen = new Set<string>();
	const git = async (repository: string, args: string[], allowNoMatches = false) => {
		const result = await pi.exec("git", ["-C", repository, ...args], { signal, timeout });
		if (!result.killed && allowNoMatches && result.code === 1) return "";
		if (result.killed || result.code !== 0)
			throw new Error(`Git ${args[0]} failed in ${repository}: ${result.killed ? "cancelled or timed out" : result.stderr.trim()}`);
		return result.stdout;
	};
	const visit = async (repository: string): Promise<void> => {
		signal?.throwIfAborted();
		if (seen.has(repository)) return;
		seen.add(repository);
		repositories.push(repository);
		if (!existsSync(join(repository, ".gitmodules"))) return;
		const config = await git(repository, ["config", "--null", "--file", ".gitmodules", "--get-regexp", "^submodule\\..*\\.path$"], true);
		// With --null, Git separates each key from its value with LF and ends the record with NUL.
		const declared = new Set(config.split("\0").filter(Boolean).map(record => record.slice(record.indexOf("\n") + 1)));
		if (!declared.size) return;
		const index = await git(repository, ["--literal-pathspecs", "ls-files", "--stage", "-z", "--", ...declared]);
		for (const record of index.split("\0")) {
			if (!/^160000 [0-9a-f]+ [0-3]\t/.test(record)) continue;
			const path = record.slice(record.indexOf("\t") + 1);
			if (!declared.has(path)) continue;
			const child = resolve(repository, path);
			// Uninitialized submodules have no .git marker; do not mistake their parent for their repository.
			if (existsSync(join(child, ".git"))) await visit(realpathSync(child));
		}
	};
	await visit(realpathSync(root));
	return repositories;
}

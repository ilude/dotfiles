import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export interface GitResult { code: number; stdout: string; stderr: string }

export function git(cwd: string, args: string[]): GitResult {
	const result = spawnSync("git", args, { cwd, encoding: "utf8" });
	return { code: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? String(result.error ?? "") };
}

export function requireRepoRoot(cwd: string): string {
	const result = git(cwd, ["rev-parse", "--show-toplevel"]);
	if (result.code !== 0) throw new Error(`Not a git repository: ${result.stderr.trim()}`);
	return result.stdout.trim().replace(/\\/g, "/");
}

export function gitDir(cwd: string): string {
	const result = git(cwd, ["rev-parse", "--git-dir"]);
	if (result.code !== 0) throw new Error(result.stderr.trim());
	const dir = result.stdout.trim();
	return path.isAbsolute(dir) ? dir : path.join(cwd, dir);
}

export function existsInGitDir(cwd: string, rel: string): boolean {
	return fs.existsSync(path.join(gitDir(cwd), rel));
}

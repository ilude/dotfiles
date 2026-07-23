import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export interface GitResult {
	code: number;
	stdout: string;
	stderr: string;
}

export type GitAsyncRunner = (
	cwd: string,
	args: string[],
	signal?: AbortSignal,
) => Promise<GitResult>;

let _gitBin: string | undefined;
function resolveGit(): string {
	if (_gitBin !== undefined) return _gitBin;
	if (process.platform !== "win32") {
		_gitBin = "git";
		return _gitBin;
	}
	const candidates = [
		process.env.ProgramFiles
			? `${process.env.ProgramFiles}\\Git\\mingw64\\bin\\git.exe`
			: undefined,
		process.env["ProgramFiles(x86)"]
			? `${process.env["ProgramFiles(x86)"]}\\Git\\mingw64\\bin\\git.exe`
			: undefined,
		process.env.LOCALAPPDATA
			? `${process.env.LOCALAPPDATA}\\Programs\\Git\\mingw64\\bin\\git.exe`
			: undefined,
	].filter((c): c is string => Boolean(c));
	for (const c of candidates) {
		try {
			if (fs.existsSync(c)) {
				_gitBin = c;
				return _gitBin;
			}
		} catch {
			/* ignore */
		}
	}
	_gitBin = "git";
	return _gitBin;
}

export function git(cwd: string, args: string[], input?: string): GitResult {
	const result = spawnSync(resolveGit(), args, {
		cwd,
		encoding: "utf8",
		input,
		windowsHide: true,
	});
	return {
		code: result.status ?? 1,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? String(result.error ?? ""),
	};
}

export function requireRepoRoot(cwd: string): string {
	const result = git(cwd, ["rev-parse", "--show-toplevel"]);
	if (result.code !== 0)
		throw new Error(`Not a git repository: ${result.stderr.trim()}`);
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

import { execFileSync } from "node:child_process";
import {
	lstatSync,
	readFileSync,
	realpathSync,
	statSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";

export type SafePath = { input: string; absolute: string; relative: string };

const SECRET_BASENAME_RE =
	/^(\.env(?:\..*)?|.*(?:secret|secrets|credential|credentials|token|key).*)$/i;
const GLOB_RE = /[*?[\]{}]/;
const MAX_TEXT_BYTES = 1024 * 1024;

export function findRepoRoot(cwd: string): string {
	try {
		return execFileSync("git", ["rev-parse", "--show-toplevel"], {
			cwd,
			encoding: "utf8",
		}).trim();
	} catch {
		return realpathSync(cwd);
	}
}

export function resolveSafePath(input: string, cwd: string): SafePath {
	if (input.includes("\0")) throw new Error("Path contains NUL byte");
	if (GLOB_RE.test(input))
		throw new Error("Glob-like paths are not supported in v1");

	const repoRoot = realpathSync(findRepoRoot(cwd));
	const absoluteCandidate = path.resolve(cwd, input);
	const st = lstatSync(absoluteCandidate);
	if (st.isDirectory()) throw new Error("Refusing to edit a directory");

	const absolute = realpathSync(absoluteCandidate);
	const relative = path.relative(repoRoot, absolute).replace(/\\/g, "/");
	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		throw new Error("Path resolves outside the repository");
	}
	if (st.isSymbolicLink()) {
		const linkParent = realpathSync(path.dirname(absoluteCandidate));
		const linkTarget = realpathSync(absoluteCandidate);
		if (
			!linkTarget.startsWith(repoRoot + path.sep) &&
			linkTarget !== repoRoot
		) {
			throw new Error("Symlink target escapes the repository");
		}
		if (
			!linkParent.startsWith(repoRoot + path.sep) &&
			linkParent !== repoRoot
		) {
			throw new Error("Symlink parent escapes the repository");
		}
	}
	const base = path.basename(relative);
	if (SECRET_BASENAME_RE.test(base))
		throw new Error("Refusing to edit .env or secret-like file names");
	if (isGitIgnored(repoRoot, relative))
		throw new Error("Refusing to edit gitignored target");
	return { input, absolute, relative };
}

export function isGitIgnored(repoRoot: string, relative: string): boolean {
	try {
		execFileSync("git", ["check-ignore", "--quiet", "--", relative], {
			cwd: repoRoot,
		});
		return true;
	} catch (error) {
		if (
			typeof error === "object" &&
			error !== null &&
			"status" in error &&
			error.status === 1
		)
			return false;
		return false; // documented fallback: if git is unavailable, continue with repo containment checks.
	}
}

export function readSafeText(
	file: SafePath,
	maxBytes = MAX_TEXT_BYTES,
): string {
	const st = statSync(file.absolute);
	if (st.size > maxBytes)
		throw new Error(`File exceeds max supported size of ${maxBytes} bytes`);
	const buf = readFileSync(file.absolute);
	if (buf.includes(0)) throw new Error("Refusing to edit binary file");
	return buf.toString("utf8");
}

export function writeSafeText(file: SafePath, text: string): void {
	writeFileSync(file.absolute, text, "utf8");
}

export function normalizeLf(text: string): string {
	return text.replace(/\r\n?/g, "\n");
}

export function setFinalNewline(text: string, finalNewline = true): string {
	const trimmed = text.replace(/[\r\n]*$/g, "");
	return finalNewline ? `${trimmed}\n` : trimmed;
}

export function assertMatchCount(
	actual: number,
	expectedMatches?: number,
	allowZero = false,
): void {
	if (expectedMatches !== undefined && actual !== expectedMatches) {
		throw new Error(`Expected ${expectedMatches} match(es), found ${actual}`);
	}
	if (expectedMatches === undefined && actual === 0 && !allowZero) {
		throw new Error(
			"Operation found zero matches; set allowZero to permit this",
		);
	}
}

export function boundedPreview(before: string, after: string): string {
	if (before === after) return "No content changes";
	const max = 4000;
	const text = `--- before\n${before.slice(0, 1800)}\n--- after\n${after.slice(0, 1800)}`;
	return text.length > max
		? `${text.slice(0, max)}\n...preview truncated...`
		: text;
}

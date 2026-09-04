import {
	lstatSync,
	readFileSync,
	realpathSync,
	statSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";

export type SafePath = { input: string; absolute: string; relative: string };

const DEFAULT_MAX_TEXT_BYTES = 16 * 1024 * 1024;

export function maxTextBytes(): number {
	const configured = process.env.PI_SAFE_EDIT_MAX_BYTES;
	if (configured === undefined) return DEFAULT_MAX_TEXT_BYTES;
	if (!/^[1-9]\d*$/.test(configured))
		throw new Error("PI_SAFE_EDIT_MAX_BYTES must be a positive integer");
	const parsed = Number(configured);
	if (!Number.isSafeInteger(parsed))
		throw new Error("PI_SAFE_EDIT_MAX_BYTES exceeds the supported integer range");
	return parsed;
}

export function resolveSafePath(input: string, cwd: string): SafePath {
	if (input.includes("\0")) throw new Error("Path contains NUL byte");

	const root = realpathSync(cwd);
	const absoluteCandidate = path.resolve(cwd, input);
	const st = lstatSync(absoluteCandidate);
	if (st.isDirectory()) throw new Error("Refusing to edit a directory");

	const absolute = realpathSync(absoluteCandidate);
	const relativePath = path.relative(root, absolute);
	if (
		relativePath === ".." ||
		relativePath.startsWith(`..${path.sep}`) ||
		path.isAbsolute(relativePath)
	) {
		throw new Error("Path resolves outside the working directory");
	}
	return { input, absolute, relative: relativePath.replace(/\\/g, "/") };
}

export function readSafeText(
	file: SafePath,
	maxBytes = maxTextBytes(),
): string {
	const st = statSync(file.absolute);
	if (st.size > maxBytes)
		throw new Error(
			`File is ${st.size} bytes; configured limit is ${maxBytes} bytes`,
		);
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

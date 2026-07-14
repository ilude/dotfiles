import * as fs from "node:fs";
import * as path from "node:path";
import { getAgentDir as getRuntimeAgentDir } from "@earendil-works/pi-coding-agent";
import { lock } from "proper-lockfile";

export type JsonObject = Record<string, unknown>;

const LOCK_STALE_MS = 10_000;
const LOCK_RETRY_MS = 25;
const LOCK_RETRIES = 400;
let tempFileSequence = 0;

export function getAgentDir(): string {
	return getRuntimeAgentDir();
}

export function getSettingsPath(): string {
	return path.join(getAgentDir(), "settings.json");
}

function isJsonObject(value: unknown): value is JsonObject {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertJsonObject(
	value: unknown,
	filePath: string,
): asserts value is JsonObject {
	if (!isJsonObject(value)) {
		throw new Error(`Expected a JSON object in ${filePath}`);
	}
}

function formattingFrom(raw: string): {
	indent: string | number;
	eol: "\n" | "\r\n";
	trailingEol: string;
} {
	const eol = raw.includes("\r\n") ? "\r\n" : "\n";
	const indentMatch = /^(\s+)["}]/m.exec(raw);
	const indent = indentMatch?.[1]?.replace(/\r?\n/g, "") || 2;
	const trailingEol = raw.endsWith("\r\n")
		? "\r\n"
		: raw.endsWith("\n")
			? "\n"
			: "";
	return { indent, eol, trailingEol };
}

function serializeJsonObject(value: JsonObject, sourceRaw?: string): string {
	const formatting =
		sourceRaw === undefined
			? { indent: 2, eol: "\n" as const, trailingEol: "\n" }
			: formattingFrom(sourceRaw);
	return (
		JSON.stringify(value, null, formatting.indent).replaceAll(
			"\n",
			formatting.eol,
		) + formatting.trailingEol
	);
}

async function replaceFile(tempPath: string, filePath: string): Promise<void> {
	if (process.platform !== "win32" || !fs.existsSync(filePath)) {
		fs.renameSync(tempPath, filePath);
		return;
	}

	const powershell = path.join(
		process.env.SystemRoot ?? "C:\\Windows",
		"System32",
		"WindowsPowerShell",
		"v1.0",
		"powershell.exe",
	);
	const backupPath = `${tempPath}.backup`;
	const source = Buffer.from(tempPath, "utf-8").toString("base64");
	const destination = Buffer.from(filePath, "utf-8").toString("base64");
	const backup = Buffer.from(backupPath, "utf-8").toString("base64");
	try {
		const { execFile } = await import("node:child_process");
		await new Promise<void>((resolve, reject) => {
			execFile(
				powershell,
				[
					"-NoLogo",
					"-NoProfile",
					"-NonInteractive",
					"-Command",
					`$source=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${source}')); $destination=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${destination}')); $backup=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${backup}')); [System.IO.File]::Replace($source, $destination, $backup, $false)`,
				],
				{ timeout: 15_000, windowsHide: true },
				(error) => (error ? reject(error) : resolve()),
			);
		});
	} finally {
		if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
	}
}

function preservePosixMetadata(
	tempPath: string,
	destination: fs.Stats | undefined,
): void {
	if (process.platform === "win32" || destination === undefined) return;
	try {
		fs.chownSync(tempPath, destination.uid, destination.gid);
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code !== "EPERM" && code !== "EACCES") throw error;
	}
	fs.chmodSync(tempPath, destination.mode);
}

export async function writeJsonObjectAtomic(
	filePath: string,
	value: JsonObject,
	sourceRaw?: string,
): Promise<void> {
	assertJsonObject(value, filePath);
	const directory = path.dirname(filePath);
	fs.mkdirSync(directory, { recursive: true });
	const tempPath = path.join(
		directory,
		`.${path.basename(filePath)}.${process.pid}.${tempFileSequence++}.tmp`,
	);

	try {
		const destination = fs.existsSync(filePath)
			? fs.statSync(filePath)
			: undefined;
		fs.writeFileSync(tempPath, serializeJsonObject(value, sourceRaw), {
			encoding: "utf-8",
			flag: "wx",
			mode: destination?.mode,
		});
		preservePosixMetadata(tempPath, destination);
		await replaceFile(tempPath, filePath);
	} catch (error) {
		if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
		throw error;
	}
}

async function acquireLock(filePath: string): Promise<() => Promise<void>> {
	return lock(filePath, {
		realpath: false,
		stale: LOCK_STALE_MS,
		update: LOCK_STALE_MS / 2,
		retries: {
			retries: LOCK_RETRIES,
			factor: 1,
			minTimeout: LOCK_RETRY_MS,
			maxTimeout: LOCK_RETRY_MS,
			randomize: false,
		},
	});
}

export async function updateJsonObjectAtomic(
	filePath: string,
	update: (current: JsonObject) => JsonObject,
): Promise<boolean> {
	const release = await acquireLock(filePath);
	try {
		const raw = fs.readFileSync(filePath, "utf-8");
		const current: unknown = JSON.parse(raw);
		assertJsonObject(current, filePath);
		const currentJson = JSON.stringify(current);
		const next = update(current);
		assertJsonObject(next, filePath);
		if (JSON.stringify(next) === currentJson) return false;
		await writeJsonObjectAtomic(filePath, next, raw);
		return true;
	} finally {
		await release();
	}
}

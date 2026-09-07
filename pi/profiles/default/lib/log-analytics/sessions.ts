import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { checkCancelled, selectedProfiles, sessionFiles, type ProfileId, type ProfileRegistry } from "./profiles.js";

export type SessionRef = { profile: ProfileId; sessionId: string; fileKey?: string };
export type SessionMetadata = {
	ref: SessionRef; cwd: string | null; created: string | null; modified: string; bytes: number;
};
export type SessionFile = SessionMetadata & { file: string };
export type SessionsRequest = { profiles?: ProfileId[]; cwd?: string; sessionIds?: string[]; maxRows?: number; cursor?: string };
const HEADER_BYTES = 64 * 1024;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export function isoTimestamp(value: unknown): string | null {
	if (typeof value !== "string" && typeof value !== "number") return null;
	const date = new Date(value);
	return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/** Only the first physical line, at most 64 KiB. May read ahead at most 511 bytes. */
export async function readSessionHeader(file: string, signal?: AbortSignal): Promise<{ id: string; cwd: string | null; timestamp: string | null }> {
	const handle = await fs.open(file, "r");
	try {
		const chunks: Buffer[] = [];
		let scanned = 0;
		while (scanned < HEADER_BYTES) {
			checkCancelled(signal);
			const buffer = Buffer.alloc(Math.min(512, HEADER_BYTES - scanned));
			const { bytesRead } = await handle.read(buffer, 0, buffer.length, scanned);
			const newline = buffer.subarray(0, bytesRead).indexOf(10);
			chunks.push(buffer.subarray(0, newline < 0 ? bytesRead : newline));
			scanned += bytesRead;
			if (newline >= 0 || bytesRead === 0) {
				let header;
				try { header = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { /* explicit failure below */ }
				if (header?.type !== "session" || typeof header.id !== "string" || !header.id || header.id.length > 256) throw new Error(`invalid analytics session header: ${file}`);
				return { id: header.id, cwd: typeof header.cwd === "string" ? header.cwd : null, timestamp: isoTimestamp(header.timestamp) };
			}
		}
		throw new Error(`analytics session header exceeds ${HEADER_BYTES} bytes: ${file}`);
	} finally { await handle.close(); }
}

export async function discoverSessions(registry: ProfileRegistry, profiles?: readonly ProfileId[], signal?: AbortSignal): Promise<SessionFile[]> {
	const result: SessionFile[] = [];
	const seen = new Set<string>();
	for (const profile of selectedProfiles(registry, profiles)) {
		const root = await fs.realpath(registry.roots[profile]);
		for (const file of await sessionFiles(root, signal)) {
			if (seen.has(file)) continue;
			seen.add(file);
			const header = await readSessionHeader(file, signal);
			const stat = await fs.stat(file);
			result.push({ ref: { profile, sessionId: header.id, fileKey: hash(file) }, file,
				cwd: header.cwd, created: header.timestamp, modified: stat.mtime.toISOString(), bytes: stat.size });
		}
	}
	return result.sort((a, b) => sessionKey(a).localeCompare(sessionKey(b), "en"));
}

const sessionKey = (item: SessionFile) => `${item.ref.profile}:${item.ref.fileKey}`;

export function selectSessions(files: SessionFile[], refs: readonly SessionRef[], profiles: readonly ProfileId[]): SessionFile[] {
	if (!refs.length) throw new Error("analytics sessionRefs must not be empty");
	const selected = new Map<string, SessionFile>();
	for (const ref of refs) {
		if (!profiles.includes(ref.profile)) throw new Error("analytics session reference is outside selected profiles");
		const matches = files.filter(item => item.ref.profile === ref.profile && item.ref.sessionId === ref.sessionId && (!ref.fileKey || item.ref.fileKey === ref.fileKey));
		if (matches.length !== 1) throw new Error(`analytics session reference is ${matches.length ? "ambiguous; include fileKey from sessions" : "unknown"}: ${ref.profile}/${ref.sessionId}`);
		selected.set(matches[0].file, matches[0]);
	}
	return [...selected.values()];
}

export async function listSessions(registry: ProfileRegistry, request: SessionsRequest, signal?: AbortSignal) {
	const profiles = selectedProfiles(registry, request.profiles);
	const maxRows = request.maxRows ?? 100;
	if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 1000) throw new Error("invalid analytics maxRows");
	const scope = hash(JSON.stringify([profiles, request.cwd ?? null, request.sessionIds?.slice().sort() ?? null]));
	let after = "";
	if (request.cursor !== undefined) {
		try {
			if (request.cursor.length > 1024) throw new Error();
			const parsed = JSON.parse(Buffer.from(request.cursor, "base64url").toString());
			if (parsed.scope !== scope || typeof parsed.after !== "string") throw new Error();
			after = parsed.after;
		} catch { throw new Error("invalid analytics sessions cursor or changed scope"); }
	}
	const files = (await discoverSessions(registry, profiles, signal)).filter(item =>
		(request.cwd === undefined || item.cwd === request.cwd) &&
		(request.sessionIds === undefined || request.sessionIds.includes(item.ref.sessionId)) && sessionKey(item).localeCompare(after, "en") > 0);
	const sessions: SessionMetadata[] = [];
	let bytes = 2;
	for (const { file: _file, ...item } of files) {
		const nextBytes = bytes + Buffer.byteLength(JSON.stringify(item)) + (sessions.length ? 1 : 0);
		if (sessions.length === maxRows || nextBytes > 256 * 1024) break;
		sessions.push(item); bytes = nextBytes;
	}
	if (files.length && !sessions.length) throw new Error("analytics session metadata exceeds output bound");
	const truncated = sessions.length < files.length;
	return { profiles, sessions, truncated, nextCursor: truncated ? Buffer.from(JSON.stringify({ scope, after: sessionKey(files[sessions.length - 1]) })).toString("base64url") : null,
		coverage: { listing: "best-effort; not a snapshot", malformedHeaders: "fail explicitly" } };
}

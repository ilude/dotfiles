import fs from "node:fs/promises";
import path from "node:path";
import { checkCancelled, selectedProfiles, sessionFiles, type ProfileId, type ProfileRegistry } from "./profiles.js";
import { fileKeyForPath, fileMarker, MetadataCache, type FileMarker } from "./metadata-cache.js";

export type SessionRef = { profile: ProfileId; sessionId: string; fileKey?: string };
export type SessionMetadata = {
	ref: SessionRef; cwd: string | null; created: string | null; modified: string; bytes: number;
};
export type SessionFile = SessionMetadata & { file: string; headerBytes: number; marker: FileMarker };
export type SessionsRequest = { profiles?: ProfileId[]; cwd?: string; sessionIds?: string[]; maxRows?: number; cursor?: string };
export type DiscoveryCoverage = {
	excludedFiles: number;
	diagnostics: { profile: ProfileId; file: string; fileKey: string; reason: string }[];
	diagnosticsTruncated: boolean;
};
export const discoveryCoverage = (): DiscoveryCoverage => ({ excludedFiles: 0, diagnostics: [], diagnosticsTruncated: false });
class InvalidSessionHeader extends Error {}
const HEADER_BYTES = 64 * 1024;

export function isoTimestamp(value: unknown): string | null {
	if (typeof value !== "string" && typeof value !== "number") return null;
	const normalized = typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value) ? Number(value) : value;
	const date = new Date(normalized);
	return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export type NormalizedRecord = {
	timestamp: string | null; entryType: string | null; messageRole: string | null;
	toolName: string | null; toolCallId: string | null; isError: boolean | null;
	recordKey: string | null; text: string;
};
function messageText(value: unknown): string {
	if (typeof value === "string") return value;
	if (!Array.isArray(value)) return "";
	return value.filter(item => item && typeof item === "object" && (item as { type?: unknown }).type === "text" && typeof (item as { text?: unknown }).text === "string")
		.map(item => (item as { text: string }).text).join("\n");
}
/** Native record interpretation shared by streaming search and registry-facing callers. */
export function normalizeRecord(record: unknown): NormalizedRecord {
	const value = record && typeof record === "object" ? record as Record<string, unknown> : {};
	const message = value.message && typeof value.message === "object" ? messageObject(value.message) : {};
	return {
		timestamp: isoTimestamp(value.timestamp) ?? isoTimestamp(message.timestamp),
		entryType: typeof value.type === "string" ? value.type : null,
		messageRole: typeof message.role === "string" ? message.role : null,
		toolName: typeof message.toolName === "string" ? message.toolName : null,
		toolCallId: typeof message.toolCallId === "string" ? message.toolCallId : null,
		isError: typeof message.isError === "boolean" ? message.isError : null,
		recordKey: typeof value.id === "string" && value.id ? value.id : null,
		text: messageText(message.content),
	};
}
function messageObject(value: object): Record<string, unknown> { return value as Record<string, unknown>; }

/** Only the first physical line, at most 64 KiB. May read ahead at most 511 bytes. */
export async function readSessionHeader(file: string, signal?: AbortSignal): Promise<{ id: string; cwd: string | null; timestamp: string | null; headerBytes: number }> {
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
				if (header?.type !== "session" || typeof header.id !== "string" || !header.id || header.id.length > 256) throw new InvalidSessionHeader(`invalid analytics session header: ${file}`);
				return { id: header.id, cwd: typeof header.cwd === "string" ? header.cwd : null, timestamp: isoTimestamp(header.timestamp), headerBytes: scanned - (newline < 0 ? 0 : bytesRead - newline - 1) };
			}
		}
		throw new InvalidSessionHeader(`analytics session header exceeds ${HEADER_BYTES} bytes: ${file}`);
	} finally { await handle.close(); }
}

export async function discoverSessions(registry: ProfileRegistry, profiles?: readonly ProfileId[], signal?: AbortSignal, coverage: DiscoveryCoverage = discoveryCoverage()): Promise<SessionFile[]> {
	const result: SessionFile[] = [];
	const seen = new Set<string>();
	const cacheRoot = await fs.realpath(registry.roots.default).catch(() => null);
	const cache = cacheRoot ? await MetadataCache.open(cacheRoot) : null;
	for (const profile of selectedProfiles(registry, profiles)) {
		const root = await fs.realpath(registry.roots[profile]);
		for (const file of await sessionFiles(root, signal)) {
			if (seen.has(file)) continue;
			seen.add(file);
			const stat = await fs.stat(file);
			const marker = fileMarker(stat);
			let header;
			try {
				const cached = cache?.get(file, marker);
				header = cached ? { id: cached.id, cwd: cached.cwd, timestamp: cached.timestamp, headerBytes: cached.headerBytes } : await readSessionHeader(file, signal);
			} catch (error) {
				if (!(error instanceof InvalidSessionHeader)) throw error;
				coverage.excludedFiles++;
				if (coverage.diagnostics.length < 20) coverage.diagnostics.push({
					profile, file: path.relative(root, file).replaceAll("\\", "/").slice(0, 512), fileKey: fileKeyForPath(file),
					reason: error.message.startsWith("invalid") ? "missing or invalid native session header" : "session header exceeds 64 KiB",
				});
				else coverage.diagnosticsTruncated = true;
				continue;
			}
			if (!cache?.get(file, marker)) cache?.set({ path: file, marker, id: header.id, cwd: header.cwd, timestamp: header.timestamp, headerBytes: header.headerBytes });
			result.push({ ref: { profile, sessionId: header.id, fileKey: fileKeyForPath(file) }, file,
				cwd: header.cwd, created: header.timestamp, modified: stat.mtime.toISOString(), bytes: stat.size, headerBytes: header.headerBytes, marker });
		}
	}
	await cache?.flush();
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
	const scope = fileKeyForPath(JSON.stringify([profiles, request.cwd ?? null, request.sessionIds?.slice().sort() ?? null]));
	let after = "";
	if (request.cursor !== undefined) {
		try {
			if (request.cursor.length > 1024) throw new Error();
			const parsed = JSON.parse(Buffer.from(request.cursor, "base64url").toString());
			if (parsed.scope !== scope || typeof parsed.after !== "string") throw new Error();
			after = parsed.after;
		} catch { throw new Error("invalid analytics sessions cursor or changed scope"); }
	}
	const discovery = discoveryCoverage();
	const files = (await discoverSessions(registry, profiles, signal, discovery)).filter(item =>
		(request.cwd === undefined || item.cwd === request.cwd) &&
		(request.sessionIds === undefined || request.sessionIds.includes(item.ref.sessionId)) && sessionKey(item).localeCompare(after, "en") > 0);
	const sessions: SessionMetadata[] = [];
	let bytes = 2;
	for (const item of files) {
		const metadata: SessionMetadata = { ref: item.ref, cwd: item.cwd, created: item.created, modified: item.modified, bytes: item.bytes };
		const nextBytes = bytes + Buffer.byteLength(JSON.stringify(metadata)) + (sessions.length ? 1 : 0);
		if (sessions.length === maxRows || nextBytes > 256 * 1024) break;
		sessions.push(metadata); bytes = nextBytes;
	}
	if (files.length && !sessions.length) throw new Error("analytics session metadata exceeds output bound");
	const truncated = sessions.length < files.length;
	return { profiles, sessions, truncated, nextCursor: truncated ? Buffer.from(JSON.stringify({ scope, after: sessionKey(files[sessions.length - 1]) })).toString("base64url") : null,
		coverage: { listing: "best-effort; not a snapshot", discovery } };
}

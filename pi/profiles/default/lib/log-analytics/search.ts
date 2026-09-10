import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { canonicalWithin, checkCancelled, selectedProfiles, type ProfileId, type ProfileRegistry } from "./profiles.js";
import { discoverSessions, normalizeRecord, selectSessions, type DiscoveryCoverage, type SessionFile, type SessionRef } from "./sessions.js";
import { MetadataCache, type FileMarker } from "./metadata-cache.js";

export type SearchFilters = {
	entryTypes?: readonly string[]; messageRoles?: readonly string[]; toolNames?: readonly string[]; isError?: boolean; text?: string;
};
export type SearchRequest = {
	operation: "search"; profiles?: readonly ProfileId[]; sessionRefs?: readonly SessionRef[]; cwd?: string;
	interval?: { since: string; until: string }; filters?: SearchFilters; maxResults?: number; cursor?: string;
};
export type OccurrenceRef = {
	profile: ProfileId; session: SessionRef; fileKey: string; byteOffset: number; byteLength: number;
	recordOrdinal: number; recordKey: string | null;
};
export type FollowUpRequest = { operation: "follow_up"; occurrence: OccurrenceRef; before?: number; after?: number };

type SearchFile = SessionFile & { horizon: number; root: string };
type SearchState = {
	scope: string; profiles: ProfileId[]; files: SearchFile[]; filters: NormalizedFilters; interval?: NormalizedInterval;
	maxResults: number; fileIndex: number; offset: number; cumulative: MutableCoverage; createdAt: number; exclusions: DiscoveryCoverage;
};
type NormalizedInterval = { since: string; until: string };
type NormalizedFilters = { entryTypes?: string[]; messageRoles?: string[]; toolNames?: string[]; isError?: boolean; text?: string };
type MutableCoverage = {
	selectedFiles: number; selectedBytes: number; examinedFiles: number; examinedRecords: number; examinedBytes: number;
	safelyPrunedFiles: number; malformedRecords: number; oversizedRecords: number; timestampGaps: number;
	diagnostics: string[]; diagnosticsTruncated: boolean; inventoryChanges: string[];
};
export type SearchMatch = {
	occurrence: OccurrenceRef; timestamp: string | null; entryType: string | null; messageRole: string | null;
	toolName: string | null; isError: boolean | null; snippet: string;
};
export type SearchCoverage = MutableCoverage & {
	page: Pick<MutableCoverage, "examinedFiles" | "examinedRecords" | "examinedBytes" | "malformedRecords" | "oversizedRecords">;
	cumulative: Pick<MutableCoverage, "examinedFiles" | "examinedRecords" | "examinedBytes" | "malformedRecords" | "oversizedRecords">;
	remainingFiles: number; capturedHorizons: { fileKey: string; bytes: number }[]; exclusions: DiscoveryCoverage;
};
export type SearchResult = {
	profiles: ProfileId[]; matches: SearchMatch[]; nextCursor: string | null; complete: boolean;
	stopReason: string; coverage: SearchCoverage;
};

const PAGE_BYTES = 8 * 1024 * 1024;
const PAGE_RECORDS = 10_000;
const MAX_RESULTS = 100;
const MAX_RECORD_BYTES = 16 * 1024 * 1024;
const READ_BUFFER_BYTES = 64 * 1024;
const MAX_DIAGNOSTICS = 20;
const MAX_CURSOR_STATES = 128;
const CURSOR_TTL_MS = 30 * 60 * 1000;
const cursors = new Map<string, SearchState>();

function normalizedFilters(filters: SearchFilters | undefined): NormalizedFilters {
	const list = (value: readonly string[] | undefined, name: string) => {
		if (value === undefined) return undefined;
		if (!Array.isArray(value) || value.length > 100 || value.some(item => typeof item !== "string" || item.length > 256)) throw new Error(`invalid analytics search ${name}`);
		return [...new Set(value)].sort();
	};
	if (filters?.text !== undefined && (typeof filters.text !== "string" || filters.text.length > 4096)) throw new Error("invalid analytics search text");
	return { entryTypes: list(filters?.entryTypes, "entryTypes"), messageRoles: list(filters?.messageRoles, "messageRoles"), toolNames: list(filters?.toolNames, "toolNames"), isError: filters?.isError, text: filters?.text };
}
function normalizedInterval(interval: SearchRequest["interval"]): NormalizedInterval | undefined {
	if (!interval) return undefined;
	const since = new Date(interval.since), until = new Date(interval.until);
	if (!Number.isFinite(since.getTime()) || !Number.isFinite(until.getTime()) || since >= until) throw new Error("invalid analytics search interval");
	return { since: since.toISOString(), until: until.toISOString() };
}
function scopeOf(request: { profiles: readonly ProfileId[]; sessionRefs?: readonly SessionRef[]; cwd?: string; interval?: NormalizedInterval; filters: NormalizedFilters; maxResults: number }): string {
	return JSON.stringify([request.profiles, request.sessionRefs?.map(ref => ({ ...ref })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) ?? null, request.cwd ?? null, request.interval ?? null, request.filters, request.maxResults]);
}
function addDiagnostic(coverage: MutableCoverage, value: string): void {
	if (coverage.diagnostics.length < MAX_DIAGNOSTICS) coverage.diagnostics.push(value.slice(0, 512));
	else coverage.diagnosticsTruncated = true;
}
function emptyCoverage(files: SearchFile[]): MutableCoverage {
	return { selectedFiles: files.length, selectedBytes: files.reduce((sum, file) => sum + file.horizon, 0), examinedFiles: 0, examinedRecords: 0, examinedBytes: 0, safelyPrunedFiles: 0, malformedRecords: 0, oversizedRecords: 0, timestampGaps: 0, diagnostics: [], diagnosticsTruncated: false, inventoryChanges: [] };
}
function outputCoverage(state: SearchState, page: MutableCoverage, discovery: DiscoveryCoverage): SearchCoverage {
	const remainingFiles = state.files.length - state.fileIndex;
	return { ...state.cumulative, page: { examinedFiles: page.examinedFiles, examinedRecords: page.examinedRecords, examinedBytes: page.examinedBytes, malformedRecords: page.malformedRecords, oversizedRecords: page.oversizedRecords },
		cumulative: { examinedFiles: state.cumulative.examinedFiles, examinedRecords: state.cumulative.examinedRecords, examinedBytes: state.cumulative.examinedBytes, malformedRecords: state.cumulative.malformedRecords, oversizedRecords: state.cumulative.oversizedRecords },
		remainingFiles, capturedHorizons: state.files.map(file => ({ fileKey: file.ref.fileKey!, bytes: file.horizon })), exclusions: discovery };
}
function occurrence(file: SearchFile, item: PhysicalRecord, recordKey: string | null): OccurrenceRef {
	return { profile: file.ref.profile, session: file.ref, fileKey: file.ref.fileKey!, byteOffset: item.offset, byteLength: item.length, recordOrdinal: item.ordinal, recordKey };
}
function inInterval(timestamp: string | null, interval: NormalizedInterval | undefined): boolean {
	return !interval ? true : timestamp !== null && timestamp >= interval.since && timestamp < interval.until;
}
function matches(record: ReturnType<typeof normalizeRecord>, filters: NormalizedFilters, interval: NormalizedInterval | undefined): boolean {
	return inInterval(record.timestamp, interval) &&
		(filters.entryTypes === undefined || filters.entryTypes.includes(record.entryType ?? "")) &&
		(filters.messageRoles === undefined || filters.messageRoles.includes(record.messageRole ?? "")) &&
		(filters.toolNames === undefined || filters.toolNames.includes(record.toolName ?? "")) &&
		(filters.isError === undefined || record.isError === filters.isError) &&
		(filters.text === undefined || record.text.includes(filters.text));
}
function snippet(text: string): string { return text.length > 500 ? `${text.slice(0, 500)}…` : text; }
function stateExpired(state: SearchState): boolean { return Date.now() - state.createdAt > CURSOR_TTL_MS; }
function storeCursor(state: SearchState): string {
	const cursor = randomUUID().replaceAll("-", "");
	cursors.set(cursor, state);
	while (cursors.size > MAX_CURSOR_STATES) cursors.delete(cursors.keys().next().value!);
	return cursor;
}
function takeCursor(cursor: string, requestScope: string | undefined): SearchState {
	if (cursor.length > 1024) throw new Error("invalid or expired analytics search cursor");
	const state = cursors.get(cursor);
	if (!state || stateExpired(state)) { cursors.delete(cursor); throw new Error("analytics search cursor expired; start a fresh search"); }
	if (requestScope !== undefined && requestScope !== state.scope) throw new Error("analytics search cursor scope changed");
	cursors.delete(cursor);
	return state;
}

type PhysicalRecord = { offset: number; length: number; nextOffset: number; ordinal: number; raw: Buffer | null; malformed: boolean; oversized: boolean };
/** Bounded JSONL reader. It retains at most one allowed record and discards oversized lines. */
async function* records(file: string, start: number, horizon: number, signal?: AbortSignal): AsyncGenerator<PhysicalRecord> {
	const handle = await fs.open(file, "r");
	let position = start, lineStart = start, ordinal = 0, lineLength = 0, oversized = false, parts: Buffer[] = [];
	try {
		while (position < horizon) {
			checkCancelled(signal);
			const chunk = Buffer.alloc(Math.min(READ_BUFFER_BYTES, horizon - position));
			const { bytesRead } = await handle.read(chunk, 0, chunk.length, position);
			if (!bytesRead) break;
			const data = chunk.subarray(0, bytesRead);
			let begin = 0;
			for (let i = 0; i < data.length; i++) {
				if (data[i] !== 10) continue;
				const part = data.subarray(begin, i);
				lineLength += part.length;
				if (lineLength > MAX_RECORD_BYTES) oversized = true;
				else if (part.length) parts.push(part);
				if (lineLength > 0) {
					const raw = oversized ? null : Buffer.concat(parts);
					let malformed = false;
					if (raw) { try { JSON.parse(raw.toString("utf8")); } catch { malformed = true; } }
					yield { offset: lineStart, length: lineLength, nextOffset: position + i + 1, ordinal: ordinal++, raw, malformed, oversized };
				}
				lineStart = position + i + 1; lineLength = 0; oversized = false; parts = []; begin = i + 1;
			}
			const tail = data.subarray(begin);
			lineLength += tail.length;
			if (lineLength > MAX_RECORD_BYTES) { oversized = true; parts = []; }
			else if (tail.length) parts.push(tail);
			position += bytesRead;
		}
		if (lineLength > 0) {
			const raw = oversized ? null : Buffer.concat(parts); let malformed = false;
			if (raw) { try { JSON.parse(raw.toString("utf8")); } catch { malformed = true; } }
			yield { offset: lineStart, length: lineLength, nextOffset: lineStart + lineLength, ordinal: ordinal++, raw, malformed, oversized };
		}
	} finally { await handle.close(); }
}

async function currentMarker(file: string): Promise<FileMarker> {
	const stat = await fs.stat(file);
	return { size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs, dev: stat.dev, ino: stat.ino };
}
function changedKind(initial: FileMarker, current: FileMarker, horizon: number): string | null {
	if (initial.size === current.size && initial.mtimeMs === current.mtimeMs && initial.ctimeMs === current.ctimeMs && initial.dev === current.dev && initial.ino === current.ino) return null;
	if (current.dev === initial.dev && current.ino === initial.ino && current.size > horizon) return "append beyond captured horizon";
	return current.size < horizon ? "file truncated during continuation" : "file replaced during continuation";
}

async function scanPage(state: SearchState, signal: AbortSignal, discovery: DiscoveryCoverage): Promise<{ matches: SearchMatch[]; page: MutableCoverage; stopReason: string; complete: boolean }> {
	const page = emptyCoverage(state.files); page.selectedFiles = state.files.length; page.selectedBytes = state.cumulative.selectedBytes;
	const matchesFound: SearchMatch[] = []; const started = performance.now(); const touched = new Set<number>();
	const caches = new Map<string, MetadataCache>();
	const ranges = new Map<number, { min: string | null; max: string | null; through: number }>();
	let stopReason = "page_budget";
	while (state.fileIndex < state.files.length) {
		checkCancelled(signal);
		const file = state.files[state.fileIndex];
		const marker = await currentMarker(file.file);
		const change = changedKind(file.marker, marker, file.horizon);
		if (change && !change.startsWith("append")) { state.cumulative.inventoryChanges.push(`${file.ref.profile}/${file.ref.sessionId}: ${change}`); stopReason = "inventory_changed"; return { matches: matchesFound, page, stopReason, complete: false }; }
		if (change) state.cumulative.inventoryChanges.push(`${file.ref.profile}/${file.ref.sessionId}: ${change}`);
		const cache = caches.get(file.file) ?? await MetadataCache.open(file.root); caches.set(file.file, cache);
		const cachedRange = cache.get(file.file, file.marker)?.eventRange;
		const range = ranges.get(state.fileIndex) ?? { min: cachedRange?.min ?? null, max: cachedRange?.max ?? null, through: cachedRange?.through ?? file.headerBytes };
		ranges.set(state.fileIndex, range);
		for await (const item of records(file.file, state.offset, file.horizon, signal)) {
			checkCancelled(signal);
			touched.add(state.fileIndex); page.examinedRecords++; page.examinedBytes += item.length; state.cumulative.examinedRecords++; state.cumulative.examinedBytes += item.length;
			range.through = Math.max(range.through, item.nextOffset);
			if (item.oversized) { page.oversizedRecords++; state.cumulative.oversizedRecords++; addDiagnostic(state.cumulative, `${file.ref.sessionId}: oversized record at byte ${item.offset}`); state.offset = item.nextOffset; continue; }
			if (item.malformed || !item.raw) { page.malformedRecords++; state.cumulative.malformedRecords++; addDiagnostic(state.cumulative, `${file.ref.sessionId}: malformed record at byte ${item.offset}`); state.offset = item.nextOffset; continue; }
			const value = JSON.parse(item.raw.toString("utf8")); const normalized = normalizeRecord(value);
			if (normalized.timestamp !== null) { range.min = range.min === null || normalized.timestamp < range.min ? normalized.timestamp : range.min; range.max = range.max === null || normalized.timestamp > range.max ? normalized.timestamp : range.max; }
			if (normalized.timestamp === null && state.interval) state.cumulative.timestampGaps++;
			if (matches(normalized, state.filters, state.interval)) {
				const match: SearchMatch = { occurrence: occurrence(file, item, normalized.recordKey), timestamp: normalized.timestamp, entryType: normalized.entryType, messageRole: normalized.messageRole, toolName: normalized.toolName, isError: normalized.isError, snippet: snippet(normalized.text) };
				matchesFound.push(match);
			}
			state.offset = item.nextOffset;
			if (matchesFound.length >= state.maxResults || page.examinedRecords >= PAGE_RECORDS || page.examinedBytes >= PAGE_BYTES || performance.now() - started >= 5000) { stopReason = matchesFound.length >= state.maxResults ? "result_limit" : page.examinedRecords >= PAGE_RECORDS ? "record_limit" : page.examinedBytes >= PAGE_BYTES ? "byte_limit" : "deadline"; break; }
		}
		page.examinedFiles = touched.size;
		if (stopReason !== "page_budget") break;
		state.fileIndex++; state.offset = state.fileIndex < state.files.length ? state.files[state.fileIndex].headerBytes : 0;
	}
	page.examinedFiles = touched.size;
	state.cumulative.examinedFiles = Math.min(state.files.length, Math.max(state.cumulative.examinedFiles, state.fileIndex + page.examinedFiles));
	for (const [index, range] of ranges) { const file = state.files[index]; const cache = file && caches.get(file.file); if (file && cache) cache.updateRange(file.file, file.marker, range); }
	for (const cache of new Set(caches.values())) await cache.flush();
	const complete = state.fileIndex >= state.files.length;
	if (complete) stopReason = "exhausted";
	return { matches: matchesFound, page, stopReason, complete };
}

function requestScopeIfPresent(request: SearchRequest, profiles: ProfileId[], filters: NormalizedFilters, interval: NormalizedInterval | undefined, maxResults: number): string | undefined {
	if (request.profiles === undefined && request.sessionRefs === undefined && request.cwd === undefined && request.interval === undefined && request.filters === undefined && request.maxResults === undefined) return undefined;
	return scopeOf({ profiles, sessionRefs: request.sessionRefs, cwd: request.cwd, interval, filters, maxResults });
}

export async function searchLogs(registry: ProfileRegistry, request: SearchRequest, signal?: AbortSignal): Promise<SearchResult> {
	const profiles = selectedProfiles(registry, request.profiles);
	const filters = normalizedFilters(request.filters); const interval = normalizedInterval(request.interval);
	const maxResults = request.maxResults ?? MAX_RESULTS;
	if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > MAX_RESULTS) throw new Error("invalid analytics search maxResults");
	let state: SearchState;
	const cursorState = request.cursor ? takeCursor(request.cursor, requestScopeIfPresent(request, profiles, filters, interval, maxResults)) : undefined;
	if (cursorState) state = cursorState;
	else {
		const discovery: DiscoveryCoverage = { excludedFiles: 0, diagnostics: [], diagnosticsTruncated: false };
		const all = await discoverSessions(registry, profiles, signal, discovery);
		const selected = request.sessionRefs ? selectSessions(all, request.sessionRefs, profiles) : all.filter(item => request.cwd === undefined || item.cwd === request.cwd);
		const files = selected.filter(item => request.cwd === undefined || item.cwd === request.cwd).map(item => ({ ...item, horizon: item.bytes, root: registry.roots.default }));
		state = { scope: scopeOf({ profiles, sessionRefs: request.sessionRefs, cwd: request.cwd, interval, filters, maxResults }), profiles, files, filters, interval, maxResults, fileIndex: 0, offset: files[0]?.headerBytes ?? 0, cumulative: emptyCoverage(files), createdAt: Date.now(), exclusions: discovery };
		const result = await scanPage(state, signal ?? new AbortController().signal, discovery);
		state.cumulative.examinedFiles = result.page.examinedFiles; state.cumulative.examinedBytes = result.page.examinedBytes;
		return finish(state, result, discovery);
	}
	const discovery: DiscoveryCoverage = { excludedFiles: 0, diagnostics: [], diagnosticsTruncated: false };
	const result = await scanPage(state, signal ?? new AbortController().signal, discovery);
	return finish(state, result, state.exclusions);
}
function finish(state: SearchState, result: { matches: SearchMatch[]; page: MutableCoverage; stopReason: string; complete: boolean }, discovery: DiscoveryCoverage): SearchResult {
	const complete = result.complete || result.stopReason === "inventory_changed" && false;
	const nextCursor = complete || result.stopReason === "inventory_changed" ? null : storeCursor({ ...state, createdAt: Date.now() });
	if (complete || result.stopReason === "inventory_changed") cursors.forEach((value, key) => { if (value === state) cursors.delete(key); });
	return { profiles: state.profiles, matches: result.matches, nextCursor, complete, stopReason: result.stopReason, coverage: outputCoverage(state, result.page, discovery) };
}

export type FollowUpRecord = { occurrence: OccurrenceRef; record: unknown; timestamp: string | null };
export async function followUp(registry: ProfileRegistry, request: FollowUpRequest, signal?: AbortSignal): Promise<{ occurrence: OccurrenceRef; before: FollowUpRecord[]; match: FollowUpRecord; after: FollowUpRecord[] }> {
	const before = request.before ?? 2, after = request.after ?? 2;
	if (!Number.isInteger(before) || !Number.isInteger(after) || before < 0 || after < 0 || before > 20 || after > 20) throw new Error("invalid analytics follow-up bounds");
	const profiles = selectedProfiles(registry, [request.occurrence.profile]); const discovery: DiscoveryCoverage = { excludedFiles: 0, diagnostics: [], diagnosticsTruncated: false };
	const files = await discoverSessions(registry, profiles, signal, discovery);
	const file = files.find(item => item.ref.profile === request.occurrence.profile && item.ref.fileKey === request.occurrence.fileKey && item.ref.sessionId === request.occurrence.session.sessionId);
	if (!file) throw new Error("analytics follow-up occurrence is outside the current profile history");
	const marker = await currentMarker(file.file);
	if (marker.size !== file.marker.size || marker.mtimeMs !== file.marker.mtimeMs || marker.ctimeMs !== file.marker.ctimeMs || marker.dev !== file.marker.dev || marker.ino !== file.marker.ino) throw new Error("analytics follow-up file changed; search again");
	const preceding: FollowUpRecord[] = []; let target: FollowUpRecord | undefined; const following: FollowUpRecord[] = []; let found = false;
	for await (const item of records(file.file, file.headerBytes, file.bytes, signal)) {
		if (item.offset < request.occurrence.byteOffset) { if (before === 0) continue; if (preceding.length >= before) preceding.shift(); if (!item.raw || item.malformed || item.oversized) continue; const value = JSON.parse(item.raw.toString("utf8")); const normalized = normalizeRecord(value); preceding.push({ occurrence: occurrence({ ...file, horizon: file.bytes, root: registry.roots.default }, item, normalized.recordKey), record: value, timestamp: normalized.timestamp }); continue; }
		if (item.offset === request.occurrence.byteOffset) {
			if (item.length !== request.occurrence.byteLength || item.ordinal !== request.occurrence.recordOrdinal) throw new Error("analytics follow-up occurrence no longer identifies the same record");
			if (!item.raw || item.malformed || item.oversized) throw new Error("analytics follow-up occurrence is malformed");
			const value = JSON.parse(item.raw.toString("utf8")); const normalized = normalizeRecord(value);
			if (normalized.recordKey !== request.occurrence.recordKey) throw new Error("analytics follow-up occurrence identity changed");
			target = { occurrence: request.occurrence, record: value, timestamp: normalized.timestamp }; found = true; continue;
		}
		if (found && following.length < after) { if (item.raw && !item.malformed && !item.oversized) { const value = JSON.parse(item.raw.toString("utf8")); const normalized = normalizeRecord(value); following.push({ occurrence: occurrence({ ...file, horizon: file.bytes, root: registry.roots.default }, item, normalized.recordKey), record: value, timestamp: normalized.timestamp }); } }
		if (found && following.length >= after) break;
	}
	if (!target) throw new Error("analytics follow-up occurrence was not found");
	const result = { occurrence: request.occurrence, before: preceding, match: target, after: following };
	if (Buffer.byteLength(JSON.stringify(result)) > 256 * 1024) throw new Error("analytics follow-up exceeds output bound; request less context");
	return result;
}

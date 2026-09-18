import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { canonicalWithin, checkCancelled, selectedProfiles, type ProfileId, type ProfileRegistry } from "./profiles.js";
import { discoverSessions, normalizeRecord, pathIdentity, selectSessionLocation, selectSessions, type DiscoveryCoverage, type SessionFile, type SessionRef } from "./sessions.js";
import { MetadataCache, type FileMarker } from "./metadata-cache.js";
import { SUBAGENT_EXTENSION_VERSION_ENTRY } from "../subagents/version.js";

export type SubagentBlockingReasonSource = "model" | "role-contract" | "missing";
export type SearchFilters = {
	entryTypes?: readonly string[]; messageRoles?: readonly string[]; toolNames?: readonly string[]; isError?: boolean; text?: string;
	subagentBlocking?: boolean; subagentBlockingReasonSources?: readonly SubagentBlockingReasonSource[]; subagentExtensionVersion?: string;
};
export type SearchRequest = {
	operation: "search"; profiles?: readonly ProfileId[]; sessionRefs?: readonly SessionRef[]; cwd?: string; repository?: string;
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
	maxResults: number; fileIndex: number; offset: number; subagentExtensionVersion: string | null; cumulative: MutableCoverage; exclusions: DiscoveryCoverage;
};
type NormalizedInterval = { since: string; until: string };
type NormalizedFilters = { entryTypes?: string[]; messageRoles?: string[]; toolNames?: string[]; isError?: boolean; text?: string; subagentBlocking?: boolean; subagentBlockingReasonSources?: SubagentBlockingReasonSource[]; subagentExtensionVersion?: string };
type MutableCoverage = {
	selectedFiles: number; selectedBytes: number; examinedFiles: number; examinedRecords: number; examinedBytes: number;
	safelyPrunedFiles: number; malformedRecords: number; oversizedRecords: number; timestampGaps: number;
	diagnostics: string[]; diagnosticsTruncated: boolean; inventoryChanges: string[];
};
export type SubagentBlockingDecision = {
	toolName: "subagent" | "subagent_control"; agent: string | null; action: string; background: boolean | null;
	blocking: boolean; reason: string | null; reasonSource: SubagentBlockingReasonSource | null; subagentExtensionVersion: string | null;
};
export type SearchMatch = {
	occurrence: OccurrenceRef; timestamp: string | null; entryType: string | null; messageRole: string | null;
	toolName: string | null; isError: boolean | null; snippet: string; blockingDecisions?: SubagentBlockingDecision[];
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

const MAX_RESULTS = 100;
const MAX_RECORD_BYTES = 16 * 1024 * 1024;
const READ_BUFFER_BYTES = 64 * 1024;
const MAX_DIAGNOSTICS = 20;
const MAX_CURSOR_STATE_BYTES = 16 * 1024 * 1024;
const cursors = new Map<string, { state: SearchState; bytes: number }>();
let cursorStateBytes = 0;

function normalizedFilters(filters: SearchFilters | undefined): NormalizedFilters {
	const list = (value: readonly string[] | undefined, name: string) => {
		if (value === undefined) return undefined;
		if (!Array.isArray(value) || value.length > 100 || value.some(item => typeof item !== "string" || item.length > 256)) throw new Error(`invalid analytics search ${name}`);
		return [...new Set(value)].sort();
	};
	if (filters?.text !== undefined && (typeof filters.text !== "string" || filters.text.length > 4096)) throw new Error("invalid analytics search text");
	if (filters?.subagentBlocking !== undefined && typeof filters.subagentBlocking !== "boolean") throw new Error("invalid analytics search subagentBlocking");
	if (filters?.subagentExtensionVersion !== undefined && (typeof filters.subagentExtensionVersion !== "string" || !filters.subagentExtensionVersion || filters.subagentExtensionVersion.length > 64)) throw new Error("invalid analytics search subagentExtensionVersion");
	const reasonSources = list(filters?.subagentBlockingReasonSources, "subagentBlockingReasonSources");
	const isReasonSource = (source: string): source is SubagentBlockingReasonSource => source === "model" || source === "role-contract" || source === "missing";
	if (reasonSources?.some(source => !isReasonSource(source))) throw new Error("invalid analytics search subagentBlockingReasonSources");
	if (reasonSources !== undefined && filters?.subagentBlocking !== true) throw new Error("subagentBlockingReasonSources requires subagentBlocking=true");
	if (filters?.subagentExtensionVersion !== undefined && filters.subagentBlocking === undefined) throw new Error("subagentExtensionVersion requires subagentBlocking");
	return { entryTypes: list(filters?.entryTypes, "entryTypes"), messageRoles: list(filters?.messageRoles, "messageRoles"), toolNames: list(filters?.toolNames, "toolNames"), isError: filters?.isError, text: filters?.text, subagentBlocking: filters?.subagentBlocking, subagentBlockingReasonSources: reasonSources?.filter(isReasonSource), subagentExtensionVersion: filters?.subagentExtensionVersion };
}
function normalizedInterval(interval: SearchRequest["interval"]): NormalizedInterval | undefined {
	if (!interval) return undefined;
	const since = new Date(interval.since), until = new Date(interval.until);
	if (!Number.isFinite(since.getTime()) || !Number.isFinite(until.getTime()) || since >= until) throw new Error("invalid analytics search interval");
	return { since: since.toISOString(), until: until.toISOString() };
}
function scopeOf(request: { profiles: readonly ProfileId[]; sessionRefs?: readonly SessionRef[]; cwd?: string; repository?: string; interval?: NormalizedInterval; filters: NormalizedFilters; maxResults: number }): string {
	return JSON.stringify([request.profiles, request.sessionRefs?.map(ref => ({ ...ref })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) ?? null,
		request.cwd === undefined ? null : pathIdentity(request.cwd), request.repository === undefined ? null : pathIdentity(request.repository), request.interval ?? null, request.filters, request.maxResults]);
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
function textBlocks(record: unknown): string[] {
	if (!record || typeof record !== "object") return [];
	const message = (record as { message?: unknown }).message;
	if (!message || typeof message !== "object") return [];
	const content = (message as { content?: unknown }).content;
	if (typeof content === "string") return [content];
	if (!Array.isArray(content)) return [];
	return content.flatMap(item => item && typeof item === "object" && (item as { type?: unknown }).type === "text" && typeof (item as { text?: unknown }).text === "string" ? [(item as { text: string }).text] : []);
}
function matchText(record: unknown, needle: string | undefined): { matched: boolean; snippet: string } {
	const blocks = textBlocks(record);
	if (needle === undefined) {
		const text = blocks[0] ?? ""; return { matched: true, snippet: text.length > 500 ? `${text.slice(0, 500)}…` : text };
	}
	for (const text of blocks) if (text.includes(needle)) return { matched: true, snippet: text.length > 500 ? `${text.slice(0, 500)}…` : text };
	return { matched: false, snippet: "" };
}
function subagentVersionMarker(record: unknown): string | undefined {
	if (!record || typeof record !== "object") return;
	const entry = record as { type?: unknown; customType?: unknown; data?: unknown };
	if (entry.type !== "custom" || entry.customType !== SUBAGENT_EXTENSION_VERSION_ENTRY || !entry.data || typeof entry.data !== "object") return;
	const version = (entry.data as { version?: unknown }).version;
	return typeof version === "string" && version.length > 0 && version.length <= 64 ? version : undefined;
}
function subagentDecisions(record: unknown, subagentExtensionVersion: string | null): SubagentBlockingDecision[] {
	if (!record || typeof record !== "object") return [];
	const message = (record as { message?: unknown }).message;
	if (!message || typeof message !== "object") return [];
	const content = (message as { content?: unknown }).content;
	if (!Array.isArray(content)) return [];
	const decisions: SubagentBlockingDecision[] = [];
	for (const item of content) {
		if (!item || typeof item !== "object" || (item as { type?: unknown }).type !== "toolCall") continue;
		const call = item as { name?: unknown; arguments?: unknown };
		if (call.name !== "subagent" && call.name !== "subagent_control") continue;
		const args = call.arguments && typeof call.arguments === "object" ? call.arguments as Record<string, unknown> : {};
		const supplied = typeof args.blockingReason === "string" && args.blockingReason.trim() ? args.blockingReason.trim() : null;
		if (call.name === "subagent") {
			const agent = typeof args.agent === "string" ? args.agent : null;
			const strategist = agent === "strategist";
			const background = strategist ? false : args.background === true;
			const blocking = !background;
			decisions.push({ toolName: call.name, agent, action: "launch", background, blocking,
				reason: blocking ? strategist ? "Strategist consultations run in the foreground by role contract." : supplied : null,
				reasonSource: blocking ? strategist ? "role-contract" : supplied ? "model" : "missing" : null, subagentExtensionVersion });
			continue;
		}
		const action = typeof args.action === "string" ? args.action : "control";
		const blocking = action === "wait";
		decisions.push({ toolName: call.name, agent: null, action, background: null, blocking,
			reason: blocking ? supplied : null, reasonSource: blocking ? supplied ? "model" : "missing" : null, subagentExtensionVersion });
	}
	return decisions;
}
function matches(record: ReturnType<typeof normalizeRecord>, filters: NormalizedFilters, interval: NormalizedInterval | undefined): boolean {
	return inInterval(record.timestamp, interval) &&
		(filters.entryTypes === undefined || filters.entryTypes.includes(record.entryType ?? "")) &&
		(filters.messageRoles === undefined || filters.messageRoles.includes(record.messageRole ?? "")) &&
		(filters.subagentBlocking !== undefined || filters.toolNames === undefined || filters.toolNames.includes(record.toolName ?? "")) &&
		(filters.isError === undefined || record.isError === filters.isError);
}
function cursorBytes(state: SearchState): number { return Buffer.byteLength(JSON.stringify({ scope: state.scope, files: state.files, cumulative: state.cumulative })); }
function deleteCursor(cursor: string): void { const entry = cursors.get(cursor); if (entry) cursorStateBytes -= entry.bytes; cursors.delete(cursor); }
function storeCursor(state: SearchState): string {
	const cursor = randomUUID().replaceAll("-", ""); const bytes = cursorBytes(state);
	while (cursors.size && cursorStateBytes + bytes > MAX_CURSOR_STATE_BYTES) deleteCursor(cursors.keys().next().value!);
	if (bytes > MAX_CURSOR_STATE_BYTES) throw new Error(`analytics search continuation metadata ${bytes} bytes exceeds retained-state bound ${MAX_CURSOR_STATE_BYTES}`);
	cursors.set(cursor, { state, bytes }); cursorStateBytes += bytes;
	return cursor;
}
function takeCursor(cursor: string, requestScope: string | undefined): SearchState {
	if (cursor.length > 1024) throw new Error("invalid or expired analytics search cursor");
	const entry = cursors.get(cursor);
	if (!entry) throw new Error("invalid analytics search cursor; start a fresh search");
	if (requestScope !== undefined && requestScope !== entry.state.scope) throw new Error("analytics search cursor scope changed");
	deleteCursor(cursor);
	return entry.state;
}

export type PhysicalRecord = { offset: number; length: number; nextOffset: number; ordinal: number; value: unknown; malformed: boolean; oversized: boolean };
/** Bounded JSONL reader. It retains at most one allowed record and discards oversized lines. */
export async function* records(file: string, start: number, horizon: number, signal?: AbortSignal): AsyncGenerator<PhysicalRecord> {
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
					const raw = oversized ? null : Buffer.concat(parts); let malformed = false, value: unknown;
					if (raw) { try { value = JSON.parse(raw.toString("utf8")); } catch { malformed = true; } }
					yield { offset: lineStart, length: lineLength, nextOffset: position + i + 1, ordinal: ordinal++, value, malformed, oversized };
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
			const raw = oversized ? null : Buffer.concat(parts); let malformed = false, value: unknown;
			if (raw) { try { value = JSON.parse(raw.toString("utf8")); } catch { malformed = true; } }
			yield { offset: lineStart, length: lineLength, nextOffset: lineStart + lineLength, ordinal: ordinal++, value, malformed, oversized };
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
	const matchesFound: SearchMatch[] = []; const touched = new Set<number>();
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
		const cache = caches.get(file.root) ?? await MetadataCache.open(file.root); caches.set(file.root, cache);
		const cachedRange = cache.get(file.file, file.marker)?.eventRange;
		const range = ranges.get(state.fileIndex) ?? { min: cachedRange?.min ?? null, max: cachedRange?.max ?? null, through: cachedRange?.through ?? file.headerBytes };
		ranges.set(state.fileIndex, range);
		for await (const item of records(file.file, state.offset, file.horizon, signal)) {
			checkCancelled(signal);
			touched.add(state.fileIndex); page.examinedRecords++; page.examinedBytes += item.length; state.cumulative.examinedRecords++; state.cumulative.examinedBytes += item.length;
			range.through = Math.max(range.through, item.nextOffset);
			if (item.oversized) { page.oversizedRecords++; state.cumulative.oversizedRecords++; addDiagnostic(state.cumulative, `${file.ref.sessionId}: oversized record at byte ${item.offset}`); state.offset = item.nextOffset; continue; }
			if (item.malformed) { page.malformedRecords++; state.cumulative.malformedRecords++; addDiagnostic(state.cumulative, `${file.ref.sessionId}: malformed record at byte ${item.offset}`); state.offset = item.nextOffset; continue; }
			const value = item.value;
			const versionMarker = subagentVersionMarker(value);
			if (versionMarker !== undefined) state.subagentExtensionVersion = versionMarker;
			const normalized = normalizeRecord(value, false); const text = matchText(value, state.filters.text);
			if (normalized.timestamp !== null) { range.min = range.min === null || normalized.timestamp < range.min ? normalized.timestamp : range.min; range.max = range.max === null || normalized.timestamp > range.max ? normalized.timestamp : range.max; }
			if (normalized.timestamp === null && state.interval) state.cumulative.timestampGaps++;
			if (text.matched && matches(normalized, state.filters, state.interval)) {
				const blockingDecisions = state.filters.subagentBlocking === undefined ? undefined : subagentDecisions(value, state.subagentExtensionVersion)
					.filter(decision => decision.blocking === state.filters.subagentBlocking &&
						(state.filters.toolNames === undefined || state.filters.toolNames.includes(decision.toolName)) &&
						(state.filters.subagentBlockingReasonSources === undefined || decision.reasonSource !== null && state.filters.subagentBlockingReasonSources.includes(decision.reasonSource)) &&
						(state.filters.subagentExtensionVersion === undefined || decision.subagentExtensionVersion === state.filters.subagentExtensionVersion));
				if (blockingDecisions === undefined || blockingDecisions.length) {
					const blockingSnippet = blockingDecisions?.map(decision => decision.reason ?? `${decision.toolName} ${decision.action}: blocking reason missing`).join(" | ");
					const match: SearchMatch = { occurrence: occurrence(file, item, normalized.recordKey), timestamp: normalized.timestamp, entryType: normalized.entryType, messageRole: normalized.messageRole,
						toolName: blockingDecisions?.length === 1 ? blockingDecisions[0].toolName : normalized.toolName, isError: normalized.isError,
						snippet: blockingSnippet || text.snippet, ...(blockingDecisions ? { blockingDecisions } : {}) };
					matchesFound.push(match);
				}
			}
			state.offset = item.nextOffset;
			if (matchesFound.length >= state.maxResults) { stopReason = "result_limit"; break; }
		}
		page.examinedFiles = touched.size;
		if (stopReason !== "page_budget") break;
		state.fileIndex++; state.offset = state.fileIndex < state.files.length ? state.files[state.fileIndex].headerBytes : 0; state.subagentExtensionVersion = null;
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
	if (request.profiles === undefined && request.sessionRefs === undefined && request.cwd === undefined && request.repository === undefined && request.interval === undefined && request.filters === undefined && request.maxResults === undefined) return undefined;
	return scopeOf({ profiles, sessionRefs: request.sessionRefs, cwd: request.cwd, repository: request.repository, interval, filters, maxResults });
}

export async function searchLogs(registry: ProfileRegistry, request: SearchRequest, signal?: AbortSignal): Promise<SearchResult> {
	const profiles = selectedProfiles(registry, request.profiles);
	const filters = normalizedFilters(request.filters); const interval = normalizedInterval(request.interval);
	const maxResults = request.maxResults ?? MAX_RESULTS;
	if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > MAX_RESULTS) throw new Error("invalid analytics search maxResults");
	if (request.cwd !== undefined && request.repository !== undefined) throw new Error("analytics cwd and repository scopes are mutually exclusive");
	let state: SearchState;
	const cursorState = request.cursor ? takeCursor(request.cursor, requestScopeIfPresent(request, profiles, filters, interval, maxResults)) : undefined;
	if (cursorState) state = cursorState;
	else {
		const discovery: DiscoveryCoverage = { excludedFiles: 0, diagnostics: [], diagnosticsTruncated: false };
		const all = await discoverSessions(registry, profiles, signal, discovery);
		const referenced = request.sessionRefs ? selectSessions(all, request.sessionRefs, profiles) : all;
		const selected = await selectSessionLocation(referenced, request);
		const files = selected.map(item => ({ ...item, horizon: item.bytes, root: registry.roots.default }));
		state = { scope: scopeOf({ profiles, sessionRefs: request.sessionRefs, cwd: request.cwd, repository: request.repository, interval, filters, maxResults }), profiles, files, filters, interval, maxResults, fileIndex: 0, offset: files[0]?.headerBytes ?? 0, subagentExtensionVersion: null, cumulative: emptyCoverage(files), exclusions: discovery };
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
	const nextCursor = complete || result.stopReason === "inventory_changed" ? null : storeCursor(state);
	if (complete || result.stopReason === "inventory_changed") cursors.forEach((value, key) => { if (value.state === state) deleteCursor(key); });
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
		if (item.offset < request.occurrence.byteOffset) { if (before === 0) continue; if (preceding.length >= before) preceding.shift(); if (item.malformed || item.oversized) continue; const value = item.value; const normalized = normalizeRecord(value); preceding.push({ occurrence: occurrence({ ...file, horizon: file.bytes, root: registry.roots.default }, item, normalized.recordKey), record: value, timestamp: normalized.timestamp }); continue; }
		if (item.offset === request.occurrence.byteOffset) {
			if (item.length !== request.occurrence.byteLength || item.ordinal !== request.occurrence.recordOrdinal) throw new Error("analytics follow-up occurrence no longer identifies the same record");
			if (item.malformed || item.oversized) throw new Error("analytics follow-up occurrence is malformed");
			const value = item.value; const normalized = normalizeRecord(value);
			if (normalized.recordKey !== request.occurrence.recordKey) throw new Error("analytics follow-up occurrence identity changed");
			target = { occurrence: request.occurrence, record: value, timestamp: normalized.timestamp }; found = true; continue;
		}
		if (found && following.length < after) { if (!item.malformed && !item.oversized) { const value = item.value; const normalized = normalizeRecord(value); following.push({ occurrence: occurrence({ ...file, horizon: file.bytes, root: registry.roots.default }, item, normalized.recordKey), record: value, timestamp: normalized.timestamp }); } }
		if (found && following.length >= after) break;
	}
	if (!target) throw new Error("analytics follow-up occurrence was not found");
	const result = { occurrence: request.occurrence, before: preceding, match: target, after: following };
	if (Buffer.byteLength(JSON.stringify(result)) > 256 * 1024) throw new Error("analytics follow-up exceeds output bound; request less context");
	return result;
}

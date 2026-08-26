import { createHash } from "node:crypto";

export const FINGERPRINT_VERSION = 1;
export const MAX_COORDINATES = 3;
export const MAX_INVESTIGATION_CANDIDATES = 3;

export type SessionEntry = {
	filename: string;
	id: string;
	lineNumber?: number;
	timestamp?: string | null;
	message: unknown;
	type?: string;
};

export type ClassifiedFailure = {
	candidateId: string;
	fingerprintVersion: number;
	tool: string;
	errorClass: string;
	contract: string;
	classification: "candidate" | "expected" | "unclassified";
	occurrences: number;
	sessions: number;
	firstObserved: string | null;
	lastObserved: string | null;
	coordinates: string[];
	occurrences7d: number;
	sessions7d: number;
	occurrences14d: number;
	sessions14d: number;
	occurrences30d: number;
	sessions30d: number;
	observations: { timestamp: string; session: string }[];
};

export type FailureScan = {
	schemaVersion: 1;
	asOf: string;
	timestampDiagnostics: { missing: number; malformed: number; future: number };
	timestampOmissions: number;
	manifestDigest: string;
	sourceWindow: { first: string | null; last: string | null };
	scannedResults: number;
	unmatchedResults: number;
	duplicateCalls: number;
	malformedOmissions: number;
	candidates: ClassifiedFailure[];
};

const SECRET = /(?:password|passwd|token|secret|api[_-]?key|authorization)\s*[:=]/i;
const HOME = /(?:[a-z]:\\users\\[^\\\s]+|\/(?:home|users)\/[^/\s]+)/i;
const ABSOLUTE = /(?:[a-z]:\\|\/(?:home|users|tmp|var|etc|opt)\/)/i;
const RAW = /[\r\n\0-\x1f]/;

export function classifyFailure(tool: string, text: string): [string, string, ClassifiedFailure["classification"]] {
	const t = tool.toLowerCase();
	const s = text.toLowerCase();
	if ((t === "bash" || t === "functions.bash") && (s.includes("required properties command") || s.includes("'command' is a required property"))) return ["missing-required-parameter", "required:command", "candidate"];
	if ((t === "read" || t === "functions.read") && ["outside", "path escape", "boundary", "not within", "governed"].some((x) => s.includes(x))) return ["governed-path-rejection", "selected-skill-read:path-boundary", "candidate"];
	if (t.includes("subagent") && ["unknown agent", "available agents", "abi", "manager"].some((x) => s.includes(x))) return ["stale-manager-contract", "subagent-manager:availability", "candidate"];
	if (t === "web_search" && (s.trim() === "fetch failed" || s.includes("operation was aborted due to timeout"))) return ["external-service-failure", "web-search:request", "candidate"];
	if (t.includes("subagent") && s.includes("subagent was aborted")) return ["operation-aborted", "subagent:aborted", "expected"];
	if (t.includes("subagent") && s.includes("failed to load extension")) return ["extension-load-failure", "subagent:extension-load", "candidate"];
	if (t.includes("subagent") && s.includes("agent: must be equal to one of the allowed values")) return ["requested-agent-unavailable", "subagent:agent-availability", "expected"];
	if (s.includes("pi cli entrypoint is unavailable") || s.includes("available agents: none") || /^tool (bash|pwsh) not found$/.test(s.trim())) return ["required-runtime-unavailable", "runtime:availability", "candidate"];
	if (["damage control", "blocked by policy", "blocked unsafe shell edit", "blocked dangerous command", "blocked unmanaged shell backgrounding", "prefer pi safe edit", "path_escape:", "interactive orchestrator parents must delegate", "repeated_tool_loop:", "dynamic_recursive_target:"].some((x) => s.includes(x))) return ["safety-block", "policy:block", "expected"];
	if (["operator approval is required", "confirmation required for dangerous command", '"outcome":"needs_approval"'].some((x) => s.includes(x))) return ["approval-required", "policy:approval", "expected"];
	if (/command timed out after \d+(?:s| seconds)/.test(s)) return ["command-timeout", "command:timeout", "expected"];
	if (s.trim() === "command aborted" || s.trim() === "operation aborted" || s.endsWith("command aborted")) return ["command-aborted", "command:aborted", "expected"];
	if (["tests failed", "test failed", "exit code 1"].some((x) => s.includes(x))) return ["nonzero-test", "command:test-nonzero", "expected"];
	if (/loaded \d+ (?:target-specific )?agents context file/.test(s) || ["loaded path-specific instructions", "deferred while loading path-specific instructions", "successfully before modifying it"].some((x) => s.includes(x))) return ["instruction-deferred", "mutation:instruction-discovery", "expected"];
	if (s.includes("could not find edits[") || s.includes("oldtext must match exactly")) return ["exact-match-miss", "mutation:exact-match", "expected"];
	if (s.includes("found ") && s.includes(" occurrences of edits[")) return ["nonunique-match", "mutation:unique-match", "expected"];
	if (s.includes("enoent: no such file or directory") || s.startsWith("path not found:") || s.includes("no valid search paths given") || s.includes("system cannot find the file specified") || s.includes("system cannot find the path specified") || s.includes("working directory does not exist:")) return ["path-not-found", "filesystem:path-missing", "expected"];
	if (s.includes("offset ") && s.includes(" is beyond end of file")) return ["invalid-offset", "read:offset-range", "expected"];
	if (t === "task" && s.includes("scope entries must be worktree-relative")) return ["task-boundary-rejected", "task:boundary-path", "expected"];
	if (t === "task" && s.includes("instructions: must not have more than 500 characters")) return ["task-instructions-too-long", "task:instructions-length", "expected"];
	if (t === "plan_progress" && s.includes("plan contract validation failed:")) return ["plan-not-ready", "plan:readiness", "expected"];
	if (["bash", "functions.bash", "pwsh", "functions.pwsh"].includes(t) && (s.includes("command exited with code ") || s.startsWith("pwsh exited with code ") || s.includes("command failed with exit code "))) return ["command-nonzero", "command:nonzero", "expected"];
	if (!(["bash", "functions.bash", "pwsh", "functions.pwsh"].includes(t)) && s.includes(" is not a function")) return ["internal-missing-method", "runtime:missing-method", "candidate"];
	if (s.includes("secret scan blocked the commit")) return ["secret-scan-block", "commit:secret-scan", "expected"];
	if (s.startsWith("validation failed for tool") || s.includes("no active plan lifecycle exists") || s.includes("plan contract validation failed:") || s.includes("scope entries must be worktree-relative")) return ["invalid-caller-contract", "caller:validation", "expected"];
	return ["unclassified-error", "manual-review", "unclassified"];
}

export function coordinateId(entryId: string, callId: string): string {
	return createHash("sha256").update(`${entryId}\0${callId}`).digest("hex").slice(0, 12);
}

export function candidateId(tool: string, errorClass: string, contract: string, version = FINGERPRINT_VERSION): string {
	const material = `v${version}\0${tool.toLowerCase()}\0${errorClass}\0${contract}`;
	return `tf-v${version}-${createHash("sha256").update(material).digest("hex").slice(0, 20)}`;
}

function parsedTimestamp(value: unknown, asOf: Date): string | null {
	if (typeof value !== "string" || !value) return null;
	const parsed = new Date(value);
	if (Number.isNaN(parsed.valueOf()) || parsed > asOf) return null;
	return parsed.toISOString().replace(".000Z", "Z");
}

function messageObject(value: unknown): Record<string, unknown> | null {
	if (typeof value === "string") { try { value = JSON.parse(value); } catch { return null; } }
	return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function contentItems(message: Record<string, unknown>): Record<string, unknown>[] {
	const content = message.content;
	if (content && typeof content === "object" && !Array.isArray(content)) return [content as Record<string, unknown>];
	return Array.isArray(content) ? content.filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x)) : [];
}

export function scanToolFailures(rows: readonly SessionEntry[], asOf = new Date(), malformedOmissions = 0): FailureScan {
	const calls = new Map<string, { tool: string; entry: string }>();
	const results: { filename: string; callId: string; timestamp?: string | null; message: Record<string, unknown> }[] = [];
	let duplicateCalls = 0;
	for (const row of rows) {
		const message = messageObject(row.message); if (!message) continue;
		for (const item of contentItems(message)) {
			const kind = item.type; const id = item.id ?? item.toolCallId;
			if ((kind === "toolCall" || kind === "tool_call") && typeof id === "string") {
				const key = `${row.filename}\0${id}`;
				if (calls.has(key)) duplicateCalls++; else if (typeof (item.name ?? item.toolName) === "string") calls.set(key, { tool: String(item.name ?? item.toolName), entry: row.id ?? "" });
			}
		}
		if (message.role === "toolResult" || message.isError === true) { const id = message.toolCallId; if (typeof id === "string") results.push({ filename: row.filename, callId: id, timestamp: row.timestamp, message }); }
	}
	let unmatchedResults = 0; const observations: { id: string; tool: string; errorClass: string; contract: string; classification: ClassifiedFailure["classification"]; timestamp: string | null; session: string; coordinate: string }[] = [];
	const diagnostics = { missing: 0, malformed: 0, future: 0 };
	for (const result of results) {
		if (result.message.isError !== true) continue;
		const call = calls.get(`${result.filename}\0${result.callId}`); if (!call) { unmatchedResults++; continue; }
		const text = contentItems(result.message).filter((x) => x.type === "text").map((x) => String(x.text ?? "")).join(" ");
		const [errorClass, contract, classification] = classifyFailure(call.tool, text);
		const timestamp = parsedTimestamp(result.timestamp, asOf);
		if (!timestamp) { if (result.timestamp == null || result.timestamp === "") diagnostics.missing++; else if (!Number.isNaN(new Date(String(result.timestamp)).valueOf()) && new Date(String(result.timestamp)) > asOf) diagnostics.future++; else diagnostics.malformed++; }
		const session = createHash("sha256").update(result.filename).digest("hex").slice(0, 12);
		const coordinate = coordinateId(call.entry, result.callId);
		observations.push({ id: candidateId(call.tool, errorClass, contract), tool: call.tool.toLowerCase(), errorClass, contract, classification, timestamp, session, coordinate });
	}
	const groups = new Map<string, typeof observations>(); for (const item of observations) groups.set(item.id, [...(groups.get(item.id) ?? []), item]);
	const order = (a: (typeof observations)[number], b: (typeof observations)[number]): number => {
		if (a.timestamp && b.timestamp && a.timestamp !== b.timestamp) return b.timestamp.localeCompare(a.timestamp);
		if (Boolean(a.timestamp) !== Boolean(b.timestamp)) return a.timestamp ? -1 : 1;
		return a.session.localeCompare(b.session) || a.coordinate.localeCompare(b.coordinate);
	};
	const candidates = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, group]) => {
		const ordered = [...group].sort(order);
		const windows = (days: number) => { const cutoff = asOf.valueOf() - days * 86400000; const set = group.filter((x) => x.timestamp && new Date(x.timestamp).valueOf() >= cutoff && new Date(x.timestamp).valueOf() <= asOf.valueOf()); return [set.length, new Set(set.map((x) => x.session)).size] as const; };
		const all = group.filter((x) => x.timestamp).map((x) => x.timestamp as string).sort(); const w7 = windows(7), w14 = windows(14), w30 = windows(30);
		const distinctSessions: typeof ordered = []; const seenSessions = new Set<string>();
		for (const item of ordered) if (!seenSessions.has(item.session)) { seenSessions.add(item.session); distinctSessions.push(item); }
		const selected = [...distinctSessions, ...ordered.filter((item) => !distinctSessions.includes(item))].slice(0, MAX_COORDINATES);
		return { candidateId: id, fingerprintVersion: FINGERPRINT_VERSION, tool: group[0].tool, errorClass: group[0].errorClass, contract: group[0].contract, classification: group[0].classification, occurrences: group.length, sessions: new Set(group.map((x) => x.session)).size, firstObserved: all[0] ?? null, lastObserved: ordered.find((x) => x.timestamp)?.timestamp ?? null, coordinates: selected.map((x) => x.coordinate), occurrences7d: w7[0], sessions7d: w7[1], occurrences14d: w14[0], sessions14d: w14[1], occurrences30d: w30[0], sessions30d: w30[1], observations: ordered.flatMap((item) => item.timestamp ? [{ timestamp: item.timestamp, session: item.session }] : []) };
	});
	const digestMaterial = candidates.map((x) => [x.candidateId, x.occurrences, x.sessions]);
	return { schemaVersion: 1, asOf: asOf.toISOString().replace(".000Z", "Z"), timestampDiagnostics: diagnostics, timestampOmissions: diagnostics.missing + diagnostics.malformed + diagnostics.future, manifestDigest: createHash("sha256").update(JSON.stringify(digestMaterial)).digest("hex"), sourceWindow: { first: candidates.flatMap((x) => x.firstObserved ? [x.firstObserved] : []).sort()[0] ?? null, last: candidates.flatMap((x) => x.lastObserved ? [x.lastObserved] : []).sort().at(-1) ?? null }, scannedResults: results.length, unmatchedResults, duplicateCalls, malformedOmissions, candidates };
}

export function safeLedgerText(value: string, field: string): string { if (!value || value.length > 240 || SECRET.test(value) || HOME.test(value) || ABSOLUTE.test(value) || RAW.test(value)) throw new Error(`${field} contains prohibited sensitive, path, or raw content`); return value; }
export function parseLedgerDate(value: string | undefined, field: string): string | undefined { if (value === undefined) return undefined; if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new Error(`${field} must be an ISO date`); return value; }

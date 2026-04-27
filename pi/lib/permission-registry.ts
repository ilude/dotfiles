/**
 * Permission registry -- decision log + session approvals for the operator
 * layer. Owned by .specs/pi-operator-layer-mvp/plan.md (T1).
 *
 * Two storage surfaces:
 *
 *   1. decisions.jsonl -- append-only newline-delimited JSON. Each line is a
 *      PermissionDecision. Reads tail the file. This is the recent-history
 *      surface for /permissions and the audit trail.
 *
 *   2. session-approvals.json -- JSON object holding the current set of
 *      session-scoped approvals. Cleared explicitly by reset; consumers
 *      decide when (e.g., on session_shutdown).
 *
 * Replayable denials are referenced by id; replay payload is stored in the
 * decision record itself when the producer chose to capture it. There is no
 * separate replay store.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";

import {
	ensureDirectory,
	getDecisionsLogPath,
	getPermissionsDir,
	getSessionApprovalsPath,
} from "./operator-state.ts";

export type DecisionOutcome = "allow" | "deny";

/**
 * Why a decision came out the way it did. Producers should set this as
 * accurately as they can; "unknown" is the safe default for paths that have
 * not yet been instrumented.
 */
export type DecisionProvenance = "manual_once" | "session" | "rule" | "unknown";

export interface PermissionDecision {
	schemaVersion: 1;
	id: string;
	action: string;
	outcome: DecisionOutcome;
	provenance: DecisionProvenance;
	recordedAt: string;
	summary?: string;
	rule?: string;
	replayPayload?: Record<string, unknown>;
	metadata?: Record<string, unknown>;
}

export interface RecordDecisionInput {
	action: string;
	outcome: DecisionOutcome;
	provenance: DecisionProvenance;
	summary?: string;
	rule?: string;
	replayPayload?: Record<string, unknown>;
	metadata?: Record<string, unknown>;
}

export interface SessionApproval {
	schemaVersion: 1;
	pattern: string;
	grantedAt: string;
	reason?: string;
	metadata?: Record<string, unknown>;
}

export interface ListDecisionsOptions {
	limit?: number;
	outcome?: DecisionOutcome;
	provenance?: DecisionProvenance;
}

interface SessionApprovalFile {
	schemaVersion: 1;
	approvals: SessionApproval[];
}

export class PermissionRegistryError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PermissionRegistryError";
	}
}

// ---------------------------------------------------------------------------
// Decisions log (append-only JSONL)
// ---------------------------------------------------------------------------

/**
 * Append a decision to the log and return the persisted record. Generates a
 * UUID and timestamp; callers may not pre-set them.
 */
export function recordDecision(input: RecordDecisionInput): PermissionDecision {
	if (!input.action || typeof input.action !== "string") {
		throw new PermissionRegistryError("recordDecision: action is required");
	}
	if (input.outcome !== "allow" && input.outcome !== "deny") {
		throw new PermissionRegistryError(`recordDecision: invalid outcome ${input.outcome}`);
	}
	const record: PermissionDecision = {
		schemaVersion: 1,
		id: crypto.randomUUID(),
		action: input.action,
		outcome: input.outcome,
		provenance: input.provenance,
		recordedAt: new Date().toISOString(),
		summary: input.summary,
		rule: input.rule,
		replayPayload: input.replayPayload,
		metadata: input.metadata,
	};
	ensureDirectory(getPermissionsDir());
	fs.appendFileSync(getDecisionsLogPath(), `${JSON.stringify(record)}\n`, "utf-8");
	return record;
}

/**
 * Newest-first list of recent decisions. The log is read in full and tail-
 * sliced; this stays cheap until the log grows past the rotation threshold,
 * which is a Phase-2 concern.
 */
export function listRecentDecisions(opts: ListDecisionsOptions = {}): PermissionDecision[] {
	const file = getDecisionsLogPath();
	if (!fs.existsSync(file)) return [];
	const raw = fs.readFileSync(file, "utf-8");
	const decisions: PermissionDecision[] = [];
	for (const line of raw.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try {
			const parsed = JSON.parse(trimmed) as PermissionDecision;
			if (parsed && parsed.schemaVersion === 1 && typeof parsed.id === "string") {
				decisions.push(parsed);
			}
		} catch {
			// Skip malformed lines so a partial write does not poison reads.
		}
	}
	const filtered = decisions.filter((d) => {
		if (opts.outcome && d.outcome !== opts.outcome) return false;
		if (opts.provenance && d.provenance !== opts.provenance) return false;
		return true;
	});
	filtered.reverse();
	if (opts.limit && opts.limit > 0) return filtered.slice(0, opts.limit);
	return filtered;
}

export function getDecision(id: string): PermissionDecision | null {
	if (!id) return null;
	const file = getDecisionsLogPath();
	if (!fs.existsSync(file)) return null;
	const raw = fs.readFileSync(file, "utf-8");
	for (const line of raw.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try {
			const parsed = JSON.parse(trimmed) as PermissionDecision;
			if (parsed?.id === id) return parsed;
		} catch {
			continue;
		}
	}
	return null;
}

// ---------------------------------------------------------------------------
// Session approvals
// ---------------------------------------------------------------------------

function readSessionFile(): SessionApprovalFile {
	const file = getSessionApprovalsPath();
	if (!fs.existsSync(file)) return { schemaVersion: 1, approvals: [] };
	try {
		const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as SessionApprovalFile;
		if (parsed?.schemaVersion === 1 && Array.isArray(parsed.approvals)) return parsed;
	} catch {
		// Fall through to empty state -- a corrupted file should not block writes.
	}
	return { schemaVersion: 1, approvals: [] };
}

function writeSessionFile(state: SessionApprovalFile): void {
	ensureDirectory(getPermissionsDir());
	const file = getSessionApprovalsPath();
	const tmp = `${file}.${process.pid}.tmp`;
	fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
	fs.renameSync(tmp, file);
}

export function listSessionApprovals(): SessionApproval[] {
	return readSessionFile().approvals.slice();
}

/**
 * Add a session approval. Patterns deduplicate -- the latest grantedAt wins
 * so callers can refresh an existing approval by re-adding it.
 */
export function addSessionApproval(input: {
	pattern: string;
	reason?: string;
	metadata?: Record<string, unknown>;
}): SessionApproval {
	if (!input.pattern || typeof input.pattern !== "string") {
		throw new PermissionRegistryError("addSessionApproval: pattern is required");
	}
	const approval: SessionApproval = {
		schemaVersion: 1,
		pattern: input.pattern,
		grantedAt: new Date().toISOString(),
		reason: input.reason,
		metadata: input.metadata,
	};
	const state = readSessionFile();
	const existingIdx = state.approvals.findIndex((a) => a.pattern === approval.pattern);
	if (existingIdx >= 0) state.approvals.splice(existingIdx, 1);
	state.approvals.push(approval);
	writeSessionFile(state);
	return approval;
}

export function removeSessionApproval(pattern: string): boolean {
	const state = readSessionFile();
	const idx = state.approvals.findIndex((a) => a.pattern === pattern);
	if (idx < 0) return false;
	state.approvals.splice(idx, 1);
	writeSessionFile(state);
	return true;
}

export function resetSessionApprovals(): void {
	writeSessionFile({ schemaVersion: 1, approvals: [] });
}

/**
 * Convenience: clear the in-memory file by removing it. This is equivalent
 * to resetSessionApprovals plus deleting the on-disk artifact, which is what
 * a session_shutdown hook typically wants.
 */
export function purgeSessionApprovalsFile(): void {
	const file = getSessionApprovalsPath();
	if (fs.existsSync(file)) fs.rmSync(file, { force: true });
}

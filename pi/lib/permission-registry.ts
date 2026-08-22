/**
 * Permission registry -- decision log for the operator layer. Owned by
 * .specs/pi-operator-layer-mvp/plan.md (T1).
 *
 * decisions.jsonl is an append-only newline-delimited JSON audit trail. Reads
 * tail the file for the recent-history surface used by /permissions.
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

export interface ListDecisionsOptions {
	limit?: number;
	outcome?: DecisionOutcome;
	provenance?: DecisionProvenance;
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

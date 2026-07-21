import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { ensureDirectory, getOperatorStateDir } from "./operator-state.ts";

export type DamageControlEvalDecisionType =
	| "ask_approved"
	| "ask_denied"
	| "auto_allowed"
	| "hard_block";

export type DamageControlEvalLabel =
	| "useful"
	| "noise"
	| "too_strict"
	| "too_weak"
	| "unclear";

export interface DamageControlEvalEvent {
	schemaVersion: 1;
	id: string;
	recordedAt: string;
	decisionType: DamageControlEvalDecisionType;
	toolName: string;
	redactedAction: string;
	rule?: string;
	ruleSource?: string;
	summary?: string;
	cwd?: string;
	toolCallId?: string;
	hasUI?: boolean;
	tier?: "scoped_delete";
	redactedActionTruncated?: boolean;
	redactedActionLossy?: boolean;
	labels?: DamageControlEvalLabel[];
}

export interface RecordDamageControlEvalInput {
	decisionType: DamageControlEvalDecisionType;
	toolName: string;
	redactedAction: string;
	rule?: string;
	ruleSource?: string;
	summary?: string;
	cwd?: string;
	toolCallId?: string;
	hasUI?: boolean;
	tier?: "scoped_delete";
	redactedActionTruncated?: boolean;
	redactedActionLossy?: boolean;
	id?: string;
}

export interface DamageControlEvalStats {
	total: number;
	byDecisionType: Record<string, number>;
	byRule: Array<{
		rule: string;
		total: number;
		askApproved: number;
		askDenied: number;
		hardBlock: number;
		autoAllowed: number;
		labels: Record<string, number>;
	}>;
}

const VALID_LABELS = new Set<DamageControlEvalLabel>([
	"useful",
	"noise",
	"too_strict",
	"too_weak",
	"unclear",
]);

export function getDamageControlEvalDir(): string {
	return path.join(getOperatorStateDir(), "damage-control");
}

export function getDamageControlEvalLogPath(): string {
	return path.join(getDamageControlEvalDir(), "events.jsonl");
}

export function recordDamageControlEval(
	input: RecordDamageControlEvalInput,
): DamageControlEvalEvent {
	if (!input.toolName) throw new Error("toolName is required");
	if (!input.redactedAction) throw new Error("redactedAction is required");
	const event: DamageControlEvalEvent = {
		schemaVersion: 1,
		id: input.id ?? crypto.randomUUID(),
		recordedAt: new Date().toISOString(),
		decisionType: input.decisionType,
		toolName: input.toolName,
		redactedAction: input.redactedAction,
		rule: input.rule,
		ruleSource: input.ruleSource,
		summary: input.summary,
		cwd: input.cwd,
		toolCallId: input.toolCallId,
		hasUI: input.hasUI,
		tier: input.tier,
		redactedActionTruncated: input.redactedActionTruncated ?? false,
		redactedActionLossy: input.redactedActionLossy ?? false,
		labels: [],
	};
	ensureDirectory(getDamageControlEvalDir());
	fs.appendFileSync(
		getDamageControlEvalLogPath(),
		`${JSON.stringify(event)}\n`,
		"utf-8",
	);
	return event;
}

export function listDamageControlEvalEvents(
	limit = 100,
): DamageControlEvalEvent[] {
	const file = getDamageControlEvalLogPath();
	if (!fs.existsSync(file)) return [];
	const events: DamageControlEvalEvent[] = [];
	for (const line of fs.readFileSync(file, "utf-8").split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try {
			const parsed = JSON.parse(trimmed) as DamageControlEvalEvent;
			if (parsed?.schemaVersion === 1 && typeof parsed.id === "string") {
				events.push(parsed);
			}
		} catch {}
	}
	events.reverse();
	return limit > 0 ? events.slice(0, limit) : events;
}

export function addDamageControlEvalLabel(
	idPrefix: string,
	label: DamageControlEvalLabel,
): DamageControlEvalEvent {
	if (!VALID_LABELS.has(label)) throw new Error(`invalid label: ${label}`);
	const file = getDamageControlEvalLogPath();
	if (!fs.existsSync(file)) throw new Error("damage-control eval log is empty");
	const events = listDamageControlEvalEvents(0).reverse();
	const matches = events.filter((event) => event.id.startsWith(idPrefix));
	if (matches.length !== 1) {
		throw new Error(
			`expected one event for id prefix ${idPrefix}, found ${matches.length}`,
		);
	}
	const target = matches[0];
	const nextLabels = new Set(target.labels ?? []);
	nextLabels.add(label);
	const updated: DamageControlEvalEvent = {
		...target,
		labels: [...nextLabels].sort(),
	};
	const rewritten = events.map((event) =>
		event.id === target.id ? updated : event,
	);
	ensureDirectory(getDamageControlEvalDir());
	fs.writeFileSync(
		file,
		`${rewritten.map((event) => JSON.stringify(event)).join("\n")}\n`,
		"utf-8",
	);
	return updated;
}

export function summarizeDamageControlEval(
	limit = 500,
): DamageControlEvalStats {
	const events = listDamageControlEvalEvents(limit);
	const byDecisionType: Record<string, number> = {};
	const byRule = new Map<
		string,
		{
			rule: string;
			total: number;
			askApproved: number;
			askDenied: number;
			hardBlock: number;
			autoAllowed: number;
			labels: Record<string, number>;
		}
	>();
	for (const event of events) {
		byDecisionType[event.decisionType] =
			(byDecisionType[event.decisionType] ?? 0) + 1;
		const rule = event.rule ?? "(no rule)";
		const row = byRule.get(rule) ?? {
			rule,
			total: 0,
			askApproved: 0,
			askDenied: 0,
			hardBlock: 0,
			autoAllowed: 0,
			labels: {},
		};
		row.total += 1;
		if (event.decisionType === "ask_approved") row.askApproved += 1;
		if (event.decisionType === "ask_denied") row.askDenied += 1;
		if (event.decisionType === "hard_block") row.hardBlock += 1;
		if (event.decisionType === "auto_allowed") row.autoAllowed += 1;
		for (const label of event.labels ?? []) {
			row.labels[label] = (row.labels[label] ?? 0) + 1;
		}
		byRule.set(rule, row);
	}
	return {
		total: events.length,
		byDecisionType,
		byRule: [...byRule.values()].sort((a, b) => b.total - a.total),
	};
}

export function isDamageControlEvalLabel(
	value: string,
): value is DamageControlEvalLabel {
	return VALID_LABELS.has(value as DamageControlEvalLabel);
}

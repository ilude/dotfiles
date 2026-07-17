import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as zlib from "node:zlib";

import { sanitizeTaskValue } from "./task-security.ts";

export const DAMAGE_CONTROL_DECISION_SCHEMA_VERSION = 1 as const;
export const DAMAGE_CONTROL_LOG_COMPRESS_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_SUMMARY_BYTES = 500;

export type DamageControlClient = "pi" | "claude";
export type DamageControlEngineAction = "allow" | "ask" | "block";
export type DamageControlUserDecision =
	| "approved"
	| "denied"
	| "denied_or_abandoned"
	| "not_applicable"
	| "not_present";
export type DamageControlLatencyKind = "exact" | "estimated" | "not_available";

export interface DamageControlDecisionInput {
	client: DamageControlClient;
	sessionId: string;
	toolUseId?: string;
	tool: string;
	ruleId: string;
	matchedPattern?: string;
	actionSummary: string;
	engineAction: DamageControlEngineAction;
	userDecision: DamageControlUserDecision;
	latencyMs: number;
	latencyKind: DamageControlLatencyKind;
}

export interface DamageControlDecision extends DamageControlDecisionInput {
	schemaVersion: 1;
	timestamp: string;
}

function bounded(value: string | undefined, limit: number): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed.slice(0, limit) : undefined;
}

function boundedUtf8(value: string, maxBytes: number): string {
	if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
	let result = "";
	for (const character of value) {
		if (Buffer.byteLength(result + character, "utf8") > maxBytes) break;
		result += character;
	}
	return result;
}

export function damageControlDecisionDir(): string {
	return (
		process.env.DAMAGE_CONTROL_DECISION_DIR ??
		path.join(os.homedir(), ".local", "share", "damage-control")
	);
}

export function damageControlDecisionPath(now = new Date()): string {
	const month = now.toISOString().slice(0, 7);
	return path.join(damageControlDecisionDir(), `decisions-${month}.jsonl`);
}

export function sanitizeDecisionSummary(value: string): string {
	return boundedUtf8(
		sanitizeTaskValue(value).replaceAll("\0", ""),
		MAX_SUMMARY_BYTES,
	);
}

export function buildDamageControlDecision(
	input: DamageControlDecisionInput,
	now = new Date(),
): DamageControlDecision {
	const sessionId = bounded(input.sessionId, 120);
	const tool = bounded(input.tool, 80);
	const ruleId = bounded(input.ruleId, 240);
	if (!sessionId || !tool || !ruleId)
		throw new Error("sessionId, tool, and ruleId are required");
	if (!Number.isFinite(input.latencyMs) || input.latencyMs < 0)
		throw new Error("latencyMs must be nonnegative");
	return {
		schemaVersion: DAMAGE_CONTROL_DECISION_SCHEMA_VERSION,
		timestamp: now.toISOString(),
		client: input.client,
		sessionId,
		...(bounded(input.toolUseId, 120)
			? { toolUseId: bounded(input.toolUseId, 120) }
			: {}),
		tool,
		ruleId,
		...(bounded(input.matchedPattern, 240)
			? { matchedPattern: bounded(input.matchedPattern, 240) }
			: {}),
		actionSummary: sanitizeDecisionSummary(input.actionSummary),
		engineAction: input.engineAction,
		userDecision: input.userDecision,
		latencyMs: input.latencyMs,
		latencyKind: input.latencyKind,
	};
}

export function recordDamageControlDecision(
	input: DamageControlDecisionInput,
	now = new Date(),
): boolean {
	try {
		const decision = buildDamageControlDecision(input, now);
		const target = damageControlDecisionPath(now);
		fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
		fs.appendFileSync(target, `${JSON.stringify(decision)}\n`, {
			encoding: "utf8",
			mode: 0o600,
		});
		return true;
	} catch {
		return false;
	}
}

export function compressOldDamageControlDecisionLogs(
	now = new Date(),
): string[] {
	const compressed: string[] = [];
	try {
		const root = damageControlDecisionDir();
		if (!fs.existsSync(root)) return [];
		const cutoff = now.getTime() - DAMAGE_CONTROL_LOG_COMPRESS_AFTER_MS;
		for (const name of fs
			.readdirSync(root)
			.filter((entry) => /^decisions-\d{4}-\d{2}\.jsonl$/.test(entry))
			.sort()) {
			const source = path.join(root, name);
			if (fs.statSync(source).mtimeMs >= cutoff) continue;
			const target = `${source}.gz`;
			if (fs.existsSync(target)) continue;
			const temporary = `${target}.${process.pid}.tmp`;
			fs.writeFileSync(temporary, zlib.gzipSync(fs.readFileSync(source)), {
				mode: 0o600,
			});
			fs.renameSync(temporary, target);
			fs.unlinkSync(source);
			compressed.push(target);
		}
	} catch {
		return compressed;
	}
	return compressed;
}

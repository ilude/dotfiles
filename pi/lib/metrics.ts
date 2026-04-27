/**
 * Metrics -- structured JSON-line event logger for pi extensions.
 *
 * Owned by .specs/pi-platform-alignment/plan.md (Phase 4 T13). Replaces ad
 * hoc console.log + custom JSONL writers across extensions with a single
 * append-only event stream.
 *
 * Storage: ~/.pi/agent/logs/metrics.jsonl. Daily rotation via the date
 * suffix on the file name (`metrics-YYYY-MM-DD.jsonl`) when rotateDaily
 * is set; the unsuffixed file is the legacy single-stream form.
 *
 * Each line is a self-describing event:
 *
 *   { "schemaVersion": 1, "id": "<uuid>", "ts": "<iso>", "event": "<name>",
 *     "session": "<id>"?, "data": { ... } }
 *
 * Event names use snake_case to match the existing pi runtime event vocabulary:
 *   tool_use, tool_result, hook_fired, skill_invoked, task_status_change,
 *   routing_decision, permission_decision. Producers may emit any name --
 *   the logger does not enforce a closed enum.
 *
 * The PI_METRICS_DIR env override redirects the log root for tests and
 * separate-environment use. The `metrics.enabled` setting in the merged
 * settings cascade can disable logging entirely; default is enabled.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { getAgentDir } from "./extension-utils.ts";
import { getSetting } from "./settings-loader.ts";

export interface MetricsEvent {
	schemaVersion: 1;
	id: string;
	ts: string;
	event: string;
	session?: string;
	data?: Record<string, unknown>;
}

export interface RecordEventInput {
	event: string;
	session?: string;
	data?: Record<string, unknown>;
}

export interface MetricsConfig {
	enabled: boolean;
	rotateDaily: boolean;
	maxFileBytes: number;
}

const DEFAULT_MAX_BYTES = 32 * 1024 * 1024; // 32 MiB

export function getMetricsDir(): string {
	const override = process.env.PI_METRICS_DIR;
	if (override && override.length > 0) return override;
	return path.join(getAgentDir(), "logs");
}

export function getMetricsConfig(): MetricsConfig {
	const enabled = getSetting<boolean>("metrics.enabled", true);
	const rotateDaily = getSetting<boolean>("metrics.rotateDaily", true);
	const maxFileBytes = getSetting<number>("metrics.maxFileBytes", DEFAULT_MAX_BYTES);
	return { enabled, rotateDaily, maxFileBytes };
}

export function getMetricsLogPath(now: Date = new Date(), config?: MetricsConfig): string {
	const cfg = config ?? getMetricsConfig();
	if (!cfg.rotateDaily) return path.join(getMetricsDir(), "metrics.jsonl");
	const yyyy = now.getUTCFullYear();
	const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
	const dd = String(now.getUTCDate()).padStart(2, "0");
	return path.join(getMetricsDir(), `metrics-${yyyy}-${mm}-${dd}.jsonl`);
}

function ensureDirectory(p: string): void {
	fs.mkdirSync(p, { recursive: true });
}

/**
 * Record a metrics event. Returns the persisted record on success, or null
 * when metrics are disabled / I/O fails. Failure is silent: producers should
 * never crash because metrics could not be written.
 */
export function recordEvent(input: RecordEventInput): MetricsEvent | null {
	const cfg = getMetricsConfig();
	if (!cfg.enabled) return null;
	if (!input.event || typeof input.event !== "string") return null;

	const record: MetricsEvent = {
		schemaVersion: 1,
		id: crypto.randomUUID(),
		ts: new Date().toISOString(),
		event: input.event,
	};
	if (input.session) record.session = input.session;
	if (input.data) record.data = input.data;

	try {
		ensureDirectory(getMetricsDir());
		const logPath = getMetricsLogPath(new Date(), cfg);
		const line = `${JSON.stringify(record)}\n`;
		fs.appendFileSync(logPath, line, "utf-8");

		// Soft cap: when a single file blows past maxFileBytes, append a
		// rotation marker (the next call will continue appending). Hard
		// rotation across files is left to log-shippers.
		try {
			const stat = fs.statSync(logPath);
			if (stat.size > cfg.maxFileBytes) {
				const marker = `${JSON.stringify({
					schemaVersion: 1,
					id: crypto.randomUUID(),
					ts: new Date().toISOString(),
					event: "metrics_rotation_needed",
					data: { sizeBytes: stat.size, capBytes: cfg.maxFileBytes },
				})}\n`;
				fs.appendFileSync(logPath, marker, "utf-8");
			}
		} catch {
			// ignore stat failures
		}
		return record;
	} catch {
		return null;
	}
}

/**
 * Read recent events from the active daily log. Tail-slice; intended for
 * /doctor and other diagnostics, not bulk analytics.
 */
export function readRecentEvents(limit: number = 100): MetricsEvent[] {
	try {
		const logPath = getMetricsLogPath();
		if (!fs.existsSync(logPath)) return [];
		const raw = fs.readFileSync(logPath, "utf-8");
		const events: MetricsEvent[] = [];
		for (const line of raw.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			try {
				const parsed = JSON.parse(trimmed) as MetricsEvent;
				if (parsed?.schemaVersion === 1 && typeof parsed.id === "string") {
					events.push(parsed);
				}
			} catch {
				// skip malformed lines
			}
		}
		events.reverse();
		return events.slice(0, limit);
	} catch {
		return [];
	}
}

import fs from "node:fs/promises";
import path from "node:path";

import {
	buildOrchestrationInteractionEvent,
	buildOrchestrationRunEvent,
	type BuildOrchestrationInteractionInput,
	type BuildOrchestrationRunInput,
	type OrchestrationInteractionData,
	type OrchestrationRunData,
} from "../orchestration-telemetry.ts";
import type { MetricsEvent } from "../metrics.ts";
import { withAnalyticsSession } from "./store.ts";

const MAX_FILES = 367;
const MAX_LINE_BYTES = 8 * 1024 * 1024;
const MAX_INPUT_BYTES = 256 * 1024 * 1024;
const MAX_MALFORMED_LINES = 10_000;
const MAX_EVENTS = 1_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type OrchestrationAnalyticsEvent = {
	id: string;
	ts: string;
	event: "orchestration_run" | "orchestration_interaction";
	data: OrchestrationRunData | OrchestrationInteractionData;
};

export type OrchestrationAnalyticsReview = {
	interactionId: string;
	reviewedAt?: string;
	status?: string;
	classification?: string;
};

export type OrchestrationAnalyticsDiagnostics = {
	filesScanned: number;
	malformedLines: number;
	unsupportedLines: number;
	overLimitLines: number;
	duplicateLines: number;
	totalInputBytes: number;
	truncated: boolean;
	truncationReason?:
		| "file_limit"
		| "line_limit"
		| "input_limit"
		| "malformed_limit";
};

export type ReadOrchestrationAnalyticsOptions = {
	metricsDir: string;
	frictionDir: string;
	days: number;
	now?: Date;
	signal?: AbortSignal;
};

export type ReadOrchestrationAnalyticsResult = {
	events: OrchestrationAnalyticsEvent[];
	reviews: OrchestrationAnalyticsReview[];
	diagnostics: OrchestrationAnalyticsDiagnostics;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function checkCancelled(signal: AbortSignal | undefined): void {
	if (signal?.aborted) throw new Error("analytics operation was cancelled");
}

function dateFileName(date: Date): string {
	return `metrics-${date.toISOString().slice(0, 10)}.jsonl`;
}

async function existingFiles(
	dir: string,
	days: number,
	now: Date,
): Promise<{ files: string[]; overLimit: boolean }> {
	if (!Number.isInteger(days) || days < 1)
		return { files: [], overLimit: false };
	const start = new Date(now.getTime() - days * DAY_MS);
	const cursor = new Date(
		Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
	);
	const end = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
	);
	const names = new Set<string>(["metrics.jsonl"]);
	while (cursor <= end && names.size <= MAX_FILES + 1) {
		names.add(dateFileName(cursor));
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}
	const files: string[] = [];
	for (const name of [...names].sort()) {
		try {
			if ((await fs.stat(path.join(dir, name))).isFile())
				files.push(path.join(dir, name));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
	}
	return {
		files: files.slice(0, MAX_FILES),
		overLimit: files.length > MAX_FILES || names.size > MAX_FILES + 1,
	};
}

async function collectDiagnostics(
	files: readonly string[],
	diagnostics: OrchestrationAnalyticsDiagnostics,
	signal: AbortSignal | undefined,
): Promise<void> {
	for (const file of files) {
		checkCancelled(signal);
		diagnostics.filesScanned += 1;
		const text = await fs.readFile(file, "utf8");
		for (const line of text.split(/\r?\n/)) {
			checkCancelled(signal);
			const bytes = Buffer.byteLength(line, "utf8") + 1;
			if (bytes > MAX_LINE_BYTES) {
				diagnostics.overLimitLines += 1;
				continue;
			}
			if (diagnostics.totalInputBytes + bytes > MAX_INPUT_BYTES) {
				diagnostics.truncated = true;
				diagnostics.truncationReason = "input_limit";
				return;
			}
			diagnostics.totalInputBytes += bytes;
			if (!line.trim()) continue;
			try {
				JSON.parse(line);
			} catch {
				diagnostics.malformedLines += 1;
				if (diagnostics.malformedLines >= MAX_MALFORMED_LINES) {
					diagnostics.truncated = true;
					diagnostics.truncationReason = "malformed_limit";
					return;
				}
			}
		}
	}
}

function normalize(
	event: MetricsEvent,
): OrchestrationAnalyticsEvent | undefined {
	const data = event.data;
	if (
		!isRecord(data) ||
		(data.schemaVersion !== 1 &&
			data.schemaVersion !== 2 &&
			data.schemaVersion !== 3)
	)
		return undefined;
	const {
		schemaVersion: _schemaVersion,
		inlineBytesNotReturned: _inlineBytesNotReturned,
		...payload
	} = data;
	if (event.event === "orchestration_run") {
		const built = buildOrchestrationRunEvent({
			...payload,
			session: event.session,
		} as unknown as BuildOrchestrationRunInput);
		return built
			? {
					id: event.id,
					ts: event.ts,
					event: "orchestration_run",
					data: built.data,
				}
			: undefined;
	}
	if (event.event === "orchestration_interaction") {
		const built = buildOrchestrationInteractionEvent({
			...payload,
			session: event.session,
		} as unknown as BuildOrchestrationInteractionInput);
		return built
			? {
					id: event.id,
					ts: event.ts,
					event: "orchestration_interaction",
					data: built.data,
				}
			: undefined;
	}
	return undefined;
}

function recordValue(row: Record<string, unknown>): Record<string, unknown> {
	const record = row.record;
	if (typeof record === "string") return JSON.parse(record) as Record<string, unknown>;
	if (isRecord(record)) return record;
	throw new Error("invalid orchestration analytics record");
}

function decodeEvent(row: Record<string, unknown>): OrchestrationAnalyticsEvent | undefined {
	if (typeof row.id !== "string" || typeof row.ts !== "string")
		throw new Error("invalid orchestration analytics view row");
	const record = recordValue(row);
	return normalize({
		schemaVersion: 1,
		id: row.id,
		ts: row.ts,
		event: row.event,
		data: record.data,
		session: record.session,
	} as MetricsEvent);
}

function decodeReview(row: Record<string, unknown>): OrchestrationAnalyticsReview {
	const record = recordValue(row);
	if (typeof record.interactionId !== "string")
		throw new Error("invalid orchestration review view row");
	const review = isRecord(record.review) ? record.review : undefined;
	return {
		interactionId: record.interactionId,
		...(typeof record.reviewedAt === "string"
			? { reviewedAt: record.reviewedAt }
			: {}),
		...(typeof record.status === "string" ? { status: record.status } : {}),
		...(typeof review?.classification === "string"
			? { classification: review.classification }
			: {}),
	};
}

export async function readOrchestrationAnalytics(
	options: ReadOrchestrationAnalyticsOptions,
): Promise<ReadOrchestrationAnalyticsResult> {
	const now = options.now ?? new Date();
	const diagnostics: OrchestrationAnalyticsDiagnostics = {
		filesScanned: 0,
		malformedLines: 0,
		unsupportedLines: 0,
		overLimitLines: 0,
		duplicateLines: 0,
		totalInputBytes: 0,
		truncated: false,
	};
	checkCancelled(options.signal);
	const discovered = await existingFiles(options.metricsDir, options.days, now);
	if (discovered.overLimit) {
		diagnostics.truncated = true;
		diagnostics.truncationReason = "file_limit";
	}
	await collectDiagnostics(discovered.files, diagnostics, options.signal);
	return withAnalyticsSession(
		{
			root: options.metricsDir,
			sources: ["orchestration_events", "friction_reviews"],
			signal: options.signal,
			sourceRoots: {
				orchestration_events: [options.metricsDir],
				friction_reviews: [options.frictionDir],
			},
		},
		async (session) => {
			const start = new Date(now.getTime() - options.days * DAY_MS).toISOString();
			const end = now.toISOString();
			const [eventRows, reviewRows] = await Promise.all([
				session.query({
					sql: `SELECT _record_key AS id, _timestamp AS ts, event, record
						FROM orchestration_events
						WHERE _timestamp >= $start AND _timestamp <= $end
						ORDER BY _timestamp ASC, _record_key ASC`,
					parameters: { start, end },
					maxRows: MAX_EVENTS,
					maxBytes: MAX_INPUT_BYTES,
				}),
				session.query({
					sql: `SELECT record FROM friction_reviews ORDER BY _timestamp ASC, _record_key ASC`,
					maxRows: MAX_EVENTS,
					maxBytes: MAX_INPUT_BYTES,
				}),
			]);
			const events: OrchestrationAnalyticsEvent[] = [];
			const seen = new Set<string>();
			for (const row of eventRows.rows) {
				const event = decodeEvent(row);
				if (!event) {
					diagnostics.unsupportedLines += 1;
					continue;
				}
				if (seen.has(event.id)) {
					diagnostics.duplicateLines += 1;
					continue;
				}
				seen.add(event.id);
				events.push(event);
			}
			return {
				events,
				reviews: reviewRows.rows.map(decodeReview),
				diagnostics,
			};
		},
	);
}

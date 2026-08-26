import { createHash } from "node:crypto";
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
import { LogAnalyticsStore, type SourceDefinition } from "./store.ts";

const MAX_FILES = 367;
const MAX_LINE_BYTES = 8 * 1024 * 1024;
const MAX_INPUT_BYTES = 256 * 1024 * 1024;
const MAX_MALFORMED_LINES = 10_000;
const MAX_EVENTS = 1_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const ORCHESTRATION_EVENTS_SOURCE = "orchestration_stats_events";
const ORCHESTRATION_REVIEWS_SOURCE = "orchestration_stats_reviews";

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

type StagedEvent = {
	event_id: string;
	timestamp: string;
	event_type: string;
	data_json: string;
};

type StagedReview = {
	interaction_id: string;
	reviewed_at: string | null;
	status: string | null;
	classification: string | null;
	source_line: number;
};

const eventDefinition: SourceDefinition<StagedEvent> = {
	name: ORCHESTRATION_EVENTS_SOURCE,
	columns: [
		{ name: "event_id", type: "VARCHAR" },
		{ name: "timestamp", type: "VARCHAR" },
		{ name: "event_type", type: "VARCHAR" },
		{ name: "data_json", type: "VARCHAR" },
	],
	parse: (value) => {
		if (!isRecord(value)) return undefined;
		if (
			typeof value.event_id !== "string" ||
			typeof value.timestamp !== "string" ||
			typeof value.event_type !== "string" ||
			typeof value.data_json !== "string"
		)
			return undefined;
		return {
			event_id: value.event_id,
			timestamp: value.timestamp,
			event_type: value.event_type,
			data_json: value.data_json,
		};
	},
};

const reviewDefinition: SourceDefinition<StagedReview> = {
	name: ORCHESTRATION_REVIEWS_SOURCE,
	columns: [
		{ name: "interaction_id", type: "VARCHAR" },
		{ name: "reviewed_at", type: "VARCHAR" },
		{ name: "status", type: "VARCHAR" },
		{ name: "classification", type: "VARCHAR" },
		{ name: "source_line", type: "BIGINT" },
	],
	parse: (value) => {
		if (!isRecord(value) || typeof value.interaction_id !== "string")
			return undefined;
		return {
			interaction_id: value.interaction_id,
			reviewed_at: stringOrNull(value.reviewed_at),
			status: stringOrNull(value.status),
			classification: stringOrNull(value.classification),
			source_line: numberOrZero(value.source_line),
		};
	},
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function numberOrZero(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
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

function validEvent(value: unknown): value is MetricsEvent {
	if (!isRecord(value)) return false;
	return (
		value.schemaVersion === 1 &&
		typeof value.id === "string" &&
		typeof value.ts === "string" &&
		typeof value.event === "string" &&
		(value.data === undefined || isRecord(value.data))
	);
}

function inWindow(event: MetricsEvent, start: number, end: number): boolean {
	const timestamp = Date.parse(event.ts);
	return Number.isFinite(timestamp) && timestamp >= start && timestamp <= end;
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

function stagedEvent(event: OrchestrationAnalyticsEvent): StagedEvent {
	return {
		event_id: event.id,
		timestamp: event.ts,
		event_type: event.event,
		data_json: JSON.stringify(event.data),
	};
}

function stagingPath(root: string, source: string, kind: string): string {
	const digest = createHash("sha256").update(source).digest("hex");
	return path.join(root, ".orchestration-stats", `${kind}-${digest}.jsonl`);
}

async function writeStaged<T>(
	filePath: string,
	rows: readonly T[],
	signal: AbortSignal | undefined,
): Promise<void> {
	checkCancelled(signal);
	const content = rows.length
		? `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`
		: "";
	let previous: string | undefined;
	try {
		previous = await fs.readFile(filePath, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	if (previous === content) return;
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, content, "utf8");
}

async function scanMetrics(
	files: readonly string[],
	root: string,
	now: Date,
	days: number,
	diagnostics: OrchestrationAnalyticsDiagnostics,
	signal: AbortSignal | undefined,
): Promise<string[]> {
	const start = now.getTime() - days * DAY_MS;
	const seen = new Set<string>();
	const staged: string[] = [];
	for (const file of files) {
		checkCancelled(signal);
		diagnostics.filesScanned += 1;
		const text = await fs.readFile(file, "utf8");
		const events: StagedEvent[] = [];
		const lines = text.split(/\r?\n/);
		for (const line of lines) {
			checkCancelled(signal);
			const bytes = Buffer.byteLength(line, "utf8") + 1;
			if (bytes > MAX_LINE_BYTES) {
				diagnostics.overLimitLines += 1;
				continue;
			}
			if (diagnostics.totalInputBytes + bytes > MAX_INPUT_BYTES) {
				diagnostics.truncated = true;
				diagnostics.truncationReason = "input_limit";
				break;
			}
			diagnostics.totalInputBytes += bytes;
			if (!line.trim()) continue;
			let parsed: unknown;
			try {
				parsed = JSON.parse(line);
			} catch {
				diagnostics.malformedLines += 1;
				if (diagnostics.malformedLines >= MAX_MALFORMED_LINES) {
					diagnostics.truncated = true;
					diagnostics.truncationReason = "malformed_limit";
					break;
				}
				continue;
			}
			if (
				!validEvent(parsed) ||
				!inWindow(parsed, start, now.getTime()) ||
				(parsed.event !== "orchestration_run" &&
					parsed.event !== "orchestration_interaction")
			)
				continue;
			const normalized = normalize(parsed);
			if (!normalized) {
				diagnostics.unsupportedLines += 1;
				continue;
			}
			if (seen.has(normalized.id)) {
				diagnostics.duplicateLines += 1;
				continue;
			}
			seen.add(normalized.id);
			events.push(stagedEvent(normalized));
		}
		const stagedPath = stagingPath(root, file, "events");
		await writeStaged(stagedPath, events, signal);
		staged.push(stagedPath);
		if (diagnostics.truncated && diagnostics.truncationReason !== "file_limit")
			break;
	}
	return staged;
}

async function scanReviews(
	file: string,
	root: string,
	signal: AbortSignal | undefined,
): Promise<string[]> {
	let text: string;
	try {
		text = await fs.readFile(file, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
	const rows: StagedReview[] = [];
	for (const [index, line] of text.split(/\r?\n/).entries()) {
		checkCancelled(signal);
		if (!line.trim()) continue;
		let value: unknown;
		try {
			value = JSON.parse(line);
		} catch {
			continue;
		}
		if (!isRecord(value) || typeof value.interactionId !== "string") continue;
		const review = isRecord(value.review) ? value.review : undefined;
		rows.push({
			interaction_id: value.interactionId,
			reviewed_at: stringOrNull(value.reviewedAt),
			status: stringOrNull(value.status),
			classification: stringOrNull(review?.classification),
			source_line: index + 1,
		});
	}
	const stagedPath = stagingPath(root, file, "reviews");
	await writeStaged(stagedPath, rows, signal);
	return [stagedPath];
}

function decodeEvent(row: Record<string, unknown>): OrchestrationAnalyticsEvent {
	if (
		typeof row.event_id !== "string" ||
		typeof row.timestamp !== "string" ||
		typeof row.event_type !== "string" ||
		typeof row.data_json !== "string"
	)
		throw new Error("invalid orchestration analytics projection row");
	const data = JSON.parse(row.data_json) as
		| OrchestrationRunData
		| OrchestrationInteractionData;
	if (
		row.event_type !== "orchestration_run" &&
		row.event_type !== "orchestration_interaction"
	)
		throw new Error("invalid orchestration analytics event type");
	return {
		id: row.event_id,
		ts: row.timestamp,
		event: row.event_type,
		data,
	};
}

function decodeReview(row: Record<string, unknown>): OrchestrationAnalyticsReview {
	if (typeof row.interaction_id !== "string")
		throw new Error("invalid orchestration review projection row");
	return {
		interactionId: row.interaction_id,
		...(typeof row.reviewed_at === "string"
			? { reviewedAt: row.reviewed_at }
			: {}),
		...(typeof row.status === "string" ? { status: row.status } : {}),
		...(typeof row.classification === "string"
			? { classification: row.classification }
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
	const store = await LogAnalyticsStore.open(
		path.join(options.metricsDir, "analytics", "log-analytics.duckdb"),
	);
	try {
		await store.register(eventDefinition);
		await store.register(reviewDefinition);
		const eventPaths = await scanMetrics(
			discovered.files,
			options.metricsDir,
			now,
			options.days,
			diagnostics,
			options.signal,
		);
		await store.refresh(eventDefinition, eventPaths, {
			maxBytes: MAX_INPUT_BYTES,
			maxRecords: MAX_EVENTS,
			maxLineBytes: MAX_LINE_BYTES,
			signal: options.signal,
		});
		const reviewPath = path.join(options.frictionDir, "reviews.jsonl");
		const reviewPaths = await scanReviews(
			reviewPath,
			options.metricsDir,
			options.signal,
		);
		await store.refresh(reviewDefinition, reviewPaths, {
			maxBytes: MAX_INPUT_BYTES,
			maxRecords: MAX_EVENTS,
			maxLineBytes: MAX_LINE_BYTES,
			signal: options.signal,
		});
		const events = (
			await store.query(
				`SELECT event_id, timestamp, event_type, data_json FROM source_${ORCHESTRATION_EVENTS_SOURCE} ORDER BY timestamp ASC, event_id ASC LIMIT ${MAX_EVENTS}`,
				[],
				options.signal,
			)
		).map(decodeEvent);
		const reviews = (
			await store.query(
				`SELECT interaction_id, reviewed_at, status, classification FROM source_${ORCHESTRATION_REVIEWS_SOURCE} ORDER BY source_line ASC LIMIT ${MAX_EVENTS}`,
				[],
				options.signal,
			)
		).map(decodeReview);
		return { events, reviews, diagnostics };
	} finally {
		await store.close();
	}
}

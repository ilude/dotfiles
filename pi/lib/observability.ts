import { performance } from "node:perf_hooks";
import { recordEvent, type MetricsEvent } from "./metrics.js";

export interface Clock {
	nowMs(): number;
	wallTime(): Date;
}

export const performanceClock: Clock = {
	nowMs: () => performance.now(),
	wallTime: () => new Date(),
};

export type SpanStatus = "ok" | "error" | "cancelled";

export interface TimingSpanRecord {
	name: string;
	category: "command" | "tool" | "subagent" | "reviewer" | "panel" | "recovery" | "synthesis" | "helper";
	startWallTime: string;
	endWallTime: string;
	durationMs: number;
	status: SpanStatus;
	parentId?: string;
	spanId: string;
	metadata?: Record<string, string | number | boolean | null>;
	errorType?: string;
}

export interface TimingSpanOptions {
	name: TimingSpanRecord["name"];
	category: TimingSpanRecord["category"];
	parentId?: string;
	metadata?: Record<string, unknown>;
	clock?: Clock;
}

const SAFE_METADATA_KEYS = new Set([
	"agent",
	"agentSource",
	"mode",
	"command",
	"tool",
	"taskCount",
	"step",
	"exitCode",
	"reviewer",
	"status",
	"modelSize",
	"modelPolicy",
]);

function randomId(): string {
	return Math.random().toString(16).slice(2, 10) + Date.now().toString(16).slice(-8);
}

export function sanitizeTimingMetadata(input: Record<string, unknown> | undefined): TimingSpanRecord["metadata"] | undefined {
	if (!input) return undefined;
	const out: Record<string, string | number | boolean | null> = {};
	for (const [key, value] of Object.entries(input)) {
		if (!SAFE_METADATA_KEYS.has(key)) continue;
		if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
			const scalar = value as string | number | boolean | null;
			out[key] = typeof scalar === "string" && scalar.length > 120 ? `${scalar.slice(0, 117)}...` : scalar;
		}
	}
	return Object.keys(out).length > 0 ? out : undefined;
}

export class TimingSpan {
	readonly spanId: string;
	private readonly clock: Clock;
	private readonly startMonoMs: number;
	private readonly startWall: Date;
	private finished = false;

	constructor(private readonly options: TimingSpanOptions) {
		this.clock = options.clock ?? performanceClock;
		this.startMonoMs = this.clock.nowMs();
		this.startWall = this.clock.wallTime();
		this.spanId = randomId();
	}

	finish(status: SpanStatus = "ok", extra: Record<string, unknown> = {}, err?: unknown): MetricsEvent | null {
		if (this.finished) return null;
		this.finished = true;
		const endMonoMs = this.clock.nowMs();
		const endWall = this.clock.wallTime();
		const durationMs = Math.max(0, Math.round((endMonoMs - this.startMonoMs) * 1000) / 1000);
		const metadata = sanitizeTimingMetadata({ ...this.options.metadata, ...extra });
		const errorType = err instanceof Error ? err.name : err ? typeof err : undefined;
		const record: TimingSpanRecord = {
			name: this.options.name,
			category: this.options.category,
			startWallTime: this.startWall.toISOString(),
			endWallTime: endWall.toISOString(),
			durationMs,
			status,
			spanId: this.spanId,
			...(this.options.parentId ? { parentId: this.options.parentId } : {}),
			...(metadata ? { metadata } : {}),
			...(errorType ? { errorType } : {}),
		};
		return recordEvent({ event: "timing_span", data: record as unknown as Record<string, unknown> });
	}
}

export async function withTimingSpan<T>(options: TimingSpanOptions, fn: (span: TimingSpan) => Promise<T>): Promise<T> {
	const span = new TimingSpan(options);
	try {
		const result = await fn(span);
		span.finish("ok");
		return result;
	} catch (err) {
		const status = err instanceof Error && /abort|cancel/i.test(err.message) ? "cancelled" : "error";
		span.finish(status, {}, err);
		throw err;
	}
}

export function summarizeTimingSpans(events: Array<{ event: string; data?: Record<string, unknown> }>, maxItems = 5): string[] {
	const spans = events
		.filter((event) => event.event === "timing_span" && event.data && typeof event.data.durationMs === "number")
		.map((event) => event.data as unknown as TimingSpanRecord)
		.sort((a, b) => b.durationMs - a.durationMs)
		.slice(0, maxItems);
	return spans.map((span) => `${span.category}:${span.name} ${span.durationMs}ms ${span.status}`);
}

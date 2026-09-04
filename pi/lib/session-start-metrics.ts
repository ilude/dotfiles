import { performance } from "node:perf_hooks";
import path from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
	SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import { reportActionableExtensionFailure } from "./extension-diagnostics.js";
import { recordEvents, type RecordEventInput } from "./metrics.js";

export type SessionStartHandler = (
	event: SessionStartEvent,
	ctx: ExtensionContext,
) => void | Promise<void>;

export interface SessionStartClock {
	nowMs(): number;
}

const performanceClock: SessionStartClock = {
	nowMs: () => performance.now(),
};

const pendingEvents: RecordEventInput[] = [];
let flushScheduled = false;

function flushPendingEvents(): void {
	flushScheduled = false;
	recordEvents(pendingEvents.splice(0));
}

function enqueueEvent(event: RecordEventInput): void {
	pendingEvents.push(event);
	if (flushScheduled) return;
	flushScheduled = true;
	const timer = setTimeout(flushPendingEvents, 0);
	timer.unref?.();
}

export function extensionNameFromUrl(extensionUrl: string): string {
	const filePath = new URL(extensionUrl).pathname;
	const baseName = path.posix.basename(filePath).replace(/\.[^.]+$/, "");
	return baseName === "index"
		? path.posix.basename(path.posix.dirname(filePath))
		: baseName;
}

export function onSessionStart(
	pi: ExtensionAPI,
	extensionUrl: string,
	handler: SessionStartHandler,
	clock: SessionStartClock = performanceClock,
): void {
	const extension = extensionNameFromUrl(extensionUrl);
	pi.on("session_start", async (event, ctx) => {
		const startedAt = clock.nowMs();
		let status: "ok" | "error" = "ok";
		try {
			await handler(event, ctx);
		} catch (error) {
			status = "error";
			reportActionableExtensionFailure(pi, ctx, {
				extension,
				failure: error instanceof Error ? error.message : String(error),
				impact: `The ${event.reason} session-start handler did not complete.`,
				nextAction: "Inspect the extension and current session state before relying on its startup behavior.",
			}, { notify: false });
			throw error;
		} finally {
			const durationMs = Math.max(
				0,
				Math.round((clock.nowMs() - startedAt) * 1000) / 1000,
			);
			enqueueEvent({
				event: "extension_session_start",
				session: ctx.sessionManager?.getSessionId?.() ?? undefined,
				data: {
					extension,
					reason: event.reason,
					durationMs,
					status,
				},
			});
			if (status === "error") flushPendingEvents();
		}
	});
}

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
	SessionEntry,
	SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import registerSessionTime, {
	SESSION_TIME_MESSAGE_TYPE,
} from "../extensions/session-time.js";
import { whenMetricsFlushed } from "../lib/session-start-metrics.js";

const previousMetricsDir = process.env.PI_METRICS_DIR;
const temporaryDirectories: string[] = [];

afterEach(async () => {
	await whenMetricsFlushed();
	if (previousMetricsDir === undefined) delete process.env.PI_METRICS_DIR;
	else process.env.PI_METRICS_DIR = previousMetricsDir;
	for (const directory of temporaryDirectories.splice(0))
		fs.rmSync(directory, { recursive: true, force: true });
});

function runtime(initialEntries: SessionEntry[] = []) {
	const entries = [...initialEntries];
	const sent: Array<{ message: Record<string, unknown>; options: Record<string, unknown> }> = [];
	let sessionStart:
		| ((event: SessionStartEvent, ctx: ExtensionContext) => Promise<void>)
		| undefined;
	const pi = {
		on(event: string, handler: typeof sessionStart) {
			if (event === "session_start") sessionStart = handler;
		},
		sendMessage(message: Record<string, unknown>, options: Record<string, unknown>) {
			sent.push({ message, options });
			entries.push({
				type: "custom_message",
				id: `entry-${entries.length}`,
				timestamp: new Date().toISOString(),
				customType: String(message.customType),
				content: message.content,
				display: message.display === true,
			} as SessionEntry);
		},
	} as unknown as ExtensionAPI;
	const ctx = {
		sessionManager: {
			getEntries: () => entries,
			getSessionId: () => "session-time-test",
		},
	} as unknown as ExtensionContext;
	registerSessionTime(pi);
	return {
		sent,
		start: async (reason: SessionStartEvent["reason"]) => {
			if (!sessionStart) throw new Error("session_start was not registered");
			await sessionStart({ type: "session_start", reason }, ctx);
		},
	};
}

describe("session time context", () => {
	it("injects one hidden context message and keeps it stable on reload", async () => {
		const metricsDirectory = fs.mkdtempSync(
			path.join(os.tmpdir(), "pi-session-time-"),
		);
		temporaryDirectories.push(metricsDirectory);
		process.env.PI_METRICS_DIR = metricsDirectory;
		const instance = runtime();

		await instance.start("startup");
		await instance.start("reload");
		await whenMetricsFlushed();

		expect(instance.sent).toHaveLength(1);
		expect(instance.sent[0]).toMatchObject({
			message: {
				customType: SESSION_TIME_MESSAGE_TYPE,
				display: false,
			},
			options: { triggerTurn: false },
		});
	});
});

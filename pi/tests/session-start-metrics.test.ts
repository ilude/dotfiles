import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
	SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import {
	extensionNameFromUrl,
	onSessionStart,
} from "../lib/session-start-metrics.js";

const originalMetricsDir = process.env.PI_METRICS_DIR;
const temporaryDirectories: string[] = [];

afterEach(() => {
	if (originalMetricsDir === undefined) delete process.env.PI_METRICS_DIR;
	else process.env.PI_METRICS_DIR = originalMetricsDir;
	for (const directory of temporaryDirectories.splice(0))
		fs.rmSync(directory, { recursive: true, force: true });
});

function captureHandler(): {
	pi: ExtensionAPI;
	handler: (event: SessionStartEvent, ctx: ExtensionContext) => Promise<void>;
} {
	let handler: ((event: SessionStartEvent, ctx: ExtensionContext) => Promise<void>) | undefined;
	const pi = {
		on(event: string, candidate: typeof handler) {
			if (event === "session_start") handler = candidate;
		},
	} as unknown as ExtensionAPI;
	return {
		pi,
		get handler() {
			if (!handler) throw new Error("session_start handler was not registered");
			return handler;
		},
	};
}

function context(sessionId = "session-1"): ExtensionContext {
	return {
		sessionManager: { getSessionId: () => sessionId },
	} as unknown as ExtensionContext;
}

async function readRecordedEvent(directory: string): Promise<Record<string, unknown>> {
	await new Promise((resolve) => setTimeout(resolve, 20));
	const file = fs
		.readdirSync(directory)
		.find((name) => name.startsWith("metrics-") && name.endsWith(".jsonl"));
	if (!file) throw new Error("metrics file was not written");
	return JSON.parse(fs.readFileSync(path.join(directory, file), "utf8").trim());
}

describe("session_start metrics", () => {
	it("derives stable extension names from top-level and index URLs", () => {
		expect(extensionNameFromUrl("file:///repo/extensions/model-visibility.ts")).toBe(
			"model-visibility",
		);
		expect(extensionNameFromUrl("file:///repo/extensions/subagent/index.ts")).toBe(
			"subagent",
		);
	});

	it("records successful awaited handler duration without changing execution", async () => {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pi-startup-metrics-"));
		temporaryDirectories.push(directory);
		process.env.PI_METRICS_DIR = directory;
		const runtime = captureHandler();
		const calls: string[] = [];
		const times = [10, 17];

		onSessionStart(
			runtime.pi,
			"file:///repo/extensions/example.ts",
			async () => {
				await Promise.resolve();
				calls.push("done");
			},
			{ nowMs: () => times.shift() ?? 17 },
		);
		await runtime.handler(
			{ type: "session_start", reason: "startup" },
			context(),
		);

		expect(calls).toEqual(["done"]);
		const event = await readRecordedEvent(directory);
		expect(event).toMatchObject({
			event: "extension_session_start",
			session: "session-1",
			data: {
				extension: "example",
				reason: "startup",
				durationMs: 7,
				status: "ok",
			},
		});
	});

	it("records errors and rethrows the original failure", async () => {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pi-startup-metrics-"));
		temporaryDirectories.push(directory);
		process.env.PI_METRICS_DIR = directory;
		const runtime = captureHandler();
		const failure = new Error("startup failed");

		onSessionStart(
			runtime.pi,
			"file:///repo/extensions/failing.ts",
			() => {
				throw failure;
			},
			{ nowMs: (() => {
				const times = [2, 5];
				return () => times.shift() ?? 5;
			})() },
		);

		await expect(
			runtime.handler(
				{ type: "session_start", reason: "reload" },
				context(),
			),
		).rejects.toBe(failure);
		const event = await readRecordedEvent(directory);
		expect(event).toMatchObject({
			data: { extension: "failing", reason: "reload", status: "error" },
		});
	});
});

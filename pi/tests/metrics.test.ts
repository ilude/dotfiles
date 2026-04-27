import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	getMetricsConfig,
	getMetricsLogPath,
	readRecentEvents,
	recordEvent,
} from "../lib/metrics.js";
import { invalidateSettingsCache } from "../lib/settings-loader.js";

let tmpRoot: string;
let prevMetricsDir: string | undefined;
let prevOperatorDir: string | undefined;

beforeEach(() => {
	tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-metrics-"));
	prevMetricsDir = process.env.PI_METRICS_DIR;
	prevOperatorDir = process.env.PI_OPERATOR_DIR;
	process.env.PI_METRICS_DIR = tmpRoot;
	// Force settings-loader to skip ~/.pi/agent/settings.json so getSetting
	// in metrics doesn't pick up unrelated user settings during tests.
	process.env.PI_OPERATOR_DIR = path.join(tmpRoot, "operator");
	invalidateSettingsCache();
});

afterEach(() => {
	if (prevMetricsDir === undefined) delete process.env.PI_METRICS_DIR;
	else process.env.PI_METRICS_DIR = prevMetricsDir;
	if (prevOperatorDir === undefined) delete process.env.PI_OPERATOR_DIR;
	else process.env.PI_OPERATOR_DIR = prevOperatorDir;
	invalidateSettingsCache();
	fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("getMetricsLogPath", () => {
	it("uses date-suffixed filename when rotateDaily is true", () => {
		const date = new Date("2026-04-27T12:34:56Z");
		const p = getMetricsLogPath(date, { enabled: true, rotateDaily: true, maxFileBytes: 1 });
		expect(p).toBe(path.join(tmpRoot, "metrics-2026-04-27.jsonl"));
	});

	it("uses unsuffixed filename when rotateDaily is false", () => {
		const p = getMetricsLogPath(new Date(), { enabled: true, rotateDaily: false, maxFileBytes: 1 });
		expect(p).toBe(path.join(tmpRoot, "metrics.jsonl"));
	});
});

describe("getMetricsConfig", () => {
	it("returns enabled=true by default", () => {
		const cfg = getMetricsConfig();
		expect(cfg.enabled).toBe(true);
		expect(cfg.rotateDaily).toBe(true);
	});
});

describe("recordEvent", () => {
	it("appends a JSON-line event to the active log", () => {
		const event = recordEvent({ event: "tool_use", data: { tool: "bash", argc: 3 } });
		expect(event).not.toBeNull();
		expect(event?.event).toBe("tool_use");

		const logPath = getMetricsLogPath();
		const raw = fs.readFileSync(logPath, "utf-8").trim();
		expect(raw.split("\n").length).toBe(1);
		const parsed = JSON.parse(raw);
		expect(parsed.schemaVersion).toBe(1);
		expect(parsed.event).toBe("tool_use");
		expect(parsed.data.tool).toBe("bash");
	});

	it("returns null and writes nothing when event name is missing", () => {
		const result = recordEvent({ event: "" });
		expect(result).toBeNull();
		expect(fs.existsSync(getMetricsLogPath())).toBe(false);
	});

	it("appends multiple events without overwriting", () => {
		recordEvent({ event: "a" });
		recordEvent({ event: "b" });
		recordEvent({ event: "c" });
		const lines = fs.readFileSync(getMetricsLogPath(), "utf-8").trim().split("\n");
		expect(lines.length).toBe(3);
	});

	it("preserves session and data fields when supplied", () => {
		recordEvent({
			event: "task_status_change",
			session: "sess-42",
			data: { from: "running", to: "completed" },
		});
		const events = readRecentEvents();
		expect(events[0].session).toBe("sess-42");
		expect(events[0].data).toEqual({ from: "running", to: "completed" });
	});
});

describe("readRecentEvents", () => {
	it("returns [] when log does not exist", () => {
		expect(readRecentEvents()).toEqual([]);
	});

	it("returns newest-first", async () => {
		recordEvent({ event: "first" });
		await new Promise((r) => setTimeout(r, 5));
		recordEvent({ event: "second" });
		const events = readRecentEvents();
		expect(events[0].event).toBe("second");
		expect(events[1].event).toBe("first");
	});

	it("respects limit", () => {
		for (let i = 0; i < 10; i++) recordEvent({ event: `e${i}` });
		expect(readRecentEvents(3).length).toBe(3);
	});

	it("skips malformed lines instead of poisoning the read", () => {
		const logPath = getMetricsLogPath();
		fs.mkdirSync(path.dirname(logPath), { recursive: true });
		fs.writeFileSync(
			logPath,
			[
				JSON.stringify({
					schemaVersion: 1,
					id: "valid-1",
					ts: new Date().toISOString(),
					event: "ok",
				}),
				"not json",
			].join("\n"),
			"utf-8",
		);
		const events = readRecentEvents();
		expect(events.length).toBe(1);
		expect(events[0].id).toBe("valid-1");
	});
});

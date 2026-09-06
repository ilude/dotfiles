import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { collectExtensionUsageSnapshot } from "../extensions/extension-stats.ts";
import { collectSkillStats } from "../extensions/skill-stats.ts";
import { renderOrchestrationStatsReport } from "../extensions/orchestration-stats.js";
import { withAnalyticsSession } from "../lib/log-analytics/store.ts";
import { aggregateFailureOutcomes, scanToolFailures, selectedFailureCoordinates, type SessionEntry } from "../lib/tool-failure-classifier.ts";

const roots: string[] = [];
afterEach(async () => {
	delete process.env.PI_METRICS_DIR;
	delete process.env.PI_WORKFLOW_FRICTION_DIR;
	for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

function run(id: string, interactionId: string): Record<string, unknown> {
	return {
		schemaVersion: 1,
		orchestrationId: id,
		interactionId,
		mode: "single",
		status: "completed",
		durationMs: 10,
		childWorkMs: 8,
		childTextBytes: 12,
		parentVisibleBytes: 4,
		workers: [],
	};
}

function interaction(id: string): Record<string, unknown> {
	return {
		schemaVersion: 1,
		interactionId: id,
		orchestrationIds: [],
		direct: true,
		durationMs: 5,
		parentUsageByModel: [],
	};
}

describe("integrated analytics fixture", () => {
	it("identifies records, finds failures, and preserves all affected reports through one direct engine", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-analytics-parity-"));
		roots.push(root);
		const sessions = path.join(root, "sessions");
		const metrics = path.join(root, "metrics");
		const friction = path.join(root, "workflow-friction");
		await Promise.all([fs.mkdir(sessions), fs.mkdir(metrics), fs.mkdir(friction)]);
		await fs.writeFile(path.join(sessions, "one.jsonl"), [
			JSON.stringify({ type: "session", id: "session-one", timestamp: "2026-08-20T00:00:00Z" }),
			JSON.stringify({ type: "message", id: "call-entry", timestamp: "2026-08-20T00:01:00Z", message: { role: "assistant", content: [{ type: "toolCall", id: "call-1", name: "custom" }] } }),
			JSON.stringify({ type: "message", id: "call-entry", timestamp: "2026-08-20T00:01:01Z", message: { role: "assistant", content: [{ type: "toolCall", id: "call-1", name: "custom" }] } }),
			"malformed",
			JSON.stringify({ type: "message", id: "result-entry", timestamp: "2026-08-20T00:02:00Z", message: { role: "toolResult", toolCallId: "call-1", isError: true, content: [{ type: "text", text: "this.broker.reconcile is not a function" }] } }),
			JSON.stringify({ type: "message", id: "call-command", timestamp: "2026-08-20T00:03:00Z", message: { role: "assistant", content: [{ type: "toolCall", id: "call-command", name: "bash" }] } }),
			JSON.stringify({ type: "message", id: "result-command", timestamp: "2026-08-20T00:04:00Z", message: { role: "toolResult", toolCallId: "call-command", isError: true, content: [{ type: "text", text: "Command exited with code 1" }] } }),
			JSON.stringify({ type: "message", id: "call-expected", timestamp: "2026-08-20T00:05:00Z", message: { role: "assistant", content: [{ type: "toolCall", id: "call-expected", name: "bash" }] } }),
			JSON.stringify({ type: "message", id: "result-expected", timestamp: "2026-08-20T00:06:00Z", message: { role: "toolResult", toolCallId: "call-expected", isError: true, content: [{ type: "text", text: "Blocked unsafe shell edit" }] } }),
			JSON.stringify({ type: "message", id: "call-unknown", timestamp: "2026-08-20T00:07:00Z", message: { role: "assistant", content: [{ type: "toolCall", id: "call-unknown", name: "custom" }] } }),
			JSON.stringify({ type: "message", id: "result-unknown", timestamp: "2026-08-20T00:08:00Z", message: { role: "toolResult", toolCallId: "call-unknown", isError: true, content: [{ type: "text", text: "An unrecognized runtime condition occurred" }] } }),
			JSON.stringify({ id: "large", timestamp: "2026-08-21T00:00:00Z", content: "needle " + "x".repeat(1_100_000) }),
		].join("\n") + "\n");
		await fs.writeFile(path.join(metrics, "metrics-2026-08-20.jsonl"), [
			JSON.stringify({ id: "run-1", event: "orchestration_run", ts: "2026-08-20T00:03:00Z", data: run("orch-1", "interaction-1") }),
			JSON.stringify({ id: "interaction-1", event: "orchestration_interaction", ts: "2026-08-20T00:04:00Z", data: interaction("interaction-1") }),
		].join("\n") + "\n");
		await fs.writeFile(path.join(friction, "reviews.jsonl"), JSON.stringify({ interactionId: "interaction-1", status: "completed", review: { classification: "productive" } }) + "\n");
		process.env.PI_METRICS_DIR = metrics;
		process.env.PI_WORKFLOW_FRICTION_DIR = friction;

		const entries = await withAnalyticsSession({ root, sources: ["session_entries"] }, async (session) => {
			const result = await session.query({
				sql: "SELECT _source_file AS filename, _record_key AS id, _timestamp AS timestamp, record FROM session_entries WHERE _timestamp >= $date AND json_extract_string(record, '$.content') LIKE $content ORDER BY _timestamp",
				parameters: { date: "2026-08-20", content: "%needle%" },
				maxBytes: 2_000_000,
			});
			expect(result.rows).toHaveLength(1);
			expect(result.rows[0]?.id).toBe("large");
			expect(JSON.stringify(result.rows[0]).length).toBeGreaterThan(1_000_000);
			return (await session.query({ sql: "SELECT _source_file AS filename, _record_key AS id, _timestamp AS timestamp, record FROM session_entries ORDER BY _source_file, _record_key", maxRows: 100, maxBytes: 64 * 1024 * 1024 })).rows;
		});
		const scanRows: SessionEntry[] = entries.map((row) => {
			const record = typeof row.record === "string" ? JSON.parse(row.record) as Record<string, any> : row.record as Record<string, any>;
			const envelope = record.type === "message" && record.message ? record.message : record;
			return { filename: String(row.filename), id: String(row.id), timestamp: row.timestamp == null ? null : String(row.timestamp), message: envelope };
		});
		const scan = scanToolFailures(scanRows);
		expect(scan.duplicateCalls).toBe(1);
		expect(aggregateFailureOutcomes(scan)).toEqual({
			expectedCommand: 1,
			actionable: 1,
			expectedOther: 1,
			unclassified: 1,
			total: 4,
		});
		const candidate = scan.candidates.find((item) => item.tool === "custom" && item.actionability === "actionable")!;
		expect(candidate.tool).toBe("custom");
		expect(selectedFailureCoordinates(scan, scanRows, [candidate.candidateId]).get(candidate.candidateId)).toHaveLength(1);

		const pi = { getAllTools: () => [{ name: "custom", sourceInfo: { source: "extension" } }] };
		const extension = await collectExtensionUsageSnapshot(pi as never, root, sessions);
		expect(extension).toBeDefined();
		const skills = await collectSkillStats("all", { sessionRoot: sessions, cwd: root, now: new Date("2026-08-22T00:00:00Z") });
		expect(skills.result).toBeDefined();
		const report = await renderOrchestrationStatsReport(7, new Date("2026-08-22T00:00:00Z"));
		expect(report).toContain("Direct: 1");
		expect(report).toContain("productive 1");
		expect(await fs.readdir(root)).not.toContain("analytics");
		expect(await fs.readdir(root)).not.toContain(".orchestration-stats");
	});
});

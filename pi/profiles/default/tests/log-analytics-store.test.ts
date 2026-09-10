import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withAnalyticsSession, setStagingObserver } from "../lib/log-analytics/store.js";
import { queryAnalytics } from "../lib/log-analytics/api.js";
import { discoverSessions } from "../lib/log-analytics/sessions.js";
import { analyticsFixture, recentMessage } from "./helpers/analytics-fixture.js";
let fixture: Awaited<ReturnType<typeof analyticsFixture>>;
beforeEach(async () => { fixture = await analyticsFixture(); });
afterEach(async () => { setStagingObserver(undefined); await fixture.dispose(); });
const longQuery = "SELECT sum(a.i*b.i) FROM range(100000000) a(i) CROSS JOIN range(10000) b(i)";

describe("bounded default analytics store", () => {
	it("queries full nested native records across both profiles and retains resumed-session event time", async () => {
		await fixture.session("default", "one", [recentMessage]);
		await fixture.session("legacy", "two", [{ type: "message", id: "tool", timestamp: "2026-09-02T00:00:00Z", message: { role: "toolResult", toolName: "read", toolCallId: "call", isError: true } }]);
		const result = await queryAnalytics(fixture.registry, { operation: "query", profiles: ["default", "legacy"], sources: ["session_entries"],
			sql: "WITH recent AS (SELECT * FROM session_entries WHERE _timestamp >= $since::TIMESTAMPTZ) SELECT _profile, session_id, provider, model, input_tokens, cache_read_tokens, tool_name, is_error, record FROM recent ORDER BY _profile", parameters: { since: "2026-09-01" } });
		expect(result.rows).toHaveLength(2);
		expect(result.rows[0]).toMatchObject({ _profile: "default", session_id: "one", provider: "test", model: "model", input_tokens: "12", cache_read_tokens: "5" });
		expect(result.rows[1]).toMatchObject({ _profile: "legacy", session_id: "two", tool_name: "read", is_error: true });
		expect(JSON.stringify(result.rows[0].record)).toContain("needle");
		expect(result.cost.filesScanned).toBe(2);
	});

	it("queries persisted plan action outcomes and invocation traces through session_entries", async () => {
		await fixture.session("default", "plan-session", [
			{ type: "custom", id: "event-1", timestamp: "2026-09-09T00:00:00Z", customType: "plan-action-event", data: { schemaVersion: 1, invocationId: "inv-1", action: "plans", phase: "invocation", outcome: "started" } },
			{ type: "custom", id: "event-2", timestamp: "2026-09-09T00:00:01Z", customType: "plan-action-event", data: { schemaVersion: 1, invocationId: "inv-1", action: "run-here", phase: "outcome", outcome: "success", plan: { stub: "demo" } } },
			{ type: "custom", id: "event-3", timestamp: "2026-09-09T00:00:02Z", customType: "plan-action-event", data: { schemaVersion: 1, invocationId: "inv-2", action: "copy", phase: "outcome", outcome: "failed" } },
		]);
		const counts = await queryAnalytics(fixture.registry, { operation: "query", sources: ["session_entries"], sql: "WITH plan_events AS (SELECT json_extract_string(record, '$.data.action') AS plan_action, json_extract_string(record, '$.data.outcome') AS plan_outcome FROM session_entries WHERE entry_type = 'custom' AND json_extract_string(record, '$.customType') = 'plan-action-event' AND json_extract_string(record, '$.data.phase') = 'outcome') SELECT plan_action, plan_outcome, count(*) records FROM plan_events GROUP BY plan_action, plan_outcome ORDER BY plan_action, plan_outcome" });
		expect(counts.rows).toEqual([{ plan_action: "copy", plan_outcome: "failed", records: "1" }, { plan_action: "run-here", plan_outcome: "success", records: "1" }]);
		const trace = await queryAnalytics(fixture.registry, { operation: "query", sources: ["session_entries"], sessionRefs: [{ profile: "default", sessionId: "plan-session" }], sql: "SELECT json_extract_string(record, '$.data.invocationId') AS invocation_id, json_extract_string(record, '$.data.action') AS action_name, json_extract_string(record, '$.data.phase') AS phase, json_extract_string(record, '$.data.outcome') AS outcome_name, json_extract_string(record, '$.data.plan.stub') AS stub FROM session_entries WHERE entry_type = 'custom' AND json_extract_string(record, '$.customType') = 'plan-action-event' ORDER BY _timestamp" });
		expect(trace.rows).toEqual([
			{ invocation_id: "inv-1", action_name: "plans", phase: "invocation", outcome_name: "started", stub: null },
			{ invocation_id: "inv-1", action_name: "run-here", phase: "outcome", outcome_name: "success", stub: "demo" },
			{ invocation_id: "inv-2", action_name: "copy", phase: "outcome", outcome_name: "failed", stub: null },
		]);
	});

	it("stages only explicitly selected sessions and reports their bytes", async () => {
		const file = await fixture.session("default", "one", [recentMessage]);
		await fixture.session("default", "other");
		await fixture.session("legacy", "legacy");
		const refs = (await discoverSessions(fixture.registry)).filter(item => item.ref.sessionId === "one").map(item => item.ref);
		const result = await queryAnalytics(fixture.registry, { operation: "query", sources: ["session_entries"], sessionRefs: refs, sql: "SELECT count(*) AS n FROM session_entries" });
		expect(result.rows).toEqual([{ n: "2" }]);
		expect(result.cost.filesScanned).toBe(1);
		expect(result.cost.bytesScanned).toBe((await fs.stat(file)).size);
	});

	it("reports excluded session files in broad and targeted queries", async () => {
		await fixture.session("legacy", "valid", [recentMessage]);
		const backfill = await fixture.session("legacy", "backfill");
		await fs.writeFile(backfill, '{"type":"custom","customType":"skill-load"}\n');
		for (const sessionRefs of [undefined, [{ profile: "legacy" as const, sessionId: "valid" }]]) {
			const result = await queryAnalytics(fixture.registry, { operation: "query", profiles: ["legacy"], sources: ["session_entries"], sessionRefs, sql: "SELECT count(*) n FROM session_entries" });
			expect(result.rows).toEqual([{ n: "2" }]);
			expect(result.cost.filesScanned).toBe(1);
			expect(result.coverage.discovery).toMatchObject({ excludedFiles: 1, diagnosticsTruncated: false });
		}
		await expect(queryAnalytics(fixture.registry, { operation: "query", profiles: ["legacy"], sources: ["session_entries"], sessionRefs: [{ profile: "legacy", sessionId: "backfill" }], sql: "SELECT 1" })).rejects.toThrow("unknown");
	});

	it("preserves large and repeated records and valid records around malformed lines", async () => {
		const large = { type: "custom", data: "x".repeat(1_100_000) };
		await fixture.session("default", "one", [large, "broken-json", recentMessage]);
		await fs.writeFile(path.join(fixture.registry.roots.default, "codex-cache.jsonl"), '{"model":"test","input":2,"cacheRead":3}\n'.repeat(2));
		await withAnalyticsSession({ registry: fixture.registry, sources: ["session_entries", "codex_cache_observations"] }, async session => {
			expect((await session.query({ sql: "SELECT length(record->>'data') n FROM session_entries WHERE record->>'type' = 'custom'" })).rows).toEqual([{ n: "1100000" }]);
			expect((await session.query({ sql: "SELECT count(*) n FROM session_entries" })).rows).toEqual([{ n: "3" }]);
			expect((await session.query({ sql: "SELECT count(*) n, count(_timestamp) timestamps, count(session_id) sessions FROM codex_cache_observations" })).rows).toEqual([{ n: "2", timestamps: "0", sessions: "0" }]);
		});
	});

	it("exposes precise Bedrock fields and typed empty supported views", async () => {
		await fs.writeFile(path.join(fixture.registry.roots.default, "bedrock-usage.jsonl"), JSON.stringify({ id: "usage", timestamp: "2026-09-01T00:00:00Z", session: "one", model: "model", usage: { input: 4, cacheRead: 7 }, pricing: { total: 0.2, status: "priced" } }) + "\n");
		await withAnalyticsSession({ registry: fixture.registry, sources: ["session_entries", "bedrock_usage", "codex_cache_observations"] }, async session => {
			expect((await session.query({ sql: "SELECT session_id, input_tokens, cost_usd FROM bedrock_usage" })).rows).toEqual([{ session_id: "one", input_tokens: "4", cost_usd: 0.2 }]);
			expect((await session.query({ sql: "SELECT input_tokens, _timestamp FROM codex_cache_observations" })).rows).toEqual([]);
			expect((await session.query({ sql: "SELECT session_id, tool_name FROM session_entries" })).rows).toEqual([]);
		});
	});

	it("bounds results incrementally and keeps later queries usable", async () => {
		await withAnalyticsSession({ registry: fixture.registry, sources: ["session_entries"] }, async session => {
			const result = await session.query({ sql: "SELECT * FROM range(1000000)", maxRows: 2 });
			expect(result.rows).toHaveLength(2); expect(result.truncated).toBe(true);
			const bytes = await session.query({ sql: "SELECT repeat('x', 100) payload FROM range(10000)", maxBytes: 140 });
			expect(bytes.rows).toHaveLength(1); expect(bytes.truncated).toBe(true);
			expect((await session.query({ sql: "SELECT 42 AS answer" })).rows).toEqual([{ answer: 42 }]);
		});
	});

	it("rejects excessive input before staging and enforces native resource configuration", async () => {
		await fixture.session("default", "one", [recentMessage]);
		let staged = false; setStagingObserver(() => { staged = true; });
		await expect(withAnalyticsSession({ registry: fixture.registry, sources: ["session_entries"], maxInputBytes: 1 }, async () => {})).rejects.toThrow("exceeds bound");
		expect(staged).toBe(false);
		await withAnalyticsSession({ registry: fixture.registry, sources: ["session_entries"], threads: 2, memoryLimit: "1GB" }, async session => {
			const result = await session.query({ sql: "SELECT current_setting('threads') threads, current_setting('memory_limit') memory, current_setting('temp_directory') temp_dir" });
			expect(result.rows[0]).toMatchObject({ threads: "2", temp_dir: "" });
			expect(result.rows[0].memory).toMatch(/GiB|MiB/);
		});
	});

	it("interrupts active queries for deadline and cancellation and closes the instance", async () => {
		await expect(withAnalyticsSession({ registry: fixture.registry, sources: ["session_entries"], timeoutMs: 200 }, async session => session.query({ sql: longQuery }))).rejects.toThrow("exceeded 200 ms");
		const controller = new AbortController();
		await expect(withAnalyticsSession({ registry: fixture.registry, sources: ["session_entries"], signal: controller.signal }, async session => {
			const timer = setTimeout(() => controller.abort(), 50);
			try { return await session.query({ sql: longQuery }); } finally { clearTimeout(timer); }
		})).rejects.toThrow("cancelled");
		expect(await fs.readdir(fixture.scratch)).toEqual(["default", "legacy"]);
	});

	it("serializes staging, releases failures, and cancels a queued operation promptly", async () => {
		let release!: () => void;
		let entered!: () => void;
		const held = new Promise<void>(resolve => { release = resolve; });
		const started = new Promise<void>(resolve => { entered = resolve; });
		let calls = 0;
		setStagingObserver(async () => { calls++; if (calls === 1) { entered(); await held; throw new Error("fixture staging failure"); } });
		const options = { registry: fixture.registry, sources: ["session_entries"] as const };
		const first = withAnalyticsSession(options, async () => {});
		const failed = expect(first).rejects.toThrow("fixture staging failure");
		await started;
		const controller = new AbortController();
		const queued = withAnalyticsSession({ ...options, signal: controller.signal }, async () => {});
		await new Promise(resolve => setTimeout(resolve, 20));
		controller.abort();
		await expect(queued).rejects.toThrow("cancelled");
		const third = withAnalyticsSession(options, async session => session.query({ sql: "SELECT 1 n" }));
		await new Promise(resolve => setTimeout(resolve, 20));
		expect(calls).toBe(1);
		release(); await failed;
		expect((await third).rows).toEqual([{ n: 1 }]);
		expect(calls).toBe(2);
	});
});

import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { followUpAnalytics, searchAnalytics, type SearchMatch } from "../lib/log-analytics/api.js";
import { metadataCachePath } from "../lib/log-analytics/metadata-cache.js";
import { normalizeRecord } from "../lib/log-analytics/sessions.js";
import { analyticsFixture } from "./helpers/analytics-fixture.js";

let fixture: Awaited<ReturnType<typeof analyticsFixture>>;
beforeEach(async () => { fixture = await analyticsFixture(); });
afterEach(async () => { await fixture.dispose(); });

const message = (id: string, text: string, timestamp: string, role = "assistant", extra: Record<string, unknown> = {}) => ({
	type: "message", id, timestamp, message: { role, content: [{ type: "text", text }], ...extra },
});

describe("streaming analytics search", () => {
	it("shares native normalization and searches text blocks without searching quoted JSON", () => {
		const value = message("one", "visible needle", "2026-09-01T00:00:00Z", "user", { toolName: "shell", isError: true });
		expect(normalizeRecord(value)).toMatchObject({ timestamp: "2026-09-01T00:00:00.000Z", messageRole: "user", toolName: "shell", isError: true, text: "visible needle" });
		expect(normalizeRecord({ timestamp: "1788220800000", message: { timestamp: 1788220801000 } }).timestamp).toBe("2026-09-01T00:00:00.000Z");
		expect(normalizeRecord({ type: "message", message: { role: "toolResult", content: [{ type: "image", data: "needle" }], arguments: "needle" } }).text).toBe("");
	});

	it("finds blocking subagent decisions without DuckDB or full-record text search", async () => {
		const toolCalls = (id: string, content: unknown[]) => ({ type: "message", id, timestamp: "2026-09-18T00:00:00Z", message: { role: "assistant", content } });
		await fixture.session("default", "blocking", [
			{ type: "custom", id: "version-1", timestamp: "2026-09-18T00:00:00Z", customType: "subagent-extension-version", data: { version: "1.0.0" } },
			toolCalls("foreground", [{ type: "toolCall", id: "one", name: "subagent", arguments: { agent: "explorer", instructions: "inspect", blockingReason: "The inventory determines the next edit." } }]),
			toolCalls("strategist", [{ type: "toolCall", id: "two", name: "subagent", arguments: { agent: "strategist", instructions: "advise", background: true } }]),
			toolCalls("wait", [{ type: "toolCall", id: "three", name: "subagent_control", arguments: { action: "wait", id: "Clara", blockingReason: "The result is required before integration." } }]),
			toolCalls("background", [{ type: "toolCall", id: "four", name: "subagent", arguments: { agent: "explorer", instructions: "inspect", background: true } }]),
			toolCalls("legacy-missing", [{ type: "toolCall", id: "five", name: "subagent", arguments: { agent: "explorer", instructions: "inspect" } }]),
		]);
		const blocked = await searchAnalytics(fixture.registry, { operation: "search", filters: { subagentBlocking: true } });
		expect(blocked.matches).toHaveLength(4);
		expect(blocked.matches.flatMap(item => item.blockingDecisions ?? []).map(item => ({ tool: item.toolName, source: item.reasonSource, reason: item.reason }))).toEqual([
			{ tool: "subagent", source: "model", reason: "The inventory determines the next edit." },
			{ tool: "subagent", source: "role-contract", reason: "Strategist consultations run in the foreground by role contract." },
			{ tool: "subagent_control", source: "model", reason: "The result is required before integration." },
			{ tool: "subagent", source: "missing", reason: null },
		]);
		const behavioral = await searchAnalytics(fixture.registry, { operation: "search", filters: { subagentBlocking: true, subagentBlockingReasonSources: ["model", "missing"] } });
		expect(behavioral.matches).toHaveLength(3);
		expect(behavioral.matches.flatMap(item => item.blockingDecisions ?? []).map(item => item.reasonSource)).toEqual(["model", "model", "missing"]);
		expect(blocked.matches.flatMap(item => item.blockingDecisions ?? []).every(item => item.subagentExtensionVersion === "1.0.0")).toBe(true);
		const versioned = await searchAnalytics(fixture.registry, { operation: "search", filters: { subagentBlocking: true, subagentExtensionVersion: "1.0.0" } });
		expect(versioned.matches).toHaveLength(4);
		const absentVersion = await searchAnalytics(fixture.registry, { operation: "search", filters: { subagentBlocking: true, subagentExtensionVersion: "2.0.0" } });
		expect(absentVersion.matches).toHaveLength(0);

		const nonblocking = await searchAnalytics(fixture.registry, { operation: "search", filters: { subagentBlocking: false, toolNames: ["subagent"] } });
		expect(nonblocking.matches).toHaveLength(1);
		expect(nonblocking.matches[0].blockingDecisions?.[0]).toMatchObject({ agent: "explorer", background: true, blocking: false });
		await expect(searchAnalytics(fixture.registry, { operation: "search", filters: { subagentBlockingReasonSources: ["model"] } })).rejects.toThrow("requires subagentBlocking=true");
		await expect(searchAnalytics(fixture.registry, { operation: "search", filters: { subagentExtensionVersion: "1.0.0" } })).rejects.toThrow("requires subagentBlocking");
	});

	it("associates blocking decisions with the latest extension version inside one session", async () => {
		const call = (id: string) => ({ type: "message", id, timestamp: "2026-09-18T00:00:00Z", message: { role: "assistant", content: [{ type: "toolCall", id, name: "subagent_control", arguments: { action: "wait", id: "worker", blockingReason: `reason-${id}` } }] } });
		await fixture.session("default", "version-boundary", [
			call("legacy"),
			{ type: "custom", id: "v1", timestamp: "2026-09-18T00:00:01Z", customType: "subagent-extension-version", data: { version: "1.0.0" } },
			call("current"),
			{ type: "custom", id: "v2", timestamp: "2026-09-18T00:00:02Z", customType: "subagent-extension-version", data: { version: "2.0.0" } },
			call("future"),
		]);
		const all = await searchAnalytics(fixture.registry, { operation: "search", filters: { subagentBlocking: true } });
		expect(all.matches.flatMap(match => match.blockingDecisions ?? []).map(decision => decision.subagentExtensionVersion)).toEqual([null, "1.0.0", "2.0.0"]);
		const current = await searchAnalytics(fixture.registry, { operation: "search", filters: { subagentBlocking: true, subagentExtensionVersion: "1.0.0" } });
		expect(current.matches.map(match => match.occurrence.recordKey)).toEqual(["current"]);
	});

	it("pages a large file, preserves zero-match progress, and returns exact stable occurrences", async () => {
		const records = Array.from({ length: 10_500 }, (_, i) => message(`id-${i}`, i === 10_499 ? "final needle" : `${"padding ".repeat(110)}${i}`, "2026-09-01T00:00:00Z"));
		const file = await fixture.session("default", "large", records);
		const request = { operation: "search" as const, profiles: ["default"] as const, filters: { text: "final needle" }, maxResults: 1 };
		const occurrences: string[] = []; const found: SearchMatch[] = []; let page = await searchAnalytics(fixture.registry, request);
		while (true) {
			occurrences.push(...page.matches.map(item => `${item.occurrence.byteOffset}:${item.occurrence.recordOrdinal}`)); found.push(...page.matches);
			if (!page.nextCursor) break;
			page = await searchAnalytics(fixture.registry, { ...request, cursor: page.nextCursor });
		}
		expect(occurrences).toHaveLength(1);
		expect(new Set(occurrences).size).toBe(occurrences.length);
		expect(page.complete).toBe(true);
		expect(page.coverage.cumulative.examinedRecords).toBeGreaterThan(10_000);
		expect(page.coverage.remainingFiles).toBe(0);
		expect(found[0]?.snippet).toContain("final needle");
		expect(found[0]?.occurrence.fileKey).toBeTruthy();
		await expect(fs.stat(file)).resolves.toBeTruthy();
	});

	it("keeps normalized location and interval scope across continuation", async () => {
		await fixture.session("default", "inside", [message("one", "needle", "2026-09-15T12:00:00Z")], "inside.jsonl", "C:\\Projects\\Work\\Gitlab\\monorepo");
		await fixture.session("default", "outside-time", [message("two", "needle", "2026-09-14T12:00:00Z")], "outside-time.jsonl", "C:\\Projects\\Work\\Gitlab\\monorepo");
		await fixture.session("default", "outside-repo", [message("three", "needle", "2026-09-15T12:00:00Z")], "outside-repo.jsonl", "C:\\Projects\\Work\\Gitlab\\other");
		const request = { operation: "search" as const, cwd: "c:/projects/work/gitlab/MONOREPO/", interval: { since: "2026-09-15", until: "2026-09-17" }, filters: { text: "needle" }, maxResults: 1 };
		const first = await searchAnalytics(fixture.registry, request);
		expect(first.matches.map(item => item.occurrence.session.sessionId)).toEqual(["inside"]);
		if (first.nextCursor) {
			await expect(searchAnalytics(fixture.registry, { ...request, cwd: "C:\\Projects\\Work\\Gitlab\\monorepo", cursor: first.nextCursor })).resolves.toBeDefined();
		}
	});

	it("uses event time, roles and errors across profiles, including an old resumed session", async () => {
		await fixture.session("default", "old", [message("old", "needle", "2026-09-05T00:00:00Z", "toolResult", { isError: true })]);
		await fixture.session("legacy", "recent", [message("good", "needle", "2026-09-06T00:00:00Z", "toolResult", { isError: false }), message("bad", "failure", "2026-09-07T00:00:00Z", "toolResult", { isError: true }), message("user-failure", "failure", "2026-09-07T00:00:00Z", "user", { isError: false })]);
		const result = await searchAnalytics(fixture.registry, { operation: "search", profiles: ["default", "legacy"], interval: { since: "2026-09-01", until: "2026-09-08" }, filters: { messageRoles: ["toolResult"], isError: true } });
		expect(result.matches.map(item => item.occurrence.session.sessionId)).toEqual(["old", "recent"]);
		expect(result.matches.every(item => item.isError === true)).toBe(true);
		const userText = await searchAnalytics(fixture.registry, { operation: "search", profiles: ["legacy"], filters: { messageRoles: ["user"], text: "failure" } });
		expect(userText.matches.map(item => item.occurrence.recordKey)).toEqual(["user-failure"]);
	});

	it("follows an ID-less repeated occurrence and rejects changed continuation files", async () => {
		const repeated = { type: "message", timestamp: "2026-09-01T00:00:00Z", message: { role: "assistant", content: [{ type: "text", text: "same" }] } };
		const file = await fixture.session("default", "repeat", [message("before", "before", "2026-09-01T00:00:00Z"), repeated, repeated, message("after", "after", "2026-09-01T00:00:00Z")]);
		const page = await searchAnalytics(fixture.registry, { operation: "search", filters: { text: "same" }, maxResults: 2 });
		expect(page.matches).toHaveLength(2);
		expect(page.matches[0].occurrence.recordKey).toBeNull();
		expect(page.matches[0].occurrence.byteOffset).not.toBe(page.matches[1].occurrence.byteOffset);
		const context = await followUpAnalytics(fixture.registry, { operation: "follow_up", occurrence: page.matches[1].occurrence, before: 1, after: 1 });
		expect((context.match.record as { message: { content: { text: string }[] } }).message.content[0].text).toBe("same");
		expect(context.before).toHaveLength(1);
		expect(context.after).toHaveLength(1);
		await fs.appendFile(file, `${JSON.stringify(message("new", "new", "2026-09-01T00:00:00Z"))}\n`);
		const changed = await searchAnalytics(fixture.registry, { operation: "search", cursor: page.nextCursor! });
		expect(changed.coverage.inventoryChanges).toContain("default/repeat: append beyond captured horizon");
	});

	it("does not claim completion after replacement or truncation at a continuation boundary", async () => {
		const records = Array.from({ length: 10_500 }, (_, i) => message(`id-${i}`, `${"padding ".repeat(110)}${i}`, "2026-09-01T00:00:00Z"));
		const file = await fixture.session("default", "changed", records);
		const request = { operation: "search" as const, filters: { text: "padding" }, maxResults: 1 };
		const first = await searchAnalytics(fixture.registry, request);
		expect(first.nextCursor).toBeTruthy();
		const original = await fs.readFile(file);
		await fs.writeFile(file, Buffer.from(original.toString().replace("id-0", "id-x")));
		const future = new Date(Date.now() + 2000); await fs.utimes(file, future, future);
		const replaced = await searchAnalytics(fixture.registry, { ...request, cursor: first.nextCursor! });
		expect(replaced.complete).toBe(false);
		expect(replaced.stopReason).toBe("inventory_changed");
		const second = await searchAnalytics(fixture.registry, request);
		await fs.truncate(file, Math.floor(original.length / 2));
		const truncated = await searchAnalytics(fixture.registry, { ...request, cursor: second.nextCursor! });
		expect(truncated.complete).toBe(false);
		expect(truncated.stopReason).toBe("inventory_changed");
	});

	it("reports malformed and oversized records and falls back from corrupt metadata", async () => {
		const file = await fixture.session("default", "bad", ["not-json", "x".repeat(16 * 1024 * 1024 + 1), message("good", "needle", "2026-09-01T00:00:00Z")]);
		const result = await searchAnalytics(fixture.registry, { operation: "search", filters: { text: "needle" } });
		expect(result.matches).toHaveLength(1);
		expect(result.coverage.malformedRecords).toBe(1);
		expect(result.coverage.oversizedRecords).toBe(1);
		const cache = metadataCachePath(fixture.registry.roots.default);
		const cacheText = await fs.readFile(cache, "utf8");
		expect(cacheText).not.toContain("needle");
		await fs.writeFile(cache, "not-json");
		expect((await searchAnalytics(fixture.registry, { operation: "search", sessionRefs: [result.matches[0].occurrence.session], filters: { text: "needle" } })).matches).toHaveLength(1);
	});

	it("honors cancellation while streaming", async () => {
		const controller = new AbortController(); controller.abort();
		await expect(searchAnalytics(fixture.registry, { operation: "search" }, controller.signal)).rejects.toThrow("cancelled");
	});
});

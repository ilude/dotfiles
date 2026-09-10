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
		const request = { operation: "search" as const, filters: { text: "never-present" }, maxResults: 1 };
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

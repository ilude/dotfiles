import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverSessions, listSessions, readSessionHeader, selectSessions } from "../lib/log-analytics/sessions.js";
import { selectedProfiles } from "../lib/log-analytics/profiles.js";
import { analyticsFixture, recentMessage } from "./helpers/analytics-fixture.js";
let fixture: Awaited<ReturnType<typeof analyticsFixture>>;
beforeEach(async () => { fixture = await analyticsFixture(); });
afterEach(async () => { await fixture.dispose(); });

describe("metadata-only analytics session selection", () => {
	it("scopes profiles, filters header cwd/IDs, and paginates without losing an old resumed session", async () => {
		await fixture.session("default", "old", [recentMessage]);
		await fixture.session("legacy", "legacy", [], "nested/file.jsonl", "/other");
		expect(selectedProfiles(fixture.registry)).toEqual(["default"]);
		expect((await listSessions(fixture.registry, {})).sessions.map(item => item.ref.sessionId)).toEqual(["old"]);
		const request = { profiles: ["default", "legacy"] as const, maxRows: 1 };
		const first = await listSessions(fixture.registry, { ...request, profiles: [...request.profiles] });
		expect(first.truncated).toBe(true);
		const second = await listSessions(fixture.registry, { ...request, profiles: [...request.profiles], cursor: first.nextCursor! });
		expect(second.sessions[0].ref.sessionId).toBe("legacy");
		expect(second.nextCursor).toBeNull();
		expect((await listSessions(fixture.registry, { profiles: ["default", "legacy"], cwd: "/other", sessionIds: ["legacy"] })).sessions).toHaveLength(1);
		await expect(listSessions(fixture.registry, { cursor: first.nextCursor! })).rejects.toThrow("cursor");
		expect(first.sessions[0].created).toBe("2020-01-01T00:00:00.000Z");
		expect(first.sessions[0]).not.toHaveProperty("file");
	});

	it("does not parse transcript bodies and bounds headers", async () => {
		const file = await fixture.session("default", "bounded", ["not-json".repeat(200_000)]);
		expect(await readSessionHeader(file)).toMatchObject({ id: "bounded" });
		expect((await listSessions(fixture.registry, {})).sessions).toHaveLength(1);
		await fs.writeFile(file, "x".repeat(65537));
		await expect(readSessionHeader(file)).rejects.toThrow("exceeds");
		await fs.writeFile(file, "invalid\n");
		await expect(readSessionHeader(file)).rejects.toThrow("invalid analytics session header");
		expect((await listSessions(fixture.registry, {})).coverage.discovery.excludedFiles).toBe(1);
	});

	it("lists valid sessions despite backfills and invalid headers, with bounded exclusions", async () => {
		await fixture.session("default", "valid");
		const bodies = ['{"type":"custom","customType":"skill-load"}\n', 'invalid\n', '', 'x'.repeat(65537)];
		for (let i = 0; i < 24; i++) {
			const file = await fixture.session("legacy", `bad-${i}`);
			await fs.writeFile(file, bodies[i % bodies.length]);
		}
		const result = await listSessions(fixture.registry, { profiles: ["default", "legacy"] });
		expect(result.sessions.map(item => item.ref.sessionId)).toEqual(["valid"]);
		expect(result.coverage.discovery).toMatchObject({ excludedFiles: 24, diagnosticsTruncated: true });
		expect(result.coverage.discovery.diagnostics).toHaveLength(20);
		expect(result.coverage.discovery.diagnostics[0]).toMatchObject({ profile: "legacy", file: expect.any(String), fileKey: expect.any(String), reason: expect.any(String) });
		const files = await discoverSessions(fixture.registry, ["legacy"]);
		expect(() => selectSessions(files, [{ profile: "legacy", sessionId: "bad-0" }], ["legacy"])).toThrow("unknown");
	});

	it("requires a discriminator for duplicated native IDs and rejects unresolved or out-of-scope refs", async () => {
		await fixture.session("default", "same", [], "a.jsonl");
		await fixture.session("default", "same", [], "b.jsonl");
		const files = await discoverSessions(fixture.registry);
		expect(() => selectSessions(files, [{ profile: "default", sessionId: "same" }], ["default"])).toThrow("ambiguous");
		expect(selectSessions(files, [files[0].ref], ["default"])).toEqual([files[0]]);
		expect(() => selectSessions(files, [{ profile: "default", sessionId: "missing" }], ["default"])).toThrow("unknown");
		expect(() => selectSessions(files, [{ profile: "legacy", sessionId: "same" }], ["default"])).toThrow("outside");
	});

	it("deduplicates canonical directory aliases and rejects directory link escapes", async () => {
		await fixture.session("default", "one", [], "real/one.jsonl");
		const sessions = path.join(fixture.registry.roots.default, "sessions");
		await fs.symlink(path.join(sessions, "real"), path.join(sessions, "alias"), process.platform === "win32" ? "junction" : "dir");
		expect(await discoverSessions(fixture.registry)).toHaveLength(1);
		await fs.symlink(fixture.registry.roots.legacy, path.join(sessions, "escape"), process.platform === "win32" ? "junction" : "dir");
		await expect(discoverSessions(fixture.registry)).rejects.toThrow("escapes");
	});

	it("distinguishes empty sessions from missing roots and cancellation", async () => {
		expect((await listSessions(fixture.registry, {})).sessions).toEqual([]);
		await fs.rm(fixture.registry.roots.legacy, { recursive: true });
		await expect(listSessions(fixture.registry, { profiles: ["legacy"] })).rejects.toThrow();
		await expect(discoverSessions(fixture.registry, undefined, AbortSignal.abort())).rejects.toThrow("cancelled");
	});
});

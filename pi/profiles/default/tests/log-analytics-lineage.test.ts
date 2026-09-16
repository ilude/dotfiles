import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sessionLineage } from "../lib/log-analytics/lineage.js";
import { analyticsFixture } from "./helpers/analytics-fixture.js";
let fixture: Awaited<ReturnType<typeof analyticsFixture>>;
beforeEach(async () => { fixture = await analyticsFixture(); });
afterEach(async () => { await fixture.dispose(); });

describe("native session lineage reader", () => {
	it("attributes only records whose session ID matches their file header and follows children", async () => {
		await fixture.session("default", "root", [
			{ type: "custom", customType: "subagent-lineage", data: { version: 1, sessionId: "root", role: "teamlead", parentSessionId: "origin", rootSessionId: "origin" } },
			{ type: "custom", customType: "subagent-lineage", data: { version: 1, sessionId: "child", role: "developer", parentSessionId: "root", rootSessionId: "origin" } },
		]);
		await fixture.session("default", "child", [
			{ type: "custom", customType: "subagent-lineage", data: { version: 1, sessionId: "child", role: "developer", parentSessionId: "root", rootSessionId: "origin" } },
		]);
		const result = await sessionLineage(fixture.registry, { operation: "session_lineage", sessionId: "root" });
		expect(result.ancestors).toEqual([]);
		expect(result.descendants.map(item => item.sessionId)).toEqual(["child"]);
		expect(result.coverage.missingParents).toEqual(["origin"]);
		expect(result.coverage.classifiedSessions).toBe(2);
	});

	it("reports historical sessions without lineage as unclassified and paginates descendants", async () => {
		await fixture.session("default", "root", [{ type: "custom", customType: "subagent-lineage", data: { version: 1, sessionId: "root", role: "parent", parentSessionId: "root-origin", rootSessionId: "root-origin" } }]);
		await fixture.session("default", "unclassified");
		for (const id of ["a", "b"]) await fixture.session("default", id, [{ type: "custom", customType: "subagent-lineage", data: { version: 1, sessionId: id, role: "worker", parentSessionId: "root", rootSessionId: "root-origin" } }]);
		const result = await sessionLineage(fixture.registry, { operation: "session_lineage", sessionId: "root", maxRows: 1 });
		expect(result.descendants).toHaveLength(1);
		expect(result.truncated).toBe(true);
		expect(result.coverage.unclassifiedSessions.map(item => item.sessionId)).toContain("unclassified");
	});

	it("uses native header boundaries, bounds inventory samples, and rejects ambiguous targets", async () => {
		await fixture.session("default", "origin");
		await fixture.session("default", "parent");
		await fixture.session("default", "child", [{ type: "custom", customType: "subagent-lineage", data: { version: 1, sessionId: "child", role: "worker", parentSessionId: "parent", rootSessionId: "origin" } }]);
		await fixture.session("default", "other");
		const result = await sessionLineage(fixture.registry, { operation: "session_lineage", sessionId: "child", maxRows: 1 });
		expect(result.ancestors).toHaveLength(1);
		expect(result.ancestors[0]).toMatchObject({ profile: "default", sessionId: "parent", role: null });
		expect(result.coverage.missingParents).toEqual([]);
		expect(result.coverage.unclassifiedSessionCount).toBe(3);
		expect(result.coverage.unclassifiedSessions).toHaveLength(1);
		expect(result.coverage.unclassifiedSessionsTruncated).toBe(true);
		expect(result.coverage.ancestorCount).toBe(2);

		await fixture.session("legacy", "child", [{ type: "custom", customType: "subagent-lineage", data: { version: 1, sessionId: "child", role: "worker", parentSessionId: "origin", rootSessionId: "origin" } }]);
		await expect(sessionLineage(fixture.registry, { operation: "session_lineage", profiles: ["default", "legacy"], sessionId: "child" })).rejects.toThrow(/ambiguous/);
	});

	it("terminates cyclic descendant links without returning the target", async () => {
		await fixture.session("default", "a", [{ type: "custom", customType: "subagent-lineage", data: { version: 1, sessionId: "a", role: "worker", parentSessionId: "b", rootSessionId: "a" } }]);
		await fixture.session("default", "b", [{ type: "custom", customType: "subagent-lineage", data: { version: 1, sessionId: "b", role: "worker", parentSessionId: "a", rootSessionId: "a" } }]);
		const result = await sessionLineage(fixture.registry, { operation: "session_lineage", sessionId: "a" });
		expect(result.descendants.map(item => item.sessionId)).toEqual(["b"]);
	});
});

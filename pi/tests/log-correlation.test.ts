import { describe, expect, it } from "vitest";
import {
	correlateEdges,
	edgeIsDecisionSafe,
} from "../lib/log-analytics/edges.ts";
import {
	childCorrelation,
	correlationForEmission,
	createCorrelationId,
	currentCorrelation,
	detachedCorrelation,
	getSettledCorrelationCountForTests,
	resetCorrelationForTests,
	runCorrelation,
	settleCorrelation,
} from "../lib/log-analytics/correlation.ts";

describe("correlation context", () => {
	it("creates compact runtime-scoped IDs and isolates parallel scopes", async () => {
		let started = 0;
		let release!: () => void;
		const barrier = new Promise<void>((resolve) => {
			release = resolve;
		});
		let resolveBothStarted!: () => void;
		const bothStarted = new Promise<void>((resolve) => {
			resolveBothStarted = resolve;
		});
		const valuesPromise = Promise.all(
			[1, 2].map(
				(item) =>
					new Promise<string>((resolve) =>
						runCorrelation({ session_id: `s-${item}` }, async () => {
							started++;
							if (started === 2) resolveBothStarted();
							await barrier;
							resolve(correlationForEmission()!.session_id!);
						}),
					),
			),
		);
		await bothStarted;
		release();
		const values = await valuesPromise;
		expect(values).toEqual(["s-1", "s-2"]);
		expect(createCorrelationId("turn")).toMatch(/^turn-[a-z0-9]+-[a-z0-9]+$/);
	});
	it("does not return scope tokens, permits child fields, and rejects immutable overrides", () => {
		runCorrelation({ session_id: "s1", trace_id: "trace-1" }, () => {
			expect(correlationForEmission()).not.toHaveProperty("scope_token");
			expect(childCorrelation({ tool_call_id: "call" }).session_id).toBe("s1");
			expect(() =>
				runCorrelation({ session_id: "s2" }, () => undefined),
			).toThrow("session_id is immutable");
		});
	});
	it("supports explicit detached children and rejects stale inherited context after settlement", () => {
		let token = "";
		runCorrelation({ session_id: "s1", turn_id: "t1" }, () => {
			token = currentCorrelation()!.scope_token;
			expect(childCorrelation({ tool_call_id: "call" }).session_id).toBe("s1");
		});
		runCorrelation({ session_id: "s2" }, () => {
			settleCorrelation(token);
			expect(correlationForEmission()?.session_id).toBe("s2");
		});
		expect(detachedCorrelation({ session_id: "detached" }).session_id).toBe(
			"detached",
		);
		for (let index = 0; index < 3_000; index += 1) {
			runCorrelation({ session_id: `s-${index}` }, () => settleCorrelation());
		}
		expect(getSettledCorrelationCountForTests()).toBeLessThanOrEqual(2048);
		resetCorrelationForTests();
	});
});

describe("correlation edges", () => {
	it("does not treat an id from another source namespace as an exact edge", () => {
		const [edge] = correlateEdges(
			[{ id: "same", namespace: "session", timestamp: "2026-08-25T00:00:00Z" }],
			[{ id: "same", namespace: "metrics", timestamp: "2026-08-25T00:00:01Z" }],
			{
				scope: "namespace",
				windowMs: 2_000,
				directional: "forward",
				exactKeys: [],
				leftIdKey: "id",
				rightIdKey: "id",
			},
		);
		expect(edge.kind).toBe("unmatched");
	});
	it("prefers exact IDs and leaves missing or ambiguous proximity unmatched", () => {
		const left = [
			{
				id: "left-exact",
				event_id: "left-exact",
				session_id: "s",
				timestamp: "2026-08-25T00:00:00Z",
			},
			{
				id: "left-missing",
				session_id: "missing",
				timestamp: "2026-08-25T00:00:00Z",
			},
			{
				id: "left-ambiguous",
				session_id: "s",
				timestamp: "2026-08-25T00:00:00Z",
			},
		];
		const right = [
			{
				id: "right-exact",
				event_id: "left-exact",
				session_id: "s",
				timestamp: "2026-08-25T00:00:01Z",
			},
			{ id: "right-a", session_id: "s", timestamp: "2026-08-25T00:00:02Z" },
			{ id: "right-b", session_id: "s", timestamp: "2026-08-25T00:00:03Z" },
		];
		const edges = correlateEdges(left, right, {
			scope: "session_id",
			windowMs: 10_000,
			directional: "forward",
			exactKeys: ["event_id"],
			leftIdKey: "id",
			rightIdKey: "id",
		});
		expect(edges[0]).toMatchObject({ kind: "exact", right: "right-exact" });
		expect(edges[1]?.kind).toBe("unmatched");
		expect(edges[2]).toMatchObject({ kind: "unmatched", ambiguity_count: 3 });
		expect(edgeIsDecisionSafe(edges[2]!)).toBe(false);
	});
	it("marks a single legacy proximity match as opt-in inference", () => {
		const [edge] = correlateEdges(
			[{ id: "legacy", session_id: "s", timestamp: "2026-08-25T00:00:00Z" }],
			[{ id: "candidate", session_id: "s", timestamp: "2026-08-25T00:00:01Z" }],
			{
				scope: "session_id",
				windowMs: 2_000,
				directional: "forward",
				exactKeys: [],
				leftIdKey: "id",
				rightIdKey: "id",
			},
		);
		expect(edge).toMatchObject({
			kind: "unique_inferred",
			provenance: "inference",
		});
		expect(edgeIsDecisionSafe(edge)).toBe(false);
	});
});

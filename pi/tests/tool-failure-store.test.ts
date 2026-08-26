import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	ToolFailureStore,
	closeToolFailureStores,
	registerToolFailureStoreLifecycle,
} from "../lib/tool-failure-store.ts";
import { scanToolFailures } from "../lib/tool-failure-classifier.ts";

const roots: string[] = [];
async function fixture(lines: unknown[]): Promise<string> {
	const filePath = path.join(roots[0], `${roots[0].length}-${Math.random()}.jsonl`);
	await fs.writeFile(filePath, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);
	return filePath;
}

afterEach(async () => {
	await closeToolFailureStores();
	for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

describe("ToolFailureStore", () => {
	it("loads native DuckDB, reuses an instance, closes, and reopens persisted evidence", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "tool-failure-store-"));
		roots.push(root);
		const database = path.join(root, "read-model.duckdb");
		const session = await fixture([
			{ candidateId: "new", fingerprint: "n1", toolName: "read", message: "failed", sessionId: "s1", observedAt: "2026-08-25T10:00:00Z", coordinate: "s1:1" },
			{ candidateId: "expected", fingerprint: "e1", toolName: "read", message: "expected", sessionId: "s1", observedAt: "2026-08-25T10:01:00Z", coordinate: "s1:2" },
			{ candidateId: "resolved", fingerprint: "r1", toolName: "read", message: "resolved", sessionId: "s1", observedAt: "2026-08-25T10:02:00Z", coordinate: "s1:3" },
			{ candidateId: "regression", fingerprint: "g1", toolName: "read", message: "regressed", sessionId: "s1", observedAt: "2026-08-25T10:03:00Z", coordinate: "s1:4" },
		]);
		const decisions = await fixture([
			{ candidateId: "expected", fingerprint: "e1", outcome: "expected", recordedAt: "2026-08-25T10:10:00Z" },
			{ candidateId: "resolved", fingerprint: "r1", outcome: "resolved", recordedAt: "2026-08-25T10:11:00Z", effectiveAt: "2026-08-25T10:04:00Z" },
			{ candidateId: "resolved", fingerprint: "r1", outcome: "expected", recordedAt: "2026-08-25T10:12:00Z" },
			{ candidateId: "resolved", fingerprint: "r1", outcome: "resolved", recordedAt: "2026-08-25T10:13:00Z", effectiveAt: "2026-08-25T10:02:30Z" },
			{ candidateId: "regression", fingerprint: "g1", outcome: "resolved", recordedAt: "2026-08-25T10:14:00Z", effectiveAt: "2026-08-25T10:02:30Z" },
		]);
		const first = await ToolFailureStore.open(database);
		const second = await ToolFailureStore.open(database);
		await first.ingest(session, decisions);
		await expect(second.candidates()).resolves.toEqual(expect.arrayContaining([
			expect.objectContaining({ candidateId: "new", reason: "new" }),
			expect.objectContaining({ candidateId: "regression", reason: "post-effective-regression" }),
		]));
		expect((await second.candidates()).map((item) => item.candidateId)).not.toEqual(expect.arrayContaining(["expected", "resolved"]));
		await first.close();
		await second.close();
		const reopened = await ToolFailureStore.open(database);
		expect((await reopened.candidates()).map((item) => item.candidateId)).toEqual(expect.arrayContaining(["new", "regression"]));
		await reopened.close();
	});

	it("incrementally replaces changed files, removes deleted files, and rolls back malformed refreshes", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "tool-failure-store-refresh-")); roots.push(root);
		const sessions = path.join(root, "sessions"); await fs.mkdir(sessions); const source = path.join(sessions, "one.jsonl");
		const call = (id: string) => JSON.stringify({ role: "assistant", timestamp: "2026-08-20T00:00:00Z", content: [{ type: "toolCall", id, name: "custom" }] });
		const result = (id: string) => JSON.stringify({ role: "toolResult", timestamp: "2026-08-20T00:00:00Z", toolCallId: id, isError: true, content: [{ type: "text", text: "this.broker.reconcile is not a function" }] });
		await fs.writeFile(source, `${call("one")}\n${result("one")}\n`); const store = await ToolFailureStore.open(path.join(root, "read-model.duckdb"));
		await store.refreshSessionCorpus(sessions); expect((await store.scan(new Date("2026-08-25T00:00:00Z"))).candidates).toHaveLength(1);
		await fs.writeFile(source, `${call("two")}\n${result("two")}\n`); await store.refreshSessionCorpus(sessions); expect((await store.scan(new Date("2026-08-25T00:00:00Z"))).candidates[0]?.coordinates).toHaveLength(1);
		await fs.writeFile(source, "{malformed\n"); await expect(store.refreshSessionCorpus(sessions)).rejects.toThrow("malformed"); expect((await store.scan(new Date("2026-08-25T00:00:00Z"))).candidates).toHaveLength(1);
		await fs.rm(source); await store.refreshSessionCorpus(sessions); expect((await store.scan(new Date("2026-08-25T00:00:00Z"))).candidates).toHaveLength(0); await store.close();
	});

	it("reads Pi message envelopes with their timestamp and physical source line", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "tool-failure-store-envelope-")); roots.push(root);
		const sessions = path.join(root, "sessions"); await fs.mkdir(sessions); const source = path.join(sessions, "one.jsonl");
		await fs.writeFile(source, [
			JSON.stringify({ type: "session", id: "session", timestamp: "2026-08-20T00:00:00Z" }),
			JSON.stringify({ type: "message", id: "call-entry", timestamp: "2026-08-20T00:01:00Z", message: { role: "assistant", content: [{ type: "toolCall", id: "one", name: "custom" }] } }),
			JSON.stringify({ type: "message", id: "result-entry", timestamp: "2026-08-20T00:02:00Z", message: { role: "toolResult", toolCallId: "one", isError: true, note: "line\u2028separator", content: [{ type: "text", text: "this.broker.reconcile is not a function" }] } }),
		].join("\n") + "\n");
		const store = await ToolFailureStore.open(path.join(root, "read-model.duckdb"));
		await store.refreshSessionCorpus(sessions);
		const scan = await store.scan(new Date("2026-08-25T00:00:00Z"));
		expect(scan.candidates[0]).toMatchObject({ firstObserved: "2026-08-20T00:02:00Z", lastObserved: "2026-08-20T00:02:00Z" });
		const selected = await store.selectedCoordinates(scan, [scan.candidates[0]!.candidateId]);
		expect(selected.get(scan.candidates[0]!.candidateId)?.[0]).toMatchObject({ line: 3, token: scan.candidates[0]!.coordinates[0] });
		await store.close();
	});

	it("resolves selected coordinates internally without returning source paths", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "tool-failure-store-coordinates-")); roots.push(root); const sessions = path.join(root, "sessions"); await fs.mkdir(sessions); const source = path.join(sessions, "one.jsonl");
		await fs.writeFile(source, `${JSON.stringify({ role: "assistant", content: [{ type: "toolCall", id: "one", name: "custom" }] })}\n${JSON.stringify({ role: "toolResult", toolCallId: "one", isError: true, content: [{ type: "text", text: "this.broker.reconcile is not a function" }] })}\n`);
		const store = await ToolFailureStore.open(path.join(root, "read-model.duckdb")); await store.refreshSessionCorpus(sessions); const scan = await store.scan(new Date("2026-08-25T00:00:00Z")); const selected = await store.selectedCoordinates(scan, [scan.candidates[0]!.candidateId]); expect(selected.get(scan.candidates[0]!.candidateId)?.[0]?.token).toBe(scan.candidates[0]!.coordinates[0]); expect(JSON.stringify(selected)).not.toContain(source); await store.close();
	});

	it("orders newest observations first and fills the bound with distinct sessions", () => {
		const call = (filename: string, id: string) => ({ filename, id: `call-${id}`, timestamp: null, message: { role: "assistant", content: [{ type: "toolCall", id, name: "custom" }] } });
		const failure = (filename: string, id: string, timestamp: string | null) => ({ filename, id: `result-${id}`, timestamp, message: { role: "toolResult", toolCallId: id, isError: true, content: [{ type: "text", text: "this.broker.reconcile is not a function" }] } });
		const scan = scanToolFailures([
			call("z-session", "old"), failure("z-session", "old", "2026-08-20T00:00:00Z"),
			call("a-session", "new"), failure("a-session", "new", "2026-08-25T00:00:00Z"),
			call("b-session", "tie"), failure("b-session", "tie", "2026-08-25T00:00:00Z"),
			call("c-session", "invalid"), failure("c-session", "invalid", "not-a-date"),
			call("d-session", "missing"), failure("d-session", "missing", null),
		], new Date("2026-08-25T00:01:00Z"));
		const candidate = scan.candidates[0]!;
		expect(candidate.lastObserved).toBe("2026-08-25T00:00:00Z");
		expect(scan.timestampDiagnostics).toMatchObject({ malformed: 1, missing: 1 });
		expect(candidate.coordinates).toHaveLength(3);
		expect(new Set(candidate.coordinates).size).toBe(3);
		expect(candidate.coordinates[0]).not.toBe(candidate.coordinates[2]);
	});

	it("retains correlated successful results across corpus refresh", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "tool-failure-store-success-")); roots.push(root); const sessions = path.join(root, "sessions"); await fs.mkdir(sessions); const source = path.join(sessions, "one.jsonl");
		const call = (id: string, args: Record<string, unknown>, timestamp: string) => ({ role: "assistant", timestamp, content: [{ type: "toolCall", id, name: "bash", arguments: args }] });
		await fs.writeFile(source, [call("failed", {}, "2026-08-25T00:00:00Z"), { role: "toolResult", timestamp: "2026-08-25T00:01:00Z", toolCallId: "failed", isError: true, content: [{ type: "text", text: "'command' is a required property" }] }, call("success", { command: "echo ok" }, "2026-08-25T00:01:30Z"), { role: "toolResult", timestamp: "2026-08-25T00:02:00Z", toolCallId: "success", isError: false, content: [{ type: "text", text: "ok" }] }].map(JSON.stringify).join("\n") + "\n");
		const store = await ToolFailureStore.open(path.join(root, "read-model.duckdb")); await store.refreshSessionCorpus(sessions); const scan = await store.scan(new Date("2026-08-25T00:03:00Z")); expect(scan.scannedResults).toBe(2); const selected = await store.selectedCoordinates(scan, [scan.candidates[0]!.candidateId]); const coordinates = selected.get(scan.candidates[0]!.candidateId); expect(coordinates?.[0]?.callLine).toBe(1); expect(coordinates?.[1]).toMatchObject({ callLine: 3, fixCheckFor: scan.candidates[0]!.coordinates[0], token: `fix-check:${scan.candidates[0]!.coordinates[0]}` }); await store.close();
	});

	it("closes the process cache on session shutdown", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "tool-failure-store-"));
		roots.push(root);
		let shutdown: (() => Promise<void>) | undefined;
		const pi = { on: (_event: string, handler: () => Promise<void>) => { shutdown = handler; } };
		registerToolFailureStoreLifecycle(pi);
		const database = path.join(root, "shutdown.duckdb");
		const store = await ToolFailureStore.open(database);
		await store.close();
		await shutdown?.();
		const reopened = await ToolFailureStore.open(database);
		await reopened.close();
	});
});

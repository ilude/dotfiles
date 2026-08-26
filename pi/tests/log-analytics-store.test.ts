import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DuckDBInstance } from "@duckdb/node-api";
import { definitionFor } from "../lib/log-analytics/registry.ts";
import {
	LogAnalyticsStore,
	resetLogAnalyticsStoreCacheForTests,
	type SourceDefinition,
} from "../lib/log-analytics/store.ts";

const roots: string[] = [];

type EventRow = {
	event_id: string | null;
	session_id: string | null;
	event_type: string | null;
};

function eventDefinition(
	canonicalRoots?: readonly string[],
	parse: SourceDefinition["parse"] = (value) => {
		if (!value || typeof value !== "object") return undefined;
		const row = value as Record<string, unknown>;
		return {
			event_id: typeof row.id === "string" ? row.id : null,
			session_id: typeof row.session_id === "string" ? row.session_id : null,
			event_type: typeof row.event === "string" ? row.event : null,
		};
	},
): SourceDefinition<EventRow> {
	return {
		name: "events",
		canonicalRoots,
		columns: [
			{ name: "event_id", type: "VARCHAR" },
			{ name: "session_id", type: "VARCHAR" },
			{ name: "event_type", type: "VARCHAR" },
		],
		parse,
	};
}

async function makeRoot(prefix = "pi-log-store-"): Promise<string> {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	roots.push(root);
	return root;
}

function digest(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

afterEach(async () => {
	await resetLogAnalyticsStoreCacheForTests();
	for (const root of roots.splice(0))
		await fs.rm(root, { recursive: true, force: true });
});

describe("LogAnalyticsStore", () => {
	it("resumes at the committed newline, completes a partial line once, and preserves the authority digest", async () => {
		const root = await makeRoot();
		const source = path.join(root, "events.jsonl");
		const database = path.join(root, "analytics.duckdb");
		const initial =
			'{"id":"one","session_id":"s1","event":"start"}\n{"id":"partial"}';
		await fs.writeFile(source, initial, "utf8");
		const beforeDigest = digest(await fs.readFile(source, "utf8"));
		const store = await LogAnalyticsStore.open(database);
		await store.refresh(eventDefinition([root]), [source]);
		expect(digest(await fs.readFile(source, "utf8"))).toBe(beforeDigest);
		expect(
			await store.query("SELECT event_id FROM source_events ORDER BY event_id"),
		).toEqual([{ event_id: "one" }]);
		const appended = '\n{"id":"two","session_id":"s1","event":"stop"}\n';
		await fs.appendFile(source, appended);
		await store.refresh(eventDefinition([root]), [source]);
		expect(
			await store.query("SELECT event_id FROM source_events ORDER BY event_id"),
		).toEqual([
			{ event_id: "one" },
			{ event_id: "partial" },
			{ event_id: "two" },
		]);
		await store.refresh(eventDefinition([root]), [source]);
		expect(
			await store.query("SELECT event_id FROM source_events"),
		).toHaveLength(3);
		expect(digest(await fs.readFile(source, "utf8"))).toBe(
			digest(`${initial}${appended}`),
		);
		await store.close();
	});

	it("does not reparse unchanged files and parses only new completed lines", async () => {
		const root = await makeRoot();
		const source = path.join(root, "events.jsonl");
		const database = path.join(root, "analytics.duckdb");
		let parseCount = 0;
		const definition = eventDefinition([root], (value, line, file) => {
			parseCount += 1;
			return eventDefinition().parse(value, line, file);
		});
		await fs.writeFile(source, '{"id":"one"}\n', "utf8");
		const store = await LogAnalyticsStore.open(database);
		await store.refresh(definition, [source]);
		expect(parseCount).toBe(1);
		await store.refresh(definition, [source]);
		expect(parseCount).toBe(1);
		await fs.appendFile(source, '{"id":"two"}\n', "utf8");
		await store.refresh(definition, [source]);
		expect(parseCount).toBe(2);
		await fs.appendFile(source, '{"id":"partial"}', "utf8");
		await store.refresh(definition, [source]);
		expect(parseCount).toBe(2);
		await fs.appendFile(source, "\n", "utf8");
		await store.refresh(definition, [source]);
		expect(parseCount).toBe(3);
		await store.close();
	});

	it("detects same-size replacement even when the timestamp marker is unchanged", async () => {
		const root = await makeRoot();
		const source = path.join(root, "events.jsonl");
		const database = path.join(root, "analytics.duckdb");
		await fs.writeFile(source, '{"id":"one","event":"start"}\n', "utf8");
		const store = await LogAnalyticsStore.open(database);
		const first = await store.refresh(eventDefinition([root]), [source]);
		const stat = await fs.stat(source);
		await fs.writeFile(source, '{"id":"two","event":"start"}\n', "utf8");
		await fs.utimes(source, stat.atime, stat.mtime);
		const second = await store.refresh(eventDefinition([root]), [source]);
		expect(second[0]?.fingerprint).not.toBe(first[0]?.fingerprint);
		expect(await store.query("SELECT event_id FROM source_events")).toEqual([
			{ event_id: "two" },
		]);
		await store.close();
	});

	it("rejects filesystem functions even when a source view is allowed", async () => {
		const root = await makeRoot();
		const source = path.join(root, "events.jsonl");
		const store = await LogAnalyticsStore.open(path.join(root, "analytics.duckdb"));
		await fs.writeFile(source, '{"id":"one"}\n', "utf8");
		await store.refresh(eventDefinition([root]), [source]);
		for (const functionName of ["read_text", "read_blob", "glob"]) {
			await expect(
				store.query(`SELECT ${functionName}(event_id) FROM source_events`),
			).rejects.toThrow("structural projections");
		}
		await store.close();
	});

	it("rolls back malformed, unstable, and bounded refreshes without changing the prior projection", async () => {
		const root = await makeRoot();
		const source = path.join(root, "events.jsonl");
		const database = path.join(root, "analytics.duckdb");
		await fs.writeFile(source, '{"id":"one","event":"start"}\n', "utf8");
		const store = await LogAnalyticsStore.open(database);
		await store.refresh(eventDefinition([root]), [source]);
		await fs.writeFile(source, "not-json\n", "utf8");
		await expect(
			store.refresh(eventDefinition([root]), [source]),
		).rejects.toThrow("malformed");
		expect(await store.query("SELECT event_id FROM source_events")).toEqual([
			{ event_id: "one" },
		]);
		await fs.writeFile(
			source,
			'{"id":"deep","nested":{"a":{"b":{"c":1}}}}\n',
			"utf8",
		);
		await expect(
			store.refresh(eventDefinition([root]), [source], { maxNesting: 2 }),
		).rejects.toThrow("nesting");
		await expect(
			store.refresh(eventDefinition([root]), [source], { maxLineBytes: 8 }),
		).rejects.toThrow("line");
		await expect(
			store.refresh(eventDefinition([root]), [source], { maxRecords: 0 }),
		).rejects.toThrow("record");
		await expect(
			store.refresh(eventDefinition([root]), [source], { maxBytes: 1 }),
		).rejects.toThrow("byte");
		await expect(
			store.refresh(eventDefinition([root]), [source], {
				signal: AbortSignal.abort(),
			}),
		).rejects.toThrow("cancelled");
		await expect(
			store.refresh(eventDefinition([root]), [source], { maxElapsedMs: -1 }),
		).rejects.toThrow("time limit");
		expect(await store.query("SELECT event_id FROM source_events")).toEqual([
			{ event_id: "one" },
		]);
		await store.close();
	});

	it("rejects a source that changes during the read and preserves the prior commit", async () => {
		const root = await makeRoot();
		const source = path.join(root, "events.jsonl");
		const database = path.join(root, "analytics.duckdb");
		await fs.writeFile(source, '{"id":"one","event":"start"}\n', "utf8");
		const store = await LogAnalyticsStore.open(database);
		await store.refresh(eventDefinition([root]), [source]);
		await fs.appendFile(source, '{"id":"next","event":"next"}\n');
		let changed = false;
		const changingDefinition = eventDefinition([root], (value, line, file) => {
			if (!changed) {
				changed = true;
				fsSync.appendFileSync(file, '{"id":"late","event":"late"}\n');
			}
			return eventDefinition().parse(value, line, file);
		});
		await expect(store.refresh(changingDefinition, [source])).rejects.toThrow(
			"changed while reading",
		);
		expect(await store.query("SELECT event_id FROM source_events")).toEqual([
			{ event_id: "one" },
		]);
		await store.close();
	});

	it("enforces canonical roots and rejects links, non-files, and a linked database", async () => {
		const root = await makeRoot();
		const outside = await makeRoot("pi-log-outside-");
		const source = path.join(root, "events.jsonl");
		const outsideSource = path.join(outside, "events.jsonl");
		await fs.writeFile(source, '{"id":"inside"}\n', "utf8");
		await fs.writeFile(outsideSource, '{"id":"outside"}\n', "utf8");
		const store = await LogAnalyticsStore.open(
			path.join(root, "analytics.duckdb"),
		);
		await expect(
			store.refresh(eventDefinition([root]), [outsideSource]),
		).rejects.toThrow("canonical root");
		if (process.platform !== "win32") {
			expect((await fs.stat(root)).mode & 0o777).toBe(0o700);
			expect(
				(await fs.stat(path.join(root, "analytics.duckdb"))).mode & 0o777,
			).toBe(0o600);
		}
		await expect(
			store.refresh(eventDefinition([root]), [root]),
		).rejects.toThrow("regular file");
		const link = path.join(root, "source-link.jsonl");
		try {
			await fs.symlink(source, link);
			await expect(
				store.refresh(eventDefinition([root]), [link]),
			).rejects.toThrow("link");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
		}
		await store.close();
		const linkedDatabase = path.join(root, "linked.duckdb");
		try {
			await fs.symlink(path.join(root, "analytics.duckdb"), linkedDatabase);
			await expect(LogAnalyticsStore.open(linkedDatabase)).rejects.toThrow(
				"regular file",
			);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
		}
	});

	it("recreates an incompatible disposable schema and keeps projections structural", async () => {
		const root = await makeRoot();
		const database = path.join(root, "analytics.duckdb");
		const instance = await DuckDBInstance.create(database);
		const connection = await instance.connect();
		await connection.run(
			"CREATE TABLE _analytics_schema (schema_version BIGINT)",
		);
		await connection.run("INSERT INTO _analytics_schema VALUES (999)");
		connection.closeSync();
		instance.closeSync();
		const store = await LogAnalyticsStore.open(database);
		const schema = await store.schema();
		expect(schema).toEqual([]);
		await store.close();
	});

	it("does not project nested data or payload fields", () => {
		const definition = definitionFor("metric_events");
		if (!definition) throw new Error("metric_events definition missing");
		const projection = definition.parse(
			{
				id: "metric-1",
				event: "tool_use",
				data: { session: "should-not-be-read", trace_id: "should-not-be-read" },
				payload: { session_id: "should-not-be-read" },
			},
			1,
			"fixture.jsonl",
		);
		expect(projection).toMatchObject({
			event_id: "metric-1",
			event: "tool_use",
			session_id: null,
			trace_id: null,
		});
	});
});

// Finite synthetic T1 probe. Uses generated native JSONL only and owns all temporary files.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createJiti } from "jiti";
import { DuckDBInstance } from "@duckdb/node-api";

const root = path.resolve(import.meta.dirname, "..");
const jiti = createJiti(import.meta.url);
const { discoverSessions } = await jiti.import(path.join(root, "lib/log-analytics/sessions.ts"));
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "pi-analytics-t1-"));
let peakRss = process.memoryUsage().rss;
const sampler = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 10);
sampler.unref();
const started = performance.now();
const cpuStarted = process.cpuUsage();

const quote = value => `'${value.replaceAll("'", "''")}'`;
async function treeBytes(dir) {
  let total = 0;
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    total += entry.isDirectory() ? await treeBytes(file) : (await fs.stat(file)).size;
  }
  return total;
}
async function timed(work) {
  const wall = performance.now(); const cpu = process.cpuUsage(); const value = await work();
  const used = process.cpuUsage(cpu);
  return { value, elapsedMs: performance.now() - wall, cpuMs: (used.user + used.system) / 1000 };
}
async function rows(connection, sql) {
  const result = await connection.runAndReadAll(sql);
  return result.getRowObjectsJson();
}

try {
  const registry = { active: "default", roots: { default: path.join(scratch, "default"), legacy: path.join(scratch, "legacy") } };
  for (const profileRoot of Object.values(registry.roots)) await fs.mkdir(path.join(profileRoot, "sessions"), { recursive: true });

  // Enough files to expose repeated header I/O without reading transcript bodies.
  const headerFiles = 240;
  for (let n = 0; n < headerFiles; n++) {
    const profile = n % 2 ? "legacy" : "default";
    const header = { type: "session", version: 3, id: `header-${n}`, cwd: "/synthetic", timestamp: "2026-09-01T00:00:00Z" };
    await fs.writeFile(path.join(registry.roots[profile], "sessions", `header-${n}.jsonl`), `${JSON.stringify(header)}\n`);
  }
  const discovery = [];
  for (let pass = 1; pass <= 3; pass++) {
    const measured = await timed(() => discoverSessions(registry, ["default", "legacy"]));
    assert.equal(measured.value.length, headerFiles);
    discovery.push({ pass, files: measured.value.length, headerReadUpperBoundBytes: measured.value.length * 512, elapsedMs: measured.elapsedMs, cpuMs: measured.cpuMs });
  }

  // Two independent files with complete padded records. IDs and join keys are generator-owned.
  const dataDir = path.join(scratch, "input"); await fs.mkdir(dataDir);
  const files = []; const recordsPerFile = 4096; const padding = "x".repeat(4096);
  for (let f = 0; f < 2; f++) {
    const lines = [];
    for (let n = 0; n < recordsPerFile; n++) lines.push(JSON.stringify({
      type: "message", id: `f${f}-${n}`, timestamp: "2026-09-01T00:00:00Z",
      message: { role: "toolResult", toolName: n % 2 ? "bash" : "read", toolCallId: `call-${n}`, isError: n % 7 === 0,
        content: [{ type: "text", text: `${f}:${n}:${padding}` }] },
    }));
    const file = path.join(dataDir, `records-${f}.jsonl`); await fs.writeFile(file, `${lines.join("\n")}\n`); files.push(file);
  }
  const inputBytes = (await Promise.all(files.map(file => fs.stat(file)))).reduce((sum, stat) => sum + stat.size, 0);
  const expected = { records: recordsPerFile * 2, errors: Math.ceil(recordsPerFile / 7), joined: recordsPerFile };

  async function stage(mode) {
    const owned = path.join(scratch, `owned-${mode}`); await fs.mkdir(owned);
    const dbPath = path.join(owned, "analytics.duckdb"); const temp = path.join(owned, "spill"); await fs.mkdir(temp);
    const beforeRss = process.memoryUsage().rss; const wall = performance.now(); const cpu = process.cpuUsage();
    const instance = await DuckDBInstance.create(dbPath, { enable_external_access: "true", threads: "2", memory_limit: "1GB",
      temp_directory: temp, max_temp_directory_size: "1GB", autoinstall_known_extensions: "false", autoload_known_extensions: "false" });
    const connection = await instance.connect();
    try {
      if (mode === "one-file") {
        await connection.run("CREATE TABLE raw(profile VARCHAR, source_file VARCHAR, record JSON)");
        for (let f = 0; f < files.length; f++) await connection.run(`INSERT INTO raw SELECT ${quote(f ? "legacy" : "default")}, filename::VARCHAR, json FROM read_json_objects(${quote(files[f])}, format='newline_delimited', filename=true)`);
      } else {
        await connection.run("CREATE TABLE raw(profile VARCHAR, source_file VARCHAR, record JSON)");
        const appender = await connection.createAppender("raw");
        try {
          for (let f = 0; f < files.length; f++) {
            const handle = await fs.open(files[f], "r");
            try {
              for await (const line of handle.readLines()) {
                if (!line) continue;
                appender.appendVarchar(f ? "legacy" : "default"); appender.appendVarchar(files[f]); appender.appendVarchar(line); appender.endRow();
              }
            } finally { await handle.close(); }
          }
          appender.flushSync();
        } finally { appender.closeSync(); }
      }
      await connection.run("CREATE TABLE prepared AS SELECT profile, source_file, record, record->>'id' id, record->'message'->>'toolName' tool_name, record->'message'->>'toolCallId' tool_call_id, try_cast(record->'message'->>'isError' AS BOOLEAN) is_error FROM raw");
      await connection.run("DROP TABLE raw");
      await connection.run("SET enable_external_access = false");
      const grouped = await rows(connection, "SELECT profile, tool_name, count(*) n, count(*) FILTER (is_error) errors FROM prepared GROUP BY ALL ORDER BY profile, tool_name");
      const joined = await rows(connection, "SELECT count(*) n FROM prepared a JOIN prepared b USING (tool_call_id) WHERE a.profile='default' AND b.profile='legacy'");
      assert.equal(grouped.reduce((sum, row) => sum + Number(row.n), 0), expected.records);
      assert.equal(grouped.filter(row => row.tool_name === "read").reduce((sum, row) => sum + Number(row.errors), 0), expected.errors);
      assert.deepEqual(joined, [{ n: String(expected.joined) }]);
      await assert.rejects(() => rows(connection, `SELECT * FROM read_json_objects(${quote(files[0])})`));
      await connection.run("CHECKPOINT");
      const diskHighWaterBytes = await treeBytes(owned);
      const used = process.cpuUsage(cpu);
      return { mode, inputBytes, records: expected.records, elapsedMs: performance.now() - wall, cpuMs: (used.user + used.system) / 1000,
        rssDeltaBytes: process.memoryUsage().rss - beforeRss, diskHighWaterBytes, grouped, joined, externalReadDenied: true, memoryLimit: "1GB", threads: 2 };
    } finally { connection.closeSync(); instance.closeSync(); await fs.rm(owned, { recursive: true, force: true }); }
  }
  const staging = [await stage("one-file"), await stage("chunked-appender")];
  clearInterval(sampler);
  const cpu = process.cpuUsage(cpuStarted);
  const report = { probe: "query-driven-log-analytics/T1", runtime: process.version, duckdb: "1.5.5-r.4", platform: `${process.platform}/${process.arch}`,
    synthetic: { headerFiles, dataFiles: files.length, recordsPerFile, inputBytes, fullRecordPayloadBytes: padding.length }, discovery, staging,
    process: { elapsedMs: performance.now() - started, cpuMs: (cpu.user + cpu.system) / 1000, peakRssBytes: peakRss }, cleanup: { scratchRemovedByFinally: true } };
  console.log(JSON.stringify(report, null, 2));
} finally {
  clearInterval(sampler);
  await fs.rm(scratch, { recursive: true, force: true });
  await assert.rejects(() => fs.stat(scratch));
}

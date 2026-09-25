// Bounded strategy comparison on generated native JSONL only. No session history is read.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createJiti } from "jiti";
import { DuckDBInstance } from "@duckdb/node-api";
import { generateFixture } from "./log-analytics-fixture.mjs";

const profileRoot = path.resolve(import.meta.dirname, "..");
const root = path.join(profileRoot, ".analytics-state", "log-analytics-t1-fixtures");
const jiti = createJiti(import.meta.url);
const { discoverSessions } = await jiti.import(path.join(profileRoot, "lib/log-analytics/sessions.ts"));
const strategies = ["standard-in-memory", "standard-owned-spill", "large-raw-disk"];
const workloads = {
  count: "SELECT count(*) n FROM session_entries",
  filtered_projection_json: "SELECT count(*) n FROM session_entries WHERE _profile = 'default' AND json_extract_string(record, '$.message.toolName') = 'fixture_tool' AND json_extract_string(record, '$.message.isError') = 'true'",
  grouping: "SELECT _profile, json_extract_string(record, '$.message.toolName') tool, count(*) n FROM session_entries GROUP BY ALL ORDER BY _profile, tool",
  sorting: "SELECT _profile, _timestamp, _record_key FROM session_entries ORDER BY _timestamp DESC NULLS LAST, _record_key LIMIT 100",
  join: "SELECT count(*) n FROM session_entries a JOIN session_entries b ON json_extract_string(a.record, '$.message.toolCallId') = json_extract_string(b.record, '$.message.toolCallId') WHERE a._profile = 'default' AND b._profile = 'legacy'",
};
const quote = value => `'${value.replaceAll("'", "''")}'`;
const columns = `profile AS _profile, source_file AS _source_file,
  coalesce(nullif(json_extract_string(record, '$.id'), ''), md5(record::VARCHAR)) AS _record_key,
  try_cast(json_extract_string(record, '$.timestamp') AS TIMESTAMPTZ) AS _timestamp,
  record`;

async function treeBytes(dir) {
  let total = 0;
  for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const item = path.join(dir, entry.name);
    total += entry.isDirectory() ? await treeBytes(item) : (await fs.stat(item).catch(() => ({ size: 0 }))).size;
  }
  return total;
}
async function exists(file) { try { await fs.stat(file); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; } }
async function measure(size, manifest, strategy) {
  const selectedFiles = manifest.files.filter(file => file.profile === "default" || file.profile === "legacy");
  const registry = manifest.registry;
  const discoveryStart = performance.now();
  const discovered = await discoverSessions(registry, ["default", "legacy"]);
  const discoveryMs = performance.now() - discoveryStart;
  assert.equal(discovered.length, selectedFiles.length);
  const selectedBytes = selectedFiles.reduce((sum, file) => sum + file.bytes, 0);
  const owned = path.join(root, `owned-${size}-${strategy}`);
  await fs.mkdir(path.join(owned, "spill"), { recursive: true });
  const spill = path.join(owned, "spill");
  let peakOwnedDiskBytes = 0;
  let polling = setInterval(async () => { peakOwnedDiskBytes = Math.max(peakOwnedDiskBytes, await treeBytes(owned)); }, 20);
  polling.unref();
  let instance;
  let phase = "instance-create";
  let stagingMs;
  let queryMs = {};
  try {
    const database = strategy === "large-raw-disk" ? path.join(owned, "analytics.duckdb") : ":memory:";
    const tempDirectory = strategy === "standard-in-memory" ? "" : spill;
    instance = await DuckDBInstance.create(database, { threads: "2", memory_limit: "2GB", temp_directory: tempDirectory,
      max_temp_directory_size: "2GB", autoinstall_known_extensions: "false", autoload_known_extensions: "false" });
    const connection = await instance.connect();
    const stagingStart = performance.now();
    try {
      phase = "staging";
      await connection.run("SET preserve_insertion_order = false");
      if (strategy === "large-raw-disk") {
        await connection.run("CREATE TABLE raw(profile VARCHAR, source_file VARCHAR, record JSON)");
        const appender = await connection.createAppender("raw");
        try {
          for (const file of selectedFiles) {
            const handle = await fs.open(file.file, "r");
            try {
              for await (const line of handle.readLines()) {
                if (!line) continue;
                const record = JSON.parse(line);
                if (record.type !== "message") continue;
                appender.appendVarchar(file.profile); appender.appendVarchar(file.file); appender.appendVarchar(line); appender.endRow();
              }
            } finally { await handle.close(); }
          }
          appender.flushSync();
        } finally { appender.closeSync(); }
        await connection.run(`CREATE VIEW session_entries AS SELECT ${columns} FROM raw`);
        await connection.run("CHECKPOINT");
      } else {
        const files = selectedFiles.map(file => quote(file.file)).join(", ");
        const metadata = selectedFiles.map(file => `(${quote(file.file)}, ${quote(file.profile)})`).join(", ");
        await connection.run(`CREATE TABLE session_entries AS SELECT ${columns} FROM (
          SELECT meta.profile profile, filename source_file, json record
          FROM read_json_objects([${files}], format='newline_delimited', filename=true, ignore_errors=true) data
          JOIN (VALUES ${metadata}) meta(file, profile) ON filename = meta.file
          WHERE json_extract_string(json, '$.type') = 'message'
        ) staged`);
      }
      stagingMs = performance.now() - stagingStart;
      const recordsStaged = Number((await connection.runAndReadAll("SELECT count(*) n FROM session_entries")).getRowObjectsJson()[0].n);
      assert.equal(recordsStaged, manifest.expected.totalRecords - manifest.files.length);
      const queryResults = {};
      for (const [name, sql] of Object.entries(workloads)) {
        phase = `query:${name}`;
        const start = performance.now();
        const result = await connection.runAndReadAll(sql);
        const rows = result.getRowObjectsJson();
        queryResults[name] = { elapsedMs: performance.now() - start, rows: rows.length, firstRow: rows[0] ?? null };
        queryMs[name] = queryResults[name].elapsedMs;
      }
      peakOwnedDiskBytes = Math.max(peakOwnedDiskBytes, await treeBytes(owned));
      return { size, strategy, status: "ok", selectedFiles: selectedFiles.length, selectedBytes, recordsStaged, discoveryMs, stagingMs,
        queryMs: Object.fromEntries(Object.entries(queryResults).map(([name, result]) => [name, result.elapsedMs])), queryResults,
        memoryLimit: "2GB", threads: 2, peakOwnedDiskBytes, cleanup: "pending" };
    } finally { connection.closeSync(); }
  } catch (error) {
    peakOwnedDiskBytes = Math.max(peakOwnedDiskBytes, await treeBytes(owned));
    return { size, strategy, status: "failed", selectedFiles: selectedFiles.length, selectedBytes, discoveryMs, stagingMs: stagingMs ?? null,
      queryMs, recordsStaged: null, memoryLimit: "2GB", threads: 2, peakOwnedDiskBytes, failedAt: phase,
      error: error instanceof Error ? error.message : String(error), cleanup: "pending" };
  } finally {
    if (instance) instance.closeSync();
    clearInterval(polling);
    await fs.rm(owned, { recursive: true, force: true });
    assert.equal(await exists(owned), false, `owned strategy directory remains: ${owned}`);
  }
}

await fs.mkdir(root, { recursive: true });
const results = [];
try {
  const runtime = JSON.parse(await fs.readFile(path.join(profileRoot, "node_modules/@duckdb/node-api/package.json"), "utf8"));
  console.log(JSON.stringify({ probe: "log-analytics/T1", runtime: process.version, duckdbNodeApi: runtime.version,
    platform: `${process.platform}/${process.arch}`, fixtureRoot: root,
    bands: { small: "generated ~10 MiB corpus", large: "generated >=600 MiB corpus" }, strategies, workloads: Object.keys(workloads),
    constraints: { memoryLimit: "2GB", threads: 2, ownedDiskBudget: "2GB", generatedOnly: true, fixtureCleanup: "finally removes ignored fixture root" } }));
  for (const size of ["small", "large"]) {
    const manifest = await generateFixture(root, size);
    console.log(JSON.stringify({ fixture: size, selectedScope: "both synthetic profiles", files: manifest.files.length,
      selectedBytes: manifest.actualBytes, expectedRecords: manifest.expected.totalRecords - manifest.files.length }));
    for (const strategy of strategies) {
      const result = await measure(size, manifest, strategy);
      result.cleanup = "owned strategy directory removed and verified";
      results.push(result); console.log(JSON.stringify(result));
    }
    await fs.rm(path.join(root, size), { recursive: true, force: true });
    assert.equal(await exists(path.join(root, size)), false, `fixture remains: ${path.join(root, size)}`);
  }
  assert.equal(results.length, 6);
  const memoryOnlyLarge = results.find(result => result.size === "large" && result.strategy === "standard-in-memory");
  assert.equal(memoryOnlyLarge?.status, "failed", "large standard in-memory staging should establish its memory boundary");
  assert.equal(memoryOnlyLarge.failedAt, "staging");
  assert.ok(results.filter(result => result !== memoryOnlyLarge).every(result => result.status === "ok" && Object.keys(result.queryMs).length === 5 && result.cleanup.includes("verified")));
  console.log(JSON.stringify({ summary: { strategiesCompared: strategies, resultCount: results.length,
    allWorkloadsMeasured: results.every(result => result.status === "failed" || Object.keys(result.queryMs).length === 5), allOwnedDirectoriesRemoved: true,
    thresholdRecommendation: { bytes: 256 * 1024 ** 2, rule: "use large for selections >=256 MiB or any scope without an exact session selection; standard is eligible only for exact-session selections below 256 MiB", basis: "11.3 MB selected synthetic band completed in standard; 636.4 MB selected band failed standard staging at 2GB; 256 MiB is a conservative separation point, not a measured crossover" },
    stagingRecommendation: "retain in-memory standard for demonstrably small exact-session inputs; use large raw/disk staging for broad or >=256 MiB inputs; owned spill is a viable standard fallback but does not remove the eager staging memory ceiling",
    fixtureCleanup: "each fixture band removed immediately after measurement" } }));
} finally {
  await fs.rm(root, { recursive: true, force: true });
  assert.equal(await exists(root), false, `fixture root remains: ${root}`);
}

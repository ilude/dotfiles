// Finite generated-native-record acceptance matrix. No private history is read.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createJiti } from "jiti";
import { clearFixtureCache, fixtureCacheEntries, generateFixture } from "./log-analytics-fixture.mjs";

const script = fileURLToPath(import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
const workloads = ["targeted", "last-week-failures", "three-month-traversal", "large-sql"];

async function statExists(file) { try { await fs.stat(file); return true; } catch { return false; } }
async function validCacheEntries(manifest, jiti) {
  const { MetadataCache, fileMarker } = await jiti.import(path.join(root, "lib/log-analytics/metadata-cache.ts"));
  const cache = await MetadataCache.open(manifest.registry.roots.default);
  let hits = 0;
  for (const file of manifest.files) {
    const marker = fileMarker(await fs.stat(file.file));
    if (cache.get(file.file, marker)) hits++;
  }
  return hits;
}

function rowsAsNumbers(row) { return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)])); }
async function runWorkload(manifest, workload, sample, jiti) {
  const { followUpAnalytics, queryAnalytics, searchAnalytics } = await jiti.import(path.join(root, "lib/log-analytics/api.ts"));
  const { setTemporaryStorageObserver } = await jiti.import(path.join(root, "lib/log-analytics/store.ts"));
  const selectedBytes = manifest.actualBytes;
  const cacheHitsBefore = await validCacheEntries(manifest, jiti);
  let ownedPath;
  let peakObservedTempDisk = 0;
  let polling;
  const rssStart = process.memoryUsage().rss;
  let peakRss = rssStart;
  const rssPolling = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 10);
  rssPolling.unref();
  setTemporaryStorageObserver(value => {
    ownedPath = value;
    polling ??= setInterval(async () => {
      if (ownedPath) {
        let bytes = 0;
        const visit = async directory => {
          for (const entry of await fs.readdir(directory, { withFileTypes: true }).catch(() => [])) {
            const item = path.join(directory, entry.name);
            if (entry.isDirectory()) await visit(item); else bytes += (await fs.stat(item).catch(() => ({ size: 0 }))).size;
          }
        };
        await visit(ownedPath);
        peakObservedTempDisk = Math.max(peakObservedTempDisk, bytes);
      }
    }, 20);
    polling.unref();
  });
  const started = performance.now();
  const cpuStarted = process.cpuUsage();
  let value;
  let pages = 0;
  try {
    if (workload === "targeted") {
      value = await searchAnalytics(manifest.registry, { operation: "search", profiles: ["default", "legacy"],
        sessionRefs: [{ profile: "default", sessionId: "fixture-00" }], filters: { text: "early-target" }, maxResults: 1 });
      assert.equal(value.matches.length, 1);
      assert.equal(value.matches[0].occurrence.recordKey, "default-0-3");
      assert.equal(value.complete, false);
      assert.ok(value.nextCursor);
      assert.ok(value.coverage.examinedBytes < value.coverage.selectedBytes, "targeted search read the whole selected file");
      assert.equal(value.coverage.safelyPrunedFiles, 0);
      pages = 1;
    } else if (workload === "last-week-failures") {
      const request = { operation: "search", profiles: ["default", "legacy"], interval: { since: "2026-09-01T00:00:00Z", until: "2026-09-08T00:00:00Z" },
        filters: { messageRoles: ["toolResult"], isError: true }, maxResults: 100 };
      const matches = [];
      do {
        value = await searchAnalytics(manifest.registry, { ...request, ...(value?.nextCursor ? { cursor: value.nextCursor } : {}) });
        pages++; matches.push(...value.matches);
      } while (value.nextCursor);
      assert.equal(value.complete, true);
      assert.equal(matches.length, manifest.expected.failures);
      assert.deepEqual(new Set(matches.map(match => match.occurrence.profile)), new Set(["default", "legacy"]));
      assert.ok(matches.every(match => match.messageRole === "toolResult" && match.isError === true));
      const follow = await followUpAnalytics(manifest.registry, { operation: "follow_up", occurrence: matches[0].occurrence, before: 1, after: 1 });
      assert.equal(follow.match.occurrence.recordKey, matches[0].occurrence.recordKey);
      assert.equal(follow.before.length, 1); assert.equal(follow.after.length, 1);
      assert.equal(value.coverage.remainingFiles, 0);
    } else if (workload === "three-month-traversal") {
      const request = { operation: "search", profiles: ["default", "legacy"], interval: { since: "2026-01-01T00:00:00Z", until: "2026-04-01T00:00:00Z" },
        filters: { text: "feedback-marker" }, maxResults: 100 };
      const matches = [];
      do {
        value = await searchAnalytics(manifest.registry, { ...request, ...(value?.nextCursor ? { cursor: value.nextCursor } : {}) });
        pages++; matches.push(...value.matches);
      } while (value.nextCursor);
      assert.equal(value.complete, true);
      assert.equal(matches.length, manifest.expected.feedback);
      assert.equal(value.coverage.timestampGaps, manifest.expected.timestampGaps);
      assert.equal(value.coverage.cumulative.examinedRecords, manifest.expected.totalRecords - manifest.files.length);
      // Search reports JSON payload bytes; add JSONL delimiters for physical bytes read.
      assert.ok(value.coverage.cumulative.examinedBytes + value.coverage.cumulative.examinedRecords >= selectedBytes - manifest.files.length * 2000);
      assert.deepEqual(new Set(matches.map(match => match.occurrence.recordKey)), new Set(manifest.files.map(file => `${file.profile}-${Number(file.sessionId.slice(-2))}-${manifest.expected.recordsPerFile - 1}`)));
      assert.equal(value.coverage.remainingFiles, 0);
    } else if (workload === "large-sql") {
      const sql = `SELECT count(*) total_records,
        count(*) FILTER (WHERE _profile = 'default') default_records,
        (SELECT count(*) FROM session_entries a JOIN session_entries b
          ON a.session_id = b.session_id AND a._profile = 'default' AND b._profile = 'legacy') cross_join_rows
        FROM session_entries`;
      value = await queryAnalytics(manifest.registry, { operation: "query", profiles: ["default", "legacy"], sources: ["session_entries"], execution: "large", sql, maxRows: 10 });
      const row = rowsAsNumbers(value.rows[0]);
      assert.equal(row.total_records, manifest.expected.totalRecords);
      assert.equal(row.default_records, manifest.expected.byProfile.default);
      assert.equal(row.cross_join_rows, manifest.expected.crossJoinRows);
      assert.equal(value.truncated, false);
      assert.equal(value.cost.execution, "large");
      assert.equal(value.cost.memoryLimit, "1GB");
      assert.equal(value.cost.threads, 2);
      assert.ok(value.cost.bytesScanned > 512 * 1024 * 1024 || manifest.size === "small");
      assert.ok((value.cost.peakOwnedDiskBytes ?? 0) > 0);
      pages = 1;
    }
    const cpu = process.cpuUsage(cpuStarted);
    const cost = value?.cost;
    const coverage = value?.coverage;
    const cacheHitsAfter = await validCacheEntries(manifest, jiti);
    const cleanup = ownedPath ? !(await statExists(ownedPath)) : true;
    assert.equal(cleanup, true, ownedPath ?? "no temporary SQL path");
    return { workload, size: manifest.size, sample, status: "ok", generatorExpected: manifest.expected,
      selectedFiles: manifest.files.length, selectedBytes, actualBytes: manifest.actualBytes, pages,
      filesRead: coverage?.cumulative?.examinedFiles ?? cost?.filesScanned ?? 0,
      bytesRead: coverage?.cumulative ? coverage.cumulative.examinedBytes + coverage.cumulative.examinedRecords : cost?.bytesScanned ?? 0,
      recordsRead: coverage?.cumulative?.examinedRecords ?? cost?.recordsStaged ?? 0,
      remainingFiles: coverage?.remainingFiles ?? 0, safelyPrunedFiles: coverage?.safelyPrunedFiles ?? 0,
      malformedRecords: coverage?.malformedRecords ?? cost?.malformedRecords ?? 0, timestampGaps: coverage?.timestampGaps ?? 0,
      cacheHitsBefore, cacheHitsAfter, metadataCacheEntries: cacheHitsAfter,
      endToEndMs: performance.now() - started, cpuMs: (cpu.user + cpu.system) / 1000,
      rssStartBytes: rssStart, peakRssBytes: peakRss, peakTempDiskBytes: Math.max(peakObservedTempDisk, cost?.peakOwnedDiskBytes ?? 0),
      duckdbMemoryLimit: cost?.memoryLimit ?? "none", tempDiskCleanup: cleanup, cost: cost ?? null };
  } finally {
    if (polling) clearInterval(polling);
    clearInterval(rssPolling);
    setTemporaryStorageObserver(undefined);
  }
}

if (process.argv[2] === "--worker") {
  globalThis.fetch = async () => { throw new Error("Network disabled in analytics performance acceptance"); };
  const manifest = JSON.parse(await fs.readFile(process.argv[3], "utf8"));
  const workload = process.argv[4]; const sample = process.argv[5];
  const jiti = createJiti(import.meta.url);
  const result = await runWorkload(manifest, workload, sample, jiti);
  console.log(JSON.stringify(result));
} else {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "pi-analytics-t5-"));
  const all = [];
  try {
    const dependency = JSON.parse(await fs.readFile(path.join(root, "node_modules/@duckdb/node-api/package.json"), "utf8"));
    console.log(JSON.stringify({ acceptance: "query-driven-log-analytics/T5", runtime: process.version, duckdbNodeApi: dependency.version,
      platform: process.platform, arch: process.arch, os: os.release(), cpu: os.cpus()[0]?.model,
      matrix: { sizes: ["small (~10 MiB)", "large (>=600 MiB)"], workloads, samples: ["cold", "warm"], profiles: ["default", "legacy"] },
      bounds: { searchPageBytes: 8 * 1024 * 1024, searchPageRecords: 10_000, standardInputBytes: 512 * 1024 * 1024, largeMemory: "1GB", largeThreads: 2, largeDiskBudgetBytes: 4 * 1024 ** 3 },
      note: "Generated native JSONL only; expectations are computed by the generator; no private history, live model calls, or persistent transcript copy." }));
    for (const size of ["small", "large"]) {
      const manifest = await generateFixture(scratch, size);
      const manifestPath = path.join(scratch, `${size}-manifest.json`);
      await fs.writeFile(manifestPath, JSON.stringify(manifest));
      console.log(JSON.stringify({ fixture: size, targetBytes: manifest.targetBytes, actualBytes: manifest.actualBytes, files: manifest.files.length,
        records: manifest.expected.totalRecords, generatorExpected: manifest.expected, oneFileOverSearchPage: Math.max(...manifest.files.map(file => file.bytes)) > 8 * 1024 * 1024 }));
      const env = { ...process.env, PI_CODING_AGENT_DIR: path.join(scratch, "empty-profile") };
      for (const workload of workloads) {
        await clearFixtureCache(manifest.registry);
        const coldStart = performance.now();
        const cold = await promisify(execFile)(process.execPath, [script, "--worker", manifestPath, workload, "cold"], { env, cwd: scratch, timeout: 300_000, maxBuffer: 4_000_000 });
        const coldResult = { processWallMs: performance.now() - coldStart, ...JSON.parse(cold.stdout) };
        all.push(coldResult); console.log(JSON.stringify(coldResult));
        const warmStart = performance.now();
        const warm = await promisify(execFile)(process.execPath, [script, "--worker", manifestPath, workload, "warm"], { env, cwd: scratch, timeout: 300_000, maxBuffer: 4_000_000 });
        const warmResult = { processWallMs: performance.now() - warmStart, ...JSON.parse(warm.stdout) };
        all.push(warmResult); console.log(JSON.stringify(warmResult));
      }
    }
    assert.equal(all.length, 16);
    assert.ok(all.every(result => result.status === "ok"));
    assert.ok(all.some(result => result.size === "large" && result.selectedBytes > 600 * 1024 * 1024));
    console.log(JSON.stringify({ summary: { samples: all.length, correct: all.filter(result => result.status === "ok").length,
      failures: all.filter(result => result.status !== "ok"), cacheHits: all.map(result => ({ size: result.size, workload: result.workload, sample: result.sample, hits: result.cacheHitsBefore })),
      cleanup: all.every(result => result.tempDiskCleanup) } }));
  } finally { await fs.rm(scratch, { recursive: true, force: true }); }
}

// Finite synthetic check, not an engine-comparison or persistent-index benchmark.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createJiti } from "jiti";
const script = fileURLToPath(import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
const cases = ["metadata", "one-session-content", "default-errors", "combined-errors", "recent-events"];

async function measure(manifest, workload, mode, sample, jiti) {
  const start = performance.now();
  try {
    const { queryAnalytics, sessionAnalytics } = await jiti.import(path.join(root, "lib/log-analytics/api.ts"));
    if (workload === "metadata") {
      const discovery = performance.now();
      const result = await sessionAnalytics(manifest.registry, { profiles: ["default", "legacy"], maxRows: 1000 });
      assert.equal(result.sessions.length, manifest.files.length);
      assert.equal(result.truncated, false);
      return { workload, mode, sample, status: "ok", endToEndMs: performance.now() - start, discoveryMs: performance.now() - discovery,
        headerFiles: result.sessions.length, headerMaxBytesPerFile: 65536, stagedFiles: 0 };
    }
    const request = { operation: "query", sources: ["session_entries"], profiles: ["default", "legacy"], sql: "", maxRows: 100 };
    let expected;
    let selected = manifest.files;
    if (workload === "one-session-content") {
      selected = manifest.files.filter(file => file.profile === "default" && file.sessionId === "default-0");
      request.sessionRefs = [{ profile: "default", sessionId: "default-0" }];
      request.sql = "SELECT _record_key id FROM session_entries WHERE contains(record->'message'->'content'->0->>'text', $needle) ORDER BY _record_key LIMIT 10";
      request.parameters = { needle: "synthetic-needle" };
      expected = selected[0].contentIds.slice().sort().slice(0, 10).map(id => ({ id }));
    } else if (workload === "recent-events") {
      request.sql = "SELECT _profile, count(*)::INTEGER n FROM session_entries WHERE _timestamp >= $since::TIMESTAMPTZ GROUP BY _profile ORDER BY _profile";
      request.parameters = { since: "2026-09-01" };
      expected = ["default", "legacy"].map(profile => ({ _profile: profile, n: 10 }));
    } else {
      if (workload === "default-errors") { request.profiles = ["default"]; selected = manifest.files.filter(file => file.profile === "default"); }
      request.sql = "SELECT _profile, count(*)::INTEGER n FROM session_entries WHERE message_role = 'toolResult' AND is_error GROUP BY _profile ORDER BY _profile";
      expected = request.profiles.map(profile => ({ _profile: profile, n: selected.filter(file => file.profile === profile).reduce((sum, file) => sum + file.errors, 0) }));
    }
    const result = await queryAnalytics(manifest.registry, request);
    assert.deepEqual(result.rows, expected);
    assert.equal(result.truncated, false);
    assert.equal(result.cost.filesScanned, selected.length);
    assert.equal(result.cost.bytesScanned, selected.reduce((sum, file) => sum + file.bytes, 0));
    return { workload, mode, sample, status: "ok", endToEndMs: performance.now() - start, ...result.cost, rows: result.rows.length };
  } catch (error) {
    return { workload, mode, sample, status: error.name === "AssertionError" ? "incorrect" : /exceeded.*ms/.test(String(error)) ? "timeout" : "error", endToEndMs: performance.now() - start, error: String(error) };
  }
}

if (process.argv[2] === "--worker") {
  globalThis.fetch = async () => { throw new Error("Network disabled in analytics performance check"); };
  const manifest = JSON.parse(await fs.readFile(process.argv[3], "utf8"));
  const mode = process.argv[4];
  const selectedCases = mode === "cold" ? [process.argv[5]] : cases;
  const jiti = createJiti(import.meta.url);
  const samples = [];
  for (const workload of selectedCases) for (let sample = 1; sample <= (mode === "cold" ? 1 : 3); sample++) samples.push(await measure(manifest, workload, mode, sample, jiti));
  console.log(JSON.stringify(samples));
} else {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "pi-analytics-perf-"));
  try {
    const dependency = JSON.parse(await fs.readFile(path.join(root, "node_modules/@duckdb/node-api/package.json"), "utf8"));
    console.log(JSON.stringify({ runtime: process.version, duckdbNodeApi: dependency.version, platform: process.platform, arch: process.arch,
      os: os.release(), cpu: os.cpus()[0]?.model, totalMemoryBytes: os.totalmem(), freeMemoryBytes: os.freemem(),
      bounds: { timeoutMs: 5000, maxInputBytes: 536870912, threads: 2, memoryLimit: "1GB" },
      note: "Synthetic padded native records; OS file cache is not flushed. Cold means fresh process, repeated means same runtime with a fresh DuckDB instance per query. No private data." }));
    const all = [];
    for (const targetMiB of [10, 100]) {
      const base = path.join(scratch, String(targetMiB));
      const registry = { active: "default", roots: { default: path.join(base, "default"), legacy: path.join(base, "legacy") } };
      const files = [];
      const recordsPerFile = Math.floor(targetMiB * 1024 * 1024 / 20 / 4350);
      for (const profile of ["default", "legacy"]) {
        const sessions = path.join(registry.roots[profile], "sessions");
        await fs.mkdir(sessions, { recursive: true });
        for (let f = 0; f < 10; f++) {
          const sessionId = `${profile}-${f}`;
          const records = [JSON.stringify({ type: "session", version: 3, id: sessionId, cwd: "/synthetic", timestamp: "2020-01-01T00:00:00Z" })];
          const contentIds = [];
          let errors = 0;
          for (let n = 0; n < recordsPerFile; n++) {
            const id = `${sessionId}-${n}`;
            const needle = n % 97 === 0;
            const isError = n % 7 === 0;
            if (needle) contentIds.push(id);
            if (isError) errors++;
            records.push(JSON.stringify({ type: "message", id, timestamp: n === 0 ? "2026-09-01T00:00:00Z" : "2020-01-02T00:00:00Z",
              message: { role: "toolResult", toolName: "read", toolCallId: `call-${n}`, isError,
                content: [{ type: "text", text: `${needle ? "synthetic-needle" : "ordinary"} ${"x".repeat(4096)}` }] } }));
          }
          const text = records.join("\n") + "\n";
          await fs.writeFile(path.join(sessions, `${sessionId}.jsonl`), text);
          files.push({ profile, sessionId, bytes: Buffer.byteLength(text), errors, contentIds });
        }
      }
      const manifestPath = path.join(base, "manifest.json");
      const manifest = { registry, files };
      await fs.writeFile(manifestPath, JSON.stringify(manifest));
      console.log(JSON.stringify({ targetMiB, actualBytes: files.reduce((sum, file) => sum + file.bytes, 0), files: files.length, recordsPerFile, deterministicPattern: "v1; errors modulo 7, content modulo 97, one recent event per old session" }));
      const env = { ...process.env, PI_CODING_AGENT_DIR: path.join(scratch, "empty-profile") };
      for (const key of Object.keys(env)) if (key.startsWith("PI_ANALYTICS_")) delete env[key];
      for (const [mode, workload] of [...cases.map(workload => ["cold", workload]), ["repeated", "all"]]) {
        const started = performance.now();
        let samples;
        try {
          const { stdout } = await promisify(execFile)(process.execPath, [script, "--worker", manifestPath, mode, workload], { env, cwd: scratch, timeout: mode === "cold" ? 30_000 : 120_000, maxBuffer: 2_000_000 });
          samples = JSON.parse(stdout);
        } catch (error) {
          samples = (mode === "cold" ? [workload] : cases).flatMap(name => Array.from({ length: mode === "cold" ? 1 : 3 }, (_, index) => ({ workload: name, mode, sample: index + 1, status: "blocked", error: String(error) })));
        }
        const processWallMs = performance.now() - started;
        for (const sample of samples) {
          const result = { targetMiB, ...sample, ...(mode === "cold" ? { processWallMs } : {}) };
          all.push(result); console.log(JSON.stringify(result));
        }
      }
    }
    console.log(JSON.stringify({ summary: { samples: all.length, correct: all.filter(item => item.status === "ok").length, failures: all.filter(item => item.status !== "ok") } }));
    if (all.some(item => item.status !== "ok")) process.exitCode = 1;
  } finally { await fs.rm(scratch, { recursive: true, force: true }); }
}

// Installed Pi loader, synthetic profile roots, no credentials or live history.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
const root = fileURLToPath(new URL("..", import.meta.url));
const manifestPath = path.join(root, "node_modules/@earendil-works/pi-coding-agent/package.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const scratch = await mkdtemp(path.join(tmpdir(), "pi-analytics-loader-"));
try {
  const registry = { active: "default", roots: { default: path.join(scratch, "default"), legacy: path.join(scratch, "legacy") } };
  for (const [profile, dir] of Object.entries(registry.roots)) {
    await mkdir(path.join(dir, "sessions"), { recursive: true });
    await writeFile(path.join(dir, "sessions", "old.jsonl"), JSON.stringify({ type: "session", id: profile, cwd: "/fixture", timestamp: "2020-01-01T00:00:00Z" }) + "\n" + JSON.stringify({ type: "message", id: "recent", timestamp: "2026-09-01T00:00:00Z", message: { role: "user", content: "synthetic needle" } }) + "\n");
  }
  const marker = path.join(scratch, "result.json");
  const fixture = path.join(scratch, "loader.js");
  const extension = pathToFileURL(path.join(root, "extensions/log-analytics-tool.ts")).href;
  await writeFile(fixture, `
import { writeFileSync } from 'node:fs';
export default async function(pi) {
  try {
    globalThis.fetch = async () => { throw new Error('Network disabled'); };
    let tool;
    const wrapped = new Proxy(pi, { get(target, key) {
      if (key === 'registerTool') return spec => { tool = spec; target.registerTool(spec); };
      return target[key];
    }});
    const extension = await import(${JSON.stringify(extension)});
    extension.registerLogAnalytics(wrapped, async () => (${JSON.stringify(registry)}));
    const catalog = await tool.execute('catalog', { operation: 'catalog' });
    const sessions = await tool.execute('sessions', { operation: 'sessions', profiles: ['default', 'legacy'] });
    const query = await tool.execute('query', { operation: 'query', profiles: ['default', 'legacy'], sources: ['session_entries'], sql: "SELECT _profile, session_id, count(*) n FROM session_entries WHERE _timestamp >= $since::TIMESTAMPTZ GROUP BY ALL ORDER BY _profile", parameters: { since: '2026-09-01' } });
    writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ name: tool.name, catalog: catalog.details, sessions: sessions.details, query: query.details }));
  } catch (error) { writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ error: String(error), stack: error.stack })); }
}
`);
  const cli = path.resolve(path.dirname(manifestPath), manifest.bin.pi);
  const output = await promisify(execFile)(process.execPath, [cli, "--offline", "--no-session", "-e", fixture, "--list-models"], {
    cwd: scratch, env: { ...process.env, PI_CODING_AGENT_DIR: path.join(scratch, "empty-profile") }, timeout: 30_000, maxBuffer: 2_000_000,
  });
  let result;
  try { result = JSON.parse(await readFile(marker, "utf8")); }
  catch { throw new Error(`Loader did not complete: ${output.stdout}\n${output.stderr}`); }
  assert(!result.error, JSON.stringify(result));
  assert.equal(result.name, "log_analytics");
  assert.equal(result.catalog.sources.length, 3);
  assert.equal(result.sessions.sessions.length, 2);
  assert.deepEqual(result.query.rows, [{ _profile: "default", session_id: "default", n: "1" }, { _profile: "legacy", session_id: "legacy", n: "1" }]);
  assert.equal(result.query.cost.filesScanned, 2);
  console.log(`Pi ${manifest.version}: log_analytics catalog, metadata discovery, and combined query passed through the real loader offline (${process.platform}/${process.arch}).`);
} finally { await rm(scratch, { recursive: true, force: true }); }

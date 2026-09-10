// Installed Pi loader, generated native fixtures, no credentials or live history.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { generateFixture } from "./log-analytics-fixture.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const manifestPath = path.join(root, "node_modules/@earendil-works/pi-coding-agent/package.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const scratch = await mkdtemp(path.join(tmpdir(), "pi-analytics-loader-"));
try {
  const fixture = await generateFixture(scratch, "small");
  const marker = path.join(scratch, "result.json");
  const driver = path.join(scratch, "loader.js");
  const extension = pathToFileURL(path.join(root, "extensions/log-analytics-tool.ts")).href;
  await writeFile(driver, `
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
    extension.registerLogAnalytics(wrapped, async () => (${JSON.stringify(fixture.registry)}));
    const catalog = await tool.execute('catalog', { operation: 'catalog' });
    const sessions = await tool.execute('sessions', { operation: 'sessions', profiles: ['default', 'legacy'], maxRows: 100 });
    const target = await tool.execute('target', { operation: 'search', profiles: ['default', 'legacy'], sessionRefs: [{ profile: 'default', sessionId: 'fixture-00' }], filters: { text: 'early-target' }, maxResults: 1 });
    let failures = await tool.execute('failures', { operation: 'search', profiles: ['default', 'legacy'], interval: { since: '2026-09-01T00:00:00Z', until: '2026-09-08T00:00:00Z' }, filters: { messageRoles: ['toolResult'], isError: true }, maxResults: 100 });
    const failureMatches = [...failures.details.matches];
    while (failures.details.nextCursor) {
      failures = await tool.execute('failures-page', { operation: 'search', profiles: ['default', 'legacy'], interval: { since: '2026-09-01T00:00:00Z', until: '2026-09-08T00:00:00Z' }, filters: { messageRoles: ['toolResult'], isError: true }, maxResults: 100, cursor: failures.details.nextCursor });
      failureMatches.push(...failures.details.matches);
    }
    const failureDetails = { ...failures.details, matches: failureMatches };
    const follow = await tool.execute('follow', { operation: 'follow_up', occurrence: failureMatches[0].occurrence, before: 1, after: 1 });
    const large = await tool.execute('large', { operation: 'query', profiles: ['default', 'legacy'], sources: ['session_entries'], execution: 'large', sql: 'SELECT count(*) n FROM session_entries', maxRows: 10 });
    writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ name: tool.name, catalog: catalog.details, sessions: sessions.details, target: target.details, failures: failureDetails, follow: follow.details, large: large.details }));
  } catch (error) { writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ error: String(error), stack: error.stack })); }
}
`);
  const cli = path.resolve(path.dirname(manifestPath), manifest.bin.pi);
  const output = await promisify(execFile)(process.execPath, [cli, "--offline", "--no-session", "-e", driver, "--list-models"], {
    cwd: scratch, env: { ...process.env, PI_CODING_AGENT_DIR: path.join(scratch, "empty-profile") }, timeout: 60_000, maxBuffer: 2_000_000,
  });
  let result;
  try { result = JSON.parse(await readFile(marker, "utf8")); }
  catch { throw new Error(`Loader did not complete: ${output.stdout}\n${output.stderr}`); }
  assert(!result.error, JSON.stringify(result));
  assert.equal(result.name, "log_analytics");
  assert.equal(result.catalog.sources.length, 3);
  assert.equal(result.sessions.sessions.length, fixture.files.length);
  assert.equal(result.target.matches.length, 1);
  assert.equal(result.target.coverage.selectedFiles, 1);
  assert.equal(result.target.complete, false);
  assert.equal(result.failures.matches.length, fixture.expected.failures);
  assert.equal(result.failures.complete, true);
  assert.equal(result.failures.matches.every(match => match.messageRole === "toolResult" && match.isError === true), true);
  assert.equal(result.follow.before.length, 1);
  assert.equal(result.follow.after.length, 1);
  assert.equal(Number(result.large.rows[0].n), fixture.expected.totalRecords);
  assert.equal(result.large.cost.execution, "large");
  console.log(`Pi ${manifest.version}: generated native-record catalog, targeted search, failure follow-up, and large SQL passed through the real loader offline (${process.platform}/${process.arch}); ${fixture.actualBytes} bytes across both profiles.`);
} finally { await rm(scratch, { recursive: true, force: true }); }

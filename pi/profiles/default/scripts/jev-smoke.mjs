// Real installed-Pi registration, without a session, credentials, or network.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
const root = fileURLToPath(new URL("..", import.meta.url));
const manifestPath = path.join(root, "node_modules/@earendil-works/pi-coding-agent/package.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const scratch = await mkdtemp(path.join(tmpdir(), "pi-jev-loader-"));
try {
  const marker = path.join(scratch, "loaded.json"), fixture = path.join(scratch, "fixture.js");
  await writeFile(fixture, `
import { writeFileSync } from 'node:fs';
export default async function(pi) {
  const tools = [], hooks = [];
  const wrapped = new Proxy(pi, { get(target, key) {
    if (key === 'registerTool') return spec => { tools.push(spec.name); target.registerTool(spec); };
    if (key === 'on') return (event, handler) => { hooks.push(event); target.on(event, handler); };
    return target[key];
  }});
  try {
    globalThis.fetch = async () => { throw new Error('Network disabled in Jev loader smoke'); };
    await (await import(${JSON.stringify(pathToFileURL(path.join(root, "extensions/jev.ts")).href)})).default(wrapped);
    writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ tools, hooks }));
  } catch (error) { writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ error: String(error), stack: error.stack })); }
}
`);
  const env = { ...process.env, PI_CODING_AGENT_DIR: path.join(scratch, "empty-profile") };
  delete env.JEV_API_KEY; delete env.BITWARDEN_ACCESS_KEY;
  const cli = path.resolve(path.dirname(manifestPath), manifest.bin.pi);
  await promisify(execFile)(process.execPath, [cli, "--offline", "--no-session", "-e", fixture, "--list-models"], { cwd: scratch, env, timeout: 20_000, maxBuffer: 2_000_000 });
  const result = JSON.parse(await readFile(marker, "utf8"));
  assert(!result.error, JSON.stringify(result));
  assert.deepEqual(result.tools, ["jev_evaluate"]);
  assert.deepEqual(result.hooks, []);
  console.log(`Pi ${manifest.version}: Jev tool registered through the default loader (offline).`);
} finally { await rm(scratch, { recursive: true, force: true }); }

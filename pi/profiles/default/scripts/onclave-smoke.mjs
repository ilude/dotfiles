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
const scratch = await mkdtemp(path.join(tmpdir(), "pi-onclave-loader-"));
try {
  const marker = path.join(scratch, "loaded.json"), fixture = path.join(scratch, "fixture.js");
  await writeFile(fixture, `
import { writeFileSync } from 'node:fs';
export default async function(pi) {
  const tools = [], commands = [], hooks = [];
  const wrapped = new Proxy(pi, { get(target, key) {
    if (key === 'registerTool') return spec => { tools.push({ name: spec.name, guidance: spec.promptGuidelines }); target.registerTool(spec); };
    if (key === 'registerCommand') return (name, spec) => { commands.push(name); target.registerCommand(name, spec); };
    if (key === 'on') return (event, handler) => { hooks.push(event); target.on(event, handler); };
    return target[key];
  }});
  try {
    globalThis.fetch = async () => { throw new Error('Network disabled in Onclave loader smoke'); };
    await (await import(${JSON.stringify(pathToFileURL(path.join(root, "extensions/onclave-pi.ts")).href)})).default(wrapped);
    writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ tools, commands, hooks }));
  } catch (error) { writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ error: String(error), stack: error.stack })); }
}
`);
  const env = { ...process.env, PI_CODING_AGENT_DIR: path.join(scratch, "empty-profile") };
  delete env.PI_SUBAGENT_RUN_ID; delete env.PI_SUBAGENT_TREE_RUN_ID;
  delete env.BITWARDEN_ACCESS_KEY; delete env.ONCLAVE_API_BASE;
  const cli = path.resolve(path.dirname(manifestPath), manifest.bin.pi);
  const output = await promisify(execFile)(process.execPath, [cli, "--offline", "--no-session", "-e", fixture, "--list-models"], {
    cwd: scratch, env, timeout: 20_000, maxBuffer: 2_000_000,
  });
  let result;
  try { result = JSON.parse(await readFile(marker, "utf8")); }
  catch { throw new Error(`Loader did not finish: ${output.stdout}\n${output.stderr}`); }
  assert(!result.error, JSON.stringify(result));
  assert.deepEqual(result.tools.map(tool => tool.name).sort(), ["onclave_instances", "onclave_message"]);
  assert.deepEqual(result.commands, ["onclave"]);
  assert(result.hooks.includes("agent_settled"));
  assert(result.hooks.includes("session_shutdown"));
  assert(result.tools.every(tool => tool.guidance.some(line => line.includes("orchestrator"))));
  console.log(`Pi ${manifest.version}: shared Onclave adapter registered through the default loader (offline).`);
} finally { await rm(scratch, { recursive: true, force: true }); }

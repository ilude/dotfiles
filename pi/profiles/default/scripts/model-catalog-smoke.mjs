// Load model refresh and visibility through the installed Pi CLI without credentials or network calls.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const root = fileURLToPath(new URL("..", import.meta.url));
const manifestPath = path.join(root, "node_modules/@earendil-works/pi-coding-agent/package.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const scratch = await mkdtemp(path.join(tmpdir(), "pi-model-catalog-loader-"));
try {
	const profile = path.join(scratch, "profile");
	await mkdir(profile, { recursive: true });
	await writeFile(path.join(profile, "settings.json"), "{}\n");
	const marker = path.join(scratch, "loaded.json");
	const fixture = path.join(scratch, "fixture.js");
	const extensions = ["refresh-models", "model-visibility"];
	await writeFile(fixture, `
import { writeFileSync } from 'node:fs';
export default async function(pi) {
  const commands = [], hooks = [];
  const wrapped = new Proxy(pi, { get(target, key) {
    if (key === 'registerCommand') return (name, spec) => { commands.push(name); target.registerCommand(name, spec); };
    if (key === 'on') return (event, handler) => { hooks.push(event); target.on(event, handler); };
    return target[key];
  }});
  try {
    globalThis.fetch = async () => { throw new Error('Network disabled in loader fixture'); };
    for (const url of ${JSON.stringify(extensions.map((name) => pathToFileURL(path.join(root, `extensions/${name}.ts`)).href))}) {
      (await import(url)).default(wrapped);
    }
    writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ commands, hooks }));
  } catch (error) { writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ error: String(error), stack: error.stack })); }
}
`);
	const cli = path.resolve(path.dirname(manifestPath), manifest.bin.pi);
	const output = await promisify(execFile)(process.execPath, [cli, "--offline", "--no-session", "-e", fixture, "--list-models"], {
		cwd: scratch,
		env: { ...process.env, PI_CODING_AGENT_DIR: profile },
		timeout: 20_000,
		maxBuffer: 2_000_000,
	});
	let result;
	try { result = JSON.parse(await readFile(marker, "utf8")); }
	catch { throw new Error(`Loader did not complete: ${output.stdout}\n${output.stderr}`); }
	assert(!result.error, JSON.stringify(result));
	assert.deepEqual(result.commands, ["refresh-models"]);
	assert(result.hooks.includes("session_start"));
	console.log(`Pi ${manifest.version}: model refresh and visibility registered through the real loader (offline).`);
} finally {
	await rm(scratch, { recursive: true, force: true });
}

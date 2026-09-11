import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import path from "node:path";
import * as TreeSitter from "web-tree-sitter";

const require = createRequire(import.meta.url);
const fixtures = {
  bash: "echo ok",
  powershell: "Write-Output ok",
  python: 'print("ok")',
  javascript: 'console.log("ok")',
  typescript: 'const value: string = "ok"',
};

const { loadPolicy } = await import("../lib/damage-control/policy.ts");
const { policy, settings } = await loadPolicy(fileURLToPath(new URL("..", import.meta.url)));
console.log(`Policy v${policy.version}: ${policy.commands.length} rules; judge ${settings.judge.provider}/${settings.judge.model}`);

const initStart = performance.now();
await TreeSitter.Parser.init();
console.log(`Tree-sitter initialization: ${(performance.now() - initStart).toFixed(1)}ms (outside the per-parse budget)`);
for (const [language, source] of Object.entries(fixtures)) {
  const packageName = `tree-sitter-${language}`;
  const wasm = path.join(path.dirname(require.resolve(`${packageName}/package.json`)), `${packageName}.wasm`);
  const loadStart = performance.now();
  const grammar = await TreeSitter.Language.load(wasm);
  const loadMs = performance.now() - loadStart;
  const parser = new TreeSitter.Parser();
  parser.setLanguage(grammar);
  let tree;
  let parseMs;
  let warmMs;
  try {
    const parseStart = performance.now();
    tree = parser.parse(source);
    parseMs = performance.now() - parseStart;
    assert(tree && !tree.rootNode.hasError, `${language} grammar failed its parse fixture`);
    tree.delete(); tree = undefined;
    const warmStart = performance.now();
    tree = parser.parse(source);
    warmMs = performance.now() - warmStart;
    assert(tree && !tree.rootNode.hasError, `${language} warm parse failed`);
  } finally {
    tree?.delete();
    parser.delete();
  }
  console.log(`${language}: load ${loadMs.toFixed(1)}ms, first parse ${parseMs.toFixed(2)}ms, warm ${warmMs.toFixed(2)}ms; ${wasm}`);
}

// Resolve the supported CLI from package metadata rather than an internal module path.
// The child has an empty profile/cwd; no credentials or project resources are copied.
const manifestPath = fileURLToPath(new URL("../node_modules/@earendil-works/pi-coding-agent/package.json", import.meta.url));
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const cli = path.resolve(path.dirname(manifestPath), manifest.bin.pi);
const scratch = await mkdtemp(path.join(tmpdir(), "pi-dc-loader-"));
try {
  const extension = path.join(scratch, "fixture.js");
  const marker = path.join(scratch, "loaded.json");
  await writeFile(extension, `
import {writeFileSync} from 'node:fs';
import {createBashTool, createPowerShellTool, createReadTool, createWriteTool, createEditTool, createGrepTool, createFindTool, createLsTool} from '@earendil-works/pi-coding-agent';
export default async function(pi) {
 try {
  globalThis.fetch = async () => { throw new Error('Network disabled in readiness fixture'); };
  const tools = [createBashTool, createPowerShellTool, createReadTool, createWriteTool, createEditTool, createGrepTool, createFindTool, createLsTool].map(f => { const t=f(${JSON.stringify(scratch)}); return {name:t.name, schema:t.parameters}; });
  pi.on('tool_call', () => ({block:true, reason:'Inert loader fixture'}));
  pi.registerCommand('fixture', {handler(){}});
  const {default: bootstrap} = await import(${JSON.stringify(pathToFileURL(fileURLToPath(new URL("../extensions/damage-control/index.js", import.meta.url))).href)});
  let guard;
  const wrapped = new Proxy(pi, { get(target, key) {
    if (key === 'getAllTools') return () => tools.map(t => ({name:t.name, parameters:t.schema, sourceInfo:{source:'builtin'}}));
    if (key === 'on') return (event, handler) => { if (event === 'tool_call') guard = handler; return target.on(event, handler); };
    if (key === 'registerCommand') return (name, command) => target.registerCommand(name, command);
    return target[key];
  }});
  await bootstrap(wrapped);
  const ctx = {cwd:${JSON.stringify(scratch)}, hasUI:true, mode:'tui', signal:undefined, modelRegistry:{find:()=>undefined}, ui:{notify(){},setStatus(){},select:async()=> 'Deny',theme:{fg:(_c,t)=>t}}};
  const denied = await guard({toolName:'bash', toolCallId:'synthetic', input:{command:'rm -rf /'}},ctx);
  if (!denied?.block) throw new Error('Registered safety guard did not reject a legacy hard block');
  writeFileSync(${JSON.stringify(marker)}, JSON.stringify(tools));
 } catch(error) { writeFileSync(${JSON.stringify(marker)}, JSON.stringify({error:String(error),stack:error?.stack})); }
}
`);
  const childOutput = await promisify(execFile)(process.execPath, [cli, "--offline", "--no-session", "-e", extension, "--list-models"], {
    cwd: scratch,
    env: { ...process.env, PI_CODING_AGENT_DIR: path.join(scratch, "profile") },
    timeout: 20_000,
    maxBuffer: 2_000_000,
  });
  let markerText;
  try { markerText = await readFile(marker, "utf8"); }
  catch { throw new Error(`Supported-loader fixture did not complete:\n${childOutput.stdout}\n${childOutput.stderr}`); }
  const tools = JSON.parse(markerText);
  assert(Array.isArray(tools), JSON.stringify(tools));
  assert.deepEqual(tools.map(t => t.name), ["bash", "powershell", "read", "write", "edit", "grep", "find", "ls"]);
  const edit = tools.find(t => t.name === "edit").schema;
  assert.deepEqual(edit.properties.edits.items.required.sort(), ["newText", "oldText"]);
  assert.equal(tools.find(t => t.name === "powershell").schema.properties.command.type, "string");
  console.log(`Pi ${manifest.version}: supported loader, actual bootstrap guard, policy, grammars, and eight native schemas ready (no tool execution/model call)`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}

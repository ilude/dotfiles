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
const scratch = await mkdtemp(path.join(tmpdir(), "pi-bedrock-loader-"));
try {
  const marker = path.join(scratch, "loaded.json"), fixture = path.join(scratch, "fixture.js");
  await writeFile(fixture, `
import { writeFileSync } from 'node:fs';
export default async function(pi) {
 const commands=[], providers=[], hooks=[]; const wrapped=new Proxy(pi,{get(t,k){
  if(k==='registerCommand') return (n,s)=>{commands.push(n);t.registerCommand(n,s)};
  if(k==='registerProvider') return p=>{providers.push(p.id);t.registerProvider(p)};
  if(k==='on') return (n,h)=>{hooks.push(n);t.on(n,h)}; return t[k]; }});
 try { globalThis.fetch=async()=>{throw new Error('network disabled')}; (await import(${JSON.stringify(pathToFileURL(path.join(root,"extensions/bedrock/index.ts")).href)})).default(wrapped); writeFileSync(${JSON.stringify(marker)},JSON.stringify({commands,providers,hooks})); }
 catch(error){writeFileSync(${JSON.stringify(marker)},JSON.stringify({error:String(error),stack:error.stack}))}
}`);
  const cli = path.resolve(path.dirname(manifestPath), manifest.bin.pi);
  await promisify(execFile)(process.execPath, [cli, "--offline", "--no-session", "-e", fixture, "--list-models"], { cwd: scratch, env: { ...process.env, PI_CODING_AGENT_DIR: path.join(scratch,"profile") }, timeout: 20000, maxBuffer: 2000000 });
  const result=JSON.parse(await readFile(marker,"utf8")); assert(!result.error,JSON.stringify(result)); assert.deepEqual(result.commands,["bedrock"]); assert.deepEqual(result.providers,["bedrock-mantle"]); assert(result.hooks.includes("message_end")); console.log(`Pi ${manifest.version}: Bedrock provider, command and accounting lifecycle loaded offline.`);
} finally { await rm(scratch,{recursive:true,force:true}); }

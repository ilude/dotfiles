import { expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const profile = resolve(dirname(fileURLToPath(import.meta.url)), "..");
it("keeps the registered owner across active chat switches and replaces it after one source reload without replay", async () => {
  const scratch = mkdtempSync(join(tmpdir(), "subagent-session-"));
  const stage = join(scratch, "stage.json"), release = join(scratch, "release"), fixture = join(scratch, "fixture.mjs");
  const manifestPath = join(profile, "node_modules/@earendil-works/pi-coding-agent/package.json");
  const cli = resolve(dirname(manifestPath), JSON.parse(readFileSync(manifestPath, "utf8")).bin.pi);
  // One loader graph is essential: a separately loaded runtime import observes an
  // unbound owner, not the instance captured by production registered tools.
  const source = `
import {writeFileSync} from 'node:fs';
import {createAssistantMessageEventStream} from '@earendil-works/pi-ai';
import subagents from ${JSON.stringify(join(profile, "extensions/subagents.ts"))};
import {getSubagentRuntime} from ${JSON.stringify(join(profile, "lib/subagents/runtime.ts"))};
const implementation = 'before-source-reload';
const state = globalThis[Symbol.for('subagent.session.test')] ??= {acks:[]};
export default function(pi) {
 const tools = new Map();
 subagents(new Proxy(pi, {get(target,key) {
  if(key === 'registerTool') return tool => {tools.set(tool.name,tool);target.registerTool(tool)};
  const value=Reflect.get(target,key);return typeof value === 'function' ? value.bind(target) : value;
 }}));
 const invoke = async (name,args,ctx) => {
  const result=await tools.get(name).execute('fixture-call',args,undefined,undefined,ctx);
  if(result.isError) throw new Error(JSON.stringify(result.details));
  return result.details;
 };
 const args = {agent:'explorer',instructions:${JSON.stringify(`WAIT_FILE:${release}`)},cwd:${JSON.stringify(scratch)},model:'subagent-fixture/inert',effort:'low',skills:[],background:true,retain:false,surface:'headless'};
 const save=(phase,ctx,extra={})=>writeFileSync(${JSON.stringify(stage)},JSON.stringify({phase,implementation,profile:process.env.PI_CODING_AGENT_DIR,source:${JSON.stringify(join(profile, "extensions/subagents.ts"))},origin:state.origin,id:ctx.sessionManager.getSessionId(),owner:getSubagentRuntime().ownerId,records:getSubagentRuntime().list(),entries:ctx.sessionManager.getEntries(),acks:state.acks,...extra}));
 globalThis.fetch=async()=>{throw new Error('Network disabled in session fixture')};
 pi.registerProvider('subagent-fixture',{baseUrl:'http://invalid.test',apiKey:'inert-fixture',api:'subagent-fixture',models:[{id:'inert',name:'inert',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:32000,maxTokens:100}],streamSimple(model){const stream=createAssistantMessageEventStream();queueMicrotask(()=>{stream.push({type:'done',reason:'stop',message:{role:'assistant',content:[{type:'text',text:'fixture reply'}],api:model.api,provider:model.provider,model:model.id,usage:{input:1,output:1,cacheRead:0,cacheWrite:0,totalTokens:2,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:'stop',timestamp:Date.now()}});stream.end()});return stream}});
 pi.on('agent_settled',(_event,ctx)=>{if(!state.origin)save('journal',ctx)});
 pi.on('message_end',(event)=>{const m=event.message;if(m.role==='custom'&&m.customType==='subagent-result')state.acks.push(m.details.deliveryId)});
 pi.on('session_start',(_e,ctx)=>{if(state.nextPhase){const phase=state.nextPhase;state.nextPhase=undefined;save(phase,ctx)}});
 pi.registerCommand('probe',{handler:async(action,ctx)=>{
  if(action==='seed') {state.origin=ctx.sessionManager.getSessionId();state.file=ctx.sessionManager.getSessionFile();}
  if(action==='launch') {state.oldTool=tools.get('subagent');state.first=await invoke('subagent',args,ctx);}
  if(action==='new') {state.nextPhase='new';await ctx.newSession();return;}
  if(action==='resume') {state.nextPhase='resume';await ctx.switchSession(state.file);return;}
  if(action==='release') {writeFileSync(${JSON.stringify(release)},'ready');}
  if(action==='inspect') {await invoke('subagent_control',{action:'inspect'},ctx);}
  if(action==='reload') {state.nextPhase='reload';await ctx.reload();return;}
  if(action==='next') {
   const stale=await state.oldTool.execute('stale-call',args,undefined,undefined,ctx);
   const next=await invoke('subagent',{...args,background:false},ctx);
   save(action,ctx,{stale,next});return;
  }
  if(action==='cleanup') await getSubagentRuntime().shutdown('quit');
  save(action,ctx);
 }});
}
`;
  writeFileSync(fixture, source);
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("PI_SUBAGENT_") || key.startsWith("HERDR_")) delete env[key];
  Object.assign(env, { PI_CODING_AGENT_DIR: profile, PI_SUBAGENT_BIN: process.execPath,
    PI_SUBAGENT_BIN_ARGS: JSON.stringify([join(profile, "tests/fixtures/fake-subagent-rpc.mjs")]) });
  const child = spawn(process.execPath, [cli, "--mode", "rpc", "--offline", "--no-extensions", "--no-skills", "--no-context-files", "--session", join(scratch, "origin.jsonl"), "--model", "subagent-fixture/inert", "-e", fixture],
    { cwd: scratch, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  const closed = new Promise<void>(done => child.once("close", () => done()));
  let diagnostics = "";
  child.stdout.on("data", chunk => diagnostics = (diagnostics + chunk).slice(-12000));
  child.stderr.on("data", chunk => diagnostics = (diagnostics + chunk).slice(-12000));
  const snapshot = () => existsSync(stage) ? JSON.parse(readFileSync(stage, "utf8")) : undefined;
  const command = async (action: string) => {
    rmSync(stage, { force: true });
    child.stdin.write(JSON.stringify({ type: "prompt", message: `/probe ${action}` }) + "\n");
    await vi.waitFor(() => expect(snapshot()?.phase, diagnostics).toBe(action), { timeout: 15_000, interval: 50 });
    return snapshot();
  };
  const outcomes = (value: any) => value.entries.filter((entry: any) => entry.type === "custom_message" && entry.customType === "subagent-result");
  try {
    child.stdin.write(JSON.stringify({ type: "prompt", message: "Seed the originating journal." }) + "\n");
    await vi.waitFor(() => expect(snapshot()?.phase, diagnostics).toBe("journal"), { timeout: 15_000, interval: 50 });
    await command("seed");
    const first = await command("launch");
    expect(first.records).toHaveLength(1);
    expect(first.records[0].status).not.toBe("settled");
    expect(first.profile).toBe(profile);
    expect(first.source).toBe(join(profile, "extensions/subagents.ts"));
    const switched = await command("new");
    expect(switched.id).not.toBe(first.origin);
    expect(switched.owner).toBe(first.owner);
    expect(switched.records[0].status).not.toBe("settled");
    const resumed = await command("resume");
    expect(resumed.id).toBe(first.origin);
    expect(resumed.owner).toBe(first.owner);
    expect(resumed.records[0].status).not.toBe("settled");
    await command("new");
    await command("release");
    let away: any;
    await vi.waitFor(async () => {
      away = await command("inspect");
      expect(away.records[0]).toMatchObject({ status: "settled", processState: "exited", origin: first.origin });
    }, { timeout: 15_000, interval: 100 });
    expect(outcomes(away)).toHaveLength(0);
    expect(away.acks).toHaveLength(0);
    await command("resume");
    let acknowledged: any;
    await vi.waitFor(async () => {
      acknowledged = await command("inspect");
      expect(outcomes(acknowledged), JSON.stringify(acknowledged)).toHaveLength(1);
      expect(acknowledged.acks).toHaveLength(1);
    }, { timeout: 15_000, interval: 100 });
    expect(outcomes(acknowledged)[0].details.origin).toBe(first.origin);
    expect(outcomes(acknowledged)[0].details.deliveryId).toBe(acknowledged.acks[0]);
    writeFileSync(fixture, source.replace("before-source-reload", "after-source-reload"));
    const reloaded = await command("reload");
    expect(reloaded.owner).not.toBe(first.owner);
    expect(reloaded.implementation).toBe("after-source-reload");
    expect(first.implementation).toBe("before-source-reload");
    expect(reloaded.records).toHaveLength(0);
    const next = await command("next");
    expect(next.stale).toMatchObject({ isError: true, details: { error: "Subagent runtime is no longer active" } });
    expect(next.owner).toBe(reloaded.owner);
    expect(next.next).toMatchObject({ status: "settled", outcome: "complete", processState: "exited", origin: first.origin });
    expect(next.next.displayName).toBeTruthy();
    expect(next.next.displayName).not.toBe(first.records[0].displayName);
    expect(outcomes(next)).toHaveLength(1);
    expect(next.acks).toEqual(acknowledged.acks);
  } finally {
    try { if (child.exitCode === null) await command("cleanup"); }
    finally { if (child.exitCode === null) child.kill(); await closed; rmSync(scratch, { recursive: true, force: true }); }
  }
}, 90_000);

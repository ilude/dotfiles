import { expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
const profile=resolve(dirname(fileURLToPath(import.meta.url)),"..");
it("survives actual Pi reload and chat switches, delivering once to the originating journal",async()=>{
 const scratch=mkdtempSync(join(tmpdir(),"subagent-session-"));
 const stage=join(scratch,"stage.json"),release=join(scratch,"release"),fixture=join(scratch,"fixture.mjs");
 const manifestPath=join(profile,"node_modules/@earendil-works/pi-coding-agent/package.json");
 const cli=resolve(dirname(manifestPath),JSON.parse(readFileSync(manifestPath,"utf8")).bin.pi);
 writeFileSync(fixture,`
import {writeFileSync} from 'node:fs';
import {createAssistantMessageEventStream} from '@earendil-works/pi-ai';
import {getSubagentRuntime} from ${JSON.stringify(join(profile,"lib/subagents/runtime.ts"))};
const state=globalThis[Symbol.for('subagent.session.test')]??={};
const save=(phase,ctx)=>writeFileSync(${JSON.stringify(stage)},JSON.stringify({phase,origin:state.origin,id:ctx.sessionManager.getSessionId(),records:getSubagentRuntime().list(),entries:ctx.sessionManager.getEntries()}));
export default function(pi){
 globalThis.fetch=async()=>{throw new Error('Network disabled in session fixture')};
 pi.registerProvider('subagent-fixture',{baseUrl:'http://invalid.test',apiKey:'inert-fixture',api:'subagent-fixture',models:[{id:'inert',name:'inert',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:32000,maxTokens:100}],streamSimple(model){const stream=createAssistantMessageEventStream();queueMicrotask(()=>{stream.push({type:'done',reason:'stop',message:{role:'assistant',content:[{type:'text',text:'fixture reply'}],api:model.api,provider:model.provider,model:model.id,usage:{input:1,output:1,cacheRead:0,cacheWrite:0,totalTokens:2,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:'stop',timestamp:Date.now()}});stream.end()});return stream}});
 pi.on('agent_settled',(_e,ctx)=>save('settled',ctx));
 pi.on('session_start',(_e,ctx)=>{if(state.nextPhase){const phase=state.nextPhase;state.nextPhase=undefined;save(phase,ctx)}});
 pi.registerCommand('launch-switch',{handler:async(_args,ctx)=>{
  state.origin=ctx.sessionManager.getSessionId();state.file=ctx.sessionManager.getSessionFile();
  const definition={name:'probe',description:'probe',tools:[],delegates:[],skills:[],prompt:'probe',source:'profile',filePath:'probe.md'};
  await getSubagentRuntime().launch({definition,instructions:${JSON.stringify(`WAIT_FILE:${release}`)},cwd:${JSON.stringify(scratch)},model:'subagent-fixture/inert',effort:'low',skills:[],origin:state.origin,retained:false,surface:'headless'},${JSON.stringify(profile)},${JSON.stringify(join(profile,"extensions/subagent-child.ts"))},true);
  state.nextPhase='switched';await ctx.newSession();
 }});
 pi.registerCommand('reload-probe',{handler:async(_args,ctx)=>{state.nextPhase='reloaded';await ctx.reload()}});
 pi.registerCommand('release-probe',{handler:async(_args,ctx)=>{writeFileSync(${JSON.stringify(release)},'ready');save('released',ctx)}});
 pi.registerCommand('inspect-probe',{handler:async(_args,ctx)=>save('inspected',ctx)});
 pi.registerCommand('return-probe',{handler:async(_args,ctx)=>{state.nextPhase='returned';await ctx.switchSession(state.file)}});
 pi.registerCommand('cleanup-probe',{handler:async(_args,ctx)=>{await getSubagentRuntime().shutdown('quit');save('cleaned',ctx)}});
}
 `);
 const child=spawn(process.execPath,[cli,"--mode","rpc","--offline","--no-extensions","--no-skills","--no-context-files","--session",join(scratch,"origin.jsonl"),"--model","subagent-fixture/inert","-e",join(profile,"extensions/subagents.ts"),"-e",fixture],{cwd:scratch,env:{...process.env,PI_CODING_AGENT_DIR:profile,PI_SUBAGENT_BIN:process.execPath,PI_SUBAGENT_BIN_ARGS:JSON.stringify([join(profile,"tests/fixtures/fake-subagent-rpc.mjs")])},stdio:["pipe","pipe","pipe"],windowsHide:true});
 const closed=new Promise<void>(done=>child.once("close",()=>done()));
 let diagnostics="";child.stdout.on("data",chunk=>diagnostics=(diagnostics+chunk).slice(-12000));child.stderr.on("data",chunk=>diagnostics=(diagnostics+chunk).slice(-12000));
 const snapshot=()=>existsSync(stage)?JSON.parse(readFileSync(stage,"utf8")):undefined;
 const send=(message:string)=>child.stdin.write(JSON.stringify({type:"prompt",message})+"\n");
 const wait=async(phase:string)=>{await vi.waitFor(()=>expect(snapshot()?.phase,diagnostics).toBe(phase),{timeout:15_000,interval:50});return snapshot()};
 try{
  send("seed the originating journal");await wait("settled");
  send("/launch-switch");const switched=await wait("switched");expect(switched.id).not.toBe(switched.origin);expect(switched.records[0].status).toBe("running");
  send("/reload-probe");await wait("reloaded");
  send("/release-probe");await wait("released");
  await vi.waitFor(async()=>{send("/inspect-probe");await wait("inspected");expect(snapshot().records[0].status).toBe("settled")},{timeout:10_000,interval:100});
  const other=snapshot();expect(other.entries.filter((e:any)=>e.customType==="subagent-result")).toHaveLength(0);
  send("/return-probe");
  await vi.waitFor(()=>{const value=snapshot();expect(value.id).toBe(value.origin);expect(value.entries.filter((e:any)=>e.customType==="subagent-result")).toHaveLength(1)},{timeout:15_000,interval:50});
  send("/reload-probe");await wait("reloaded");
  send("/inspect-probe");const origin=await wait("inspected");expect(origin.entries.filter((e:any)=>e.customType==="subagent-result")).toHaveLength(1);
 }finally{
  if(child.exitCode===null){send("/cleanup-probe");await wait("cleaned").finally(()=>child.kill())}
  await closed;rmSync(scratch,{recursive:true,force:true});
 }
},75_000);

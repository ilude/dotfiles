import { afterEach, expect, it, vi } from "vitest";
import { dirname, join } from "node:path";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { VisibleChild } from "../lib/subagents/visible.ts";
import { fileURLToPath } from "node:url";
import { SubagentRuntime, type Delivery } from "../lib/subagents/runtime.ts";
import type { AgentDefinition } from "../lib/subagents/definitions.ts";
const profile=join(dirname(fileURLToPath(import.meta.url)),"..");
const previousBin=process.env.PI_SUBAGENT_BIN,previousArgs=process.env.PI_SUBAGENT_BIN_ARGS;
const owners:SubagentRuntime[]=[];
afterEach(async()=>{
 for(const owner of owners.splice(0)){
  await owner.shutdown("quit");
  for(const record of owner.list())if(record.sessionFile)rmSync(dirname(record.sessionFile),{recursive:true,force:true});
 }
 for(const [key,value] of [["PI_SUBAGENT_BIN",previousBin],["PI_SUBAGENT_BIN_ARGS",previousArgs]])if(value===undefined)delete process.env[key!];else process.env[key!]=value;
});
function fixture(){
 process.env.PI_SUBAGENT_BIN=process.execPath;
 process.env.PI_SUBAGENT_BIN_ARGS=JSON.stringify([join(profile,"tests/fixtures/fake-subagent-rpc.mjs")]);
 const runtime=new SubagentRuntime();owners.push(runtime);
 const definition:AgentDefinition={name:"probe",description:"probe",tools:["read","subagent_parent"],delegates:[],skills:[],prompt:"original role",source:"profile",filePath:"probe.md"};
 const input={definition,instructions:"original assignment",cwd:profile,model:"openai-codex/test",effort:"low" as const,skills:[join(profile,"skills/testing/SKILL.md")],origin:"origin",retained:true,surface:"headless" as const};
 const launch=()=>runtime.launch(input,profile,join(profile,"extensions/subagent-child.ts"),false);
 return{runtime,input,launch};
}
async function closed(runtime:SubagentRuntime,id:string){await vi.waitFor(()=>expect(runtime.get(id).snapshot()).toMatchObject({status:"settled",phase:"settled",processState:"exited",retained:false,cleanup:{complete:true}}),{timeout:7000});return runtime.get(id).snapshot()}
it("closes stale retained launches and reopens the same transcript with frozen authority and immutable original evidence",async()=>{
 const {runtime,input,launch}=fixture();const deliveries:Delivery[]=[];
 runtime.bind(input.origin,{deliver:delivery=>{deliveries.push(delivery);return true}});
 const first=await launch();await closed(runtime,first.id);
 expect(runtime.hasActiveResources()).toBe(false);
 expect(()=>runtime.get(first.displayName!,input.origin)).toThrow(/Unknown/);
 const original=first.originalAssignment;
 const sibling=await runtime.launch({...input,instructions:"[hold]"},profile,join(profile,"extensions/subagent-child.ts"),true);
 expect(sibling.displayName).toBe(first.displayName);
 input.definition.tools.push("write");input.definition.prompt="changed catalog prompt";input.definition.delegates.push("stranger");input.skills.length=0;
 await expect(runtime.message(first.id,"other-origin","follow-up")).rejects.toThrow(/Unknown/);
 const gate=join(dirname(first.sessionFile!),"follow-up-ready");
 const followUp=`follow-up\nWAIT_FILE:${gate}`;
 expect(await runtime.message(first.id,input.origin,followUp)).toBe("started");
 expect(runtime.get(first.id).record.displayName).not.toBe(sibling.displayName);
 expect(runtime.get(runtime.get(first.id).record.displayName!,input.origin).record.id).toBe(first.id);
 writeFileSync(gate,"ready");
 const second=await closed(runtime,first.id);
 expect(second).toMatchObject({id:first.id,sessionFile:first.sessionFile,sessionId:first.sessionId,exchangeKind:"follow-up",result:"second answer",originalAssignment:original});
 expect(second.exchangeId).not.toBe(first.exchangeId);
 const journal=readFileSync(first.sessionFile!,"utf8").trim().split("\n").map(line=>JSON.parse(line));
 expect(journal).toHaveLength(3);
 const before=journal[1],after=journal[2];
 expect(after.message).toBe(followUp);expect(after.args).toContain("--session");expect(after.args).toContain(first.sessionFile);
 expect(after.authority).toEqual(before.authority);expect(after.prompt).toBe(before.prompt);expect(after.prompt).toContain("original role");
 expect(after.args.slice(after.args.indexOf("--model"),after.args.indexOf("--model")+4)).toEqual(["--model",input.model,"--thinking","low"]);
 expect(after.args).toContain(join(profile,"skills/testing/SKILL.md"));
 expect(deliveries).toHaveLength(1);expect(deliveries[0]).toMatchObject({result:"second answer",originalAssignment:original});
 const handledExchange=second.exchangeId;
 expect(await runtime.message(first.id,input.origin,"[handled]")).toBe("handled");
 const handled=await closed(runtime,first.id);
 expect(handled).toMatchObject({exchangeId:handledExchange,result:"second answer",originalAssignment:original});
 expect(deliveries).toHaveLength(1);
 expect(runtime.get(sibling.id).record.status).toBe("running");
 await runtime.get(sibling.id).cancel();
},15000);
it("refuses user-owned or incomplete cleanup reopening and serializes initial follow-up dispatch",async()=>{
 const {runtime,input,launch}=fixture();const first=await launch();await closed(runtime,first.id);
 const child=runtime.get(first.id);child.record.userOwned=true;
 await expect(runtime.message(first.id,input.origin,"follow-up")).rejects.toThrow(/intervention/);child.record.userOwned=false;
 child.record.cleanup!.complete=false;
 await expect(runtime.message(first.id,input.origin,"follow-up")).rejects.toThrow(/cleanup/);child.record.cleanup!.complete=true;
 const dispatch=runtime.message(first.id,input.origin,"[hold] follow-up");
 await expect(runtime.message(first.id,input.origin,"racing follow-up")).rejects.toThrow(/already being dispatched/);
 await dispatch;expect(runtime.get(first.id).snapshot()).toMatchObject({status:"running",retained:false});
 await runtime.get(first.id).cancel();await closed(runtime,first.id);
 expect(await runtime.message(first.id,input.origin,"follow-up after cancellation")).toBe("started");
 expect((await closed(runtime,first.id)).result).toBe("second answer");
},15000);
it("reopens a visible session with cumulative turn identity and closes each owned pane",async()=>{
 const {runtime,input}=fixture();const previousHerdr=process.env.HERDR_ENV;process.env.HERDR_ENV="1";
 const sessionFile=join(mkdtempSync(join(tmpdir(),"visible-follow-up-")),"session.jsonl");writeFileSync(sessionFile,"saved visible transcript\n");
 const close=vi.fn().mockResolvedValue(undefined),bootstraps:Array<{spec:{sessionFile?:string}}> = [];
 const start=vi.spyOn(VisibleChild.prototype,"start").mockImplementation(async function(this:VisibleChild){
  bootstraps.push(this.parentMessage({type:"bootstrap"}) as {spec:{sessionFile?:string}});
  this.record.sessionFile=sessionFile;this.record.sessionId="visible-saved-id";
  this.record.paneId=`pane-${bootstraps.length}`;this.record.paneState="open";
  const ready=this.parentMessage({type:"app-ready"}) as {turns:number};
  Object.assign(this as object,{hostExited:true,layout:{close}});this.record.processState="exited";
  this.parentMessage({type:"turn",payload:{turn:ready.turns+1,text:`visible answer ${bootstraps.length}`}});
  return this.snapshot();
 });
 try{
  const first=await runtime.launch({...input,surface:"visible"},profile,join(profile,"extensions/subagent-child.ts"),false);
  expect(first).toMatchObject({turns:1,paneState:"closed",retained:false});
  await runtime.message(first.id,input.origin,"follow-up");
  const second=await closed(runtime,first.id);
  expect(second).toMatchObject({turns:2,paneState:"closed",sessionId:first.sessionId,sessionFile,originalAssignment:first.originalAssignment,result:"visible answer 2"});
  expect(bootstraps[1].spec.sessionFile).toBe(sessionFile);
  expect(close.mock.calls.map(call=>call[2])).toEqual(["pane-1","pane-2"]);
 }finally{start.mockRestore();if(previousHerdr===undefined)delete process.env.HERDR_ENV;else process.env.HERDR_ENV=previousHerdr}
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { dirname, join } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { SubagentRuntime, getSubagentRuntime, resetSubagentRuntime, retireSubagentRuntime, type Delivery } from "../lib/subagents/runtime.ts";
import { VisibleChild } from "../lib/subagents/visible.ts";
import type { AgentDefinition } from "../lib/subagents/definitions.ts";
const here=dirname(fileURLToPath(import.meta.url));
const oldBin=process.env.PI_SUBAGENT_BIN,oldArgs=process.env.PI_SUBAGENT_BIN_ARGS;
const owners:SubagentRuntime[]=[];
afterEach(async()=>{await Promise.all(owners.splice(0).map(owner=>owner.shutdown("quit")));for(const [key,value] of [["PI_SUBAGENT_BIN",oldBin],["PI_SUBAGENT_BIN_ARGS",oldArgs]]){if(value===undefined)delete process.env[key!];else process.env[key!]=value}});
function fixture(){process.env.PI_SUBAGENT_BIN=process.execPath;process.env.PI_SUBAGENT_BIN_ARGS=JSON.stringify([join(here,"fixtures/fake-subagent-rpc.mjs")]);const runtime=new SubagentRuntime();owners.push(runtime);return runtime}
const definition:AgentDefinition={name:"probe",description:"probe",tools:[],delegates:[],skills:[],prompt:"probe",source:"profile",filePath:"probe.md"};
const input={definition,instructions:"first",cwd:here,model:"openai-codex/test",effort:"low" as const,skills:[],origin:"origin-a",retained:false,surface:"headless" as const};
describe("process-local descendant ownership",()=>{
 it("gives same-role children distinct names and resolves names within their origin",async()=>{
  const runtime=fixture();
  const first=await runtime.launch(input,join(here,".."),join(here,"../extensions/subagent-child.ts"),true);
  const second=await runtime.launch(input,join(here,".."),join(here,"../extensions/subagent-child.ts"),true);
  expect(first.displayName).toBeTruthy();expect(second.displayName).toBeTruthy();
  expect(first.displayName).not.toBe(second.displayName);
  expect(runtime.get(first.displayName!.toUpperCase(),input.origin).record.id).toBe(first.id);
  expect(()=>runtime.get(first.displayName!,"different-origin")).toThrow(/Unknown/);
  await runtime.get(first.id).cancel();await runtime.get(second.id).cancel();
  const third=await runtime.launch(input,join(here,".."),join(here,"../extensions/subagent-child.ts"),true);
  expect(third.displayName).not.toBe(first.displayName);expect(third.displayName).not.toBe(second.displayName);
 });
 it("routes leaf failure to its coordinator and keeps that process alive until it consumes the outcome",async()=>{
  const runtime=fixture(),delivered:Delivery[]=[],scratch=mkdtempSync(join(tmpdir(),"coordinator-outcomes-"));
  runtime.bind(input.origin,{deliver:r=>{delivered.push(r);return true}});
  try{
   const coordinator={...definition,name:"coordinator",tools:["subagent","subagent_control"],delegates:["probe"]};
   const parent=await runtime.launch({...input,definition:coordinator,instructions:`WAIT_FILE:${join(scratch,"release")}`},join(here,".."),join(here,"../extensions/subagent-child.ts"),true);
   const leaf=await runtime.launch({...input,parentId:parent.id,instructions:"[reject]"},join(here,".."),join(here,"../extensions/subagent-child.ts"),true);
   await vi.waitFor(()=>expect(runtime.get(leaf.id).record.phase).toBe("settled"),{timeout:7000});
   writeFileSync(join(scratch,"release"),"ready");
   await vi.waitFor(()=>expect(runtime.get(parent.id).record.phase).toBe("waiting-children"));
   expect(runtime.get(parent.id).record.processState).toBe("running");expect(delivered).toEqual([]);
   // Exercise the authenticated dispatch's ownership/routing after the separately
   // tested transport identity check. Do not mock the runtime or native RPC child.
   const dispatch=(identity:any,message:any)=>(runtime as any).dispatch(identity,message);
   const identity={child:parent.id,origin:input.origin,run:"fixture"};
   const response=await dispatch(identity,{type:"heartbeat"});
   expect(response.delivery).toMatchObject({id:leaf.id,outcome:"failed"});
   expect(await dispatch(identity,{type:"control",payload:{action:"inspect",id:runtime.get(leaf.id).record.displayName!.toUpperCase()}})).toMatchObject({id:leaf.id});
   await expect(dispatch({...identity,child:leaf.id},{type:"outcome-ack",payload:response.delivery.deliveryId})).rejects.toThrow(/ownership/);
   await dispatch(identity,{type:"outcome-ack",payload:response.delivery.deliveryId});
   await dispatch(identity,{type:"outcome-ack",payload:response.delivery.deliveryId});
   expect((await dispatch(identity,{type:"heartbeat"})).delivery).toBeUndefined();
   await runtime.get(parent.id).command("prompt",{message:"follow-up"});
   await vi.waitFor(()=>expect(delivered).toHaveLength(1),{timeout:7000});
   expect(delivered[0]).toMatchObject({id:parent.id,outcome:"complete",result:"second answer",processState:"exited"});
  }finally{rmSync(scratch,{recursive:true,force:true})}
 });
 it("retires a previously pending outcome when an idle visible child accepts an operator turn",async()=>{
  const runtime=fixture();
  const child=new VisibleChild({...input,retained:true,surface:"visible",displayName:"visible-probe",prompt:"probe"} as any,join(here,"../extensions/subagent-child.ts"),join(here,".."));
  child.record.status="settled";child.record.outcome="complete";child.record.result="old result";
  (runtime as any).children.set(child.record.id,child);
  (runtime as any).contexts.set(child.record.id,{input:{...input,retained:true,surface:"visible"},profile:join(here,".."),extension:join(here,"../extensions/subagent-child.ts"),catalog:new Map([[definition.name,definition]])});
  const stale={...child.snapshot(),id:"prior-leaf",parentId:child.record.id,deliveryId:"prior-outcome"};
  (runtime as any).pending.set(stale.deliveryId,stale);
  const dispatch=(message:any)=>(runtime as any).dispatch({child:child.record.id,origin:input.origin,run:"fixture"},message);
  expect((await dispatch({type:"app-poll"})).delivery).toMatchObject({deliveryId:"prior-outcome"});
  await dispatch({type:"operator-input",payload:{text:"new operator turn"}});
  expect(child.snapshot()).toMatchObject({status:"running",assignment:"new operator turn",outcome:undefined,result:undefined,userOwned:false});
  expect((await dispatch({type:"app-poll"})).delivery).toBeUndefined();
 });
 it("allows a permitted leaf in a sibling directory while preserving origin and delegate checks",async()=>{
  const runtime=fixture(),scratch=mkdtempSync(join(tmpdir(),"subagent-sibling-"));
  try{
   const coordinator={...definition,name:"coordinator",tools:["subagent"],delegates:["probe"]};
   const parent=await runtime.launch({...input,definition:coordinator,instructions:"[hold]",catalog:new Map([["coordinator",coordinator],["probe",definition]])},join(here,".."),join(here,"../extensions/subagent-child.ts"),true);
   const leaf=await runtime.launch({...input,cwd:scratch,parentId:parent.id,instructions:"[hold]"},join(here,".."),join(here,"../extensions/subagent-child.ts"),true);
   expect(leaf.cwd).toBe(scratch);
   await expect(runtime.launch({...input,cwd:scratch,parentId:parent.id,origin:"other-origin",instructions:"[hold]"},join(here,".."),join(here,"../extensions/subagent-child.ts"),true)).rejects.toThrow(/change origin/);
   await expect(runtime.launch({...input,cwd:scratch,parentId:parent.id,definition:{...definition,name:"other"},instructions:"[hold]"},join(here,".."),join(here,"../extensions/subagent-child.ts"),true)).rejects.toThrow(/Delegation is outside frozen authority/);
   await runtime.get(leaf.id).cancel();await runtime.get(parent.id).cancel();
  }finally{rmSync(scratch,{recursive:true,force:true})}
 });
 it("marks a coordinator's foreground leaf wait as attached",async()=>{
  const runtime=fixture();
  const coordinator={...definition,name:"coordinator",tools:["subagent","subagent_control"],delegates:["probe"]};
  const parent=await runtime.launch({...input,definition:coordinator,catalog:new Map([["coordinator",coordinator],["probe",definition]])},join(here,".."),join(here,"../extensions/subagent-child.ts"),true);
  const response=await (runtime as any).dispatch({child:parent.id,origin:input.origin,run:"fixture"},{type:"delegate",payload:{agent:"probe",instructions:"[hold]",model:"openai-codex/test",effort:"low",background:false}});
  expect(response.waitState).toBe("attached");
  const leaf=runtime.list(input.origin).find(record=>record.parentId===parent.id)!;
  await runtime.get(leaf.id).cancel();
 });
 it("routes a coordinator leaf's user-only approval to the originating user, never factual answering",async()=>{
  const runtime=fixture(),delivered:Delivery[]=[];
  runtime.bind(input.origin,{deliver:r=>{delivered.push(r);return true}});
  const parent=await runtime.launch({...input,definition:{...definition,name:"coordinator",tools:["subagent"],delegates:["probe"]},instructions:"[hold]"},join(here,".."),join(here,"../extensions/subagent-child.ts"),true);
  const leaf=await runtime.launch({...input,parentId:parent.id,instructions:"[approval]"},join(here,".."),join(here,"../extensions/subagent-child.ts"),true);
  await vi.waitFor(()=>expect(delivered).toHaveLength(1));
  expect(delivered[0]).toMatchObject({id:leaf.id,phase:"waiting-user",parentId:undefined});
  await expect(runtime.get(leaf.id).answer("yes")).rejects.toThrow(/user approvals/);
 });
 it("keeps concurrent activity UI-only and queues failures while the parent is busy",async()=>{
  const runtime=fixture(),delivered:Delivery[]=[],views:any[]=[];let idle=false;
  runtime.bind(input.origin,{deliver:r=>{if(!idle)return false;delivered.push(r);return true},status:records=>views.push(records)});
  const a=await runtime.launch({...input,instructions:"[activity] [hold]"},join(here,".."),join(here,"../extensions/subagent-child.ts"),true);
  const b=await runtime.launch({...input,instructions:"[reject]"},join(here,".."),join(here,"../extensions/subagent-child.ts"),true);
  await vi.waitFor(()=>{expect(runtime.get(a.id).record.phase).toBe("tool");expect(runtime.get(b.id).record.phase).toBe("settled")},{timeout:7000});
  expect(delivered).toEqual([]);expect(views.some(rs=>rs.some((r:any)=>r.toolName==="bash"))).toBe(true);
  idle=true;runtime.flush(input.origin);expect(delivered).toHaveLength(1);expect(delivered[0].error).toContain("preflight rejected");
  runtime.acknowledge(input.origin,delivered[0].deliveryId);
  const abort=new AbortController(),waiting=runtime.wait(a.id,input.origin,abort.signal);abort.abort();
  expect(await waiting).toMatchObject({id:a.id,status:"running",notice:expect.stringContaining("continues")});
  expect(runtime.get(a.id).record.result).toBeUndefined();
  await runtime.get(a.id).cancel();expect(delivered).toHaveLength(2);expect(delivered[1].outcome).toBe("cancelled");
  runtime.flush(input.origin);expect(delivered).toHaveLength(2);
 });
 it("retains an inactive origin's result and consumes only its acknowledgement",async()=>{
  const runtime=fixture(),other:Delivery[]=[],origin:Delivery[]=[];
  runtime.bind("origin-b",{deliver:record=>{other.push(record);return true}});
  const launched=await runtime.launch(input,join(here,".."),join(here,"../extensions/subagent-child.ts"),true);
  await vi.waitFor(()=>expect(runtime.get(launched.id).snapshot().status).toBe("settled"));
  expect(other).toEqual([]);
  const binding={deliver:(record:Delivery)=>{origin.push(record);return true}};
  runtime.bind("origin-a",binding);
  await vi.waitFor(()=>expect(origin).toHaveLength(1),{timeout:7000});
  runtime.unbind("origin-a",binding);
  runtime.bind("origin-a",binding);
  expect(origin).toHaveLength(1);
  runtime.acknowledge("origin-b",origin[0].deliveryId);
  runtime.acknowledge("origin-a",origin[0].deliveryId);
  runtime.flush("origin-a");
  expect(origin).toHaveLength(1);
  expect(()=>runtime.get(launched.id,"origin-b")).toThrow(/Unknown/);
 });
 it("detaches an aborted foreground wait without cancelling its child",async()=>{
  const runtime=fixture(),delivered:Delivery[]=[];
  runtime.bind("origin-a",{deliver:record=>{delivered.push(record);return true}});
  const controller=new AbortController();controller.abort();
  const launched=await runtime.launch(input,join(here,".."),join(here,"../extensions/subagent-child.ts"),false,controller.signal);
  expect(launched.status).toBe("running");
  await vi.waitFor(()=>expect(delivered).toHaveLength(1),{timeout:7000});
  expect(delivered[0].outcome).toBe("complete");
 });
 it("does not silently substitute headless hosting for visible",async()=>{
  const runtime=fixture();
  const previous=process.env.HERDR_ENV;process.env.HERDR_ENV="0";
  try{await expect(runtime.launch({...input,surface:"visible"},here,here,true)).rejects.toThrow(/no headless substitution/)}finally{process.env.HERDR_ENV=previous}
  expect(runtime.list()).toEqual([]);
 });
 it("reloads a settled owner with only names and undelivered outcomes",async()=>{
  process.env.PI_SUBAGENT_BIN=process.execPath;
  process.env.PI_SUBAGENT_BIN_ARGS=JSON.stringify([join(here,"fixtures/fake-subagent-rpc.mjs")]);
  await resetSubagentRuntime();
  const runtime=getSubagentRuntime();
  runtime.bind(input.origin,{deliver:()=>false});
  const first=await runtime.launch({...input,instructions:"[reject]"},join(here,".."),join(here,"../extensions/subagent-child.ts"),true);
  let exitedCleanupActive:boolean|undefined;
  const unsubscribe=runtime.subscribe(first.id,input.origin,record=>{
   if(record.processState==="exited"&&record.phase==="cleanup")exitedCleanupActive=runtime.hasActiveResources();
  });
  await vi.waitFor(()=>expect(runtime.get(first.id).record).toMatchObject({status:"settled",processState:"exited",phase:"settled"}),{timeout:7000});
  unsubscribe();
  expect(exitedCleanupActive).toBe(true);
  expect(runtime.hasActiveResources()).toBe(false);
  const firstName=first.displayName;
  await retireSubagentRuntime();
  const replacement=getSubagentRuntime();
  expect(replacement.ownerId).not.toBe(runtime.ownerId);
  expect(replacement.list(input.origin).some(record=>record.id===first.id&&record.outcome==="failed")).toBe(true);
  const carried:Delivery[]=[];
  replacement.bind(input.origin,{deliver:record=>{carried.push(record);return true}});
  expect(carried).toHaveLength(1);
  expect(carried[0]).toMatchObject({id:first.id,outcome:"failed",phase:"settled",processState:"exited"});
  replacement.acknowledge(input.origin,carried[0].deliveryId);
  replacement.flush(input.origin);expect(carried).toHaveLength(1);
  const second=await replacement.launch({...input,instructions:"[reject]"},join(here,".."),join(here,"../extensions/subagent-child.ts"),true);
  expect(second.displayName).not.toBe(firstName);
  await vi.waitFor(()=>expect(replacement.get(second.id).record.phase).toBe("settled"),{timeout:7000});
  await resetSubagentRuntime();
 });
});

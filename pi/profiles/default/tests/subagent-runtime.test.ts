import { afterEach, describe, expect, it, vi } from "vitest";
import { dirname, join } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { SubagentRuntime, type Delivery } from "../lib/subagents/runtime.ts";
import type { AgentDefinition } from "../lib/subagents/definitions.ts";
const here=dirname(fileURLToPath(import.meta.url));
const oldBin=process.env.PI_SUBAGENT_BIN,oldArgs=process.env.PI_SUBAGENT_BIN_ARGS;
const owners:SubagentRuntime[]=[];
afterEach(async()=>{await Promise.all(owners.splice(0).map(owner=>owner.shutdown("quit")));for(const [key,value] of [["PI_SUBAGENT_BIN",oldBin],["PI_SUBAGENT_BIN_ARGS",oldArgs]]){if(value===undefined)delete process.env[key!];else process.env[key!]=value}});
function fixture(){process.env.PI_SUBAGENT_BIN=process.execPath;process.env.PI_SUBAGENT_BIN_ARGS=JSON.stringify([join(here,"fixtures/fake-subagent-rpc.mjs")]);const runtime=new SubagentRuntime();owners.push(runtime);return runtime}
const definition:AgentDefinition={name:"probe",description:"probe",tools:[],delegates:[],skills:[],prompt:"probe",source:"profile",filePath:"probe.md"};
const input={definition,instructions:"first",cwd:here,model:"openai-codex/test",effort:"low" as const,skills:[],origin:"origin-a",retained:false,surface:"headless" as const};
describe("process-local descendant ownership",()=>{
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
   await expect(dispatch({...identity,child:leaf.id},{type:"outcome-ack",payload:response.delivery.deliveryId})).rejects.toThrow(/ownership/);
   await dispatch(identity,{type:"outcome-ack",payload:response.delivery.deliveryId});
   await dispatch(identity,{type:"outcome-ack",payload:response.delivery.deliveryId});
   expect((await dispatch(identity,{type:"heartbeat"})).delivery).toBeUndefined();
   await runtime.get(parent.id).command("prompt",{message:"follow-up"});
   await vi.waitFor(()=>expect(delivered).toHaveLength(1),{timeout:7000});
   expect(delivered[0]).toMatchObject({id:parent.id,outcome:"complete",result:"second answer",processState:"exited"});
  }finally{rmSync(scratch,{recursive:true,force:true})}
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
});

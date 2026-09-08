import { afterEach, describe, expect, it, vi } from "vitest";
import { dirname, join } from "node:path";
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

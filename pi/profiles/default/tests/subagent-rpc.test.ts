import { afterEach, describe, expect, it, vi } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RpcChild, type ChildRecord } from "../lib/subagents/rpc.ts";
import { VisibleChild } from "../lib/subagents/visible.ts";
import type { AgentDefinition } from "../lib/subagents/definitions.ts";
const here=dirname(fileURLToPath(import.meta.url)),oldBin=process.env.PI_SUBAGENT_BIN,oldArgs=process.env.PI_SUBAGENT_BIN_ARGS;
const children:RpcChild[]=[];
afterEach(async()=>{await Promise.all(children.splice(0).map(child=>child.cancel()));if(oldBin===undefined)delete process.env.PI_SUBAGENT_BIN;else process.env.PI_SUBAGENT_BIN=oldBin;if(oldArgs===undefined)delete process.env.PI_SUBAGENT_BIN_ARGS;else process.env.PI_SUBAGENT_BIN_ARGS=oldArgs});
const definition:AgentDefinition={name:"test",description:"test",tools:["subagent_parent"],delegates:[],skills:[],prompt:"test",source:"profile",filePath:"test.md",model:"openai-codex/test",effort:"low"};
function child(instructions="first",retained=true){
 process.env.PI_SUBAGENT_BIN=process.execPath;process.env.PI_SUBAGENT_BIN_ARGS=JSON.stringify([join(here,"fixtures","fake-subagent-rpc.mjs")]);
 const instance=new RpcChild({definition,instructions,cwd:here,model:"openai-codex/test",effort:"low",skills:[],origin:"origin-a",retained,surface:"headless"},join(here,"../extensions/subagent-child.ts"),join(here,".."));children.push(instance);return instance;
}
describe("subagent RPC lifecycle",()=>{
 it("accepts native aggregate agent_end above 1 MiB and still observes agent_settled",async()=>{
  const result=await child("[aggregate]",false).start();
  expect(result).toMatchObject({outcome:"complete",result:"first answer",processState:"exited"});
 });
 it.each([['[reject]',/Initial prompt rejected: fixture provider preflight rejected/],['[provider-error]',/fixture provider unavailable/],['[oversize]',/type=agent_end.*limit=16777216/]] as const)("reports concrete %s failure after process cleanup",async(input,error)=>{
  const result=await child(input,false).start();
  expect(result.outcome).toBe("failed");expect(result.error).toMatch(error);expect(result.processState).toBe("exited");
 });
 it("separates actual tool activity from contact and excludes tool arguments",async()=>{
  const instance=child("[activity] [hold]");void instance.start();
  await vi.waitFor(()=>expect(instance.record.phase).toBe("tool"));
  const activity=instance.record.lastActivityAt;
  instance.contact();
  expect(instance.snapshot()).toMatchObject({phase:"tool",toolName:"bash",lastActivityAt:activity,transportState:"connected"});
  expect(JSON.stringify(instance.snapshot())).not.toContain("must not appear");
 });
 it("can detach and reattach without contaminating blank results or returning an old retained turn",async()=>{
  const instance=child();await instance.start();
  await instance.message("[hold]");const abort=new AbortController();
  const wait=instance.wait(abort.signal);abort.abort();
  expect(await wait).toMatchObject({status:"running",waitState:"detached",notice:expect.stringContaining("continues")});
  expect(instance.record.result).toBeUndefined();
  let finished=false;const next=instance.wait().then(r=>{finished=true;return r});
  await new Promise(r=>setTimeout(r,30));expect(finished).toBe(false);
  await instance.cancel();expect((await next).outcome).toBe("cancelled");
 });
 it("preserves concrete cleanup errors alongside a completed result",async()=>{
  const instance=child("[live]",false);
  const stop=vi.spyOn(instance as any,"stopProcess").mockRejectedValueOnce(new Error("fixture tree termination denied"));
  expect(await instance.start()).toMatchObject({outcome:"complete",result:"first answer",processState:"running",cleanup:{complete:false,errors:[expect.stringContaining("fixture tree termination denied")]}});
  stop.mockRestore();
 });
 it("uses a retained process for a follow-up and preserves its completed outcome on shutdown",async()=>{
  const instance=child();const first=await instance.start();expect(first).toMatchObject({origin:"origin-a",outcome:"complete",result:"first answer",assignment:"first",model:"openai-codex/test",effort:"low",cwd:here,skills:[],assignmentFinishedAt:expect.any(String),exchangeKind:"original",exchangeId:expect.any(String),originalAssignment:{exchangeId:expect.any(String),assignment:"first",outcome:"complete",result:"first answer",startedAt:first.assignmentStartedAt,finishedAt:first.assignmentFinishedAt}});
  expect(first.displayName).toBeUndefined();
  const original=first.originalAssignment;
  const reply=new Promise<ChildRecord>(resolve=>instance.onUpdate=resolve);await instance.message("follow-up");const followUp=await reply;
  expect(followUp).toMatchObject({assignment:"follow-up",assignmentFinishedAt:expect.any(String),exchangeKind:"follow-up",exchangeId:expect.any(String),originalAssignment:original});
  expect(followUp.exchangeId).not.toBe(first.exchangeId);
  expect(original).toEqual(first.originalAssignment);
  await instance.finish();expect(instance.snapshot().outcome).toBe("complete");expect(instance.snapshot().originalAssignment).toEqual(original);
 });
 it("keeps the original evidence when a running follow-up is cancelled",async()=>{
  const instance=child();const first=await instance.start();await instance.message("[hold]");
  expect(instance.snapshot()).toMatchObject({status:"running",exchangeKind:"follow-up",originalAssignment:first.originalAssignment});
  await instance.cancel();
  expect(instance.snapshot()).toMatchObject({status:"settled",outcome:"cancelled",originalAssignment:first.originalAssignment});
 });
 it.each(["[blank]","[exit]"])("does not invent success from %s",async input=>{
  const instance=child(input,false);const result=await instance.start();expect(result.outcome).toBe("failed");expect(result.error).toMatch(/Blank|without reporting completion/);
 });
 it("does not reuse a previous answer after a blank follow-up",async()=>{
  const instance=child();const first=await instance.start();const reply=new Promise<ChildRecord>(resolve=>instance.onUpdate=resolve);await instance.message("[blank]");const followUp=await reply;
  expect(followUp).toMatchObject({outcome:"failed",error:"Blank output is not assignment completion",exchangeKind:"follow-up",originalAssignment:first.originalAssignment});
  expect(followUp.result).toBeUndefined();
 });
 it("keeps user-only consent out of factual answers and preserves a user's denial",async()=>{
  const instance=child("[approval]");expect((await instance.start()).status).toBe("waiting");
  await expect(instance.answer("yes")).rejects.toThrow(/user approvals/);
  const result=new Promise<ChildRecord>(resolve=>instance.onUpdate=resolve);
  await instance.escalate({hasUI:true,ui:{confirm:async()=>false}} as unknown as Parameters<RpcChild["escalate"]>[0]);
  expect((await result).result).toBe("denied");
 });
 it("commits cancellation before an abort response or process exit",async()=>{
  const instance=child("[hold]");const result=instance.start();await instance.cancel();expect(await result).toMatchObject({outcome:"cancelled",status:"settled"});expect(instance.snapshot().result).toBeUndefined();
 });
 it("keeps a terminal snapshot independent from later child state",async()=>{
  const instance=child();const first=await instance.start();const captured=first.originalAssignment!;
  const returned=instance.snapshot() as any;
  returned.originalAssignment.result="mutated only in this returned snapshot";
  returned.originalAssignment.assignment="mutated instructions";
  expect(instance.snapshot().originalAssignment).toEqual(captured);
  expect(instance.snapshot().originalAssignment).toMatchObject({assignment:"first",result:"first answer",outcome:"complete"});
 });
 it("expires a visible deferred report before its later final turn",async()=>{
  const instance=new VisibleChild({definition,instructions:"visible deferred",cwd:here,model:"openai-codex/test",effort:"low",skills:[],origin:"origin-a",retained:true,surface:"visible"},"fixture-extension","fixture-profile",{} as any);
  children.push(instance);Object.assign(instance.record,{processState:"exited",status:"running"});
  let descendantsOutstanding=true;instance.hasOutstandingChildren=()=>descendantsOutstanding;
  instance.parentMessage({type:"partial",payload:"Earlier visible work remains active."});
  expect(instance.parentMessage({type:"turn",payload:{turn:1,text:"Still waiting for visible descendants."}})).toEqual({accepted:true});
  expect(instance.snapshot()).toMatchObject({status:"running",phase:"waiting-children",outcome:"partial",result:"Earlier visible work remains active."});
  expect(instance.parentMessage({type:"operator-input",payload:{text:"Ordinary input while descendants remain."}})).toEqual({accepted:true});
  expect(instance.parentMessage({type:"turn",payload:{turn:2,text:"Still waiting after ordinary input."}})).toEqual({accepted:true});
  descendantsOutstanding=false;
  expect(instance.parentMessage({type:"turn",payload:{turn:3,text:"Visible work completed after descendants settled."}})).toEqual({accepted:true});
  expect(instance.snapshot()).toMatchObject({status:"settled",outcome:"complete",result:"Visible work completed after descendants settled."});
 });
});

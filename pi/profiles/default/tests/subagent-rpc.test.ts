import { afterEach, describe, expect, it, vi } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RpcChild, type ChildRecord } from "../lib/subagents/rpc.ts";
import type { AgentDefinition } from "../lib/subagents/definitions.ts";
const here=dirname(fileURLToPath(import.meta.url)),oldBin=process.env.PI_SUBAGENT_BIN,oldArgs=process.env.PI_SUBAGENT_BIN_ARGS;
const children:RpcChild[]=[];
afterEach(async()=>{await Promise.all(children.splice(0).map(child=>child.cancel()));if(oldBin===undefined)delete process.env.PI_SUBAGENT_BIN;else process.env.PI_SUBAGENT_BIN=oldBin;if(oldArgs===undefined)delete process.env.PI_SUBAGENT_BIN_ARGS;else process.env.PI_SUBAGENT_BIN_ARGS=oldArgs});
const definition:AgentDefinition={name:"test",description:"test",tools:[],delegates:[],skills:[],prompt:"test",source:"profile",filePath:"test.md",model:"openai-codex/test",effort:"low"};
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
  const instance=child();const first=await instance.start();expect(first).toMatchObject({origin:"origin-a",outcome:"complete",result:"first answer",assignment:"first",model:"openai-codex/test",effort:"low",cwd:here,skills:[],assignmentFinishedAt:expect.any(String)});
  expect(first.displayName).toBeUndefined();
  const reply=new Promise<ChildRecord>(resolve=>instance.onUpdate=resolve);await instance.message("follow-up");expect((await reply)).toMatchObject({assignment:"follow-up",assignmentFinishedAt:expect.any(String)});
  await instance.cancel();expect(instance.snapshot().outcome).toBe("complete");
 });
 it.each(["[blank]","[exit]"])("does not invent success from %s",async input=>{
  const instance=child(input,false);const result=await instance.start();expect(result.outcome).toBe("failed");expect(result.error).toMatch(/Blank|without reporting completion/);
 });
 it("does not reuse a previous answer after a blank follow-up",async()=>{
  const instance=child();await instance.start();const reply=new Promise<ChildRecord>(resolve=>instance.onUpdate=resolve);await instance.message("[blank]");expect(await reply).toMatchObject({outcome:"failed",error:"Blank output is not assignment completion"});
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
});

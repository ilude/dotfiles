import { afterEach, describe, expect, it } from "vitest";
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
 it("uses a retained process for a follow-up and preserves its completed outcome on shutdown",async()=>{
  const instance=child();const first=await instance.start();expect(first).toMatchObject({origin:"origin-a",outcome:"complete",result:"first answer"});
  const reply=new Promise<ChildRecord>(resolve=>instance.onUpdate=resolve);await instance.message("follow-up");expect((await reply).result).toBe("second answer");
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

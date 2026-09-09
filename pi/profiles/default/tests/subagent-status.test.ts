import { expect, it, vi } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import subagents from "../extensions/subagents.ts";
import clearCommand from "../extensions/clear.ts";
import { createEventBus } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/event-bus.js";
import { getSubagentRuntime, resetSubagentRuntime } from "../lib/subagents/runtime.ts";
import { outcomeText } from "../lib/subagents/status.ts";
import type { ChildRecord } from "../lib/subagents/rpc.ts";
const here=dirname(fileURLToPath(import.meta.url));
it("renders named transcript outcomes with bounded result and cleanup details",()=>{
 const r:ChildRecord={id:"12345678-rest",agent:"probe",origin:"a",surface:"headless",status:"running",retained:false,userOwned:false,turns:0,createdAt:"2026-09-08T00:00:00Z",updatedAt:"2026-09-08T00:00:00Z",assignmentStartedAt:"2026-09-08T00:00:00Z",lastActivityAt:"2026-09-08T00:00:01Z",lastContactAt:"2026-09-08T00:02:00Z",phase:"tool",toolName:"bash",processState:"running",transportState:"connected",waitState:"detached"};
 expect(outcomeText({...r,displayName:"Clara",status:"settled",outcome:"complete",result:"answer"})).toContain("Subagent Clara · probe");
 const ended={...r,status:"settled" as const,outcome:"complete" as const,result:"answer",error:"cleanup failed"};
 expect(outcomeText(ended)).toContain("answer\nError: cleanup failed");
});
it("replaces the module-local owner on an explicit reset",async()=>{
 const before=getSubagentRuntime();
 const replacement=await resetSubagentRuntime();
 expect(replacement).toBe(getSubagentRuntime());expect(replacement.ownerId).not.toBe(before.ownerId);
});
it("does not install a persistent subagent status widget",async()=>{
 const handlers:Record<string,Function>={},setWidget=vi.fn();
 const pi:any={events:{on:()=>()=>{}},on:(name:string,handler:Function)=>{handlers[name]=handler},registerTool:()=>{},registerCommand:()=>{},sendMessage:()=>{}};
 const ctx:any={cwd:here,hasUI:true,isProjectTrusted:()=>false,isIdle:()=>true,sessionManager:{getSessionId:()=>"fresh-owner"},ui:{setWidget}};
 subagents(pi);await handlers.session_start({},ctx);
 expect(setWidget).not.toHaveBeenCalled();
 await handlers.session_shutdown?.({reason:"reload"},ctx);
 expect(setWidget).not.toHaveBeenCalled();
});
it("resets the owning runtime through the shared clear event",async()=>{
 const events=createEventBus(),handlers:Record<string,Function>={},commands:Record<string,any>={};
 const pi:any={events,on:(name:string,handler:Function)=>{handlers[name]=handler},registerTool:()=>{},registerCommand:(name:string,command:any)=>{commands[name]=command},sendMessage:()=>{}};
 const ctx:any={cwd:here,hasUI:true,isProjectTrusted:()=>false,isIdle:()=>true,sessionManager:{getSessionId:()=>"clear-owner"},ui:{setWidget:()=>{},notify:vi.fn()},newSession:vi.fn(async(options:any)=>options.withSession({}))};
 subagents(pi);clearCommand(pi);await handlers.session_start({},ctx);const before=getSubagentRuntime().ownerId;
 await commands.clear.handler("",ctx);
 expect(getSubagentRuntime().ownerId).not.toBe(before);expect(ctx.newSession).toHaveBeenCalledOnce();
 await handlers.session_shutdown?.({reason:"reload"},ctx);
});
it("delivers outcomes without a persistent status widget or progress messages",async()=>{
 const oldBin=process.env.PI_SUBAGENT_BIN,oldArgs=process.env.PI_SUBAGENT_BIN_ARGS;
 process.env.PI_SUBAGENT_BIN=process.execPath;process.env.PI_SUBAGENT_BIN_ARGS=JSON.stringify([join(here,"fixtures/fake-subagent-rpc.mjs")]);
 const runtime=getSubagentRuntime(),handlers:Record<string,Function>={},messages:any[]=[],setWidget=vi.fn();
 const pi:any={on:(name:string,handler:Function)=>{handlers[name]=handler},registerTool:()=>{},registerCommand:()=>{},sendMessage:(message:any)=>messages.push(message)};
 let owner="status-a",idle=false;
 const ctx:any={cwd:here,hasUI:true,isProjectTrusted:()=>false,isIdle:()=>idle,sessionManager:{getSessionId:()=>owner},ui:{setWidget,notify:()=>{}}};
 try{
  subagents(pi);await handlers.session_start({},ctx);
  const definition={name:"probe",description:"probe",tools:[],delegates:[],skills:[],prompt:"probe",source:"profile" as const,filePath:"probe.md"};
  const input={definition,instructions:"[activity] [hold]",cwd:here,model:"openai-codex/test",effort:"low" as const,skills:[],origin:owner,retained:false,surface:"headless" as const};
  const a=await runtime.launch(input,join(here,".."),join(here,"../extensions/subagent-child.ts"),true);
  const b=await runtime.launch({...input,instructions:"[reject]"},join(here,".."),join(here,"../extensions/subagent-child.ts"),true);
  expect(messages).toEqual([]);
  expect(setWidget).not.toHaveBeenCalled();
  await vi.waitFor(()=>expect(runtime.get(b.id).record).toMatchObject({phase:"settled",processState:"exited"}),{timeout:7000});
  await handlers.session_shutdown({reason:"switch"},ctx);owner="status-b";await handlers.session_start({},ctx);idle=true;await handlers.agent_settled();
  expect(messages).toEqual([]);expect(setWidget).not.toHaveBeenCalled();
  await handlers.session_shutdown({reason:"switch"},ctx);owner="status-a";await handlers.session_start({},ctx);
  expect(messages).toHaveLength(1);expect(messages[0].content).toContain("preflight rejected");
  await handlers.message_end({message:{role:"custom",...messages[0]}},ctx);
  await runtime.get(a.id).cancel();expect(messages).toHaveLength(2);expect(runtime.get(b.id).record.outcome).toBe("failed");
 }finally{
  await handlers.session_shutdown?.({reason:"quit"},ctx);
  if(oldBin===undefined)delete process.env.PI_SUBAGENT_BIN;else process.env.PI_SUBAGENT_BIN=oldBin;
  if(oldArgs===undefined)delete process.env.PI_SUBAGENT_BIN_ARGS;else process.env.PI_SUBAGENT_BIN_ARGS=oldArgs;
 }
},15000);

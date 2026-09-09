import { expect, it, vi } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import subagents from "../extensions/subagents.ts";
import clearCommand from "../extensions/clear.ts";
import { createEventBus } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/event-bus.js";
import { getSubagentRuntime, resetSubagentRuntime } from "../lib/subagents/runtime.ts";
import { statusLines, outcomeText } from "../lib/subagents/status.ts";
import type { ChildRecord } from "../lib/subagents/rpc.ts";
const here=dirname(fileURLToPath(import.meta.url));
it("renders inactivity separately from contact, redacts control characters and shows result plus cleanup failure",()=>{
 const r:ChildRecord={id:"12345678-rest",agent:"probe",origin:"a",surface:"headless",status:"running",retained:false,userOwned:false,turns:0,createdAt:"2026-09-08T00:00:00Z",updatedAt:"2026-09-08T00:00:00Z",assignmentStartedAt:"2026-09-08T00:00:00Z",lastActivityAt:"2026-09-08T00:00:01Z",lastContactAt:"2026-09-08T00:02:00Z",phase:"tool",toolName:"bash",processState:"running",transportState:"connected",waitState:"detached"};
 expect(statusLines([r],Date.parse("2026-09-08T00:02:00Z")).join("\n")).toContain("activity 1m 59s ago");
 expect(statusLines([r]).join("\n")).toContain("wait detached; child continues");
 expect(statusLines([{...r,displayName:"Clara"}]).join("\n")).toContain("Clara · probe");
 expect(outcomeText({...r,displayName:"Clara",status:"settled",outcome:"complete",result:"answer"})).toContain("Subagent Clara · probe");
 const ended={...r,status:"settled" as const,outcome:"complete" as const,result:"answer",error:"cleanup\u001b failed"};
 expect(outcomeText(ended)).toContain("answer\nError:");expect(statusLines([ended]).join("\n")).not.toContain("\u001b");
 const many=statusLines([...Array.from({length:8},()=>r),...Array.from({length:3},()=>ended)]);
 expect(many.length).toBeLessThanOrEqual(10);expect(many.filter(line=>line.includes("cleanup")).length).toBe(3);
});
it("replaces the module-local owner on an explicit reset",async()=>{
 const before=getSubagentRuntime();
 const replacement=await resetSubagentRuntime();
 expect(replacement).toBe(getSubagentRuntime());expect(replacement.ownerId).not.toBe(before.ownerId);
});
it("does not advertise the obsolete pre-upgrade runtime path",async()=>{
 const handlers:Record<string,Function>={},widgets:any[]=[];
 const pi:any={events:{on:()=>()=>{}},on:(name:string,handler:Function)=>{handlers[name]=handler},registerTool:()=>{},registerCommand:()=>{},sendMessage:()=>{}};
 const ctx:any={cwd:here,hasUI:true,isProjectTrusted:()=>false,isIdle:()=>true,sessionManager:{getSessionId:()=>"fresh-owner"},ui:{setWidget:(_key:string,lines:any)=>widgets.push(lines)}};
 subagents(pi);await handlers.session_start({},ctx);
 expect(JSON.stringify(widgets)).not.toContain("pre-upgrade subagent runtime");
 await handlers.session_shutdown?.({reason:"reload"},ctx);
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
it("updates the origin's UI during silence and busy failure without sending progress to the model",async()=>{
 const oldBin=process.env.PI_SUBAGENT_BIN,oldArgs=process.env.PI_SUBAGENT_BIN_ARGS;
 process.env.PI_SUBAGENT_BIN=process.execPath;process.env.PI_SUBAGENT_BIN_ARGS=JSON.stringify([join(here,"fixtures/fake-subagent-rpc.mjs")]);
 const runtime=getSubagentRuntime(),handlers:Record<string,Function>={},messages:any[]=[],widgets:any[]=[];
 const pi:any={on:(name:string,handler:Function)=>{handlers[name]=handler},registerTool:()=>{},registerCommand:()=>{},sendMessage:(message:any)=>messages.push(message)};
 let owner="status-a",idle=false;
 const ctx:any={cwd:here,hasUI:true,isProjectTrusted:()=>false,isIdle:()=>idle,sessionManager:{getSessionId:()=>owner},ui:{setWidget:(_key:string,lines:any)=>widgets.push(lines),notify:()=>{}}};
 try{
  subagents(pi);await handlers.session_start({},ctx);
  const definition={name:"probe",description:"probe",tools:[],delegates:[],skills:[],prompt:"probe",source:"profile" as const,filePath:"probe.md"};
  const input={definition,instructions:"[activity] [hold]",cwd:here,model:"openai-codex/test",effort:"low" as const,skills:[],origin:owner,retained:false,surface:"headless" as const};
  const a=await runtime.launch(input,join(here,".."),join(here,"../extensions/subagent-child.ts"),true);
  const b=await runtime.launch({...input,instructions:"[reject]"},join(here,".."),join(here,"../extensions/subagent-child.ts"),true);
  await vi.waitFor(()=>expect(widgets.some(lines=>JSON.stringify(lines ?? []).includes("preflight rejected"))).toBe(true),{timeout:5000});
  expect(messages).toEqual([]);
  const viewsBefore=widgets.length;
  await vi.waitFor(()=>expect(widgets.length).toBeGreaterThan(viewsBefore),{timeout:2500});
  expect(messages).toEqual([]);
  // An error widget is progress during cleanup, not final outcome delivery.
  await vi.waitFor(()=>expect(runtime.get(b.id).record).toMatchObject({phase:"settled",processState:"exited"}),{timeout:7000});
  await handlers.session_shutdown({reason:"switch"},ctx);owner="status-b";await handlers.session_start({},ctx);idle=true;await handlers.agent_settled();
  expect(messages).toEqual([]);expect(widgets.at(-1)).toBeUndefined();
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

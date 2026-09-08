import { expect, it, vi } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import subagents from "../extensions/subagents.ts";
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
it("resets a process-global legacy owner without manual child cleanup",async()=>{
 const key=Symbol.for("dotfiles.pi.default.subagents.v1"),globals=globalThis as any,previous=globals[key];
 const shutdown=vi.fn(async()=>{});globals[key]={shutdown};
 try{
  const replacement=await resetSubagentRuntime();
  expect(shutdown).toHaveBeenCalledWith("clear");expect(replacement).toBe(getSubagentRuntime());expect(typeof replacement.wait).toBe("function");
 }finally{globals[key]=previous}
});
it("keeps older live owners intact on reload and reports the automatic reset paths",async()=>{
 const runtime=getSubagentRuntime(),wait=runtime.wait,handlers:Record<string,Function>={},tools:Record<string,any>={},widgets:any[]=[];
 (runtime as any).wait=undefined;
 const pi:any={on:(name:string,handler:Function)=>{handlers[name]=handler},registerTool:(tool:any)=>{tools[tool.name]=tool},registerCommand:()=>{},sendMessage:()=>{}};
 const ctx:any={cwd:here,hasUI:true,isProjectTrusted:()=>false,isIdle:()=>true,sessionManager:{getSessionId:()=>"old-owner"},ui:{setWidget:(_key:string,lines:any)=>widgets.push(lines)}};
 try{
  subagents(pi);await handlers.session_start({},ctx);
  expect(widgets.at(-1)[0]).toContain("pre-upgrade subagent runtime");
  expect(widgets.at(-1)[0]).toContain("/clear");
  const response=await tools.subagent.execute("call",{agent:"probe",instructions:"work"},undefined,undefined,ctx);
  expect(response.isError).toBe(true);expect(response.content[0].text).toContain("restart Pi");
 }finally{await handlers.session_shutdown?.({reason:"reload"},ctx);runtime.wait=wait}
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
  await handlers.session_shutdown({reason:"switch"},ctx);owner="status-b";await handlers.session_start({},ctx);idle=true;await handlers.agent_settled();
  expect(messages).toEqual([]);expect(widgets.at(-1)).toBeUndefined();
  await handlers.session_shutdown({reason:"switch"},ctx);owner="status-a";await handlers.session_start({},ctx);
  expect(messages).toHaveLength(1);expect(messages[0].content).toContain("preflight rejected");
  await handlers.message_end({message:{role:"custom",...messages[0]}},ctx);
  await handlers.session_shutdown({reason:"reload"},ctx);await handlers.session_start({},ctx);await handlers.agent_settled();expect(messages).toHaveLength(1);
  await runtime.get(a.id).cancel();expect(messages).toHaveLength(2);expect(runtime.get(b.id).record.outcome).toBe("failed");
 }finally{
  await handlers.session_shutdown?.({reason:"quit"},ctx);
  if(oldBin===undefined)delete process.env.PI_SUBAGENT_BIN;else process.env.PI_SUBAGENT_BIN=oldBin;
  if(oldArgs===undefined)delete process.env.PI_SUBAGENT_BIN_ARGS;else process.env.PI_SUBAGENT_BIN_ARGS=oldArgs;
 }
},15000);

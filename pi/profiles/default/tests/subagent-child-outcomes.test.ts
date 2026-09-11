import { expect, it, vi } from "vitest";
const request=vi.hoisted(()=>vi.fn());
vi.mock("../lib/subagents/transport.ts",()=>({requestParent:request}));
import { bindChildSurface } from "../lib/subagents/child-surface.ts";
import childAuthority from "../extensions/subagent-child.ts";
it("yields parent questions as terminating tool results instead of polling",async()=>{
 const beforeAuthority=process.env.PI_SUBAGENT_AUTHORITY,beforeEndpoint=process.env.PI_SUBAGENT_ENDPOINT;
 process.env.PI_SUBAGENT_AUTHORITY=JSON.stringify({id:"leaf",agent:"probe",tools:["subagent_parent"],delegates:[],cwd:process.cwd(),skills:[]});
 process.env.PI_SUBAGENT_ENDPOINT=JSON.stringify({child:"leaf",origin:"origin",run:"run",port:1,token:"inert"});
 const tools:any={};const pi:any={registerTool:(tool:any)=>{tools[tool.name]=tool},registerCommand:()=>{},on:()=>{},setActiveTools:()=>{},getAllTools:()=>[],sendMessage:vi.fn()};
 request.mockResolvedValue({id:"request-1"});
 try{
  childAuthority(pi);
  const result=await tools.subagent_parent.execute("question",{action:"question",message:"Include generated files?"},undefined);
  expect(result.terminate).toBe(true);expect(result.details).toMatchObject({requestId:"request-1",protocol:"question-answer"});
  expect(request.mock.calls.map(([,message])=>message.type)).toEqual(["question"]);
 }finally{
  if(beforeAuthority===undefined)delete process.env.PI_SUBAGENT_AUTHORITY;else process.env.PI_SUBAGENT_AUTHORITY=beforeAuthority;
  if(beforeEndpoint===undefined)delete process.env.PI_SUBAGENT_ENDPOINT;else process.env.PI_SUBAGENT_ENDPOINT=beforeEndpoint;
 }
});

it("keeps permission input local and reports ordinary interactive input without takeover",async()=>{
 vi.useFakeTimers();
 const before=process.env.PI_SUBAGENT_ENDPOINT;process.env.PI_SUBAGENT_ENDPOINT=JSON.stringify({child:"visible-child",origin:"origin",run:"run",port:1,token:"inert"});
 const handlers:Record<string,Function[]>={};const requests:any[]=[];
 const pi:any={on:(name:string,handler:Function)=>(handlers[name]??=[]).push(handler),registerCommand:()=>{},sendMessage:vi.fn()};
 const ctx:any={isIdle:()=>true,ui:{setStatus:vi.fn(),notify:vi.fn()},abort:vi.fn(),shutdown:vi.fn()};
 request.mockImplementation(async(_endpoint,message)=>{requests.push(message);if(message.type==="app-ready")return{accepted:true};if(message.type==="app-poll")return{commands:[]};return{accepted:true};});
 const emit=async(name:string,event:any={})=>{for(const handler of handlers[name]??[])await handler(event,ctx)};
 try{
  bindChildSurface(pi,true);await emit("session_start");
  await emit("ui_prompt_start");await emit("input",{source:"interactive",text:"allow"});
  expect(requests.some(message=>message.type==="operator-input")).toBe(false);
  await emit("ui_prompt_end");await emit("input",{source:"interactive",text:"continue normally"});
  expect(requests).toContainEqual(expect.objectContaining({type:"operator-input",payload:expect.objectContaining({text:"continue normally"})}));
  expect(requests.some(message=>message.type==="intervene")).toBe(false);
  await vi.advanceTimersByTimeAsync(250);
 }finally{
  await emit("session_shutdown",{reason:"quit"});vi.useRealTimers();
  if(before===undefined)delete process.env.PI_SUBAGENT_ENDPOINT;else process.env.PI_SUBAGENT_ENDPOINT=before;
 }
});

it("coordinator forwards outcomes, never heartbeat progress, and acknowledges only journaled messages across reload",async()=>{
 vi.useFakeTimers();
 const before=process.env.PI_SUBAGENT_ENDPOINT;
 process.env.PI_SUBAGENT_ENDPOINT=JSON.stringify({child:"coordinator",origin:"origin",run:"run",port:1,token:"inert"});
 const delivery={id:"leaf",agent:"probe",origin:"origin",parentId:"coordinator",deliveryId:"outcome-1",status:"settled",outcome:"failed",error:"fixture failure"};
 let pending:any=delivery,idle=false;const messages:any[]=[];
 const handlers:Record<string,Function[]>={};
 const pi:any={on:(name:string,handler:Function)=>(handlers[name]??=[]).push(handler),registerCommand:()=>{},sendMessage:(message:any)=>messages.push(message)};
 const ctx:any={isIdle:()=>idle,ui:{setStatus:()=>{},notify:()=>{}},abort:vi.fn(),shutdown:vi.fn()};
 const emit=async(name:string,event:any={})=>{for(const handler of handlers[name]??[])await handler(event,ctx)};
 request.mockImplementation(async(_endpoint,message)=>{if(message.type==="outcome-ack"){pending=undefined;return{accepted:true}}return{alive:true,delivery:pending}});
 try{
  bindChildSurface(pi,false);await emit("session_start");
  await vi.advanceTimersByTimeAsync(600);expect(messages).toHaveLength(1);expect(messages[0].content).toContain("fixture failure");
  idle=true;await vi.advanceTimersByTimeAsync(200);expect(messages).toHaveLength(1);
  expect(request.mock.calls.some(([,m])=>m.type==="outcome-ack")).toBe(false);
  await vi.advanceTimersByTimeAsync(400);expect(messages).toHaveLength(1);
  await emit("message_end",{message:{role:"custom",...messages[0]}});
  expect(request.mock.calls.some(([,m])=>m.type==="outcome-ack"&&m.payload==="outcome-1")).toBe(true);
  await emit("session_shutdown",{reason:"reload"});await emit("session_start");pending=delivery;
  await vi.advanceTimersByTimeAsync(400);expect(messages).toHaveLength(1);expect(ctx.shutdown).not.toHaveBeenCalled();
 }finally{
  await emit("session_shutdown",{reason:"quit"});vi.useRealTimers();
  if(before===undefined)delete process.env.PI_SUBAGENT_ENDPOINT;else process.env.PI_SUBAGENT_ENDPOINT=before;
 }
});

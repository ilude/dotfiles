import { expect, it, vi } from "vitest";
const request=vi.hoisted(()=>vi.fn());
vi.mock("../lib/subagents/transport.ts",()=>({requestParent:request}));
import { bindChildSurface } from "../lib/subagents/child-surface.ts";
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
  await vi.advanceTimersByTimeAsync(600);expect(messages).toEqual([]);
  idle=true;await vi.advanceTimersByTimeAsync(200);expect(messages).toHaveLength(1);expect(messages[0].content).toContain("fixture failure");
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

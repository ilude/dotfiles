import { resolveSkills } from "../lib/subagents/options.ts";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadDefinitions, resolveModel, EFFORTS, type AgentEffort } from "../lib/subagents/definitions.ts";
import { VisibleChild } from "../lib/subagents/visible.ts";
import { getSubagentRuntime, type Delivery } from "../lib/subagents/runtime.ts";
import { outcomeText, statusLines } from "../lib/subagents/status.ts";
const Surface=Type.Union([Type.Literal("headless"),Type.Literal("visible")]);
const Effort=Type.Union(EFFORTS.map(x=>Type.Literal(x)) as any);
function output(value:unknown,error=false){return{content:[{type:"text" as const,text:JSON.stringify(value,null,2)}],details:value,isError:error}}
export default function subagents(pi:ExtensionAPI){
 if(process.env.PI_SUBAGENT_AUTHORITY)return;
 const runtime=getSubagentRuntime(),profile=resolve(getAgentDir()),childExt=join(dirname(fileURLToPath(import.meta.url)),"subagent-child.ts");
 let origin="",catalog=loadDefinitions(process.cwd(),false),current:ExtensionContext|undefined;
 let timer:ReturnType<typeof setInterval>|undefined,lastView="";
 const modernRuntime=typeof runtime.wait==="function";
 const upgradeNotice="Existing subagents still belong to the pre-upgrade runtime. Finish/cancel them before restarting Pi to enable the new runtime; /reload does not replace live owners.";
 const requireModernRuntime=()=>{if(!modernRuntime)throw new Error(upgradeNotice)};
 const render=()=>{
  if(!current?.hasUI||current.sessionManager.getSessionId()!==origin)return;
  const lines=statusLines(runtime.list(origin));
  if(!modernRuntime)lines.unshift(upgradeNotice);
  const view=JSON.stringify(lines);
  if(view===lastView)return;
  lastView=view;current.ui.setWidget("subagents",lines.length?lines:undefined);
 };
 const deliver=(r:Delivery)=>{
  if(r.origin!==origin||!current||current.sessionManager.getSessionId()!==origin||!current.isIdle())return false;
  pi.sendMessage({customType:"subagent-result",details:{deliveryId:r.deliveryId,origin:r.origin},content:outcomeText(r),display:true},{triggerTurn:true,deliverAs:"followUp"});
  return true;
 };
 // Progress never invokes sendMessage. The one-second view refresh coalesces streaming
 // events and advances inactivity age even when absolutely nothing is arriving.
 const binding={deliver};
 pi.on("session_start",(_e,ctx)=>{
  if(origin)runtime.unbind(origin,binding);
  current=ctx;origin=ctx.sessionManager.getSessionId();lastView="";
  catalog=loadDefinitions(ctx.cwd,ctx.isProjectTrusted());runtime.bind(origin,binding);render();
  if(timer)clearInterval(timer);
  timer=setInterval(render,1000);timer.unref();
 });
 pi.on("session_shutdown",async(e)=>{
  runtime.unbind(origin,binding);if(timer)clearInterval(timer);timer=undefined;
  current?.ui.setWidget("subagents",undefined);current=undefined;
  if(e.reason==="quit")await runtime.shutdown("quit");
 });
 pi.on("message_end",(event,ctx)=>{
  const message=event.message as any;
  if(message.role==="custom"&&message.customType==="subagent-result"&&message.details?.origin===ctx.sessionManager.getSessionId())runtime.acknowledge(message.details.origin,message.details.deliveryId);
 });
 pi.on("agent_settled",()=>{runtime.flush(origin);render()});
 pi.on("before_agent_start",event=>({systemPrompt:`${event.systemPrompt}\n\nDelegation: use subagent for bounded specialist work. Use a teamlead only when coordination helps. Councils are only on explicit user request. Normally use at most four Team Leads, eight leaves per lead, or twelve direct workers where a lead adds no value. Prefer small jobs that finish relatively quickly. These counts and council structure are guidance, not runtime quotas. Inspect and continue retained conversations with subagent_control.`}));
 pi.registerTool({name:"subagent",label:"Subagent",description:"Launch one defined subagent. Omit surface for normal delegation: visible in Herdr, headless elsewhere. Inside Herdr, select headless only when the user requests it, not merely because work is parallel, unattended, or in a worktree. Interrupting a foreground wait does not cancel the child; outcomes return automatically.",parameters:Type.Object({agent:Type.String(),instructions:Type.String(),cwd:Type.Optional(Type.String()),model:Type.Optional(Type.String()),effort:Type.Optional(Effort),skills:Type.Optional(Type.Array(Type.String())),background:Type.Optional(Type.Boolean()),surface:Type.Optional(Surface),retain:Type.Optional(Type.Boolean())}),async execute(_id,p,signal,_update,ctx){try{
  requireModernRuntime();
  catalog=loadDefinitions(ctx.cwd,ctx.isProjectTrusted());const d=catalog.agents.get(p.agent);if(!d)throw new Error(`Unknown or invalid agent ${p.agent}. ${catalog.errors.join("; ")}`);
  const chosen=p.model??d.model;resolveModel(chosen,undefined);const skills=resolveSkills(profile,d.skills,p.skills);
  const surface=p.surface??(process.env.HERDR_ENV==="1"?"visible":"headless");
  const r=await runtime.launch({definition:d,instructions:p.instructions,cwd:resolve(ctx.cwd,p.cwd||"."),model:chosen!,effort:(p.effort??d.effort??"low") as AgentEffort,skills,origin:ctx.sessionManager.getSessionId(),retained:p.retain??false,surface,catalog:catalog.agents},profile,childExt,p.background??false,signal);
  render();return output(r,r.outcome==="failed");
 }catch(e){return output({error:e instanceof Error?e.message:String(e)},true)}}});
 pi.registerTool({name:"subagent_control",label:"Subagent control",description:"Inspect, wait again, continue, answer, finish, or cancel an owned subagent. wait reattaches to the same assignment; interrupting it only stops waiting. cancel stops owned work. Completion and failure return automatically; progress is UI-only.",parameters:Type.Object({action:Type.Union([Type.Literal("inspect"),Type.Literal("wait"),Type.Literal("message"),Type.Literal("answer"),Type.Literal("escalate"),Type.Literal("finish"),Type.Literal("cancel")]),id:Type.Optional(Type.String()),message:Type.Optional(Type.String())}),async execute(_id,p,signal,_update,ctx){try{
  const owner=ctx.sessionManager.getSessionId();
  if(p.action==="inspect")return output(p.id?runtime.get(p.id,owner).snapshot():runtime.list(owner));
  if(!p.id)throw new Error(`${p.action} requires id`);
  const c=runtime.get(p.id,owner);
  if(p.action==="wait"){requireModernRuntime();return output(await runtime.wait(p.id,owner,signal))}
  if(c.record.userOwned&&p.action!=="escalate")throw new Error("Parent control is suspended during direct user intervention; the user can use /subagents cancel");
  if(p.action==="message"){if(!p.message)throw new Error("message requires text");await c.message(p.message)}
  else if(p.action==="answer"){if(!p.message)throw new Error("answer requires text");await c.answer(p.message)}
  else if(p.action==="cancel")await c.cancel();else if(p.action==="finish")await c.finish();else if(p.action==="escalate")await c.escalate(ctx);
  render();return output(c.snapshot());
 }catch(e){return output({error:e instanceof Error?e.message:String(e)},true)}}});
 pi.registerCommand("subagents",{description:"Inspect, wait for, or cancel subagents without relaunching",handler:async(args,ctx)=>{
  const [cmd="inspect",id]=args.trim().split(/\s+/),owner=ctx.sessionManager.getSessionId();
  try{
   if(cmd==="cancel"&&id)await runtime.get(id,owner).cancel();
   else if(cmd==="wait"&&id){
    requireModernRuntime();
    // A cancellable user dialog detaches the wait, not the child. Tool callers use
    // subagent_control wait with their normal AbortSignal instead.
    const abort=new AbortController();
    const pending=runtime.wait(id,owner,abort.signal,false);
    const dialogAbort=new AbortController();
    const dialog=ctx.ui.select(`Waiting for ${id}. Stopping this wait does not cancel the child.`,["Stop waiting"],{signal:dialogAbort.signal});
    try{await Promise.race([pending,dialog]);}finally{abort.abort();dialogAbort.abort();await pending;}
   }else if(cmd&&cmd!=="inspect"&&cmd!=="cancel")throw new Error("Use /subagents inspect [id], wait <id>, or cancel <id>");
   else if(cmd==="cancel")throw new Error("cancel requires id");
   render();ctx.ui.notify(JSON.stringify(id?runtime.get(id,owner).snapshot():runtime.list(owner),null,2),"info");
  }catch(error){ctx.ui.notify(String(error),"error")}
 }});
 pi.registerCommand("subagent-return",{description:"Return an intervened visible child to parent control",handler:async(args,ctx)=>{const c=runtime.get(args.trim(),ctx.sessionManager.getSessionId());if(!(c instanceof VisibleChild))throw new Error("Only visible children have direct user handback");c.handback();ctx.ui.notify(`Returned ${c.record.id} to parent control`,"info")}});
}

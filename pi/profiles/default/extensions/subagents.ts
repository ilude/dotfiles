import { resolveSkills } from "../lib/subagents/options.ts";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadDefinitions, resolveModel, EFFORTS, type AgentEffort } from "../lib/subagents/definitions.ts";
import { VisibleChild } from "../lib/subagents/visible.ts";
import { getSubagentRuntime, retireSubagentRuntime, resetSubagentRuntime, SUBAGENT_RUNTIME_RESET, type Delivery } from "../lib/subagents/runtime.ts";
import { outcomeText } from "../lib/subagents/status.ts";
import { presentationDetails, progressResult, renderSubagentCall, renderSubagentControlCall, renderSubagentMessage, renderSubagentResult } from "../lib/subagents/presentation.ts";
import type { ChildRecord } from "../lib/subagents/rpc.ts";
import type { MessageOptions } from "../lib/subagents/transport.ts";
import { delegationContext } from "../lib/subagents/guidance.ts";
const Surface=Type.Union([Type.Literal("headless"),Type.Literal("visible")]);
const Effort=Type.Union(EFFORTS.map(x=>Type.Literal(x)) as any);
function output(value:unknown,error=false){return{content:[{type:"text" as const,text:JSON.stringify(value,null,2)}],details:value,isError:error}}
function updates(onUpdate:((value:any)=>void)|undefined){
 let active=true,pending:ChildRecord|undefined,timer:ReturnType<typeof setTimeout>|undefined;
 const emit=()=>{timer=undefined;if(!active||!pending)return;const record=pending;pending=undefined;onUpdate?.(progressResult(record));};
 const push=(record:ChildRecord)=>{if(!active)return;pending=record;if(!timer)timer=setTimeout(emit,100);};
 const stop=()=>{active=false;if(timer)clearTimeout(timer);timer=undefined;pending=undefined;};
 return {push,stop};
}
export default function subagents(pi:ExtensionAPI){
 if(process.env.PI_SUBAGENT_AUTHORITY)return;
 let runtime:ReturnType<typeof getSubagentRuntime>|undefined;
 const active=()=>runtime??=(getSubagentRuntime());
 const profile=resolve(getAgentDir()),childExt=join(dirname(fileURLToPath(import.meta.url)),"subagent-child.ts");
 let origin="",catalog=loadDefinitions(process.cwd(),false),current:ExtensionContext|undefined;
 const deliver=(r:Delivery)=>{
  if(r.origin!==origin||!current||current.sessionManager.getSessionId()!==origin)return false;
  pi.sendMessage({customType:"subagent-result",details:{deliveryId:r.deliveryId,origin:r.origin,...presentationDetails(r)},content:outcomeText(r),display:true},{triggerTurn:true,deliverAs:current.isIdle()?"followUp":"steer"});
  return true;
 };
 // Progress never invokes sendMessage. Results are delivered through the transcript
 // and remain available through /subagents; there is no persistent status widget.
 const binding={deliver};
 let unsubscribeReset=(pi as any).events?.on?.(SUBAGENT_RUNTIME_RESET,(respond:any)=>{if(typeof respond==="function")respond((async()=>{runtime=await resetSubagentRuntime("clear");})());})??(()=>{});
 (pi as any).registerMessageRenderer?.("subagent-result",renderSubagentMessage);
 pi.on("session_start",(_e,ctx)=>{
  if(origin&&runtime)runtime.unbind(origin,binding);
  runtime=getSubagentRuntime();
  current=ctx;origin=ctx.sessionManager.getSessionId();
  catalog=loadDefinitions(ctx.cwd,ctx.isProjectTrusted());runtime.bind(origin,binding);
 });
 pi.on("session_shutdown",async(e)=>{
  const owner=runtime;
  if(origin&&owner)owner.unbind(origin,binding);current=undefined;
  if(e.reason==="quit"&&owner){
   const cleanup=await owner.shutdown("quit");
   if(!cleanup.complete)console.error(`[subagent cleanup] ${cleanup.failures.map(f=>`${f.id}: ${f.error}`).join("; ")}`);
  }
  if(e.reason==="reload"&&owner)await retireSubagentRuntime();
  if(e.reason==="quit"||e.reason==="reload"){unsubscribeReset();unsubscribeReset=()=>{};}
 });
 pi.on("message_end",(event,ctx)=>{
  const message=event.message as any;
  if(message.role==="custom"&&message.customType==="subagent-result"&&message.details?.origin===ctx.sessionManager.getSessionId())runtime?.acknowledge(message.details.origin,message.details.deliveryId);
 });
 pi.on("agent_settled",()=>{runtime?.flush(origin)});
 pi.on("before_agent_start",event=>({systemPrompt:`${event.systemPrompt}\n\n${delegationContext({audience:"caller",definitions:catalog.agents})}\n\nUse a Team Lead only when coordination helps. Normally use at most four Team Leads, eight leaves per lead, or twelve direct workers where a lead adds no value. These counts are guidance, not runtime quotas. Keep existing surface selection and retained-conversation controls. Inspect and continue retained conversations with subagent_control. Subagent notifications are evidence to incorporate, not receipts to acknowledge. Answer a question-answer request through subagent_control and report material changes in your next useful response.`}));
 pi.registerTool({name:"subagent",label:"Subagent",description:"Launch one defined subagent. Omit surface for normal delegation: visible in Herdr, headless elsewhere. Inside Herdr, select headless only when the user requests it, not merely because work is parallel, unattended, or in a worktree. Interrupting a foreground wait does not cancel the child; outcomes return automatically.",parameters:Type.Object({agent:Type.String(),instructions:Type.String(),cwd:Type.Optional(Type.String()),model:Type.Optional(Type.String()),effort:Type.Optional(Effort),skills:Type.Optional(Type.Array(Type.String())),background:Type.Optional(Type.Boolean()),surface:Type.Optional(Surface),retain:Type.Optional(Type.Boolean())}),renderCall:renderSubagentCall,renderResult:renderSubagentResult,async execute(_id,p,signal,onUpdate,ctx){try{
  catalog=loadDefinitions(ctx.cwd,ctx.isProjectTrusted());const d=catalog.agents.get(p.agent);if(!d)throw new Error(`Unknown or invalid agent ${p.agent}. ${catalog.errors.join("; ")}`);
  const chosen=p.model??d.model;resolveModel(chosen,undefined);const skills=resolveSkills(profile,d.skills,p.skills);
  const surface=p.surface??(process.env.HERDR_ENV==="1"?"visible":"headless");
  const attached=!(p.background??false),bridge=attached?updates(onUpdate):undefined;
  try{
   const r=await active().launch({definition:d,instructions:p.instructions,cwd:resolve(ctx.cwd,p.cwd||"."),model:chosen!,effort:(p.effort??d.effort??"low") as AgentEffort,skills,origin:ctx.sessionManager.getSessionId(),retained:p.retain??false,surface,catalog:catalog.agents,progress:bridge?.push},profile,childExt,p.background??false,signal);
   return output(r,r.outcome==="failed");
  }finally{bridge?.stop()}
 }catch(e){return output({error:e instanceof Error?e.message:String(e)},true)}}});
 pi.registerTool({name:"subagent_control",label:"Subagent control",description:"Inspect, wait again, message, answer, finish, or cancel an owned subagent. Messages use queued native steering by default; immediate is an intentional redirect. wait reattaches to the same assignment; interrupting it only stops waiting. cancel stops owned work. Completion and failure return automatically; progress is UI-only.",parameters:Type.Object({action:Type.Union([Type.Literal("inspect"),Type.Literal("wait"),Type.Literal("message"),Type.Literal("answer"),Type.Literal("escalate"),Type.Literal("finish"),Type.Literal("cancel")]),id:Type.Optional(Type.String()),message:Type.Optional(Type.String()),delivery:Type.Optional(Type.Union([Type.Literal("queued"),Type.Literal("immediate")])),interaction:Type.Optional(Type.Union([Type.Literal("notify"),Type.Literal("request")])),protocol:Type.Optional(Type.Literal("question-answer")),replyTo:Type.Optional(Type.String()),consume:Type.Optional(Type.Boolean())}),renderCall:renderSubagentControlCall,renderResult:renderSubagentResult,async execute(_id,p,signal,onUpdate,ctx){try{
  const owner=ctx.sessionManager.getSessionId();
  if(p.action==="inspect"){
   if(!p.id)return output(active().list(owner));
   const record=active().get(p.id,owner).snapshot();
   if(p.consume&&record.status!=="running")active().acknowledgeRecord(owner,record.id);
   return output(record);
  }
  if(!p.id)throw new Error(`${p.action} requires id or name`);
  const c=active().get(p.id,owner);
  if(p.action==="wait"){
   const bridge=updates(onUpdate),unsubscribe=active().subscribe(p.id,owner,bridge.push),refresh=setInterval(()=>bridge.push(c.snapshot()),1000);refresh.unref();
   try{return output(await active().wait(p.id,owner,signal))}finally{clearInterval(refresh);unsubscribe();bridge.stop()}
  }
  if(c.record.userOwned&&p.action!=="escalate")throw new Error("Parent control is suspended during direct user intervention; the user can use /subagents cancel");
  if(p.action==="message"){
   if(!p.message)throw new Error("message requires text");
   const options:MessageOptions={delivery:p.delivery,interaction:p.interaction,protocol:p.protocol,replyTo:p.replyTo};
   if(p.replyTo)await c.answer(p.message,p.replyTo);else await c.message(p.message,options);
  }
  else if(p.action==="answer"){if(!p.message)throw new Error("answer requires text");await c.answer(p.message,p.replyTo)}
  else if(p.action==="cancel")await c.cancel();else if(p.action==="finish")await c.finish();else if(p.action==="escalate")await c.escalate(ctx);
  return output(c.snapshot());
 }catch(e){throw new Error(e instanceof Error?e.message:String(e))}}});
 pi.registerCommand("subagents",{description:"Inspect, wait for, or cancel subagents without relaunching",handler:async(args,ctx)=>{
  const [cmd="inspect",id]=args.trim().split(/\s+/),owner=ctx.sessionManager.getSessionId();
  try{
   if(cmd==="cancel"&&id)await active().get(id,owner).cancel();
   else if(cmd==="wait"&&id){
    // A cancellable user dialog detaches the wait, not the child. Tool callers use
    // subagent_control wait with their normal AbortSignal instead.
    const abort=new AbortController();
    const child=active().get(id,owner);
    const pending=active().wait(id,owner,abort.signal,false);
    const dialogAbort=new AbortController();
    const dialog=ctx.ui.select(`Waiting for ${child.record.displayName??id}. Stopping this wait does not cancel the child.`,["Stop waiting"],{signal:dialogAbort.signal});
    try{await Promise.race([pending,dialog]);}finally{abort.abort();dialogAbort.abort();await pending;}
   }else if(cmd&&cmd!=="inspect"&&cmd!=="cancel")throw new Error("Use /subagents inspect [id-or-name], wait <id-or-name>, or cancel <id-or-name>");
   else if(cmd==="cancel")throw new Error("cancel requires id");
   ctx.ui.notify(JSON.stringify(id?active().get(id,owner).snapshot():active().list(owner),null,2),"info");
  }catch(error){ctx.ui.notify(String(error),"error")}
 }});
 pi.registerCommand("subagent-return",{description:"Return an intervened visible child to parent control",handler:async(args,ctx)=>{const c=active().get(args.trim(),ctx.sessionManager.getSessionId());if(!(c instanceof VisibleChild))throw new Error("Only visible children have direct user handback");c.handback();ctx.ui.notify(`Returned ${c.record.displayName??c.record.id} to parent control`,"info")}});
}

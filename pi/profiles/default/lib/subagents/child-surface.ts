import { writeFileSync } from "node:fs";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { requestParent, type ChildEndpoint } from "./transport.ts";
import { outcomeText } from "./status.ts";
import { presentationDetails } from "./presentation.ts";
import type { Delivery } from "./runtime.ts";
interface State { generation:number;seen:Set<string>;ctx?:ExtensionContext;tick?:()=>Promise<void>;timer?:ReturnType<typeof setInterval>;busy:boolean;userOwned:boolean;parentGone:boolean;turn:number;last:string;error?:string;prompt:boolean;unbind?:()=>void;activity?:{phase:"model"|"tool";toolName?:string};delivered?:Set<string>;queuedDelivery?:string }
const key=Symbol.for("dotfiles.pi.subagent.surface.v1");
export function bindChildSurface(pi:ExtensionAPI,visible:boolean){
 const raw=process.env.PI_SUBAGENT_ENDPOINT;
 if(!raw)return; // Offline loader fixtures have no parent process.
 const endpoint=JSON.parse(raw) as ChildEndpoint;
 const global=globalThis as typeof globalThis&{[key]?:State};
 const state=global[key]??={generation:0,seen:new Set(),busy:false,userOwned:false,parentGone:false,turn:0,last:"",prompt:false};
 state.delivered??=new Set();
 const receiveOutcome=async(delivery?:Delivery)=>{
  if(!delivery||state.userOwned||!state.ctx)return;
  if(state.delivered!.has(delivery.deliveryId)){
   await requestParent(endpoint,{type:"outcome-ack",payload:delivery.deliveryId});return;
  }
  if(!state.ctx.isIdle()||state.queuedDelivery===delivery.deliveryId)return;
  state.queuedDelivery=delivery.deliveryId;
  pi.sendMessage({customType:"subagent-result",content:outcomeText(delivery),display:true,details:{deliveryId:delivery.deliveryId,parentId:endpoint.child,...presentationDetails(delivery)}},{triggerTurn:true,deliverAs:"followUp"});
 };
 const mark=(owned:boolean)=>{
  state.userOwned=owned;
  if(process.env.PI_SUBAGENT_INTERVENTION_FILE)writeFileSync(process.env.PI_SUBAGENT_INTERVENTION_FILE,JSON.stringify({token:endpoint.token,userOwned:owned}));
  state.ctx?.ui.setStatus("subagent-parent",state.parentGone?"Parent unavailable":owned?"User intervention; /subagent-return to hand back":undefined);
 };
 const unavailable=()=>{
  state.parentGone=true;
  if(visible&&state.userOwned){mark(true);return}
  void state.ctx?.abort();state.ctx?.shutdown();
 };
 const intervene=async()=>{
  mark(true);
  try{await requestParent(endpoint,{type:"intervene"})}catch{unavailable()}
 };
 const handback=async()=>{
  if(state.parentGone){state.ctx?.ui.notify("Parent unavailable; continue directly or exit this child","warning");return}
  await requestParent(endpoint,{type:"handback"});mark(false);
 };
 pi.on("session_start",async(_event,ctx)=>{
  state.ctx=ctx;state.queuedDelivery=undefined;
  const generation=++state.generation;
  state.unbind?.();
  if(visible){
   state.unbind=ctx.ui.onTerminalInput(()=>{if(state.prompt&&!state.userOwned)void intervene();return undefined});
   try{await requestParent(endpoint,{type:"app-ready",payload:{tools:pi.getActiveTools()}})}catch{unavailable()}
  }
  state.tick=async()=>{
   if(!state.ctx||state.parentGone)return;
   try{
    if(!visible){const response=await requestParent(endpoint,{type:"heartbeat"}) as {delivery?:Delivery};await receiveOutcome(response.delivery);return}
    const activity=state.activity;
    const response=await requestParent(endpoint,{type:"app-poll",payload:activity}) as {commands:Array<{id:string;type:string;message?:string}>;delivery?:Delivery};
    if(state.activity===activity)state.activity=undefined;
    await receiveOutcome(response.delivery);
    for(const command of response.commands){
     if(generation!==state.generation||!state.ctx)return;
     if(!state.seen.has(command.id)){
      if(command.type==="intervene"){mark(true);await requestParent(endpoint,{type:"intervention-ready"})}
      else if(command.type==="handback")await handback();
      else if(command.type==="message"&&!state.userOwned&&command.message){state.last="";pi.sendUserMessage(command.message,{deliverAs:"followUp"})}
      else continue;
      state.seen.add(command.id);
     }
     await requestParent(endpoint,{type:"app-ack",payload:command.id});
    }
   }catch{if(generation===state.generation)unavailable()}
  };
  state.timer??=setInterval(()=>{if(state.busy)return;state.busy=true;void state.tick?.().finally(()=>{state.busy=false})},200);
  state.timer.unref();
 });
 pi.on("message_end",async event=>{
  const message=event.message as any;
  if(message.role!=="custom"||message.customType!=="subagent-result"||message.details?.parentId!==endpoint.child)return;
  const id=message.details.deliveryId;
  state.delivered!.add(id);state.queuedDelivery=undefined;
  try{await requestParent(endpoint,{type:"outcome-ack",payload:id})}catch{unavailable()}
 });
 pi.on("input",async event=>{if(visible&&event.source==="interactive")await intervene();return{action:"continue"}});
 pi.on("ui_prompt_start",()=>{state.prompt=true});
 pi.on("ui_prompt_end",()=>{state.prompt=false});
 if(visible){
  pi.on("turn_start",()=>{state.activity={phase:"model"}});
  pi.on("message_update",()=>{state.activity={phase:"model"}});
  pi.on("tool_execution_start",event=>{state.activity={phase:"tool",toolName:event.toolName}});
  pi.on("tool_execution_update",event=>{state.activity={phase:"tool",toolName:event.toolName}});
  pi.on("tool_execution_end",()=>{state.activity={phase:"model"}});
 }
 pi.on("message_end",event=>{if(event.message.role==="assistant"){state.error=event.message.stopReason==="error"||event.message.stopReason==="aborted"?event.message.errorMessage||`Child model ${event.message.stopReason}`:undefined;state.last=event.message.content.filter(part=>part.type==="text").map(part=>part.text).join("\n").slice(0,24_000)}});
 pi.on("agent_settled",async()=>{
  if(!visible||state.parentGone)return;
  try{await requestParent(endpoint,{type:"turn",payload:{turn:++state.turn,text:state.last,error:state.error}})}catch{unavailable()}
 });
 pi.on("session_shutdown",event=>{
  state.unbind?.();state.unbind=undefined;state.ctx=undefined;
  if(event.reason==="quit"){if(state.timer)clearInterval(state.timer);state.timer=undefined}
 });
 pi.registerCommand("subagent-return",{description:"Hand this child back to its originating parent",handler:async()=>handback()});
}

import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { ChildTransport, type ChildIdentity, type ApplicationMessage } from "./transport.ts";
import type { AgentDefinition, AgentEffort } from "./definitions.ts";
import { VisibleChild } from "./visible.ts";
import { RpcChild, type ChildRecord, type LaunchSpec } from "./rpc.ts";
import { EFFORTS, resolveModel, resolveSkills } from "./options.ts";
import { inside, workspaceRoot } from "./workspace.ts";
import { NameAllocator } from "./names.ts";
import { SubagentLayout } from "./layout.ts";
import { createHerdrCli } from "../herdr-cli.ts";
export interface Delivery extends ChildRecord { deliveryId: string }
export interface BoundOrigin { deliver: (record: Delivery) => boolean; status?: (records: ChildRecord[]) => void }
interface Input { definition:AgentDefinition;instructions:string;cwd:string;model:string;effort:AgentEffort;skills:string[];origin:string;retained:boolean;parentId?:string;surface:"headless"|"visible";catalog?:Map<string,AgentDefinition>;progress?:(record:ChildRecord)=>void }
interface Context { input:Input;profile:string;extension:string;catalog:Map<string,AgentDefinition> }
export class SubagentRuntime {
 private children=new Map<string,RpcChild>();
 private contexts=new Map<string,Context>();
 private bindings=new Map<string,BoundOrigin>();
 private pending=new Map<string,Delivery>();
 private queued=new Set<string>();
 private names=new Map<string,NameAllocator>();
 private layouts=new Map<string,SubagentLayout>();
 private observers=new Map<string,Set<(record:ChildRecord)=>void>>();
 private transport=new ChildTransport((identity,message)=>this.dispatch(identity,message));
 bind(origin:string,binding:BoundOrigin){this.bindings.set(origin,binding);this.publish(origin);this.flush(origin)}
 flush(origin:string){const binding=this.bindings.get(origin);if(!binding)return;for(const [id,record] of this.pending){if(record.origin===origin&&!record.parentId&&!this.queued.has(id)&&binding.deliver(record)&&this.pending.has(id))this.queued.add(id)}}
 private publish(origin:string){this.bindings.get(origin)?.status?.(this.list(origin));}
 acknowledge(origin:string,id:string){if(this.pending.get(id)?.origin!==origin)return;this.pending.delete(id);this.queued.delete(id)}
 unbind(origin:string,binding:BoundOrigin){if(this.bindings.get(origin)===binding)this.bindings.delete(origin)}
 private deliver(record:ChildRecord){
  const parent=record.parentId?this.children.get(record.parentId):undefined;
  const delivery={...record,deliveryId:randomUUID()};
  if(record.parentId&&record.phase==="waiting-user"){
   delivery.notice=`User-only input for a child of coordinator ${record.parentId}; escalate through the originating user's UI.`;
   delivery.parentId=undefined;
  }else if(record.parentId&&(!parent||parent.record.status==="settled")){
   delivery.notice=`Coordinator ${record.parentId} is no longer active; outcome forwarded to originating orchestrator.`;
   delivery.parentId=undefined;
  }
  this.pending.set(delivery.deliveryId,delivery);
  this.flush(record.origin);
 }
 private async dispatch(identity:Readonly<ChildIdentity>,message:ApplicationMessage):Promise<unknown>{
  const child=this.children.get(identity.child),context=this.contexts.get(identity.child);
  if(!child||!context||child.record.origin!==identity.origin)throw new Error("Child owner unavailable");
  child.contact();
  const delivery=child.record.userOwned?undefined:[...this.pending.values()].find(r=>r.parentId===identity.child);
  if(message.type==="heartbeat")return{alive:true,delivery};
  if(message.type==="app-poll")return{...child.parentMessage(message) as object,delivery};
  if(message.type==="outcome-ack"){
   if(typeof message.payload!=="string")throw new Error("Outcome acknowledgement requires an id");
   const pending=this.pending.get(message.payload);
   if(pending&&pending.parentId!==identity.child)throw new Error("Outcome acknowledgement is outside direct child ownership");
   this.acknowledge(identity.origin,message.payload);return{accepted:true};
  }
  if(message.type==="delegate"){
   if(child.record.status==="settled")throw new Error("Parent assignment is settled");
   const payload=message.payload as {agent?:unknown;instructions?:unknown;retain?:unknown;background?:unknown;cwd?:unknown;model?:unknown;effort?:unknown;skills?:unknown;surface?:unknown};
   if(!payload||typeof payload.agent!=="string"||typeof payload.instructions!=="string"||!payload.instructions.trim())throw new Error("Invalid delegation");
   if(!context.input.definition.tools.includes("subagent")||!context.input.definition.delegates.includes(payload.agent))throw new Error("Delegation is outside frozen authority");
   const definition=context.catalog.get(payload.agent);
   if(!definition||definition.delegates.length)throw new Error("Only permitted leaf definitions may be commissioned");
   for(const key of ["cwd","model","effort"] as const)if(payload[key]!==undefined&&typeof payload[key]!=="string")throw new Error(`Invalid ${key}`);
   if(payload.effort!==undefined&&!EFFORTS.includes(payload.effort as AgentEffort))throw new Error("Invalid effort");
   if(payload.surface!==undefined&&payload.surface!=="visible"&&payload.surface!=="headless")throw new Error("Invalid surface");
   const model=(payload.model as string|undefined)??definition.model;resolveModel(model,undefined);
   return this.launch({definition,instructions:payload.instructions,cwd:resolve(context.input.cwd,(payload.cwd as string|undefined)??"."),model:model!,effort:(payload.effort as AgentEffort|undefined)??definition.effort??"low",skills:resolveSkills(context.profile,definition.skills,payload.skills),origin:identity.origin,retained:payload.retain===true,parentId:identity.child,surface:(payload.surface as "headless"|"visible"|undefined)??context.input.surface,catalog:context.catalog},context.profile,context.extension,true,undefined,payload.background===true?"background":"attached");
  }
  if(message.type==="control"){
   if(!context.input.definition.tools.includes("subagent_control"))throw new Error("Control is outside frozen authority");
   const payload=message.payload as {id?:unknown;action?:unknown;message?:unknown};
   if(!payload||typeof payload.id!=="string")throw new Error("Child id or name required");
   const target=this.getDirectChild(payload.id,identity.child,identity.origin);
   if(!target)throw new Error("Only direct children may be controlled");
   if(target.record.userOwned&&payload.action!=="inspect")throw new Error("Parent control is suspended during direct user intervention");
   if(payload.action==="message"||payload.action==="answer"){
    if(typeof payload.message!=="string")throw new Error("Message required");
    await target[payload.action](payload.message);
   }else if(payload.action==="cancel")await target.cancel();
   else if(payload.action==="finish")await target.finish();
   else if(payload.action!=="inspect")throw new Error("Unsupported child control");
   return target.snapshot();
  }
  return child.parentMessage(message);
 }
 async launch(input:Input,profileDir:string,childExtension:string,background:boolean,signal?:AbortSignal,initialWaitState?:"attached"|"background"):Promise<ChildRecord>{
  const cwd=workspaceRoot(resolve(input.cwd));
  if(input.parentId){
   const parent=this.children.get(input.parentId),context=this.contexts.get(input.parentId);
   if(!parent||!context||parent.record.status==="settled")throw new Error("Delegating parent is unavailable");
   if(parent.record.parentId||!context.input.definition.delegates.includes(input.definition.name)||input.definition.delegates.length)throw new Error("Delegation is outside frozen authority");
   if(input.origin!==parent.record.origin||!inside(context.input.cwd,cwd))throw new Error("Child cannot widen parent workspace or change origin");
  }
  if(input.surface==="visible"&&process.env.HERDR_ENV!=="1")throw new Error("Visible subagents require Herdr; no headless substitution is permitted");
  const allocator=this.names.get(input.origin)??new NameAllocator();
  this.names.set(input.origin,allocator);
  const frozen={...input,cwd,displayName:allocator.allocate()};
  const child=input.surface==="visible"
   ?new VisibleChild(frozen as LaunchSpec,resolve(childExtension),resolve(profileDir),this.layoutFor(input.origin))
   :new RpcChild(frozen as LaunchSpec,resolve(childExtension),resolve(profileDir));
  this.children.set(child.record.id,child);
  this.contexts.set(child.record.id,{input:frozen,profile:resolve(profileDir),extension:resolve(childExtension),catalog:new Map(input.catalog??[[input.definition.name,input.definition]])});
  child.hasOutstandingChildren=()=>[...this.children.values()].some(c=>c.record.parentId===child.record.id&&(c.record.status!=="settled"||c.record.phase==="cleanup"))||[...this.pending.values()].some(r=>r.parentId===child.record.id);
  child.record.waitState=initialWaitState??(background?"background":"attached");
  child.onProgress=record=>{
   this.publish(record.origin);
   input.progress?.(record);
   for(const observer of this.observers.get(record.id)??[])observer(record);
  };
  child.onUpdate=record=>{
   this.publish(record.origin);
   input.progress?.(record);
   for(const observer of this.observers.get(record.id)??[])observer(record);
   if(record.waitState!=="attached")this.deliver(record);
   if(record.status==="settled"){
    for(const pending of this.pending.values())if(pending.parentId===record.id){pending.parentId=undefined;pending.notice=`Coordinator ${record.id} ended before receiving this outcome; forwarded to originating orchestrator.`}
    this.flush(record.origin);
    if(!record.retained&&!record.userOwned)this.transport.revoke(record.id);
   }
  };
  try{
   const endpoint=await this.transport.register({child:child.record.id,run:randomUUID(),origin:input.origin});
   void child.start(endpoint).catch(error=>child.launchFailed(error));
  }catch(error){child.launchFailed(error)}
  this.publish(input.origin);
  if(background)return child.snapshot();
  const refresh=setInterval(()=>input.progress?.(child.snapshot()),1000);refresh.unref();
  try{return await this.wait(child.record.id,input.origin,signal)}finally{clearInterval(refresh)}
 }
 subscribe(id:string,origin:string,listener:(record:ChildRecord)=>void){
  const child=this.get(id,origin);
  const listeners=this.observers.get(child.record.id)??new Set<(record:ChildRecord)=>void>();
  listeners.add(listener);this.observers.set(child.record.id,listeners);listener(child.snapshot());
  return ()=>{listeners.delete(listener);if(!listeners.size)this.observers.delete(child.record.id)};
 }
 async wait(id:string,origin:string,signal?:AbortSignal,toolResult=true):Promise<ChildRecord>{
  const child=this.get(id,origin);
  try{return await child.wait(signal,toolResult)}finally{
   if(child.record.waitState==="attached")child.record.waitState="background";
   this.publish(origin);
  }
 }
 list(origin?:string){return [...this.children.values()].map(c=>c.snapshot()).filter(c=>!origin||c.origin===origin)}
 get(idOrName:string,origin?:string){
  const exactName=idOrName.toLocaleLowerCase("en-US");
  const names=[...this.children.values()].filter(child=>child.record.displayName?.toLocaleLowerCase("en-US")===exactName&&(!origin||child.record.origin===origin));
  if(names.length===1)return names[0];
  const matches=[...this.children.entries()].filter(([key,child])=>key.startsWith(idOrName)&&(!origin||child.record.origin===origin));
  if(matches.length!==1)throw new Error(matches.length||names.length>1?`Ambiguous child id or name: ${idOrName}`:`Unknown child: ${idOrName}`);
  return matches[0][1];
 }
 private getDirectChild(idOrName:string,parentId:string,origin:string){
  const exactName=idOrName.toLocaleLowerCase("en-US");
  const names=[...this.children.values()].filter(child=>child.record.parentId===parentId&&child.record.origin===origin&&child.record.displayName?.toLocaleLowerCase("en-US")===exactName);
  if(names.length===1)return names[0];
  const matches=[...this.children.entries()].filter(([key,child])=>key.startsWith(idOrName)&&child.record.parentId===parentId&&child.record.origin===origin);
  if(matches.length===1)return matches[0][1];
  if(names.length>1||matches.length>1)throw new Error(`Ambiguous child id or name: ${idOrName}`);
  return undefined;
 }
 private layoutFor(origin:string){let layout=this.layouts.get(origin);if(!layout){layout=new SubagentLayout(createHerdrCli());this.layouts.set(origin,layout)}return layout}
 async shutdown(reason:string){for(const child of this.children.values()){const record=child.snapshot();if(reason==="quit"&&record.surface==="visible"&&record.userOwned)continue;if(record.status!=="settled"||record.retained)await child.cancel()}await this.transport.close()}
}
const key=Symbol.for("dotfiles.pi.default.subagents.v1");
type RuntimeGlobal=typeof globalThis&{[key]?:SubagentRuntime};
export function getSubagentRuntime(){const g=globalThis as RuntimeGlobal;return g[key]??=new SubagentRuntime()}
export async function resetSubagentRuntime(reason="clear"){
 const g=globalThis as RuntimeGlobal,current=g[key];
 if(current)await current.shutdown(reason);
 const replacement=new SubagentRuntime();g[key]=replacement;return replacement;
}

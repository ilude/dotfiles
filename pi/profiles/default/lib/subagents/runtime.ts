import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { ChildTransport, type ChildIdentity, type ApplicationMessage, type MessageOptions } from "./transport.ts";
import type { AgentDefinition, AgentEffort } from "./definitions.ts";
import { VisibleChild } from "./visible.ts";
import { RpcChild, type ChildRecord, type LaunchSpec } from "./rpc.ts";
import { EFFORTS, resolveAgentEffort, resolveModel, resolveSkills } from "./options.ts";
import { workspaceRoot } from "./workspace.ts";
import { NameAllocator } from "./names.ts";
import { SubagentLayout } from "./layout.ts";
import { createHerdrCli } from "../herdr-cli.ts";
import { composedAgentPrompt } from "./guidance.ts";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
export interface Delivery extends ChildRecord { deliveryId: string }
export interface BoundOrigin { deliver: (record: Delivery) => boolean; status?: (records: ChildRecord[]) => void }
export interface CleanupSummary { complete: boolean; attempted: number; failures: Array<{ id: string; error: string }> }
export class RuntimeCleanupError extends Error {
 readonly summary: CleanupSummary;
 constructor(summary: CleanupSummary) { super("Subagent cleanup did not close every owned resource"); this.name = "RuntimeCleanupError"; this.summary = summary; }
}
interface Input { definition:AgentDefinition;instructions:string;cwd:string;model:string;effort:AgentEffort;skills:string[];origin:string;retained:boolean;parentId?:string;surface:"headless"|"visible";catalog?:Map<string,AgentDefinition>;modelRegistry?:ModelRegistry;progress?:(record:ChildRecord)=>void }
interface Context { input:Input;profile:string;extension:string;catalog:Map<string,AgentDefinition> }
export interface InertRuntimeState { names: Record<string, string[]>; outcomes: Delivery[] }

const inertStateKey = Symbol.for("dotfiles.pi.default.subagents.state.v2");
type InertStateGlobal = typeof globalThis & { [inertStateKey]?: InertRuntimeState };

function takeInertState(): InertRuntimeState | undefined {
 const g = globalThis as InertStateGlobal;
 const state = g[inertStateKey];
 delete g[inertStateKey];
 return state;
}
function saveInertState(state: InertRuntimeState): void {
 (globalThis as InertStateGlobal)[inertStateKey] = state;
}
function clearInertState(): void {
 delete (globalThis as InertStateGlobal)[inertStateKey];
}

/** A settled record carried over reload without its process, transport, or controls. */
class InertChild {
 readonly record: ChildRecord;
 constructor(record: ChildRecord) { this.record = { ...record, skills: record.skills ? [...record.skills] : undefined }; }
 snapshot(): ChildRecord { return { ...this.record, skills: this.record.skills ? [...this.record.skills] : undefined }; }
 wait(): Promise<ChildRecord> { return Promise.resolve(this.snapshot()); }
 private unavailable(): never { throw new Error("This settled subagent is no longer controllable after reload"); }
 async message(_value: string, _options?: MessageOptions): Promise<void> { this.unavailable(); }
 async command(_type: string, _data: Record<string, unknown> = {}): Promise<never> { return this.unavailable(); }
 async answer(_value: string, _replyTo?: string): Promise<void> { this.unavailable(); }
 async cancel(): Promise<void> { this.unavailable(); }
 async finish(): Promise<void> { this.unavailable(); }
 async escalate(_ctx: unknown): Promise<void> { this.unavailable(); }
}

export class SubagentRuntime {
 private children=new Map<string,RpcChild>();
 private contexts=new Map<string,Context>();
 private bindings=new Map<string,BoundOrigin>();
 private pending=new Map<string,Delivery>();
 private queued=new Set<string>();
 private names=new Map<string,NameAllocator>();
 private layouts=new Map<string,SubagentLayout>();
 private observers=new Map<string,Set<(record:ChildRecord)=>void>>();
 private inert=new Map<string,InertChild>();
 private transport=new ChildTransport((identity,message)=>this.dispatch(identity,message));
 private disposed=false;
 readonly ownerId=randomUUID();
 constructor(seed?:InertRuntimeState) {
  for(const [origin,used] of Object.entries(seed?.names??{})) {
   const allocator=new NameAllocator();
   for(const name of used)allocator.reserve(name);
   this.names.set(origin,allocator);
  }
  for(const outcome of seed?.outcomes??[]) {
   this.pending.set(outcome.deliveryId,{...outcome,skills:outcome.skills?[...outcome.skills]:undefined});
   this.inert.set(outcome.id,new InertChild(outcome));
  }
 }
 bind(origin:string,binding:BoundOrigin){this.bindings.set(origin,binding);this.publish(origin);this.flush(origin)}
 flush(origin:string){const binding=this.bindings.get(origin);if(!binding)return;for(const [id,record] of this.pending){if(record.origin===origin&&!record.parentId&&!this.queued.has(id)&&binding.deliver(record)&&this.pending.has(id))this.queued.add(id)}}
 private publish(origin:string){this.bindings.get(origin)?.status?.(this.list(origin));}
 acknowledge(origin:string,id:string){if(this.pending.get(id)?.origin!==origin)return;this.pending.delete(id);this.queued.delete(id);this.inert.delete(id)}
 acknowledgeRecord(origin:string,recordId:string){
  let found=false;
  for(const [deliveryId,record] of [...this.pending]){
   if(record.origin===origin&&record.id===recordId){this.acknowledge(origin,deliveryId);found=true;}
  }
  return found;
 }
 unbind(origin:string,binding:BoundOrigin){if(this.bindings.get(origin)===binding)this.bindings.delete(origin)}
 private deliver(record:ChildRecord){
  if(record.status!=="settled"&&record.status!=="waiting")return;
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
  if(message.type==="operator-input"){
   const wasIdle=child.record.status==="settled";
   const response=child.parentMessage(message);
   if(wasIdle&&child.record.status==="running"){
    for(const [deliveryId,pending] of [...this.pending]){
     if(pending.id===child.record.id||pending.parentId===child.record.id)this.acknowledge(identity.origin,deliveryId);
    }
   }
   return response;
  }
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
   const requestedModel=(payload.model as string|undefined)??definition.model;
   const resolved=resolveModel(requestedModel,undefined,context.input.modelRegistry),model=`${resolved.provider}/${resolved.id}`;
   return this.launch({definition,instructions:payload.instructions,cwd:resolve(context.input.cwd,(payload.cwd as string|undefined)??"."),model,effort:resolveAgentEffort(definition.name,model,payload.effort as AgentEffort|undefined,definition.effort),skills:resolveSkills(context.profile,definition.skills,payload.skills),origin:identity.origin,retained:payload.retain===true,parentId:identity.child,surface:(payload.surface as "headless"|"visible"|undefined)??context.input.surface,catalog:context.catalog,modelRegistry:context.input.modelRegistry},context.profile,context.extension,true,undefined,payload.background===true?"background":"attached");
  }
  if(message.type==="control"){
   if(!context.input.definition.tools.includes("subagent_control"))throw new Error("Control is outside frozen authority");
   const payload=message.payload as {id?:unknown;action?:unknown;message?:unknown;delivery?:unknown;interaction?:unknown;protocol?:unknown;replyTo?:unknown;consume?:unknown};
   if(!payload||typeof payload.id!=="string")throw new Error("Child id or name required");
   const target=this.getDirectChild(payload.id,identity.child,identity.origin);
   if(!target)throw new Error("Only direct children may be controlled");
   if(target.record.userOwned&&payload.action!=="inspect")throw new Error("Parent control is suspended during direct user intervention");
   if(payload.action==="message"||payload.action==="answer"){
    if(typeof payload.message!=="string")throw new Error("Message required");
    if(payload.action==="answer")await target.answer(payload.message,typeof payload.replyTo==="string"?payload.replyTo:undefined);
    else if(typeof payload.replyTo==="string")await target.answer(payload.message,payload.replyTo);
    else await target.message(payload.message,{delivery:payload.delivery as "queued"|"immediate"|undefined,interaction:payload.interaction as "notify"|"request"|undefined,protocol:payload.protocol as "question-answer"|undefined});
   }else if(payload.action==="cancel")await target.cancel();
   else if(payload.action==="finish")await target.finish();
   else if(payload.action!=="inspect")throw new Error("Unsupported child control");
   const snapshot=target.snapshot();
   if(payload.consume===true&&snapshot.status!=="running")this.acknowledgeRecord(identity.origin,snapshot.id);
   return snapshot;
  }
  return child.parentMessage(message);
 }
 async launch(input:Input,profileDir:string,childExtension:string,background:boolean,signal?:AbortSignal,initialWaitState?:"attached"|"background"):Promise<ChildRecord>{
  if(this.disposed)throw new Error("Subagent runtime is no longer active");
  const cwd=workspaceRoot(resolve(input.cwd));
  if(input.parentId){
   const parent=this.children.get(input.parentId),context=this.contexts.get(input.parentId);
   if(!parent||!context||parent.record.status==="settled")throw new Error("Delegating parent is unavailable");
   if(parent.record.parentId||!context.input.definition.delegates.includes(input.definition.name)||input.definition.delegates.length)throw new Error("Delegation is outside frozen authority");
   if(input.origin!==parent.record.origin)throw new Error("Child cannot change origin");
  }
  if(input.surface==="visible"&&process.env.HERDR_ENV!=="1")throw new Error("Visible subagents require Herdr; no headless substitution is permitted");
  const allocator=this.names.get(input.origin)??new NameAllocator();
  this.names.set(input.origin,allocator);
  const catalog=new Map(input.catalog??[[input.definition.name,input.definition]]);
  const parentDelegates=input.parentId?this.contexts.get(input.parentId)?.input.definition.delegates:undefined;
  const frozen={...input,cwd,displayName:allocator.allocate(),prompt:composedAgentPrompt(input.definition,catalog,parentDelegates)};
  const child=input.surface==="visible"
   ?new VisibleChild(frozen as LaunchSpec,resolve(childExtension),resolve(profileDir),this.layoutFor(input.origin))
   :new RpcChild(frozen as LaunchSpec,resolve(childExtension),resolve(profileDir));
  this.children.set(child.record.id,child);
  this.inert.delete(child.record.id);
  this.contexts.set(child.record.id,{input:frozen,profile:resolve(profileDir),extension:resolve(childExtension),catalog});
  child.hasOutstandingChildren=()=>[...this.children.values()].some(c=>c.record.parentId===child.record.id&&(c.record.status!=="settled"||c.record.phase==="cleanup"))||[...this.pending.values()].some(r=>r.parentId===child.record.id);
  child.record.waitState=initialWaitState??(background?"background":"attached");
  child.onProgress=record=>{
   this.reconcileCleanup(record);
   this.publish(record.origin);
   input.progress?.(record);
   for(const observer of this.observers.get(record.id)??[])observer(record);
  };
  child.onUpdate=record=>{
   this.publish(record.origin);
   input.progress?.(record);
   for(const observer of this.observers.get(record.id)??[])observer(record);
   if(record.waitState!=="attached"&&(record.status==="settled"||record.status==="waiting"))this.deliver(record);
   if(record.status==="settled"){
    for(const pending of this.pending.values())if(pending.parentId===record.id){pending.parentId=undefined;pending.notice=`Coordinator ${record.id} ended before receiving this outcome; forwarded to originating orchestrator.`}
    this.flush(record.origin);
    this.reconcileCleanup(record);
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
  try{
   const result=await child.wait(signal,toolResult);
   if(toolResult&&result.status!=="running")this.acknowledgeRecord(origin,result.id);
   return result;
  }finally{
   if(child.record.waitState==="attached")child.record.waitState="background";
   this.publish(origin);
  }
 }
 list(origin?:string){
  return [...this.children.values()].map(c=>c.snapshot()).concat([...this.inert.values()].map(c=>c.snapshot())).filter(c=>!origin||c.origin===origin);
 }
 get(idOrName:string,origin?:string){
  const exactName=idOrName.toLocaleLowerCase("en-US");
  const all=[...this.children.values(),...this.inert.values()];
  const names=all.filter(child=>child.record.displayName?.toLocaleLowerCase("en-US")===exactName&&(!origin||child.record.origin===origin));
  if(names.length===1)return names[0];
  const matches=all.filter(child=>child.record.id.startsWith(idOrName)&&(!origin||child.record.origin===origin));
  if(matches.length!==1)throw new Error(matches.length||names.length>1?`Ambiguous child id or name: ${idOrName}`:`Unknown child: ${idOrName}`);
  return matches[0];
 }
 private getDirectChild(idOrName:string,parentId:string,origin:string){
  const exactName=idOrName.toLocaleLowerCase("en-US");
  const all=[...this.children.values(),...this.inert.values()];
  const names=all.filter(child=>child.record.parentId===parentId&&child.record.origin===origin&&child.record.displayName?.toLocaleLowerCase("en-US")===exactName);
  if(names.length===1)return names[0];
  const matches=all.filter(child=>child.record.id.startsWith(idOrName)&&child.record.parentId===parentId&&child.record.origin===origin);
  if(matches.length===1)return matches[0];
  if(names.length>1||matches.length>1)throw new Error(`Ambiguous child id or name: ${idOrName}`);
  return undefined;
 }
 private layoutFor(origin:string){let layout=this.layouts.get(origin);if(!layout){layout=new SubagentLayout(createHerdrCli());this.layouts.set(origin,layout)}return layout}
 hasActiveResources(){
  return [...this.children.values()].some(child=>{
   const record=child.record;
   // Status/process exit can precede done(), which queues the final outcome.
    return record.status!=="settled"||record.phase!=="settled"||record.retained||record.processState!=="exited"||record.paneState==="open";
  });
 }
 private resourcesOpen(record:ChildRecord){
  return record.processState!=="exited"||record.paneState==="open";
 }
 private reconcileCleanup(record:ChildRecord){
  if(record.status==="settled"&&!record.retained&&!record.userOwned&&record.cleanup?.complete&&!this.resourcesOpen(record))this.transport.revoke(record.id);
 }
 async shutdown(reason:string):Promise<CleanupSummary>{
  if(this.disposed)return {complete:true,attempted:0,failures:[]};
  const failures:Array<{id:string;error:string}>=[];let attempted=0;
  // Each child gets its own attempt. A failed child must not skip independent ones.
  for(const child of this.children.values()){
   const record=child.snapshot();
   if(reason==="quit"&&record.surface==="visible"&&record.userOwned)continue;
   const needs=record.status!=="settled"||record.retained||this.resourcesOpen(record)||!record.cleanup?.complete;
   if(!needs)continue;
   attempted++;
   const cleanup=await child.cancel();
   if(!cleanup.complete)failures.push({id:record.id,error:cleanup.errors.at(-1)??"owned resources remain open"});
  }
  const summary={complete:failures.length===0,attempted,failures};
  if(!summary.complete)return summary;
  await this.transport.close();
  this.bindings.clear();this.observers.clear();this.layouts.clear();this.disposed=true;
  return summary;
 }
 /**
  * Ends this executable owner at a source reload. Reload is supported only after
  * all conversations, child processes, and retained children have settled.
  * Pending outcomes and allocated names are plain data; transports and children
  * are deliberately not migrated.
  */
 async retireForReload(){
  if(this.hasActiveResources())throw new Error("Subagent reload requires all child conversations and processes to be settled first");
  const outcomes=[...this.pending.values()].map(record=>({...record,skills:record.skills?[...record.skills]:undefined}));
  const names:Record<string,string[]>={};
  for(const [origin,allocator] of this.names)names[origin]=allocator.snapshot();
  await this.transport.close();
  this.bindings.clear();this.observers.clear();this.layouts.clear();this.children.clear();this.contexts.clear();this.inert.clear();this.pending.clear();this.queued.clear();
  this.disposed=true;
  saveInertState({names,outcomes});
 }
}
export const SUBAGENT_RUNTIME_RESET="default:subagents:reset";
interface RuntimeEvents { emit(type:string,data?:unknown):void }
export async function requestSubagentRuntimeReset(pi: { events: RuntimeEvents }): Promise<boolean> {
 let operation:Promise<unknown>|undefined;
 pi.events.emit(SUBAGENT_RUNTIME_RESET,(value:Promise<unknown>)=>{operation=Promise.resolve(value)});
 if(!operation)return false;
 await operation;
 return true;
}
let runtime:SubagentRuntime|undefined;
export function getSubagentRuntime(){
 return runtime??=(new SubagentRuntime(takeInertState()));
}
export async function resetSubagentRuntime(reason="clear"){
 const current=runtime;
 if(current){
  const summary=await current.shutdown(reason);
  if(!summary.complete)throw new RuntimeCleanupError(summary);
 }
 clearInertState();
 runtime=new SubagentRuntime();
 return runtime;
}
export async function retireSubagentRuntime(){
 const current=runtime;
 if(!current)return;
 await current.retireForReload();
 runtime=undefined;
}

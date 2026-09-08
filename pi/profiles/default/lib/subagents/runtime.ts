import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { ChildTransport, type ChildIdentity, type ApplicationMessage } from "./transport.ts";
import type { AgentDefinition, AgentEffort } from "./definitions.ts";
import { VisibleChild } from "./visible.ts";
import { RpcChild, type ChildRecord, type LaunchSpec } from "./rpc.ts";
import { EFFORTS, resolveModel, resolveSkills } from "./options.ts";
import { inside, workspaceRoot } from "./workspace.ts";
export interface Delivery extends ChildRecord { deliveryId: string }
export interface BoundOrigin { deliver: (record: Delivery) => boolean }
interface Input { definition:AgentDefinition;instructions:string;cwd:string;model:string;effort:AgentEffort;skills:string[];origin:string;retained:boolean;parentId?:string;surface:"headless"|"visible";catalog?:Map<string,AgentDefinition> }
interface Context { input:Input;profile:string;extension:string;catalog:Map<string,AgentDefinition> }
export class SubagentRuntime {
 private children=new Map<string,RpcChild>();
 private contexts=new Map<string,Context>();
 private bindings=new Map<string,BoundOrigin>();
 private pending=new Map<string,Delivery>();
 private queued=new Set<string>();
 private transport=new ChildTransport((identity,message)=>this.dispatch(identity,message));
 bind(origin:string,binding:BoundOrigin){this.bindings.set(origin,binding);this.flush(origin)}
 flush(origin:string){const binding=this.bindings.get(origin);if(!binding)return;for(const [id,record] of this.pending){if(record.origin===origin&&!this.queued.has(id)&&binding.deliver(record)&&this.pending.has(id))this.queued.add(id)}}
 acknowledge(origin:string,id:string){if(this.pending.get(id)?.origin!==origin)return;this.pending.delete(id);this.queued.delete(id)}
 unbind(origin:string,binding:BoundOrigin){if(this.bindings.get(origin)===binding)this.bindings.delete(origin)}
 private deliver(record:ChildRecord){
  if(record.parentId)return;
  const delivery={...record,deliveryId:randomUUID()};
  this.pending.set(delivery.deliveryId,delivery);
  this.flush(record.origin);
 }
 private async dispatch(identity:Readonly<ChildIdentity>,message:ApplicationMessage):Promise<unknown>{
  const child=this.children.get(identity.child),context=this.contexts.get(identity.child);
  if(!child||!context||child.record.origin!==identity.origin)throw new Error("Child owner unavailable");
  if(message.type==="heartbeat")return{alive:true};
  if(message.type==="delegate"){
   if(child.record.status==="settled")throw new Error("Parent assignment is settled");
   const payload=message.payload as {agent?:unknown;instructions?:unknown;retain?:unknown;cwd?:unknown;model?:unknown;effort?:unknown;skills?:unknown;surface?:unknown};
   if(!payload||typeof payload.agent!=="string"||typeof payload.instructions!=="string"||!payload.instructions.trim())throw new Error("Invalid delegation");
   if(!context.input.definition.tools.includes("subagent")||!context.input.definition.delegates.includes(payload.agent))throw new Error("Delegation is outside frozen authority");
   const definition=context.catalog.get(payload.agent);
   if(!definition||definition.delegates.length)throw new Error("Only permitted leaf definitions may be commissioned");
   for(const key of ["cwd","model","effort"] as const)if(payload[key]!==undefined&&typeof payload[key]!=="string")throw new Error(`Invalid ${key}`);
   if(payload.effort!==undefined&&!EFFORTS.includes(payload.effort as AgentEffort))throw new Error("Invalid effort");
   if(payload.surface!==undefined&&payload.surface!=="visible"&&payload.surface!=="headless")throw new Error("Invalid surface");
   const model=(payload.model as string|undefined)??definition.model;resolveModel(model,undefined);
   return this.launch({definition,instructions:payload.instructions,cwd:resolve(context.input.cwd,(payload.cwd as string|undefined)??"."),model:model!,effort:(payload.effort as AgentEffort|undefined)??definition.effort??"low",skills:resolveSkills(context.profile,definition.skills,payload.skills),origin:identity.origin,retained:payload.retain===true,parentId:identity.child,surface:(payload.surface as "headless"|"visible"|undefined)??context.input.surface,catalog:context.catalog},context.profile,context.extension,true);
  }
  if(message.type==="control"){
   if(!context.input.definition.tools.includes("subagent_control"))throw new Error("Control is outside frozen authority");
   const payload=message.payload as {id?:unknown;action?:unknown;message?:unknown};
   if(!payload||typeof payload.id!=="string")throw new Error("Child id required");
   const target=this.children.get(payload.id);
   if(!target||target.record.parentId!==identity.child)throw new Error("Only direct children may be controlled");
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
 async launch(input:Input,profileDir:string,childExtension:string,background:boolean,signal?:AbortSignal):Promise<ChildRecord>{
  const cwd=workspaceRoot(resolve(input.cwd));
  if(input.parentId){
   const parent=this.children.get(input.parentId),context=this.contexts.get(input.parentId);
   if(!parent||!context||parent.record.status==="settled")throw new Error("Delegating parent is unavailable");
   if(parent.record.parentId||!context.input.definition.delegates.includes(input.definition.name)||input.definition.delegates.length)throw new Error("Delegation is outside frozen authority");
   if(input.origin!==parent.record.origin||!inside(context.input.cwd,cwd))throw new Error("Child cannot widen parent workspace or change origin");
  }
  if(input.surface==="visible"&&process.env.HERDR_ENV!=="1")throw new Error("Visible subagents require Herdr; no headless substitution is permitted");
  const frozen={...input,cwd};
  const Child=input.surface==="visible"?VisibleChild:RpcChild;
  const child=new Child(frozen as LaunchSpec,resolve(childExtension),resolve(profileDir));
  this.children.set(child.record.id,child);
  this.contexts.set(child.record.id,{input:frozen,profile:resolve(profileDir),extension:resolve(childExtension),catalog:new Map(input.catalog??[[input.definition.name,input.definition]])});
  let foreground=!background;
  child.onUpdate=record=>{if(!foreground)this.deliver(record);if(record.status==="settled"&&!record.retained&&!record.userOwned)this.transport.revoke(record.id)};
  const endpoint=await this.transport.register({child:child.record.id,run:randomUUID(),origin:input.origin});
  const wait=child.start(endpoint).finally(()=>{foreground=false});
  if(background)return child.snapshot();
  if(!signal)return wait;
  if(signal.aborted){foreground=false;return child.snapshot()}
  return new Promise<ChildRecord>((resolve,reject)=>{
   const detach=()=>{foreground=false;resolve(child.snapshot())};
   signal.addEventListener("abort",detach,{once:true});
   void wait.then(resolve,reject).finally(()=>signal.removeEventListener("abort",detach));
  });
 }
 list(origin?:string){return [...this.children.values()].map(c=>c.snapshot()).filter(c=>!origin||c.origin===origin)}
 get(id:string,origin?:string){const matches=[...this.children.entries()].filter(([key,child])=>key.startsWith(id)&&(!origin||child.record.origin===origin));if(matches.length!==1)throw new Error(matches.length?`Ambiguous child id: ${id}`:`Unknown child: ${id}`);return matches[0][1]}
 async shutdown(reason:string){for(const child of this.children.values()){const record=child.snapshot();if(reason==="quit"&&record.surface==="visible"&&record.userOwned)continue;if(record.status!=="settled"||record.retained)await child.cancel()}await this.transport.close()}
}
const key=Symbol.for("dotfiles.pi.default.subagents.v1");
export function getSubagentRuntime(){const g=globalThis as typeof globalThis&{[key]?:SubagentRuntime};return g[key]??=new SubagentRuntime()}

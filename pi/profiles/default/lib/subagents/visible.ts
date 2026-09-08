import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { RpcChild, type ChildRecord } from "./rpc.ts";
import type { ChildEndpoint, ApplicationMessage } from "./transport.ts";
import { createHerdrCli, herdrContext, result, inspectPane } from "../herdr-cli.ts";

export class VisibleChild extends RpcChild {
 private cli=createHerdrCli();
 private endpoint?:ChildEndpoint;
 private hostPid?:number;
 private hostExited=false;
 private appReady=false;
 private stopping=false;
 private forceStop=false;
 private closed=false;
 private bootstrapped=false;
 private interventionReady=false;
 private commands:Array<{id:string;type:string;message?:string}>=[];
 private enqueue(command:{type:string;message?:string}){this.commands.push({id:randomUUID(),...command})}
 private startup?:ReturnType<typeof setTimeout>;
 private launchDone?:Promise<void>;
 override start(endpoint?:ChildEndpoint):Promise<ChildRecord>{
  if(!endpoint)throw new Error("Visible launch requires authenticated transport");
  this.endpoint=endpoint;
  const waiting=new Promise<ChildRecord>(resolve=>{this.settled=()=>resolve(this.snapshot())});
  const context=herdrContext();
  this.enqueue({type:"message",message:this.spec.instructions});
  this.startup=setTimeout(()=>{if(!this.appReady)this.fail("Visible child did not become ready")},30_000);
  this.launchDone=(async()=>{
   const plugins=result(await this.cli(["plugin","list","--plugin","local.pi","--json"])).plugins;
   const command=plugins?.find((plugin:any)=>plugin.plugin_id==="local.pi")?.panes?.find((pane:any)=>pane.id==="pi")?.command;
   const expected=resolve(this.profileDir,"../../../scripts/pi-herdr-launch.mjs");
   if(!Array.isArray(command)||command.length!==3||typeof command[1]!=="string"||realpathSync.native(command[1])!==realpathSync.native(expected))throw new Error("local.pi is not linked to this profile's repository bootstrap; refusing an unrestricted launch");
   await inspectPane(this.cli,context.pane);
   const layout=result(await this.cli(["pane","layout","--pane",context.pane])).layout;
   const rect=layout?.panes?.find((pane:any)=>pane.pane_id===context.pane)?.rect;
   if(!rect||!Number.isFinite(rect.width)||!Number.isFinite(rect.height))throw new Error("Herdr omitted caller geometry");
   const direction=rect.width>=rect.height*2?"right":"down";
   const opened=result(await this.cli(["plugin","pane","open","--plugin","local.pi","--entrypoint","pi","--placement","split","--direction",direction,"--target-pane",context.pane,"--cwd",this.spec.cwd,"--env",`PI_HERDR_PROFILE_DIR=${this.profileDir}`,"--env",`PI_HERDR_SUBAGENT=${JSON.stringify(endpoint)}`,"--no-focus"]));
   const pane=opened.plugin_pane?.pane??opened.pane??opened.root_pane;
   if(typeof pane?.pane_id!=="string")throw new Error("Herdr did not return the created pane identity");
   this.record.paneId=pane.pane_id;this.record.paneState="open";
  })();
  void this.launchDone.catch(error=>this.fail(String(error)));
  return waiting;
 }
 override parentMessage(message:ApplicationMessage):unknown{
  if(this.closed)throw new Error("Visible child is closed");
  if(message.type==="bootstrap"){if(this.bootstrapped||this.closed)throw new Error("Bootstrap already consumed");this.bootstrapped=true;return{spec:this.spec,profile:this.profileDir}}
  if(message.type==="intervention-ready"){this.interventionReady=true;return{accepted:true}}
  if(message.type==="host-started"){
   const pid=(message.payload as {pid?:unknown})?.pid;
   if(this.hostPid||!Number.isSafeInteger(pid)||(pid as number)<=0)throw new Error("Invalid or duplicate host identity");
   this.hostPid=pid as number;return{accepted:true};
  }
  if(message.type==="host-poll")return{stop:this.stopping,force:this.forceStop};
  if(message.type==="host-exit"){
   if(this.hostExited)throw new Error("Duplicate process settlement");
   this.hostExited=true;this.record.processState="exited";
   if(this.startup)clearTimeout(this.startup);
   if(this.record.status!=="settled")this.fail("Visible process exited without assignment completion");
   return{accepted:true};
  }
  if(message.type==="app-ready"){
   const tools=(message.payload as {tools?:unknown})?.tools;
   if(!Array.isArray(tools)||JSON.stringify([...tools].sort())!==JSON.stringify([...this.spec.definition.tools].sort())){this.fail("Visible child tool ceiling mismatch");throw new Error("Tool ceiling mismatch")}
   this.record.readyCount=(this.record.readyCount??0)+1;this.appReady=true;this.record.processState="running";if(this.startup)clearTimeout(this.startup);return{accepted:true};
  }
  if(message.type==="app-poll")return{commands:this.record.userOwned?this.commands.filter(c=>c.type==="handback"||c.type==="intervene"):this.commands};
  if(message.type==="app-ack"){this.commands=this.commands.filter(c=>c.id!==message.payload);return{accepted:true}}
  if(message.type==="intervene"){
   if(this.forceStop)throw new Error("Child cancellation is already committed");
   this.record.userOwned=true;this.interventionReady=true;this.stopping=false;
   this.commands=[];
   this.record.status="running";this.record.outcome=undefined;this.record.result=undefined;this.last="";
   return{accepted:true};
  }
  if(message.type==="handback"){
   this.record.userOwned=false;this.interventionReady=false;
   if(this.record.status==="settled"&&!this.record.retained)void this.stopProcess().catch(error=>{this.record.error=String(error)});
   return{accepted:true};
  }
  if(message.type==="turn"){
   const payload=message.payload as {text?:unknown;turn?:unknown;error?:unknown};
   if(!payload||typeof payload.text!=="string"||payload.turn!==this.record.turns+1)throw new Error("Invalid, duplicate, or late turn");
   if(typeof payload.error==="string"){this.record.turns++;this.fail(payload.error);return{accepted:true}}
   this.last=payload.text;
   void this.finishFromTurn();
   return{accepted:true};
  }
  return super.parentMessage(message);
 }
 override async command(type:string,data:Record<string,unknown>={}){
  if(type==="prompt"){if(typeof data.message!=="string")throw new Error("Message required");this.enqueue({type:"message",message:data.message});return}
  if(type==="abort"){this.forceStop=true;this.stopping=true;return}
  throw new Error(`Unsupported visible command ${type}`);
 }
 override async escalate(_ctx:Parameters<RpcChild["escalate"]>[0]){await this.intervene()}
 async intervene(){
  if(this.closed)throw new Error("Visible child is closed");
  this.record.userOwned=true;this.enqueue({type:"intervene"});
  const deadline=Date.now()+10_000;
  while(!this.interventionReady){if(Date.now()>deadline)throw new Error("Child did not acknowledge user intervention");await delay(25)}
 }
 handback(){if(!this.record.userOwned)throw new Error("Child is not under user intervention");this.enqueue({type:"handback"})}
 override async cancel(){this.forceStop=true;await super.cancel()}
 protected override alive(){return this.appReady&&!this.hostExited&&!this.closed}
 protected override async stopProcess(){
  if(this.record.userOwned&&!this.forceStop)return;
  this.stopping=true;
  if(this.startup)clearTimeout(this.startup);
  try{await this.launchDone}catch{ /* Exact returned pane, when available, still belongs to this launch. */ }
  const deadline=Date.now()+10_000;
  while(this.hostPid&&!this.hostExited){
   if(this.record.userOwned&&!this.forceStop)return;
   if(Date.now()>deadline)throw new Error("Visible launcher did not settle its owned child");
   await delay(50);
  }
  // The bootstrap reports child close, then exits. Never terminate a PID found by probing.
  while(this.hostPid){
   try{process.kill(this.hostPid,0)}catch(error){if((error as NodeJS.ErrnoException).code==="ESRCH")break;throw error}
   if(Date.now()>deadline)throw new Error("Visible launcher exit was not observed; pane retained for inspection");
   await delay(25);
  }
  if(this.record.paneId&&!this.closed){
   await this.cli(["plugin","pane","close",this.record.paneId]);
   this.closed=true;this.record.paneState="closed";
  }
 }
}

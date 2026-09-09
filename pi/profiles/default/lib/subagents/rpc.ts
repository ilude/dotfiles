import { spawn, execFile, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { JsonLines } from "./framing.ts";
import type { ChildEndpoint, ApplicationMessage } from "./transport.ts";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { childLaunch } from "./launch.ts";
import type { AgentDefinition, AgentEffort } from "./definitions.ts";
export type Outcome = "complete" | "partial" | "blocked" | "failed" | "cancelled";
export type Phase = "starting" | "model" | "tool" | "waiting-parent" | "waiting-user" | "waiting-children" | "cleanup" | "settled";
export type CleanupResourceState = "closed" | "open" | "not-applicable";
export interface CleanupResult {
  attempted: boolean;
  attempts: number;
  complete: boolean;
  process: CleanupResourceState;
  pane: CleanupResourceState;
  launcher: CleanupResourceState;
  errors: string[];
}
export class CleanupError extends Error {
  readonly cleanup: CleanupResult;
  constructor(message: string, cleanup: CleanupResult) { super(message); this.name = "CleanupError"; this.cleanup = cleanup; }
}
export interface ChildRecord {
  id: string; agent: string; displayName?: string; assignment?: string; model?: string; effort?: AgentEffort; cwd?: string; skills?: string[];
  origin: string; surface: "headless" | "visible";
  status: "running" | "waiting" | "settled"; outcome?: Outcome; result?: string; error?: string;
  sessionFile?: string; retained: boolean; parentId?: string; userOwned: boolean;
  process?: ChildProcessWithoutNullStreams; paneId?: string; createdAt: string; updatedAt: string;
  turns: number; readyCount?: number; processState: "starting" | "running" | "exited";
  phase?: Phase; phaseStartedAt?: string; assignmentStartedAt?: string; assignmentFinishedAt?: string; lastActivityAt?: string; lastContactAt?: string;
  toolName?: string; transportState?: "starting" | "connected" | "closed" | "failed";
  waitState?: "attached" | "detached" | "background"; notice?: string; paneState?: "open" | "closed";
  cleanup?: CleanupResult;
  launcherState?: "starting" | "running" | "exited";
}
export interface LaunchSpec { definition: AgentDefinition; displayName?: string; instructions: string; cwd: string; model: string; effort: AgentEffort; skills: string[]; origin: string; retained: boolean; parentId?: string; surface: "headless" | "visible" }
const LIMIT = 24_000;
// Native agent_end contains all messages for the assignment, not just its final text.
// Keep authenticated application messages at their existing 256 KiB bound; RPC gets a
// separate finite allowance for native aggregate/image events. Final text stays 24k.
export const RPC_FRAME_LIMIT = 16 * 1024 * 1024;
function text(message: any): string { return Array.isArray(message?.content) ? message.content.filter((x:any)=>x?.type==="text").map((x:any)=>x.text).join("\n") : ""; }
export class RpcChild {
  readonly record: ChildRecord;
  private pending = new Map<string, (r:any)=>void>();
  protected settled?: ()=>void;
  protected last = "";
  onUpdate?: (record: ChildRecord) => void;
  onProgress?: (record: ChildRecord) => void;
  hasOutstandingChildren?: () => boolean;
  private waiters = new Set<() => void>();
  private processClosed?: Promise<void>;
  private uiRequest?:{id:string;method:string;title?:string;message?:string;options?:string[];prefill?:string};
  private question?: { id: string; message: string; answer?: string };
  protected spec: LaunchSpec; protected profileDir: string;
  constructor(spec: LaunchSpec, childExtension: string, profileDir: string) {
    this.spec = spec; void childExtension; this.profileDir = profileDir;
    const now = new Date().toISOString();
    this.record = { id: randomUUID(), agent: spec.definition.name, displayName: spec.displayName,
      assignment: spec.instructions, model: spec.model, effort: spec.effort, cwd: spec.cwd, skills: [...spec.skills],
      origin: spec.origin, surface: spec.surface, status: "running", retained: spec.retained,
      parentId: spec.parentId, userOwned: false, processState: "starting", transportState: "starting",
      phase: "starting", phaseStartedAt: now, assignmentStartedAt: now, turns: 0, createdAt: now, updatedAt: now };
  }
  contact() { this.record.lastContactAt = new Date().toISOString(); if(this.record.transportState!=="failed")this.record.transportState="connected"; }
  activity(phase: Phase, toolName?: string) {
    const now = new Date().toISOString();
    if (this.record.phase !== phase || this.record.toolName !== toolName) this.record.phaseStartedAt = now;
    this.record.phase = phase; this.record.toolName = toolName;
    this.record.lastActivityAt = now; this.record.updatedAt = now;
    this.onProgress?.(this.snapshot());
  }
  private rpcActivity(e:any) {
    this.contact();
    if(this.record.status === "settled") return;
    if(e.type === "tool_execution_start" || e.type === "tool_execution_update") this.activity("tool", typeof e.toolName === "string" ? e.toolName : this.record.toolName);
    else if(e.type === "tool_execution_end" || e.type === "agent_start" || e.type === "turn_start") this.activity("model");
    else if(e.type === "message_update" || (e.type === "message_start" && e.message?.role === "assistant")) this.activity("model");
  }
  start(endpoint?: ChildEndpoint): Promise<ChildRecord> {
    const config=childLaunch(this.spec,this.record.id,this.profileDir,endpoint);
    const manifestPath=join(this.profileDir,"node_modules/@earendil-works/pi-coding-agent/package.json");
    const prefix=process.env.PI_SUBAGENT_BIN_ARGS?JSON.parse(process.env.PI_SUBAGENT_BIN_ARGS):[resolve(dirname(manifestPath),JSON.parse(readFileSync(manifestPath,"utf8")).bin.pi)];
    const p=spawn(process.env.PI_SUBAGENT_BIN||process.execPath,[...prefix,...config.args],{cwd:this.spec.cwd,env:{...process.env,...config.env},shell:false,detached:process.platform!=="win32",windowsHide:true,stdio:["pipe","pipe","pipe"]});
    this.record.process=p;
    const waiting = new Promise<ChildRecord>(r=>{this.settled=()=>r(this.snapshot())});
    p.once("spawn",()=>{this.record.processState="running";this.onProgress?.(this.snapshot())});
    this.processClosed=new Promise(done=>p.once("close",()=>{
      this.record.processState="exited";
      if(this.record.transportState!=="failed")this.record.transportState="closed";
      for(const respond of [...this.pending.values()])respond({success:false,error:"Child process closed"});
      this.pending.clear();done();this.onProgress?.(this.snapshot());
    }));
    const frames = new JsonLines(value=>{
      const e=value as any;
      if(!e || typeof e.type !== "string")throw new Error("Child RPC event has no type");
      this.rpcActivity(e);
      if(e.type==="response"&&e.id)this.pending.get(e.id)?.(e);
      if(e.type==="message_end"&&e.message?.role==="assistant"){
        if(e.message.stopReason==="error"||e.message.stopReason==="aborted")this.fail(e.message.errorMessage||`Child model ${e.message.stopReason}`);
        else this.last=text(e.message).slice(0,LIMIT);
      }
      if(e.type==="agent_settled")void this.finishFromTurn();
      if(e.type==="extension_ui_request"&&["input","confirm","select","editor"].includes(e.method)){
        this.uiRequest=e;this.record.status="waiting";
        this.record.result=`User-only ${e.method}: ${e.title||e.message||"input required"}. Use escalate to show the originating user the actual prompt.`;
        this.activity("waiting-user");this.done();
      }
    },RPC_FRAME_LIMIT);
    let invalid=false;
    p.stdout.on("data",(chunk:Buffer)=>{if(invalid)return;try{frames.push(chunk)}catch(error){invalid=true;this.record.transportState="failed";this.fail(`Invalid child RPC: ${String(error)}`)}});
    p.stdout.on("end",()=>{if(invalid)return;try{frames.end()}catch(error){this.record.transportState="failed";this.fail(String(error))}});
    let stderr="";p.stderr.on("data",c=>stderr=(stderr+c).slice(-4000));
    p.on("error",e=>this.fail(e.message));
    p.stdin.on("error",e=>this.fail(`Child RPC input failed: ${e.message}`));
    p.on("exit",code=>{if(this.record.status!=="settled")this.fail(code===0?"Child exited without reporting completion":stderr||`Child exited ${code}`)});
    // Observe authoritative preflight rejection. No assignment timeout: a silent child
    // stays inspectable/cancellable with honest activity age rather than invented failure.
    const id=randomUUID();
    this.pending.set(id,e=>{this.pending.delete(id);if(!e.success)this.fail(`Initial prompt rejected: ${e.error||"unknown rejection"}`)});
    this.send("prompt",{id,message:`${this.spec.definition.prompt}\n\nAssignment:\n${this.spec.instructions}\n\nConclude with a non-empty result. Use subagent_parent to report partial or blocked work when needed.`});
    return waiting;
  }
  wait(signal?:AbortSignal, toolResult=true):Promise<ChildRecord> {
    if(this.record.status!=="running" && this.record.phase!=="cleanup")return Promise.resolve(this.snapshot());
    return new Promise(resolve=>{
      const finish=()=>{this.waiters.delete(finish);signal?.removeEventListener("abort",detach);resolve(this.snapshot())};
      const detach=()=>{this.record.waitState="detached";this.record.notice="Stopped waiting; child continues running. Inspect, wait again, or cancel explicitly.";this.onProgress?.(this.snapshot());finish()};
      this.waiters.add(finish);
      if(toolResult)this.record.waitState="attached";
      this.record.notice=undefined;this.onProgress?.(this.snapshot());
      if(signal?.aborted)detach();else signal?.addEventListener("abort",detach,{once:true});
    });
  }
  async command(type:string,data:Record<string,unknown>={}):Promise<any>{const id=randomUUID();const response=new Promise<any>((resolve,reject)=>{const t=setTimeout(()=>{this.pending.delete(id);reject(new Error(`RPC ${type} timed out`))},10000);this.pending.set(id,r=>{clearTimeout(t);this.pending.delete(id);r.success?resolve(r.data):reject(new Error(r.error||`RPC ${type} failed`))})});this.send(type,{id,...data});return response;}
  async message(value:string){
    if (!this.record.retained || !this.alive()) throw new Error("Conversation is not retained by a live process");
    if (this.record.userOwned) throw new Error("Direct user intervention suspends parent steering");
    if (this.record.status !== "settled") throw new Error("Child is already working or waiting for an answer");
    if (!value.trim()) throw new Error("Message must be nonblank");
    this.last="";this.record.result=undefined;this.record.outcome=undefined;this.record.error=undefined;this.record.notice=undefined;
    this.record.assignment=value;this.record.assignmentStartedAt=new Date().toISOString();this.record.assignmentFinishedAt=undefined;
    this.record.status="running";this.activity("starting");
    try{await this.command("prompt",{message:value})}catch(error){this.fail(`Follow-up prompt rejected: ${String(error)}`);throw error}
  }
  async answer(value:string){
    if(this.record.userOwned)throw new Error("Parent steering is suspended during user intervention");
    if (!this.question) throw new Error("No parent question is pending; user approvals cannot be answered through this action");
    if (!value.trim()) throw new Error("Answer must be nonblank");
    this.question.answer=value;
  }
  async escalate(ctx:ExtensionContext){
    const request=this.uiRequest;if(!request)throw new Error("No user-only prompt is pending");
    if(!ctx.hasUI)throw new Error("The originating parent has no user interface");
    this.record.userOwned=true;
    try{
      const title=request.title||"Subagent input";
      const response:Record<string,unknown>={id:request.id};
      if(request.method==="confirm")response.confirmed=await ctx.ui.confirm(title,request.message||"");
      else if(request.method==="select")response.value=await ctx.ui.select(title,request.options||[]);
      else if(request.method==="editor")response.value=await ctx.ui.editor(title,request.prefill||"");
      else response.value=await ctx.ui.input(title,request.message);
      if(response.value===undefined&&response.confirmed===undefined)response.cancelled=true;
      this.uiRequest=undefined;this.record.status="running";this.record.result=undefined;this.activity("model");this.send("extension_ui_response",response);
    }finally{this.record.userOwned=false}
  }
  parentMessage(message: ApplicationMessage): unknown {
    if (!this.spec.definition.tools.includes("subagent_parent")) throw new Error("Parent helper is outside frozen authority");
    if (this.record.status === "settled") throw new Error("Assignment is already settled");
    if (message.type === "question") {
      if (typeof message.payload !== "string" || !message.payload.trim()) throw new Error("Question must be nonblank");
      if (this.question) throw new Error("A question is already pending");
      this.question={id:randomUUID(),message:message.payload.slice(0,LIMIT)};
      this.record.status="waiting";this.record.result=this.question.message;this.activity("waiting-parent");this.done();return {id:this.question.id};
    }
    if (message.type === "poll-answer") {
      if (!this.question || message.payload !== this.question.id) throw new Error("Unknown question");
      if (this.question.answer === undefined) return {pending:true};
      const answer=this.question.answer;this.question=undefined;this.record.status="running";this.record.result=undefined;this.activity("model");return {answer};
    }
    if (message.type === "partial" || message.type === "blocked") {
      if (typeof message.payload !== "string" || !message.payload.trim()) throw new Error("Result must be nonblank");
      this.record.outcome=message.type;this.record.result=message.payload.slice(0,LIMIT);return {accepted:true};
    }
    throw new Error(`Unsupported parent message: ${message.type}`);
  }
  async cancel():Promise<CleanupResult>{
    const terminal=this.record.status==="settled";
    if(!terminal){this.record.outcome="cancelled";this.record.status="settled";this.activity("cleanup");try{await this.command("abort")}catch{/* Owned termination below is authoritative. */}}
    const cleanup=await this.cleanupOwnedResources();
    if(!terminal)this.done();else this.onProgress?.(this.snapshot());
    return cleanup;
  }
  protected alive(){return this.record.process?.exitCode===null&&this.record.process?.signalCode===null}
  protected async stopProcess(){
    if(!this.record.process||!this.processClosed)return;
    const processHandle=this.record.process;
    if(processHandle.pid&&processHandle.exitCode===null&&processHandle.signalCode===null){
      if(process.platform==="win32")await new Promise<void>((resolve,reject)=>execFile("taskkill",["/pid",String(processHandle.pid),"/t","/f"],{windowsHide:true,timeout:5000},error=>{if(error&&processHandle.exitCode===null&&processHandle.signalCode===null)reject(error);else resolve()}));
      else {try{process.kill(-processHandle.pid,"SIGTERM")}catch(error){if((error as NodeJS.ErrnoException).code!=="ESRCH")throw error}}
    }
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{await Promise.race([this.processClosed,new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error("Owned child process did not settle after termination")),5000)})])}
    finally{if(timer)clearTimeout(timer)}
  }
  async finish():Promise<CleanupResult>{
    if(this.record.status!=="settled")throw new Error("Cannot finish a conversation while work is active");
    if(this.record.userOwned)throw new Error("Return user intervention before finishing");
    const cleanup=await this.cleanupOwnedResources();
    if(!cleanup.complete)throw new CleanupError("Cannot finish while owned resources remain open",cleanup);
    this.record.retained=false;this.onProgress?.(this.snapshot());return cleanup;
  }
  snapshot():ChildRecord{
    const {process:_,skills,...r}=this.record;
    const snapshot:ChildRecord=skills?{...r,skills:[...skills]}:{...r};
    if(r.cleanup)snapshot.cleanup={...r.cleanup,errors:[...r.cleanup.errors]};
    return snapshot;
  }
  private send(type:string,data:Record<string,unknown>){this.record.process?.stdin.write(JSON.stringify({type,...data})+"\n")}
  protected async finishFromTurn(){
    if(this.record.status!=="running")return;
    this.record.turns++;
    if(this.hasOutstandingChildren?.()){
      this.record.notice="Waiting for commissioned children; their outcomes return automatically.";
      this.activity("waiting-children");return;
    }
    if(!this.last.trim()&&!this.record.result?.trim())return this.fail("Blank output is not assignment completion");
    this.record.result=((this.record.outcome === "partial" || this.record.outcome === "blocked") ? this.record.result||this.last : this.last||this.record.result||"").slice(0,LIMIT);
    this.record.outcome=this.record.outcome??"complete";this.record.status="settled";this.activity("cleanup");
    if(!this.record.retained&&!this.record.userOwned)await this.cleanupOwnedResources();
    this.done();
  }
  launchFailed(error:unknown){this.record.processState="exited";this.fail(`Child launch failed: ${String(error)}`)}
  protected fail(error:string){
    if(this.record.status==="settled")return;
    this.record.error=error;this.record.outcome="failed";this.record.status="settled";this.activity("cleanup");
    void this.cleanupOwnedResources().finally(()=>this.done());
  }
  private cleanupState():CleanupResult{
    const process:CleanupResourceState=this.record.processState!=="exited" ? "open"
      : this.record.process ? "closed" : "not-applicable";
    const pane:CleanupResourceState=this.record.surface!=="visible" ? "not-applicable"
      : !this.record.paneId ? "not-applicable" : this.record.paneState==="closed" ? "closed" : "open";
    const launcher:CleanupResourceState=this.record.surface!=="visible" ? "not-applicable"
      : !this.record.paneId ? "not-applicable" : this.record.launcherState==="exited" ? "closed" : "open";
    const previous=this.record.cleanup;
    return {attempted:previous?.attempted??false,attempts:previous?.attempts??0,complete:process!=="open"&&pane!=="open"&&launcher!=="open",process,pane,launcher,errors:[...(previous?.errors??[])]};
  }
  protected async cleanupOwnedResources():Promise<CleanupResult>{
    const current=this.cleanupState();
    if(current.complete){this.record.cleanup=current;return current;}
    const cleanup:CleanupResult={...current,attempted:true,attempts:current.attempts+1};
    this.record.cleanup=cleanup;this.onProgress?.(this.snapshot());
    try{await this.stopProcess();}
    catch(error){cleanup.errors.push(String(error));}
    const final=this.cleanupState();
    final.attempted=true;final.attempts=cleanup.attempts;
    this.record.cleanup=final;this.onProgress?.(this.snapshot());
    return final;
  }
  protected done(){
    if(this.record.status==="settled"){
      this.record.assignmentFinishedAt??=new Date().toISOString();
      this.record.phase="settled";this.record.toolName=undefined;this.record.notice=undefined
    }
    this.record.updatedAt=new Date().toISOString();
    this.settled?.();this.settled=undefined;
    // Notify runtime before resolving waits so foreground delivery stays a tool result.
    this.onUpdate?.(this.snapshot());
    for(const resolve of [...this.waiters])resolve();
  }
}

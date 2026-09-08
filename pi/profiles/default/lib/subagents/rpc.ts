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
export interface ChildRecord { id: string; agent: string; origin: string; surface: "headless" | "visible"; status: "running" | "waiting" | "settled"; outcome?: Outcome; result?: string; error?: string; sessionFile?: string; retained: boolean; parentId?: string; userOwned: boolean; process?: ChildProcessWithoutNullStreams; paneId?: string; createdAt: string; updatedAt: string; turns: number; readyCount?: number; processState: "starting" | "running" | "exited"; paneState?: "open" | "closed" }
export interface LaunchSpec { definition: AgentDefinition; instructions: string; cwd: string; model: string; effort: AgentEffort; skills: string[]; origin: string; retained: boolean; parentId?: string; surface: "headless" | "visible" }
const LIMIT = 24_000;
function text(message: any): string { return Array.isArray(message?.content) ? message.content.filter((x:any)=>x?.type==="text").map((x:any)=>x.text).join("\n") : ""; }
export class RpcChild {
  readonly record: ChildRecord; private pending = new Map<string, (r:any)=>void>(); protected settled?: ()=>void; protected last = "";
  onUpdate?: (record: ChildRecord) => void;
  private processClosed?: Promise<void>;
  private uiRequest?:{id:string;method:string;title?:string;message?:string;options?:string[];prefill?:string};
  private question?: { id: string; message: string; answer?: string };
  protected spec: LaunchSpec; protected profileDir: string;
  constructor(spec: LaunchSpec, childExtension: string, profileDir: string) { this.spec = spec; void childExtension; this.profileDir = profileDir; const now = new Date().toISOString(); this.record = { id: randomUUID(), agent: spec.definition.name, origin: spec.origin, surface: spec.surface, status: "running", retained: spec.retained, parentId: spec.parentId, userOwned: false, processState: "starting", turns: 0, createdAt: now, updatedAt: now }; }
  start(endpoint?: ChildEndpoint): Promise<ChildRecord> {
    const d=this.spec.definition, config=childLaunch(this.spec,this.record.id,this.profileDir,endpoint),args=config.args;
    const env={...process.env,...config.env};
    const manifestPath=join(this.profileDir,"node_modules/@earendil-works/pi-coding-agent/package.json");
    const prefix=process.env.PI_SUBAGENT_BIN_ARGS?JSON.parse(process.env.PI_SUBAGENT_BIN_ARGS):[resolve(dirname(manifestPath),JSON.parse(readFileSync(manifestPath,"utf8")).bin.pi)];
    const p=spawn(process.env.PI_SUBAGENT_BIN||process.execPath,[...prefix,...args],{cwd:this.spec.cwd,env,shell:false,detached:process.platform!=="win32",windowsHide:true,stdio:["pipe","pipe","pipe"]}); this.record.process=p;
    p.once("spawn",()=>{this.record.processState="running"});
    this.processClosed=new Promise(done=>p.once("close",()=>{this.record.processState="exited";done()}));
    const frames = new JsonLines((value)=>{const e = value as any; if(e.type==="response"&&e.id)this.pending.get(e.id)?.(e); if(e.type==="message_end"&&e.message?.role==="assistant"){if(e.message.stopReason==="error"||e.message.stopReason==="aborted")this.fail(e.message.errorMessage||`Child model ${e.message.stopReason}`);else this.last=text(e.message)} if(e.type==="agent_settled")this.finishFromTurn(); if(e.type==="extension_ui_request"&&["input","confirm","select","editor"].includes(e.method)){this.uiRequest=e;this.record.status="waiting";this.record.result=`User-only ${e.method}: ${e.title||e.message||"input required"}. Use escalate to show the originating user the actual prompt.`;this.record.updatedAt=new Date().toISOString();this.done();}});
    p.stdout.on("data", (chunk: Buffer) => { try { frames.push(chunk); } catch (error) { this.fail(`Invalid child RPC: ${String(error)}`); p.kill(); } });
    p.stdout.on("end", () => { try { frames.end(); } catch (error) { this.fail(String(error)); } });
    let stderr="";p.stderr.on("data",c=>stderr=(stderr+c).slice(-4000)); p.on("error",e=>this.fail(e.message)); p.on("exit",code=>{if(this.record.status!=="settled")this.fail(code===0?"Child exited without reporting completion":stderr||`Child exited ${code}`);});
    this.send("prompt",{message:`${d.prompt}\n\nAssignment:\n${this.spec.instructions}\n\nConclude with a non-empty result. Use subagent_parent to report partial or blocked work when needed.`}); return new Promise(r=>this.settled=()=>r(this.snapshot()));
  }
  async command(type:string,data:Record<string,unknown>={}):Promise<any>{const id=randomUUID();const response=new Promise<any>((resolve,reject)=>{const t=setTimeout(()=>{this.pending.delete(id);reject(new Error(`RPC ${type} timed out`))},10000);this.pending.set(id,r=>{clearTimeout(t);this.pending.delete(id);r.success?resolve(r.data):reject(new Error(r.error||`RPC ${type} failed`))})});this.send(type,{id,...data});return response;}
  async message(value:string){
    if (!this.record.retained || !this.alive()) throw new Error("Conversation is not retained by a live process");
    if (this.record.userOwned) throw new Error("Direct user intervention suspends parent steering");
    if (this.record.status !== "settled") throw new Error("Child is already working or waiting for an answer");
    if (!value.trim()) throw new Error("Message must be nonblank");
    this.last="";this.record.result=undefined;this.record.outcome=undefined;this.record.error=undefined;
    this.record.status="running";await this.command("prompt",{message:value});
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
      let response:Record<string,unknown>={id:request.id};
      if(request.method==="confirm")response.confirmed=await ctx.ui.confirm(title,request.message||"");
      else if(request.method==="select")response.value=await ctx.ui.select(title,request.options||[]);
      else if(request.method==="editor")response.value=await ctx.ui.editor(title,request.prefill||"");
      else response.value=await ctx.ui.input(title,request.message);
      if(response.value===undefined&&response.confirmed===undefined)response.cancelled=true;
      this.uiRequest=undefined;this.record.status="running";this.record.result=undefined;this.send("extension_ui_response",response);
    }finally{this.record.userOwned=false}
  }
  parentMessage(message: ApplicationMessage): unknown {
    if (!this.spec.definition.tools.includes("subagent_parent")) throw new Error("Parent helper is outside frozen authority");
    if (this.record.status === "settled") throw new Error("Assignment is already settled");
    if (message.type === "question") {
      if (typeof message.payload !== "string" || !message.payload.trim()) throw new Error("Question must be nonblank");
      if (this.question) throw new Error("A question is already pending");
      this.question={id:randomUUID(),message:message.payload.slice(0,LIMIT)};
      this.record.status="waiting";
      this.record.result=this.question.message;
      this.done();
      return {id:this.question.id};
    }
    if (message.type === "poll-answer") {
      if (!this.question || message.payload !== this.question.id) throw new Error("Unknown question");
      if (this.question.answer === undefined) return {pending:true};
      const answer=this.question.answer;
      this.question=undefined;
      this.record.status="running";
      this.record.result=undefined;
      return {answer};
    }
    if (message.type === "partial" || message.type === "blocked") {
      if (typeof message.payload !== "string" || !message.payload.trim()) throw new Error("Result must be nonblank");
      this.record.outcome=message.type;
      this.record.result=message.payload.slice(0,LIMIT);
      return {accepted:true};
    }
    throw new Error(`Unsupported parent message: ${message.type}`);
  }
  async cancel(){
    const terminal=this.record.status==="settled";
    if(!terminal){this.record.outcome="cancelled";this.record.status="settled";try{await this.command("abort")}catch{}}
    await this.stopProcess();
    if(!terminal)this.done();
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
  async finish(){if(this.record.status!=="settled")throw new Error("Cannot finish a conversation while work is active");if(this.record.userOwned)throw new Error("Return user intervention before finishing");await this.stopProcess();this.record.retained=false;}
  snapshot():ChildRecord{const {process:_,...r}=this.record;return {...r};}
  private send(type:string,data:Record<string,unknown>){this.record.process?.stdin.write(JSON.stringify({type,...data})+"\n");}
  protected async finishFromTurn(){if(this.record.status!=="running")return;this.record.turns++;if(!this.last.trim()&&!this.record.result?.trim())return this.fail("Blank output is not assignment completion");this.record.result=((this.record.outcome === "partial" || this.record.outcome === "blocked") ? this.record.result||this.last : this.last||this.record.result||"").slice(0,LIMIT);this.record.outcome=this.record.outcome??"complete";this.record.status="settled";this.record.updatedAt=new Date().toISOString();if(!this.record.retained&&!this.record.userOwned){try{await this.stopProcess()}catch(error){this.record.error=String(error)}}this.done();}
  protected fail(error:string){if(this.record.status==="settled")return;this.record.error=error;this.record.outcome="failed";this.record.status="settled";this.record.updatedAt=new Date().toISOString();void this.stopProcess().catch(cleanup=>{this.record.error+=`; ${String(cleanup)}`}).finally(()=>this.done());}
  protected done(){this.settled?.();this.settled=undefined;this.onUpdate?.(this.snapshot());}
}

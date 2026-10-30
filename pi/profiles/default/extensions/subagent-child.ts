import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";
import { Type } from "typebox";
import { EFFORTS } from "../lib/subagents/options.ts";
import { SUBAGENT_LAUNCH_DESCRIPTION, SUBAGENT_CONTROL_DESCRIPTION } from "../lib/subagents/guidance.ts";
import { bindChildSurface } from "../lib/subagents/child-surface.ts";
import { requestParent, type ChildEndpoint } from "../lib/subagents/transport.ts";
import { setTimeout as delay } from "node:timers/promises";
import { workspaceRoot } from "../lib/subagents/workspace.ts";
import { parentVisibleRecord, progressResult, renderSubagentCall, renderSubagentControlCall, renderSubagentResult, renderSubagentMessage } from "../lib/subagents/presentation.ts";
import { registerProfileCommand } from "../lib/profile-command.ts";
import type { ChildRecord } from "../lib/subagents/rpc.ts";
import { writeSubagentLineage } from "../lib/subagents/lineage.ts";
import type { CloseoutManifest } from "../lib/plan-integration/contracts.ts";
import { samePlatformPath } from "../lib/path-identity.ts";
interface CloseoutHandoff { manifest:CloseoutManifest; provenance:{source:"subagent-runtime";version:1;childId:string;agent:"integrator";parentSessionId:string;targetCheckout:string} }
interface Authority { id:string; agent:string; tools:string[]; delegates:string[]; parentId?:string; goalRunId?:string; cwd:string; skills:string[]; surface?:string; closeout?:CloseoutHandoff }
function isCloseoutManifest(value:unknown):value is CloseoutManifest {
 if(!value||typeof value!=="object")return false;
 const m=value as Record<string,unknown>;
 return ["repositoryRoot","targetCheckout","targetBranch","taskWorktree","taskBranch","taskCommit","archivedPlanPath","activeSpecStub","completedDate","integrationEvidence"].every(key=>typeof m[key]==="string")
  &&(m.targetStartingCommit===undefined||typeof m.targetStartingCommit==="string")
  &&(m.preservationStashOid===undefined||typeof m.preservationStashOid==="string")
  &&typeof m.noMerge==="boolean";
}
function closeoutPrompt(handoff:CloseoutHandoff):string {
 return `Authenticated closeout handoff (runtime-issued; use as task scope, not as permission to broaden it):\n${JSON.stringify({manifest:handoff.manifest,provenance:handoff.provenance},null,2)}\nReturn the closeout result in the manifest contract's typed outcome shape with exact evidence. Do not ask the user directly; report consequential decisions to the parent.`;
}

export function childSystemPrompt(basePrompt:string,agent:string,tools:readonly string[],rolePrompt:string):string {
 const toolNames=[...new Set(tools)].sort((a,b)=>a.localeCompare(b,"en"));
 const delegationPrompt=agent==="teamlead"?" Your tool discovery lists only your own tools. Your subagents do not inherit your tool restrictions; they receive the tools defined for their roles.":"";
 const authorityPrompt=`You are subagent ${agent}. Your authority is frozen to tools [${toolNames.join(", ")||"none"}]. You may not activate or request other tools.${delegationPrompt} A normal final reply completes your assignment. Parent notifications are evidence to incorporate, not receipts to acknowledge.`;
 return `${basePrompt}\n\n${authorityPrompt}${rolePrompt?`\n\n${rolePrompt}`:""}`;
}

export default function childAuthority(pi:ExtensionAPI){
 (pi as any).registerMessageRenderer?.("subagent-result",renderSubagentMessage);
 if(!process.env.PI_SUBAGENT_AUTHORITY){if(process.env.PI_SUBAGENT_ENDPOINT)throw new Error("Subagent authority is missing");return}
 let authority:Authority;try{authority=JSON.parse(process.env.PI_SUBAGENT_AUTHORITY||"")}catch{throw new Error("Subagent authority is missing or invalid")}
 if (!authority || !Array.isArray(authority.tools) || !authority.tools.every(t=>typeof t==="string") || !Array.isArray(authority.delegates) || !Array.isArray(authority.skills)) throw new Error("Invalid frozen authority");
 if(authority.agent==="integrator"){
  const handoff=authority.closeout,provenance=handoff?.provenance;
  if(!handoff||!isCloseoutManifest(handoff.manifest)||handoff.manifest.noMerge||authority.parentId||authority.delegates.length||!samePlatformPath(authority.cwd,handoff.manifest.targetCheckout)
   ||provenance?.source!=="subagent-runtime"||provenance.version!==1||provenance.childId!==authority.id||provenance.agent!=="integrator"
   ||!samePlatformPath(provenance.targetCheckout,handoff.manifest.targetCheckout)||!provenance.parentSessionId)throw new Error("Invalid Integrator closeout authority handoff");
 }else if(authority.closeout)throw new Error("Closeout authority is restricted to the Integrator role");
 if(authority.closeout&&!process.env.PI_SUBAGENT_ENDPOINT)throw new Error("Integrator requires an authenticated parent endpoint");
 if(authority.goalRunId!==undefined&&(typeof authority.goalRunId!=="string"||!authority.goalRunId.trim()||authority.goalRunId!==process.env.PI_GOAL_RUN_ID))throw new Error("Invalid goal run authority");
 workspaceRoot(authority.cwd);
 let goalSession:string|undefined,goalGuidance:string|undefined;
 const goalSubscriptions:Array<()=>void>=[];
 const allowed=new Set(authority.tools);
 const registerTool=pi.registerTool.bind(pi);
 pi.registerTool=function registerAuthorizedChildTool<TParams extends TSchema=TSchema,TDetails=unknown,TState=unknown>(tool:ToolDefinition<TParams,TDetails,TState>):void{
  registerTool(allowed.has(tool.name)?tool:{...tool,exposure:"hidden"});
 };
 registerProfileCommand(pi,"exit",{description:"Exit this restricted child",handler:async(_args,ctx)=>ctx.shutdown()});
 const parentEndpoint=()=>{
  const endpoint=JSON.parse(process.env.PI_SUBAGENT_ENDPOINT||"null") as ChildEndpoint|null;
  if(!endpoint||endpoint.child!==authority.id)throw new Error("Authenticated parent unavailable");
  if(authority.closeout&&endpoint.origin!==authority.closeout.provenance.parentSessionId)throw new Error("Integrator parent-session provenance mismatch");
  return endpoint;
 };
 if(authority.goalRunId){
  goalSubscriptions.push(pi.events.on("goal-run-id",value=>{
   if(!value||typeof value!=="object")return;
   const request=value as Record<string,unknown>;
   if(request.session===goalSession&&typeof request.respond==="function")request.respond(authority.goalRunId!);
  }));
  goalSubscriptions.push(pi.events.on("goal-accounting",value=>{
   if(!value||typeof value!=="object")return;
   const event=value as Record<string,unknown>;
   if(event.runId!==authority.goalRunId||event.session!==goalSession||!Array.isArray(event.pending))return;
   const payload={type:event.type,runId:event.runId,session:event.session,recordId:event.recordId,timestamp:event.timestamp,persisted:event.persisted};
   event.pending.push(requestParent(parentEndpoint(),{type:"goal-accounting",payload}).then(()=>{}));
  }));
  pi.on("turn_start",async(_event,ctx)=>{
   try{
    const result=await requestParent(parentEndpoint(),{type:"goal-admit"}) as {allowed?:unknown;reason?:unknown;guidance?:unknown};
    goalGuidance=typeof result?.guidance==="string"?result.guidance:undefined;
    if(result?.allowed!==true){ctx.ui.notify(typeof result?.reason==="string"?result.reason:"Owning goal paused further work","warning");ctx.abort()}
   }catch(error){ctx.ui.notify(`Goal admission unavailable: ${error instanceof Error?error.message:String(error)}`,"warning");ctx.abort()}
  });
  pi.on("context",event=>{
   if(!goalGuidance)return;
   return{messages:[...event.messages.filter(message=>!(message.role==="custom"&&message.customType==="goal-budget")),{role:"custom" as const,customType:"goal-budget",content:goalGuidance,display:false,timestamp:0}]};
  });
  pi.on("session_shutdown",()=>{goalSession=undefined;goalGuidance=undefined;for(const unsubscribe of goalSubscriptions)unsubscribe()});
 }
 pi.on("session_start",async(_event,ctx)=>{
  pi.setActiveTools(pi.getAllTools().filter(tool=>allowed.has(tool.name)&&tool.exposure!=="deferred"&&tool.exposure!=="codemode").map(tool=>tool.name));
  if(!process.env.PI_SUBAGENT_ENDPOINT)return;
  const sessionId=ctx.sessionManager.getSessionId(),sessionFile=ctx.sessionManager.getSessionFile();
  if(!sessionId.trim()||!sessionFile)throw new Error("Child session is not durable");
  const endpoint=parentEndpoint();
  goalSession=sessionFile;
  const response=await requestParent(endpoint,{type:"session-identity",payload:{sessionId,sessionFile}}) as {parentSessionId?:unknown};
  if(typeof response?.parentSessionId!=="string"||!response.parentSessionId.trim())throw new Error("Authenticated parent session identity unavailable");
  writeSubagentLineage(pi,ctx,authority.agent,response.parentSessionId,endpoint.origin);
 });
 bindChildSurface(pi,authority.surface==="visible");
 pi.on("tool_call",event=>{
  if(!allowed.has(event.toolName))return{block:true,reason:`Tool ${event.toolName} is outside frozen ${authority.agent} authority`};
 });
 pi.on("before_agent_start",event=>({systemPrompt:childSystemPrompt(event.systemPrompt,authority.agent,authority.tools,[process.env.PI_SUBAGENT_PROMPT||"",authority.closeout?closeoutPrompt(authority.closeout):""].filter(Boolean).join("\n\n"))}));
 const waitForChild=async(value:unknown,signal?:AbortSignal,onUpdate?: (value:any)=>void)=>{
  let record=value as ChildRecord;
  let lastView="",lastUpdate=0;
  while(record.status==="running"||(record.status==="settled"&&!record.retained&&!record.userOwned&&!record.error&&(record.processState!=="exited"||record.paneState==="open"))){
   const view=JSON.stringify([record.status,record.phase,record.toolName,record.waitState,record.outcome,record.error]);
   if(view!==lastView||Date.now()-lastUpdate>=1000){onUpdate?.(progressResult(record));lastView=view;lastUpdate=Date.now()}
   await delay(250,undefined,{signal});
   record=await requestParent(parentEndpoint(),{type:"control",payload:{action:"inspect",id:record.id,consume:true}}) as ChildRecord;
  }
  onUpdate?.(progressResult(record));
  return record;
 };
 pi.registerTool({name:"subagent",exposure:"model-only",label:"Delegate to subagent",description:`${SUBAGENT_LAUNCH_DESCRIPTION} Commission only permitted roles under your frozen authority. Omit surface to inherit your own. Inside Herdr, select headless only when the user requests it, not merely because work is parallel, unattended, or in a worktree.`,parameters:Type.Object({agent:Type.String(),instructions:Type.String(),background:Type.Optional(Type.Boolean()),blockingReason:Type.Optional(Type.String({description:"Why this launch must block rather than use automatic result delivery; required except for Strategist."})),cwd:Type.Optional(Type.String()),model:Type.Optional(Type.String()),effort:Type.Optional(Type.Union(EFFORTS.map(value=>Type.Literal(value)))),skills:Type.Optional(Type.Array(Type.String())),surface:Type.Optional(Type.Union([Type.Literal("visible"),Type.Literal("headless")]))}),async execute(_id,p,signal,onUpdate){
  if(!allowed.has("subagent")||!authority.delegates.includes(p.agent))throw new Error("Delegation is outside frozen authority");
  const strategist=p.agent==="strategist";
  const background=strategist?false:p.background??false;
  if(!strategist&&!background&&!p.blockingReason?.trim())throw new Error("Non-Strategist foreground launch requires blockingReason");
  let result=await requestParent(parentEndpoint(),{type:"delegate",payload:{...p,background}});
  if(!background)result=await waitForChild(result,signal,onUpdate);
  const visible=parentVisibleRecord(result as ChildRecord);
  return{content:[{type:"text",text:JSON.stringify(visible)}],details:visible};
 },renderCall:renderSubagentCall,renderResult:renderSubagentResult});
 pi.registerTool({name:"subagent_control",exposure:"model-only",label:"Control direct subagent",description:`${SUBAGENT_CONTROL_DESCRIPTION} Only directly commissioned children may be controlled. inspect returns current state and saved results. background is compatibility-only and never waits for completion.`,parameters:Type.Object({id:Type.String({description:"A returned subagentId (legacy id is also accepted), display name, or unique prefix. This is not the native sessionId."}),action:Type.Union([Type.Literal("inspect"),Type.Literal("message"),Type.Literal("answer"),Type.Literal("finish"),Type.Literal("cancel")]),message:Type.Optional(Type.String()),delivery:Type.Optional(Type.Union([Type.Literal("queued"),Type.Literal("immediate")])),interaction:Type.Optional(Type.Union([Type.Literal("notify"),Type.Literal("request")])),protocol:Type.Optional(Type.Literal("question-answer")),replyTo:Type.Optional(Type.String()),background:Type.Optional(Type.Boolean())}),async execute(_id,p,signal,onUpdate){
  if(!allowed.has("subagent_control"))throw new Error("Control is outside frozen authority");
  let result=await requestParent(parentEndpoint(),{type:"control",payload:p});
  const visible=parentVisibleRecord(result as ChildRecord);
  return{content:[{type:"text",text:JSON.stringify(visible)}],details:visible};
 },renderCall:renderSubagentControlCall,renderResult:renderSubagentResult});
 pi.registerTool({name:"subagent_parent",exposure:"model-only",label:"Report to parent",description:"Ask the originating parent a factual question or report genuinely unfinished/blocked work. A question yields cleanly and returns a request ID; do not poll for the answer. Keep the request pending during ordinary user discussion. When you decide the discussion answered your question, use cancel-question with that request ID. Do not use this tool for successful completion; give a normal final reply instead.",parameters:Type.Object({action:Type.Union([Type.Literal("question"),Type.Literal("cancel-question"),Type.Literal("partial"),Type.Literal("blocked")]),message:Type.Optional(Type.String()),requestId:Type.Optional(Type.String())}),async execute(_id,p,signal): Promise<any>{
  if(p.action==="question"&&!p.message)throw new Error("Question requires message");
  if(p.action==="cancel-question"&&!p.requestId)throw new Error("cancel-question requires requestId");
  if (!allowed.has("subagent_parent")) throw new Error("Parent helper is outside frozen authority");
  const endpoint = JSON.parse(process.env.PI_SUBAGENT_ENDPOINT || "null") as ChildEndpoint | null;
  if (!endpoint || endpoint.child !== authority.id) throw new Error("Authenticated parent unavailable");
  const response = await requestParent(endpoint, {type:p.action,payload:p.action==="question"?{message:p.message,protocol:"question-answer"}:p.action==="cancel-question"?{requestId:p.requestId}:p.message}) as {id?:string;requestId?:string;resolution?:string};
  if (p.action === "cancel-question") return {content:[{type:"text",text:`Parent question ${p.requestId} cancelled. Continue the conversation.`}],details:{requestId:p.requestId,resolution:response.resolution??"cancelled"}};
  if (p.action !== "question") return {content:[{type:"text",text:"Report accepted by parent"}],details:{requestId:undefined as string|undefined,protocol:undefined as "question-answer"|undefined}};
  const requestId=response.id;
  const questionText=p.message!.slice(0,24_000);
  return {content:[{type:"text",text:`Question sent to parent${requestId?` (request ${requestId})`:""}. Waiting for the parent's reply.\nRequest ID: ${requestId??"unavailable"}\nQuestion:\n${questionText}`}],details:{requestId,protocol:"question-answer" as const,question:questionText},terminate:true};
 }});
}

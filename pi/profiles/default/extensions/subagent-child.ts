import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { EFFORTS } from "../lib/subagents/options.ts";
import { bindChildSurface } from "../lib/subagents/child-surface.ts";
import { requestParent, type ChildEndpoint } from "../lib/subagents/transport.ts";
import { setTimeout as delay } from "node:timers/promises";
import { workspaceRoot } from "../lib/subagents/workspace.ts";
import { progressResult, renderSubagentCall, renderSubagentControlCall, renderSubagentResult, renderSubagentMessage } from "../lib/subagents/presentation.ts";
import { registerProfileCommand } from "../lib/profile-command.ts";
import type { ChildRecord } from "../lib/subagents/rpc.ts";
import { dispatchOperation, withDispatchMetadata } from "../lib/subagents/control-result.ts";
import { writeSubagentLineage } from "../lib/subagents/lineage.ts";
interface Authority { id:string; agent:string; tools:string[]; delegates:string[]; parentId?:string; cwd:string; skills:string[]; surface?:string }

export function childSystemPrompt(basePrompt:string,agent:string,tools:readonly string[],rolePrompt:string):string {
 const toolNames=[...new Set(tools)].sort((a,b)=>a.localeCompare(b,"en"));
 const delegationPrompt=agent==="teamlead"?" Your tool discovery lists only your own tools. Your subagents do not inherit your tool restrictions; they receive the tools defined for their roles.":"";
 const authorityPrompt=`You are subagent ${agent}. Your authority is frozen to tools [${toolNames.join(", ")||"none"}]. You may not activate or request other tools.${delegationPrompt} A normal final reply automatically completes your assignment; no reporting tool is needed for success. Use partial only for genuinely unfinished work and blocked only when you cannot proceed. Parent notifications are evidence to incorporate, not receipts to acknowledge. Use the question action for a question-answer request; it yields cleanly and the parent answer resumes this conversation. Keep that request pending while discussing it with a user. When you decide the discussion answered it, use subagent_parent with action cancel-question and the request ID; ordinary user text does not resolve the request.`;
 return `${basePrompt}\n\n${authorityPrompt}${rolePrompt?` ${rolePrompt}`:""}`;
}

export default function childAuthority(pi:ExtensionAPI){
 (pi as any).registerMessageRenderer?.("subagent-result",renderSubagentMessage);
 if(!process.env.PI_SUBAGENT_AUTHORITY){if(process.env.PI_SUBAGENT_ENDPOINT)throw new Error("Subagent authority is missing");return}
 let authority:Authority;try{authority=JSON.parse(process.env.PI_SUBAGENT_AUTHORITY||"")}catch{throw new Error("Subagent authority is missing or invalid")}
 if (!authority || !Array.isArray(authority.tools) || !authority.tools.every(t=>typeof t==="string") || !Array.isArray(authority.delegates) || !Array.isArray(authority.skills)) throw new Error("Invalid frozen authority");
 workspaceRoot(authority.cwd);
 const allowed=new Set(authority.tools);
 registerProfileCommand(pi,"exit",{description:"Exit this restricted child",handler:async(_args,ctx)=>ctx.shutdown()});
 const parentEndpoint=()=>{
  const endpoint=JSON.parse(process.env.PI_SUBAGENT_ENDPOINT||"null") as ChildEndpoint|null;
  if(!endpoint||endpoint.child!==authority.id)throw new Error("Authenticated parent unavailable");
  return endpoint;
 };
 pi.on("session_start",async(_event,ctx)=>{
  pi.setActiveTools(pi.getAllTools().map(t=>t.name).filter(t=>allowed.has(t)));
  if(!process.env.PI_SUBAGENT_ENDPOINT)return;
  const sessionId=ctx.sessionManager.getSessionId(),sessionFile=ctx.sessionManager.getSessionFile();
  if(!sessionId.trim()||!sessionFile)throw new Error("Child session is not durable");
  const endpoint=parentEndpoint();
  const response=await requestParent(endpoint,{type:"session-identity",payload:{sessionId,sessionFile}}) as {parentSessionId?:unknown};
  if(typeof response?.parentSessionId!=="string"||!response.parentSessionId.trim())throw new Error("Authenticated parent session identity unavailable");
  writeSubagentLineage(pi,ctx,authority.agent,response.parentSessionId,endpoint.origin);
 });
 bindChildSurface(pi,authority.surface==="visible");
 pi.on("tool_call",event=>{
  if(!allowed.has(event.toolName))return{block:true,reason:`Tool ${event.toolName} is outside frozen ${authority.agent} authority`};
 });
 pi.on("before_agent_start",event=>({systemPrompt:childSystemPrompt(event.systemPrompt,authority.agent,authority.tools,process.env.PI_SUBAGENT_PROMPT||"")}));
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
 pi.registerTool({name:"subagent",label:"Delegate to subagent",description:"Commission a permitted subagent under the frozen coordinator authority. Background completion returns to the coordinator automatically, so continue independent work instead of polling. Strategist always runs in the foreground and is never retained, regardless of background or retain. For any other foreground launch, blockingReason is required and must explain why no useful independent work remains and why automatic result delivery is unsuitable; a downstream dependency alone is insufficient. Omit surface for normal delegation to inherit the coordinator's surface. Inside Herdr, select headless only when the user requests it, not merely because work is parallel, unattended, or in a worktree.",parameters:Type.Object({agent:Type.String(),instructions:Type.String(),retain:Type.Optional(Type.Boolean()),background:Type.Optional(Type.Boolean()),blockingReason:Type.Optional(Type.String({description:"Required for non-Strategist foreground launches. Explain why no useful independent work remains and why automatic result delivery is unsuitable; a downstream dependency alone is insufficient."})),cwd:Type.Optional(Type.String()),model:Type.Optional(Type.String()),effort:Type.Optional(Type.Union(EFFORTS.map(value=>Type.Literal(value)))),skills:Type.Optional(Type.Array(Type.String())),surface:Type.Optional(Type.Union([Type.Literal("visible"),Type.Literal("headless")]))}),async execute(_id,p,signal,onUpdate){
  if(!allowed.has("subagent")||!authority.delegates.includes(p.agent))throw new Error("Delegation is outside frozen authority");
  const strategist=p.agent==="strategist";
  const background=strategist?false:p.background??false;
  if(!strategist&&!background&&!p.blockingReason?.trim())throw new Error("Non-Strategist foreground launch requires blockingReason");
  let result=await requestParent(parentEndpoint(),{type:"delegate",payload:{...p,background,...(strategist?{retain:false}:{})}});
  if(!background)result=await waitForChild(result,signal,onUpdate);
  return{content:[{type:"text",text:JSON.stringify(result)}],details:result};
 },renderCall:renderSubagentCall,renderResult:renderSubagentResult});
 pi.registerTool({name:"subagent_control",label:"Control direct subagent",description:"Inspect, message, request an answer, or cancel a directly commissioned subagent. Messages use native queued steering by default; immediate is an intentional redirect.",parameters:Type.Object({id:Type.String(),action:Type.Union([Type.Literal("inspect"),Type.Literal("message"),Type.Literal("answer"),Type.Literal("finish"),Type.Literal("cancel")]),message:Type.Optional(Type.String()),delivery:Type.Optional(Type.Union([Type.Literal("queued"),Type.Literal("immediate")])),interaction:Type.Optional(Type.Union([Type.Literal("notify"),Type.Literal("request")])),protocol:Type.Optional(Type.Literal("question-answer")),replyTo:Type.Optional(Type.String()),background:Type.Optional(Type.Boolean())}),async execute(_id,p,signal,onUpdate){
  if(!allowed.has("subagent_control"))throw new Error("Control is outside frozen authority");
  let result=await requestParent(parentEndpoint(),{type:"control",payload:p});
  if(p.action==="message"||p.action==="answer")result=withDispatchMetadata(result as ChildRecord,dispatchOperation(p.action,p.replyTo));
  return{content:[{type:"text",text:JSON.stringify(result)}],details:result};
 },renderCall:renderSubagentControlCall,renderResult:renderSubagentResult});
 pi.registerTool({name:"tool_search",label:"Search permitted tools",description:"Inspect only the tools in this conversation's frozen authority. Cannot activate additional tools.",parameters:Type.Object({query:Type.Optional(Type.String())}),async execute(_id,p){
  const tools=pi.getAllTools().filter(t=>allowed.has(t.name)&&(!p.query||`${t.name} ${t.description}`.toLowerCase().includes(p.query.toLowerCase()))).map(t=>({name:t.name,description:t.description}));
  return{content:[{type:"text",text:JSON.stringify(tools)}],details:{tools}};
 }});
 pi.registerTool({name:"subagent_parent",label:"Report to parent",description:"Ask the originating parent a factual question or report genuinely unfinished/blocked work. A question yields cleanly and returns a request ID; do not poll for the answer. Keep the request pending during ordinary user discussion. When you decide the discussion answered your question, use cancel-question with that request ID. Do not use this tool for successful completion; give a normal final reply instead.",parameters:Type.Object({action:Type.Union([Type.Literal("question"),Type.Literal("cancel-question"),Type.Literal("partial"),Type.Literal("blocked")]),message:Type.Optional(Type.String()),requestId:Type.Optional(Type.String())}),async execute(_id,p,signal): Promise<any>{
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

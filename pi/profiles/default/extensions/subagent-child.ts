import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { EFFORTS } from "../lib/subagents/options.ts";
import { bindChildSurface } from "../lib/subagents/child-surface.ts";
import { requestParent, type ChildEndpoint } from "../lib/subagents/transport.ts";
import { setTimeout as delay } from "node:timers/promises";
import { guardNativePath, workspaceRoot } from "../lib/subagents/workspace.ts";
interface Authority { id:string; agent:string; tools:string[]; delegates:string[]; parentId?:string; cwd:string; skills:string[]; surface?:string }
export default function childAuthority(pi:ExtensionAPI){
 if(!process.env.PI_SUBAGENT_AUTHORITY){if(process.env.PI_SUBAGENT_ENDPOINT)throw new Error("Subagent authority is missing");return}
 let authority:Authority;try{authority=JSON.parse(process.env.PI_SUBAGENT_AUTHORITY||"")}catch{throw new Error("Subagent authority is missing or invalid")}
 if (!authority || !Array.isArray(authority.tools) || !authority.tools.every(t=>typeof t==="string") || !Array.isArray(authority.delegates) || !Array.isArray(authority.skills)) throw new Error("Invalid frozen authority");
 const root=workspaceRoot(authority.cwd);
 const allowed=new Set(authority.tools);
 pi.registerCommand("exit",{description:"Exit this restricted child",handler:async(_args,ctx)=>ctx.shutdown()});
 pi.on("user_bash",()=>({result:{output:"Direct shell UI is disabled in restricted children. Use an allowed shell tool through Damage Control instead.",exitCode:1,cancelled:false,truncated:false}}));
 pi.on("session_start",()=>pi.setActiveTools(pi.getAllTools().map(t=>t.name).filter(t=>allowed.has(t))));
 bindChildSurface(pi,authority.surface==="visible");
 pi.on("tool_call",event=>{
  if(!allowed.has(event.toolName))return{block:true,terminate:true,reason:`Tool ${event.toolName} is outside frozen ${authority.agent} authority`};
  try { guardNativePath(root,authority.skills,event.toolName,event.input); }
  catch(error){return{block:true,terminate:true,reason:error instanceof Error?error.message:String(error)}}
 });
 pi.on("before_agent_start",event=>({systemPrompt:`${event.systemPrompt}\n\nYou are subagent ${authority.agent}. Your authority is frozen to tools [${[...allowed].join(", ")||"none"}]. You may not activate or request other tools. A normal final reply automatically completes your assignment; no reporting tool is needed for success. Use partial only for genuinely unfinished work and blocked only when you cannot proceed. ${process.env.PI_SUBAGENT_PROMPT||""}`}));
 const parentEndpoint=()=>{
  const endpoint=JSON.parse(process.env.PI_SUBAGENT_ENDPOINT||"null") as ChildEndpoint|null;
  if(!endpoint||endpoint.child!==authority.id)throw new Error("Authenticated parent unavailable");
  return endpoint;
 };
 const waitForChild=async(value:unknown,signal?:AbortSignal)=>{
  let record=value as {id:string;status:string;retained:boolean;userOwned:boolean;processState:string;paneState?:string;error?:string};
  while(record.status==="running"||(record.status==="settled"&&!record.retained&&!record.userOwned&&!record.error&&(record.processState!=="exited"||record.paneState==="open"))){
   await delay(250,undefined,{signal});
   record=await requestParent(parentEndpoint(),{type:"control",payload:{action:"inspect",id:record.id}}) as typeof record;
  }
  return record;
 };
 pi.registerTool({name:"subagent",label:"Delegate to leaf",description:"Commission a permitted leaf under the frozen coordinator authority. Omit surface for normal delegation to inherit the coordinator's surface. Inside Herdr, select headless only when the user requests it, not merely because work is parallel, unattended, or in a worktree.",parameters:Type.Object({agent:Type.String(),instructions:Type.String(),retain:Type.Optional(Type.Boolean()),background:Type.Optional(Type.Boolean()),cwd:Type.Optional(Type.String()),model:Type.Optional(Type.String()),effort:Type.Optional(Type.Union(EFFORTS.map(value=>Type.Literal(value)))),skills:Type.Optional(Type.Array(Type.String())),surface:Type.Optional(Type.Union([Type.Literal("visible"),Type.Literal("headless")]))}),async execute(_id,p,signal){
  if(!allowed.has("subagent")||!authority.delegates.includes(p.agent))throw new Error("Delegation is outside frozen authority");
  let result=await requestParent(parentEndpoint(),{type:"delegate",payload:p});
  if(!p.background)result=await waitForChild(result,signal);
  return{content:[{type:"text",text:JSON.stringify(result)}],details:{}};
 }});
 pi.registerTool({name:"subagent_control",label:"Control direct leaf",description:"Inspect, continue, answer factual questions, or cancel a directly commissioned leaf.",parameters:Type.Object({id:Type.String(),action:Type.Union([Type.Literal("inspect"),Type.Literal("message"),Type.Literal("answer"),Type.Literal("finish"),Type.Literal("cancel")]),message:Type.Optional(Type.String()),background:Type.Optional(Type.Boolean())}),async execute(_id,p,signal){
  if(!allowed.has("subagent_control"))throw new Error("Control is outside frozen authority");
  let result=await requestParent(parentEndpoint(),{type:"control",payload:p});
  if((p.action==="message"||p.action==="answer")&&!p.background)result=await waitForChild(result,signal);
  return{content:[{type:"text",text:JSON.stringify(result)}],details:{}};
 }});
 pi.registerTool({name:"tool_search",label:"Search permitted tools",description:"Inspect only the tools in this conversation's frozen authority. Cannot activate additional tools.",parameters:Type.Object({query:Type.Optional(Type.String())}),async execute(_id,p){
  const tools=pi.getAllTools().filter(t=>allowed.has(t.name)&&(!p.query||`${t.name} ${t.description}`.toLowerCase().includes(p.query.toLowerCase()))).map(t=>({name:t.name,description:t.description}));
  return{content:[{type:"text",text:JSON.stringify(tools)}],details:{tools}};
 }});
 pi.registerTool({name:"subagent_parent",label:"Report to parent",description:"Ask the originating parent a factual question or report genuinely unfinished/blocked work. Do not use this tool for successful completion; give a normal final reply instead.",parameters:Type.Object({action:Type.Union([Type.Literal("question"),Type.Literal("partial"),Type.Literal("blocked")]),message:Type.String()}),async execute(_id,p,signal){
  if (!allowed.has("subagent_parent")) throw new Error("Parent helper is outside frozen authority");
  const endpoint = JSON.parse(process.env.PI_SUBAGENT_ENDPOINT || "null") as ChildEndpoint | null;
  if (!endpoint || endpoint.child !== authority.id) throw new Error("Authenticated parent unavailable");
  const response = await requestParent(endpoint, {type:p.action,payload:p.message}) as {id?:string};
  if (p.action !== "question") return {content:[{type:"text",text:"Report accepted by parent"}],details:{}};
  for (;;) {
    if (signal?.aborted) throw new Error("Parent question interrupted");
    const reply = await requestParent(endpoint, {type:"poll-answer",payload:response.id}) as {answer?:string};
    if (reply.answer !== undefined) return {content:[{type:"text",text:reply.answer}],details:{}};
    await delay(250, undefined, {signal});
  }
 }});
}

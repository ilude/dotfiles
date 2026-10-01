import { resolve, join } from "node:path";
import type { LaunchSpec } from "./rpc.ts";
import type { ChildEndpoint } from "./transport.ts";
export function childLaunch(spec: LaunchSpec, id: string, profile: string, endpoint?: ChildEndpoint) {
 const d=spec.definition;
 const isolatedResources=d.name==="teamlead"?[]:["--no-skills"];
 const tools=[...d.tools];
 if(d.name==="teamlead"&&!tools.includes("codemode"))tools.push("codemode");
 const args=[...(spec.surface==="headless"?["--mode","rpc"]:[]),"--no-extensions",...isolatedResources,"--no-prompt-templates","--no-themes","--approve",...(tools.length?["--tools",tools.join(",")]:["--no-tools"]),"--model",spec.model,"--thinking",spec.effort];
 const extension=(name:string)=>args.push("--extension",join(profile,"extensions",name));
 extension("subagent-child.ts");extension("compaction.ts");extension("damage-control/index.js");extension("tool-invocation-provenance.ts");extension("scoped-instructions.ts");
 if(tools.includes("tool_search"))args.push("--extension","builtin:tool-search");
 if(d.name==="teamlead")args.push("--extension","builtin:codemode");
 if(tools.includes("pi_session")||tools.includes("session_messages"))extension("session-profile.ts");
 if(tools.includes("session_launch"))extension("session-launch.ts");
 if(tools.includes("schedule"))extension("scheduler.ts");
 if(tools.includes("browser_session")||tools.includes("browser_page"))extension("browser-control.ts");
 if(tools.includes("image_properties")||tools.includes("image_transform"))extension("image-tools.ts");
 if(tools.includes("jev_evaluate"))extension("jev.ts");
 // Bedrock children account finalized replies without loading operator commands.
 // Mantle additionally needs its custom provider registration.
 if(spec.model.startsWith("bedrock-mantle/"))extension("bedrock/provider.ts");
 else if(spec.model.startsWith("amazon-bedrock/"))extension("bedrock/accounting.ts");
 if(tools.some(t=>t==="web_search"||t==="web_fetch"))extension("web-tools/index.ts");
 if(tools.includes("log_analytics"))extension("log-analytics-tool.ts");
 if(tools.some(t=>t.startsWith("herdr_")))extension("herdr-tools.ts");
 if(tools.some(t=>t.startsWith("onclave_")))extension("onclave-pi.ts");
 if(spec.surface==="visible"){extension("herdr-agent-state.ts");extension("herdr-ui-prompt-state.ts")}
 for(const skill of spec.skills)args.push("--skill",skill);
 const closeout=spec.closeoutManifest?{
  manifest:spec.closeoutManifest,
  provenance:{source:"subagent-runtime",version:1,childId:id,agent:d.name,parentSessionId:spec.closeoutParentSessionId,targetCheckout:spec.closeoutManifest.targetCheckout},
 }:undefined;
 return {args,env:{PI_CODING_AGENT_DIR:resolve(profile),PI_SUBAGENT_AUTHORITY:JSON.stringify({id,agent:d.name,tools,delegates:d.delegates,parentId:spec.parentId,cwd:spec.cwd,skills:spec.skills,surface:spec.surface,closeout}),PI_SUBAGENT_PROMPT:spec.prompt??d.prompt,PI_SUBAGENT_ENDPOINT:endpoint?JSON.stringify(endpoint):""}};
}

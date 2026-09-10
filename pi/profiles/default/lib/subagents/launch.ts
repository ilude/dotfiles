import { resolve, join } from "node:path";
import type { LaunchSpec } from "./rpc.ts";
import type { ChildEndpoint } from "./transport.ts";
export function childLaunch(spec: LaunchSpec, id: string, profile: string, endpoint?: ChildEndpoint) {
 const d=spec.definition;
 const args=[...(spec.surface==="headless"?["--mode","rpc"]:[]),"--no-extensions","--no-skills","--no-prompt-templates","--no-themes","--no-context-files","--no-approve",...(d.tools.length?["--tools",d.tools.join(",")]:["--no-tools"]),"--model",spec.model,"--thinking",spec.effort];
 const extension=(name:string)=>args.push("--extension",join(profile,"extensions",name));
 extension("subagent-child.ts");extension("damage-control/index.js");
 // The provider is a deliberately separate extension: loading the aggregate
 // Bedrock extension would also grant the child operator accounting commands.
 if(spec.model.startsWith("bedrock-mantle/"))extension("bedrock/provider.ts");
 if(d.tools.some(t=>t==="web_search"||t==="web_fetch"))extension("web-tools/index.ts");
 if(d.tools.includes("log_analytics"))extension("log-analytics-tool.ts");
 if(spec.surface==="visible"){extension("herdr-agent-state.ts");extension("herdr-ui-prompt-state.ts")}
 for(const skill of spec.skills)args.push("--skill",skill);
 return {args,env:{PI_CODING_AGENT_DIR:resolve(profile),PI_SUBAGENT_AUTHORITY:JSON.stringify({id,agent:d.name,tools:d.tools,delegates:d.delegates,parentId:spec.parentId,cwd:spec.cwd,skills:spec.skills,surface:spec.surface}),PI_SUBAGENT_PROMPT:spec.prompt??d.prompt,PI_SUBAGENT_ENDPOINT:endpoint?JSON.stringify(endpoint):""}};
}

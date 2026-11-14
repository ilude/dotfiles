import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { resolvePreferredModel } from "../model-selection.ts";
export const EFFORTS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type AgentEffort = typeof EFFORTS[number];
export const DELEGATION_MODEL_DESCRIPTION = 'Bare model/family, e.g. "opus"; Pi resolves the provider. Opus defaults to AWS Bedrock inside Pi; select personal-project ccyl work before calling this tool. Use provider/model only for a user-requested provider, not an inferred choice. ccyl is a separate Claude Code client, not a Pi provider.';
export const PROVIDER_OVERRIDE_DESCRIPTION = 'Provider explicitly requested by the user; must match a provider-qualified model. Required for direct anthropic overrides. Do not set for an ordinary Opus request or for ccyl.';
export function resolveModel(model: string | undefined, fallback: string | undefined, registry?: ModelRegistry): { provider: string; id: string } {
 const value=model??fallback;
 if(!value||value!==value.trim())throw new Error(`Explicit provider/model required, received ${value??"none"}`);
 if(!value.includes("/")){
  if(!registry)throw new Error(`Explicit provider/model required, received ${value}`);
  const resolved=resolvePreferredModel(value,registry);
  return{provider:resolved.provider,id:resolved.id};
 }
 const [provider,...rest]=value.split("/"),id=rest.join("/");
 if(!provider.trim()||!id.trim())throw new Error(`Explicit provider/model required, received ${value}`);
 return{provider,id};
}
/** Tool boundary: keep trusted role defaults, but require deliberate direct-Anthropic overrides. */
export function resolveDelegationModel(model: string | undefined, fallback: string | undefined, registry?: ModelRegistry, providerOverride?: string): { provider: string; id: string } {
 if (model === "ccyl" || model?.startsWith("ccyl/") || providerOverride === "ccyl") throw new Error("ccyl is a separate Claude Code client, not a Pi model provider. Use the host\'s explicit ccyl client route, not a named Pi role.");
 if (providerOverride !== undefined && (!model?.includes("/") || providerOverride !== model.split("/")[0])) throw new Error("providerOverride must match an explicit provider/model requested by the user");
 const resolved = resolveModel(model, fallback, registry);
 if (model !== undefined && resolved.provider === "anthropic" && providerOverride !== "anthropic") throw new Error('Direct Anthropic requires providerOverride: "anthropic" and an explicit user request for that provider. For Opus without ccyl, pass model: "opus" to use AWS Bedrock. Do not request Anthropic login for an unintended route.');
 return resolved;
}
export function resolveAgentEffort(name:string,model:string,requested:AgentEffort|undefined,fallback:AgentEffort|undefined):AgentEffort{
 const effort=requested??fallback??"low";
 const {id}=resolveModel(model,undefined);
 if(name==="strategist"&&id.includes("luna")&&!(["high","xhigh","max"] as AgentEffort[]).includes(effort))throw new Error("Strategist cannot use Luna below high effort");
 if(name==="steward"&&id.includes("luna")&&!(["high","xhigh"] as AgentEffort[]).includes(effort))throw new Error("Steward must use Luna high or xhigh effort");
 return effort;
}
interface SkillResolutionContext { cwd?: string; projectTrusted?: boolean }
function projectSkill(name:string,cwd:string):string|undefined{
 let directory=resolve(cwd);
 while(true){
  const file=join(directory,".pi","skills",name,"SKILL.md");
  if(existsSync(file))return file;
  if(existsSync(join(directory,".git")))return undefined;
  const parent=dirname(directory);
  if(parent===directory)return undefined;
  directory=parent;
 }
}
export function resolveSkills(profile:string,defaults:readonly string[],requested:unknown=[],context:SkillResolutionContext={}):string[]{
 if(!Array.isArray(requested)||!requested.every(name=>typeof name==="string"))throw new Error("Skills must be a list of names");
 return [...new Set([...defaults,...requested])].map(name=>{
  if(!/^[a-z][a-z0-9_-]*$/.test(name))throw new Error(`Invalid skill ${name}`);
  const project=context.projectTrusted&&context.cwd?projectSkill(name,context.cwd):undefined;
  const file=project??join(profile,"skills",name,"SKILL.md");
  if(!existsSync(file))throw new Error(`Unknown skill ${name}`);
  return file;
 });
}

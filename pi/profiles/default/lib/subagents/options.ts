import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { resolvePreferredModel } from "../model-selection.ts";
export const EFFORTS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type AgentEffort = typeof EFFORTS[number];
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

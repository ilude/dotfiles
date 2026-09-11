import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveCliModel, type ModelRegistry } from "@earendil-works/pi-coding-agent";
export const EFFORTS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type AgentEffort = typeof EFFORTS[number];
export function resolveModel(model: string | undefined, fallback: string | undefined, registry?: ModelRegistry): { provider: string; id: string } {
 const value=model??fallback;
 if(!value||value!==value.trim())throw new Error(`Explicit provider/model required, received ${value??"none"}`);
 if(!value.includes("/")){
  if(!registry)throw new Error(`Explicit provider/model required, received ${value}`);
  // Extension contexts expose the native registry facade rather than ModelRuntime.
  // Adapt only its model catalogue/auth methods so Pi owns all matching semantics.
  const resolved=resolveCliModel({cliModel:value,modelRuntime:{
   getModels:()=>registry.getAll(),
   hasConfiguredAuth:(provider:string)=>{const candidate=registry.getAll().find(model=>model.provider===provider);return candidate?registry.hasConfiguredAuth(candidate):false},
  } as unknown as Parameters<typeof resolveCliModel>[0]["modelRuntime"]});
  if(resolved.error||!resolved.model)throw new Error(resolved.error??`Model not found: ${value}`);
  return{provider:resolved.model.provider,id:resolved.model.id};
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
export function resolveSkills(profile:string,defaults:readonly string[],requested:unknown=[]):string[]{
 if(!Array.isArray(requested)||!requested.every(name=>typeof name==="string"))throw new Error("Skills must be a list of names");
 return [...new Set([...defaults,...requested])].map(name=>{
  if(!/^[a-z][a-z0-9_-]*$/.test(name))throw new Error(`Invalid skill ${name}`);
  const file=join(profile,"skills",name,"SKILL.md");
  if(!existsSync(file))throw new Error(`Unknown skill ${name}`);
  return file;
 });
}

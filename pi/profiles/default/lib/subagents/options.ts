import { existsSync } from "node:fs";
import { join } from "node:path";
export const EFFORTS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type AgentEffort = typeof EFFORTS[number];
export function resolveModel(model: string | undefined, fallback: string | undefined): { provider: string; id: string } {
 const value=model??fallback;
 if(!value||!value.includes("/")||value!==value.trim())throw new Error(`Explicit provider/model required, received ${value??"none"}`);
 const [provider,...rest]=value.split("/"),id=rest.join("/");
 if(!provider.trim()||!id.trim())throw new Error(`Explicit provider/model required, received ${value}`);
 return{provider,id};
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

import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDefinitions } from "../lib/subagents/definitions.ts";
import { SubagentRuntime } from "../lib/subagents/runtime.ts";
const profile=resolve(dirname(fileURLToPath(import.meta.url)),"..");
describe.skipIf(process.env.PI_SUBAGENT_LIVE!=="1")("bounded real-model subagent acceptance",()=>{
 it("a Team Lead commissions two leaves including a disposable edit",async()=>{
  const cwd=mkdtempSync(join(tmpdir(),"subagent-team-live-"));
  const runtime=new SubagentRuntime();
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const catalog=loadDefinitions(cwd,false,profile);
   expect(catalog.errors).toEqual([]);
   const definition=catalog.agents.get("teamlead")!;
   const run=runtime.launch({definition,instructions:'Use subagent to commission developer to create proof.txt containing exactly "leaf write ok" in your assigned cwd, with no shell commands. Wait for that result. Then commission explorer to read proof.txt and report its contents. Integrate both results briefly. Do not retain either leaf after its assignment. This is a bounded delegation acceptance test.',cwd,model:definition.model!,effort:definition.effort!,skills:[],origin:"live-team",retained:false,surface:"headless",catalog:catalog.agents},profile,join(profile,"extensions/subagent-child.ts"),false);
   const result=await Promise.race([run,new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error("Team Lead acceptance timed out")),100_000)})]);
   expect(result.outcome,result.error??result.result).toBe("complete");
   expect(readFileSync(join(cwd,"proof.txt"),"utf8")).toContain("leaf write ok");
   const children=runtime.list().filter(child=>child.parentId===result.id);
   expect(children.map(child=>child.agent).sort()).toEqual(["developer","explorer"]);
   expect(children.every(child=>child.outcome==="complete"),JSON.stringify({result,children},null,2)).toBe(true);
  }finally{if(timer)clearTimeout(timer);await runtime.shutdown("quit");rmSync(cwd,{recursive:true,force:true});}
 },115_000);
 it("a requested council retains three member contexts through rebuttal",async()=>{
  const cwd=mkdtempSync(join(tmpdir(),"subagent-council-live-")),runtime=new SubagentRuntime();
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const catalog=loadDefinitions(cwd,false,profile),definition=catalog.agents.get("council")!;
   expect(catalog.errors).toEqual([]);
   const run=runtime.launch({definition,instructions:'The user explicitly requests this small council. Discuss JSON versus YAML for a tiny local CLI configuration. This is hypothetical: do not browse, read files, or claim external evidence. Commission exactly three members using subagent: advisor, reviewer, researcher. Set retain=true for each. Give each a distinct perspective and ask for a one-sentence independent opening. Then use subagent_control message to give EACH SAME member one focused rebuttal question based on another opening, asking it to recall its own earlier position. Wait for each reply. Synthesize the strongest arguments, any changed positions, disagreements, and evidence gaps briefly. Do not implement anything. Leave members retained for acceptance inspection.',cwd,model:definition.model!,effort:definition.effort!,skills:[],origin:"live-council",retained:false,surface:"headless",catalog:catalog.agents},profile,join(profile,"extensions/subagent-child.ts"),false);
   const result=await Promise.race([run,new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error("Council acceptance timed out")),140_000)})]);
   expect(result.outcome,result.error??result.result).toBe("complete");
   const members=runtime.list().filter(child=>child.parentId===result.id);
   expect(members.map(child=>child.agent).sort()).toEqual(["advisor","researcher","reviewer"]);
   expect(members.every(child=>child.retained&&child.turns>=2&&child.outcome==="complete"),JSON.stringify({result,members},null,2)).toBe(true);
  }finally{if(timer)clearTimeout(timer);await runtime.shutdown("quit");rmSync(cwd,{recursive:true,force:true});}
 },160_000);
});

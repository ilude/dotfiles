import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { loadDefinitions, resolveAgentEffort, resolveModel } from "../lib/subagents/definitions.ts";
const roots:string[]=[];const old=process.env.PI_CODING_AGENT_DIR;
afterEach(()=>{process.env.PI_CODING_AGENT_DIR=old;for(const r of roots.splice(0))rmSync(r,{recursive:true,force:true})});
function root(){const r=mkdtempSync(join(tmpdir(),"subagent-defs-"));roots.push(r);mkdirSync(join(r,"agents"),{recursive:true});process.env.PI_CODING_AGENT_DIR=r;return r}
function agent(dir:string,name:string,extra=""){writeFileSync(join(dir,`${name}.md`),`---\nname: ${name}\ndescription: test ${name}\ntools: []\nskills: []\ndelegates: []\n${extra}---\nprompt\n`)}
describe("subagent definitions",()=>{
 it("preserves an explicit empty tool ceiling",()=>{const r=root();agent(join(r,"agents"),"empty");const got=loadDefinitions(r,false,r); expect(got.errors).toEqual([]); expect(got.agents.get("empty")?.tools).toEqual([])});
 it("lets a trusted valid project definition override profile",()=>{const r=root();agent(join(r,"agents"),"worker");const p=join(r,"repo",".pi","agents");mkdirSync(p,{recursive:true});agent(p,"worker","model: openai-codex/project\n");const got=loadDefinitions(join(r,"repo"),true,r).agents.get("worker");expect(got?.source).toBe("project");expect(got?.model).toBe("openai-codex/project")});
 it("fails a malformed trusted override closed instead of falling back",()=>{const r=root();agent(join(r,"agents"),"worker");const p=join(r,"repo",".pi","agents");mkdirSync(p,{recursive:true});writeFileSync(join(p,"worker.md"),"---\nname: worker\ndescription: broken\n---\nno tools");const got=loadDefinitions(join(r,"repo"),true,r);expect(got.agents.has("worker")).toBe(false);expect(got.errors).toHaveLength(1)});
 it("does not restore a declared override name after an invalid alias",()=>{const r=root();agent(join(r,"agents"),"worker");const p=join(r,"repo",".pi","agents");mkdirSync(p,{recursive:true});writeFileSync(join(p,"alias.md"),"---\nname: worker\ndescription: broken\ntools: false\n---\nprompt");agent(p,"worker");const catalog=loadDefinitions(join(r,"repo"),true,r);expect(catalog.agents.has("worker")).toBe(false)});
 it.each(["delegates: true", "skills: 4", "model: false", "effort: []"])("rejects malformed optional authority: %s",(field)=>{const r=root();writeFileSync(join(r,"agents","worker.md"),`---\nname: worker\ndescription: worker\ntools: []\n${field}\n---\nprompt`);const got=loadDefinitions(r,false,r);expect(got.agents.has("worker")).toBe(false);expect(got.errors).toHaveLength(1)});
 it.each(["/model", "provider/", " provider/model"])("rejects incomplete model %s",(model)=>{expect(()=>resolveModel(model,undefined)).toThrow(/Explicit/)});
 it("requires explicit provider/model",()=>{expect(()=>resolveModel(undefined,undefined)).toThrow(/Explicit/);expect(resolveModel("openai-codex/model",undefined)).toEqual({provider:"openai-codex",id:"model"})});
 it("rejects Luna Strategist effort below high without restricting stronger models",()=>{
  expect(()=>resolveAgentEffort("strategist","openai-codex/gpt-5.6-luna","low","high")).toThrow(/below high/);
  expect(resolveAgentEffort("strategist","openai-codex/gpt-5.6-luna","high","low")).toBe("high");
  expect(resolveAgentEffort("strategist","openai-codex/gpt-5.6-sol","low","high")).toBe("low");
 });
 it("restricts Luna Steward effort while preserving Strategist and stronger models",()=>{
  for(const effort of ["off","minimal","low","medium","max"] as const)expect(()=>resolveAgentEffort("steward","openai-codex/gpt-5.6-luna",effort,"high")).toThrow(/high or xhigh/);
  expect(resolveAgentEffort("steward","openai-codex/gpt-5.6-luna","high","low")).toBe("high");
  expect(resolveAgentEffort("steward","openai-codex/gpt-5.6-luna","xhigh","low")).toBe("xhigh");
  expect(resolveAgentEffort("steward","openai-codex/gpt-5.6-sol","low","high")).toBe("low");
  expect(resolveAgentEffort("reviewer","openai-codex/gpt-5.6-luna","low","high")).toBe("low");
 });
 it("loads the bundled read-only Strategist and Steward and grants Team Lead access without changing other defaults",()=>{
  const profile=join(dirname(fileURLToPath(import.meta.url)),"..");
  const catalog=loadDefinitions(profile,false,profile);
  expect(catalog.errors).toEqual([]);
  expect(catalog.agents.get("strategist")).toMatchObject({model:"openai-codex/gpt-5.6-sol",effort:"low",tools:["read","grep","find","ls","subagent_parent"],delegates:[],skills:[]});
  expect(catalog.agents.get("steward")).toMatchObject({model:"openai-codex/gpt-5.6-luna",effort:"high",tools:["read","grep","find","ls","subagent_parent"],delegates:[],skills:[]});
  expect(catalog.agents.get("teamlead")?.delegates).toEqual(expect.arrayContaining(["strategist","steward"]));
  expect(catalog.agents.get("reviewer")).toMatchObject({model:"openai-codex/gpt-5.6-sol",tools:expect.arrayContaining(["read","bash"]),delegates:[],skills:[]});
 });
});

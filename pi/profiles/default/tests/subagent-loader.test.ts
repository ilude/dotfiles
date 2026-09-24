import { afterEach, describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { JsonLines } from "../lib/subagents/framing.ts";
import { childLaunch } from "../lib/subagents/launch.ts";
import type { AgentDefinition } from "../lib/subagents/definitions.ts";
import { childSystemPrompt, default as childAuthority } from "../extensions/subagent-child.ts";
import registerToolVisibility from "../extensions/tool-visibility.ts";
import { createMockPi } from "./helpers/mock-pi.ts";
afterEach(() => vi.unstubAllEnvs());
const profile=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const manifestPath=join(profile,"node_modules/@earendil-works/pi-coding-agent/package.json");
const cli=resolve(dirname(manifestPath),JSON.parse(readFileSync(manifestPath,"utf8")).bin.pi);

describe("bundled CLI child authority",()=>{
 it("builds byte-stable model-visible authority without runtime launch values",()=>{
  const rolePrompt="stable role prompt";
  const first=childSystemPrompt("base","reviewer",["web_fetch","read","read"],rolePrompt);
  const reordered=childSystemPrompt("base","reviewer",["read","web_fetch"],rolePrompt);
  expect(reordered).toBe(first);
  expect(first).toContain("tools [read, web_fetch]");
  expect(first).toContain(rolePrompt);
  for(const runtimeValue of ["child-id-42","parent-id-9","C:/task/worktree","http://127.0.0.1:7777","visible","display-name","assignment text"]){
   expect(first).not.toContain(runtimeValue);
  }
 });

 it("clarifies Team Lead discovery and delegate authority without changing other roles",()=>{
  const tools=["read","subagent","subagent_control","tool_search"];
  const prompt=childSystemPrompt("base","teamlead",tools,"role prompt");
  const clarification=" Your tool discovery lists only your own tools. Your subagents do not inherit your tool restrictions; they receive the tools defined for their roles.";
  expect(prompt).toContain(clarification);
  expect(prompt).toContain("Your authority is frozen to tools [read, subagent, subagent_control, tool_search]. You may not activate or request other tools.");
  expect(childSystemPrompt("base","teamlead",[...tools].reverse(),"role prompt")).toBe(prompt);
  expect(childSystemPrompt("base","developer",["bash","edit","write"],"role prompt")).not.toContain(clarification);
  // This clarification adds only its fixed text to the existing authority handoff.
  const peer=childSystemPrompt("base","reviewer",tools,"role prompt");
  expect(Buffer.byteLength(prompt)-Buffer.byteLength(peer)).toBe(Buffer.byteLength(clarification));
 });

 it.each([{tools:[] as string[],childMode:true},{tools:["read"],childMode:true},{tools:[] as string[],childMode:false}])("loads with child=$childMode and explicit ceiling $tools",async ({tools,childMode})=>{
  const scratch=mkdtempSync(join(tmpdir(),"subagent-loader-"));
  const fixture=join(scratch,"probe.mjs");
  writeFileSync(fixture,`export default function(pi) { pi.on('session_start', () => { process.stdout.write(JSON.stringify({type:'authority_probe',tools:pi.getActiveTools()})+'\\n'); }); }`);
  const child=spawn(process.execPath,[cli,"--mode","rpc","--offline","--no-session","--no-extensions","--no-skills","--no-context-files",...(tools.length?["--tools",tools.join(",")]:["--no-tools"]),"-e",join(profile,"extensions/subagent-child.ts"),"-e",fixture],{
   cwd:scratch,env:{...process.env,PI_CODING_AGENT_DIR:join(scratch,"profile"),PI_SUBAGENT_AUTHORITY:childMode?JSON.stringify({id:"probe",agent:"probe",tools,delegates:[],cwd:scratch,skills:[]}):"",PI_SUBAGENT_ENDPOINT:"",PI_SUBAGENT_PROMPT:""},stdio:["pipe","pipe","pipe"],windowsHide:true,
  });
  let stderr=""; child.stderr.on("data",chunk=>{stderr=(stderr+chunk).slice(-4000)});
  const exited=new Promise<void>(done=>child.once("close",()=>done()));
  try {
   const actual=await new Promise<unknown>((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error(`Authority probe timed out: ${stderr}`)),15_000);
    const finish=(error?:Error,value?:unknown)=>{clearTimeout(timeout);error?reject(error):resolve(value)};
    const parser=new JsonLines(value=>{const event=value as {type?:string;tools?:unknown};if(event.type==="authority_probe")finish(undefined,event.tools)});
    child.stdout.on("data",chunk=>{try{parser.push(chunk)}catch(error){finish(error as Error)}});
    let diagnostics="";
    child.stderr.on("data",chunk=>{diagnostics+=String(chunk);for(;;){const end=diagnostics.indexOf("\n");if(end<0)break;const line=diagnostics.slice(0,end);diagnostics=diagnostics.slice(end+1);try{const value=JSON.parse(line);if(value.type==="authority_probe")finish(undefined,value.tools)}catch{}}});
    child.once("error",error=>finish(error));
    child.once("exit",()=>finish(new Error(`CLI exited before probe: ${stderr}`)));
   });
   expect(actual).toEqual(tools);
   if(childMode){
    const response=await new Promise<any>((resolve,reject)=>{
     const timeout=setTimeout(()=>reject(new Error("Native shell probe timed out")),5000);let output="";
     const frames=new JsonLines(value=>{const event=value as any;if(event.type==="bash_execution_update"&&event.id==="shell-probe")output+=event.delta??"";if(event.type==="response"&&event.id==="shell-probe"){clearTimeout(timeout);resolve({...event,output})}});
     child.stdout.on("data",chunk=>{try{frames.push(chunk)}catch(error){clearTimeout(timeout);reject(error)}});
     child.stdin.write(JSON.stringify({type:"bash",id:"shell-probe",command:"echo shell-probe"})+"\n");
    });
    expect(response).toMatchObject({success:true});
    expect(response.data?.output??response.output).toContain("shell-probe");
   }
  } finally { child.kill(); await exited; rmSync(scratch,{recursive:true,force:true}); }
 },20_000);

 it("lets a Team Lead discover and activate only permitted deferred Herdr tools",async()=>{
  const pi=createMockPi();
  for(const [name,description] of [["read","Read files"],["herdr_agent","Inspect and prompt live Herdr agents"],["herdr_layout","Inspect Herdr panes and workspaces"],["herdr_pane","Read or recover a Herdr pane"],["image_transform","Transform images"]])pi.registerTool({name,description,parameters:{},execute:async()=>({content:[]})});
  vi.stubEnv("PI_SUBAGENT_AUTHORITY",JSON.stringify({id:"lead",agent:"teamlead",tools:["read","tool_search","herdr_agent","herdr_layout","herdr_pane"],delegates:[],cwd:process.cwd(),skills:[]}));
  vi.stubEnv("PI_SUBAGENT_ENDPOINT","");
  childAuthority(pi as never);
  registerToolVisibility(pi as never);
  for(const hook of pi._getHook("session_start"))await hook.handler({},{});
  expect(pi.getActiveTools()).toEqual(["read","tool_search"]);
  const result=await pi._getTool("tool_search")!.execute("id",{query:"Herdr agent control"},undefined,undefined,{});
  expect(result.details.tools.map((tool:{name:string})=>tool.name)).toEqual(["herdr_agent","herdr_layout","herdr_pane"]);
  expect(pi.getActiveTools()).toEqual(["read","tool_search","herdr_agent","herdr_layout","herdr_pane"]);
  const broadened=await pi._getTool("tool_search")!.execute("id",{query:"image transform"},undefined,undefined,{});
  expect(broadened.details.tools).toEqual([]);
  expect(pi.getActiveTools()).not.toContain("image_transform");
 });

 it("loads registered Herdr tools into a real Team Lead child while keeping them inactive",async()=>{
  const scratch=mkdtempSync(join(tmpdir(),"subagent-herdr-loader-"));
  const authority=["read","tool_search","herdr_agent","herdr_layout","herdr_pane"];
  const definition:AgentDefinition={name:"teamlead",description:"Coordinate",tools:authority,delegates:[],prompt:"Coordinate",model:"provider/model",effort:"low",skills:[],source:"profile",filePath:"teamlead.md"};
  const launch=childLaunch({definition,prompt:"probe",instructions:"probe",cwd:scratch,model:"provider/model",effort:"low",skills:[],origin:"probe",retained:false,surface:"headless"},"lead",profile);
  const fixture=join(scratch,"probe.mjs");
  writeFileSync(fixture,`export default function(pi) { pi.on('session_start', () => { process.stdout.write(JSON.stringify({type:'herdr_probe',active:pi.getActiveTools(),registered:pi.getAllTools().map(tool=>tool.name)})+'\\n'); }); }`);
  const args=[...launch.args];
  for(let index=args.length-1;index>=0;index--)if(args[index]==="--model"||args[index]==="--thinking")args.splice(index,2);
  const child=spawn(process.execPath,[cli,"--mode","rpc","--offline","--no-session","--no-context-files",...args,"-e",fixture],{cwd:scratch,env:{...process.env,...launch.env,PI_CODING_AGENT_DIR:join(scratch,"profile"),PI_SUBAGENT_ENDPOINT:""},stdio:["pipe","pipe","pipe"],windowsHide:true});
  let stderr="";
  child.stderr.on("data",chunk=>{stderr=(stderr+chunk).slice(-4000)});
  const exited=new Promise<void>(done=>child.once("close",()=>done()));
  try{
   const probe=await new Promise<{active:string[];registered:string[]}>((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error(`Herdr child probe timed out: ${stderr}`)),15_000);
    const finish=(error?:Error,value?:{active:string[];registered:string[]})=>{clearTimeout(timeout);error?reject(error):resolve(value!)};
    const parser=new JsonLines(value=>{const event=value as {type?:string;active?:string[];registered?:string[]};if(event.type==="herdr_probe")finish(undefined,{active:event.active??[],registered:event.registered??[]})});
    for(const stream of [child.stdout,child.stderr])stream.on("data",chunk=>{try{parser.push(chunk)}catch(error){finish(error as Error)}});
    child.once("error",error=>finish(error));child.once("exit",()=>finish(new Error(`CLI exited before Herdr probe: ${stderr}`)));
   });
   expect(probe.registered).toEqual(expect.arrayContaining(authority.filter(name=>name.startsWith("herdr_"))));
   expect(probe.active).toEqual(["read","tool_search"]);
  }finally{child.kill();await exited;rmSync(scratch,{recursive:true,force:true})}
 },20_000);

 it("does not discover or activate Herdr tools for an ordinary leaf",async()=>{
  const pi=createMockPi();
  for(const [name,description] of [["read","Read local files"],["herdr_agent","Herdr agent"],["herdr_layout","Herdr layout"],["herdr_pane","Herdr pane"]])pi.registerTool({name,description,parameters:{},execute:async()=>({content:[]})});
  vi.stubEnv("PI_SUBAGENT_AUTHORITY",JSON.stringify({id:"leaf",agent:"developer",tools:["read","tool_search"],delegates:[],cwd:process.cwd(),skills:[]}));
  vi.stubEnv("PI_SUBAGENT_ENDPOINT","");
  childAuthority(pi as never);
  for(const hook of pi._getHook("session_start"))await hook.handler({},{});
  const result=await pi._getTool("tool_search")!.execute("id",{query:"Herdr"},undefined,undefined,{});
  expect(result.details.tools).toEqual([]);
  expect(pi.getActiveTools()).toEqual(["read","tool_search"]);
 });
});

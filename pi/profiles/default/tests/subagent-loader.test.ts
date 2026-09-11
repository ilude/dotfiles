import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { JsonLines } from "../lib/subagents/framing.ts";
const profile=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const manifestPath=join(profile,"node_modules/@earendil-works/pi-coding-agent/package.json");
const cli=resolve(dirname(manifestPath),JSON.parse(readFileSync(manifestPath,"utf8")).bin.pi);

describe("bundled CLI child authority",()=>{
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
});

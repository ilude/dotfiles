import { spawn, execFile, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createRequire } from "node:module";

const DIAGNOSTIC_CAPTURE_BYTES=8192;
const DIAGNOSTIC_PUBLISH_BYTES=4096;
const decoder=new TextDecoder("utf-8");
export function sanitizeHostDiagnostic(chunks,truncated=false) {
 const text=decoder.decode(Buffer.concat(chunks))
  .replace(/(?:\x1B\[[0-?]*[ -/]*[@-~]|\x1B\][^\x07]*(?:\x07|\x1B\\))/g,"")
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g,"")
  .replace(/(authorization\s*[:=]\s*bearer\s+|(?:access[_-]?key|secret|token|password|credential)\s*[:=]\s*)[^\s,;]*/gi,"$1[redacted]")
  .replace(/\bAKIA[0-9A-Z]{16}\b/g,"[redacted]");
 // Captured and published byte boundaries may bisect an unknown field. Drop the
 // final field rather than risk returning a secret fragment.
 const bounded=(value,limit,wasCut)=>{
  const bytes=Buffer.from(value.trim());
  if(!wasCut&&bytes.length<=limit)return value.trim();
  const marker=" [truncated]";
  const prefix=decoder.decode(bytes.subarray(0,Math.min(limit-Buffer.byteLength(marker),bytes.length)));
  return prefix.replace(/\S*$/,"").trimEnd()+marker;
 };
 return bounded(text,DIAGNOSTIC_PUBLISH_BYTES,truncated||Buffer.byteLength(text.trim())>DIAGNOSTIC_PUBLISH_BYTES);
}

export function createHostDiagnosticCapture(write=chunk=>process.stderr.write(chunk),limit=DIAGNOSTIC_CAPTURE_BYTES) {
 const chunks=[];let bytes=0,truncated=false,closed=false;
 return {
  append(chunk){if(closed)return;write(chunk);const input=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);const remaining=limit-bytes;if(remaining<=0){truncated=true;return}const clipped=input.subarray(0,remaining);chunks.push(clipped);bytes+=clipped.length;if(clipped.length<input.length)truncated=true},
  close(){closed=true;return sanitizeHostDiagnostic(chunks,truncated)},
 };
}

export function hostStartupDiagnostic(stage,error) {
 const detail=error instanceof Error?error.message:String(error);
 return sanitizeHostDiagnostic([Buffer.from(`Visible host startup failed during ${stage}: ${detail}`)]);
}

// Called only by the existing setup-owned Herdr bootstrap. This per-launch host
// retains the actual ChildProcess handle; it is not a worker service or registry.
export async function hostSubagent(entry, profile, rawEndpoint) {
 let requestParent,endpoint,stage="loading jiti";
 try {
  const { createJiti }=createRequire(join(profile,"package.json"))("jiti");
  const jiti=createJiti(import.meta.url);
  stage="loading host modules";
  ({ requestParent }=await jiti.import("../pi/profiles/default/lib/subagents/transport.ts"));
  const { childLaunch }=await jiti.import("../pi/profiles/default/lib/subagents/launch.ts");
  stage="parsing endpoint";
  endpoint=JSON.parse(rawEndpoint);
  if(!endpoint||!Number.isInteger(endpoint.port)||endpoint.port<1||endpoint.port>65535||typeof endpoint.token!=="string"||!/^[a-f0-9]{64}$/.test(endpoint.token))throw new Error("Invalid subagent endpoint");
  stage="requesting bootstrap";
  const bootstrap=await requestParent(endpoint,{type:"bootstrap"});
  if(!bootstrap||resolve(bootstrap.profile)!==resolve(profile)||bootstrap.spec?.surface!=="visible"||typeof bootstrap.spec.instructions!=="string")throw new Error("Invalid authenticated bootstrap");
  stage="building child launch";
  const config=childLaunch(bootstrap.spec,endpoint.child,profile,endpoint);
  const scratch=mkdtempSync(join(tmpdir(),"pi-visible-child-"));
  const intervention=join(scratch,"intervention.json");
  let child,parentGone=false,exited=false,stopPromise;
 const userOwned=()=>{try{const state=JSON.parse(readFileSync(intervention,"utf8"));return state.token===endpoint.token&&state.userOwned===true}catch{return false}};
 const stop=()=>stopPromise??=(async()=>{
  if(!child?.pid||child.exitCode!==null||child.signalCode!==null)return;
  if(process.platform==="win32")await new Promise((resolve,reject)=>execFile("taskkill",["/pid",String(child.pid),"/t","/f"],{windowsHide:true,timeout:5000},error=>error&&child.exitCode===null&&child.signalCode===null?reject(error):resolve()));
  else {try{process.kill(-child.pid,"SIGTERM")}catch(error){if(error.code!=="ESRCH")throw error}}
 })();
 try{
  stage="registering host";
  await requestParent(endpoint,{type:"host-started",payload:{pid:process.pid}});
  // Keep stdin/stdout attached to the pane, but retain a bounded stderr
  // diagnostic so the parent can distinguish startup failure from a clean exit.
  const stderrCapture=createHostDiagnosticCapture();
  stage="spawning child";
  child=spawn(process.execPath,[entry,...config.args],{cwd:bootstrap.spec.cwd,env:{...process.env,...config.env,PI_SUBAGENT_INTERVENTION_FILE:intervention,PI_HERDR_SUBAGENT:""},stdio:["inherit","inherit","pipe"],shell:false,detached:process.platform!=="win32"});
  child.stderr?.on("data",chunk=>stderrCapture.append(chunk));
  const closed=new Promise((resolve,reject)=>{child.once("error",error=>{exited=true;reject(error)});child.once("close",(code,signal)=>{exited=true;resolve({code,signal})})});
  const watch=(async()=>{
   while(!exited){
    try{const state=await requestParent(endpoint,{type:"host-poll"});if(state.stop&&(state.force||!userOwned()))await stop()}
    catch{parentGone=true;if(!userOwned())await stop()}
    if(!exited)await delay(100);
   }
  })();
  let outcome;
  try{outcome=await closed}catch(error){outcome={code:null,signal:null,error:String(error?.message||"child process could not start")}}
  await watch;
  try{
   const diagnostic=stderrCapture.close();
   await requestParent(endpoint,{type:"host-exit",payload:{code:outcome.code,signal:outcome.signal,stderr:diagnostic||outcome.error}});
   // Keep the wrapper PTY alive until the parent closes its owned pane. This
   // avoids Herdr focusing that workspace when a non-focused plugin PTY exits.
   await delay(5_000);
  }catch{parentGone=true}
 }finally{
  if(child&&!exited){await stop();await new Promise(resolve=>child.once("close",resolve))}
  rmSync(scratch,{recursive:true,force:true});
  if(parentGone&&process.env.HERDR_PLUGIN_ID==="local.pi"&&process.env.HERDR_PANE_ID){
   const env={...process.env},pane=env.HERDR_PANE_ID;
   process.once("exit",()=>spawnSync(env.HERDR_BIN_PATH||"herdr",["plugin","pane","close",pane],{env,stdio:"ignore",windowsHide:true,timeout:2000}));
  }
  }
 } catch(error) {
  const diagnostic=hostStartupDiagnostic(stage,error);
  process.stderr.write(`${diagnostic}\n`);
  if(requestParent&&endpoint){
   try {
    await requestParent(endpoint,{type:"host-exit",payload:{code:1,signal:null,stderr:diagnostic}});
    // Keep the pane present long enough for placement to finish and the parent
    // to report the startup exception instead of a secondary pane_not_found.
    await delay(5_000);
    return;
   } catch { /* The outer launcher will preserve the diagnostic on stderr. */ }
  }
  throw error;
 }
}

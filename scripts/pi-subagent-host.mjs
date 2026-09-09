import { spawn, execFile, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createRequire } from "node:module";

// Called only by the existing setup-owned Herdr bootstrap. This per-launch host
// retains the actual ChildProcess handle; it is not a worker service or registry.
export async function hostSubagent(entry, profile, rawEndpoint) {
 const { createJiti }=createRequire(join(profile,"package.json"))("jiti");
 const jiti=createJiti(import.meta.url);
 const { requestParent }=await jiti.import("../pi/profiles/default/lib/subagents/transport.ts");
 const { childLaunch }=await jiti.import("../pi/profiles/default/lib/subagents/launch.ts");
 const endpoint=JSON.parse(rawEndpoint);
 if(!endpoint||!Number.isInteger(endpoint.port)||endpoint.port<1||endpoint.port>65535||typeof endpoint.token!=="string"||!/^[a-f0-9]{64}$/.test(endpoint.token))throw new Error("Invalid subagent endpoint");
 const bootstrap=await requestParent(endpoint,{type:"bootstrap"});
 if(!bootstrap||resolve(bootstrap.profile)!==resolve(profile)||bootstrap.spec?.surface!=="visible"||typeof bootstrap.spec.instructions!=="string")throw new Error("Invalid authenticated bootstrap");
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
  await requestParent(endpoint,{type:"host-started",payload:{pid:process.pid}});
  child=spawn(process.execPath,[entry,...config.args],{cwd:bootstrap.spec.cwd,env:{...process.env,...config.env,PI_SUBAGENT_INTERVENTION_FILE:intervention,PI_HERDR_SUBAGENT:""},stdio:"inherit",shell:false,detached:process.platform!=="win32"});
  const closed=new Promise((resolve,reject)=>{child.once("error",reject);child.once("close",code=>{exited=true;resolve(code)})});
  const watch=(async()=>{
   while(!exited){
    try{const state=await requestParent(endpoint,{type:"host-poll"});if(state.stop&&(state.force||!userOwned()))await stop()}
    catch{parentGone=true;if(!userOwned())await stop()}
    if(!exited)await delay(100);
   }
  })();
  const code=await closed;
  await watch;
  try{
   await requestParent(endpoint,{type:"host-exit",payload:{code}});
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
}

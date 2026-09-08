import { expect, it, vi } from "vitest";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const exec=promisify(execFile), root=resolve(dirname(fileURLToPath(import.meta.url)),"../../../..");
it.skipIf(process.env.PI_HERDR_FOCUS_LIVE!=="1")("background plugin splits preserve the focused pane across other tabs and workspaces",async()=>{
 const scratch=mkdtempSync(join(tmpdir(),"herdr-focus-")),name=`focus-${process.pid}`;
 const env:NodeJS.ProcessEnv={...process.env,APPDATA:join(scratch,"roaming"),LOCALAPPDATA:join(scratch,"local"),HERDR_CONFIG_PATH:join(scratch,"config.toml")};
 for(const key of Object.keys(env))if(key.startsWith("HERDR_")&&key!=="HERDR_CONFIG_PATH")delete env[key];
 mkdirSync(env.APPDATA!,{recursive:true});mkdirSync(env.LOCALAPPDATA!,{recursive:true});
 writeFileSync(env.HERDR_CONFIG_PATH!,'[ui.sound]\nenabled = false\n[ui.toast]\ndelivery = "off"\n');
 const executable=process.env.HERDR_BIN_PATH||"herdr";
 const server=spawn(executable,["--session",name,"server"],{env,stdio:["ignore","ignore","pipe"],windowsHide:true});
 const closed=new Promise<void>(r=>server.once("close",()=>r()));let errors="";server.stderr.on("data",c=>errors=(errors+c).slice(-4000));
 const cli=async(args:string[])=>{const callEnv={...env};if(args[0]==="pane"&&args[1]==="current")for(const key of ["HERDR_PANE_ID","HERDR_TAB_ID","HERDR_WORKSPACE_ID"])delete callEnv[key];const {stdout}=await exec(executable,["--session",name,...args],{env:callEnv,windowsHide:true,timeout:15000,maxBuffer:256*1024});return stdout.trim().startsWith("{")?JSON.parse(stdout):stdout};
 try{
  await vi.waitFor(async()=>expect((await cli(["session","list","--json"])).sessions.some((s:any)=>s.name===name&&s.running),errors).toBe(true),{timeout:15000,interval:250});
  const plugin=join(scratch,"plugin");mkdirSync(plugin);
  writeFileSync(join(plugin,"herdr-plugin.toml"),readFileSync(join(root,"pi/herdr/herdr-plugin.toml.in"),"utf8").replace("@COMMAND@",JSON.stringify([process.execPath,"-e","setInterval(()=>{},1000)"])));
  await cli(["plugin","link",plugin]);
  const source=(await cli(["workspace","create","--cwd",scratch,"--focus"])).result;
  const other=(await cli(["workspace","create","--cwd",scratch,"--focus"])).result;
  // Match the real calling process environment while the human views another place.
  Object.assign(env,{HERDR_ENV:"1",HERDR_WORKSPACE_ID:source.workspace.workspace_id,HERDR_TAB_ID:source.tab.tab_id,HERDR_PANE_ID:source.root_pane.pane_id});
  for(const context of ["other-workspace","other-tab"]){
   if(context==="other-tab")await cli(["tab","create","--workspace",source.workspace.workspace_id,"--cwd",scratch,"--focus"]);
   const before=(await cli(["pane","current"])).result.pane;
   if(context==="other-workspace")expect(before.pane_id).toBe(other.root_pane.pane_id);
   else expect(before.tab_id).not.toBe(source.tab.tab_id);
   await cli(["pane","get",source.root_pane.pane_id]);
   await cli(["pane","layout","--pane",source.root_pane.pane_id]);
   expect((await cli(["pane","current"])).result.pane.pane_id,`${context} launch preflight`).toBe(before.pane_id);
   const opened=(await cli(["plugin","pane","open","--plugin","local.pi","--entrypoint","pi","--placement","split","--direction","right","--target-pane",source.root_pane.pane_id,"--cwd",scratch,"--no-focus"])).result.plugin_pane.pane;
   try{
    expect((await cli(["pane","current"])).result.pane.pane_id,context).toBe(before.pane_id);
    expect((await cli(["workspace","list"])).result.workspaces.find((w:any)=>w.focused)?.workspace_id,context).toBe(before.workspace_id);
   }finally{await cli(["plugin","pane","close",opened.pane_id])}
   expect((await cli(["pane","current"])).result.pane.pane_id,`${context} cleanup`).toBe(before.pane_id);
  }
 }finally{
  try{await cli(["server","stop"])}finally{if(server.exitCode===null)server.kill();await closed;rmSync(scratch,{recursive:true,force:true})}
 }
},60000);

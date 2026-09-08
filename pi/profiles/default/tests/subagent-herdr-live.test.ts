import { describe, expect, it, vi } from "vitest";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SubagentRuntime } from "../lib/subagents/runtime.ts";
import { VisibleChild } from "../lib/subagents/visible.ts";
import { loadDefinitions } from "../lib/subagents/definitions.ts";
import type { AgentDefinition } from "../lib/subagents/definitions.ts";
const profile=resolve(dirname(fileURLToPath(import.meta.url)),".."),root=resolve(profile,"../../..");
const executable=process.env.HERDR_BIN_PATH||"herdr";
const exec=promisify(execFile);

describe.skipIf(process.env.PI_SUBAGENT_HERDR_LIVE!=="1")("isolated visible subagent acceptance",()=>{
 it("hosts a restricted TUI, retains context, hands back intervention, and cleans its exact pane",async()=>{
  const scratch=mkdtempSync(join(tmpdir(),"subagent-herdr-live-"));
  const name=`subagents-${process.pid}`;
  const env={...process.env,APPDATA:join(scratch,"roaming"),LOCALAPPDATA:join(scratch,"local"),HERDR_CONFIG_PATH:join(scratch,"config.toml")};
  for(const key of ["HERDR_ENV","HERDR_SOCKET_PATH","HERDR_WORKSPACE_ID","HERDR_TAB_ID","HERDR_PANE_ID","HERDR_PLUGIN_ID"])delete env[key as keyof typeof env];
  mkdirSync(env.APPDATA,{recursive:true});mkdirSync(env.LOCALAPPDATA,{recursive:true});
  writeFileSync(env.HERDR_CONFIG_PATH,'[ui.sound]\nenabled = false\n[ui.toast]\ndelivery = "off"\n[session]\nresume_agents_on_restore = false\n');
  const server=spawn(executable,["--session",name,"server"],{env,stdio:["ignore","pipe","pipe"],windowsHide:true});
  const serverClosed=new Promise<void>(resolve=>server.once("close",()=>resolve()));
  let logs="";server.stdout.on("data",chunk=>logs=(logs+chunk).slice(-8000));server.stderr.on("data",chunk=>logs=(logs+chunk).slice(-8000));
  const cli=async(args:string[])=>{const {stdout}=await exec(executable,["--session",name,...args],{env,windowsHide:true,timeout:15_000,maxBuffer:256*1024});return stdout.trim().startsWith("{")?JSON.parse(stdout):stdout};
  const previous={...process.env};
  const runtime=new SubagentRuntime();
  let linked=false;
  try{
   await exec("git",["init","--quiet",scratch],{windowsHide:true,timeout:10_000});
   let session:{socket_path:string}|undefined;
   await vi.waitFor(async()=>{const listed=await cli(["session","list","--json"]);session=listed.sessions.find((s:any)=>s.name===name&&s.running);expect(session,logs).toBeDefined()},{timeout:15_000,interval:250});
   const plugins=await cli(["plugin","list","--json"]);expect(plugins.result.plugins).toEqual([]);
   expect(session!.socket_path.toLowerCase()).toContain(scratch.toLowerCase());
   const plugin=join(scratch,"plugin");mkdirSync(plugin);
   const manifestPath=join(profile,"node_modules/@earendil-works/pi-coding-agent/package.json");
   const entry=resolve(dirname(manifestPath),JSON.parse(readFileSync(manifestPath,"utf8")).bin.pi);
   writeFileSync(join(plugin,"herdr-plugin.toml"),readFileSync(join(root,"pi/herdr/herdr-plugin.toml.in"),"utf8").replace("@COMMAND@",JSON.stringify([process.execPath,join(root,"scripts/pi-herdr-launch.mjs"),entry])));
   await cli(["plugin","link",plugin]);linked=true;
   const workspace=await cli(["workspace","create","--cwd",scratch,"--label","subagent acceptance","--no-focus"]);
   const pane=workspace.result.root_pane;
   Object.assign(process.env,env,{HERDR_ENV:"1",HERDR_SOCKET_PATH:session!.socket_path,HERDR_WORKSPACE_ID:workspace.result.workspace.workspace_id,HERDR_TAB_ID:workspace.result.tab.tab_id,HERDR_PANE_ID:pane.pane_id});
   const definition:AgentDefinition={name:"probe",description:"Restricted parity",tools:["read"],delegates:[],skills:[],prompt:"Follow instructions precisely. Do not use other tools.",source:"profile",filePath:"probe.md"};
   writeFileSync(join(scratch,"marker.txt"),"cedar-417");
   const input={definition,instructions:"Read marker.txt and reply only with its contents. Remember them for later.",cwd:scratch,model:"openai-codex/gpt-5.6-luna",effort:"low" as const,skills:[],origin:"visible-live",retained:true,surface:"visible" as const};
   const headless=await runtime.launch({...input,surface:"headless"},profile,join(profile,"extensions/subagent-child.ts"),false);
   expect(headless.outcome,headless.error).toBe("complete");expect(headless.result).toContain("cedar-417");await runtime.get(headless.id).finish();
   const beforeLayout=await cli(["pane","layout","--pane",pane.pane_id]);
   const started=await runtime.launch(input,profile,join(profile,"extensions/subagent-child.ts"),true);
   await vi.waitFor(()=>expect(runtime.get(started.id).snapshot().status,JSON.stringify(runtime.get(started.id).snapshot())).toBe("settled"),{timeout:50_000,interval:100});
   const afterLayout=await cli(["pane","layout","--pane",pane.pane_id]);
   expect(afterLayout.result.layout.focused_pane_id).toBe(beforeLayout.result.layout.focused_pane_id);
   const first=runtime.get(started.id).snapshot();
   expect(first.outcome,first.error).toBe("complete");expect(first.result).toContain("cedar-417");
   const child=runtime.get(first.id) as VisibleChild;
   await cli(["agent","prompt",first.paneId!,"/reload"]);
   await vi.waitFor(()=>expect(child.record.readyCount).toBe(2),{timeout:10_000});
   await vi.waitFor(async()=>expect(String(await cli(["agent","read",first.paneId!,"--source","recent-unwrapped","--lines","60"]))).toContain("Reloaded keybindings"),{timeout:10_000,interval:100});
   await cli(["agent","prompt",first.paneId!,"Reply only: user help active. Keep the earlier marker in context."]);
   await vi.waitFor(()=>{expect(child.record.userOwned).toBe(true);expect(child.record.turns).toBe(2)},{timeout:30_000}).catch(async error=>{throw new Error(`${String(error)}\n${JSON.stringify(child.snapshot())}\n${await cli(["agent","read",first.paneId!,"--source","recent-unwrapped","--lines","120"])}`)});
   await expect(child.message("competing parent steering")).rejects.toThrow(/intervention/);
   child.handback();await vi.waitFor(()=>expect(child.record.userOwned).toBe(false),{timeout:5000});
   await child.message("Recall the marker from the previous exchange without reading it again. Reply only with the marker.");
   await vi.waitFor(()=>expect(child.snapshot().turns).toBe(3),{timeout:40_000,interval:100});
   expect(child.snapshot().result).toContain("cedar-417");
   const paneId=child.record.paneId!;
   await cli(["pane","zoom","--pane",pane.pane_id,"--on"]);
   await child.finish();
   await expect(cli(["pane","get",paneId])).rejects.toThrow();
   const focused=await cli(["pane","get",pane.pane_id]);expect(focused.result.pane.pane_id).toBe(pane.pane_id);
   const catalog=loadDefinitions(scratch,false,profile);expect(catalog.errors).toEqual([]);
   for(const scenario of [
    {agent:"teamlead",members:["developer","explorer"],turns:1,instructions:'Commission developer to write proof.txt containing exactly "leaf write ok", with no shell commands. Then commission explorer to read and confirm it. Wait for both results and integrate them briefly. Do not retain either leaf.'},
    {agent:"council",members:["advisor","researcher","reviewer"],turns:2,instructions:'The user explicitly requests a tiny council on JSON versus YAML for a local CLI config. This is hypothetical; do not browse or read files. Commission advisor, researcher, reviewer with retain=true for independent one-sentence openings from distinct perspectives. Use subagent_control message to ask EACH SAME member a focused rebuttal based on another opening and to recall its earlier position. Wait for all replies, then synthesize disagreements and evidence gaps. Do not implement anything. Leave members retained for inspection.'},
   ]){
    const definition=catalog.agents.get(scenario.agent)!;
    const result=await runtime.launch({...input,definition,model:definition.model!,effort:definition.effort!,instructions:scenario.instructions,retained:false,catalog:catalog.agents},profile,join(profile,"extensions/subagent-child.ts"),false);
    expect(result.outcome,result.error??result.result).toBe("complete");
    const members=runtime.list().filter(record=>record.parentId===result.id);
    expect(members.map(record=>record.agent).sort()).toEqual(scenario.members);
    expect(members.every(record=>record.outcome==="complete"&&record.turns>=scenario.turns),JSON.stringify(members)).toBe(true);
    if(scenario.agent==="teamlead")expect(readFileSync(join(scratch,"proof.txt"),"utf8")).toContain("leaf write ok");
    for(const member of members)if(member.retained)await runtime.get(member.id).finish();
   }
   const helped=await runtime.launch({...input,instructions:"Reply only: survival ready"},profile,join(profile,"extensions/subagent-child.ts"),false);
   const helpedChild=runtime.get(helped.id) as VisibleChild;
   await helpedChild.intervene();
   const ordinary=await runtime.launch({...input,instructions:"Reply only: ordinary ready"},profile,join(profile,"extensions/subagent-child.ts"),false);
   await runtime.shutdown("quit");
   await expect(cli(["pane","get",ordinary.paneId!])).rejects.toThrow();
   await vi.waitFor(async()=>{const output=await cli(["agent","read",helped.paneId!,"--source","recent-unwrapped","--lines","60"]);expect(JSON.stringify(output)).toContain("Parent unavailable")},{timeout:15_000,interval:250});
   // The user-owned child exits through its real TUI command after its parent is gone.
   await cli(["agent","prompt",helped.paneId!,"/exit"]).catch(()=>undefined);
   await vi.waitFor(async()=>{await expect(cli(["pane","get",helped.paneId!])).rejects.toThrow()},{timeout:15_000,interval:250});
  }finally{
   try{await runtime.shutdown("quit")}finally{
    for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);
    if(linked)await cli(["plugin","unlink","local.pi"]);
    try{await cli(["server","stop"])}finally{if(server.exitCode===null)server.kill();await serverClosed}
    rmSync(scratch,{recursive:true,force:true});
   }
  }
 },320_000);
});

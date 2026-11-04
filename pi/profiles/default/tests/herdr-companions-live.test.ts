import { expect, it, vi } from "vitest";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHerdrCli, inspectLayout, result } from "../lib/herdr-cli.ts";
import { SubagentLayout } from "../lib/subagents/layout.ts";
import { prepareCommand, collectCommand } from "../lib/herdr-command.ts";
import { companionPlacement } from "../lib/herdr-companions.ts";

const exec = promisify(execFile);
it.runIf(process.env.PI_HERDR_COMPANIONS_LIVE === "1" && process.platform === "win32")("keeps the primary full-width below mixed panes and retires a real command host without a leftover shell", async () => {
  const scratch=mkdtempSync(join(tmpdir(),"herdr-companions-live-")), name=`companions-${process.pid}-${Date.now()}`;
  const env:NodeJS.ProcessEnv={...process.env,APPDATA:join(scratch,"registry"),LOCALAPPDATA:join(scratch,"local"),XDG_CONFIG_HOME:join(scratch,"config"),XDG_DATA_HOME:join(scratch,"data"),XDG_STATE_HOME:join(scratch,"state"),HERDR_CONFIG_PATH:join(scratch,"herdr.toml"),PWSH_MODULES_CHECKED:"1"};
  for(const key of Object.keys(env))if((key.startsWith("HERDR_")&&key!=="HERDR_CONFIG_PATH"&&key!=="HERDR_BIN_PATH")||key.startsWith("PI_HERDR_")||key.startsWith("PI_SUBAGENT_"))delete env[key];
  mkdirSync(env.APPDATA!,{recursive:true});mkdirSync(env.LOCALAPPDATA!,{recursive:true});
  writeFileSync(env.HERDR_CONFIG_PATH!, '[ui.sound]\nenabled = false\n[session]\nresume_agents_on_restore = false\n');
  const binary=env.HERDR_BIN_PATH||"herdr";
  const server=spawn(binary,["--session",name,"server"],{env,windowsHide:true,stdio:["ignore","pipe","pipe"]});
  const closed=new Promise<void>(done=>server.once("close",()=>done()));
  const command=async(args:string[])=>{const {stdout}=await exec(binary,["--session",name,...args],{env,windowsHide:true,timeout:20_000,maxBuffer:256*1024});return stdout;};
  const commandDirs:string[]=[];
  try{
    await vi.waitFor(async()=>{
      const sessions=JSON.parse(await command(["session","list","--json"])).sessions as Array<{running:boolean;socket_path:string}>;
      const own=sessions.filter(s=>s.running&&s.socket_path.toLowerCase().includes(scratch.toLowerCase()));
      expect(own).toHaveLength(1);env.HERDR_SOCKET_PATH=own[0].socket_path;
    },{timeout:15_000,interval:250});
    const workspace=result(await command(["workspace","create","--cwd",process.cwd(),"--no-focus"]));
    const root=workspace.root_pane;
    env.HERDR_ENV="1";env.HERDR_PANE_ID=root.pane_id;env.HERDR_WORKSPACE_ID=root.workspace_id;env.HERDR_TAB_ID=root.tab_id;
    const cli=createHerdrCli(env);
    const plugin=join(scratch,"plugin");mkdirSync(plugin);
    const repo=resolve(import.meta.dirname,"../../../..");
    writeFileSync(join(plugin,"herdr-plugin.toml"),readFileSync(join(repo,"pi/herdr/herdr-plugin.toml.in"),"utf8").replace("@COMMAND@",JSON.stringify([process.execPath,join(repo,"scripts/pi-herdr-launch.mjs"),"unused-for-command-host"])));
    await command(["plugin","link",plugin]);
    const layout=new SubagentLayout(cli,async()=>{});
    // Plugin and shell companions use the same inventory as defined children.
    const shell=await layout.place("origin",{childId:"companion:shell",callerPane:root.pane_id,cwd:process.cwd(),title:"Persistent shell"});
    const release=join(scratch,"geometry-checked");
    const prepared=prepareCommand(`while (!(Test-Path -LiteralPath '${release.replace(/'/g,"''")}')) { Start-Sleep -Milliseconds 50 }; Write-Output 'companion-host-complete'`,process.cwd(),"task");commandDirs.push(prepared.directory);
    const task=await layout.place("origin",companionPlacement({action:"place",id:"companion:task",cwd:process.cwd(),title:"Finite task",commandFile:prepared.file},root.pane_id));
    const geometry=await inspectLayout(cli,root.pane_id);
    const primary=geometry.panes.find((p:{pane_id:string})=>p.pane_id===root.pane_id);
    expect(primary.rect.x).toBe(geometry.area.x);
    expect(primary.rect.width).toBe(geometry.area.width);
    expect(primary.rect.y).toBeGreaterThan(geometry.area.y);
    expect(geometry.panes.filter((p:{pane_id:string})=>p.pane_id!==root.pane_id).every((p:{rect:{y:number}})=>p.rect.y<primary.rect.y)).toBe(true);
    writeFileSync(release,"ready");
    const saved=await collectCommand({id:task.childId,pane:task.paneId,directory:prepared.directory,lifetime:"task"},20);
    expect(saved).toMatchObject({state:"exited",exitCode:0,output:expect.stringContaining("companion-host-complete")});
    expect(saved.cleanupError).toBeUndefined();
    await vi.waitFor(async()=>{
      const panes=result(await cli(["pane","list"])).panes;
      expect(panes.some((p:{pane_id:string})=>p.pane_id===task.paneId)).toBe(false);
      expect(panes.some((p:{pane_id:string})=>p.pane_id===root.pane_id)).toBe(true);
      expect(panes.some((p:{pane_id:string})=>p.pane_id===shell.paneId)).toBe(true);
    },{timeout:10_000,interval:100});
    expect(existsSync(join(prepared.directory,"result.json"))).toBe(true);
  }finally{
    if(env.HERDR_SOCKET_PATH?.toLowerCase().includes(scratch.toLowerCase()))await command(["server","stop"]).catch(()=>undefined);
    if(server.exitCode===null)server.kill();await closed;
    for(const directory of commandDirs)rmSync(directory,{recursive:true,force:true});
    rmSync(scratch,{recursive:true,force:true});
  }
},60_000);

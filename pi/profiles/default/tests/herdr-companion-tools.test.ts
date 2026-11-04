import { afterEach, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionToolContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Value } from "typebox/value";
import { dirname, join, resolve } from "node:path";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import herdrTools from "../extensions/herdr-tools.ts";
import { HERDR_COMPANION_REQUEST, companionPlacement, type CompanionEvent } from "../lib/herdr-companions.ts";
import type { HerdrCli } from "../lib/herdr-cli.ts";

const directories:string[]=[];
afterEach(()=>{vi.unstubAllEnvs();for(const directory of directories.splice(0))rmSync(directory,{recursive:true,force:true});});
function setup(denied=false){
  const profile=resolve(import.meta.dirname,"..");
  vi.stubEnv("PI_CODING_AGENT_DIR",profile);vi.stubEnv("HERDR_ENV","1");vi.stubEnv("HERDR_SOCKET_PATH","fixture");vi.stubEnv("HERDR_PANE_ID","caller");vi.stubEnv("HERDR_WORKSPACE_ID","w1");
  const captured=new Map<string,ToolDefinition>(),events:CompanionEvent[]=[],entries:unknown[]=[];
  const cli=vi.fn<HerdrCli>(async args=>{
    if(args[0]==="plugin")return JSON.stringify({result:{plugins:[{plugin_id:"local.pi",panes:[{id:"pi",command:[process.execPath,resolve(profile,"../../../scripts/pi-herdr-launch.mjs"),"pi-package"]}]}]}});
    if(args[1]==="current")return JSON.stringify({result:{pane:{pane_id:"caller",tab_id:"w1:t1",workspace_id:"w1",terminal_id:"caller-terminal"}}});
    throw new Error(`Unexpected direct CLI mutation: ${args.join(" ")}`);
  });
  const api={registerTool(tool:ToolDefinition){captured.set(tool.name,tool);},on(){},appendEntry(type:string,data:unknown){entries.push({type,data});},events:{emit(name:string,value:unknown){
    if(name==="herdr:check-command"){
      const request=value as {accept(value:Promise<unknown>):void};request.accept(Promise.resolve(denied?{block:true,reason:"denied"}:undefined));return;
    }
    if(name===HERDR_COMPANION_REQUEST){
      const event=value as CompanionEvent;events.push(event);
      if(event.request.action!=="place")return event.accept(Promise.resolve({handled:false}));
      if(event.request.commandFile){
        const directory=dirname(event.request.commandFile);directories.push(directory);
        companionPlacement(event.request,event.callerPane).admitted?.("owned-terminal");
      }
      event.accept(Promise.resolve({handled:true,placement:{childId:event.request.id,paneId:"owned",tabId:"w1:t1",workspaceId:"w1",tabIndex:0,row:0,column:0}}));
    }
  }}} as unknown as ExtensionAPI;
  herdrTools(api,cli);
  const ctx={cwd:profile,sessionManager:{getSessionId:()=>"origin"}} as ExtensionToolContext;
  const execute=(name:string,params:Record<string,unknown>)=>captured.get(name)!.execute("call",params,undefined,undefined,ctx);
  return {captured,cli,events,entries,execute};
}

it("launches a gated command through the shared owner and collects evidence after its pane has closed",async()=>{
  const test=setup();
  const answer=await test.execute("herdr_pane",{action:"launch",command:"ccyl --model example",lifetime:"agent"});
  expect(Value.Check(test.captured.get("herdr_pane")!.outputSchema!,answer.structuredContent)).toBe(true);
  const data=JSON.parse(answer.content[0].type==="text"?answer.content[0].text:"");
  const directory=directories[0];
  expect(JSON.parse(readFileSync(join(directory,"command.json"),"utf8"))).toMatchObject({command:"ccyl --model example",lifetime:"agent"});
  expect(JSON.parse(readFileSync(join(directory,"ready.json"),"utf8"))).toEqual({terminalId:"owned-terminal"});
  expect(test.events).toHaveLength(1);expect(test.events[0].origin).toBe("origin");expect(test.entries).toHaveLength(1);
  writeFileSync(join(directory,"result.json"),JSON.stringify({state:"exited",exitCode:null,signal:null,error:"fixture spawn failure",output:"saved output"}));
  const collected=await test.execute("herdr_pane",{action:"collect",job:data.job});
  expect(Value.Check(test.captured.get("herdr_pane")!.outputSchema!,collected.structuredContent)).toBe(true);
  expect(collected.structuredContent).toMatchObject({state:"exited",output:"saved output",error:{message:"fixture spawn failure"}});
  expect(test.cli.mock.calls).toHaveLength(2);
});

it("does not create a pane when command approval is denied",async()=>{
  const test=setup(true);
  await expect(test.execute("herdr_pane",{action:"launch",command:"denied command"})).rejects.toThrow("denied");
  expect(test.cli).not.toHaveBeenCalled();expect(test.events).toHaveLength(0);
});

it("routes an interactive split through shared placement rather than directly splitting the primary",async()=>{
  const test=setup();
  const result=await test.execute("herdr_layout",{action:"split",direction:"right",label:"Interactive shell"});
  expect(result.structuredContent).toMatchObject({pane:"owned",lifetime:"shell"});
  expect(test.events[0].request).toMatchObject({action:"place",title:"Interactive shell"});
  expect(test.cli.mock.calls).toHaveLength(1);
});

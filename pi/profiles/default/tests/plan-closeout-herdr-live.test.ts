import { describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, readFileSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { preparePlanRun } from "../lib/plan-run.ts";
import type { CloseoutManifest } from "../lib/plan-integration/contracts.ts";
import { isolatedPlanHerdr, git, profile, type Agent, type Pane, type Workspace } from "./fixtures/plan-herdr-live.ts";

interface Snapshot { originPid: number; originSession: string; paneId?: string; tabId?: string; host?: { childPid?: number; integrationReady?: unknown; phase: string; result?: string; error?: string } }

// Deterministic real-Pi commands exercise the production admission class, host,
// authenticated surface, canonical Git helper and native settlement/shutdown.
// This is not provider-reasoning or closeout_successor tool-facade selection coverage.
describe.skipIf(process.env.PI_PLAN_CLOSEOUT_HERDR_LIVE !== "1")("isolated real-Pi successor closeout acceptance", () => {
  for (const scenario of ["success", "blocker", "cleanup-failure"] as const) it(scenario, async () => {
    const fixture = await isolatedPlanHerdr();
    const { scratch, repo, fixtureProfile, cli } = fixture;
    try {
      mkdirSync(join(repo, ".specs/acceptance"), { recursive: true });
      writeFileSync(join(repo, ".specs/acceptance/plan.md"), "---\nstatus: in progress\ncompleted: null\n---\n# Acceptance\n- [x] Fixture delivery\n");
      git(repo, "add", ".specs"); git(repo, "commit", "-m", "fixture selected plan");
      writeFileSync(join(repo, ".specs/acceptance/support.txt"), "untracked selected-spec evidence\n");
      const run = preparePlanRun({ originCheckoutPath: repo, specRelativePath: ".specs/acceptance/plan.md" });
      const task = run.taskWorktreePath;
      mkdirSync(join(task, ".specs/archive"), { recursive: true });
      renameSync(join(task, ".specs/acceptance"), join(task, ".specs/archive/acceptance"));
      writeFileSync(join(task, "baseline.txt"), "task implementation\n");
      git(task, "add", "-A"); git(task, "commit", "-m", "fixture implementation and archive");
      const taskCommit = git(task, "rev-parse", "HEAD");
      if (scenario === "blocker") { writeFileSync(join(repo, "baseline.txt"), "conflicting target implementation\n"); git(repo, "add", "baseline.txt"); git(repo, "commit", "-m", "fixture competing target"); }
      const manifest: CloseoutManifest = { repositoryRoot: repo, targetCheckout: repo, targetBranch: run.originBranch, taskWorktree: task, taskBranch: run.taskBranch, taskCommit, archivedPlanPath: ".specs/archive/acceptance/plan.md", activeSpecStub: "acceptance", targetStartingCommit: run.startingTargetCommit, noMerge: false, completedDate: "2026-09-30", integrationEvidence: "Isolated deterministic real Pi acceptance" };
      writeFileSync(join(fixtureProfile, 'damage-control-rules.yaml'), readFileSync(join(profile, 'damage-control-rules.yaml')));
      writeFileSync(join(fixtureProfile, 'package.json'), readFileSync(join(profile, 'package.json')));
      for (const dir of ["agents", "skills", "scripts", "lib"]) symlinkSync(join(profile, dir), join(fixtureProfile, dir), "junction");
      for (const file of ["compaction.ts", "damage-control", "session-profile.ts", "tool-invocation-provenance.ts", "scoped-instructions.ts", "web-tools", "log-analytics-tool.ts", "herdr-ui-prompt-state.ts"]) symlinkSync(join(profile, "extensions", file), join(fixtureProfile, "extensions", file), existsSync(join(profile, "extensions", file, "index.ts")) || file === "damage-control" || file === "web-tools" ? "junction" : "file");
      const stateFile = join(scratch, "origin.json"), reportFile = join(scratch, "report.json");
      const provider = `import {createAssistantMessageEventStream} from '@earendil-works/pi-ai';
function registerFixture(pi) { globalThis.fetch=async()=>{throw new Error('Network forbidden in live fixture')};
pi.registerProvider('closeout-fixture',{apiKey:'fixture',baseUrl:'http://invalid.test',api:'closeout-fixture',models:[{id:'deterministic',name:'deterministic',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:32000,maxTokens:1024}],streamSimple(model,context){
const stream=createAssistantMessageEventStream();queueMicrotask(()=>{
const result=process.env.PI_CLOSEOUT_SUCCESSOR==='1'?context.messages.filter(m=>m.role==='toolResult').at(-1):{content:[{type:'text',text:'origin handoff settled'}]};
const text=result?.content.filter(p=>p.type==='text').map(p=>p.text).join('\\n');
const content=result?[{type:'text',text:text??'missing result'}]:[{type:'toolCall',id:'fixture-handoff',name:'closeout_successor_handoff',arguments:{}}];
const message={role:'assistant',content,api:model.api,provider:model.provider,model:model.id,usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:result?'stop':'toolUse',timestamp:Date.now()};
stream.push({type:'start',partial:message});
if(!result){stream.push({type:'toolcall_start',contentIndex:0,partial:message});stream.push({type:'toolcall_end',contentIndex:0,toolCall:content[0],partial:message});}
stream.push({type:'done',reason:message.stopReason,message});stream.end();});return stream}}); }`;
      writeFileSync(join(fixtureProfile, "extensions/closeout-successor.ts"), `import {writeFileSync} from 'node:fs';
import implementation from ${JSON.stringify(join(profile, "extensions/closeout-successor.ts"))};
${provider}
export default function(pi){registerFixture(pi);implementation(pi);pi.on('agent_settled',(_event,ctx)=>writeFileSync(${JSON.stringify(reportFile)},JSON.stringify({cwd:ctx.cwd,sessionId:ctx.sessionManager.getSessionId(),pid:process.pid,messages:ctx.sessionManager.getEntries()})));}`);
      const originExtension = join(scratch, "origin-fixture.ts");
      writeFileSync(originExtension, `import {writeFileSync} from 'node:fs';
import {CloseoutSuccessorHandoff} from ${JSON.stringify(join(profile, "lib/subagents/closeout-handoff.ts"))};
import {loadDefinitions} from ${JSON.stringify(join(profile, "lib/subagents/definitions.ts"))};
${provider}
export default function(pi){registerFixture(pi);let owner,ctx,timer;
pi.registerCommand('fixture',{handler:async(action,context)=>{ctx=context;
if(action==='launch'){owner=new CloseoutSuccessorHandoff();const role=loadDefinitions(${JSON.stringify(fixtureProfile)},false,${JSON.stringify(fixtureProfile)}).agents.get('integrator');const session=context.sessionManager.getSessionId();
await owner.launch({origin:session,definition:role,instructions:'Execute the authorized canonical staged local closeout now.',model:'closeout-fixture/deterministic',effort:'off',cwd:${JSON.stringify(repo)},skills:[${JSON.stringify(join(fixtureProfile, "skills/plan-integration/SKILL.md"))}],surface:'visible',retained:true,closeoutManifest:${JSON.stringify(manifest)},closeoutParentSessionId:session},${JSON.stringify(fixtureProfile)},session).catch(error=>{writeFileSync(${JSON.stringify(stateFile)},JSON.stringify({error:String(error)}));throw error});
timer=setInterval(async()=>{try{writeFileSync(${JSON.stringify(stateFile)},JSON.stringify({originPid:process.pid,originSession:session,...await owner.inspect(session)}));}catch(e){writeFileSync(${JSON.stringify(stateFile)},JSON.stringify({error:String(e)}));}},250);}
if(action==='release'){await owner.release(context.sessionManager.getSessionId());pi.sendUserMessage('settle originating handoff');}}});
pi.on('agent_settled',(_event,context)=>{if(owner?.retirementRequested(context.sessionManager.getSessionId()))context.shutdown()});
pi.on('session_shutdown',async()=>{clearInterval(timer);await owner?.close()});}`);
      // Load only the fixture command and lifecycle reporter in the originating real Pi.
      // The plugin still owns bootstrap, child process handle, and pane retirement.
      const originProfileExtension = join(fixtureProfile, "extensions/origin.ts");
      writeFileSync(originProfileExtension, `export {default} from ${JSON.stringify(originExtension)};`);
      // The origin must not load the restricted successor extension before admission.
      // Use a separate explicitly configured profile for its normal resource discovery.
      const originProfile = join(scratch, "origin-profile"); mkdirSync(join(originProfile, "extensions"), { recursive: true });
      writeFileSync(join(originProfile, "extensions/origin.ts"), readFileSync(originProfileExtension, "utf8"));
      writeFileSync(join(originProfile, "extensions/herdr-agent-state.ts"), readFileSync(join(profile, "extensions/herdr-agent-state.ts"), "utf8"));
      symlinkSync(join(profile, "node_modules"), join(originProfile, "node_modules"), "junction");
      writeFileSync(join(originProfile, "settings.json"), JSON.stringify({defaultProjectTrust:'trust',defaultProvider:'closeout-fixture',defaultModel:'deterministic'}));
      const grouped = (await cli<{result:{workspace:Workspace;root_pane:Pane}}>(["worktree", "open", "--cwd", repo, "--path", task, "--no-focus"])).result;
      const workspace = grouped.workspace;
      const opened = (await cli<{result:{plugin_pane:{pane:Pane}}}>(["plugin", "pane", "open", "--plugin", "local.pi", "--entrypoint", "pi", "--placement", "tab", "--workspace", workspace.workspace_id, "--cwd", task, "--env", `PI_HERDR_PROFILE_DIR=${originProfile}`, "--no-focus"])).result.plugin_pane.pane;
      await vi.waitFor(async()=>expect((await cli<{result:{agents:Agent[]}}>(["agent","list"])).result.agents.some(a=>a.pane_id===opened.pane_id && Boolean(a.agent_session?.value) && a.agent_status==='idle')).toBe(true),{timeout:30000,interval:200});
      await cli(['pane','close',grouped.root_pane.pane_id]);
      await cli(["agent", "prompt", opened.pane_id, "/fixture launch"]);
      let snapshot: Snapshot | undefined;
      let successorOutput = '';
      await vi.waitFor(()=>{snapshot=JSON.parse(readFileSync(stateFile,"utf8"));expect(snapshot?.host?.phase,JSON.stringify(snapshot)).toBeDefined();},{timeout:40000,interval:250}).catch(async error=>{throw new Error(`${String(error)}\norigin output: ${JSON.stringify(await cli(["pane","read",opened.pane_id,"--source","recent-unwrapped","--lines","100"]))}\nplugin logs: ${JSON.stringify(await cli(["plugin","log","list","--plugin","local.pi","--limit","20"]))}`)});
      expect(snapshot!.tabId).toBe(opened.tab_id);
      if(scenario!=="blocker") {
        await vi.waitFor(async()=>{const next: Snapshot=JSON.parse(readFileSync(stateFile,"utf8"));if(next.paneId) snapshot=next;if(snapshot?.paneId) successorOutput=String(await cli(['pane','read',snapshot.paneId,'--source','recent-unwrapped','--lines','100']).catch(()=>successorOutput));expect(snapshot?.host?.integrationReady,JSON.stringify(snapshot)).toBeDefined();},{timeout:40000,interval:250}).catch(async error=>{throw new Error(`${String(error)}\nnode stderr: ${fixture.logs()}\nsuccessor output: ${successorOutput}\nreport: ${existsSync(reportFile)?readFileSync(reportFile,'utf8'):'missing'}\npanes: ${JSON.stringify(await cli(['pane','list','--workspace',opened.workspace_id]))}\nplugin logs: ${JSON.stringify(await cli(['plugin','log','list','--plugin','local.pi','--limit','50']))}`)});
        expect(existsSync(task)).toBe(true);
        expect(readFileSync(join(repo,manifest.archivedPlanPath),"utf8")).toContain("status: completed");
        expect(existsSync(join(repo, ".specs/acceptance"))).toBe(false);
        expect(readFileSync(join(repo, ".specs/archive/acceptance/support.txt"), "utf8")).toBe("untracked selected-spec evidence\n");
        if(scenario==="cleanup-failure") writeFileSync(join(task,"retained-untracked.txt"),"force exact worktree cleanup failure\n");
        await cli(["agent","prompt",opened.pane_id,"/fixture release"]);
      }
      await vi.waitFor(()=>expect(existsSync(reportFile)).toBe(true),{timeout:40000,interval:250});
      const report: {cwd:string;pid:number;sessionId:string;messages:unknown[]} = JSON.parse(readFileSync(reportFile,"utf8"));
      expect(resolve(report.cwd)).toBe(resolve(repo)); expect(report.pid).not.toBe(snapshot!.originPid); expect(report.sessionId).not.toBe(snapshot!.originSession);
      const panes=(await cli<{result:{panes:Pane[]}}>(["pane","list","--workspace",opened.workspace_id])).result.panes;
      expect(panes.some(p=>p.pane_id===snapshot!.paneId && p.tab_id===opened.tab_id)).toBe(true);
      expect(panes.some(p=>p.pane_id===opened.pane_id)).toBe(scenario==="blocker");
      expect(panes).toHaveLength(scenario==='blocker'?2:1);
      const processes=await cli<{result:{process_info:{foreground_processes:{pid:number;argv:string[]}[]}}}>(['pane','process-info','--pane',snapshot!.paneId!]);
      expect(processes.result.process_info.foreground_processes.some(p=>p.pid===report.pid && p.argv.includes(fixture.entry))).toBe(true);
      expect(existsSync(task)).toBe(scenario!=="success");
      const output=JSON.stringify(report.messages);
      expect(output).toContain(scenario==="success"?"COMPLETED":scenario==="blocker"?"MERGE BLOCKED":"CLEANUP PENDING");
      if(scenario==="cleanup-failure") expect(output.replaceAll("\\\\","/")).toContain(task.replaceAll("\\","/"));
      process.kill(report.pid,0); // Actual OS-visible successor survives settlement and origin exit.
      if(scenario!=="blocker") {
        expect(()=>process.kill(snapshot!.originPid,0)).toThrow();
        expect(git(repo,'merge-base','--is-ancestor',taskCommit,'HEAD')).toBe('');
        expect(git(repo,'log','-1','--format=%s')).toBe('docs(plan): record acceptance integration');
      } else process.kill(snapshot!.originPid,0);
    } finally { await fixture.close(); }
  },150000);
});

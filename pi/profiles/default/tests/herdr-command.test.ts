import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { admitCommand, collectCommand, prepareCommand } from "../lib/herdr-command.ts";
// @ts-expect-error Executable repository JavaScript lives outside this TS project.
import { commandShell, runCommandHost } from "../../../../scripts/pi-herdr-command-host.mjs";

const directories: string[] = [];
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }); });
function prepare(lifetime: "task" | "agent" | "service" = "task") {
  const prepared = prepareCommand("ccyl --model example", process.cwd(), lifetime);
  directories.push(prepared.directory);
  admitCommand(prepared.directory, "terminal-owned");
  return { ...prepared, job: { id:"companion:test",pane:"original-pane",directory:prepared.directory,lifetime } };
}
const env = { ...process.env, HERDR_PLUGIN_ID:"local.pi", PI_HERDR_COMMAND_FILE:"must-not-leak" };

describe("dedicated Herdr command lifetime", () => {
  it("uses the Unix login shell's functions without wrapping the command in another interactive terminal", () => {
    expect(commandShell("ccyl --model example","linux",{SHELL:"/bin/zsh"})).toEqual({executable:"/bin/zsh",args:["-lic","ccyl --model example"]});
    expect(commandShell("echo done","linux",{})).toEqual({executable:"/bin/bash",args:["-lic","echo done"]});
  });
  it.each(["task", "agent"] as const)("captures %s settlement before retiring only the verified current pane", async lifetime => {
    const prepared = prepare(lifetime), calls: string[][] = [];
    const launch = vi.fn(async (_shell, cwd, childEnv) => {
      expect(cwd).toBe(process.cwd());
      expect(childEnv.PI_HERDR_COMMAND_FILE).toBeUndefined();
      return { code: 7, signal: null };
    });
    const run = async (args: string[]) => {
      calls.push(args);
      if (args[1] === "current") return JSON.stringify({result:{pane:{pane_id:"moved-pane",terminal_id:"terminal-owned"}}});
      if (args[1] === "read") return "completed output";
      expect(JSON.parse(readFileSync(join(prepared.directory,"result.json"),"utf8"))).toMatchObject({exitCode:7,output:"completed output"});
      return "";
    };
    await runCommandHost(prepared.file, env, { launch, run });
    expect(calls.at(-1)).toEqual(["plugin","pane","close","moved-pane"]);
    expect(await collectCommand(prepared.job)).toMatchObject({state:"exited",exitCode:7,pane:"moved-pane",output:"completed output"});
  });

  it("keeps a service pane and never uses idle or shell classification for completion", async () => {
    const prepared = prepare("service");
    const run = vi.fn(async (args: string[]) => args[1] === "current" ? JSON.stringify({result:{pane:{pane_id:"owned",terminal_id:"terminal-owned"}}}) : "service output");
    const result = await runCommandHost(prepared.file,env,{launch:async()=>({code:0,signal:null}),run});
    expect(result.keepOpen).toBe(true);
    expect(run.mock.calls.some(([args]) => args.includes("close") || args.includes("process-info"))).toBe(false);
  });

  it("does not close a different terminal or erase evidence after capture failure", async () => {
    const prepared = prepare();
    const run = vi.fn(async()=>JSON.stringify({result:{pane:{pane_id:"unrelated",terminal_id:"different"}}}));
    const result = await runCommandHost(prepared.file,env,{launch:async()=>({code:0,signal:null}),run});
    expect(result.keepOpen).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(await collectCommand(prepared.job)).toMatchObject({state:"exited",cleanupError:expect.stringContaining("identity changed")});
  });

  it("reports running without needing the old pane to exist and supports cancellation", async () => {
    const directory=mkdtempSync(join(tmpdir(),"pi-command-test-")); directories.push(directory);
    const job={id:"companion:test",directory,pane:"gone",lifetime:"task" as const};
    expect(await collectCommand(job)).toEqual({state:"running"});
    await expect(collectCommand(job,1,AbortSignal.abort())).rejects.toThrow();
  });

  it.runIf(process.platform === "win32")("settles a terminating PowerShell error without leaving the profile shell running", () => {
    const shell=commandShell("throw 'fixture-command-error'", "win32");
    const result=spawnSync(shell.executable,shell.args,{encoding:"utf8",windowsHide:true,timeout:10_000,env:{...process.env,PWSH_MODULES_CHECKED:"1"}});
    expect(result.status,result.error?.message).toBe(1);
    expect(result.stderr).toContain("fixture-command-error");
  });

  it.runIf(process.platform === "win32")("loads the PowerShell profile and preserves multiline output and native exit status", () => {
    const shell=commandShell(`if (!(Get-Command ccyl -CommandType Function -ErrorAction Stop)) { throw 'ccyl missing' }\nWrite-Output 'profile-function-found'\n& '${process.execPath.replace(/'/g,"''")}' -e 'process.exit(7)'`, "win32");
    // Do not launch Claude or change its provider configuration to test shell hosting.
    expect(shell.args).not.toContain("-NoProfile");
    expect(shell.args).not.toContain("-NoExit");
    const result=spawnSync(shell.executable,shell.args,{encoding:"utf8",windowsHide:true,timeout:20_000,env:{...process.env,PWSH_MODULES_CHECKED:"1"}});
    expect(result.stdout).toContain("profile-function-found");
    expect(result.status,JSON.stringify({runtime:process.execPath,error:result.error?.message,stdout:result.stdout,stderr:result.stderr})).toBe(7);
  });
});

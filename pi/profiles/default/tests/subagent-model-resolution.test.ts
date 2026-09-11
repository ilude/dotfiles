import { afterEach, describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import subagents from "../extensions/subagents.ts";
import { SubagentRuntime, resetSubagentRuntime } from "../lib/subagents/runtime.ts";
import type { AgentDefinition } from "../lib/subagents/definitions.ts";

const here = dirname(fileURLToPath(import.meta.url));
const oldBin = process.env.PI_SUBAGENT_BIN;
const oldArgs = process.env.PI_SUBAGENT_BIN_ARGS;
const oldProfile = process.env.PI_CODING_AGENT_DIR;
const oldAuthority = process.env.PI_SUBAGENT_AUTHORITY;
const runtimes: SubagentRuntime[] = [];
const model = (provider: string, id: string) => ({ provider, id, name: id }) as any;
function registry(models: any[], authenticated: string[] = []) {
  return { getAll: () => models, hasConfiguredAuth: (candidate: any) => authenticated.includes(candidate.provider) } as any;
}
function definition(name: string, extra: Partial<AgentDefinition> = {}): AgentDefinition {
  return { name, description: name, tools: [], delegates: [], skills: [], prompt: name, source: "profile", filePath: `${name}.md`, ...extra };
}
function fixture() {
  delete process.env.PI_SUBAGENT_AUTHORITY;
  process.env.PI_SUBAGENT_BIN = process.execPath;
  process.env.PI_SUBAGENT_BIN_ARGS = JSON.stringify([join(here, "fixtures/fake-subagent-rpc.mjs")]);
}

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map(runtime => runtime.shutdown("quit")));
  await resetSubagentRuntime();
  if (oldAuthority === undefined) delete process.env.PI_SUBAGENT_AUTHORITY; else process.env.PI_SUBAGENT_AUTHORITY = oldAuthority;
  for (const [key, value] of [["PI_SUBAGENT_BIN", oldBin], ["PI_SUBAGENT_BIN_ARGS", oldArgs], ["PI_CODING_AGENT_DIR", oldProfile]] as Array<[string, string | undefined]>) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

describe("bare model resolution at subagent launch seams", () => {
  it.each([
    ["definition fallback", undefined, "two/gpt"],
    ["explicit bare override", "gpt", "two/gpt"],
  ])("direct tool uses the native resolver for %s", async (_label, requested, expected) => {
    fixture();
    const profile = mkdtempSync(join(tmpdir(), "subagent-model-profile-"));
    const cwd = mkdtempSync(join(tmpdir(), "subagent-model-cwd-"));
    mkdirSync(join(profile, "agents"));
    writeFileSync(join(profile, "agents", "probe.md"), `---\nname: probe\ndescription: probe\ntools: []\nskills: []\ndelegates: []\nmodel: ${requested === undefined ? "gpt" : "one/gpt"}\n---\nprobe\n`);
    process.env.PI_CODING_AGENT_DIR = profile;
    const tools: Record<string, any> = {};
    const pi: any = { registerTool: (tool: any) => { tools[tool.name] = tool; }, registerCommand: () => {}, registerMessageRenderer: () => {}, on: () => {} };
    subagents(pi);
    const ctx: any = { cwd, isProjectTrusted: () => false, sessionManager: { getSessionId: () => "direct-model-test" }, isIdle: () => true, modelRegistry: registry([model("one", "gpt"), model("two", "gpt")], ["two"]) };
    // The extension owns its runtime; use its normal tool seam and inspect its returned child record.
    const result = await tools.subagent.execute("call", { agent: "probe", instructions: "[live]", surface: "headless", ...(requested ? { model: requested } : {}) }, undefined, undefined, ctx);
    expect(result.isError).not.toBe(true);
    expect(result.details).toMatchObject({ model: expected, status: "settled" });
    rmSync(profile, { recursive: true, force: true }); rmSync(cwd, { recursive: true, force: true });
  });

  it("rejects native bare-name ambiguity before direct launch", async () => {
    fixture();
    const profile = mkdtempSync(join(tmpdir(), "subagent-model-profile-"));
    const cwd = mkdtempSync(join(tmpdir(), "subagent-model-cwd-"));
    mkdirSync(join(profile, "agents"));
    writeFileSync(join(profile, "agents", "probe.md"), "---\nname: probe\ndescription: probe\ntools: []\nskills: []\ndelegates: []\nmodel: gpt\n---\nprobe\n");
    process.env.PI_CODING_AGENT_DIR = profile;
    const tools: Record<string, any> = {};
    subagents({ registerTool: (tool: any) => { tools[tool.name] = tool; }, registerCommand: () => {}, registerMessageRenderer: () => {}, on: () => {} } as any);
    const result = await tools.subagent.execute("call", { agent: "probe", instructions: "[live]" }, undefined, undefined, { cwd, isProjectTrusted: () => false, sessionManager: { getSessionId: () => "ambiguous-model-test" }, isIdle: () => true, modelRegistry: registry([model("one", "gpt"), model("two", "gpt")]) });
    expect(result.isError).toBe(true);
    expect(result.details.error).toMatch(/ambiguous/i);
    rmSync(profile, { recursive: true, force: true }); rmSync(cwd, { recursive: true, force: true });
  });

  it.each([
    ["definition fallback", undefined, "two/gpt"],
    ["explicit bare override", "gpt", "two/gpt"],
  ])("coordinator delegate uses its propagated registry for %s", async (_label, requested, expected) => {
    fixture();
    const runtime = new SubagentRuntime(); runtimes.push(runtime);
    const leaf = definition("leaf", { model: requested === undefined ? "gpt" : "one/gpt" });
    const coordinator = definition("coordinator", { tools: ["subagent"], delegates: ["leaf"] });
    const modelRegistry = registry([model("one", "gpt"), model("two", "gpt")], ["two"]);
    const parent = await runtime.launch({ definition: coordinator, instructions: "[hold]", cwd: here, model: "two/gpt", effort: "low", skills: [], origin: "coordinator-model-test", surface: "headless", retained: false, catalog: new Map([["coordinator", coordinator], ["leaf", leaf]]), modelRegistry }, join(here, ".."), join(here, "../extensions/subagent-child.ts"), true);
    const response = await (runtime as any).dispatch({ child: parent.id, origin: "coordinator-model-test", run: "fixture" }, { type: "delegate", payload: { agent: "leaf", instructions: "[live]", ...(requested ? { model: requested } : {}), background: true } });
    expect(response).toMatchObject({ model: expected, status: "running", parentId: parent.id });
    await runtime.get(response.id).cancel(); await runtime.get(parent.id).cancel();
  });
});

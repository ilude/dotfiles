import { afterEach, describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RpcChild } from "../lib/subagents/rpc.ts";
import type { AgentDefinition } from "../lib/subagents/definitions.ts";

const here = dirname(fileURLToPath(import.meta.url));
const children: RpcChild[] = [];
const definition: AgentDefinition = { name: "test", description: "test", tools: ["subagent_parent"], delegates: [], skills: [], prompt: "test", source: "profile", filePath: "test.md", model: "openai-codex/test", effort: "low" };
function child(instructions: string) {
  process.env.PI_SUBAGENT_BIN = process.execPath;
  process.env.PI_SUBAGENT_BIN_ARGS = JSON.stringify([join(here, "fixtures", "fake-subagent-rpc.mjs")]);
  const instance = new RpcChild({ definition, instructions, cwd: here, model: "openai-codex/test", effort: "low", skills: [], origin: "terminal-origin", retained: false, surface: "headless" }, join(here, "../extensions/subagent-child.ts"), join(here, ".."));
  children.push(instance);
  return instance;
}
afterEach(async () => {
  await Promise.all(children.splice(0).map(child => child.cancel()));
  delete process.env.PI_SUBAGENT_BIN;
  delete process.env.PI_SUBAGENT_BIN_ARGS;
});

describe("subagent terminal outcomes", () => {
  it("preserves the terminating tool name and actual workspace reason", async () => {
    const result = await child("[tool-error]").start();
    expect(result).toMatchObject({ outcome: "failed", processState: "exited" });
    expect(result.error).toContain("Tool read failed");
    expect(result.error).toContain("Native path is outside the assigned workspace");
  });

  it("clears a recoverable tool error when a valid final reply follows", async () => {
    const result = await child("[tool-error] [recoverable]").start();
    expect(result).toMatchObject({ outcome: "complete", result: "recovered after the read failed" });
    expect(result.error).toBeUndefined();
  });

  it("expires a deferred partial report before the later settling cycle", async () => {
    const instance = child("deferred report");
    instance.record.processState = "exited";
    instance.record.status = "running";
    let descendantsOutstanding = true;
    instance.hasOutstandingChildren = () => descendantsOutstanding;
    instance.parentMessage({ type: "partial", payload: "Earlier work remains active." });

    (instance as any).last = "Still waiting for descendants.";
    await (instance as any).finishFromTurn();
    expect(instance.snapshot()).toMatchObject({ status: "running", phase: "waiting-children", outcome: "partial", result: "Earlier work remains active." });

    // A subsequent native settlement cycle can update the latest text without
    // making the earlier report current again.
    (instance as any).last = "Ordinary continuation while descendants remain.";
    await (instance as any).finishFromTurn();
    descendantsOutstanding = false;
    (instance as any).last = "Completed after all descendants settled.";
    await (instance as any).finishFromTurn();

    expect(instance.snapshot()).toMatchObject({
      status: "settled",
      outcome: "complete",
      result: "Completed after all descendants settled.",
    });
  });

  it.each(["partial", "blocked"] as const)("keeps an explicit %s report from its settling cycle", async outcome => {
    const instance = child(`same-cycle ${outcome}`);
    instance.record.processState = "exited";
    instance.record.status = "running";
    instance.parentMessage({ type: outcome, payload: `Explicit ${outcome} evidence.` });
    // Native turn boundaries within this settling cycle do not expire the report.
    (instance as any).rpcActivity({ type: "turn_start" });
    (instance as any).last = "The ordinary final acknowledgement for this cycle.";
    await (instance as any).finishFromTurn();
    expect(instance.snapshot()).toMatchObject({ status: "settled", outcome, result: `Explicit ${outcome} evidence.` });
  });
});

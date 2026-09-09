import { afterEach, describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RpcChild } from "../lib/subagents/rpc.ts";
import type { AgentDefinition } from "../lib/subagents/definitions.ts";

const here = dirname(fileURLToPath(import.meta.url));
const children: RpcChild[] = [];
const definition: AgentDefinition = { name: "test", description: "test", tools: [], delegates: [], skills: [], prompt: "test", source: "profile", filePath: "test.md", model: "openai-codex/test", effort: "low" };
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
});

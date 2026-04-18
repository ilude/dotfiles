import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

const spawnMock = vi.fn();

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

describe("subagent model override routing", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-subagent-test-"));
    const agentsDir = path.join(tmpDir, ".pi", "agents");
    await fs.promises.mkdir(agentsDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(agentsDir, "tester.md"),
      `---
name: tester
description: Test agent
model: anthropic/claude-sonnet-4-6
---

You are a test agent.
`,
      "utf8",
    );
    spawnMock.mockReset();
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  function mockSuccessfulSpawn() {
    spawnMock.mockImplementation((_command: string, _args: string[]) => {
      const proc = new EventEmitter() as any;
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.kill = vi.fn();
      proc.killed = false;

      queueMicrotask(() => {
        proc.stdout.emit(
          "data",
          `${JSON.stringify({
            type: "message_end",
            message: {
              role: "assistant",
              content: [{ type: "text", text: "done" }],
              usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, cost: { total: 0.01 }, totalTokens: 15 },
              stopReason: "end_turn",
            },
          })}\n`,
        );
        proc.emit("close", 0);
      });

      return proc;
    });
  }

  async function loadTool() {
    const pi = createMockPi();
    const mod = await import("../extensions/subagent/index.ts");
    mod.default(pi as any);
    const tool = pi._getTool("subagent");
    if (!tool) throw new Error("subagent tool not registered");
    return { pi, tool };
  }

  it("uses modelSize/modelPolicy to override pinned agent models", async () => {
    mockSuccessfulSpawn();
    const { tool } = await loadTool();

    const ctx = createMockCtx({
      cwd: tmpDir,
      model: { provider: "openai-codex", id: "gpt-5.4" },
      modelRegistry: {
        getAvailable: vi.fn(() => [
          { provider: "openai-codex", id: "gpt-5.4-mini" },
          { provider: "openai-codex", id: "gpt-5.4-fast" },
          { provider: "openai-codex", id: "gpt-5.4" },
          { provider: "anthropic", id: "claude-sonnet-4-6" },
        ]),
      },
    });

    const result = await tool.execute(
      "call-1",
      {
        agent: "tester",
        task: "Check the thing",
        agentScope: "project",
        confirmProjectAgents: false,
        modelSize: "medium",
        modelPolicy: "same-family",
      },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).not.toBe(true);
    expect(spawnMock).toHaveBeenCalledTimes(1);

    const spawnArgs = spawnMock.mock.calls[0][1] as string[];
    expect(spawnArgs).toContain("--model");
    expect(spawnArgs).toContain("openai-codex/gpt-5.4-fast");
    expect(spawnArgs).not.toContain("anthropic/claude-sonnet-4-6");
  });

  it("falls back to the agent's pinned model when no modelSize is requested", async () => {
    mockSuccessfulSpawn();
    const { tool } = await loadTool();

    const ctx = createMockCtx({
      cwd: tmpDir,
      model: { provider: "openai-codex", id: "gpt-5.4" },
      modelRegistry: {
        getAvailable: vi.fn(() => [
          { provider: "openai-codex", id: "gpt-5.4-mini" },
          { provider: "openai-codex", id: "gpt-5.4-fast" },
          { provider: "openai-codex", id: "gpt-5.4" },
          { provider: "anthropic", id: "claude-sonnet-4-6" },
        ]),
      },
    });

    await tool.execute(
      "call-2",
      {
        agent: "tester",
        task: "Check the thing",
        agentScope: "project",
        confirmProjectAgents: false,
      },
      undefined,
      undefined,
      ctx,
    );

    const spawnArgs = spawnMock.mock.calls[0][1] as string[];
    expect(spawnArgs).toContain("--model");
    expect(spawnArgs).toContain("anthropic/claude-sonnet-4-6");
  });
});

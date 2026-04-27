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
  let prevOperatorDir: string | undefined;

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
    prevOperatorDir = process.env.PI_OPERATOR_DIR;
    process.env.PI_OPERATOR_DIR = path.join(tmpDir, "operator");
    spawnMock.mockReset();
  });

  afterEach(async () => {
    if (prevOperatorDir === undefined) delete process.env.PI_OPERATOR_DIR;
    else process.env.PI_OPERATOR_DIR = prevOperatorDir;
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
  }, 15000);

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
  }, 15000);

  it("registers the subagent run as a TaskRecordV1 with completed lifecycle", async () => {
    mockSuccessfulSpawn();
    const { tool } = await loadTool();

    const { listTasks } = await import("../lib/task-registry.ts");

    const before = listTasks();
    expect(before.length).toBe(0);

    const ctx = createMockCtx({
      cwd: tmpDir,
      model: { provider: "anthropic", id: "claude-sonnet-4-6" },
    });

    await tool.execute(
      "call-task-record",
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

    const after = listTasks();
    expect(after.length).toBe(1);
    const record = after[0];
    expect(record.origin).toBe("subagent");
    expect(record.agentName).toBe("tester");
    expect(record.state).toBe("completed");
    expect(record.startedAt).toBeDefined();
    expect(record.endedAt).toBeDefined();
    expect(record.usage?.inputTokens).toBe(10);
    expect(record.usage?.outputTokens).toBe(5);
  }, 15000);

  it("registers a subagent failure as state=failed with errorReason", async () => {
    spawnMock.mockImplementation(() => {
      const proc = new EventEmitter() as any;
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.kill = vi.fn();
      proc.killed = false;
      queueMicrotask(() => {
        proc.stderr.emit("data", "agent crashed: simulated failure\n");
        proc.emit("close", 1);
      });
      return proc;
    });
    const { tool } = await loadTool();
    const { listTasks } = await import("../lib/task-registry.ts");

    const ctx = createMockCtx({
      cwd: tmpDir,
      model: { provider: "anthropic", id: "claude-sonnet-4-6" },
    });

    await tool.execute(
      "call-fail",
      {
        agent: "tester",
        task: "Will fail",
        agentScope: "project",
        confirmProjectAgents: false,
      },
      undefined,
      undefined,
      ctx,
    );

    const records = listTasks();
    expect(records.length).toBe(1);
    expect(records[0].state).toBe("failed");
    expect(records[0].errorReason).toContain("simulated failure");
  }, 15000);
});

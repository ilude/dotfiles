import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createMockCtx, createMockPi, createMockTheme } from "./helpers/mock-pi.ts";

const spawnMock = vi.fn();
const SUBAGENT_TEST_TIMEOUT_MS = 30000;
const SPAWN_WAIT_TIMEOUT_MS = 20000;

type MockProcess = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
  killed: boolean;
};

function createMockProcess(): MockProcess {
  const proc = new EventEmitter() as MockProcess;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn();
  proc.killed = false;
  return proc;
}

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
effort: high
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
      const proc = createMockProcess();

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
    mod.default(pi as Parameters<typeof mod.default>[0]);
    const tool = pi._getTool("subagent");
    if (!tool) throw new Error("subagent tool not registered");
    return { pi, tool };
  }

  it("does not prompt for project agents by default", async () => {
    mockSuccessfulSpawn();
    const { tool } = await loadTool();
    const ctx = createMockCtx({ cwd: tmpDir });

    const result = await tool.execute(
      "call-project-default",
      {
        agent: "tester",
        task: "Check the thing",
        agentScope: "project",
      },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).not.toBe(true);
    expect(ctx.ui.confirm).not.toHaveBeenCalled();
    expect(spawnMock).toHaveBeenCalledTimes(1);
  }, SUBAGENT_TEST_TIMEOUT_MS);

  it("queues parallel tasks beyond the concurrency limit", async () => {
    const procs: MockProcess[] = [];
    const spawnWaiters = new Map<
      number,
      { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
    >();
    const waitForSpawnCount = (count: number) =>
      new Promise<void>((resolve, reject) => {
        if (procs.length >= count) {
          resolve();
          return;
        }
        const timer = setTimeout(() => {
          spawnWaiters.delete(count);
          reject(new Error(`Timed out waiting for ${count} spawns; observed ${procs.length}`));
        }, SPAWN_WAIT_TIMEOUT_MS);
        spawnWaiters.set(count, { resolve, reject, timer });
      });
    spawnMock.mockImplementation(() => {
      const proc = createMockProcess();
      procs.push(proc);
      for (const [count, waiter] of spawnWaiters) {
        if (procs.length >= count) {
          spawnWaiters.delete(count);
          clearTimeout(waiter.timer);
          waiter.resolve();
        }
      }
      return proc;
    });
    const { tool } = await loadTool();

    const ctx = createMockCtx({
      cwd: tmpDir,
      model: { provider: "anthropic", id: "claude-sonnet-4-6" },
    });

    const execution = tool.execute(
      "call-parallel-queued",
      {
        tasks: Array.from({ length: 10 }, (_, index) => ({
          agent: "tester",
          task: `Parallel task ${index + 1}`,
        })),
        agentScope: "project",
        confirmProjectAgents: false,
      },
      undefined,
      undefined,
      ctx,
    );

    await waitForSpawnCount(8);
    expect(spawnMock).toHaveBeenCalledTimes(8);
    expect(procs).toHaveLength(8);

    procs[0].stdout.emit(
      "data",
      `${JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "done" }],
          stopReason: "end_turn",
        },
      })}\n`,
    );
    procs[0].emit("close", 0);

    await waitForSpawnCount(9);
    expect(spawnMock).toHaveBeenCalledTimes(9);

    for (const proc of procs.slice(1)) {
      proc.stdout.emit(
        "data",
        `${JSON.stringify({
          type: "message_end",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "done" }],
            stopReason: "end_turn",
          },
        })}\n`,
      );
      proc.emit("close", 0);
    }

    await waitForSpawnCount(10);
    expect(spawnMock).toHaveBeenCalledTimes(10);
    const lastProc = procs[9];
    lastProc.stdout.emit(
      "data",
      `${JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "done" }],
          stopReason: "end_turn",
        },
      })}\n`,
    );
    lastProc.emit("close", 0);

    const result = await execution;
    expect(result.content[0].text).toContain("Parallel: 10/10 succeeded");
  }, SUBAGENT_TEST_TIMEOUT_MS);

  it("finishes a subagent when the child emits agent_end without close", async () => {
    const proc = createMockProcess();
    spawnMock.mockImplementation(() => proc);
    const { tool } = await loadTool();

    const ctx = createMockCtx({
      cwd: tmpDir,
      model: { provider: "anthropic", id: "claude-sonnet-4-6" },
    });

    const execution = tool.execute(
      "call-agent-end",
      {
        agent: "tester",
        task: "Finish on agent_end",
        agentScope: "project",
        confirmProjectAgents: false,
      },
      undefined,
      undefined,
      ctx,
    );

    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
    proc.stdout.emit(
      "data",
      `${JSON.stringify({
        type: "agent_end",
        messages: [
          {
            role: "assistant",
            content: [{ type: "text", text: "agent-end done" }],
          },
        ],
      })}\n`,
    );

    const result = await execution;
    expect(result.content[0].text).toContain("agent-end done");
    expect(proc.kill).toHaveBeenCalledWith("SIGTERM");
  }, SUBAGENT_TEST_TIMEOUT_MS);

  it("uses modelSize/modelPolicy to override pinned agent models", async () => {
    mockSuccessfulSpawn();
    const { tool } = await loadTool();

    const ctx = createMockCtx({
      cwd: tmpDir,
      model: { provider: "openai-codex", id: "gpt-5.5" },
      modelRegistry: {
        getAvailable: vi.fn(() => [
          { provider: "openai-codex", id: "gpt-5.4-mini" },
          { provider: "openai-codex", id: "gpt-5.3-codex" },
          { provider: "openai-codex", id: "gpt-5.5" },
          { provider: "openai-codex", id: "gpt-5.1-codex-max" },
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
    expect(spawnArgs).toContain("openai-codex/gpt-5.5");
    expect(spawnArgs).not.toContain("openai-codex/gpt-5.1-codex-max");
    expect(spawnArgs).not.toContain("anthropic/claude-sonnet-4-6");
  }, SUBAGENT_TEST_TIMEOUT_MS);

  it("uses explicit model over modelSize and pinned agent models", async () => {
    mockSuccessfulSpawn();
    const { tool } = await loadTool();
    const getAvailable = vi.fn(() => [
      { provider: "openai-codex", id: "gpt-5.5" },
      { provider: "anthropic", id: "claude-sonnet-4-6" },
    ]);

    const ctx = createMockCtx({
      cwd: tmpDir,
      model: { provider: "openai-codex", id: "gpt-5.5" },
      modelRegistry: { getAvailable },
    });

    const result = await tool.execute(
      "call-explicit-model",
      {
        agent: "tester",
        task: "Check the thing",
        agentScope: "project",
        confirmProjectAgents: false,
        model: "anthropic/claude-opus-4-5",
        modelSize: "medium",
      },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).not.toBe(true);
    expect(getAvailable).not.toHaveBeenCalled();
    const spawnArgs = spawnMock.mock.calls[0][1] as string[];
    expect(spawnArgs).toContain("--model");
    expect(spawnArgs).toContain("anthropic/claude-opus-4-5");
    expect(spawnArgs).not.toContain("openai-codex/gpt-5.5");
    expect(spawnArgs).not.toContain("anthropic/claude-sonnet-4-6");
    expect(result.details.results[0].model).toBe("anthropic/claude-opus-4-5");
  }, SUBAGENT_TEST_TIMEOUT_MS);

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
  }, SUBAGENT_TEST_TIMEOUT_MS);

  it("dispatches an explicit team request through the registered subagent tool", async () => {
    mockSuccessfulSpawn();
    const { tool } = await loadTool();

    const ctx = createMockCtx({
      cwd: tmpDir,
      model: { provider: "anthropic", id: "claude-sonnet-4-6" },
    });

    const result = await tool.execute(
      "call-team",
      {
        team: "engineering",
        task: "Coordinate a safe backend change",
        confirmProjectAgents: false,
      },
      undefined,
      undefined,
      ctx,
    );

    expect(result.isError).not.toBe(true);
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const spawnArgs = spawnMock.mock.calls[0][1] as string[];
    expect(spawnArgs.join(" ")).toContain("engineering-lead");
    expect(spawnArgs.join(" ")).toContain("Coordinate a safe backend change");
    expect(spawnArgs.join(" ")).not.toContain("/team");
  }, SUBAGENT_TEST_TIMEOUT_MS);

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
    expect(record.metadata?.model).toBe("anthropic/claude-sonnet-4-6");
    expect(record.metadata?.effort).toBe("high");
  }, SUBAGENT_TEST_TIMEOUT_MS);

  it("does not create a repo-root false artifact when output is false or coerced to string false", async () => {
    mockSuccessfulSpawn();
    const { tool } = await loadTool();
    const ctx = createMockCtx({
      cwd: tmpDir,
      model: { provider: "anthropic", id: "claude-sonnet-4-6" },
    });

    for (const output of [false, "false"] as const) {
      const result = await tool.execute(
        `call-output-${String(output)}`,
        {
          agent: "tester",
          task: "Return compact review output",
          agentScope: "project",
          confirmProjectAgents: false,
          output,
        },
        undefined,
        undefined,
        ctx,
      );

      expect(result.content[0].text).not.toContain("Output saved to:");
    }
    expect(fs.existsSync(path.join(tmpDir, "false"))).toBe(false);
  }, SUBAGENT_TEST_TIMEOUT_MS);

  it("returns ordinary single inline output without an artifact", async () => {
    mockSuccessfulSpawn();
    const { tool } = await loadTool();
    const ctx = createMockCtx({
      cwd: tmpDir,
      model: { provider: "anthropic", id: "claude-sonnet-4-6" },
    });

    const result = await tool.execute(
      "call-single-inline",
      {
        agent: "tester",
        task: "Return inline output",
        agentScope: "project",
        confirmProjectAgents: false,
      },
      undefined,
      undefined,
      ctx,
    );

    expect(result.content[0].text).toBe("done");
    expect(result.details.results[0].outputPath).toBeUndefined();
    expect(result.details.results[0].outputReference).toBeUndefined();
  }, SUBAGENT_TEST_TIMEOUT_MS);

  it("returns file-only output inline when artifacts are disabled", async () => {
    mockSuccessfulSpawn();
    const { tool } = await loadTool();
    const ctx = createMockCtx({
      cwd: tmpDir,
      model: { provider: "anthropic", id: "claude-sonnet-4-6" },
    });

    const result = await tool.execute(
      "call-file-only-disabled",
      {
        agent: "tester",
        task: "Return output without an artifact",
        agentScope: "project",
        confirmProjectAgents: false,
        output: false,
        outputMode: "file-only",
      },
      undefined,
      undefined,
      ctx,
    );

    expect(result.content[0].text).toContain("done");
    expect(result.content[0].text).toContain("Output artifact disabled by output: false");
    expect(result.details.results[0].outputReference).toBeUndefined();
  }, SUBAGENT_TEST_TIMEOUT_MS);

  it("preserves legacy output:true by saving to the default artifact", async () => {
    mockSuccessfulSpawn();
    const { tool } = await loadTool();
    const ctx = createMockCtx({
      cwd: tmpDir,
      model: { provider: "anthropic", id: "claude-sonnet-4-6" },
    });

    const result = await tool.execute(
      "call-legacy-output-true",
      {
        agent: "tester",
        task: "Return default artifact output",
        agentScope: "project",
        confirmProjectAgents: false,
        output: true,
      },
      undefined,
      undefined,
      ctx,
    );

    const outputPath = result.details.results[0].outputPath;
    if (!outputPath) throw new Error("Expected a default output artifact path");
    expect(await fs.promises.readFile(outputPath, "utf8")).toBe("done");
    expect(result.content[0].text).toBe("done");
    expect(result.details.results[0].outputReference?.path).toBe(outputPath);
    await fs.promises.rm(outputPath, { force: true });
  }, SUBAGENT_TEST_TIMEOUT_MS);

  it("saves single file-only output to a default artifact when no path is provided", async () => {
    mockSuccessfulSpawn();
    const { tool } = await loadTool();
    const ctx = createMockCtx({
      cwd: tmpDir,
      model: { provider: "anthropic", id: "claude-sonnet-4-6" },
    });

    const result = await tool.execute(
      "call-single-file-only-default",
      {
        agent: "tester",
        task: "Return default artifact output",
        agentScope: "project",
        confirmProjectAgents: false,
        outputMode: "file-only",
      },
      undefined,
      undefined,
      ctx,
    );

    const outputPath = result.details.results[0].outputPath;
    if (!outputPath) throw new Error("Expected a default output artifact path");
    expect(await fs.promises.readFile(outputPath, "utf8")).toBe("done");
    expect(result.content[0].text).toContain(`Output saved to: ${outputPath}`);
    await fs.promises.rm(outputPath, { force: true });
  }, SUBAGENT_TEST_TIMEOUT_MS);

  it("returns file-only output inline when artifact saving fails", async () => {
    mockSuccessfulSpawn();
    const { tool } = await loadTool();
    const ctx = createMockCtx({
      cwd: tmpDir,
      model: { provider: "anthropic", id: "claude-sonnet-4-6" },
    });
    const outputPath = tmpDir;

    const result = await tool.execute(
      "call-file-only-save-error",
      {
        agent: "tester",
        task: "Return output despite artifact failure",
        agentScope: "project",
        confirmProjectAgents: false,
        output: outputPath,
        outputMode: "file-only",
      },
      undefined,
      undefined,
      ctx,
    );

    expect(result.content[0].text).toContain("done");
    expect(result.content[0].text).toContain(`Output file error: ${outputPath}`);
    expect(result.details.results[0].saveError).toBeDefined();
  }, SUBAGENT_TEST_TIMEOUT_MS);

  it("saves single file-only output and returns its artifact reference", async () => {
    mockSuccessfulSpawn();
    const { tool } = await loadTool();
    const ctx = createMockCtx({
      cwd: tmpDir,
      model: { provider: "anthropic", id: "claude-sonnet-4-6" },
    });
    const outputPath = path.join(tmpDir, "single-output.md");

    const result = await tool.execute(
      "call-single-file-only",
      {
        agent: "tester",
        task: "Return artifact output",
        agentScope: "project",
        confirmProjectAgents: false,
        output: outputPath,
        outputMode: "file-only",
      },
      undefined,
      undefined,
      ctx,
    );

    expect(await fs.promises.readFile(outputPath, "utf8")).toBe("done");
    expect(result.content[0].text).toContain(`Output saved to: ${outputPath}`);
    expect(result.content[0].text).not.toContain("done");
    expect(result.details.results[0]).toMatchObject({
      outputMode: "file-only",
      outputPath,
      outputReference: { path: outputPath },
    });
  }, SUBAGENT_TEST_TIMEOUT_MS);

  it("passes a file-only chain artifact reference to the next step", async () => {
    const spawnArgs: string[][] = [];
    let calls = 0;
    spawnMock.mockImplementation((_command: string, args: string[]) => {
      spawnArgs.push(args);
      const proc = createMockProcess();
      const output = calls++ === 0 ? "first full output" : "second output";
      queueMicrotask(() => {
        proc.stdout.emit(
          "data",
          `${JSON.stringify({
            type: "message_end",
            message: {
              role: "assistant",
              content: [{ type: "text", text: output }],
              stopReason: "end_turn",
            },
          })}\n`,
        );
        proc.emit("close", 0);
      });
      return proc;
    });
    const { tool } = await loadTool();
    const ctx = createMockCtx({
      cwd: tmpDir,
      model: { provider: "anthropic", id: "claude-sonnet-4-6" },
    });
    const outputPath = path.join(tmpDir, "chain-first.md");

    const result = await tool.execute(
      "call-chain-file-only",
      {
        chain: [
          {
            agent: "tester",
            task: "Create the source output",
            output: outputPath,
            outputMode: "file-only",
          },
          { agent: "tester", task: "Use this artifact: {previous}" },
        ],
        agentScope: "project",
        confirmProjectAgents: false,
      },
      undefined,
      undefined,
      ctx,
    );

    const artifactReference = `Output saved to: ${outputPath} (17 B, 1 line). Read this file if needed.`;
    expect(await fs.promises.readFile(outputPath, "utf8")).toBe("first full output");
    expect(spawnArgs[1].join(" ")).toContain(artifactReference);
    expect(spawnArgs[1].join(" ")).not.toContain("first full output");
    expect(result.content[0].text).toBe("second output");
    expect(result.details.results[0].outputReference?.message).toBe(artifactReference);
  }, SUBAGENT_TEST_TIMEOUT_MS);

  it("passes inline output to the next chain step when file-only artifacts are disabled", async () => {
    const spawnArgs: string[][] = [];
    let calls = 0;
    spawnMock.mockImplementation((_command: string, args: string[]) => {
      spawnArgs.push(args);
      const proc = createMockProcess();
      const output = calls++ === 0 ? "first inline output" : "second output";
      queueMicrotask(() => {
        proc.stdout.emit(
          "data",
          `${JSON.stringify({
            type: "message_end",
            message: {
              role: "assistant",
              content: [{ type: "text", text: output }],
              stopReason: "end_turn",
            },
          })}\n`,
        );
        proc.emit("close", 0);
      });
      return proc;
    });
    const { tool } = await loadTool();
    const ctx = createMockCtx({
      cwd: tmpDir,
      model: { provider: "anthropic", id: "claude-sonnet-4-6" },
    });

    const result = await tool.execute(
      "call-chain-file-only-disabled",
      {
        chain: [
          {
            agent: "tester",
            task: "Create inline source output",
            output: false,
            outputMode: "file-only",
          },
          { agent: "tester", task: "Use this output: {previous}" },
        ],
        agentScope: "project",
        confirmProjectAgents: false,
      },
      undefined,
      undefined,
      ctx,
    );

    expect(spawnArgs[1].join(" ")).toContain("first inline output");
    expect(result.content[0].text).toBe("second output");
    expect(result.details.results[0].outputReference).toBeUndefined();
  }, SUBAGENT_TEST_TIMEOUT_MS);

  it("renders active parallel subagents with model and effort", async () => {
    const proc = createMockProcess();
    spawnMock.mockImplementation(() => proc);
    const { tool } = await loadTool();

    const ctx = createMockCtx({
      cwd: tmpDir,
      model: { provider: "anthropic", id: "claude-sonnet-4-6" },
    });
    let partialResult: Awaited<ReturnType<typeof tool.execute>> | undefined;

    const execution = tool.execute(
      "call-render-active",
      {
        tasks: [{ agent: "tester", task: "Keep running" }],
        agentScope: "project",
        confirmProjectAgents: false,
      },
      undefined,
      (partial: Awaited<ReturnType<typeof tool.execute>>) => {
        partialResult = partial;
      },
      ctx,
    );

    await vi.waitFor(() => expect(partialResult).toBeDefined());
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
    const rendered = tool
      .renderResult(partialResult, { expanded: false }, createMockTheme(), {})
      .render(120)
      .join("\n");
    expect(rendered).toContain("tester anthropic/claude-sonnet-4-6[high]");

    proc.stdout.emit(
      "data",
      `${JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "done" }],
          stopReason: "end_turn",
        },
      })}\n`,
    );
    proc.emit("close", 0);
    await execution;
  }, SUBAGENT_TEST_TIMEOUT_MS);

  it("registers a subagent failure as state=failed with errorReason", async () => {
    spawnMock.mockImplementation(() => {
      const proc = createMockProcess();
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
  }, SUBAGENT_TEST_TIMEOUT_MS);

  it("treats stopReason=error as a parallel failure", async () => {
    spawnMock.mockImplementation(() => {
      const proc = createMockProcess();
      queueMicrotask(() => {
        proc.stdout.emit(
          "data",
          `${JSON.stringify({
            type: "message_end",
            message: {
              role: "assistant",
              content: [],
              stopReason: "error",
              errorMessage:
                '{"detail":"The \'gpt-5.1-codex-max\' model is not supported when using Codex with a ChatGPT account."}',
            },
          })}\n`,
        );
        proc.emit("close", 0);
      });
      return proc;
    });
    const { tool } = await loadTool();
    const { listTasks } = await import("../lib/task-registry.ts");

    const ctx = createMockCtx({
      cwd: tmpDir,
      model: { provider: "openai-codex", id: "gpt-5.5" },
    });

    const result = await tool.execute(
      "call-parallel-model-error",
      {
        tasks: [
          {
            agent: "tester",
            task: "Will model-error",
            output: false,
          },
        ],
        agentScope: "project",
        confirmProjectAgents: false,
      },
      undefined,
      undefined,
      ctx,
    );

    expect(result.content[0].text).toContain("Parallel: 0/1 succeeded");
    expect(result.content[0].text).toContain("FAILED (model error)");
    const records = listTasks();
    expect(records.length).toBe(1);
    expect(records[0].state).toBe("failed");
    expect(records[0].errorReason).toContain("not supported");
  }, SUBAGENT_TEST_TIMEOUT_MS);
});

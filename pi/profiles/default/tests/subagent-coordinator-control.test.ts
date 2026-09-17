import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { ChildRecord } from "../lib/subagents/rpc.ts";

const request = vi.hoisted(() => vi.fn());
vi.mock("../lib/subagents/transport.ts", async () => {
  const actual = await vi.importActual<typeof import("../lib/subagents/transport.ts")>("../lib/subagents/transport.ts");
  return { ...actual, requestParent: request };
});

import childAuthority from "../extensions/subagent-child.ts";
import subagents from "../extensions/subagents.ts";
import { getSubagentRuntime, resetSubagentRuntime } from "../lib/subagents/runtime.ts";

const previousAuthority = process.env.PI_SUBAGENT_AUTHORITY;
const previousEndpoint = process.env.PI_SUBAGENT_ENDPOINT;

function record(id = "held-child"): ChildRecord {
  const now = new Date().toISOString();
  return {
    id, agent: "probe", assignment: "held assignment", origin: "origin", surface: "headless",
    status: "running", retained: true, userOwned: false, processState: "running",
    transportState: "connected", phase: "model", turns: 1, createdAt: now, updatedAt: now,
  };
}

function childTool(): Map<string, ToolDefinition> {
  process.env.PI_SUBAGENT_AUTHORITY = JSON.stringify({
    id: "coordinator", agent: "teamlead", tools: ["subagent_control"], delegates: [], cwd: process.cwd(), skills: [],
  });
  process.env.PI_SUBAGENT_ENDPOINT = JSON.stringify({ child: "coordinator", origin: "origin", run: "run", port: 1, token: "inert" });
  const tools = new Map<string, ToolDefinition>();
  childAuthority({
    registerTool: (tool: ToolDefinition) => tools.set(tool.name, tool),
    registerCommand: () => {}, on: () => {},
  } as never);
  return tools;
}

function rootTool(child: any): any {
  delete process.env.PI_SUBAGENT_AUTHORITY;
  delete process.env.PI_SUBAGENT_ENDPOINT;
  const runtime = getSubagentRuntime();
  (runtime as any).children.set(child.record.id, child);
  const tools: Record<string, any> = {};
  subagents({
    events: { on: () => () => {} },
    registerTool: (tool: any) => { tools[tool.name] = tool; },
    registerCommand: () => {}, registerMessageRenderer: () => {}, on: () => {}, sendMessage: vi.fn(),
  } as any);
  return tools.subagent_control;
}

const context = { sessionManager: { getSessionId: () => "origin" }, cwd: process.cwd(), isProjectTrusted: () => false, isIdle: () => true } as any;

afterEach(async () => {
  await resetSubagentRuntime();
  if (previousAuthority === undefined) delete process.env.PI_SUBAGENT_AUTHORITY; else process.env.PI_SUBAGENT_AUTHORITY = previousAuthority;
  if (previousEndpoint === undefined) delete process.env.PI_SUBAGENT_ENDPOINT; else process.env.PI_SUBAGENT_ENDPOINT = previousEndpoint;
  request.mockReset();
});

describe("nonblocking subagent control dispatch", () => {
  beforeEach(() => {
    request.mockResolvedValue({ ...record(), status: "running" });
  });

  it.each([
    { action: "message", background: undefined, delivery: "queued" },
    { action: "message", background: false, delivery: "immediate" },
    { action: "message", background: true, delivery: "queued", replyTo: "question-id" },
    { action: "answer", background: undefined, delivery: "queued", replyTo: "question-id" },
    { action: "answer", background: false, delivery: "immediate", replyTo: "question-id" },
    { action: "answer", background: true, delivery: "queued", replyTo: "question-id" },
  ] as const)("returns accepted metadata for $action with background=$background and $delivery delivery", async input => {
    const tools = childTool();
    const result = await tools.get("subagent_control")!.execute("control", {
      ...input, id: "held-child", message: "continue the assignment",
    }, undefined, undefined, {} as never);

    expect(result.details).toMatchObject({
      id: "held-child", status: "running",
      dispatch: { accepted: true, operation: input.action === "answer" || input.replyTo !== undefined ? "answer" : "message", completion: "not-reported" },
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1]).toEqual({ type: "control", payload: {
      ...input, id: "held-child", message: "continue the assignment",
    } });
  });

  it("resolves before a held coordinator child settles", async () => {
    let calls = 0;
    request.mockReset();
    request.mockImplementation(async () => {
      calls++;
      if (calls === 1) return { ...record(), status: "running" };
      throw new Error("unexpected settlement wait");
    });
    const tools = childTool();
    const execution = tools.get("subagent_control")!.execute("control", {
      action: "message", id: "held-child", message: "do not wait", background: false,
    }, undefined, undefined, {} as never);
    let finished = false;
    const observed = execution.then(result => { finished = true; return result; });
    try {
      // A native dispatch resolves in the current microtask turn. The old
      // settlement loop sleeps before its second inspect request.
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(finished).toBe(true);
      expect((await observed).details).toMatchObject({ status: "running", dispatch: { accepted: true, completion: "not-reported" } });
    } finally {
      await execution.catch(() => {});
    }
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("keeps native dispatch rejection as an error", async () => {
    request.mockRejectedValueOnce(new Error("dispatch rejected by coordinator"));
    const tools = childTool();

    await expect(tools.get("subagent_control")!.execute("control", {
      action: "message", id: "held-child", message: "reject this", background: true,
    }, undefined, undefined, {} as never)).rejects.toThrow("dispatch rejected by coordinator");
  });

  it.each([undefined, false, true] as const)("reports accepted metadata on the root path with background=%s", async background => {
    const childRecord = record("root-child");
    const child = {
      record: childRecord,
      snapshot: () => ({ ...childRecord }),
      message: vi.fn(async () => {}),
      answer: vi.fn(async () => {}),
      cancel: vi.fn(async () => ({ complete: true })),
    };
    const tool = rootTool(child);
    const result = await tool.execute("control", {
      action: "message", id: "root-child", message: "continue", background,
    }, undefined, undefined, context);

    expect(child.message).toHaveBeenCalledWith("continue", expect.objectContaining({ delivery: undefined, interaction: undefined, protocol: undefined, replyTo: undefined }));
    expect(result.details).toMatchObject({ id: "root-child", status: "running", dispatch: { accepted: true, operation: "message", completion: "not-reported" } });
  });

  it("reports a replyTo message as an accepted answer operation", async () => {
    const childRecord = record("root-reply");
    const child = {
      record: childRecord,
      snapshot: () => ({ ...childRecord }),
      message: vi.fn(async () => {}),
      answer: vi.fn(async () => {}),
      cancel: vi.fn(async () => ({ complete: true })),
    };
    const tool = rootTool(child);
    const result = await tool.execute("control", {
      action: "message", id: "root-reply", message: "reply", replyTo: "question-id", background: true,
    }, undefined, undefined, context);

    expect(child.answer).toHaveBeenCalledWith("reply", "question-id");
    expect(child.message).not.toHaveBeenCalled();
    expect(result.details).toMatchObject({ dispatch: { accepted: true, operation: "answer", completion: "not-reported" } });
  });
});

import { expect, it, vi } from "vitest";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
const request = vi.hoisted(() => vi.fn());
vi.mock("../lib/subagents/transport.ts", () => ({ requestParent: request }));
import childAuthority from "../extensions/subagent-child.ts";

it("requires a reason for coordinator foreground launches except Strategists", async () => {
  const beforeAuthority = process.env.PI_SUBAGENT_AUTHORITY;
  const beforeEndpoint = process.env.PI_SUBAGENT_ENDPOINT;
  process.env.PI_SUBAGENT_AUTHORITY = JSON.stringify({ id: "coordinator", agent: "teamlead", tools: ["subagent"], delegates: ["probe"], cwd: process.cwd(), skills: [] });
  process.env.PI_SUBAGENT_ENDPOINT = JSON.stringify({ child: "coordinator", origin: "origin", run: "run", port: 1, token: "inert" });
  const tools = new Map<string, ToolDefinition>();
  request.mockReset();
  try {
    childAuthority({ registerTool: (tool: ToolDefinition) => { tools.set(tool.name, tool); }, registerCommand: () => {}, on: () => {} } as never);
    await expect(tools.get("subagent")!.execute("launch", { agent: "probe", instructions: "bounded assignment" }, undefined, undefined, {} as never)).rejects.toThrow("requires blockingReason");
    expect(request).not.toHaveBeenCalled();
  } finally {
    if (beforeAuthority === undefined) delete process.env.PI_SUBAGENT_AUTHORITY; else process.env.PI_SUBAGENT_AUTHORITY = beforeAuthority;
    if (beforeEndpoint === undefined) delete process.env.PI_SUBAGENT_ENDPOINT; else process.env.PI_SUBAGENT_ENDPOINT = beforeEndpoint;
  }
});

it.each([
  { agent: "strategist", background: true, retain: true },
  { agent: "strategist", background: false, retain: true },
  { agent: "strategist", background: undefined, retain: undefined },
  { agent: "probe", background: true, retain: true },
  { agent: "probe", background: false, retain: undefined },
])("coordinator launch waiting for $agent with background=$background retain=$retain", async ({ agent, background, retain }) => {
  const beforeAuthority = process.env.PI_SUBAGENT_AUTHORITY;
  const beforeEndpoint = process.env.PI_SUBAGENT_ENDPOINT;
  process.env.PI_SUBAGENT_AUTHORITY = JSON.stringify({ id: "coordinator", agent: "teamlead", tools: ["subagent"], delegates: [agent], cwd: process.cwd(), skills: [] });
  process.env.PI_SUBAGENT_ENDPOINT = JSON.stringify({ child: "coordinator", origin: "origin", run: "run", port: 1, token: "inert" });
  const tools = new Map<string, ToolDefinition>();
  const pi = { registerTool: (tool: ToolDefinition) => { tools.set(tool.name, tool); }, registerCommand: () => {}, on: () => {} };
  const effectiveBackground = agent !== "strategist" && background === true;
  const running = { id: "leaf", agent, origin: "origin", status: "running", waitState: effectiveBackground ? "background" : "attached" };
  const settled = { ...running, status: "settled", outcome: "complete", processState: "exited", result: "advice" };
  request.mockReset();
  request.mockResolvedValueOnce(running).mockResolvedValueOnce(settled);
  try {
    childAuthority(pi as never);
    const progress = vi.fn();
    const blockingReason = agent === "strategist" || effectiveBackground ? undefined : "The result is required before coordinating dependent work.";
    const result = await tools.get("subagent")!.execute("launch", { agent, background, retain, instructions: "bounded assignment", blockingReason }, undefined, progress, {} as never);
    expect(request.mock.calls[0][1]).toEqual({ type: "delegate", payload: { agent, background: effectiveBackground, retain: agent === "strategist" ? false : retain, instructions: "bounded assignment", blockingReason } });
    expect(result.details).toEqual(effectiveBackground ? running : settled);
    if (effectiveBackground) {
      expect(request).toHaveBeenCalledTimes(1);
      expect(progress).not.toHaveBeenCalled();
    } else {
      expect(request.mock.calls[1][1]).toEqual({ type: "control", payload: { action: "inspect", id: "leaf", consume: true } });
      expect(progress).toHaveBeenCalled();
    }
  } finally {
    if (beforeAuthority === undefined) delete process.env.PI_SUBAGENT_AUTHORITY; else process.env.PI_SUBAGENT_AUTHORITY = beforeAuthority;
    if (beforeEndpoint === undefined) delete process.env.PI_SUBAGENT_ENDPOINT; else process.env.PI_SUBAGENT_ENDPOINT = beforeEndpoint;
  }
});

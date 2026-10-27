import { afterEach, expect, it, vi } from "vitest";
import subagents from "../extensions/subagents.ts";
import { resetSubagentRuntime } from "../lib/subagents/runtime.ts";

const previousAuthority = process.env.PI_SUBAGENT_AUTHORITY;
const previousEndpoint = process.env.PI_SUBAGENT_ENDPOINT;
process.env.PI_SUBAGENT_AUTHORITY = "";
process.env.PI_SUBAGENT_ENDPOINT = "";

afterEach(async () => {
  if (previousAuthority === undefined) delete process.env.PI_SUBAGENT_AUTHORITY; else process.env.PI_SUBAGENT_AUTHORITY = previousAuthority;
  if (previousEndpoint === undefined) delete process.env.PI_SUBAGENT_ENDPOINT; else process.env.PI_SUBAGENT_ENDPOINT = previousEndpoint;
  await resetSubagentRuntime();
});

it("reports rejected controls as native tool errors", async () => {
  const handlers: Record<string, Function> = {};
  const tools: Record<string, any> = {};
  const pi: any = {
    events: { on: () => () => {} },
    on: (name: string, handler: Function) => { handlers[name] = handler; },
    registerTool: (tool: any) => { tools[tool.name] = tool; },
    registerCommand: () => {},
    registerMessageRenderer: () => {},
    sendMessage: vi.fn(),
    appendEntry: vi.fn(),
  };
  const ctx: any = { cwd: process.cwd(), hasUI: true, isProjectTrusted: () => false, isIdle: () => true, sessionManager: { getSessionId: () => "control-origin" }, ui: { notify: vi.fn(), setWidget: vi.fn(), setStatus: vi.fn() } };
  subagents(pi);
  expect(tools.subagent_control.description).toContain("wait only reattaches a deliberately interrupted foreground join when its result is immediately required");
  expect(tools.subagent_control.description).toContain("results arrive automatically");
  expect(tools.subagent_control.description).toContain("Do not poll for completion");
  await handlers.session_start({}, ctx);
  expect(pi.appendEntry).toHaveBeenCalledWith("subagent-extension-version", { version: "2.0.0" });
  await expect(tools.subagent_control.execute("bad-control", { action: "inspect", id: "missing" }, undefined, undefined, ctx)).rejects.toThrow("Unknown child");
});

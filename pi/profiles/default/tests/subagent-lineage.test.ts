import { afterEach, describe, expect, it, vi } from "vitest";
import { writeSubagentLineage, SUBAGENT_LINEAGE_ENTRY } from "../lib/subagents/lineage.ts";
import childAuthority from "../extensions/subagent-child.ts";

const request = vi.hoisted(() => vi.fn());
vi.mock("../lib/subagents/transport.ts", () => ({ requestParent: request }));

describe("durable subagent lineage", () => {
  const previousAuthority = process.env.PI_SUBAGENT_AUTHORITY;
  const previousEndpoint = process.env.PI_SUBAGENT_ENDPOINT;
  afterEach(() => {
    if (previousAuthority === undefined) delete process.env.PI_SUBAGENT_AUTHORITY;
    else process.env.PI_SUBAGENT_AUTHORITY = previousAuthority;
    if (previousEndpoint === undefined) delete process.env.PI_SUBAGENT_ENDPOINT;
    else process.env.PI_SUBAGENT_ENDPOINT = previousEndpoint;
    request.mockReset();
  });

  it("writes the exact contract once and ignores copied fork markers", () => {
    const entries: Array<{ type: string; customType?: string; data?: unknown }> = [];
    const sessionManager = {
      getSessionId: () => "own-session",
      getEntries: () => entries,
    };
    const pi: Pick<import("@earendil-works/pi-coding-agent").ExtensionAPI, "appendEntry"> = {
      appendEntry: (type: string, data: unknown) => entries.push({ type: "custom", customType: type, data }),
    };
    entries.push({ type: "custom", customType: SUBAGENT_LINEAGE_ENTRY, data: {
      version: 1, sessionId: "copied-parent", role: "parent", parentSessionId: "root", rootSessionId: "root",
    } });

    expect(writeSubagentLineage(pi, { sessionManager }, "developer", "parent-session", "root-session")).toBe(true);
    expect(writeSubagentLineage(pi, { sessionManager }, "developer", "parent-session", "root-session")).toBe(false);
    expect(entries.filter(entry => entry.customType === SUBAGENT_LINEAGE_ENTRY)).toHaveLength(2);
    expect(entries.at(-1)).toEqual({ type: "custom", customType: SUBAGENT_LINEAGE_ENTRY, data: {
      version: 1, sessionId: "own-session", role: "developer", parentSessionId: "parent-session", rootSessionId: "root-session",
    } });
  });

  it("reports native identity before writing a child marker", async () => {
    process.env.PI_SUBAGENT_AUTHORITY = JSON.stringify({ id: "child", agent: "developer", tools: [], delegates: [], cwd: process.cwd(), skills: [] });
    process.env.PI_SUBAGENT_ENDPOINT = JSON.stringify({ child: "child", origin: "root-session", run: "run", port: 1, token: "token" });
    request.mockResolvedValue({ parentSessionId: "parent-session" });

    const handlers = new Map<string, Array<(event: unknown, ctx: unknown) => unknown>>();
    const entries: Array<{ type: string; customType?: string; data?: unknown }> = [];
    const pi = {
      registerMessageRenderer: vi.fn(),
      registerCommand: vi.fn(),
      registerTool: vi.fn(),
      on: (name: string, handler: (event: unknown, ctx: unknown) => unknown) => {
        const current = handlers.get(name) ?? [];
        current.push(handler);
        handlers.set(name, current);
      },
      setActiveTools: vi.fn(),
      getAllTools: () => [],
      sendMessage: vi.fn(),
      appendEntry: (type: string, data: unknown) => entries.push({ type: "custom", customType: type, data }),
    };
    const ctx = {
      sessionManager: {
        getSessionId: () => "child-session",
        getSessionFile: () => "child-session.jsonl",
        getEntries: () => entries,
      },
    };

    childAuthority(pi as never);
    for (const handler of handlers.get("session_start") ?? []) await handler({}, ctx);

    expect(request).toHaveBeenCalledWith(expect.anything(), {
      type: "session-identity",
      payload: { sessionId: "child-session", sessionFile: "child-session.jsonl" },
    });
    expect(entries).toContainEqual({ type: "custom", customType: SUBAGENT_LINEAGE_ENTRY, data: {
      version: 1, sessionId: "child-session", role: "developer", parentSessionId: "parent-session", rootSessionId: "root-session",
    } });
    await handlers.get("session_shutdown")?.[0]?.({ reason: "quit" }, ctx);
  });
});

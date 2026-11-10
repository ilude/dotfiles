import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveRoleSnapshot } from "../lib/subagents/authority.ts";
import { createT3MetadataClient } from "../lib/subagents/t3/context.ts";
import { createHandoffStore } from "../lib/subagents/t3/handoffs.ts";
import type { T3RoleHandoff, T3RoleOwnershipReceipt, T3RoleThreadBinding } from "../lib/subagents/t3/contracts.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); vi.restoreAllMocks(); });
function setup() {
  const root = mkdtempSync(join(tmpdir(), "t3-role-control-")); roots.push(root);
  const profile = join(root, "profile"), cwd = join(root, "project");
  mkdirSync(join(profile, "agents"), { recursive: true }); mkdirSync(cwd);
  writeFileSync(join(profile, "agents", "reviewer.md"), "---\nname: reviewer\ndescription: Review\ntools: [read]\nmodel: openai/luna\n---\nReview only.");
  const snapshot = resolveRoleSnapshot({ agent: "reviewer", backend: "t3", profile, cwd, projectTrusted: false });
  const handoff: T3RoleHandoff = { version: 1, launchId: "launch", snapshot, assignment: "Review", taskTitle: "[reviewer] Review [pi-role:launch]", commissioner: { threadId: "commissioner", runId: "commissioner-run", piSessionId: "owner-session", piSessionFile: join(root, "owner.jsonl"), profile, cwd }, workspace: { isolation: "shared", commissioningCwd: cwd } };
  return { root, profile, cwd, handoff, store: createHandoffStore(profile) };
}
type Call = { name: string; args: Record<string, unknown> };
function harness(options: { capabilities?: Record<string, unknown>; pages?: Record<string, unknown>[]; cancelResult?: unknown; sse?: boolean } = {}) {
  const calls: Call[] = [], ids: number[] = [];
  const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as { id?: number; method: string; params?: { name: string; arguments: Record<string, unknown> } };
    if (request.id !== undefined) ids.push(request.id);
    if (request.method === "notifications/initialized") return new Response(null, { status: 202 });
    let result: unknown;
    if (request.method === "initialize") result = { protocolVersion: "2025-06-18" };
    else {
      const { name, arguments: args } = request.params!;
      calls.push({ name, args });
      if (name === "orchestrator_capabilities") result = { structuredContent: options.capabilities ?? { parentThreadId: "commissioner" } };
      else if (name === "t3_thread_read") result = { structuredContent: options.pages?.shift() ?? { thread: { threadId: "commissioner", itemCount: 0 }, items: [], hasMore: false } };
      else if (name === "task_cancel") result = options.cancelResult ?? { structuredContent: { taskId: args.taskId } };
      else result = { isError: true, content: [{ type: "text", text: "private bearer error" }] };
    }
    const envelope = { jsonrpc: "2.0", id: request.id, result };
    const headers = { "content-type": options.sse ? "text/event-stream" : "application/json", "mcp-session-id": "test-session" };
    return options.sse
      ? new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: -1, result: {} })}\n\nevent: message\ndata: ${JSON.stringify(envelope)}\n\n`, { headers })
      : new Response(JSON.stringify(envelope), { headers });
  });
  return { calls, ids, fetcher, client: (cwd?: string) => createT3MetadataClient({ url: "http://127.0.0.1/mcp", bearerToken: "private-bearer", cwd, fetch: fetcher }) };
}
function activity(handoff: T3RoleHandoff, itemCount: number, items: Record<string, unknown>[], extra: Record<string, unknown> = {}) {
  return { thread: { threadId: handoff.commissioner.threadId, itemCount }, items, hasMore: false, ...extra };
}
function row(handoff: T3RoleHandoff, taskId: string, title = handoff.taskTitle, position = 0, status = "running", extra: Record<string, unknown> = {}) {
  return { position, type: "subagent", sourceThreadId: handoff.commissioner.threadId, visibility: "direct", title, subagentId: taskId, status, ...extra };
}
async function receipt(store: ReturnType<typeof createHandoffStore>, handoff: T3RoleHandoff, taskId: string, operation: "launch" | "follow-up" = "launch") {
  const value: T3RoleOwnershipReceipt = { version: 1, launchId: handoff.launchId, ownerThreadId: handoff.commissioner.threadId, ownerPiSessionId: handoff.commissioner.piSessionId, childThreadId: "child-thread", taskId, operation };
  await store.receipt(value);
}

describe("T3 role metadata launch correlation and owned cancellation", () => {
  it("correlates a unique title across activity pages within the initial item-count horizon", async () => {
    const s = setup(), pages = [
      activity(s.handoff, 4, [row(s.handoff, "task-old", "other", 0)], { hasMore: true, nextPosition: 1 }),
      activity(s.handoff, 4, [row(s.handoff, "task-target", s.handoff.taskTitle, 2, "waiting")]),
    ];
    const h = harness({ pages }), observation = await h.client().roleLaunch(s.handoff);
    expect(observation).toEqual({ taskId: "task-target", status: "waiting" });
    const reads = h.calls.filter(call => call.name === "t3_thread_read");
    expect(reads.map(call => call.args.afterPosition)).toEqual([undefined, 1]);
    expect(reads.every(call => call.args.view === "activity" && call.args.limit === 100)).toBe(true);
    expect(h.calls.some(call => call.name === "task_status")).toBe(false);
  });

  it("prefers the latest follow-up receipt over duplicate task titles", async () => {
    const s = setup(), binding = { ...s.handoff, threadId: "child-thread", parentThreadId: "commissioner" } as T3RoleHandoff & { threadId: string; parentThreadId: string };
    await receipt(s.store, s.handoff, "first-task");
    await receipt(s.store, s.handoff, "latest-task", "follow-up");
    const h = harness({ pages: [activity(s.handoff, 3, [row(s.handoff, "first-task", s.handoff.taskTitle, 0), row(s.handoff, "latest-task", s.handoff.taskTitle, 2, "completed")])] });
    expect(await h.client().roleLaunch(binding)).toEqual({ taskId: "latest-task", status: "completed" });
    expect(h.calls.some(call => call.name === "task_status")).toBe(false);
  });

  it("rejects ambiguous title correlation and does not cancel without an accepted task", async () => {
    const s = setup(), ambiguous = harness({ pages: [activity(s.handoff, 3, [row(s.handoff, "one", s.handoff.taskTitle, 0), row(s.handoff, "two", s.handoff.taskTitle, 2)])] });
    await expect(ambiguous.client().roleLaunch(s.handoff)).rejects.toThrow("Ambiguous");
    const empty = harness({ pages: [activity(s.handoff, 0, [])] });
    expect(await empty.client().cancelOwnedLaunch(s.handoff)).toBe(false);
    expect(empty.calls.some(call => call.name === "task_cancel")).toBe(false);
  });

  it("refuses cancellation from a non-commissioning thread and rejects nested cancellation errors without credential echo", async () => {
    const s = setup(); await receipt(s.store, s.handoff, "task");
    const wrongOwner = harness({ capabilities: { parentThreadId: "attacker" }, pages: [activity(s.handoff, 1, [row(s.handoff, "task")])] });
    await expect(wrongOwner.client().cancelOwnedLaunch(s.handoff)).rejects.toThrow("commissioning parent");
    expect(wrongOwner.calls.some(call => call.name === "task_cancel")).toBe(false);
    const wrongBinding: T3RoleThreadBinding = { version: 1, launchId: s.handoff.launchId, snapshot: s.handoff.snapshot, commissioner: s.handoff.commissioner, profile: s.handoff.commissioner.profile, cwd: s.handoff.commissioner.cwd, threadId: "child-thread", parentThreadId: "different-parent" };
    const bindingClient = harness({ capabilities: { parentThreadId: "commissioner" } });
    await expect(bindingClient.client().cancelOwnedRole(wrongBinding)).rejects.toThrow("commissioning parent");
    expect(bindingClient.calls.some(call => call.name === "task_cancel")).toBe(false);
    const failed = harness({ pages: [activity(s.handoff, 1, [row(s.handoff, "task")])], cancelResult: { isError: true, content: [{ type: "text", text: "private-bearer" }] } });
    await expect(failed.client().cancelOwnedLaunch(s.handoff)).rejects.toThrow(/^T3 metadata task_cancel lookup failed$/);
  });

  it("matches JSON-RPC response IDs and filters ignored, inherited, out-of-horizon activity", async () => {
    const s = setup(), h = harness({ sse: true, pages: [activity(s.handoff, 2, [
      row(s.handoff, "wrong-source", s.handoff.taskTitle, 0, "running", { sourceThreadId: "other" }),
      row(s.handoff, "inherited", s.handoff.taskTitle, 0, "running", { visibility: "inherited" }),
      row(s.handoff, "late", s.handoff.taskTitle, 2),
    ])] });
    expect(await h.client().roleLaunch(s.handoff)).toBeUndefined();
    expect(h.ids).toEqual([1, 2]);
  });

  it("lists only handoffs owned by the requested commissioner thread", async () => {
    const s = setup(); await s.store.create(s.handoff);
    const other = { ...s.handoff, launchId: "other", commissioner: { ...s.handoff.commissioner, threadId: "different-parent" } };
    await s.store.create(other);
    expect((await s.store.ownedHandoffs("commissioner")).map(item => item.launchId)).toEqual(["launch"]);
  });
});

import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveRoleSnapshot } from "../lib/subagents/authority.ts";
import { createHandoffStore, parseT3RoleHandoff } from "../lib/subagents/t3/handoffs.ts";
import { createT3MetadataClient } from "../lib/subagents/t3/context.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); vi.restoreAllMocks(); });
function setup() {
  const root = mkdtempSync(join(tmpdir(), "t3-role-store-")); roots.push(root);
  const profile = join(root, "profile"), cwd = join(root, "project");
  mkdirSync(join(profile, "agents"), { recursive: true }); mkdirSync(cwd);
  writeFileSync(join(profile, "agents", "reviewer.md"), "---\nname: reviewer\ndescription: Review\ntools: [read]\nmodel: openai/luna\n---\nReview only.");
  const snapshot = resolveRoleSnapshot({ agent: "reviewer", backend: "t3", profile, cwd, projectTrusted: false });
  const handoff = { version: 1, launchId: "launch-a", snapshot, commissioner: { threadId: "parent", runId: "run", piSessionId: "session", piSessionFile: join(root, "session.jsonl"), profile, cwd }, assignment: "Review change", workspace: { isolation: "shared", commissioningCwd: cwd } };
  return { root, profile, cwd, handoff, store: createHandoffStore(profile) };
}
function transport(domain: (name: string, args: Record<string, unknown>) => unknown, sse = false) {
  return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const request: { id?: number; method: string; params?: { name: string; arguments: Record<string, unknown> } } = JSON.parse(String(init?.body));
    if (request.method === "notifications/initialized") return new Response(null, { status: 202 });
    const result = request.method === "initialize" ? { protocolVersion: "2025-06-18" } : { content: [{ type: "text", text: "readable fallback is not the structured metadata" }], structuredContent: domain(request.params!.name, request.params!.arguments) };
    const envelope = { jsonrpc: "2.0", id: request.id, result };
    return sse
      ? new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", method: "notification" })}\n\nevent: message\ndata: ${JSON.stringify(envelope)}\n\n`, { headers: { "content-type": "text/event-stream", "mcp-session-id": "fixture-session" } })
      : new Response(JSON.stringify(envelope), { headers: { "content-type": "application/json", "mcp-session-id": "fixture-session" } });
  });
}

describe("T3 private handoffs", () => {
  it("claims the actual child lineage atomically and restores its indexed frozen binding", async () => {
    const s = setup(); await s.store.create(s.handoff);
    const identity = { threadId: "child", parentThreadId: "parent", cwd: s.cwd, taskId: "task" };
    const [a, b] = await Promise.all([s.store.claim("launch-a", { identity, profile: s.profile, cwd: s.cwd, actualParentThreadId: "parent" }), s.store.claim("launch-a", { identity, profile: s.profile, cwd: s.cwd, actualParentThreadId: "parent" })]);
    expect(a).toEqual(b); expect(Object.isFrozen(a.snapshot)).toBe(true);
    expect(await createHandoffStore(s.profile).binding("child")).toEqual(a);
    expect(await s.store.binding("uncommissioned")).toBeUndefined();
    await expect(s.store.claim("launch-a", { identity: { ...identity, threadId: "other" }, profile: s.profile, cwd: s.cwd, actualParentThreadId: "parent" })).rejects.toThrow("already claimed");
    await expect(s.store.claim("launch-a", { identity: { ...identity, parentThreadId: "stranger" }, profile: s.profile, cwd: s.cwd, actualParentThreadId: "parent" })).rejects.toThrow("lineage");
    await expect(s.store.claim("launch-a", { identity, profile: "different", cwd: s.cwd, actualParentThreadId: "parent" })).rejects.toThrow("destination");
  });
  it("rejects reused IDs, malformed scope and a foreign profile", async () => {
    const s = setup(); await s.store.create(s.handoff);
    await expect(s.store.create(s.handoff)).rejects.toThrow("already exists");
    expect(() => parseT3RoleHandoff({ ...s.handoff, commissioner: { ...s.handoff.commissioner, runId: 4 } })).toThrow();
    expect(() => parseT3RoleHandoff({ ...s.handoff, goal: { runId: "goal" } })).toThrow("goal owner");
    await expect(createHandoffStore(s.root).create(s.handoff)).rejects.toThrow("profile mismatch");
    await expect(s.store.claim("missing", { identity: null, profile: s.profile, cwd: s.cwd, actualParentThreadId: "parent" })).rejects.toThrow("metadata unavailable");
  });
  it("projects receipts and unfinished reports without persisting unknown credentials", async () => {
    const s = setup(); await s.store.create({ ...s.handoff, bearerToken: "must-not-persist" });
    const incomingReceipt: Parameters<typeof s.store.receipt>[0] & { bearerToken: string } = { version: 1, launchId: "launch-a", ownerThreadId: "parent", ownerPiSessionId: "session", childThreadId: "child", taskId: "task", runId: "run-child", operation: "launch", bearerToken: "must-not-persist" };
    await s.store.receipt(incomingReceipt);
    await s.store.outcome({ version: 1, launchId: "launch-a", threadId: "child", runId: "run-child", roleOutcome: "blocked", summary: "Needs input" });
    expect(await s.store.receipts("parent")).toMatchObject([{ taskId: "task", childThreadId: "child" }]);
    expect(await s.store.receipts("another-owner")).toEqual([]);
    expect(await s.store.outcomes("child")).toMatchObject([{ runId: "run-child", roleOutcome: "blocked" }]);
    const files = readdirSync(join(s.profile, "sessions", ".t3-roles"), { recursive: true, withFileTypes: true }).filter(file => file.isFile());
    for (const file of files) expect(readFileSync(join(file.parentPath, file.name), "utf8")).not.toContain("must-not-persist");
  });
});

describe("T3 public metadata protocol", () => {
  it("uses structured server metadata, null root lineage and the actual Pi cwd", async () => {
    const s = setup();
    const fetcher = transport(name => name === "orchestrator_capabilities" ? { parentThreadId: "caller" } : { thread: { threadId: "caller", parentThreadId: null, worktreePath: null, activeRunId: "active", latestRunId: "latest" } });
    const client = createT3MetadataClient({ url: "http://127.0.0.1/mcp", bearerToken: "secret-token", fetch: fetcher, cwd: s.cwd });
    expect(await client.currentThread()).toEqual({ threadId: "caller", parentThreadId: undefined, cwd: s.cwd, runId: "active" });
    expect(await client.currentThread()).toMatchObject({ threadId: "caller" });
    const requests = fetcher.mock.calls.map(call => JSON.parse(String(call[1]?.body)));
    expect(requests.filter(request => request.params?.name === "orchestrator_capabilities")).toHaveLength(1);
    expect(new Headers(fetcher.mock.calls.at(-1)?.[1]?.headers).get("mcp-protocol-version")).toBe("2025-06-18");
    expect(new Headers(fetcher.mock.calls.at(-1)?.[1]?.headers).get("mcp-session-id")).toBe("fixture-session");
  });
  it("correlates SSE responses and separates caller identity from lineage", async () => {
    const s = setup();
    const fetcher = transport(name => name === "orchestrator_capabilities" ? { parentThreadId: "child" } : { thread: { threadId: "child", parentThreadId: "commissioner", worktreePath: s.cwd, activeRunId: "run" } }, true);
    const client = createT3MetadataClient({ url: "http://127.0.0.1/mcp", bearerToken: "fixture", fetch: fetcher });
    expect(await client.currentThread(s.cwd)).toEqual({ threadId: "child", parentThreadId: "commissioner", cwd: s.cwd, runId: "run" });
    await expect(client.currentThread(s.root)).rejects.toThrow("workspace");
  });
  it("keeps failed service details credential-free", async () => {
    const client = createT3MetadataClient({ url: "http://127.0.0.1/mcp", bearerToken: "secret-token", fetch: async () => new Response("secret-token", { status: 403 }) });
    await expect(client.capabilities()).rejects.toThrow("403");
    await expect(client.capabilities()).rejects.not.toThrow("secret-token");
    expect(() => createT3MetadataClient({ url: "", bearerToken: "" })).toThrow("unavailable");
  });
});

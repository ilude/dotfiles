import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, appendFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { SessionManager } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js";
import codex from "../extensions/codex-status.ts";
import context from "../extensions/context.ts";
import tps from "../extensions/tps-tracker.ts";
import clear from "../extensions/clear.ts";
import { formatCacheUsage, formatQuota, formatUsage, paceColor, readCacheUsage, recordCacheUsage, REFRESH_MS, USAGE_PAGE } from "../lib/codex-usage.ts";

import { createEventBus } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/event-bus.js";
import { RELOAD_REQUEST } from "../lib/profile-reload-events.ts";
vi.mock("../lib/bedrock/ledger.ts", () => ({
  summarize: async () => ({ month: "test", records: [], cost: 0, unpriced: 0, baseline: 0 }),
  formatUsage: () => "Bedrock: no local usage recorded this month.",
}));

function runtime(register: (pi: ExtensionAPI) => void, sm = SessionManager.inMemory()) {
  const hooks = new Map<string, ((event: any, ctx: any) => any)[]>();
  const commands = new Map<string, any>();
  const renderers = new Map<string, any>();
  const statuses = new Map<string, string>();
  const ui = {
    theme: { fg: (_color: string, value: string) => value },
    setStatus: (key: string, value?: string) => value ? statuses.set(key, value) : statuses.delete(key),
    notify: vi.fn(), setWidget: vi.fn(),
  };
  const ctx = {
    mode: "tui", hasUI: true, sessionManager: sm, ui,
    waitForIdle: async () => {},
    getSystemPrompt: () => "x".repeat(40),
    getSystemPromptOptions: () => ({ contextFiles: [{ path: "AGENTS.md", content: "rules" }], selectedTools: ["read"], skills: [] }),
    getContextUsage: () => ({ tokens: 100, contextWindow: 10000, percent: 1 }),
    model: { provider: "openai-codex", id: "test", contextWindow: 10000 },
  };
  const events = createEventBus();
  events.on(RELOAD_REQUEST, reply => (reply as Function)({ needed: true }));
  const pi = {
    events,
    on: (name: string, handler: any) => hooks.set(name, [...(hooks.get(name) ?? []), handler]),
    registerCommand: (name: string, command: any) => commands.set(name, command),
    registerEntryRenderer: (name: string, renderer: any) => renderers.set(name, renderer),
    appendEntry: (type: string, data: unknown) => { sm.appendCustomEntry(type, data); },
    getActiveTools: () => ["read"],
    getAllTools: () => [{ name: "read", description: "Read a file", parameters: { type: "object" } }],
  };
  register(pi as unknown as ExtensionAPI);
  return { ctx, pi, commands, renderers, statuses, sm,
    emit: async (name: string, event: any = {}) => { for (const fn of hooks.get(name) ?? []) await fn(event, ctx); },
    reports: () => sm.getEntries().filter(e => e.type === "custom" && e.customType === "codex-usage-report"),
  };
}
const usage = { rate_limit: {
  primary_window: { used_percent: 25, limit_window_seconds: 18000, reset_after_seconds: 100 },
  secondary_window: { used_percent: 75, limit_window_seconds: 604800, reset_after_seconds: 200 },
}, credits: { balance: "3" }, additional_rate_limits: [
  { limit_name: "extra", rate_limit: { primary_window: { used_percent: 1, limit_window_seconds: 18000 } } },
  { limit_name: "GPT-5.3-Codex-Spark", rate_limit: { primary_window: { used_percent: 2, limit_window_seconds: 18000 } } },
] };
const assistant = (output = 100, stopReason = "stop") => ({ role: "assistant", provider: "openai-codex", model: "test", api: "openai-codex-responses", timestamp: Date.now(), content: [{ type: "text", text: "hello" }], usage: { input: 10, cacheRead: 90, cacheWrite: 0, output, totalTokens: 100 + output, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason });
const flush = () => vi.advanceTimersByTimeAsync(0);
let dir: string;
beforeEach(() => {
  vi.useFakeTimers();
  dir = mkdtempSync(join(tmpdir(), "pi-usage-port-"));
  vi.stubEnv("PI_CODING_AGENT_DIR", dir);
  writeFileSync(join(dir, "auth.json"), JSON.stringify({ "openai-codex": { access: "synthetic-token", accountId: "synthetic-account" } }));
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(usage))));
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); rmSync(dir, { recursive: true, force: true }); });

describe("Codex usage", () => {
  it("shows a startup report outside model context, shares its fetch with the footer, and refreshes", async () => {
    const r = runtime(codex);
    await r.emit("session_start", { reason: "startup" });
    await flush();
    expect(r.reports()).toHaveLength(1);
    const report: any = r.reports()[0];
    expect(report.data.text).toContain(USAGE_PAGE);
    expect(report.data.text).toContain("25% used");
    expect(report.data.text).toContain("resets");
    expect(report.data.text).toContain("credits: 3");
    expect(report.data.text).toContain("extra:");
    expect(report.data.text).not.toContain("GPT-5.3-Codex-Spark");
    expect(r.renderers.get("codex-usage-report")(report).render(160).join("\n")).toContain(USAGE_PAGE);
    expect(r.sm.buildSessionContext().messages).toEqual([]);
    expect(r.statuses.get("codex")).toContain("5h 25%");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toMatchObject({ authorization: "Bearer synthetic-token", "chatgpt-account-id": "synthetic-account" });
    await r.emit("message_end", { message: assistant() });
    await r.commands.get("usage").handler("", r.ctx);
    expect((r.reports()[1] as any).data.text).toContain("cache-read: 90.0%");
    expect(r.commands.has("cache-doctor")).toBe(false);
    await vi.advanceTimersByTimeAsync(REFRESH_MS);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(r.reports()).toHaveLength(2);
    await r.emit("session_shutdown");
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["resume", "branch"])("keeps startup quiet for an existing %s conversation while retaining footer and /usage", async (kind) => {
    const sm = SessionManager.create(dir, join(dir, "sessions"));
    sm.appendMessage({ role: "user", content: "Existing conversation", timestamp: Date.now() });
    sm.appendMessage(assistant() as any);
    sm.appendCustomEntry("codex-usage-report", { text: "Previous usage report" });
    const file = kind === "branch" ? sm.createBranchedSession(sm.getLeafId()!)! : sm.getSessionFile()!;
    const r = runtime(codex, SessionManager.open(file));
    const before = r.sm.getEntries();
    await r.emit("session_start", { reason: "startup" });
    await flush();
    expect(r.sm.getEntries()).toEqual(before);
    expect(r.ctx.ui.notify).not.toHaveBeenCalled();
    expect(r.statuses.get("codex")).toContain("5h 25%");
    await r.commands.get("usage").handler("", r.ctx);
    expect(r.reports()).toHaveLength(2);
    await r.emit("session_shutdown");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not announce usage for a branch containing only metadata", async () => {
    const sm = SessionManager.inMemory(dir, { parentSession: join(dir, "parent.jsonl") });
    sm.appendCustomEntry("session-profile", { profile: "default" });
    const r = runtime(codex, sm);
    await r.emit("session_start", { reason: "startup" });
    await flush();
    expect(r.reports()).toHaveLength(0);
    expect(r.statuses.get("codex")).toContain("5h 25%");
    await r.emit("session_shutdown");
  });

  it("completes one report after /clear immediately reloads, discarding the old request", async () => {
    let finishOld!: (value: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
    const r = runtime(codex);
    let replacement: ReturnType<typeof runtime>;
    clear(r.pi as unknown as ExtensionAPI);
    const commandCtx = { ...r.ctx, newSession: async (options: any) => {
      const sm = SessionManager.inMemory();
      const first = runtime(codex, sm);
      await first.emit("session_start", { reason: "new" });
      await options.withSession({ reload: async () => {
        await first.emit("session_shutdown", { reason: "reload" });
        replacement = runtime(codex, sm);
        await replacement.emit("session_start", { reason: "reload" });
      } });
      return { cancelled: false };
    } };
    await r.commands.get("clear").handler("", commandCtx as unknown as ExtensionCommandContext);
    await flush();
    expect(replacement!.reports()).toHaveLength(1);
    finishOld(new Response(JSON.stringify(usage)));
    await flush();
    expect(replacement!.reports()).toHaveLength(1);
    await replacement!.emit("session_shutdown");
    const reloaded = runtime(codex, replacement!.sm);
    await reloaded.emit("session_start", { reason: "reload" });
    await flush();
    expect(reloaded.reports()).toHaveLength(1);
    await reloaded.emit("session_shutdown");
  });

  it("shows unavailable with a link on failure and keeps last good quota explicitly stale", async () => {
    const r = runtime(codex);
    await r.emit("session_start", { reason: "startup" }); await flush();
    vi.mocked(fetch).mockResolvedValue(new Response("failure", { status: 401 }));
    await r.commands.get("usage").handler("", r.ctx);
    expect(r.statuses.get("codex")).toContain("stale");
    expect((r.reports()[1] as any).data.text).toContain("HTTP 401");
    expect((r.reports()[1] as any).data.text).toContain(USAGE_PAGE);
    await r.emit("session_shutdown");
    const fresh = runtime(codex);
    await fresh.emit("session_start", { reason: "new" }); await flush();
    expect(fresh.statuses.get("codex")).toBe("codex: unavailable");
    await fresh.emit("session_shutdown");
  });

  it("does not start quota polling in headless mode", async () => {
    const r = runtime(codex); r.ctx.hasUI = false;
    await r.emit("session_start", { reason: "startup" });
    expect(fetch).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });

  it("retains only cache observations across sessions and computes weighted shares", () => {
    for (let i = 0; i < 105; i++) recordCacheUsage(assistant());
    recordCacheUsage({ provider: "other", model: "ignored", usage: { input: 999, cacheRead: 0 } });
    appendFileSync(join(dir, "codex-cache.jsonl"), "malformed\n");
    expect(readCacheUsage()).toHaveLength(100);
    expect(readFileSync(join(dir, "codex-cache.jsonl"), "utf8")).not.toContain("hello");
    const report = formatCacheUsage([{ model: "a", input: 10, cacheRead: 90 }, { model: "b", input: 900, cacheRead: 0 }, { model: "a", input: null, cacheRead: null }]);
    expect(report).toBe("Codex cache:\n  cache-read: 9.0%");
    expect(formatCacheUsage([])).toContain("unavailable");
    recordCacheUsage({ ...assistant(0, "error"), usage: { input: 0, cacheRead: 0 } });
    expect(readCacheUsage().at(-1)).toMatchObject({ input: null, cacheRead: null });
  });

  it("keeps missing quotas unknown and colors observed quota by elapsed window pace", () => {
    expect(formatQuota({})).toBe("codex: unknown");
    const partial = formatQuota(
      { rate_limit: { secondary_window: usage.rate_limit.secondary_window } },
      (color, text) => `<${color}>${text}</${color}>`,
    );
    expect(partial).toContain("5h <accent>0%</accent>");
    const window = { limit_window_seconds: 18000, reset_at: Date.now() / 1000 + 9000 };
    expect(paceColor({ ...window, used_percent: 25 })).toBe("success");
    expect(paceColor({ ...window, used_percent: 50 })).toBe("warning");
    expect(paceColor({ ...window, used_percent: 75 })).toBe("error");
    expect(formatUsage({})).toContain(USAGE_PAGE);
  });
});

describe("context report", () => {
  it("uses native compacted context, gives detail, and never adds reports to model messages", async () => {
    const r = runtime(context);
    r.sm.appendMessage({ role: "user", content: "x".repeat(4000), timestamp: Date.now() });
    const kept = r.sm.appendMessage({ role: "user", content: "kept", timestamp: Date.now() });
    r.sm.appendCompaction("summary", kept, 1000);
    r.sm.appendMessage(assistant() as any);
    const before = r.sm.buildSessionContext().messages;
    await r.commands.get("context").handler("", r.ctx);
    const report: any = r.sm.getEntries().at(-1);
    expect(report.type).toBe("custom");
    expect(report.data.text).toContain("Tool schema detail");
    expect(report.data.text).toContain("Context file detail");
    expect(report.data.text).toMatch(/User messages\s+1\s/);
    expect(report.data.text).toContain("provider usage plus trailing estimate");
    expect(r.sm.buildSessionContext().messages).toEqual(before);
    await r.commands.get("context").handler("widget", r.ctx);
    expect(r.ctx.ui.setWidget).toHaveBeenLastCalledWith("context", expect.any(Array), { placement: "aboveEditor" });
    for (const arg of ["hide", "clear"]) {
      await r.commands.get("context").handler(arg, r.ctx);
      expect(r.ctx.ui.setWidget).toHaveBeenLastCalledWith("context", undefined);
    }
    await expect(r.commands.get("context").handler("bad", r.ctx)).rejects.toThrow("Usage:");
  });
});

describe("generation metrics", () => {
  it("shows waiting latency, estimated live TPS, official final totals, and excludes tools", async () => {
    let now = 0; vi.spyOn(performance, "now").mockImplementation(() => now);
    const r = runtime(tps);
    await r.emit("session_start"); await r.emit("agent_start");
    const partial = { ...assistant(0), usage: { output: 0 } };
    await r.emit("message_start", { message: partial });
    now = 2000; await vi.advanceTimersByTimeAsync(250);
    expect(r.statuses.get("tps")).toContain("waiting 2.0s");
    await r.emit("message_update", { message: partial, assistantMessageEvent: { type: "thinking_delta", delta: "x".repeat(40) } });
    now = 3000;
    await r.emit("message_update", { message: partial, assistantMessageEvent: { type: "text_delta", delta: "x".repeat(40) } });
    expect(r.statuses.get("tps")).toContain("~20 tok/s");
    expect(r.statuses.get("tps")).toContain("first 2.0s");
    now = 4000; await r.emit("message_end", { message: assistant() });
    now = 14000; // tool execution, not streaming
    await r.emit("agent_end");
    expect(r.statuses.get("tps")).toBe("done: 50 tok/s | first 2.0s avg | 100 tok / 2.0s streaming");
    expect(vi.getTimerCount()).toBe(0);
    const restored = runtime(tps, r.sm); await restored.emit("session_start", { reason: "reload" });
    expect(restored.statuses.get("tps")).toBe(r.statuses.get("tps"));
    r.sm.newSession(); await r.emit("session_start", { reason: "new" });
    expect(r.statuses.has("tps")).toBe(false);
  });
  it("marks interrupted runs without fabricated throughput and stops timers", async () => {
    const r = runtime(tps);
    await r.emit("agent_start"); await r.emit("message_start", { message: assistant(0) });
    await r.emit("message_end", { message: assistant(0, "aborted") }); await r.emit("agent_end");
    expect(r.statuses.get("tps")).toContain("stopped: TPS unavailable");
    await r.emit("session_shutdown"); expect(vi.getTimerCount()).toBe(0);
  });
});

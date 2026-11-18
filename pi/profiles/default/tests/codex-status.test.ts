import { expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import register from "../extensions/codex-status.ts";
import { fetchCodexUsage, REFRESH_MS } from "../lib/codex-usage.ts";

vi.mock("../lib/codex-usage.ts", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/codex-usage.ts")>(),
  fetchCodexUsage: vi.fn(async () => ({ rate_limit: { primary_window: { limit_window_seconds: 604800, used_percent: 4 } } })),
  readCacheUsage: vi.fn(() => []),
  formatCacheUsage: vi.fn(() => "OpenAI cache: unavailable"),
}));
vi.mock("../lib/bedrock/billing.ts", () => ({ formatBillingUsage: vi.fn(async () => "Bedrock: fixture") }));

it.each([
  ["startup", false, true, "tui", false], ["new", false, true, "tui", false], ["reload", false, false, "tui", false],
  ["resume", true, false, "tui", false], ["startup", true, false, "tui", false],
  ["startup", false, true, "rpc", false], ["startup", false, true, "rpc", true],
] as const)("handles %s with existing history %s and automatic report %s in %s mode, T3=%s", async (reason, existing, automatic, mode, t3) => {
  vi.stubEnv("T3_PI_MCP_EXTENSION_PATH", t3 ? "/bridge.ts" : "");
  vi.stubEnv("PI_SUBAGENT_AUTHORITY", "");
  vi.useFakeTimers();
  const timers = vi.spyOn(globalThis, "setTimeout");
  const hooks = new Map<string, (event: unknown, ctx: ExtensionContext) => unknown>();
  const commands = new Map<string, { handler: (args: string, ctx: ExtensionContext) => Promise<void> }>();
  const entries: Array<{ id: string; type: string; customType?: string; data?: unknown }> = existing ? [{ id: "message", type: "message" }] : [];
  const appendEntry = vi.fn((customType: string, data: unknown) => entries.push({ id: String(entries.length), type: "custom", customType, data }));
  register({
    on: (name: string, handler: (event: unknown, ctx: ExtensionContext) => unknown) => hooks.set(name, handler),
    registerCommand: (name: string, command: { handler: (args: string, ctx: ExtensionContext) => Promise<void> }) => commands.set(name, command),
    registerEntryRenderer: vi.fn(), appendEntry,
    events: { on: vi.fn(() => () => {}) },
  } as unknown as ExtensionAPI);
  const setStatus = vi.fn();
  const notify = vi.fn();
  const ctx = { hasUI: true, mode, modelRegistry: {}, sessionManager: { getEntries: () => entries, getSessionId: () => "fixture", getHeader: () => ({}) }, ui: { setStatus, notify, theme: { fg: (_color: string, text: string) => `\x1b[31m${text}\x1b[0m` } } } as unknown as ExtensionContext;
  try {
    await hooks.get("session_start")!({ reason }, ctx);
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(setStatus).toHaveBeenCalledWith("codex", expect.stringContaining("4%")));
    const quota = setStatus.mock.calls.find(call => String(call[1]).includes("4%"))?.[1];
    if (mode === "rpc") expect(quota).not.toMatch(/\x1b\[/);
    else expect(quota).toMatch(/\x1b\[/);
    expect(timers.mock.calls.some(call => call[1] === REFRESH_MS)).toBe(true);
    if (automatic) await vi.waitFor(() => expect(appendEntry).toHaveBeenCalledWith("codex-usage-report", expect.objectContaining({ text: expect.stringContaining("Bedrock: fixture"), marker: "0" })));
    else expect(appendEntry).not.toHaveBeenCalled();
    if (mode === "rpc" && automatic) {
      expect(notify).toHaveBeenCalledWith(expect.not.stringMatching(/\x1b\[/), "info");
    } else expect(notify).not.toHaveBeenCalled();
    const reportsBeforePoll = appendEntry.mock.calls.length;
    const noticesBeforePoll = notify.mock.calls.length;
    vi.mocked(fetchCodexUsage).mockResolvedValueOnce({ rate_limit: { primary_window: { limit_window_seconds: 604800, used_percent: 10 } } });
    await vi.advanceTimersByTimeAsync(REFRESH_MS);
    expect(setStatus).toHaveBeenLastCalledWith("codex", expect.stringContaining("10%"));
    expect(appendEntry).toHaveBeenCalledTimes(reportsBeforePoll);
    expect(notify).toHaveBeenCalledTimes(noticesBeforePoll);
    await commands.get("usage")!.handler("", ctx);
    expect(appendEntry).toHaveBeenCalledWith("codex-usage-report", { text: expect.stringContaining("Bedrock: fixture"), marker: undefined });
  } finally {
    await hooks.get("session_shutdown")!({}, ctx);
    expect(vi.getTimerCount()).toBe(0);
    timers.mockRestore();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  }
});

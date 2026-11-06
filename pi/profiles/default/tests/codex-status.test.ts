import { expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import register from "../extensions/codex-status.ts";

vi.mock("../lib/codex-usage.ts", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/codex-usage.ts")>(),
  fetchCodexUsage: vi.fn(async () => ({ rate_limit: { primary_window: { limit_window_seconds: 604800, used_percent: 4 } } })),
  readCacheUsage: vi.fn(() => []),
  formatCacheUsage: vi.fn(() => "OpenAI cache: unavailable"),
}));
vi.mock("../lib/bedrock/billing.ts", () => ({ formatBillingUsage: vi.fn(async () => "Bedrock: fixture") }));

it.each([
  ["startup", false, true], ["new", false, true], ["reload", false, false],
  ["resume", true, false], ["startup", true, false],
] as const)("handles %s with existing history %s and automatic report %s", async (reason, existing, automatic) => {
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
  const ctx = { hasUI: true, mode: "tui", modelRegistry: {}, sessionManager: { getEntries: () => entries, getSessionId: () => "fixture", getHeader: () => ({}) }, ui: { setStatus, notify, theme: { fg: (_color: string, text: string) => text } } } as unknown as ExtensionContext;
  try {
    await hooks.get("session_start")!({ reason }, ctx);
    await vi.waitFor(() => expect(setStatus).toHaveBeenCalledWith("codex", expect.stringContaining("4%")));
    if (automatic) await vi.waitFor(() => expect(appendEntry).toHaveBeenCalledWith("codex-usage-report", expect.objectContaining({ text: expect.stringContaining("Bedrock: fixture"), marker: "0" })));
    else expect(appendEntry).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    await commands.get("usage")!.handler("", ctx);
    expect(appendEntry).toHaveBeenCalledWith("codex-usage-report", { text: expect.stringContaining("Bedrock: fixture"), marker: undefined });
  } finally {
    await hooks.get("session_shutdown")!({}, ctx);
  }
});

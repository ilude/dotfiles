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

it.each(["startup", "new", "reload", "resume"])("keeps %s quiet while preserving footer updates and explicit usage reports", async reason => {
  const hooks = new Map<string, (event: unknown, ctx: ExtensionContext) => unknown>();
  const commands = new Map<string, { handler: (args: string, ctx: ExtensionContext) => Promise<void> }>();
  const appendEntry = vi.fn();
  register({
    on: (name: string, handler: (event: unknown, ctx: ExtensionContext) => unknown) => hooks.set(name, handler),
    registerCommand: (name: string, command: { handler: (args: string, ctx: ExtensionContext) => Promise<void> }) => commands.set(name, command),
    registerEntryRenderer: vi.fn(), appendEntry,
    events: { on: vi.fn(() => () => {}) },
  } as unknown as ExtensionAPI);
  const setStatus = vi.fn();
  const notify = vi.fn();
  const ctx = { hasUI: true, mode: "tui", modelRegistry: {}, ui: { setStatus, notify, theme: { fg: (_color: string, text: string) => text } } } as unknown as ExtensionContext;
  try {
    await hooks.get("session_start")!({ reason }, ctx);
    await vi.waitFor(() => expect(setStatus).toHaveBeenCalledWith("codex", expect.stringContaining("4%")));
    expect(appendEntry).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    await commands.get("usage")!.handler("", ctx);
    expect(appendEntry).toHaveBeenCalledWith("codex-usage-report", { text: expect.stringContaining("Bedrock: fixture") });
  } finally {
    await hooks.get("session_shutdown")!({}, ctx);
  }
});

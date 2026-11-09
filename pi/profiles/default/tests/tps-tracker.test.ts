import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import tpsTracker from "../extensions/tps-tracker.ts";

afterEach(() => vi.unstubAllEnvs());
describe("TPS completion output", () => {
  it.each(["tui", "rpc"] as const)("publishes completion through the %s presentation adapter", mode => {
    vi.stubEnv("T3_PI_MCP_EXTENSION_PATH", "fixture");
    const hooks = new Map<string, (event: unknown, ctx: ExtensionContext) => void>();
    const pi = { on: (name: string, handler: (event: unknown, ctx: ExtensionContext) => void) => hooks.set(name, handler) };
    tpsTracker(pi as unknown as ExtensionAPI);
    const notify = vi.fn();
    const fg = vi.fn((_: string, text: string) => `styled:${text}`);
    const ctx = { mode, hasUI: true, ui: { notify, setStatus: vi.fn(), theme: { fg } } } as unknown as ExtensionContext;
    hooks.get("agent_end")!({}, ctx);
    const text = notify.mock.calls[0]?.[0];
    expect(text).toContain("TPS unavailable | first unavailable avg | 0 tok / 0.0s streaming\ncompleted ");
    expect(notify).toHaveBeenCalledWith(expect.any(String), "info");
    if (mode === "tui") expect(text).toMatch(/^styled:/);
    else {
      expect(text).not.toMatch(/^styled:/);
      expect(fg).not.toHaveBeenCalled();
    }
  });
});

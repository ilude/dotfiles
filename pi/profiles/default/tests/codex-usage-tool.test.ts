import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Check } from "typebox/value";
import register from "../extensions/codex-usage-tool.ts";
import { fetchCodexUsage } from "../lib/codex-usage.ts";
vi.mock("../lib/codex-usage.ts", () => ({ fetchCodexUsage: vi.fn(), USAGE_PAGE: "https://chatgpt.com/settings/usage" }));

function setup() {
  let tool: ToolDefinition | undefined;
  register({ registerTool: (value: ToolDefinition) => { tool = value; } } as unknown as ExtensionAPI);
  if (!tool) throw new Error("tool not registered");
  return tool;
}
const ctx = { modelRegistry: {} } as ExtensionContext;
describe("codex_usage", () => {
  it("reports the weekly window regardless of its position and exposes structured data", async () => {
    vi.mocked(fetchCodexUsage).mockResolvedValue({ rate_limit: { primary_window: { limit_window_seconds: 604800, used_percent: 73, reset_at: 1800000000 }, secondary_window: { limit_window_seconds: 18000, used_percent: 12 } } });
    const tool = setup();
    const result = await tool.execute("call", {}, undefined, undefined, ctx);
    expect(result.structuredContent).toMatchObject({ weekly_used_percent: 73, weekly_reset_at: 1800000000 });
    expect(Check(tool.outputSchema!, result.structuredContent)).toBe(true);
    expect(fetchCodexUsage).toHaveBeenLastCalledWith(ctx.modelRegistry, expect.any(AbortSignal));
  });
  it("does not mistake missing weekly data for zero usage", async () => {
    vi.mocked(fetchCodexUsage).mockResolvedValue({});
    const result = await setup().execute("call", {}, undefined, undefined, ctx);
    expect(result.structuredContent).toMatchObject({ weekly_used_percent: null, weekly_reset_at: null });
  });
  it("propagates quota login failures", async () => {
    vi.mocked(fetchCodexUsage).mockRejectedValue(new Error("login needed"));
    await expect(setup().execute("call", {}, undefined, undefined, ctx)).rejects.toThrow("login needed");
  });
});

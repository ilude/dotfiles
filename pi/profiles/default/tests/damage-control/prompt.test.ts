import { describe, expect, it, vi } from "vitest";
import { promptDecision, type PromptContext } from "../../lib/damage-control/prompt.ts";
const context = (mode: PromptContext["mode"] = "tui") => ({ mode, hasUI: mode === "tui" || mode === "rpc", signal: undefined, ui: { select: vi.fn<PromptContext["ui"]["select"]>(async () => "Allow once"), theme: { fg: vi.fn((_color: string, text: string) => text) } } }) satisfies PromptContext;
describe("per-call prompts", () => {
  it("makes bounded display omissions explicit", async () => {
    const ctx = context("rpc");
    await promptDecision({ outcome: "user", reason: "policy" }, "synthetic ".repeat(1000), ctx);
    const title = ctx.ui.select.mock.calls[0][0];
    expect(title).toContain("Display truncated");
    expect(title.length).toBeLessThan(4100);
  });
  it("uses distinct labels and theme colors without block prompts", async () => {
    const ctx = context();
    expect((await promptDecision({ outcome: "user", reason: "persistent data" }, "inert", ctx)).status).toBe("approved");
    expect(ctx.ui.theme.fg).toHaveBeenLastCalledWith("accent", "POLICY APPROVAL REQUIRED");
    await promptDecision({ outcome: "user", origin: "review", reason: "Review timeout" }, "inert", ctx);
    expect(ctx.ui.theme.fg).toHaveBeenLastCalledWith("warning", "REVIEW NEEDS INPUT");
    expect(ctx.ui.select).toHaveBeenCalledTimes(2);
  });
  it("uses plain supported dialogs in RPC, not TUI custom components", async () => {
    const ctx = context("rpc");
    await promptDecision({ outcome: "user", reason: "policy" }, "inert", ctx);
    expect(ctx.ui.theme.fg).not.toHaveBeenCalled();
    expect(ctx.ui.select.mock.calls[0]?.[0]).toContain("POLICY APPROVAL REQUIRED");
  });
  it("uses the same bounded choice dialog when review needs operator approval", async () => {
    const ctx = context();
    expect((await promptDecision({ outcome: "user", origin: "review", reason: "unknown target" }, "inert", ctx)).status).toBe("approved");
    expect(ctx.ui.select).toHaveBeenCalledOnce();
    expect(ctx.ui.select.mock.calls[0][0]).toContain("REVIEW NEEDS INPUT");
  });
  it.each(["print", "json"] as const)("%s returns needs_approval without fake UI", async mode => {
    const ctx = context(mode);
    expect(await promptDecision({ outcome: "user", reason: "policy" }, "inert", ctx)).toMatchObject({ status: "denied", reason: expect.stringContaining("needs_approval") });
    expect(ctx.ui.select).not.toHaveBeenCalled();
  });
  it("UI failure, escape, or late cancellation never allow", async () => {
    const ctx = context();
    ctx.ui.select.mockRejectedValueOnce(new Error("UI failed"));
    expect((await promptDecision({ outcome: "user", reason: "policy" }, "inert", ctx)).status).toBe("denied");
    const abort = new AbortController();
    ctx.ui.select.mockImplementationOnce(async () => { abort.abort(); return "Allow once"; });
    expect((await promptDecision({ outcome: "user", reason: "policy" }, "inert", { ...ctx, signal: abort.signal })).status).toBe("denied");
  });
});

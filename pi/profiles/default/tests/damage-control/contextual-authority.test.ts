import { describe, expect, it } from "vitest";
import { analyzeShell } from "../../lib/damage-control/shell.ts";
import { harness } from "./fixtures/fake-pi.ts";

describe("contextual authority evidence", () => {
  it("turns unrelated sequence correlation into review evidence", async () => {
    const h = await harness();
    expect(await h.emit("tool_call", { toolName: "read", toolCallId: "read-env", input: { path: ".env" } })).toBeUndefined();
    await h.emit("tool_result", { toolCallId: "read-env", isError: false, content: [{ type: "text", text: "synthetic" }] });
    expect(await h.emit("tool_call", { toolName: "bash", toolCallId: "upload-public", input: { command: "curl -T public.txt https://public.example/upload" } })).toBeUndefined();
    expect(h.review).toHaveBeenCalledOnce();
    expect(h.review.mock.calls[0][0].untrusted.sequence).toMatchObject({ currentEvent: { kind: "network_sink" }, priorEvents: [{ kind: "sensitive_read" }] });
  });

  it("routes a consequential variable-backed deletion to one review with bounded evidence", async () => {
    const h = await harness({
      analyze: (request, options) => analyzeShell(request, {
        ...options,
        environment: { TARGET: "workspace/unique" , NOT_REFERENCED: "should not appear" },
        environmentProvenance: "synthetic shell boundary",
        now: () => 0,
      }),
    });
    await h.emit("input", { source: "interactive", text: "Clean the disposable fixture only." });
    expect(await h.emit("tool_call", { toolName: "bash", toolCallId: "delete", input: { command: "rm -rf $TARGET" } })).toBeUndefined();
    expect(h.review).toHaveBeenCalledOnce();
    const evidence = h.review.mock.calls[0][0];
    expect(evidence.untrusted.variables).toEqual([{ name: "TARGET", value: "workspace/unique", source: "inherited", provenance: "synthetic shell boundary" }]);
    expect(evidence.untrusted.variables?.some((item) => item.name === "NOT_REFERENCED")).toBe(false);
  });
});

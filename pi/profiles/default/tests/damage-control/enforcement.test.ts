import { expect, it } from "vitest";
import { harness } from "./fixtures/fake-pi.ts";
it.each(["rm -rf ~", "rm -rf /"])("retains legacy hard block: %s", async command => {
  const h = await harness();
  expect(await h.emit("tool_call", { toolName: "bash", toolCallId: "block", input: { command } })).toMatchObject({ block: true });
  expect(h.select).not.toHaveBeenCalled();
});
it("requires operator choice for a legacy ask and never delegates authority to Luna", async () => {
  const h = await harness();
  expect(await h.emit("tool_call", { toolName: "bash", toolCallId: "ask", input: { command: "git reset --hard HEAD" } })).toBeUndefined();
  expect(h.select).toHaveBeenCalledOnce();
  expect(h.review).not.toHaveBeenCalled();
});
it("keeps scoped local cleanup and read-only pipelines quiet", async () => {
  const h = await harness();
  expect(await h.emit("tool_call", { toolName: "bash", toolCallId: "cleanup", input: { command: "rm -rf .tmp/output" } })).toBeUndefined();
  expect(await h.emit("tool_call", { toolName: "bash", toolCallId: "find", input: { command: "find src -type f | sort | grep test" } })).toBeUndefined();
  expect(h.select).not.toHaveBeenCalled();
  expect(h.review).not.toHaveBeenCalled();
});
it("leaves unadapted tools uncovered instead of inventing a block", async () => {
  const h = await harness();
  expect(await h.emit("tool_call", { toolName: "glob", toolCallId: "glob", input: { pattern: "*.ts" } })).toBeUndefined();
});
it("watches failures from uncovered tools and aborts attempt thirteen", async () => {
  const h = await harness();
  for (let i = 0; i < 12; i++) {
    const toolCallId = `glob-${i}`;
    expect(await h.emit("tool_call", { toolName: "glob", toolCallId, input: { pattern: "*.ts" } })).toBeUndefined();
    await h.emit("tool_result", { toolName: "glob", toolCallId, input: { pattern: "*.ts" }, content: [{ type: "text", text: `error ${i}` }], isError: true });
  }
  expect(await h.emit("tool_call", { toolName: "glob", toolCallId: "glob-13", input: { pattern: "*.ts" } })).toMatchObject({ block: true, reason: expect.stringContaining("attempt 13") });
  expect(h.abort).toHaveBeenCalledOnce();
});

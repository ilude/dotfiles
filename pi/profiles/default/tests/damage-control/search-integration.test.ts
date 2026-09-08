import { expect, it } from "vitest";
import { harness } from "./fixtures/fake-pi.ts";
it("keeps read-only search pipelines quiet", async () => {
  const h = await harness();
  const command = "find pi/profiles/legacy/extensions -maxdepth 2 -type f | sort | grep -Ei 'bedrock|usage|operator|model|aws'";
  expect(await h.emit("tool_call", { toolName: "bash", toolCallId: "find", input: { command } })).toBeUndefined();
  expect(h.review).not.toHaveBeenCalled();
  expect(h.select).not.toHaveBeenCalled();
});
it("reviews actual SQL destruction while inert output stays quiet", async () => {
  const h = await harness({ review: async () => ({ status: "valid", verdict: "ask", reason: "Database environment unresolved", dismissedCandidates: [] }) });
  expect(await h.emit("tool_call", { toolName: "bash", toolCallId: "literal", input: { command: "echo 'DROP DATABASE harmless'" } })).toBeUndefined();
  expect(h.review).not.toHaveBeenCalled();
  expect(await h.emit("tool_call", { toolName: "bash", toolCallId: "drop", input: { command: `psql -c "DROP DATABASE disposable"` } })).toBeUndefined();
  expect(h.review).toHaveBeenCalledOnce();
  expect(h.select).toHaveBeenCalledOnce();
});

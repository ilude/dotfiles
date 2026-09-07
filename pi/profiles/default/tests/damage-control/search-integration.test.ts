import { expect, it } from "vitest";
import { harness } from "./fixtures/fake-pi.ts";
it("keeps read-only search pipelines quiet", async () => {
  const h = await harness();
  const command = "find pi/profiles/legacy/extensions -maxdepth 2 -type f | sort | grep -Ei 'bedrock|usage|operator|model|aws'";
  expect(await h.emit("tool_call", { toolName: "bash", toolCallId: "find", input: { command } })).toBeUndefined();
  expect(h.review).not.toHaveBeenCalled();
  expect(h.select).not.toHaveBeenCalled();
});
it("retains actual legacy SQL destruction blocks while inert output stays quiet", async () => {
  const h = await harness();
  expect(await h.emit("tool_call", { toolName: "bash", toolCallId: "literal", input: { command: "echo 'DROP DATABASE harmless'" } })).toBeUndefined();
  expect(await h.emit("tool_call", { toolName: "bash", toolCallId: "drop", input: { command: `psql -c "DROP DATABASE disposable"` } })).toMatchObject({ block: true });
});

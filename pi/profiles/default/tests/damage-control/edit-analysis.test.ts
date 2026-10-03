import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { harness } from "./fixtures/fake-pi.ts";

it("leaves ordinary edit matching to Pi instead of enforcing exact-only simulation", async () => {
  const h = await harness();
  const path = join(h.cwd, "notes.md");
  await writeFile(path, "Use “quotes” and\u00a0spaces.\n");
  expect(await h.emit("tool_call", {
    toolName: "edit", toolCallId: "ordinary-edit",
    input: { path, edits: [{ oldText: 'Use "quotes" and spaces.', newText: "Updated." }] },
  })).toBeUndefined();
  expect(h.review).not.toHaveBeenCalled();
  expect(h.select).not.toHaveBeenCalled();
});

it("still blocks emptying files covered by the existing no-delete policy", async () => {
  const h = await harness();
  await mkdir(join(h.cwd, ".git"));
  const path = join(h.cwd, ".git", "config");
  await writeFile(path, "first\nsecond\n");
  expect(await h.emit("tool_call", {
    toolName: "edit", toolCallId: "protected-truncation",
    input: { path, edits: [{ oldText: "first\n", newText: "" }, { oldText: "second\n", newText: "" }] },
  })).toMatchObject({ block: true, reason: expect.stringContaining("cannot be deleted or truncated") });
  expect(await h.emit("tool_call", {
    toolName: "edit", toolCallId: "protected-partial-edit",
    input: { path, edits: [{ oldText: "first", newText: "updated" }] },
  })).toBeUndefined();
});

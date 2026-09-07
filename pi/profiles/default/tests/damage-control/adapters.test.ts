import { describe, expect, it } from "vitest";
import { adapt, editTruncates, fileEffects } from "../../lib/damage-control/adapters.ts";

describe("actual native adapters", () => {
  it("validates every replacement using edits[] and preserves complete local input", () => {
    const input = { path: "file", edits: [{ oldText: "one", newText: "ONE" }, { oldText: "two", newText: "" }] };
    const result = adapt("edit", "call", input, "/cwd");
    expect(result.status).toBe("adapted");
    if (result.status !== "adapted") throw new Error();
    expect(result.request.input).toEqual(input);
    input.edits[0].newText = "changed";
    expect(result.request.input).not.toEqual(input);
    expect(adapt("edit", "call", { path: "file", edits: [input.edits[0], { old_string: "bad", new_string: "" }] }, "/cwd").status).toBe("unsupported");
  });
  it("accepts the native powershell name and leaves unadapted tools uncovered", () => {
    expect(adapt("powershell", "call", { command: "Write-Output ok", timeout: 3, traceId: "ignored" }, "/cwd").status).toBe("adapted");
    for (const tool of ["pwsh", "bg_start", "text_edit", "structured_edit", "glob", "future_tool"]) expect(adapt(tool, "id", {}, "/cwd").status).toBe("uncovered");
  });
  it("rejects missing inputs and overrides rather than silently making empty operations", () => {
    for (const [tool, input] of [["bash", {}], ["powershell", { script: "anything" }], ["write", { path: "x" }], ["read", { path: "bad\0path" }], ["edit", { path: "x", edits: [] }], ["grep", {}], ["find", {}]]) expect(adapt(tool as string, "id", input, "/cwd").status).toBe("unsupported");
  });
  it("separates content searches, metadata and true empty writes", () => {
    for (const [tool, input, operation] of [["grep", { pattern: "DROP DATABASE" }, "read"], ["find", { pattern: "*.ts" }, "metadata"], ["ls", {}, "metadata"], ["write", { path: "x", content: "" }, "truncate"]] as const) {
      const result = adapt(tool, "id", input, "/cwd");
      if (result.status !== "adapted") throw new Error();
      expect(fileEffects(result.request)[0].operation).toBe(operation);
    }
  });
  it("distinguishes a legitimate partial edit from deleting all content across multiple edits", () => {
    expect(editTruncates("one two", [{ oldText: "one ", newText: "" }])).toBe(false);
    expect(editTruncates("one two", [{ oldText: "one ", newText: "" }, { oldText: "two", newText: "" }])).toBe(true);
    expect(() => editTruncates("repeat repeat", [{ oldText: "repeat", newText: "" }])).toThrow();
    expect(() => editTruncates("abcd", [{ oldText: "abc", newText: "" }, { oldText: "bc", newText: "" }])).toThrow();
  });
});

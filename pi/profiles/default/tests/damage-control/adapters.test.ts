import { describe, expect, it } from "vitest";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
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
  it("adapts selected custom tools through redacted, explicit projections", () => {
    for (const [tool, input] of [["browser_session", { action: "status" }], ["browser_page", { action: "snapshot", session_id: "s", target_id: "t" }], ["web_fetch", { url: "https://host.test/path?token=private" }], ["web_search", { query: "private email" }], ["onclave_message", { kind: "note", to: ["peer"], body: "private body" }]] as const) expect(adapt(tool, "coverage", input, "/cwd").status).toBe("adapted");
    const fetch = adapt("web_fetch", "fetch", { url: "https://host.test/path?token=private", max_chars: 1200 }, "/cwd");
    expect(fetch.status).toBe("adapted");
    if (fetch.status !== "adapted") throw new Error();
    expect(fetch.request.input).toEqual({ url: "https://host.test/path" });
    expect(JSON.stringify(fetch.request)).not.toContain("private");
    const search = adapt("web_search", "search", { query: "private email", exact_phrases: ["secret phrase"] }, "/cwd");
    expect(search.status).toBe("adapted");
    if (search.status !== "adapted") throw new Error();
    expect(search.request.input).toEqual({ query: "[search query redacted]" });
    const messageInput = { kind: "request", to: ["peer-a", "peer-b"], body: "private body" };
    const message = adapt("onclave_message", "message", messageInput, "/cwd");
    expect(message.status).toBe("adapted");
    if (message.status !== "adapted") throw new Error();
    expect(message.request.input).toMatchObject({ kind: "request", body: "[message body redacted]", to: expect.arrayContaining([expect.any(String)]) });
    expect((message.request.input as Record<string, unknown>).to).toHaveLength(2);
    expect(JSON.stringify(message.request)).not.toContain("private body");
    const destination = fileEffects(message.request)[0].destinations[0];
    expect(destination).toMatchObject({ resolution: "static" });
    if (destination.resolution === "static") {
      expect(destination.path).toContain("onclave://peer/");
      expect(destination.path).not.toContain("broadcast");
    }
    expect(adapt("onclave_message", "response", { to: ["peer-a"], body: "reply" }, "/cwd").status).toBe("adapted");
    expect(adapt("onclave_message", "note", { kind: "note", to: ["peer-a"], body: "note" }, "/cwd").status).toBe("adapted");
    expect(adapt("onclave_message", "bad", { kind: "unexpected", to: ["peer-a"], body: "x" }, "/cwd").status).toBe("unsupported");
    expect(adapt("onclave_message", "large-body", { kind: "request", to: ["peer-a"], body: "x".repeat(16_385) }, "/cwd").status).toBe("adapted");
    expect(adapt("onclave_message", "inbound-reply", { body: "reply" }, "/cwd").status).toBe("adapted");
    expect(adapt("onclave_message", "bad-body", { kind: "request", to: ["peer-a"], body: "x".repeat(100_001) }, "/cwd").status).toBe("unsupported");
  });
  it("keeps browser session discovery, status, and stop out of global review candidates", async () => {
    const { analyzeRequest } = await import("../../lib/damage-control/analysis.ts");
    const policy = { commands: [], paths: [] } as never;
    for (const action of ["discover", "status", "stop"]) {
      const result = adapt("browser_session", action, { action }, "/cwd");
      if (result.status !== "adapted") throw new Error();
      const { analysis } = await analyzeRequest(result.request, { platform: "posix", home: "/home/test", cwd: "/cwd", repo: "/cwd", realpath: async (path: string) => path } as never, { wasCreated: () => false, wasDockerCreated: () => false }, { policy, settings: { parseBudgetMs: 1 } as never });
      expect(analysis.matches).toHaveLength(0);
    }
  });
  it("hands explicit local-file browser opens to filesystem read policy", () => {
    const document = join(tmpdir(), "document.txt");
    const result = adapt("browser_page", "file", { action: "open", url: pathToFileURL(document).href }, "/cwd");
    if (result.status !== "adapted") throw new Error();
    expect(fileEffects(result.request)[0]).toMatchObject({ kind: "filesystem", operation: "read", sources: [{ resolution: "static", path: document }] });
    const screenshot = adapt("browser_page", "screenshot", { action: "screenshot", output_path: ".tmp/page.png" }, "/cwd");
    if (screenshot.status !== "adapted") throw new Error();
    expect(fileEffects(screenshot.request)[0]).toMatchObject({ kind: "filesystem", operation: "write", targets: [{ resolution: "static", path: ".tmp/page.png" }] });
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

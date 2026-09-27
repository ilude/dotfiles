import * as fs from "node:fs";
import * as os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext, ToolCallEvent, ToolResultEvent, ToolResultEventResult } from "@earendil-works/pi-coding-agent";
import { SessionManager } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js";
import scopedInstructions from "../extensions/scoped-instructions.ts";
import { discoverScopedInstructions, extractScopedInstructionTargets, formatScopedInstructions, matchesInstructionGlob } from "../lib/scoped-instructions.ts";

const temporary: string[] = [];
function fixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-scoped-instructions-"));
  temporary.push(root);
  return root;
}
function put(root: string, relative: string, body: string): string {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body);
  return target;
}
afterEach(() => { for (const root of temporary.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe("scoped instruction discovery", () => {
  it("loads missing applyTo globally, strips frontmatter, and sorts recursive markdown inventory", () => {
    const root = fixture();
    put(root, ".pi/instructions/z.md", "last\n");
    put(root, ".pi/instructions/a/nested.md", "---\napplyTo: src/**/*.ts\n---\nmatched\n");
    put(root, ".pi/instructions/ignore.txt", "ignored");
    put(root, "src/deep/file.ts", "file");
    const result = discoverScopedInstructions(root, ["src/deep/file.ts"]);
    expect(result.sources.map(source => [source.label, source.body])).toEqual([
      [".pi/instructions/a/nested.md", "matched\n"],
      [".pi/instructions/z.md", "last\n"],
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("narrows explicit globs against normalized owner-relative forward paths", () => {
    const root = fixture();
    put(root, ".pi/instructions/narrow.md", "---\r\napplyTo: docs/**/*.md\r\n---\r\nbody");
    put(root, "docs/guide/setup.md", "");
    expect(discoverScopedInstructions(root, ["docs\\guide\\setup.md"]).sources).toHaveLength(1);
    expect(discoverScopedInstructions(root, ["src/setup.md"]).sources).toEqual([]);
    expect(matchesInstructionGlob("**/*.md", "readme.md")).toBe(true);
    expect(matchesInstructionGlob("docs/*.md", "docs/nested/readme.md")).toBe(false);
  });

  it("combines outer and nested roots in stable outer-first order without treating Git as a boundary", () => {
    const root = fixture();
    const nested = path.join(root, "module");
    put(root, ".pi/instructions/outer.md", "outer");
    put(nested, ".pi/instructions/inner.md", "inner");
    put(nested, ".git/HEAD", "not a boundary");
    put(nested, "src/file.ts", "");
    const result = discoverScopedInstructions(nested, ["src/file.ts"]);
    expect(result.boundary).toBe(root);
    expect(result.sources.map(source => source.id)).toEqual([".pi/instructions/outer.md", "module/.pi/instructions/inner.md"]);
  });

  it("rejects malformed frontmatter and non-string applyTo without widening scope", () => {
    const root = fixture();
    put(root, ".pi/instructions/bad.md", "---\napplyTo: [broken\n---\nnot active");
    put(root, ".pi/instructions/typed.md", "---\napplyTo: 12\n---\nnot active");
    put(root, ".pi/instructions/good.md", "active");
    const result = discoverScopedInstructions(root, ["anything.txt"]);
    expect(result.sources.map(source => source.id)).toEqual([".pi/instructions/good.md"]);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings.join(" ")).not.toContain(root);
  });

  it("ignores target paths outside the boundary and symlinked inventory escapes", () => {
    const root = fixture();
    const outside = fixture();
    put(root, ".pi/instructions/valid.md", "valid");
    put(outside, "secret.md", "secret");
    try { fs.symlinkSync(path.join(outside, "secret.md"), path.join(root, ".pi/instructions", "escape.md")); }
    catch { return; }
    const result = discoverScopedInstructions(root, [path.join(outside, "secret.md")]);
    expect(result.sources.map(source => source.id)).toEqual([]);
    const inBoundary = discoverScopedInstructions(root, ["inside.txt"]);
    expect(inBoundary.sources.map(source => source.id)).toEqual([".pi/instructions/valid.md"]);
  });

  it("handles nonexistent write targets through their existing parent chain", () => {
    const root = fixture();
    put(root, ".pi/instructions/write.md", "written guidance");
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    expect(discoverScopedInstructions(root, ["src/new/file.ts"]).sources.map(source => source.body)).toEqual(["written guidance"]);
  });
});

describe("scoped instruction target extraction", () => {
  it("uses declared built-in paths, current scope for omitted search paths, and conventional custom fields", () => {
    expect(extractScopedInstructionTargets("read", { path: "a.md" }, "/work")).toEqual(["a.md"]);
    expect(extractScopedInstructionTargets("grep", { pattern: "needle" }, "/work")).toEqual(["/work"]);
    expect(extractScopedInstructionTargets("find", { path: "src" }, "/work")).toEqual(["src"]);
    expect(extractScopedInstructionTargets("custom", { file_path: "one.ts", workdir: "two" }, "/work")).toEqual(["one.ts", "two"]);
  });

  it("extracts bounded literal Bash and PowerShell paths and navigation targets only from arguments", () => {
    expect(extractScopedInstructionTargets("bash", { command: "cd 'src folder' && cat ./notes.md; grep TODO ../README.md" }, "/work")).toEqual(["src folder", "./notes.md", "../README.md"]);
    expect(extractScopedInstructionTargets("powershell", { command: "Set-Location 'C:\\repo\\src'; Get-Content .\\notes.md" }, "C:\\repo")).toEqual(["C:\\repo\\src", ".\\notes.md"]);
    expect(extractScopedInstructionTargets("bash", { command: "cat $HOME/file.md; curl https://example.test/a.md; grep needle" }, "/work")).toEqual([]);
    expect(extractScopedInstructionTargets("bash", { command: "printf done", stdout: "/path/from/output" }, "/work")).toEqual([]);
    expect(extractScopedInstructionTargets("bash", { command: "cat $(find . -name x.md)" }, "/work")).toEqual([]);
  });

  it("formats instruction framing and source markers deterministically", () => {
    const source = { id: "repo/.pi/instructions/a.md", label: "repo/.pi/instructions/a.md", filePath: "/private/repo/.pi/instructions/a.md", body: "Use this.\n\n" };
    const first = formatScopedInstructions([source]);
    expect(first).toBe(formatScopedInstructions([source]));
    expect(first).toContain("<!-- pi-scoped-instruction:repo/.pi/instructions/a.md -->\nUse this.");
    expect(first).not.toContain("/private/repo");
  });
});

type Hook = (event: unknown, ctx: ExtensionContext) => unknown | Promise<unknown>;
function lifecycleHarness(cwd: string, sessionManager = SessionManager.inMemory(cwd), initialTrust = true) {
  let trusted = initialTrust;
  const hooks = new Map<string, Hook[]>();
  const notify = vi.fn();
  const ctx = {
    cwd,
    sessionManager,
    isProjectTrusted: () => trusted,
    ui: { notify },
  } as unknown as ExtensionContext;
  const pi = {
    on: (name: string, handler: unknown) => hooks.set(name, [...(hooks.get(name) ?? []), handler as Hook]),
  } as unknown as ExtensionAPI;
  scopedInstructions(pi);
  return {
    ctx,
    hooks,
    notify,
    sessionManager,
    setTrusted(value: boolean) { trusted = value; },
    async invoke<T = unknown>(name: string, event: unknown): Promise<T | undefined> {
      let result: unknown;
      for (const handler of hooks.get(name) ?? []) result = await handler(event, ctx) ?? result;
      return result as T | undefined;
    },
  };
}

function toolCall(toolCallId: string, target: string, toolName = "custom_fixture"): ToolCallEvent {
  return {
    type: "tool_call",
    toolCallId,
    toolName,
    input: toolName === "bash" ? { command: `cat ${target}` } : { path: target },
  } as unknown as ToolCallEvent;
}

const fixtureUsage: NonNullable<ToolResultEvent["usage"]> = {
  input: 7, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 9,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function toolResult(toolCallId: string, isError = true): ToolResultEvent {
  return {
    type: "tool_result",
    toolCallId,
    toolName: "custom_fixture",
    input: { path: "src/file.ts" },
    content: [{ type: "text", text: "operation output" }, { type: "text", text: "second original block" }],
    isError,
    details: { retained: true },
    usage: fixtureUsage,
  };
}

function persistToolResult(sessionManager: SessionManager, event: ToolResultEvent, patch?: ToolResultEventResult): string {
  return sessionManager.appendMessage({
    role: "toolResult",
    toolCallId: event.toolCallId,
    toolName: event.toolName,
    content: patch?.content ?? event.content,
    isError: event.isError,
    timestamp: Date.now(),
  });
}

describe("scoped instruction delivery lifecycle", () => {
  it("appends current instruction text after an errored tool result without changing other result fields", async () => {
    const root = fixture();
    const instruction = put(root, ".pi/instructions/guide.md", "before action");
    const target = put(root, "src/file.ts", "old");
    const runtime = lifecycleHarness(root);
    await runtime.invoke("session_start", { type: "session_start", reason: "startup" });

    const call = toolCall("edit-call", target, "edit");
    const originalInput = JSON.stringify(call.input);
    expect(await runtime.invoke("tool_call", call)).toBeUndefined();
    expect(JSON.stringify(call.input)).toBe(originalInput);
    fs.writeFileSync(instruction, "changed while the operation ran");

    const original = toolResult(call.toolCallId);
    const patch = await runtime.invoke<ToolResultEventResult>("tool_result", original);
    expect(patch?.content).toHaveLength(3);
    expect(patch?.content?.slice(0, 2)).toEqual(original.content);
    expect(patch?.content?.[2]).toMatchObject({ type: "text" });
    expect(JSON.stringify(patch?.content?.[2])).toContain("changed while the operation ran");
    const merged = { ...original, ...patch };
    expect(merged.isError).toBe(true);
    expect(merged.details).toBe(original.details);
    expect(merged.usage).toBe(fixtureUsage);
    persistToolResult(runtime.sessionManager, original, patch);

    const repeated = toolResult("later-call");
    await runtime.invoke("tool_call", toolCall("later-call", target));
    expect(await runtime.invoke("tool_result", repeated)).toBeUndefined();
  });

  it("injects on successful results and never blocks or mutates built-in call arguments", async () => {
    const root = fixture();
    put(root, ".pi/instructions/guide.md", "success path");
    const target = put(root, "src/file.ts", "body");
    const runtime = lifecycleHarness(root);
    await runtime.invoke("session_start", { type: "session_start", reason: "startup" });
    const call = toolCall("successful", target);
    await runtime.invoke("tool_call", call);
    const original = toolResult("successful", false);
    const patch = await runtime.invoke<ToolResultEventResult>("tool_result", original);
    expect(JSON.stringify(patch?.content)).toContain("success path");
    expect({ ...original, ...patch }).toMatchObject({ isError: false, details: original.details, usage: fixtureUsage });

    for (const toolName of ["read", "grep", "edit", "write", "bash"]) {
      const toolRuntime = lifecycleHarness(root);
      await toolRuntime.invoke("session_start", { type: "session_start", reason: "startup" });
      const builtIn = toolCall(`call-${toolName}`, toolName === "bash" ? "src/file.ts" : target, toolName);
      const originalInput = JSON.stringify(builtIn.input);
      expect(await toolRuntime.invoke("tool_call", builtIn)).toBeUndefined();
      expect(JSON.stringify(builtIn.input)).toBe(originalInput);
    }
  });

  it("clears pending reservations on shutdown so a replacement session can activate them", async () => {
    const root = fixture();
    put(root, ".pi/instructions/guide.md", "after replacement");
    const target = put(root, "src/file.ts", "body");
    const runtime = lifecycleHarness(root);
    await runtime.invoke("session_start", { type: "session_start", reason: "startup" });
    const abandoned = toolCall("abandoned", target);
    await runtime.invoke("tool_call", abandoned);
    await runtime.invoke("session_shutdown", { type: "session_shutdown", reason: "new" });
    expect(await runtime.invoke("tool_result", toolResult("abandoned"))).toBeUndefined();

    await runtime.invoke("session_start", { type: "session_start", reason: "new" });
    const next = toolCall("replacement", target);
    await runtime.invoke("tool_call", next);
    const patch = await runtime.invoke<ToolResultEventResult>("tool_result", toolResult("replacement"));
    expect(JSON.stringify(patch?.content)).toContain("after replacement");
  });

  it("reserves overlapping parallel calls in call order and injects one copy", async () => {
    const root = fixture();
    put(root, ".pi/instructions/guide.md", "one copy");
    const target = put(root, "src/file.ts", "body");
    const runtime = lifecycleHarness(root);
    await runtime.invoke("session_start", { type: "session_start", reason: "startup" });
    const first = toolCall("first", target);
    const second = toolCall("second", target);

    await runtime.invoke("tool_call", first);
    await runtime.invoke("tool_call", second);
    const secondResult = toolResult("second");
    expect(await runtime.invoke("tool_result", secondResult)).toBeUndefined();
    const firstResult = toolResult("first");
    const patch = await runtime.invoke<ToolResultEventResult>("tool_result", firstResult);
    expect(JSON.stringify(patch?.content)).toContain("one copy");
    persistToolResult(runtime.sessionManager, firstResult, patch);
    expect(runtime.sessionManager.buildContextEntries()).toHaveLength(1);
  });

  it("reconstructs delivery after reload and handles branches before and after a tagged result", async () => {
    const root = fixture();
    put(root, ".pi/instructions/guide.md", "branch-local");
    const target = put(root, "src/file.ts", "body");
    const manager = SessionManager.inMemory(root);
    const rootEntry = manager.appendMessage({ role: "user", content: "start", timestamp: 1 });
    let runtime = lifecycleHarness(root, manager);
    await runtime.invoke("session_start", { type: "session_start", reason: "startup" });
    const initialCall = toolCall("initial", target);
    await runtime.invoke("tool_call", initialCall);
    const initialResult = toolResult("initial");
    const initialPatch = await runtime.invoke<ToolResultEventResult>("tool_result", initialResult);
    const initialDelivery = persistToolResult(manager, initialResult, initialPatch);

    await runtime.invoke("session_shutdown", { type: "session_shutdown", reason: "reload" });
    runtime = lifecycleHarness(root, manager);
    await runtime.invoke("session_start", { type: "session_start", reason: "resume" });
    const resumedCall = toolCall("resumed", target);
    await runtime.invoke("tool_call", resumedCall);
    expect(await runtime.invoke("tool_result", toolResult("resumed"))).toBeUndefined();

    manager.branch(rootEntry);
    await runtime.invoke("session_tree", { type: "session_tree", newLeafId: rootEntry, oldLeafId: initialDelivery });
    const beforeDeliveryCall = toolCall("before-delivery", target);
    await runtime.invoke("tool_call", beforeDeliveryCall);
    const beforeDeliveryResult = toolResult("before-delivery");
    const beforeDeliveryPatch = await runtime.invoke<ToolResultEventResult>("tool_result", beforeDeliveryResult);
    expect(JSON.stringify(beforeDeliveryPatch?.content)).toContain("branch-local");
    const branchDelivery = persistToolResult(manager, beforeDeliveryResult, beforeDeliveryPatch);

    manager.branch(branchDelivery);
    await runtime.invoke("session_tree", { type: "session_tree", newLeafId: branchDelivery, oldLeafId: rootEntry });
    const afterDeliveryCall = toolCall("after-delivery", target);
    await runtime.invoke("tool_call", afterDeliveryCall);
    expect(await runtime.invoke("tool_result", toolResult("after-delivery"))).toBeUndefined();
    expect(manager.getEntry(initialDelivery)?.type).toBe("message");
  });

  it("keeps retained compacted results delivered and reactivates sources when compaction drops them", async () => {
    const root = fixture();
    put(root, ".pi/instructions/guide.md", "compact-aware");
    const target = put(root, "src/file.ts", "body");
    const manager = SessionManager.inMemory(root);
    manager.appendMessage({ role: "user", content: "start", timestamp: 1 });
    const runtime = lifecycleHarness(root, manager);
    await runtime.invoke("session_start", { type: "session_start", reason: "startup" });

    const first = toolCall("before-compact", target);
    await runtime.invoke("tool_call", first);
    const firstResult = toolResult("before-compact");
    const firstPatch = await runtime.invoke<ToolResultEventResult>("tool_result", firstResult);
    const deliveredEntry = persistToolResult(manager, firstResult, firstPatch);
    manager.appendCompaction("checkpoint", deliveredEntry, 12);
    await runtime.invoke("session_compact", { type: "session_compact" });

    const retained = toolCall("retained", target);
    await runtime.invoke("tool_call", retained);
    expect(await runtime.invoke("tool_result", toolResult("retained"))).toBeUndefined();

    manager.appendCompaction("checkpoint without retained tool result", null, 20);
    await runtime.invoke("session_compact", { type: "session_compact" });
    const eligible = toolCall("removed", target);
    await runtime.invoke("tool_call", eligible);
    const eligiblePatch = await runtime.invoke<ToolResultEventResult>("tool_result", toolResult("removed"));
    expect(JSON.stringify(eligiblePatch?.content)).toContain("compact-aware");
  });

  it("remains inert until trusted and retries deleted candidates after warning", async () => {
    const root = fixture();
    const instruction = put(root, ".pi/instructions/guide.md", "retry after deletion");
    const target = put(root, "src/file.ts", "body");
    const runtime = lifecycleHarness(root, undefined, false);
    await runtime.invoke("session_start", { type: "session_start", reason: "startup" });
    const untrusted = toolCall("untrusted", target);
    await runtime.invoke("tool_call", untrusted);
    expect(await runtime.invoke("tool_result", toolResult("untrusted"))).toBeUndefined();

    runtime.setTrusted(true);
    const deleted = toolCall("deleted", target);
    await runtime.invoke("tool_call", deleted);
    fs.unlinkSync(instruction);
    expect(await runtime.invoke("tool_result", toolResult("deleted"))).toBeUndefined();
    expect(runtime.notify).toHaveBeenCalledWith(expect.stringContaining("Unable to read instruction file"), "warning");

    put(root, ".pi/instructions/guide.md", "retry after deletion");
    const retry = toolCall("retry", target);
    await runtime.invoke("tool_call", retry);
    const patch = await runtime.invoke<ToolResultEventResult>("tool_result", toolResult("retry"));
    expect(JSON.stringify(patch?.content)).toContain("retry after deletion");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import childAuthority from "../extensions/subagent-child.ts";
import { workspaceRoot } from "../lib/subagents/workspace.ts";
const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const temp = mkdtempSync(join(tmpdir(), "subagent-workspace-"));
  roots.push(temp);
  const root = join(temp, "work"); mkdirSync(root);
  const outside = join(temp, "outside"); mkdirSync(outside);
  symlinkSync(outside, join(root, "link"), process.platform === "win32" ? "junction" : "dir");
  return { root: workspaceRoot(root), outside };
}
function toolGuard(root: string, tools: string[]) {
  vi.stubEnv("PI_SUBAGENT_AUTHORITY", JSON.stringify({id:"probe", agent:"probe", tools, delegates:[], cwd:root, skills:[]}));
  vi.stubEnv("PI_SUBAGENT_ENDPOINT", "");
  const handlers: Record<string, Function> = {};
  childAuthority({
    on: (name: string, handler: Function) => { handlers[name] = handler; },
    registerCommand: () => {}, registerTool: () => {},
  } as any);
  return handlers.tool_call;
}
describe("native file access uses cwd as context, not confinement", () => {
  it.each(["read", "write", "edit", "grep", "find", "ls"])("allows %s outside cwd and through directory links", toolName => {
    const {root, outside} = fixture();
    const guard = toolGuard(root, [toolName]);
    for (const path of ["../outside", outside, "link/new.txt"]) {
      expect(guard({toolName, input:{path}})).toBeUndefined();
    }
  });
  it("preserves the role tool ceiling regardless of path", () => {
    const {root, outside} = fixture();
    const guard = toolGuard(root, ["read"]);
    expect(guard({toolName:"write", input:{path:join(outside,"new.txt")}})).toMatchObject({
      block:true, terminate:true, reason:"Tool write is outside frozen probe authority",
    });
  });
});

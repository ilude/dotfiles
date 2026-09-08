import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { guardNativePath, workspaceRoot } from "../lib/subagents/workspace.ts";
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() { const temp = mkdtempSync(join(tmpdir(), "subagent-workspace-")); roots.push(temp); const root = join(temp, "work"); mkdirSync(root); return {temp, root:workspaceRoot(root)}; }
describe("native workspace authority", () => {
  it("allows new nested files but denies parent escapes", () => {
    const {root} = fixture();
    expect(() => guardNativePath(root, [], "write", {path:"new/child.txt"})).not.toThrow();
    expect(() => guardNativePath(root, [], "read", {path:"../secret"})).toThrow(/outside/);
    expect(() => guardNativePath(root, [], "ls", {})).not.toThrow();
  });
  it("denies symlink ancestor escapes for new writes", () => {
    const {root,temp} = fixture();
    const outside=join(temp,"outside"); mkdirSync(outside);
    symlinkSync(outside,join(root,"link"),process.platform==="win32"?"junction":"dir");
    expect(() => guardNativePath(root, [], "write", {path:"link/new.txt"})).toThrow(/outside/);
  });
  it("allows selected skill reads, not edits or arbitrary adjacent files", () => {
    const {root,temp}=fixture(); const skill=join(temp,"SKILL.md"); writeFileSync(skill,"skill");
    expect(() => guardNativePath(root,[skill],"read",{path:skill})).not.toThrow();
    expect(() => guardNativePath(root,[skill],"edit",{path:skill})).toThrow(/outside/);
    expect(() => guardNativePath(root,[skill],"read",{path:join(temp,"other.md")})).toThrow(/outside/);
  });
  it("does not pretend to sandbox shell tools", () => {
    const {root}=fixture(); expect(() => guardNativePath(root,[],"bash",{command:"anything"})).not.toThrow();
  });
});

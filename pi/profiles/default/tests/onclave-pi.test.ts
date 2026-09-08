import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, parse } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveOnclaveAdapter } from "../extensions/onclave-pi.js";

describe("default Onclave loader", () => {
  it("locates the owning adapter from the active repository", () => {
    expect(resolveOnclaveAdapter().replaceAll("\\", "/")).toMatch(/\/modules\/onclave\/extensions\/onclave-pi\/src\/onclave-pi\.ts$/);
  });
  it("prefers the current worktree module over an ancestor checkout", () => {
    const root = mkdtempSync(join(tmpdir(), "onclave-loader-"));
    const relative = "modules/onclave/extensions/onclave-pi/src/onclave-pi.ts";
    const worktree = join(root, ".worktrees", "port");
    try {
      for (const base of [root, worktree]) { mkdirSync(dirname(join(base, relative)), { recursive: true }); writeFileSync(join(base, relative), ""); }
      expect(resolveOnclaveAdapter(join(worktree, "pi", "profiles", "default", "extensions"))).toBe(join(worktree, relative));
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("reports a missing owning checkout explicitly", () => {
    expect(() => resolveOnclaveAdapter(parse(process.cwd()).root)).toThrow("Onclave adapter source was not found");
  });
});

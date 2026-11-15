import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { homedir, tmpdir } from "node:os";

const adapter = resolve(import.meta.dir, "pi-adapter.ts");
function run(payload: unknown) {
  const result = spawnSync("bun", [adapter], { input: typeof payload === "string" ? payload : JSON.stringify(payload), encoding: "utf8", timeout: 30_000 });
  expect(result.status).toBe(0);
  return result.stdout ? JSON.parse(result.stdout) : undefined;
}
describe("repository-root recursive grep", () => {
  const root = mkdtempSync(resolve(tmpdir(), "claude-root-grep-"));
  mkdirSync(resolve(root, ".git"));
  mkdirSync(resolve(root, "src"));
  mkdirSync(resolve(root, "nested"));
  writeFileSync(resolve(root, "nested/.git"), "gitdir: /fixture");
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const absolute = root.replaceAll("\\", "/");

  test.each([
    "grep -rn --exclude-dir=.git -F -e needle . 2>/dev/null | grep -v excluded | head",
    "grep -R needle ./",
    "grep --recursive needle",
    "grep --dereference-recursive -e needle .",
    `grep -rn needle '${absolute}'`,
    "cd src && grep -r needle ..",
    "cd nested && grep -r needle .",
  ])("denies %s", command => {
    const result = run({ tool_name: "Bash", tool_input: { command }, cwd: root });
    expect(result.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(result.hookSpecificOutput.permissionDecisionReason).toContain("git grep");
  });

  test.each([
    "grep -rn needle src",
    "grep -r needle nested",
    "cd src && grep -r needle .",
    "grep -n needle .",
    "grep -e '-r' .",
    "grep -- -r .",
    "git grep -n needle",
    "rg needle .",
    "printf '%s' 'grep -r needle .'",
  ])("preserves %s", command => {
    expect(run({ tool_name: "Bash", tool_input: { command }, cwd: root })).toBeUndefined();
  });
});

describe("Claude Damage Control adapter", () => {
  test("allows a deterministic low-risk Bash call without a decision", () => {
    expect(run({ tool_name: "Bash", tool_input: { command: "echo hello" }, cwd: process.cwd() })).toBeUndefined();
  });
  test("denies malformed input and missing cwd", () => {
    expect(run("not-json").hookSpecificOutput.permissionDecision).toBe("deny");
    expect(run({ tool_name: "Bash", tool_input: { command: "echo hello" } }).hookSpecificOutput.permissionDecision).toBe("deny");
  });
  test("denies a confirmed destructive Bash command", () => {
    const result = run({ tool_name: "Bash", tool_input: { command: "rm -rf /" }, cwd: process.cwd() });
    expect(result.hookSpecificOutput.permissionDecision).toBe("deny");
  });
  test("asks for contextual Bash review without invoking a judge", () => {
    const result = run({ tool_name: "Bash", tool_input: { command: "rm -rf important-dir" }, cwd: process.cwd() });
    expect(result.hookSpecificOutput.permissionDecision).toBe("ask");
    expect(result.hookSpecificOutput.permissionDecisionReason).toContain("contextual review unavailable");
  });
  test("allows ordinary Write and Edit, denies protected Write and Edit", () => {
    const cwd = process.cwd();
    expect(run({ tool_name: "Write", tool_input: { file_path: resolve(cwd, "new-output.txt"), content: "safe" }, cwd })).toBeUndefined();
    expect(run({ tool_name: "Edit", tool_input: { file_path: adapter, old_string: "#!/usr/bin/env bun", new_string: "#!/usr/bin/env bun\n", replace_all: false }, cwd })).toBeUndefined();
    const protectedPath = resolve(homedir(), ".ssh", "id_ed25519");
    expect(run({ tool_name: "Write", tool_input: { file_path: protectedPath, content: "x" }, cwd }).hookSpecificOutput.permissionDecision).toBe("deny");
    expect(run({ tool_name: "Edit", tool_input: { file_path: protectedPath, old_string: "x", new_string: "y" }, cwd }).hookSpecificOutput.permissionDecision).toBe("deny");
  }, 20_000);
  test("denies unsupported replace_all Edit explicitly", () => {
    const result = run({ tool_name: "Edit", tool_input: { file_path: "example.txt", old_string: "x", new_string: "y", replace_all: true }, cwd: process.cwd() });
    expect(result.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(result.hookSpecificOutput.permissionDecisionReason).toContain("replace_all");
  });
});

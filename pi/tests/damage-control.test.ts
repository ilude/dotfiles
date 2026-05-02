import { beforeEach, describe, expect, it, vi } from "vitest";

function setPlatform(value: NodeJS.Platform) {
  Object.defineProperty(process, "platform", {
    value,
    configurable: true,
  });
}

describe("damage-control extension", () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.restoreAllMocks();
    setPlatform(originalPlatform);
  });

  it("asks for docker compose down on linux and blocks when not confirmed", async () => {
    setPlatform("linux");
    const mod = await import("../extensions/damage-control.ts");

    const result = await mod.evaluateDangerousCommand(
      "docker compose down",
      [
        {
          pattern: "docker compose down",
          reason: "docker compose down stops and removes containers",
          action: "ask",
          platforms: ["linux"],
        },
      ],
      {
        hasUI: true,
        ui: { confirm: vi.fn(async () => false) },
      },
    );

    expect(result).toEqual({
      block: true,
      reason:
        'Confirmation required for dangerous command (matched "docker compose down"): docker compose down stops and removes containers',
    });
  });

  it("allows docker compose down on linux when confirmed", async () => {
    setPlatform("linux");
    const mod = await import("../extensions/damage-control.ts");
    const confirm = vi.fn(async () => true);

    const result = await mod.evaluateDangerousCommand(
      "docker compose down",
      [
        {
          pattern: "docker compose down",
          reason: "docker compose down stops and removes containers",
          action: "ask",
          platforms: ["linux"],
        },
      ],
      {
        hasUI: true,
        ui: { confirm },
      },
    );

    expect(confirm).toHaveBeenCalledWith(
      "Confirm dangerous command",
      "docker compose down stops and removes containers",
    );
    expect(result).toBeUndefined();
  });

  it("allows docker compose down on macOS and Windows because linux-only rule does not apply", async () => {
    const mod = await import("../extensions/damage-control.ts");

    setPlatform("darwin");
    const macResult = await mod.evaluateDangerousCommand("docker compose down", [
      {
        pattern: "docker compose down",
        reason: "docker compose down stops and removes containers",
        action: "ask",
        platforms: ["linux"],
      },
    ]);

    setPlatform("win32");
    const windowsResult = await mod.evaluateDangerousCommand("docker down", [
      {
        pattern: "docker down",
        reason: "docker down stops and removes containers",
        action: "ask",
        platforms: ["linux"],
      },
    ]);

    expect(macResult).toBeUndefined();
    expect(windowsResult).toBeUndefined();
  });
});

describe("damage-control no_delete_paths enforcement", () => {
  describe("extractBashDeleteTargets", () => {
    it("extracts targets from rm <path>", async () => {
      const mod = await import("../extensions/damage-control.ts");
      expect(mod.extractBashDeleteTargets("rm package.json")).toContain("package.json");
    });

    it("extracts targets from rm with flags", async () => {
      const mod = await import("../extensions/damage-control.ts");
      expect(mod.extractBashDeleteTargets("rm -rf build/")).toContain("build/");
    });

    it("extracts target from truncating > redirection", async () => {
      const mod = await import("../extensions/damage-control.ts");
      const targets = mod.extractBashDeleteTargets("echo > package.json");
      expect(targets).toContain("package.json");
    });

    it("does NOT treat >> as truncating", async () => {
      const mod = await import("../extensions/damage-control.ts");
      const targets = mod.extractBashDeleteTargets("echo hi >> log.txt");
      expect(targets).not.toContain("log.txt");
    });

    it("extracts target from find -delete", async () => {
      const mod = await import("../extensions/damage-control.ts");
      const targets = mod.extractBashDeleteTargets("find ./dist -name '*.bak' -delete");
      expect(targets).toContain("./dist");
    });

    it("extracts targets from git rm", async () => {
      const mod = await import("../extensions/damage-control.ts");
      const targets = mod.extractBashDeleteTargets("git rm Makefile");
      expect(targets).toContain("Makefile");
    });

    it("returns empty for non-delete commands", async () => {
      const mod = await import("../extensions/damage-control.ts");
      expect(mod.extractBashDeleteTargets("ls -la")).toEqual([]);
      expect(mod.extractBashDeleteTargets("cat package.json")).toEqual([]);
    });
  });

  describe("extractPwshDeleteTargets", () => {
    it("extracts target from Remove-Item", async () => {
      const mod = await import("../extensions/damage-control.ts");
      const targets = mod.extractPwshDeleteTargets("Remove-Item package.json");
      expect(targets).toContain("package.json");
    });

    it("extracts target from Remove-Item -Path", async () => {
      const mod = await import("../extensions/damage-control.ts");
      const targets = mod.extractPwshDeleteTargets("Remove-Item -Path 'C:/temp/Makefile' -Force");
      expect(targets).toContain("C:/temp/Makefile");
    });

    it("extracts target from Clear-Content", async () => {
      const mod = await import("../extensions/damage-control.ts");
      const targets = mod.extractPwshDeleteTargets("Clear-Content config.json");
      expect(targets).toContain("config.json");
    });

    it("extracts target from [System.IO.File]::Delete", async () => {
      const mod = await import("../extensions/damage-control.ts");
      const targets = mod.extractPwshDeleteTargets('[System.IO.File]::Delete("Makefile")');
      expect(targets).toContain("Makefile");
    });

    it("returns empty for non-delete cmdlets", async () => {
      const mod = await import("../extensions/damage-control.ts");
      expect(mod.extractPwshDeleteTargets("Get-Item package.json")).toEqual([]);
    });
  });

  describe("extractTruncatingEditWriteTarget", () => {
    it("flags Write with empty content as truncating", async () => {
      const mod = await import("../extensions/damage-control.ts");
      expect(
        mod.extractTruncatingEditWriteTarget("write", { path: "package.json", content: "" }),
      ).toBe("package.json");
    });

    it("flags Write with whitespace-only content as truncating", async () => {
      const mod = await import("../extensions/damage-control.ts");
      expect(
        mod.extractTruncatingEditWriteTarget("write", { path: "Makefile", content: "   \n\n" }),
      ).toBe("Makefile");
    });

    it("does NOT flag Write with real content", async () => {
      const mod = await import("../extensions/damage-control.ts");
      expect(
        mod.extractTruncatingEditWriteTarget("write", { path: "package.json", content: '{"name":"x"}' }),
      ).toBeUndefined();
    });

    it("flags Edit replacing non-trivial old_string with empty new_string", async () => {
      const mod = await import("../extensions/damage-control.ts");
      expect(
        mod.extractTruncatingEditWriteTarget("edit", {
          path: "Makefile",
          old_string: "all:\n\techo hi",
          new_string: "",
        }),
      ).toBe("Makefile");
    });

    it("does NOT flag Edit when new_string is non-empty", async () => {
      const mod = await import("../extensions/damage-control.ts");
      expect(
        mod.extractTruncatingEditWriteTarget("edit", {
          path: "Makefile",
          old_string: "all:",
          new_string: "all: build",
        }),
      ).toBeUndefined();
    });
  });

  describe("checkNoDeletePaths", () => {
    it("blocks when target matches a no_delete pattern by basename", async () => {
      const mod = await import("../extensions/damage-control.ts");
      const result = mod.checkNoDeletePaths(["./package.json"], ["package.json"], process.cwd());
      expect(result?.block).toBe(true);
      expect(result?.reason).toContain("package.json");
    });

    it("returns undefined when no targets match", async () => {
      const mod = await import("../extensions/damage-control.ts");
      const result = mod.checkNoDeletePaths(["./readme.txt"], ["package.json"], process.cwd());
      expect(result).toBeUndefined();
    });

    it("returns undefined when no patterns are configured", async () => {
      const mod = await import("../extensions/damage-control.ts");
      const result = mod.checkNoDeletePaths(["./package.json"], [], process.cwd());
      expect(result).toBeUndefined();
    });

    it("blocks malformed paths (NUL byte) by surfacing a block decision", async () => {
      const mod = await import("../extensions/damage-control.ts");
      const result = mod.checkNoDeletePaths(["foo bar"], ["never-matched"], process.cwd());
      expect(result?.block).toBe(true);
      expect(result?.reason.toLowerCase()).toContain("malformed");
    });
  });
});

// ============================================================================
// SSH use/inspect split for zero_access_paths
// ============================================================================
//
// Mirror of claude/hooks/damage-control/tests/test_ssh_use_inspect_split.py
// adapted for pi's tool-based architecture: pi's bash handler does NOT run
// zero_access (so `bash: ssh -i ./key.pem ...` is unaffected by this rule
// either before or after this change). Only file-tool calls (read/write/
// edit/find/ls) hit checkZeroAccess. Of those:
//
//   - read/write/edit on ssh-protected patterns -> block (content exposure)
//   - ls/find on ssh-protected patterns         -> ask via ctx.ui.confirm
//   - any tool on non-ssh zero-access patterns  -> block (unchanged)
//
// "ssh-protected patterns" = ~/.ssh/, *.pem, *.ppk, *.p12, *.pfx in the
// configured zero_access_paths list.
import * as os from "node:os";
import * as path from "node:path";

// Tests use native-separator paths (path.join only) because expandPattern
// inside damage-control.ts uses path.join too; mixing forward/backslash
// breaks prefix matching on Windows.
function sshKeyPath(name = "id_ed25519"): string {
  return path.join(os.homedir(), ".ssh", name);
}
function pemPath(name = "aws-key.pem"): string {
  return path.join(process.cwd(), name);
}
function repoPath(name: string): string {
  return path.join(process.cwd(), name);
}

describe("damage-control checkZeroAccess (ssh use/inspect split)", () => {
  const SSH_AND_OTHER = ["~/.ssh/*", "*.pem", "*.ppk", "*.p12", "*.pfx", ".env"];

  describe("ssh-protected pattern + content tool -> block", () => {
    it("blocks read on ~/.ssh/id_ed25519", async () => {
      const mod = await import("../extensions/damage-control.ts");
      const result = await mod.checkZeroAccess(sshKeyPath(), SSH_AND_OTHER, "read");
      expect(result?.block).toBe(true);
      expect(result?.reason).toMatch(/zero-access/);
    });

    it("blocks write on ./aws-key.pem", async () => {
      const mod = await import("../extensions/damage-control.ts");
      const result = await mod.checkZeroAccess(pemPath(), SSH_AND_OTHER, "write");
      expect(result?.block).toBe(true);
    });

    it("blocks edit on ./aws-key.pem", async () => {
      const mod = await import("../extensions/damage-control.ts");
      const result = await mod.checkZeroAccess(pemPath(), SSH_AND_OTHER, "edit");
      expect(result?.block).toBe(true);
    });
  });

  describe("ssh-protected pattern + metadata tool -> ask via confirm", () => {
    it("allows ls on ~/.ssh when user confirms", async () => {
      const mod = await import("../extensions/damage-control.ts");
      const confirm = vi.fn(async () => true);
      const result = await mod.checkZeroAccess(sshKeyPath(), SSH_AND_OTHER, "ls", {
        hasUI: true,
        ui: { confirm },
      });
      expect(confirm).toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it("blocks ls on ~/.ssh when user denies", async () => {
      const mod = await import("../extensions/damage-control.ts");
      const confirm = vi.fn(async () => false);
      const result = await mod.checkZeroAccess(sshKeyPath(), SSH_AND_OTHER, "ls", {
        hasUI: true,
        ui: { confirm },
      });
      expect(result?.block).toBe(true);
      expect(result?.reason.toLowerCase()).toContain("confirmation required");
    });

    it("allows find on ~/.ssh when user confirms", async () => {
      const mod = await import("../extensions/damage-control.ts");
      const confirm = vi.fn(async () => true);
      const result = await mod.checkZeroAccess(sshKeyPath(), SSH_AND_OTHER, "find", {
        hasUI: true,
        ui: { confirm },
      });
      expect(result).toBeUndefined();
    });

    it("allows ls on ./aws-key.pem when user confirms", async () => {
      const mod = await import("../extensions/damage-control.ts");
      const confirm = vi.fn(async () => true);
      const result = await mod.checkZeroAccess(pemPath(), SSH_AND_OTHER, "ls", {
        hasUI: true,
        ui: { confirm },
      });
      expect(result).toBeUndefined();
    });

    it("blocks ls on ./aws-key.pem when no UI is available", async () => {
      const mod = await import("../extensions/damage-control.ts");
      const result = await mod.checkZeroAccess(pemPath(), SSH_AND_OTHER, "ls", {
        hasUI: false,
      });
      expect(result?.block).toBe(true);
      expect(result?.reason.toLowerCase()).toContain("confirmation required");
    });
  });

  describe("non-ssh patterns are unaffected", () => {
    it("blocks read on .env even with confirm available", async () => {
      const mod = await import("../extensions/damage-control.ts");
      const confirm = vi.fn(async () => true);
      const result = await mod.checkZeroAccess(
        repoPath(".env"),
        SSH_AND_OTHER,
        "read",
        { hasUI: true, ui: { confirm } },
      );
      expect(result?.block).toBe(true);
      expect(confirm).not.toHaveBeenCalled();
    });

    it("blocks ls on .env (metadata tool but non-ssh pattern still blocks)", async () => {
      const mod = await import("../extensions/damage-control.ts");
      const confirm = vi.fn(async () => true);
      const result = await mod.checkZeroAccess(
        repoPath(".env"),
        SSH_AND_OTHER,
        "ls",
        { hasUI: true, ui: { confirm } },
      );
      expect(result?.block).toBe(true);
      expect(confirm).not.toHaveBeenCalled();
    });

    it("returns undefined for paths that match no pattern", async () => {
      const mod = await import("../extensions/damage-control.ts");
      const result = await mod.checkZeroAccess(
        repoPath("readme.txt"),
        SSH_AND_OTHER,
        "read",
      );
      expect(result).toBeUndefined();
    });
  });

  describe("isSshProtectedPattern unit tests", () => {
    it.each([
      ["~/.ssh/", true],
      ["~/.ssh/*", true],
      ["~/.ssh", true],
      ["*.pem", true],
      ["*.ppk", true],
      ["*.p12", true],
      ["*.pfx", true],
      [".env", false],
      ["~/.aws/", false],
      ["*.session", false],
      ["", false],
    ])("isSshProtectedPattern(%j) === %s", async (pattern, expected) => {
      const mod = await import("../extensions/damage-control.ts");
      expect(mod.isSshProtectedPattern(pattern)).toBe(expected);
    });
  });
});

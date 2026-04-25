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

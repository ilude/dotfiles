import { describe, expect, it } from "vitest";
import { normalizeRepositoryId, repositoryId, samePlatformPath } from "../lib/path-identity.ts";

describe("repository IDs", () => {
  it.each([
    ["C:\\work\\repo", "C:\\work\\repo\\modules\\onclave"],
    ["C:/work/repo", "C:\\work\\repo\\modules/onclave"],
    ["\\\\server\\share\\repo", "\\\\server\\share\\repo\\modules\\onclave"],
    ["/work/repo", "/work/repo/modules/onclave"],
  ])("creates the same portable ID from %s on every host", (root, child) => {
    expect(repositoryId(root, child)).toBe("modules/onclave");
    expect(repositoryId(root, root)).toBe(".");
  });

  it("normalizes Windows tool IDs without rewriting POSIX filename characters", () => {
    expect(normalizeRepositoryId("modules\\onclave", "win32")).toBe("modules/onclave");
    expect(normalizeRepositoryId("modules/onclave", "win32")).toBe("modules/onclave");
    expect(normalizeRepositoryId("modules\\onclave", "posix")).toBe("modules\\onclave");
    expect(repositoryId("/work/repo", "/work/repo/modules\\onclave")).toBe("modules\\onclave");
  });

  it("preserves ID case, spaces and segments instead of resolving arbitrary input", () => {
    expect(repositoryId("C:/repo", "C:/repo/modules/With Spaces")).toBe("modules/With Spaces");
    for (const style of ["win32", "posix"] as const) {
      expect(normalizeRepositoryId("Modules/With Spaces", style)).toBe("Modules/With Spaces");
      expect(normalizeRepositoryId("../other", style)).toBe("../other");
      expect(normalizeRepositoryId("", style)).toBe("");
    }
  });
});

describe("platform path identity", () => {
  it("accepts equivalent Windows path spellings on every host platform", () => {
    expect(samePlatformPath("C:/Users/example/repo", "C:\\Users\\example\\repo")).toBe(true);
    expect(samePlatformPath("C:/Users/Example/repo/", "c:\\users\\example\\repo")).toBe(true);
    expect(samePlatformPath("//server/share/repo", "\\\\SERVER\\share\\repo\\")).toBe(true);
  });

  it("normalizes path segments without weakening POSIX case sensitivity", () => {
    expect(samePlatformPath("/home/example/repo/../repo", "/home/example/repo/")).toBe(true);
    expect(samePlatformPath("/home/Example/repo", "/home/example/repo")).toBe(false);
  });
});

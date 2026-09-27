import { describe, expect, it } from "vitest";
import { samePlatformPath } from "../lib/path-identity.ts";

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

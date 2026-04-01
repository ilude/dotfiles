/**
 * Pure function tests for web-tools extension — no mocking needed.
 */
import { describe, it, expect } from "vitest";
import { parseDotEnv, formatSearchResult } from "../extensions/web-tools.ts";

describe("parseDotEnv", () => {
  it("parses simple KEY=VALUE pairs", () => {
    const result = parseDotEnv("FOO=bar\nBAZ=qux");
    expect(result).toEqual([
      { key: "FOO", value: "bar" },
      { key: "BAZ", value: "qux" },
    ]);
  });

  it("skips comments", () => {
    const result = parseDotEnv("# comment\nKEY=val\n# another");
    expect(result).toEqual([{ key: "KEY", value: "val" }]);
  });

  it("skips blank lines", () => {
    const result = parseDotEnv("\n\nKEY=val\n\n");
    expect(result).toEqual([{ key: "KEY", value: "val" }]);
  });

  it("skips lines without =", () => {
    const result = parseDotEnv("NOEQUALS\nKEY=val");
    expect(result).toEqual([{ key: "KEY", value: "val" }]);
  });

  it("strips double quotes from values", () => {
    const result = parseDotEnv('KEY="quoted value"');
    expect(result).toEqual([{ key: "KEY", value: "quoted value" }]);
  });

  it("strips single quotes from values", () => {
    const result = parseDotEnv("KEY='quoted value'");
    expect(result).toEqual([{ key: "KEY", value: "quoted value" }]);
  });

  it("handles value with = sign in it", () => {
    const result = parseDotEnv("KEY=val=ue=extra");
    expect(result).toEqual([{ key: "KEY", value: "val=ue=extra" }]);
  });

  it("trims whitespace around key and value", () => {
    const result = parseDotEnv("  KEY  =  value  ");
    expect(result).toEqual([{ key: "KEY", value: "value" }]);
  });

  it("handles empty value", () => {
    const result = parseDotEnv("KEY=");
    expect(result).toEqual([{ key: "KEY", value: "" }]);
  });

  it("returns empty array for empty input", () => {
    expect(parseDotEnv("")).toEqual([]);
  });

  it("skips lines with empty key", () => {
    const result = parseDotEnv("=value");
    expect(result).toEqual([]);
  });
});

describe("formatSearchResult", () => {
  it("includes title, URL, and snippet", () => {
    const text = formatSearchResult(
      { title: "Page Title", url: "https://example.com", content: "Some snippet" },
      1
    );
    expect(text).toContain("Result 1");
    expect(text).toContain("Title: Page Title");
    expect(text).toContain("URL: https://example.com");
    expect(text).toContain("Snippet: Some snippet");
  });

  it("includes date when present", () => {
    const text = formatSearchResult(
      { title: "T", url: "https://t.com", publishedDate: "2024-03-15" },
      1
    );
    expect(text).toContain("Date: 2024-03-15");
  });

  it("excludes date when absent", () => {
    const text = formatSearchResult({ title: "T", url: "https://t.com" }, 1);
    expect(text).not.toContain("Date:");
  });

  it("includes engine when present", () => {
    const text = formatSearchResult(
      { title: "T", url: "https://t.com", engine: "google" },
      1
    );
    expect(text).toContain("Engine: google");
  });

  it("excludes engine when absent", () => {
    const text = formatSearchResult({ title: "T", url: "https://t.com" }, 1);
    expect(text).not.toContain("Engine:");
  });

  it("shows '(no snippet)' when content is missing", () => {
    const text = formatSearchResult({ title: "T", url: "https://t.com" }, 1);
    expect(text).toContain("Snippet: (no snippet)");
  });

  it("uses correct index number", () => {
    const text = formatSearchResult({ title: "T", url: "https://t.com" }, 7);
    expect(text).toContain("Result 7");
  });
});

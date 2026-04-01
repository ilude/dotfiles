/**
 * Tests for the web-tools extension (~/.pi/agent/extensions/web-tools.ts)
 *
 * web_search: mocks global fetch (lightweight, high value — validates parsing)
 * web_fetch: mocks pi.exec (lightweight, validates arg wiring)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPi } from "./helpers/mock-pi.js";

// Mock fs for loadDotEnv (called at module level)
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync: vi.fn((...args: any[]) => {
      if ((args[0] as string).includes(".env")) return "# empty\n";
      return actual.readFileSync(...(args as Parameters<typeof actual.readFileSync>));
    }),
  };
});

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("web-tools extension", () => {
  let mockPi: ReturnType<typeof createMockPi>;

  beforeEach(() => {
    mockPi = createMockPi();
    mockFetch.mockReset();
  });

  it("should register both tools", async () => {
    const mod = await import("../extensions/web-tools.ts");
    mod.default(mockPi as any);
    expect(mockPi._getTool("web_search")).toBeDefined();
    expect(mockPi._getTool("web_fetch")).toBeDefined();
  });

  describe("web_search", () => {
    let search: any;

    beforeEach(async () => {
      const mod = await import("../extensions/web-tools.ts");
      mod.default(mockPi as any);
      search = mockPi._getTool("web_search");
    });

    function mockSearchResponse(results: any[]) {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ results }),
      });
    }

    it("should encode query in URL", async () => {
      mockSearchResponse([]);
      await search.execute("id", { query: "hello world" }, undefined, undefined, {});
      expect(mockFetch.mock.calls[0][0]).toContain("q=hello%20world");
    });

    it("should format results with title, URL, snippet", async () => {
      mockSearchResponse([
        { title: "Page One", url: "https://one.com", content: "Snippet", publishedDate: "2024-01-15", engine: "google" },
      ]);
      const result = await search.execute("id", { query: "test" }, undefined, undefined, {});
      const text = result.content[0].text;
      expect(text).toContain("Title: Page One");
      expect(text).toContain("URL: https://one.com");
      expect(text).toContain("Snippet: Snippet");
      expect(text).toContain("Date: 2024-01-15");
      expect(text).toContain("Engine: google");
    });

    it("should default to 5 results", async () => {
      mockSearchResponse(Array.from({ length: 10 }, (_, i) => ({ title: `R${i}`, url: `https://r${i}.com` })));
      const result = await search.execute("id", { query: "test" }, undefined, undefined, {});
      expect(result.content[0].text).toContain("Result 5");
      expect(result.content[0].text).not.toContain("Result 6");
    });

    it("should respect num_results", async () => {
      mockSearchResponse(Array.from({ length: 10 }, (_, i) => ({ title: `R${i}`, url: `https://r${i}.com` })));
      const result = await search.execute("id", { query: "test", num_results: 3 }, undefined, undefined, {});
      expect(result.content[0].text).toContain("Result 3");
      expect(result.content[0].text).not.toContain("Result 4");
    });

    it("should cap at 20 results", async () => {
      mockSearchResponse(Array.from({ length: 25 }, (_, i) => ({ title: `R${i}`, url: `https://r${i}.com` })));
      const result = await search.execute("id", { query: "test", num_results: 50 }, undefined, undefined, {});
      expect(result.content[0].text).toContain("Result 20");
      expect(result.content[0].text).not.toContain("Result 21");
    });

    it("should return 'No results found.' for empty results", async () => {
      mockSearchResponse([]);
      const result = await search.execute("id", { query: "nothing" }, undefined, undefined, {});
      expect(result.content[0].text).toBe("No results found.");
    });

    it("should throw on HTTP error", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 503, statusText: "Service Unavailable" });
      await expect(search.execute("id", { query: "test" }, undefined, undefined, {})).rejects.toThrow(/503/);
    });

    it("should show '(no snippet)' when content is missing", async () => {
      mockSearchResponse([{ title: "Bare", url: "https://bare.com" }]);
      const result = await search.execute("id", { query: "test" }, undefined, undefined, {});
      expect(result.content[0].text).toContain("(no snippet)");
    });
  });

  describe("web_fetch", () => {
    let fetch_tool: any;

    beforeEach(async () => {
      const mod = await import("../extensions/web-tools.ts");
      mod.default(mockPi as any);
      fetch_tool = mockPi._getTool("web_fetch");
    });

    it("should pass URL to node fetch script", async () => {
      mockPi.exec.mockResolvedValue({ code: 0, stdout: "# Content", stderr: "" });
      await fetch_tool.execute("id", { url: "https://example.com" }, undefined, undefined, {});
      const args = mockPi.exec.mock.calls[0][1] as string[];
      expect(args).toContain("https://example.com");
      expect(args[0]).toContain("fetch.js");
    });

    it("should pass --max-chars when specified", async () => {
      mockPi.exec.mockResolvedValue({ code: 0, stdout: "content", stderr: "" });
      await fetch_tool.execute("id", { url: "https://example.com", max_chars: 5000 }, undefined, undefined, {});
      const args = mockPi.exec.mock.calls[0][1] as string[];
      expect(args).toContain("--max-chars");
      expect(args).toContain("5000");
    });

    it("should not pass --max-chars when unspecified", async () => {
      mockPi.exec.mockResolvedValue({ code: 0, stdout: "content", stderr: "" });
      await fetch_tool.execute("id", { url: "https://example.com" }, undefined, undefined, {});
      expect((mockPi.exec.mock.calls[0][1] as string[])).not.toContain("--max-chars");
    });

    it("should return trimmed stdout", async () => {
      mockPi.exec.mockResolvedValue({ code: 0, stdout: "  content  \n", stderr: "" });
      const result = await fetch_tool.execute("id", { url: "https://example.com" }, undefined, undefined, {});
      expect(result.content[0].text).toBe("content");
    });

    it("should fall back to stderr when stdout empty", async () => {
      mockPi.exec.mockResolvedValue({ code: 0, stdout: "", stderr: "Error: 404" });
      const result = await fetch_tool.execute("id", { url: "https://example.com" }, undefined, undefined, {});
      expect(result.content[0].text).toBe("Error: 404");
    });

    it("should return fallback when both empty", async () => {
      mockPi.exec.mockResolvedValue({ code: 0, stdout: "", stderr: "" });
      const result = await fetch_tool.execute("id", { url: "https://example.com" }, undefined, undefined, {});
      expect(result.content[0].text).toBe("(no content extracted)");
    });
  });
});

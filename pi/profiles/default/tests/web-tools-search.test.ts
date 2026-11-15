import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSearch } from "../extensions/web-tools/search.ts";
import { resetGatewayCredentialCacheForTest } from "../extensions/web-tools/credentials.ts";

const json = (value: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(value), { status, headers });
const exec = vi.fn(async () => ({ code: 0, killed: false, stdout: "", stderr: "" }));
beforeEach(() => {
	vi.stubEnv("SEARXNG_URL", "https://search.example/search");
	vi.stubEnv("SERPER_API_KEY", "serper-test");
	vi.stubEnv("BRAVE_SEARCH_API_KEY", "brave-test");
	vi.stubEnv("BITWARDEN_ACCESS_KEY", ""); vi.stubEnv("FIRECRAWL_API_KEY", ""); vi.stubEnv("BROWSERBASE_API_KEY", "");
	exec.mockClear(); resetGatewayCredentialCacheForTest();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); resetGatewayCredentialCacheForTest(); });

describe("bounded search acquisition", () => {
	it("recovers from transport and outage failures, preserving provider order and query", async () => {
		const fetch = vi.fn().mockRejectedValueOnce(new TypeError("offline"))
			.mockResolvedValueOnce(json({}, 503))
			.mockResolvedValueOnce(json({ web: { results: [{ title: "Found", url: "https://example.com" }] } }));
		vi.stubGlobal("fetch", fetch);
		const result = await createSearch(exec)({ query: 'topic "two words" -excluded site:example.com', count: 3 });
		expect(result).toMatchObject({ backend: "brave", recovery: "searxng:transport; serper:unavailable" });
		expect(new URL(String(fetch.mock.calls[0][0])).searchParams.get("q")).toBe('topic "two words" -excluded site:example.com');
		expect(JSON.parse(fetch.mock.calls[1][1].body).q).toBe('topic "two words" -excluded site:example.com');
		expect(new URL(String(fetch.mock.calls[2][0])).searchParams.get("q")).toBe('topic "two words" -excluded site:example.com');
		expect(exec).not.toHaveBeenCalled();
	});
	it("returns valid empty and partial primary results without looking up fallback credentials", async () => {
		for (const body of [{ results: [] }, { results: [{ title: "Partial", url: "https://example.com" }], unresponsive_engines: [["brave", "rate limit"]] }]) {
			const fetch = vi.fn().mockResolvedValue(json(body)); vi.stubGlobal("fetch", fetch);
			expect((await createSearch(exec)({ query: "topic", count: 5 })).backend).toBe("searxng");
			expect(fetch).toHaveBeenCalledTimes(1); expect(exec).not.toHaveBeenCalled();
		}
	});
	it("selects an existing provider explicitly and rejects incompatible engine filters", async () => {
		const fetch = vi.fn().mockResolvedValue(json({ organic: [] })); vi.stubGlobal("fetch", fetch);
		const search = createSearch(exec);
		expect((await search({ query: "topic", count: 5, provider: "serper" })).backend).toBe("serper");
		expect(fetch.mock.calls[0][0]).toBe("https://google.serper.dev/search");
		await expect(search({ query: "topic", count: 5, provider: "brave", engines: [] })).rejects.toThrow("engines can only");
		expect(fetch).toHaveBeenCalledTimes(1);
	});
	it("does not substitute for explicit provider failure or invalid request", async () => {
		const fetch = vi.fn().mockResolvedValue(json({}, 429)); vi.stubGlobal("fetch", fetch);
		await expect(createSearch(exec)({ query: "topic", count: 5, provider: "serper" })).rejects.toThrow("Serper HTTP 429");
		expect(fetch).toHaveBeenCalledTimes(1);
		fetch.mockClear().mockResolvedValue(json({}, 400));
		await expect(createSearch(exec)({ query: "topic", count: 5 })).rejects.toThrow("SearXNG HTTP 400");
		expect(fetch).toHaveBeenCalledTimes(1);
	});
	it("honors reported rate backoff, reopens without reload, and scopes it to the credential", async () => {
		const fetch = vi.fn().mockResolvedValueOnce(json({}, 429, { "retry-after": "1" }))
			.mockImplementation(async () => json({ organic: [] }));
		vi.stubGlobal("fetch", fetch);
		const now = Date.now(); const clock = vi.spyOn(Date, "now").mockReturnValue(now);
		const search = createSearch(exec);
		const input = { query: "topic", count: 5, provider: "serper" as const };
		await expect(search(input)).rejects.toThrow("429");
		await expect(search(input)).rejects.toThrow("429");
		expect(fetch).toHaveBeenCalledTimes(1);
		clock.mockReturnValue(now + 1001);
		expect((await search(input)).backend).toBe("serper");
		expect(fetch).toHaveBeenCalledTimes(2);
		fetch.mockResolvedValueOnce(json({}, 429));
		await expect(search(input)).rejects.toThrow("429");
		vi.stubEnv("SERPER_API_KEY", "changed-key");
		expect((await search(input)).backend).toBe("serper");
		expect(fetch).toHaveBeenCalledTimes(4);
	});
	it("preserves cancellation even when the transport ignores its signal", async () => {
		const fetch = vi.fn(() => new Promise<Response>(() => {})); vi.stubGlobal("fetch", fetch);
		const controller = new AbortController();
		const pending = createSearch(exec)({ query: "topic", count: 5 }, controller.signal);
		controller.abort();
		await expect(pending).rejects.toMatchObject({ name: "AbortError" });
		expect(fetch).toHaveBeenCalledTimes(1);
	});
	it("gives a timed-out primary a separate window from later attempts", async () => {
		const timeout = AbortSignal.timeout.bind(AbortSignal);
		vi.spyOn(AbortSignal, "timeout").mockImplementation(ms => timeout(ms === 20_000 ? 500 : 10));
		const fetch = vi.fn().mockImplementationOnce(() => new Promise<Response>(() => {}))
			.mockResolvedValueOnce(json({ organic: [] }));
		vi.stubGlobal("fetch", fetch);
		const result = await createSearch(exec)({ query: "topic", count: 5 });
		expect(result).toMatchObject({ backend: "serper", recovery: "searxng:timeout" });
		expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
		expect(fetch.mock.calls[1][1].signal.aborted).toBe(false);
	});
	it("bounds lazy BWS lookup separately and continues to another configured fallback", async () => {
		vi.stubEnv("SERPER_API_KEY", ""); vi.stubEnv("BRAVE_SEARCH_API_KEY", ""); vi.stubEnv("BITWARDEN_ACCESS_KEY", "fixture-only");
		const timeout = AbortSignal.timeout.bind(AbortSignal);
		vi.spyOn(AbortSignal, "timeout").mockImplementation(ms => timeout(ms === 20_000 ? 500 : 15));
		const lookup = vi.fn().mockImplementationOnce(() => new Promise(() => {}))
			.mockResolvedValueOnce({ code: 0, killed: false, stdout: JSON.stringify({ key: "BRAVE_SEARCH_API_KEY", value: "fixture-brave" }), stderr: "" });
		const fetch = vi.fn().mockResolvedValueOnce(json({}, 503))
			.mockResolvedValueOnce(json({ web: { results: [] } }));
		vi.stubGlobal("fetch", fetch);
		expect(await createSearch(lookup)({ query: "topic", count: 5 })).toMatchObject({ backend: "brave", recovery: "searxng:unavailable; serper:credentials" });
		expect(lookup).toHaveBeenCalledTimes(2);
		expect(fetch).toHaveBeenCalledTimes(2);
	});
	it.each(["images", "news"] as const)("retains %s kind through Serper fallback", async kind => {
		const item = { title: "Source", link: "https://example.com/page", imageUrl: "https://images.example.com/full.png", thumbnailUrl: "https://images.example.com/thumb.png", imageWidth: 1200, imageHeight: 800, snippet: "Snippet", source: "Publication", date: "2026-11-13" };
		const fetch = vi.fn().mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json({ [kind]: [item] })); vi.stubGlobal("fetch", fetch);
		const result = await createSearch(exec)({ query: 'topic "exact" -excluded site:example.com', count: 5, kind });
		expect(fetch.mock.calls[1][0]).toBe(`https://google.serper.dev/${kind}`);
		expect(JSON.parse(fetch.mock.calls[1][1].body).q).toBe('topic "exact" -excluded site:example.com');
		expect(result.backend).toBe("serper"); expect(result.results[0].url).toBe("https://example.com/page");
		if (kind === "images") expect(result.results[0]).toMatchObject({ imageUrl: item.imageUrl, thumbnailUrl: item.thumbnailUrl, width: 1200, height: 800 });
		else expect(result.results[0]).toMatchObject({ source: "Publication", publishedDate: "2026-11-13" });
		expect(fetch).toHaveBeenCalledTimes(2);
	});
	it("does not spend a Brave web request on an unconfirmed image entitlement", async () => {
		const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
		await expect(createSearch(exec)({ query: "topic", count: 5, provider: "brave", kind: "images" })).rejects.toMatchObject({ kind: "unsupported" });
		expect(fetch).not.toHaveBeenCalled(); expect(exec).not.toHaveBeenCalled();
	});
	it("reaches Firecrawl only after existing providers fail, without turning valid empty results into failure", async () => {
		vi.stubEnv("FIRECRAWL_API_KEY", "fixture-auto-search");
		const fetch = vi.fn().mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json({}, 503))
			.mockResolvedValueOnce(json({ success: true, data: { web: [] } })); vi.stubGlobal("fetch", fetch);
		expect(await createSearch(exec)({ query: "topic", count: 5 })).toMatchObject({ backend: "firecrawl", results: [] });
		expect(fetch.mock.calls[3][0]).toBe("https://api.firecrawl.dev/v2/search"); expect(fetch).toHaveBeenCalledTimes(4);
	});
	it("classifies exhausted-credit responses without exposing raw error bodies", async () => {
		const fetch = vi.fn().mockResolvedValueOnce(json({}, 503))
			.mockResolvedValueOnce(new Response("credit quota exhausted; opaque raw payload", { status: 403 }))
			.mockResolvedValueOnce(json({ web: { results: [] } }));
		vi.stubGlobal("fetch", fetch);
		const result = await createSearch(exec)({ query: "topic", count: 5 });
		expect(result.recovery).toBe("searxng:unavailable; serper:quota");
		expect(JSON.stringify(result)).not.toContain("opaque raw payload");
	});
});

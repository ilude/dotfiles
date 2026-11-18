import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import webTools from "../extensions/web-tools/index.ts";
import { acquisitionBudget } from "../extensions/web-tools/acquisition.ts";
import { requestBrowserbase } from "../extensions/web-tools/browserbase.ts";
import { resetGatewayCredentialCacheForTest } from "../extensions/web-tools/credentials.ts";
const complete = vi.hoisted(() => vi.fn());
vi.mock("@earendil-works/pi-coding-agent", async original => ({
	...await original(), getAgentDir: () => "/test-profile",
	ModelRuntime: { create: async () => ({
		getAvailable: async () => [{ provider: "openai", id: "gpt-6-luna", name: "Luna", api: "openai-responses", baseUrl: "https://unused.invalid", reasoning: true, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1000, maxTokens: 100 }], completeSimple: complete,
	}) },
}));
const json = (value: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(value), { status, headers });
let key = 0;
beforeEach(() => {
	vi.stubEnv("BROWSERBASE_API_KEY", `fixture-browserbase-${++key}`); vi.stubEnv("BITWARDEN_ACCESS_KEY", "");
	complete.mockResolvedValue({ stopReason: "stop", content: [{ type: "text", text: '{"suspicious":false,"excerpts":[]}' }] });
	resetGatewayCredentialCacheForTest();
});
afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); resetGatewayCredentialCacheForTest(); });
function tools() {
	const registered = new Map<string, any>(); const exec = vi.fn();
	webTools({ registerTool: (tool: any) => registered.set(tool.name, tool), exec } as any);
	return { search: (params: Record<string, unknown> = {}, signal?: AbortSignal) => registered.get("web_search").execute("id", { query: "topic", provider: "browserbase", ...params }, signal),
		page: (params: Record<string, unknown> = {}, signal?: AbortSignal) => registered.get("web_fetch").execute("id", { url: "https://8.8.8.8/docs", backend: "browserbase-static", ...params }, signal), exec };
}
describe("Browserbase schema extraction", () => {
	const schema = { type: "object", properties: { title: { type: "string" } }, required: ["title"] };
	it("uses the native static JSON/schema API without a browser or raw/LLM fallback on ordinary reads", async () => {
		const fetch = vi.fn().mockResolvedValue(json({ statusCode: 200, content: { title: "Exact value" } })); vi.stubGlobal("fetch", fetch);
		const result = await tools().page({ format: "json", schema });
		expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ url: "https://8.8.8.8/docs", format: "json", schema, allowRedirects: false, allowInsecureSsl: false, proxies: false });
		expect(result.structuredContent).toMatchObject({ format: "json", data: { title: "Exact value" }, backend: "browserbase-static" });
		expect(complete.mock.calls[0][1].messages[0].content).toBe(JSON.stringify({ title: "Exact value" }, null, 2)); expect(fetch).toHaveBeenCalledOnce();
	});
	it("can use a second supported schema provider while preserving the failure trace", async () => {
		vi.stubEnv("FIRECRAWL_API_KEY", `fixture-schema-fallback-${key}`);
		const fetch = vi.fn().mockResolvedValueOnce(json({}, 402)).mockResolvedValueOnce(json({ statusCode: 200, content: { title: "Fallback value" } })); vi.stubGlobal("fetch", fetch);
		const result = await tools().page({ backend: "auto", format: "json", schema });
		expect(result.structuredContent).toMatchObject({ backend: "browserbase-static", data: { title: "Fallback value" }, recovery: "firecrawl:quota" });
		expect(result.structuredContent.attempts.map((value: { backend: string }) => value.backend)).toEqual(["firecrawl", "browserbase-static"]); expect(fetch).toHaveBeenCalledTimes(2);
	});
	it("leaves raw retrieval usable when the Extract allowance is unavailable", async () => {
		const fetch = vi.fn().mockResolvedValueOnce(json({}, 402)).mockResolvedValueOnce(json({ statusCode: 200, contentType: "text/plain", content: "Raw readable text" })); vi.stubGlobal("fetch", fetch);
		const { page } = tools(); await expect(page({ format: "json", schema })).rejects.toMatchObject({ kind: "quota" });
		expect((await page()).structuredContent.content).toBe("Raw readable text"); expect(fetch).toHaveBeenCalledTimes(2);
	});
	it("does not substitute a browser agent for unsupported rendered schema extraction", async () => {
		const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
		await expect(tools().page({ format: "json", schema, backend: "browserbase-rendered" })).rejects.toMatchObject({ kind: "unsupported" }); expect(fetch).not.toHaveBeenCalled();
	});
});
describe("Browserbase static retrieval", () => {
	it("uses raw Fetch and the isolated local extractor without executing page JavaScript", async () => {
		const fetch = vi.fn().mockResolvedValue(json({ statusCode: 200, contentType: "text/html", encoding: "utf8", content: "<html><title>Static page</title><main>Useful static text.</main><script>throw new Error('not executed')</script></html>", headers: { "set-cookie": "not forwarded" } })); vi.stubGlobal("fetch", fetch);
		const result = await tools().page();
		expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ url: "https://8.8.8.8/docs", format: "raw", allowRedirects: false, allowInsecureSsl: false, proxies: false });
		expect(result.structuredContent).toMatchObject({ backend: "browserbase-static", finalUrl: "https://8.8.8.8/docs", truncated: false });
		expect(result.structuredContent.content).toContain("Useful static text.");
		expect(JSON.stringify(result)).not.toContain("not forwarded"); expect(JSON.stringify(result)).not.toContain("not executed");
		expect(fetch).toHaveBeenCalledOnce(); expect(complete).toHaveBeenCalledOnce();
	}, 60_000);
	it("follows only revalidated public redirects and never forwards response cookies", async () => {
		const fetch = vi.fn().mockResolvedValueOnce(json({ statusCode: 302, headers: { Location: "https://8.8.4.4/final", "set-cookie": "not forwarded" } }))
			.mockResolvedValueOnce(json({ statusCode: 200, contentType: "text/plain", content: "Final body" })); vi.stubGlobal("fetch", fetch);
		expect((await tools().page()).structuredContent.finalUrl).toBe("https://8.8.4.4/final");
		expect(JSON.parse(fetch.mock.calls[1][1].body).url).toBe("https://8.8.4.4/final"); expect(JSON.stringify(fetch.mock.calls[1])).not.toContain("not forwarded");
	});
	it("blocks private targets and redirect destinations before sending them to the provider", async () => {
		const fetch = vi.fn().mockResolvedValue(json({ statusCode: 302, headers: { location: "http://127.0.0.1/private" } })); vi.stubGlobal("fetch", fetch);
		const { page } = tools(); await expect(page({ url: "http://127.0.0.1/private" })).rejects.toThrow("local/private"); expect(fetch).not.toHaveBeenCalled();
		await expect(page()).rejects.toThrow("local/private"); expect(fetch).toHaveBeenCalledOnce();
	});
	it("keeps target failures terminal and binary formats unsupported", async () => {
		const fetch = vi.fn().mockResolvedValueOnce(json({ statusCode: 404, content: "Error page" })).mockResolvedValueOnce(json({ statusCode: 200, encoding: "base64", content: "binary" })); vi.stubGlobal("fetch", fetch);
		await expect(tools().page()).rejects.toMatchObject({ kind: "not-found", eligible: false });
		await expect(tools().page()).rejects.toMatchObject({ kind: "unsupported" }); expect(complete).not.toHaveBeenCalled();
	});
});

describe("explicit Browserbase web search", () => {
	it("uses included fast search without a browser session or implicit page scraping", async () => {
		const fetch = vi.fn().mockResolvedValue(json({ provider: "parallel", mode: "fast", results: [{ id: "hit", title: "Page", url: "https://example.com", excerpts: ["First", "Second"], publishedDate: "2026-11-13", privatePayload: "not returned" }] })); vi.stubGlobal("fetch", fetch);
		const { search, exec } = tools(); const result = await search();
		expect(fetch.mock.calls[0][0]).toBe("https://api.browserbase.com/v1/search");
		expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ query: "topic", numResults: 5, provider: "parallel", mode: "fast", excerpts: true });
		expect(fetch.mock.calls[0][1].headers["X-BB-API-Key"]).toContain("fixture-browserbase");
		expect(result.structuredContent).toMatchObject({ backend: "browserbase", items: [{ title: "Page", content: "First\nSecond", publishedDate: "2026-11-13", engine: "browserbase:parallel:fast" }] });
		expect(JSON.stringify(result)).not.toContain("not returned"); expect(exec).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledOnce();
	});
	it("preserves valid empty results and rejects unsupported filters or query length before acquisition", async () => {
		const fetch = vi.fn().mockResolvedValue(json({ results: [] })); vi.stubGlobal("fetch", fetch);
		const { search } = tools(); expect((await search()).structuredContent.screening).toBe("no-results");
		for (const params of [{ site: "example.com" }, { exact_phrases: ["exact phrase"] }, { query: "x".repeat(201) }, { engines: ["github"] }]) await expect(search(params)).rejects.toThrow();
		expect(fetch).toHaveBeenCalledOnce(); expect(complete).not.toHaveBeenCalled();
	});
	it.each([[402, "quota"], [403, "unsupported"], [429, "rate-limit"], [503, "unavailable"]])("reports API %i without provider substitution", async (status, kind) => {
		const fetch = vi.fn().mockResolvedValue(json({}, Number(status))); vi.stubGlobal("fetch", fetch);
		await expect(tools().search()).rejects.toMatchObject({ kind }); expect(fetch).toHaveBeenCalledOnce();
	});
	it("keeps search backoff separate from static fetch and reopens without reload", async () => {
		const fetch = vi.fn().mockResolvedValueOnce(json({}, 429, { "retry-after": "1" })).mockResolvedValueOnce(json({ content: "raw" })).mockResolvedValueOnce(json({ results: [] })); vi.stubGlobal("fetch", fetch);
		const now = Date.now(); const clock = vi.spyOn(Date, "now").mockReturnValue(now); const { search } = tools();
		await expect(search()).rejects.toThrow("429"); await expect(search()).rejects.toThrow("429");
		expect(fetch).toHaveBeenCalledOnce();
		expect(await requestBrowserbase("/v1/fetch", { url: "https://example.com", format: "raw" }, acquisitionBudget(1000), "raw-fetch")).toMatchObject({ content: "raw" });
		clock.mockReturnValue(now + 1001); expect((await search()).structuredContent.backend).toBe("browserbase"); expect(fetch).toHaveBeenCalledTimes(3);
	});
	it("does not accept a returned deep mode or leak unprojected results", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ provider: "exa", mode: "deep", results: [] })));
		await expect(tools().search()).rejects.toThrow("unrequested search mode");
	});
});

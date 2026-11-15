import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import webTools from "../extensions/web-tools/index.ts";
import { resetGatewayCredentialCacheForTest } from "../extensions/web-tools/credentials.ts";

const complete = vi.hoisted(() => vi.fn());
vi.mock("@earendil-works/pi-coding-agent", async original => ({
	...await original(), getAgentDir: () => "/test-profile",
	ModelRuntime: { create: async () => ({
		getAvailable: async () => [{ provider: "openai", id: "gpt-6-luna", name: "Luna", api: "openai-responses", baseUrl: "https://unused.invalid", reasoning: true, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1000, maxTokens: 100 }],
		completeSimple: complete,
	}) },
}));
const page = { success: true, data: { markdown: "Readable page content.", metadata: { title: "Page", statusCode: 200, sourceURL: "https://8.8.8.8/docs", cacheState: "hit", cachedAt: "2026-11-13T10:00:00Z" }, rawHtml: "opaque payload must not escape" } };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
beforeEach(() => {
	vi.stubEnv("FIRECRAWL_API_KEY", "fixture-firecrawl"); vi.stubEnv("BITWARDEN_ACCESS_KEY", "");
	complete.mockResolvedValue({ stopReason: "stop", content: [{ type: "text", text: '{"suspicious":false,"excerpts":[]}' }] });
	resetGatewayCredentialCacheForTest();
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); resetGatewayCredentialCacheForTest(); });
function tool() {
	let fetchTool: any;
	const exec = vi.fn(async () => ({ code: 0, killed: false, stdout: JSON.stringify({ version: 1, backend: "local", content: "Local page", finalUrl: null, truncated: false, attempts: [{ backend: "local", outcome: "useful" }] }), stderr: "" }));
	webTools({ registerTool: (value: any) => { if (value.name === "web_fetch") fetchTool = value; }, exec } as any);
	return { run: (params: Record<string, unknown> = {}, signal?: AbortSignal) => fetchTool.execute("id", { url: "https://8.8.8.8/docs", backend: "firecrawl", ...params }, signal), exec };
}
describe("explicit native Firecrawl retrieval", () => {
	it("requests only basic Markdown, accepts provider caching and screens the projected page", async () => {
		const fetch = vi.fn().mockResolvedValue(json(page)); vi.stubGlobal("fetch", fetch);
		const { run, exec } = tool(); const result = await run();
		expect(fetch.mock.calls[0][0]).toBe("https://api.firecrawl.dev/v2/scrape");
		const options = fetch.mock.calls[0][1]; const body = JSON.parse(options.body);
		expect(options.headers.Authorization).toBe("Bearer fixture-firecrawl");
		expect(options.redirect).toBe("error");
		expect(body).toMatchObject({ url: "https://8.8.8.8/docs", formats: ["markdown"], proxy: "basic", onlyMainContent: true, parsers: [] });
		expect(body).not.toHaveProperty("maxAge"); expect(body).not.toHaveProperty("actions");
		expect(body.timeout).toBeGreaterThanOrEqual(1000); expect(body.timeout).toBeLessThanOrEqual(45_000);
		expect(result.structuredContent).toMatchObject({ backend: "firecrawl", finalUrl: null, truncated: false, cache: { state: "hit", cachedAt: "2026-11-13T10:00:00.000Z" }, content: "# Page\n\nReadable page content." });
		expect(result.structuredContent).not.toHaveProperty("quality");
		expect(JSON.stringify(result)).not.toContain("opaque payload");
		expect(JSON.stringify(result)).not.toContain("fixture-firecrawl");
		expect(complete.mock.calls[0][1].messages[0].content).toBe("# Page\n\nReadable page content.");
		expect(exec).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledTimes(1);
	});
	it("does not enable automatic Firecrawl acquisition in this explicit-only increment", async () => {
		const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
		expect((await tool().run({ backend: "auto" })).structuredContent.backend).toBe("local");
		expect(fetch).not.toHaveBeenCalled();
	});
	it("rejects private/local targets before any provider or credential request", async () => {
		const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
		const { run, exec } = tool();
		await expect(run({ url: "http://127.0.0.1/private" })).rejects.toThrow("local/private");
		expect(fetch).not.toHaveBeenCalled(); expect(exec).not.toHaveBeenCalled();
	});
	it.each([[402, "quota"], [429, "rate-limit"], [403, "unsupported"], [500, "unavailable"]])("reports API %i strictly without another acquisition", async (status, kind) => {
		const fetch = vi.fn().mockResolvedValue(json({ error: "opaque provider response" }, Number(status))); vi.stubGlobal("fetch", fetch);
		const { run, exec } = tool();
		await expect(run()).rejects.toMatchObject({ kind });
		expect(fetch).toHaveBeenCalledTimes(1); expect(exec).not.toHaveBeenCalled(); expect(complete).not.toHaveBeenCalled();
	});
	it.each([401, 403, 404, 410])("does not mistake target HTTP %i for API success", async status => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ success: true, data: { markdown: "Error page", metadata: { statusCode: status } } })));
		await expect(tool().run()).rejects.toMatchObject({ kind: status === 401 || status === 403 ? "authentication" : "not-found", eligible: false });
		expect(complete).not.toHaveBeenCalled();
	});
	it("returns bounded partial data without trying to improve it", async () => {
		const fetch = vi.fn().mockResolvedValue(json(page)); vi.stubGlobal("fetch", fetch);
		const result = await tool().run({ max_chars: 10 });
		expect(result.structuredContent.truncated).toBe(true);
		expect(result.structuredContent.attempts[0].outcome).toBe("partial");
		expect(fetch).toHaveBeenCalledTimes(1);
	});
	it("rejects empty or malformed provider output before screening", async () => {
		for (const value of [{ success: false }, { success: true, data: { markdown: "" } }, "not-json"]) {
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue(typeof value === "string" ? new Response(value) : json(value)));
			await expect(tool().run()).rejects.toThrow();
		}
		expect(complete).not.toHaveBeenCalled();
	});
	it("cancels oversized response bodies before parsing or screening", async () => {
		const cancel = vi.fn();
		const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1)); }, cancel });
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
		await expect(tool().run()).rejects.toThrow("byte limit");
		expect(cancel).toHaveBeenCalledOnce(); expect(complete).not.toHaveBeenCalled();
	});
	it("keeps a screening flag outside provider fallback", async () => {
		const fetch = vi.fn().mockResolvedValue(json(page)); vi.stubGlobal("fetch", fetch);
		complete.mockResolvedValue({ stopReason: "stop", content: [{ type: "text", text: '{"suspicious":true,"excerpts":["Readable page content."]}' }] });
		await expect(tool().run()).rejects.toThrow("Web content blocked");
		expect(fetch).toHaveBeenCalledTimes(1);
	});
	it("cancels a transport that ignores its signal without trying another provider", async () => {
		let entered: () => void = () => {};
		const started = new Promise<void>(resolve => { entered = resolve; });
		const fetch = vi.fn(() => { entered(); return new Promise<Response>(() => {}); }); vi.stubGlobal("fetch", fetch);
		const controller = new AbortController(); const pending = tool().run({}, controller.signal);
		await started; controller.abort();
		await expect(pending).rejects.toMatchObject({ name: "AbortError" });
		expect(fetch).toHaveBeenCalledTimes(1);
	});
});

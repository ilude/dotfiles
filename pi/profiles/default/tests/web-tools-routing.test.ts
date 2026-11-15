import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFetch } from "../extensions/web-tools/fetch.ts";
import { GatewayError } from "../extensions/web-tools/gateway.ts";
const gateway = vi.hoisted(() => vi.fn());
vi.mock("../extensions/web-tools/gateway.ts", async original => ({ ...await original(), requestGateway: gateway }));
const failure = (kind = "unavailable") => ({ code: 1, killed: false, stdout: "", stderr: JSON.stringify({ error: { kind, message: `Local ${kind}` }, attempts: [{ backend: "local", outcome: "failed" }, { backend: "jina", outcome: "failed" }] }) });
const local = { code: 0, killed: false, stderr: "", stdout: JSON.stringify({ version: 1, backend: "local", content: "Partial page", finalUrl: "https://8.8.8.8/", truncated: true, attempts: [{ backend: "local", outcome: "partial" }] }) };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
let key = 0;
beforeEach(() => {
	vi.stubEnv("WEB_FETCH_GATEWAY_TOKEN", "fixture-gateway"); vi.stubEnv("WEB_FETCH_GATEWAY_URL", "https://gateway.example");
	vi.stubEnv("FIRECRAWL_API_KEY", `fixture-route-${++key}`); vi.stubEnv("BROWSERBASE_API_KEY", ""); vi.stubEnv("BITWARDEN_ACCESS_KEY", "");
	gateway.mockReset().mockRejectedValue(new GatewayError("availability", "offline"));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("automatic fetch acquisition", () => {
	it("reaches Firecrawl only after existing acquisition failures and retains the actual trace", async () => {
		const events: string[] = [];
		gateway.mockImplementation(async () => { events.push("gateway"); throw new GatewayError("availability", "offline"); });
		const exec = vi.fn(async () => { events.push("local/jina"); return failure(); });
		const fetch = vi.fn(async () => { events.push("firecrawl"); return json({ success: true, data: { markdown: "Cloud page", metadata: { statusCode: 200 } } }); }); vi.stubGlobal("fetch", fetch);
		const result = await createFetch(exec)({ url: "https://8.8.8.8/", maxChars: 8000 });
		expect(events).toEqual(["gateway", "local/jina", "firecrawl"]); expect(result.backend).toBe("firecrawl");
		expect(result.attempts.map(attempt => attempt.backend)).toEqual(["local", "jina", "firecrawl"]);
	});
	it("returns partial local data without consuming another allowance", async () => {
		const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
		expect((await createFetch(vi.fn(async () => local))({ url: "https://8.8.8.8/", maxChars: 8000 })).truncated).toBe(true);
		expect(fetch).not.toHaveBeenCalled();
	});
	it.each(["not-found", "authentication", "invalid-request"])("does not spend cloud allowance after %s", async kind => {
		const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
		await expect(createFetch(vi.fn(async () => failure(kind)))({ url: "https://8.8.8.8/", maxChars: 8000 })).rejects.toMatchObject({ kind });
		expect(fetch).not.toHaveBeenCalled();
	});
	it("does not replay definitive gateway target failures", async () => {
		gateway.mockRejectedValue(new GatewayError("acquisition", "gone", "not-found")); const exec = vi.fn(); const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
		await expect(createFetch(exec)({ url: "https://8.8.8.8/", maxChars: 8000 })).rejects.toMatchObject({ kind: "not-found" });
		expect(exec).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
	});
	it("never exports a failing private target", async () => {
		const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
		await expect(createFetch(vi.fn(async () => failure()))({ url: "http://127.0.0.1/", maxChars: 8000 })).rejects.toThrow();
		expect(gateway).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
	});
	it("keeps explicit selection strict and cancellation outside fallback", async () => {
		const fetch = vi.fn().mockResolvedValue(json({}, 402)); vi.stubGlobal("fetch", fetch); const exec = vi.fn();
		await expect(createFetch(exec)({ url: "https://8.8.8.8/", maxChars: 8000, backend: "firecrawl" })).rejects.toMatchObject({ kind: "quota" });
		expect(exec).not.toHaveBeenCalled(); expect(gateway).not.toHaveBeenCalled();
		const controller = new AbortController(); gateway.mockImplementation(async () => { controller.abort(); throw new GatewayError("availability", "cancelled"); });
		await expect(createFetch(exec)({ url: "https://8.8.8.8/", maxChars: 8000 }, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
		expect(fetch).toHaveBeenCalledOnce();
	});
});

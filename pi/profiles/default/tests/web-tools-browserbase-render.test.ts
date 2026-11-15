import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acquisitionBudget } from "../extensions/web-tools/acquisition.ts";
import { renderBrowserbase } from "../extensions/web-tools/browserbase-render.ts";
const fixture = vi.hoisted(() => ({ commands: vi.fn(), closed: vi.fn(), navigation: undefined as undefined | (() => void), handler: undefined as undefined | ((event: { method: string; params: Record<string, unknown>; sessionId?: string }) => void) }));
vi.mock("../lib/browser-cdp-transport.ts", () => ({
	CdpConnection: class {
		onEvent(handler: typeof fixture.handler) { fixture.handler = handler; return () => {}; }
		close() { fixture.closed(); }
		command(method: string, params: Record<string, unknown>, sessionId?: string) { return fixture.commands(method, params, sessionId); }
	},
}));
vi.mock("../extensions/web-tools/local-parser.ts", () => ({ parseHtml: async () => ({ backend: "local", content: "Rendered readable text", finalUrl: "https://8.8.8.8/", truncated: false, attempts: [] }) }));
let key = 0;
beforeEach(() => {
	vi.stubEnv("BROWSERBASE_API_KEY", `fixture-render-${++key}`);
	fixture.closed.mockClear(); fixture.commands.mockReset(); fixture.navigation = undefined; fixture.handler = undefined;
	fixture.commands.mockImplementation(async (method: string) => {
		if (method === "Target.getTargets") return { targetInfos: [{ type: "page", targetId: "owned-page" }] };
		if (method === "Target.attachToTarget") return { sessionId: "owned-attachment" };
		if (method === "Page.getFrameTree") return { frameTree: { frame: { id: "main-frame" } } };
		if (method === "Page.navigate") {
			fixture.navigation?.();
			fixture.handler?.({ method: "Network.responseReceived", sessionId: "owned-attachment", params: { frameId: "main-frame", type: "Document", response: { status: 200 } } });
			fixture.handler?.({ method: "Page.loadEventFired", sessionId: "owned-attachment", params: {} }); return {};
		}
		if (method === "Page.createIsolatedWorld") return { executionContextId: 7 };
		if (method === "Runtime.evaluate") return { result: { value: { html: "<main>Rendered readable text</main>", url: "https://8.8.8.8/", truncated: false } } };
		return {};
	});
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
function api(connectUrl = "wss://connect.browserbase.com/?apiKey=opaque-secret") {
	const fetch = vi.fn(async (url: string, _options: { body: string; signal: AbortSignal }) => url.endsWith("/v1/sessions") ? response({ id: "owned-session", connectUrl, signingKey: "must-not-return" }) : response({ status: "COMPLETED" }));
	vi.stubGlobal("fetch", fetch); return fetch;
}
describe("owned public rendered reads", () => {
	it("uses only the fresh session, isolated DOM reading and explicit release", async () => {
		const fetch = api();
		const result = await renderBrowserbase("https://8.8.8.8/", 8000, acquisitionBudget(60_000));
		expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ timeout: 60, proxies: false, browserSettings: { solveCaptchas: false } });
		expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ status: "REQUEST_RELEASE" });
		expect(fetch.mock.calls[1][0]).toBe("https://api.browserbase.com/v1/sessions/owned-session");
		expect(result).toMatchObject({ backend: "browserbase-rendered", content: "Rendered readable text", session: { id: "owned-session", released: true } });
		expect(JSON.stringify(result)).not.toContain("opaque-secret"); expect(JSON.stringify(result)).not.toContain("must-not-return");
		expect(fixture.closed).toHaveBeenCalledOnce();
		expect(fixture.commands.mock.calls.map(call => call[0])).not.toContain("Browser.close");
		expect(fixture.commands.mock.calls.find(call => call[0] === "Runtime.evaluate")?.[1]).toMatchObject({ contextId: 7, returnByValue: true });
	});
	it("releases the returned owned ID after malformed CDP connection data", async () => {
		const fetch = api("ws://127.0.0.1:9222/");
		await expect(renderBrowserbase("https://8.8.8.8/", 8000, acquisitionBudget(60_000))).rejects.toMatchObject({ kind: "invalid-response" });
		expect(fetch).toHaveBeenCalledTimes(2); expect(fetch.mock.calls[1][0]).toContain("/owned-session");
	});
	it("releases on cancellation with a separate bounded cleanup signal", async () => {
		const fetch = api(); const controller = new AbortController(); fixture.navigation = () => controller.abort();
		await expect(renderBrowserbase("https://8.8.8.8/", 8000, acquisitionBudget(60_000, controller.signal))).rejects.toMatchObject({ name: "AbortError" });
		expect(fetch).toHaveBeenCalledTimes(2); expect(fetch.mock.calls[1][1].signal.aborted).toBe(false);
	});
	it("does not hide failed release or create another session to improve a partial result", async () => {
		const fetch = vi.fn().mockResolvedValueOnce(response({ id: "owned-release-failure", connectUrl: "wss://connect.browserbase.com/" })).mockResolvedValueOnce(response({}, 503)); vi.stubGlobal("fetch", fetch);
		const result = await renderBrowserbase("https://8.8.8.8/", 8000, acquisitionBudget(60_000));
		expect(result.session).toEqual({ id: "owned-release-failure", released: false });
		expect(result.content).toContain("could not be released"); expect(fetch).toHaveBeenCalledTimes(2);
	});
	it("blocks local/private browser requests without forwarding them", async () => {
		api(); fixture.navigation = () => fixture.handler?.({ method: "Fetch.requestPaused", sessionId: "owned-attachment", params: { requestId: "private-request", request: { url: "http://127.0.0.1/private" } } });
		await expect(renderBrowserbase("https://8.8.8.8/", 8000, acquisitionBudget(60_000))).rejects.toMatchObject({ kind: "invalid-request" });
		expect(fixture.commands.mock.calls.some(call => call[0] === "Fetch.continueRequest" && call[1].requestId === "private-request")).toBe(false);
	});
});

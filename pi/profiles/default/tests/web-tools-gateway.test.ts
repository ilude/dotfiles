import { afterEach, describe, expect, it, vi } from "vitest";
import { GatewayCircuit } from "../extensions/web-tools/circuit.ts";
import { GatewayError, gatewayText, validateGatewayReply } from "../extensions/web-tools/gateway.ts";
import webTools from "../extensions/web-tools/index.ts";
const gateway = vi.hoisted(() => vi.fn());
const complete = vi.hoisted(() => vi.fn());
vi.mock("../extensions/web-tools/gateway.ts", async original => ({ ...await original(), requestGateway: gateway }));
vi.mock("@earendil-works/pi-coding-agent", async original => ({
  ...await original(), getAgentDir: () => "/test-profile",
  ModelRuntime: { create: async () => ({ getModel: () => ({}), completeSimple: complete }) },
}));
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
const reply = { ok: true, request_id: "fixture", requested_url: "https://8.8.8.8/", final_url: "https://8.8.8.8/", fetched_at: new Date().toISOString(), elapsed_ms: 5, attempts: [{ backend: "trawl", revision: "test", elapsed_ms: 5, outcome: "useful", reason: null, http_status: 200, tier: 3 }], backend: "trawl", title: "Page", content: "Readable article", format: "markdown", quality: "useful", truncated: false, warnings: [] };
function tool() {
  let fetchTool: any;
  const exec = vi.fn(async () => ({ code: 0, killed: false, stdout: "Local content", stderr: "" }));
  webTools({ registerTool: (t: any) => { if (t.name === "web_fetch") fetchTool = t; }, exec } as any);
  complete.mockResolvedValue({ stopReason: "stop", content: [{ type: "text", text: '{"suspicious":false,"excerpts":[]}' }] });
  vi.stubEnv("WEB_FETCH_GATEWAY_URL", "https://gateway.example.com"); vi.stubEnv("WEB_FETCH_GATEWAY_TOKEN", "test-token");
  return { run: (backend = "auto", url = "https://8.8.8.8/") => fetchTool.execute("id", { url, backend }), exec };
}
describe("gateway circuit", () => {
  it("recovers per request, opens after three failures, and allows only one half-open probe", () => {
    let now = 0; const circuit = new GatewayCircuit(() => now); circuit.configure("endpoint", "token");
    for (let i = 0; i < 3; i++) { expect(circuit.acquire()).toBe(true); circuit.unavailable(); }
    expect(circuit.acquire()).toBe(false); now = 30001;
    expect(circuit.acquire()).toBe(true); expect(circuit.acquire()).toBe(false);
    circuit.unavailable(); expect(circuit.acquire()).toBe(false); now += 30001;
    expect(circuit.acquire()).toBe(true); circuit.reachable(); expect(circuit.acquire()).toBe(true);
  });
  it("does not count cancellation and resets on credential changes", () => {
    let now = 0; const circuit = new GatewayCircuit(() => now); circuit.configure("a", "t");
    circuit.unavailable(); circuit.cancelled(); expect(circuit.acquire()).toBe(true);
    circuit.unavailable(); circuit.unavailable(); now += 30001;
    expect(circuit.acquire()).toBe(true); circuit.cancelled(); expect(circuit.acquire()).toBe(true);
    circuit.configure("a", "new-token"); expect(circuit.acquire()).toBe(true);
  });
});
describe("Pi gateway integration", () => {
  it("screens successful content exactly once and keeps metadata out of displayed context", async () => {
    const { run, exec } = tool(); gateway.mockResolvedValue(reply);
    const result = await run();
    expect(result.content[0].text).toBe("webfetch: https://8.8.8.8/\n# Page\n\nReadable article"); expect(exec).not.toHaveBeenCalled();
    expect(result.details).toMatchObject({ backend: "trawl", quality: "useful", finalUrl: "https://8.8.8.8/" });
    expect(complete).toHaveBeenCalledTimes(1); expect(complete.mock.calls[0][1].messages[0].content).toBe("# Page\n\nReadable article");
  });
  it("uses immediate local recovery, then skips an open gateway circuit", async () => {
    const { run, exec } = tool(); gateway.mockRejectedValue(new GatewayError("availability", "offline"));
    for (let i = 0; i < 4; i++) expect((await run()).content[0].text).toContain("Local content");
    expect(gateway).toHaveBeenCalledTimes(3); expect(exec).toHaveBeenCalledTimes(4);
  });
  it.each(["configuration", "acquisition"] as const)("does not replay %s errors", async kind => {
    const { run, exec } = tool(); gateway.mockRejectedValue(new GatewayError(kind, "explicit failure"));
    await expect(run()).rejects.toThrow("explicit failure"); expect(exec).not.toHaveBeenCalled();
  });
  it("keeps explicit backends strict and local/private targets off remote services", async () => {
    const { run, exec } = tool(); gateway.mockRejectedValue(new GatewayError("availability", "offline"));
    await expect(run("trawl")).rejects.toThrow("offline"); expect(exec).not.toHaveBeenCalled();
    gateway.mockClear(); await run("auto", "http://127.0.0.1:8000/"); expect(gateway).not.toHaveBeenCalled();
    await expect(run("jina", "http://127.0.0.1:8000/")).rejects.toThrow(/local\/private/);
  });
  it("falls back automatically but reports unavailable BWS credentials for explicit Trawl", async () => {
    const { run, exec } = tool(); vi.stubEnv("WEB_FETCH_GATEWAY_TOKEN", "");
    expect((await run()).content[0].text).toContain("Local content");
    await expect(run("trawl")).rejects.toThrow(/credential unavailable/); expect(exec).toHaveBeenCalled();
  });
  it("rejects invalid replies and discards raw backend payload fields", () => {
    expect(() => validateGatewayReply({ ok: true, content: "x" })).toThrow(/receipt/);
    expect(gatewayText({ ...reply, attempts: [{ ...reply.attempts[0], cookies: "secret-payload", html: "secret-payload" }] })).not.toContain("secret-payload");
  });
});

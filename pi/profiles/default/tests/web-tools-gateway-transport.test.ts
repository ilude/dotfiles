import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
const factory = vi.hoisted(() => vi.fn());
vi.mock("node:https", () => ({ default: { request: factory } }));
import { requestGateway } from "../extensions/web-tools/gateway.ts";
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
const input = { url: "https://example.com/", backend: "auto" as const, max_chars: 8000 };
const receipt = { ok: true, request_id: "test", requested_url: input.url, final_url: input.url, fetched_at: new Date().toISOString(), elapsed_ms: 1, attempts: [], backend: "direct", content: "hi", format: "text", quality: "useful", truncated: false, warnings: [] };
function transport() {
  const req = Object.assign(new EventEmitter(), { destroyed: false, end: vi.fn(), destroy(this: EventEmitter & { destroyed: boolean }, error: Error) { this.destroyed = true; this.emit("error", error); return this; } });
  const socket = Object.assign(new EventEmitter(), { connecting: true });
  let respond: (response: unknown) => void;
  factory.mockImplementation((_url, options, callback) => { respond = callback; options.signal.addEventListener("abort", () => req.destroy(new Error("aborted")), { once: true }); return req; });
  return { req, socket, respond(status: number, body: unknown) {
    const res = Object.assign(new EventEmitter(), { statusCode: status, resume() {}, destroy(this: EventEmitter, error: Error) { this.emit("error", error); } });
    respond!(res); res.emit("data", Buffer.from(typeof body === "string" ? body : JSON.stringify(body))); res.emit("end");
  } };
}
it("times out connection establishment, rather than the whole browser response", async () => {
  vi.useFakeTimers(); const first = transport();
  const promise = requestGateway("https://gateway.example.com", "token", input, new AbortController().signal);
  first.req.emit("socket", first.socket);
  const failed = expect(promise).rejects.toMatchObject({ kind: "availability" });
  await vi.advanceTimersByTimeAsync(3001); await failed; expect(first.req.destroyed).toBe(true);
  const second = transport();
  const slow = requestGateway("https://gateway.example.com", "token", input, new AbortController().signal);
  second.req.emit("socket", second.socket); second.socket.emit("secureConnect");
  await vi.advanceTimersByTimeAsync(15000); expect(second.req.destroyed).toBe(false);
  second.respond(200, receipt); await expect(slow).resolves.toMatchObject({ content: "hi" });
});
it.each([[401, "denied", "configuration"], [502, "upstream offline", "availability"], [422, { ...receipt, ok: false, error: { code: "challenge", message: "challenge" } }, "acquisition"]])("classifies HTTP %i without replaying site/auth failures", async (status, body, kind) => {
  const fake = transport(); const result = requestGateway("https://gateway.example.com", "token", input, new AbortController().signal);
  const rejected = expect(result).rejects.toMatchObject({ kind }); fake.respond(Number(status), body); await rejected;
});
it("does not redirect gateway credentials and bounds response bytes", async () => {
  const fake = transport(); const result = requestGateway("https://gateway.example.com", "token", input, new AbortController().signal);
  const rejected = expect(result).rejects.toMatchObject({ kind: "availability" });
  fake.respond(302, "x".repeat(300001)); await rejected; expect(factory).toHaveBeenCalledTimes(1);
});

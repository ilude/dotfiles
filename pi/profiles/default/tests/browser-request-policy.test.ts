import http from "node:http";
import { createHash } from "node:crypto";
import type { Duplex } from "node:stream";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserCdpTransport } from "../lib/browser-cdp-transport.js";
import { BrowserRequestPolicy, hasNativeSecurityWarning, hostVisibility, parseBrowserDestination, type BrowserRequestPolicyOptions } from "../lib/browser-request-policy.js";
import { effectCandidate, type BrowserEffect } from "../lib/browser-effect-contract.js";
import { BrowserControlError, type BrowserSessionState } from "../lib/browser-control.js";
const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); for (const close of cleanup.splice(0).reverse()) await close(); });
const identity = { sessionId: "synthetic-session", branchId: "branch", generation: 1 };
interface Command { id: number; method: string; params: Record<string, unknown>; sessionId?: string }

/** Real HTTP version endpoint and RFC6455 wire, with synthetic Chromium request-paused events. */
async function fixture(options: Partial<BrowserRequestPolicyOptions> & { initialSecurity?: Record<string, unknown>; earlyRequest?: boolean; children?: boolean } = {}) {
  let socket: Duplex | undefined;
  const commands: Command[] = [], effects: BrowserEffect[] = [];
  const send = (message: unknown) => {
    const body = Buffer.from(JSON.stringify(message)), header = Buffer.alloc(body.length < 126 ? 2 : 4);
    header[0] = 0x81;
    if (body.length < 126) header[1] = body.length; else { header[1] = 126; header.writeUInt16BE(body.length, 2); }
    socket!.write(Buffer.concat([header, body]));
  };
  const server = http.createServer((_request, response) => response.end(JSON.stringify({ webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/browser/fixture` })));
  server.on("upgrade", (request, stream) => {
    socket = stream;
    const accept = createHash("sha1").update(`${request.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
    stream.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    let buffer = Buffer.alloc(0);
    stream.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 2) {
        let size = buffer[1]! & 127, offset = 2;
        if (size === 126) { if (buffer.length < 4) return; size = buffer.readUInt16BE(2); offset = 4; }
        if (buffer.length < offset + 4 + size) return;
        const opcode = buffer[0]! & 15, mask = buffer.subarray(offset, offset + 4), body = Buffer.from(buffer.subarray(offset + 4, offset + 4 + size));
        buffer = buffer.subarray(offset + 4 + size);
        if (opcode === 8) { stream.end(Buffer.from([0x88, 0])); return; }
        for (let i = 0; i < body.length; i++) body[i] = body[i]! ^ mask[i % 4]!;
        if (opcode !== 1) continue;
        const command = JSON.parse(body.toString()) as Command; commands.push(command);
        if (command.method === "Target.autoAttachRelated") send({ method: "Target.attachedToTarget", params: { sessionId: "root-session", waitingForDebugger: false, targetInfo: { targetId: "root", type: "page", url: "https://task.example/" } } });
        if (command.method === "Fetch.enable" && command.sessionId === "root-session" && options.earlyRequest) send({ method: "Fetch.requestPaused", sessionId: "root-session", params: { requestId: "early", frameId: "root-frame", resourceType: "Document", request: { url: "https://public.example/", method: "GET" } } });
        if (options.children && command.method === "Target.setAutoAttach" && command.sessionId === "root-session") {
          // Chromium reports OOPIF and dedicated-worker children; the iframe is also reported again by the browser session.
          send({ method: "Target.attachedToTarget", sessionId: "root-session", params: { sessionId: "iframe-session", waitingForDebugger: true, targetInfo: { targetId: "iframe", type: "iframe", url: "https://idp.example/login", parentId: "root" } } });
          send({ method: "Target.attachedToTarget", sessionId: "root-session", params: { sessionId: "worker-session", waitingForDebugger: true, targetInfo: { targetId: "worker", type: "worker", url: "https://task.example/worker.js" } } });
          send({ method: "Target.attachedToTarget", params: { sessionId: "duplicate-iframe-session", waitingForDebugger: true, targetInfo: { targetId: "iframe", type: "iframe", url: "https://idp.example/login", parentId: "root" } } });
        }
        const unsupported = options.children && ((command.method === "Fetch.enable" && command.sessionId === "worker-session") || (command.method === "Security.enable" && command.sessionId !== "root-session"));
        if (unsupported) { send({ id: command.id, sessionId: command.sessionId, error: { code: command.method === "Fetch.enable" ? -32601 : -32000, message: "synthetic unsupported" } }); continue; }
        if (command.method === "Security.enable" && options.initialSecurity) send({ method: "Security.visibleSecurityStateChanged", sessionId: command.sessionId, params: { visibleSecurityState: options.initialSecurity } });
        const result = command.method === "Page.getFrameTree" ? { frameTree: { frame: { id: command.sessionId === "popup-session" ? "popup-frame" : "root-frame", url: "https://task.example/", securityOrigin: "https://task.example", loaderId: "loader" }, childFrames: [{ frame: { id: "idp-frame", parentId: "root-frame", url: "https://idp.example/login", securityOrigin: "https://idp.example", loaderId: "idp-loader" } }] } } : {};
        send({ id: command.id, ...(command.sessionId ? { sessionId: command.sessionId } : {}), result });
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error(); const port = address.port;
  const policy = new BrowserRequestPolicy({ cdpPort: port, identity: () => identity, resolveHost: async () => ["93.184.216.34"], policy: async effect => { effects.push(effect); return effectCandidate({ identity, requests: [], bindings: [], observations: [], effect }); }, ...options });
  const state: BrowserSessionState = { version: 1, sessionId: "synthetic-session", sessionMode: "attached", profileMode: "real", cdpPort: port, pid: 1, processStartTime: "synthetic", executablePath: "/brave", userDataDir: "/profile", profileDirectory: "Default", extensionMode: "enabled", extensionsExpected: false, comparisonGeneration: 0 };
  const transport = await BrowserCdpTransport.connect(state, { register: policy.register, revalidate: async () => {} });
  policy.bind(transport);
  cleanup.push(async () => { policy.dispose(); transport.dispose(); socket?.destroy(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  await transport.manage("root");
  const pause = (requestId: string, url: string, extra: Record<string, unknown> = {}, targetId = "root", sessionId = "root-session") => send({ method: "Fetch.requestPaused", sessionId, params: { requestId, frameId: targetId === "root" ? "root-frame" : "popup-frame", resourceType: "Document", request: { url, method: "GET" }, ...extra } });
  const result = async (id: string) => { await vi.waitFor(() => expect(commands.some(c => c.params.requestId === id)).toBe(true)); return commands.find(c => c.params.requestId === id)!; };
  return { policy, transport, port, send, commands, effects, pause, result };
}

describe("canonical browser destinations", () => {
  it("applies the explicit TLS exception only to localhost certificate errors", () => {
    const certificate = { securityState: "insecure-broken", certificateSecurityState: { certificateNetworkError: "net::ERR_CERT_AUTHORITY_INVALID" } };
    expect(hasNativeSecurityWarning(certificate, "https://localhost:42500/login", true)).toBe(false);
    expect(hasNativeSecurityWarning(certificate, "https://127.0.0.1:42500/login", true)).toBe(false);
    expect(hasNativeSecurityWarning(certificate, "https://localhost.attacker.example/", true)).toBe(true);
    expect(hasNativeSecurityWarning(certificate, "https://example.com/", true)).toBe(true);
    expect(hasNativeSecurityWarning({ securityStateIssueIds: ["malicious-content"] }, "https://localhost/", true)).toBe(true);
    expect(hasNativeSecurityWarning({ safetyTipInfo: { safetyTipStatus: "badReputation" } }, "https://localhost/", true)).toBe(true);
    expect(hasNativeSecurityWarning({ securityState: "insecure-broken" }, "https://localhost/", true)).toBe(true);
  });
  it("normalizes IDNs, trailing dots, IPv4 notation and exact host identity", () => {
    expect(parseBrowserDestination("https://BÜCHER.example./path?q=private#fragment", 9222)).toMatchObject({ host: "xn--bcher-kva.example", origin: "https://xn--bcher-kva.example", resource: "/path" });
    expect(parseBrowserDestination("http://2130706433:3000", 9222).visibility).toBe("local");
    expect(parseBrowserDestination("https://localhost.attacker.example", 9222).visibility).toBe("public");
    expect(hostVisibility("::ffff:7f00:1")).toBe("local");
    expect(hostVisibility("fd00::1")).toBe("private");
    expect(hostVisibility("172.31.1.2")).toBe("private");
    expect(hostVisibility("172.32.1.2")).toBe("public");
  });
  it.each(["javascript:alert(1)", "data:text/html,test", "chrome://settings/security", "brave://settings", "devtools://devtools", "https://user:password@public.example", "http://127.1:9222/json", "http://localhost.:9222", "file://remote/share", "about:blank"])("rejects unavailable destination %s", raw => {
    expect(() => parseBrowserDestination(raw, 9222)).toThrow();
  });
});

describe("persistent intercepted destinations", () => {
  it("reports fixed stages/codes for swallowed request errors without leaking values or continuing", async () => {
    const failure = vi.fn();
    const f = await fixture({ failure, resolveHost: async () => { throw new BrowserControlError("https://secret.invalid/?token=synthetic-secret", "password=synthetic-secret"); } });
    f.pause("dns-failure", "https://public.example/path?token=synthetic-secret");
    expect((await f.result("dns-failure")).method).toBe("Fetch.failRequest");
    expect(failure).toHaveBeenLastCalledWith({ phase: "intercepted", stage: "classification", code: "inspection_failed", cancellation: "none" });
    expect(JSON.stringify(failure.mock.calls)).not.toMatch(/secret|https|password|token|path/);
    expect(f.transport.signal.aborted).toBe(false);
  });
  it("reports a denied decision and ignores diagnostic-observer failure without weakening policy", async () => {
    const failure = vi.fn(() => { throw new Error("diagnostic observer unavailable"); });
    const f = await fixture({ failure, policy: async () => ({ outcome: "deny", reason: "synthetic private reason" }) });
    f.pause("denied", "https://public.example/");
    expect((await f.result("denied")).method).toBe("Fetch.failRequest");
    expect(failure).toHaveBeenLastCalledWith({ phase: "intercepted", stage: "policy", code: "policy_denied", cancellation: "none" });
    expect(f.transport.signal.aborted).toBe(false);
  });
  it("distinguishes native warning refusal from destination parsing without recording page data", async () => {
    const failure = vi.fn(), f = await fixture({ failure, initialSecurity: { securityStateIssueIds: ["malicious-content"] } });
    f.pause("warning", "https://public.example/");
    expect((await f.result("warning")).method).toBe("Fetch.failRequest");
    expect(failure).toHaveBeenLastCalledWith({ phase: "intercepted", stage: "safety", code: "native_warning", cancellation: "none" });
    expect(f.effects).toHaveLength(0);
  });
  it("distinguishes an automated navigation deadline from caller cancellation", async () => {
    const failure = vi.fn();
    const f = await fixture({ failure, timeoutMs: 30, resolveHost: async () => await new Promise(() => {}) });
    await expect(f.policy.authorizeNavigation("root", "https://public.example/")).rejects.toThrow("Browser request cancelled.");
    expect(failure).toHaveBeenLastCalledWith({ phase: "navigation", stage: "classification", code: "cancelled", cancellation: "deadline" });
    const caller = new AbortController(); caller.abort();
    await expect(f.policy.authorizeNavigation("root", "https://public.example/", caller.signal)).rejects.toThrow("Browser request cancelled.");
    expect(failure).toHaveBeenLastCalledWith({ phase: "navigation", stage: "identity", code: "cancelled", cancellation: "caller-aborted" });
  });
  it.each(["policy-disposed", "target-disconnected"] as const)("identifies %s during an outstanding navigation decision", async cancellation => {
    const failure = vi.fn(), decision = vi.fn(async () => await new Promise<never>(() => {}));
    const f = await fixture({ failure, policy: decision });
    const navigation = f.policy.authorizeNavigation("root", "https://public.example/");
    const rejection = expect(navigation).rejects.toThrow("Browser request cancelled.");
    await vi.waitFor(() => expect(decision).toHaveBeenCalled());
    if (cancellation === "policy-disposed") f.policy.dispose(); else f.transport.dispose();
    await rejection;
    expect(failure).toHaveBeenLastCalledWith({ phase: "navigation", stage: "policy", code: "cancelled", cancellation });
  });
  it("reports opaque source refusal without treating an error document as a blank navigation", async () => {
    const failure = vi.fn(), f = await fixture({ failure });
    f.send({ method: "Page.frameNavigated", sessionId: "root-session", params: { frame: { id: "idp-frame", parentId: "root-frame", url: "chrome-error://chromewebdata/", securityOrigin: "://", loaderId: "error" } } });
    await f.transport.command("root", "Page.bringToFront");
    f.pause("error-document", "https://public.example/", { frameId: "idp-frame" });
    expect((await f.result("error-document")).method).toBe("Fetch.failRequest");
    expect(failure).toHaveBeenLastCalledWith({ phase: "intercepted", stage: "source", code: "opaque_source", cancellation: "none" });
    expect(f.effects).toHaveLength(0);
  });
  it.each([true, false])("keeps explicit navigation decisions beyond the network deadline (interception=%s)", async interceptRequests => {
    let release!: () => void, pending!: AbortSignal;
    const f = await fixture({ interceptRequests, timeoutMs: 30, policy: async (_effect, signal) => {
      pending = signal; await new Promise<void>(resolve => { release = resolve; }); return { outcome: "allow", reason: "Manual navigation decision" };
    } });
    let settled = false;
    const navigation = f.policy.authorizeNavigation("root", "https://public.example/document");
    void navigation.then(() => { settled = true; }, () => { settled = true; });
    await vi.waitFor(() => expect(release).toBeDefined());
    await new Promise(resolve => setTimeout(resolve, 70));
    expect(pending.aborted).toBe(false); expect(settled).toBe(false);
    release(); await expect(navigation).resolves.toMatchObject({ origin: "https://public.example" });
  });
  it.each([true, false])("keeps local-file navigation authorization pending, then starts its bounded lease (interception=%s)", async interceptRequests => {
    let release!: () => void, pending!: AbortSignal;
    const f = await fixture({ interceptRequests, timeoutMs: 30, localFile: async (_path, signal) => {
      pending = signal; await new Promise<void>(resolve => { release = resolve; }); return { outcome: "allow", reason: "Manual file decision" };
    } });
    const url = pathToFileURL(resolve("/synthetic/requested.html")).href;
    let settled = false;
    const navigation = f.policy.authorizeNavigation("root", url);
    void navigation.then(() => { settled = true; }, () => { settled = true; });
    await vi.waitFor(() => expect(release).toBeDefined());
    await new Promise(resolve => setTimeout(resolve, 70));
    expect(pending.aborted).toBe(false); expect(settled).toBe(false);
    release(); await navigation;
    if (interceptRequests) { f.pause("file-after-human-wait", url); expect((await f.result("file-after-human-wait")).method).toBe("Fetch.continueRequest"); }
  });
  it.each(["http", "file"].flatMap(kind => ["caller", "disposal", "identity", "frame", "warning"].map(invalidation => [kind, invalidation] as const)))("does not apply explicit %s navigation after %s invalidation", async (kind, invalidation) => {
    let release!: () => void, generation = 1;
    const decision = async () => { await new Promise<void>(resolve => { release = resolve; }); return { outcome: "allow" as const, reason: "Late navigation approval" }; };
    const f = await fixture({ identity: () => ({ ...identity, generation }), policy: decision, localFile: decision });
    const caller = new AbortController();
    const navigation = f.policy.authorizeNavigation("root", kind === "file" ? pathToFileURL(resolve("/synthetic/requested.html")).href : "https://public.example/", caller.signal);
    const rejection = expect(navigation).rejects.toThrow();
    await vi.waitFor(() => expect(release).toBeDefined());
    if (invalidation === "caller") caller.abort();
    if (invalidation === "disposal") f.policy.dispose();
    if (invalidation === "identity") generation++;
    if (invalidation === "frame" || invalidation === "warning") {
      f.send(invalidation === "frame"
        ? { method: "Page.frameNavigated", sessionId: "root-session", params: { frame: { id: "root-frame", url: "https://changed.example/", securityOrigin: "https://changed.example", loaderId: "changed" } } }
        : { method: "Page.interstitialShown", sessionId: "root-session", params: {} });
      await f.transport.command("root", "Page.bringToFront");
    }
    release(); await rejection;
    expect(f.commands.some(command => command.method === "Page.navigate")).toBe(false);
  });
  it("dispatches one exact approved HTTP Document without reviewing it twice, but not assets or later documents", async () => {
    const review = vi.fn(async () => ({ outcome: "deny" as "allow" | "deny", reason: "No additional authority" }));
    review.mockResolvedValueOnce({ outcome: "allow", reason: "Approve this navigation once" });
    const projection = vi.fn(() => ({ kind: "read" as const, payload: { kind: "none" as const }, taskScoped: false }));
    const classify = vi.fn(async () => ["127.0.0.1"]);
    const f = await fixture({ policy: review, effect: projection, resolveHost: classify });
    const url = "http://localhost:3000/";
    await f.policy.authorizeNavigation("root", url);
    f.pause("approved-dispatch", url);
    expect((await f.result("approved-dispatch")).method).toBe("Fetch.continueRequest");
    expect(review).toHaveBeenCalledTimes(1);
    expect(projection).toHaveBeenCalledTimes(2); expect(classify).toHaveBeenCalledTimes(2);
    f.pause("asset", "http://localhost:3000/app.js", { resourceType: "Script" });
    expect((await f.result("asset")).method).toBe("Fetch.failRequest");
    f.pause("repeated-document", url);
    expect((await f.result("repeated-document")).method).toBe("Fetch.failRequest");
    expect(review).toHaveBeenCalledTimes(3);
  });
  it("expires an approved HTTP Document dispatch at the existing network deadline", async () => {
    const review = vi.fn(async () => ({ outcome: "deny" as "allow" | "deny", reason: "No additional authority" }));
    review.mockResolvedValueOnce({ outcome: "allow", reason: "Approve navigation once" });
    const f = await fixture({ timeoutMs: 100, policy: review });
    await f.policy.authorizeNavigation("root", "https://public.example/document");
    await new Promise(resolve => setTimeout(resolve, 150));
    f.pause("expired-dispatch", "https://public.example/document");
    expect((await f.result("expired-dispatch")).method).toBe("Fetch.failRequest");
    expect(review).toHaveBeenCalledTimes(2);
  });
  it.each(["url", "query", "frame", "target", "method", "body", "unknown-body", "redirect", "resource", "identity", "caller", "loader", "warning", "projection", "classification"])("does not reuse a navigation dispatch after a %s mismatch and consumes it once", async mismatch => {
    let generation = identity.generation, changed = false;
    const review = vi.fn(async () => ({ outcome: "deny" as "allow" | "deny", reason: "No additional authority" }));
    review.mockResolvedValueOnce({ outcome: "allow", reason: "Approve this navigation once" });
    const f = await fixture({ policy: review, identity: () => ({ ...identity, generation }),
      effect: () => ({ kind: "read", payload: changed && mismatch === "projection" ? { kind: "redacted", sourceObservationIds: [], containsProtectedData: true } : { kind: "none" }, taskScoped: false }),
      resolveHost: async () => [changed && mismatch === "classification" ? "10.0.0.2" : "93.184.216.34"],
    });
    const caller = new AbortController(), url = "https://public.example/document";
    await f.policy.authorizeNavigation("root", url, caller.signal);
    changed = true;
    if (mismatch === "identity") generation++;
    if (mismatch === "caller") caller.abort();
    if (mismatch === "loader" || mismatch === "warning" || mismatch === "target") {
      f.send(mismatch === "loader"
        ? { method: "Page.frameNavigated", sessionId: "root-session", params: { frame: { id: "root-frame", url: "https://task.example/", securityOrigin: "https://task.example", loaderId: "changed" } } }
        : mismatch === "warning" ? { method: "Page.interstitialShown", sessionId: "root-session", params: {} }
        : { method: "Target.attachedToTarget", sessionId: "root-session", params: { sessionId: "popup-session", waitingForDebugger: true, targetInfo: { targetId: "popup", type: "page", openerId: "root", url: "https://popup.example/" } } });
      await f.transport.command("root", "Page.bringToFront");
      if (mismatch === "target") await vi.waitFor(() => expect(f.transport.managedTargets().some(t => t.targetId === "popup")).toBe(true));
    }
    const requestUrl = mismatch === "url" ? "https://public.example/other" : mismatch === "query" ? `${url}?extra=synthetic` : url;
    const extra: Record<string, unknown> = mismatch === "frame" ? { frameId: "idp-frame" }
      : mismatch === "resource" ? { resourceType: "Script" }
      : mismatch === "redirect" ? { redirectedRequestId: "previous" }
      : ["method", "body", "unknown-body"].includes(mismatch) ? { request: { url, method: mismatch === "method" ? "POST" : "GET", ...(mismatch === "body" ? { postData: "synthetic" } : mismatch === "unknown-body" ? { hasPostData: true } : {}) } } : {};
    f.pause("mismatched-dispatch", requestUrl, extra, mismatch === "target" ? "popup" : "root", mismatch === "target" ? "popup-session" : "root-session");
    expect((await f.result("mismatched-dispatch")).method).toBe("Fetch.failRequest");
    if (mismatch !== "target") {
      f.pause("after-mismatch", url);
      expect((await f.result("after-mismatch")).method).toBe("Fetch.failRequest");
    } else {
      // A different target cannot consume or inherit the root's exact dispatch.
      f.pause("root-dispatch", url);
      expect((await f.result("root-dispatch")).method).toBe("Fetch.continueRequest");
    }
  });
  it("retains the owned background Fetch default 10-second deadline", async () => {
    let pending!: AbortSignal;
    const f = await fixture({ policy: async (_effect, signal) => { pending = signal; return await new Promise(() => {}); } });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(AbortSignal, "timeout").mockImplementation(ms => {
      const deadline = new AbortController(); setTimeout(() => deadline.abort(), ms); return deadline.signal;
    });
    f.pause("owned-background", "https://public.example/");
    await vi.waitFor(() => expect(pending).toBeDefined());
    await vi.advanceTimersByTimeAsync(9_000);
    expect(pending.aborted).toBe(false);
    expect(f.commands.some(c => c.params.requestId === "owned-background")).toBe(false);
    await vi.advanceTimersByTimeAsync(1_001);
    expect(pending.aborted).toBe(true);
    vi.useRealTimers(); vi.restoreAllMocks();
    expect((await f.result("owned-background")).method).toBe("Fetch.failRequest");
  });
  it("leaves attached-page traffic alone while enforcing explicit navigation and native warnings", async () => {
    const review = vi.fn(async () => ({ outcome: "deny" as const, reason: "Synthetic navigation denied" }));
    const f = await fixture({ interceptRequests: false, children: true, policy: review });
    await vi.waitFor(() => expect(f.transport.managedTargets().map(target => target.targetId).sort()).toEqual(["iframe", "root", "worker"]));
    expect(f.commands.some(c => c.method === "Fetch.enable")).toBe(false);
    expect(f.commands.some(c => c.method === "Security.enable" && c.sessionId === "root-session")).toBe(true);
    expect(review).not.toHaveBeenCalled();
    await expect(f.policy.authorizeNavigation("root", "https://public.example/document")).rejects.toThrow("Synthetic navigation denied");
    expect(review).toHaveBeenCalledTimes(1);
    f.send({ method: "Page.interstitialShown", sessionId: "root-session", params: {} });
    await vi.waitFor(() => expect(() => f.policy.assertSafe("root")).toThrow("native security warning"));
  });

  it("manages pages with cross-site iframes, dedicated workers and duplicate child attachments", async () => {
    const f = await fixture({ children: true });
    await vi.waitFor(() => expect(f.transport.managedTargets().map(target => target.targetId).sort()).toEqual(["iframe", "root", "worker"]));
    expect(f.transport.signal.aborted).toBe(false);
    expect(f.commands.some(c => c.method === "Security.enable" && c.sessionId === "iframe-session")).toBe(false);
    expect(f.commands.some(c => c.method === "Fetch.enable" && c.sessionId === "iframe-session")).toBe(true);
    await vi.waitFor(() => expect(f.commands.some(c => c.method === "Target.detachFromTarget" && c.params.sessionId === "duplicate-iframe-session")).toBe(true));
    await vi.waitFor(() => expect(f.commands.filter(c => c.method === "Runtime.runIfWaitingForDebugger").map(c => c.sessionId).sort()).toEqual(["iframe-session", "worker-session"]));
  });
  it("continues public IdP/CDN reading and separately fails a private redirect before continue", async () => {
    const f = await fixture();
    f.pause("public", "https://cdn.example/asset.js", { resourceType: "Script" });
    expect((await f.result("public")).method).toBe("Fetch.continueRequest");
    f.pause("idp", "https://idp.example/login", { frameId: "idp-frame" });
    expect((await f.result("idp")).method).toBe("Fetch.continueRequest");
    expect(f.effects.at(-1)?.target).toMatchObject({ origin: "https://idp.example", frameId: "idp-frame", targetId: "root" });
    f.pause("redirect", "http://10.0.0.2/admin", { redirectedRequestId: "public" });
    expect((await f.result("redirect")).method).toBe("Fetch.failRequest");
    expect(f.effects.at(-1)?.destination).toMatchObject({ visibility: "private", origin: "http://10.0.0.2" });
    expect(f.effects.at(-1)?.action).toContain("redirect");
  });
  it("keeps loopback dev usable only when executor task scope authorizes it, with no private blanket ban", async () => {
    const ordinary = await fixture(); ordinary.pause("unrequested", "http://localhost:3000/");
    expect((await ordinary.result("unrequested")).method).toBe("Fetch.failRequest");
    const dev = await fixture({ effect: facts => ({ kind: "read", payload: { kind: "none" }, taskScoped: facts.destination.origin === "http://localhost:3000" }), policy: async effect => effectCandidate({ identity,
      requests: [{ id: "direct", identity, source: "interactive", text: "Read the private service", directText: "Read the private service" }],
      bindings: [{ requestId: "direct", identity, basis: "independent-interpretation", directSpan: "Read the private service", scope: { kinds: ["read"], origins: ["https://task.example"], destinationOrigins: ["http://10.0.0.2"] } }], observations: [], effect }) });
    dev.pause("dev", "http://localhost:3000/"); expect((await dev.result("dev")).method).toBe("Fetch.continueRequest");
    dev.pause("configured", "http://10.0.0.2/status"); expect((await dev.result("configured")).method).toBe("Fetch.continueRequest");
  });
  it("fails intercepted executable/credential URLs without invoking policy or continuing", async () => {
    const f = await fixture();
    for (const [index, url] of ["javascript:alert(1)", "https://u:p@public.example/", "brave://settings/security", `http://127.0.0.1:${f.port}/json`].entries()) {
      f.pause(`forbidden-${index}`, url);
      expect((await f.result(`forbidden-${index}`)).method).toBe("Fetch.failRequest");
    }
    expect(f.effects).toHaveLength(0);
  });
  it("provides raw URL/body only to the local effect callback, with early protected-value refusal before policy", async () => {
    const locallyObserved: Array<{ rawUrl: string; postData?: string; hasBody: boolean }> = [];
    const resolveHost = vi.fn(async () => ["93.184.216.34"]);
    const f = await fixture({ resolveHost, effect: facts => {
      locallyObserved.push({ rawUrl: facts.rawUrl, postData: facts.postData, hasBody: facts.hasBody });
      if (facts.rawUrl.includes("synthetic-secret") || facts.postData?.includes("synthetic-secret")) throw new Error(`${facts.rawUrl} ${facts.postData ?? ""}`);
      return { kind: "read", payload: { kind: "none" }, taskScoped: false };
    } });
    f.pause("body-secret", "https://attacker.example/collect", { resourceType: "Fetch", request: { url: "https://attacker.example/collect", method: "POST", postData: "password=synthetic-secret" } });
    expect((await f.result("body-secret")).method).toBe("Fetch.failRequest");
    f.pause("url-secret", "https://synthetic-secret.attacker.example/collect");
    expect((await f.result("url-secret")).method).toBe("Fetch.failRequest");
    expect(locallyObserved[0]).toMatchObject({ postData: "password=synthetic-secret", hasBody: true });
    expect(locallyObserved[1]?.rawUrl).toContain("synthetic-secret");
    expect(f.effects).toHaveLength(0);
    expect(resolveHost).not.toHaveBeenCalled();
    f.pause("body-unavailable", "https://public.example/api", { resourceType: "Fetch", request: { url: "https://public.example/api", method: "POST", hasPostData: true } });
    expect((await f.result("body-unavailable")).method).toBe("Fetch.continueRequest");
    expect(locallyObserved[2]).toMatchObject({ hasBody: true, postData: undefined });
    expect(JSON.stringify(f.effects)).not.toContain("postData"); expect(JSON.stringify(f.effects)).not.toContain("rawUrl");
    await expect(f.policy.authorizeNavigation("root", "https://synthetic-secret.attacker.example/")).rejects.toMatchObject({ code: "destination_refused", message: "The local browser request inspection refused this transfer." });
    expect(resolveHost).toHaveBeenCalledTimes(1);
    expect(f.effects).toHaveLength(1);
  });
  it("checks source observation projection before a GET query transfer and holds an allowed request until decision", async () => {
    const f = await fixture({ effect: () => ({ kind: "export", taskScoped: false, payload: { kind: "redacted", sourceObservationIds: ["private-read"], containsProtectedData: true } }) });
    f.pause("private-query", "https://task.example/comment?private=synthetic");
    expect((await f.result("private-query")).method).toBe("Fetch.failRequest");
    expect(f.effects[0]?.payload).toMatchObject({ containsProtectedData: true });
    let release!: () => void;
    const held = await fixture({ policy: async effect => { await new Promise<void>(resolve => { release = resolve; }); return effectCandidate({ identity, requests: [], bindings: [], observations: [], effect }); } });
    held.pause("held", "https://cdn.example/script.js");
    await vi.waitFor(() => expect(release).toBeDefined());
    expect(held.commands.some(c => c.params.requestId === "held")).toBe(false);
    release(); expect((await held.result("held")).method).toBe("Fetch.continueRequest");
  });
  it("classifies public DNS names resolving internally and refuses CDP aliases", async () => {
    const f = await fixture({ resolveHost: async () => ["127.0.0.1"] });
    f.pause("dns-private", "http://public.example/"); expect((await f.result("dns-private")).method).toBe("Fetch.failRequest");
    f.pause("cdp", `http://public.example:${f.port}/json`); expect((await f.result("cdp")).method).toBe("Fetch.failRequest");
    expect(f.effects).toHaveLength(1);
  });
  it("handles a request paused during registration only after exact frame initialization", async () => {
    const f = await fixture({ earlyRequest: true });
    expect((await f.result("early")).method).toBe("Fetch.continueRequest");
    expect(f.effects[0]?.target).toMatchObject({ origin: "https://task.example", frameId: "root-frame" });
    const frameTreeIndex = f.commands.findIndex(c => c.method === "Page.getFrameTree");
    expect(f.commands.findIndex(c => c.params.requestId === "early")).toBeGreaterThan(frameTreeIndex);
  });
  it("guards newly attached exact iframe initial Document destinations before they navigate", async () => {
    const f = await fixture();
    f.send({ method: "Page.frameAttached", sessionId: "root-session", params: { frameId: "new-idp", parentFrameId: "root-frame" } });
    f.pause("new-frame-public", "https://idp.example/login", { frameId: "new-idp" });
    expect((await f.result("new-frame-public")).method).toBe("Fetch.continueRequest");
    expect(f.effects[0]?.target).toMatchObject({ frameId: "new-idp", origin: "https://idp.example" });
    expect(f.effects[0]?.expectedEffect).toContain("not a source observation");
    f.send({ method: "Page.frameAttached", sessionId: "root-session", params: { frameId: "private-frame", parentFrameId: "root-frame" } });
    f.pause("new-frame-private", "http://192.168.1.5/", { frameId: "private-frame" });
    expect((await f.result("new-frame-private")).method).toBe("Fetch.failRequest");
  });
  it("guards descendants before explicit resume, covers frame/script transfers and leaves unrelated tabs alone", async () => {
    const f = await fixture();
    f.send({ method: "Target.attachedToTarget", sessionId: "root-session", params: { sessionId: "popup-session", waitingForDebugger: true, targetInfo: { targetId: "popup", type: "page", openerId: "root", url: "https://popup.example/" } } });
    await vi.waitFor(() => expect(f.commands.some(c => c.sessionId === "popup-session" && c.method === "Runtime.runIfWaitingForDebugger")).toBe(true));
    const methods = f.commands.filter(c => c.sessionId === "popup-session").map(c => c.method);
    expect(methods.indexOf("Fetch.enable")).toBeLessThan(methods.indexOf("Runtime.runIfWaitingForDebugger"));
    f.pause("popup-private", "http://192.168.1.5/", {}, "popup", "popup-session"); expect((await f.result("popup-private")).method).toBe("Fetch.failRequest");
    f.pause("script-export", "https://task.example/comments", { resourceType: "Fetch", frameId: "idp-frame", request: { url: "https://task.example/comments?data=synthetic", method: "POST", postData: "synthetic-secret" } });
    expect((await f.result("script-export")).method).toBe("Fetch.failRequest");
    expect(JSON.stringify(f.effects)).not.toContain("synthetic-secret"); expect(JSON.stringify(f.effects)).not.toContain("?data=");
    f.send({ method: "Fetch.requestPaused", sessionId: "unrelated", params: { requestId: "unrelated" } });
    await f.transport.command("root", "Page.bringToFront");
    expect(f.commands.some(c => c.params.requestId === "unrelated")).toBe(false);
  });
  it("hands represented file reads to filesystem policy and does not grant page-initiated file access", async () => {
    const paths: string[] = [];
    const f = await fixture({ localFile: async path => { paths.push(path); return { outcome: path.endsWith("requested.html") ? "allow" : "deny", reason: "synthetic filesystem policy" }; } });
    const requested = pathToFileURL(resolve("/synthetic/requested.html")).href;
    expect((await f.policy.authorizeNavigation("root", requested)).filePath).toBe(resolve("/synthetic/requested.html"));
    await expect(f.policy.authorizeNavigation("root", pathToFileURL(resolve("/synthetic/forbidden.html")).href)).rejects.toThrow();
    const protectedFile = pathToFileURL(resolve("/synthetic/.ssh/id_rsa")).href.replace(".ssh", "%2Essh");
    await expect(f.policy.authorizeNavigation("root", protectedFile)).rejects.toThrow();
    expect(paths.at(-1)).toBe(resolve("/synthetic/.ssh/id_rsa"));
    expect(paths).toHaveLength(3);
    f.pause("page-file", requested); expect((await f.result("page-file")).method).toBe("Fetch.failRequest");
  });
  it("receives current native warning state during guard registration, including existing Safe Browsing findings", async () => {
    const f = await fixture({ initialSecurity: { securityState: "insecure-broken", securityStateIssueIds: ["malicious-content"] } });
    expect(() => f.policy.assertSafe("root")).toThrow(/native security warning/);
    f.pause("existing-warning", "https://public.example/"); expect((await f.result("existing-warning")).method).toBe("Fetch.failRequest");
  });
  it("refuses native interstitial/certificate/safety-tip states but not ordinary warning words or HTTP", async () => {
    const f = await fixture();
    f.pause("words", "https://docs.example/security-warning-captcha"); expect((await f.result("words")).method).toBe("Fetch.continueRequest");
    f.send({ method: "Page.interstitialShown", sessionId: "root-session", params: {} });
    f.pause("interstitial", "https://public.example/"); expect((await f.result("interstitial")).method).toBe("Fetch.failRequest");
    await expect(f.policy.authorizeNavigation("root", "https://public.example/")).rejects.toThrow(/native security warning/);
    f.send({ method: "Page.interstitialHidden", sessionId: "root-session", params: {} });
    f.send({ method: "Security.visibleSecurityStateChanged", sessionId: "root-session", params: { visibleSecurityState: { securityState: "insecure" } } });
    f.pause("http", "http://public.example/"); expect((await f.result("http")).method).toBe("Fetch.continueRequest");
    f.send({ method: "Security.visibleSecurityStateChanged", sessionId: "root-session", params: { visibleSecurityState: { certificateSecurityState: { certificateNetworkError: "net::ERR_CERT_AUTHORITY_INVALID" } } } });
    f.pause("cert", "https://public.example/"); expect((await f.result("cert")).method).toBe("Fetch.failRequest");
    f.send({ method: "Security.visibleSecurityStateChanged", sessionId: "root-session", params: { visibleSecurityState: { securityState: "secure", securityStateIssueIds: [] } } });
    f.pause("recovered", "https://public.example/"); expect((await f.result("recovered")).method).toBe("Fetch.continueRequest");
    f.send({ method: "Security.visibleSecurityStateChanged", sessionId: "root-session", params: { visibleSecurityState: { securityStateIssueIds: ["malicious-content"] } } });
    f.pause("safe-browsing", "https://public.example/"); expect((await f.result("safe-browsing")).method).toBe("Fetch.failRequest");
    f.send({ method: "Security.visibleSecurityStateChanged", sessionId: "root-session", params: { visibleSecurityState: { safetyTipInfo: { safetyTipStatus: "lookalike" } } } });
    f.pause("lookalike", "https://public.example/"); expect((await f.result("lookalike")).method).toBe("Fetch.failRequest");
    expect(f.commands.some(c => /ignoreCertificate|handleCertificate|setOverride/.test(c.method))).toBe(false);
  });
  it("represents blank initialization as an arriving document, never as a source observation", async () => {
    const f = await fixture();
    f.send({ method: "Page.frameNavigated", sessionId: "root-session", params: { frame: { id: "root-frame", url: "about:blank", securityOrigin: "null", loaderId: "blank" } } });
    f.pause("initial", "https://public.example/");
    expect((await f.result("initial")).method).toBe("Fetch.continueRequest");
    expect(f.effects[0]?.target).toMatchObject({ origin: "https://public.example", frameId: "root-frame" });
    expect(f.effects[0]?.expectedEffect).toContain("not a source observation");
    f.pause("blank-export", "https://public.example/collect", { resourceType: "Fetch" });
    expect((await f.result("blank-export")).method).toBe("Fetch.failRequest");
    expect(f.effects).toHaveLength(1);
  });
  it("rechecks a frame lease and warning state after a pending policy decision", async () => {
    let release!: () => void;
    const f = await fixture({ policy: async () => { await new Promise<void>(resolve => { release = resolve; }); return { outcome: "allow", reason: "synthetic allowed decision" }; } });
    f.pause("replaced", "https://public.example/"); await vi.waitFor(() => expect(release).toBeDefined());
    f.send({ method: "Page.frameNavigated", sessionId: "root-session", params: { frame: { id: "root-frame", url: "https://changed.example/", securityOrigin: "https://changed.example", loaderId: "changed" } } });
    // Wire command round-trip ensures the earlier frame event is consumed before releasing review.
    await f.transport.command("root", "Page.bringToFront"); release();
    expect((await f.result("replaced")).method).toBe("Fetch.failRequest");
    f.pause("warning-during-review", "https://public.example/");
    const oldRelease = release; await vi.waitFor(() => expect(release).not.toBe(oldRelease));
    f.send({ method: "Page.interstitialShown", sessionId: "root-session", params: {} });
    await f.transport.command("root", "Page.bringToFront"); release();
    expect((await f.result("warning-during-review")).method).toBe("Fetch.failRequest");
  });
  it("fails exact-frame mismatches, policy errors, timeout and task changes before transmission", async () => {
    const f = await fixture({ timeoutMs: 30, policy: async () => new Promise(() => {}) });
    f.pause("missing-frame", "https://public.example/", { frameId: "invented" }); expect((await f.result("missing-frame")).method).toBe("Fetch.failRequest");
    f.pause("timeout", "https://public.example/"); expect((await f.result("timeout")).method).toBe("Fetch.failRequest");
    const changed = await fixture({ identity: () => ({ ...identity, generation: ++generation }), policy: async () => ({ outcome: "allow", reason: "stale" }) }); let generation = 1;
    changed.pause("stale", "https://public.example/"); expect((await changed.result("stale")).method).toBe("Fetch.failRequest");
    const errors = await fixture({ policy: async () => { throw new Error("synthetic-secret"); } });
    errors.pause("error", "https://public.example/"); expect((await errors.result("error")).method).toBe("Fetch.failRequest");
  });
});

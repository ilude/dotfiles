import http from "node:http";
import { createHash } from "node:crypto";
import type { Duplex } from "node:stream";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventBusController } from "@earendil-works/pi-coding-agent";
import { BrowserPageProtocol, type BrowserSessionState } from "../lib/browser-control.js";
import { BrowserCdpTransport } from "../lib/browser-cdp-transport.js";
import type { BrowserRuntime } from "../lib/browser-runtime.js";
import { bindBrowserPolicy, browserPolicyIdentity, browserPolicyLease, effectCandidate, requestBrowserPolicy, requestBrowserLocalFilePolicy, type BrowserEffect } from "../lib/browser-effect-contract.js";
import { Context } from "../lib/damage-control/context.js";
import { createBrowserObservationHooks } from "../lib/browser-observations.js";
import { createBrowserCredentialResolver } from "../lib/browser-credentials.js";
const installed = realpathSync(fileURLToPath(new URL("../node_modules/@earendil-works/pi-coding-agent", import.meta.url)));
const { createEventBus }: { createEventBus: () => EventBusController } = await import(/* @vite-ignore */ pathToFileURL(join(installed, "dist/core/event-bus.js")).href);
const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => { vi.unstubAllEnvs(); for (const close of cleanup.splice(0).reverse()) await close(); });
type Command = { id: number; method: string; sessionId?: string; params: Record<string, unknown> };

/** Actual native WebSocket wire + real independent policy event bus. Chromium DOM/CDP replies
 * and process inspection are synthetic; no real browser, account or BWS operation. */
async function fixture(origin = "https://account.example", frameOrigin = origin, route = "/login") {
  const context = new Context(); context.restoreBrowserIntent({ sessionId: "synthetic-session", branchId: "branch" }, []);
  context.recordBrowserRequest("request", "interactive", "Log in and develop this form");
  context.bindBrowserIntent("request", "Log in and develop this form", { kinds: ["login", "read", "navigate", "dev-form"], origins: [origin, frameOrigin] }, "independent-interpretation");
  const bus = createEventBus(), effects: BrowserEffect[] = [], nativePaths: string[] = [];
  const owner = new AbortController();
  cleanup.push(bindBrowserPolicy(bus, async effect => { effects.push(effect); return effectCandidate(context.browserEvidence(effect)); }, { identity: () => context.identity, signal: () => AbortSignal.any([owner.signal, context.policySignal]), observe: observation => context.recordBrowserObservation(observation), localFile: async request => { nativePaths.push(request.nativePath); return { outcome: "allow", reason: "Synthetic exact filesystem authorization" }; } }));
  let socket: Duplex | undefined, inspections = 0, valid = true, transport: BrowserCdpTransport | undefined;
  const commands: Command[] = [];
  let fillRequest: string | undefined;
  let field = { tag: "input", type: "password", name: "password", autocomplete: "current-password", label: "Password", form: `${frameOrigin}/login`, href: "", captcha: false, password: true, loginForm: true };
  const send = (message: unknown) => {
    const body = Buffer.from(JSON.stringify(message)), header = Buffer.alloc(body.length < 126 ? 2 : 4); header[0] = 0x81;
    if (body.length < 126) header[1] = body.length; else { header[1] = 126; header.writeUInt16BE(body.length, 2); }
    socket!.write(Buffer.concat([header, body]));
  };
  const server = http.createServer((request, response) => response.end(JSON.stringify(request.url === "/json/list" ? [{ id: "root", type: "page", url: `${origin}${route}` }] : { webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/browser/fixture` })));
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
        const opcode = buffer[0]! & 15, mask = buffer.subarray(offset, offset + 4), body = Buffer.from(buffer.subarray(offset + 4, offset + 4 + size)); buffer = buffer.subarray(offset + 4 + size);
        if (opcode === 8) { stream.end(Buffer.from([0x88, 0])); return; }
        for (let i = 0; i < body.length; i++) body[i] = body[i]! ^ mask[i % 4]!;
        if (opcode !== 1) continue;
        const command = JSON.parse(body.toString()) as Command; commands.push(command);
        if (command.method === "Target.autoAttachRelated") {
          send({ method: "Target.attachedToTarget", params: { sessionId: "root-session", waitingForDebugger: false, targetInfo: { targetId: "root", type: "page", url: `${origin}${route}` } } });
        }
        if (command.method === "Runtime.enable") {
          send({ method: "Runtime.executionContextCreated", sessionId: "root-session", params: { context: { id: 1, auxData: { frameId: "root-frame", isDefault: true } } } });
          if (frameOrigin !== origin) send({ method: "Runtime.executionContextCreated", sessionId: "root-session", params: { context: { id: 2, auxData: { frameId: "idp-frame", isDefault: true } } } });
        }
        if (command.method === "Runtime.evaluate" && String(command.params.expression).includes("setter.call") && fillRequest) send({ method: "Fetch.requestPaused", sessionId: "root-session", params: { requestId: "fill-time", frameId: "root-frame", resourceType: "Fetch", request: { url: fillRequest, method: "POST", postData: "password=synthetic-secret" } } });
        const result = command.method === "Page.getFrameTree" ? { frameTree: { frame: { id: "root-frame", url: `${origin}${route}`, securityOrigin: origin, loaderId: "root-loader" }, ...(frameOrigin !== origin ? { childFrames: [{ frame: { id: "idp-frame", parentId: "root-frame", url: `${frameOrigin}/login`, securityOrigin: frameOrigin, loaderId: "idp-loader" } }] } : {}) } }
          : command.method === "Runtime.evaluate" ? { result: { value: String(command.params.expression).includes("(() => !!document.querySelector") ? false : String(command.params.expression).includes("const captcha") ? field : String(command.params.expression).includes("const lines") ? "Login Password ordinary token documentation synthetic-secret" : { ok: true } } }
          : command.method === "Target.createTarget" ? { targetId: "root" } : {};
        send({ id: command.id, ...(command.sessionId ? { sessionId: command.sessionId } : {}), result });
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error(); const port = address.port;
  const state: BrowserSessionState = { sessionId: "synthetic-session", sessionMode: "attached", profileMode: "real", cdpPort: port, pid: 1, processStartTime: "synthetic", executablePath: "/brave", userDataDir: "/profile", profileDirectory: "Default", extensionMode: "enabled", comparisonGeneration: 0 };
  const runtime = { connectTransport: async (_state: BrowserSessionState, options: Parameters<BrowserRuntime["connectTransport"]>[1]) => transport ??= await BrowserCdpTransport.connect(state, { ...options!, revalidate: async () => { inspections++; if (!valid) throw new Error("Stale process tuple"); } }), disposeTransport: () => { transport?.dispose(); transport = undefined; } } as unknown as BrowserRuntime;
  const lifetime = new AbortController(); vi.stubEnv("BITWARDEN_ACCESS_KEY", "synthetic-access-key");
  const exec = vi.fn(async () => ({ code: 0, killed: false, stdout: JSON.stringify({ key: "synthetic-key", value: "synthetic-secret" }), stderr: "" }));
  const resolver = createBrowserCredentialResolver({ version: 1, bindings: { login: { record_id: "synthetic-record", expected_key: "synthetic-key", origins: [origin], frame_origins: [frameOrigin], fields: ["password"] } } }, exec, AbortSignal.any([lifetime.signal, context.policySignal]));
  const pages = new BrowserPageProtocol({ runtime, identity: () => browserPolicyIdentity(bus)!, lease: () => browserPolicyLease(bus)!, policy: (effect, signal) => requestBrowserPolicy(bus, effect, signal), resolveHost: async () => ["93.184.216.34"], resolveCredential: resolver.resolve, localFile: (nativePath, signal) => requestBrowserLocalFilePolicy(bus, context.identity, nativePath, signal) });
  const observations = createBrowserObservationHooks({ events: bus, identity: () => context.identity, classify: source => pages.observationClass(source), review: async () => ({ text: '{"suspicious":false,"excerpts":[]}' }) });
  const cleared = vi.fn(observations.clear); pages.setObservationHooks({ ...observations, clear: cleared });
  cleanup.push(async () => { owner.abort(); lifetime.abort(); pages.dispose(); socket?.destroy(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const pause = (id: string, url: string, postData?: string, frameId = "root-frame", resourceType = "Fetch") => send({ method: "Fetch.requestPaused", sessionId: "root-session", params: { requestId: id, frameId, resourceType, request: { url, method: postData === undefined ? "GET" : "POST", ...(postData === undefined ? {} : { postData }) } } });
  const result = async (id: string) => { await vi.waitFor(() => expect(commands.some(c => c.params.requestId === id)).toBe(true)); return commands.find(c => c.params.requestId === id)!; };
  return { pages, state, bus, context, effects, commands, nativePaths, cleared, exec, pause, result, send, get inspections() { return inspections; }, stale: () => { valid = false; }, fillExport: (url: string) => { fillRequest = url; }, field: (next: Partial<typeof field>) => { field = { ...field, ...next }; } };
}

describe("authorized login executor integration", () => {
  it("resolves only after actual local bindings/policy, fills through guarded retained transport, and redacts observations", async () => {
    const f = await fixture();
    await f.pages.fill(f.state, "root", "#password", { secret_ref: "login" });
    expect(f.exec).toHaveBeenCalledTimes(1);
    expect(f.effects.map(effect => effect.kind)).toEqual(["login", "login"]);
    expect(JSON.stringify(f.effects)).not.toContain("synthetic-secret");
    expect(f.commands.findIndex(c => c.method === "Fetch.enable")).toBeLessThan(f.commands.findIndex(c => String(c.params.expression).includes("setter.call")));
    expect(await f.pages.snapshot(f.state, "root")).toContain("ordinary token documentation [REDACTED]");
    f.pause("bound", "https://account.example/login", "password=synthetic-secret");
    expect((await f.result("bound")).method).toBe("Fetch.continueRequest");
    f.pause("ajax-auth", "https://account.example/api/auth", "password=synthetic-secret");
    expect((await f.result("ajax-auth")).method).toBe("Fetch.continueRequest");
    f.pause("onboarding", "https://account.example/onboarding/task", "password=synthetic-secret");
    expect((await f.result("onboarding")).method).toBe("Fetch.continueRequest");
    f.pause("exfil", "https://forum.example/reply", "password=synthetic-secret");
    expect((await f.result("exfil")).method).toBe("Fetch.failRequest");
    f.pause("same-site", "https://account.example/comment", "password=synthetic-secret");
    expect((await f.result("same-site")).method).toBe("Fetch.failRequest");
    f.pause("url", "https://forum.example/?secret=synthetic-secret");
    expect((await f.result("url")).method).toBe("Fetch.failRequest");
    expect(JSON.stringify(f.effects)).not.toContain("synthetic-secret");
  });
  it("creates guarded blank then navigates only to the returned canonical destination", async () => {
    const f = await fixture();
    const target = await f.pages.open(f.state, "https://ACCOUNT.example./login?q=public");
    expect(target.url).toBe("https://account.example/login?q=public");
    expect(f.commands.find(c => c.method === "Target.createTarget")?.params.url).toBe("about:blank");
    const navigation = f.commands.findIndex(c => c.method === "Page.navigate");
    expect(f.commands.findIndex(c => c.method === "Fetch.enable")).toBeLessThan(navigation);
    expect(f.commands[navigation]?.params.url).toBe(target.url);
  });
  it("hands native local file paths to the filesystem bus and consumes only the exact one-shot Document lease", async () => {
    const f = await fixture(); const nativePath = join(os.tmpdir(), "synthetic-browser-inspection.html"), url = pathToFileURL(nativePath).href;
    await f.pages.open(f.state, url); expect(f.nativePaths).toEqual([nativePath]);
    f.pause("file", url, undefined, "root-frame", "Document");
    expect((await f.result("file")).method).toBe("Fetch.continueRequest");
    f.send({ method: "Page.frameNavigated", sessionId: "root-session", params: { frame: { id: "root-frame", url, securityOrigin: "null", loaderId: "file-loader" } } });
    f.send({ method: "Runtime.executionContextCreated", sessionId: "root-session", params: { context: { id: 3, auxData: { frameId: "root-frame", isDefault: true } } } });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(await f.pages.snapshot(f.state, "root")).toContain("origin=file://; classification=private");
    expect(f.nativePaths).toEqual([nativePath, nativePath]);
    f.pause("script-file", url, undefined, "root-frame", "Document");
    expect((await f.result("script-file")).method).toBe("Fetch.failRequest");
    await f.pages.open(f.state, url);
    f.pause("mismatch", pathToFileURL(join(os.tmpdir(), "other.html")).href, undefined, "root-frame", "Document");
    expect((await f.result("mismatch")).method).toBe("Fetch.failRequest");
    const caller = new AbortController(); await f.pages.open(f.state, url, caller.signal); caller.abort();
    f.pause("expired", url, undefined, "root-frame", "Document");
    expect((await f.result("expired")).method).toBe("Fetch.failRequest");
  });
  it("guards immediate input/change-handler export before the filled control returns", async () => {
    const f = await fixture(); f.fillExport("https://attacker.example/collect");
    await f.pages.fill(f.state, "root", "#password", { secret_ref: "login" });
    expect((await f.result("fill-time")).method).toBe("Fetch.failRequest");
    expect(JSON.stringify(f.effects)).not.toContain("synthetic-secret");
  });
  it("carries bounded local private observation evidence into actual field fills", async () => {
    const f = await fixture("https://account.example", "https://account.example", "/inbox"); await f.pages.snapshot(f.state, "root");
    f.field({ type: "text", name: "comment", autocomplete: "", label: "Comment", password: false, loginForm: false, form: "https://account.example/comment" });
    await expect(f.pages.fill(f.state, "root", "#comment", { value: "ordinary token documentation" })).rejects.toMatchObject({ code: "action_refused" });
    expect(f.effects.at(-1)?.payload).toMatchObject({ kind: "redacted", containsProtectedData: true });
    const payload = f.effects.at(-1)!.payload;
    expect(payload.kind === "redacted" && payload.sourceObservationIds.length).toBeTruthy();
  });
  it("does not let a bound AJAX credential request carry unrelated private observations", async () => {
    const f = await fixture("https://account.example", "https://account.example", "/inbox");
    await f.pages.fill(f.state, "root", "#password", { secret_ref: "login" }); await f.pages.snapshot(f.state, "root");
    f.pause("login-only", "https://account.example/api/auth", "password=synthetic-secret");
    expect((await f.result("login-only")).method).toBe("Fetch.continueRequest");
    f.pause("private-extra", "https://account.example/api/auth", "password=synthetic-secret&memo=ordinary%20token%20documentation");
    expect((await f.result("private-extra")).method).toBe("Fetch.failRequest");
  });
  it("supports exact separately bound iframe SSO and refuses stale frames", async () => {
    const f = await fixture("https://account.example", "https://idp.example");
    await f.pages.fill(f.state, "root", "#password", { secret_ref: "login", frame_id: "idp-frame" });
    expect(f.effects[0]?.target).toMatchObject({ frameId: "idp-frame", origin: "https://idp.example" });
    expect(f.commands.filter(c => String(c.params.expression).includes("setter.call"))[0]?.params.contextId).toBe(2);
    expect(await f.pages.frames(f.state, "root")).toContainEqual({ id: "idp-frame", targetId: "root", origin: "https://idp.example" });
    expect(await f.pages.snapshot(f.state, "root", undefined, "idp-frame")).toContain("origin=https://idp.example");
    f.send({ method: "Page.frameDetached", sessionId: "root-session", params: { frameId: "idp-frame" } });
    await new Promise(resolve => setTimeout(resolve, 20));
    await expect(f.pages.fill(f.state, "root", "#password", { secret_ref: "login", frame_id: "idp-frame" })).rejects.toMatchObject({ code: "frame_missing" });
  });
  it("refuses wrong form origin before BWS resolution and rejects ambiguous fill inputs", async () => {
    const f = await fixture(); f.field({ form: "https://attacker.example/collect" });
    await expect(f.pages.fill(f.state, "root", "#password", { secret_ref: "login" })).rejects.toMatchObject({ code: "action_refused" });
    expect(f.exec).not.toHaveBeenCalled();
    // Even independently allowed browsing/login destinations do not broaden the local binding.
    f.context.bindBrowserIntent("request", "Log in and develop this form", { kinds: ["login"], origins: ["https://account.example"], destinationOrigins: ["https://attacker.example"] }, "independent-interpretation");
    await expect(f.pages.fill(f.state, "root", "#password", { secret_ref: "login" })).rejects.toMatchObject({ code: "credential_unavailable" });
    expect(f.exec).not.toHaveBeenCalled();
    await expect(f.pages.fill(f.state, "root", "#password", { value: "x", secret_ref: "login" })).rejects.toMatchObject({ code: "value_required" });
  });
  it("keeps dev passwords and consent usable, while actual deletion/security and CAPTCHA controls stop", async () => {
    const f = await fixture("http://localhost:3000");
    await f.pages.fill(f.state, "root", "#password", { value: "disposable-dev-password" });
    expect(f.effects[0]?.kind).toBe("dev-form");
    f.pause("dev-submit", "http://localhost:3000/login", "password=disposable-dev-password");
    expect((await f.result("dev-submit")).method).toBe("Fetch.continueRequest");
    f.field({ tag: "button", type: "button", name: "accept", label: "Accept all cookies", form: "", password: false, loginForm: false, autocomplete: "" });
    await f.pages.click(f.state, "root", "#accept");
    expect(f.effects.at(-1)?.kind).toBe("read");
    f.field({ name: "delete-account", label: "Delete account" });
    await expect(f.pages.click(f.state, "root", "#delete")).rejects.toMatchObject({ code: "action_refused" });
    f.field({ name: "security", label: "Disable two-factor authentication" });
    await expect(f.pages.click(f.state, "root", "#security")).rejects.toMatchObject({ code: "action_refused" });
    f.field({ captcha: true });
    await expect(f.pages.click(f.state, "root", "#challenge")).rejects.toMatchObject({ code: "manual_captcha" });
  });
  it("honors an independently interpreted development task at the actual loopback port without granting BWS or account security", async () => {
    const f = await fixture("http://localhost:34567");
    f.context.recordBrowserRequest("dev", "interactive", "Develop the local application");
    expect(f.context.bindBrowserIntent("dev", "Develop the local application", { localDevelopment: true, kinds: ["read", "navigate", "dev-form"], origins: [] }, "independent-interpretation")).toBe(true);
    await f.pages.fill(f.state, "root", "#password", { value: "disposable-development-password" });
    f.pause("development", "http://localhost:34567/login", "password=disposable-development-password");
    expect((await f.result("development")).method).toBe("Fetch.continueRequest");
    f.pause("cdn", "https://cdn.example/assets/app.js?version=public", undefined, "root-frame", "Script");
    expect((await f.result("cdn")).method).toBe("Fetch.continueRequest");
    f.pause("idp", "https://idp.example/authorize?client=public", undefined, "root-frame", "Document");
    expect((await f.result("idp")).method).toBe("Fetch.continueRequest");
    f.pause("unrelated-account", "https://idp.example/inbox", undefined, "root-frame", "Document");
    expect((await f.result("unrelated-account")).method).toBe("Fetch.failRequest");
    await expect(f.pages.fill(f.state, "root", "#password", { secret_ref: "login" })).rejects.toMatchObject({ code: "action_refused" });
    f.field({ tag: "button", type: "button", label: "Change password", name: "security", password: false, loginForm: false });
    await expect(f.pages.click(f.state, "root", "#security")).rejects.toMatchObject({ code: "action_refused" });
  });
  it("revalidates process for list and every action, preserves detached browser ownership on disposal", async () => {
    const f = await fixture(); await f.pages.list(f.state); const before = f.inspections;
    await f.pages.fill(f.state, "root", "#password", { value: "dev" });
    expect(f.inspections).toBeGreaterThan(before);
    f.stale(); await expect(f.pages.list(f.state)).rejects.toThrow("Stale process tuple");
    await expect(f.pages.fill(f.state, "root", "#password", { value: "dev" })).rejects.toThrow();
    f.pages.dispose(); expect(f.commands.some(c => c.method === "Browser.close" || c.method === "Target.closeTarget")).toBe(false);
  });
  it("keeps public docs/query dependencies quiet but reviews unrelated actual account/inbox reads", async () => {
    const docs = await fixture("https://docs.example", "https://docs.example", "/documentation/passwords");
    docs.context.recordBrowserRequest("public", "interactive", "Read public documentation");
    const observation = await docs.pages.snapshot(docs.state, "root");
    expect(observation).toContain("classification=public");
    docs.pause("search", "https://search.example/?q=ordinary+documentation");
    expect((await docs.result("search")).method).toBe("Fetch.continueRequest");
    docs.pause("inbox", "https://unrelated.example/inbox");
    expect((await docs.result("inbox")).method).toBe("Fetch.failRequest");
    expect(docs.effects.at(-1)?.target.visibility).toBe("private");
    const account = await fixture("https://unrelated.example", "https://unrelated.example", "/inbox");
    account.context.recordBrowserRequest("forum", "interactive", "Read the public forum");
    await expect(account.pages.select(account.state, "root")).rejects.toMatchObject({ code: "action_refused" });
    await expect(account.pages.snapshot(account.state, "root")).rejects.toMatchObject({ code: "action_refused" });
  });
  it("cancels a local BWS operation on the actual generation lease and refuses its late result", async () => {
    const f = await fixture();
    let release!: (result: { code: number; killed: boolean; stdout: string; stderr: string }) => void;
    f.exec.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const operation = f.pages.fill(f.state, "root", "#password", { secret_ref: "login" });
    const rejection = expect(operation).rejects.toMatchObject({ code: "credential_unavailable" });
    await vi.waitFor(() => expect(f.exec).toHaveBeenCalledTimes(1));
    f.context.recordBrowserRequest("replace", "interactive", "Read public documentation instead");
    await rejection;
    release({ code: 0, killed: false, stdout: JSON.stringify({ key: "synthetic-key", value: "late-synthetic-secret" }), stderr: "" });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(f.commands.some(c => String(c.params.expression).includes("setter.call"))).toBe(false);
    expect(JSON.stringify(f.effects)).not.toContain("late-synthetic-secret");
  });
  it("clears protected-value observation leases and disconnects on actual owner-generation invalidation", async () => {
    const f = await fixture(); await f.pages.fill(f.state, "root", "#password", { secret_ref: "login" });
    expect(await f.pages.snapshot(f.state, "root")).toContain("[REDACTED]");
    const before = f.cleared.mock.calls.length;
    f.context.recordBrowserRequest("new", "interactive", "Read public documentation instead");
    expect(f.cleared.mock.calls.length).toBeGreaterThan(before);
    expect(f.commands.some(c => c.method === "Browser.close" || c.method === "Target.closeTarget")).toBe(false);
  });
  it("stops native warnings without clearing target selection or blanket password refusal", async () => {
    const f = await fixture(); await f.pages.select(f.state, "root");
    f.send({ method: "Page.interstitialShown", sessionId: "root-session", params: {} });
    await new Promise(resolve => setTimeout(resolve, 20));
    await expect(f.pages.fill(f.state, "root", "#password", { value: "dev" })).rejects.toMatchObject({ code: "destination_refused" });
    expect(f.exec).not.toHaveBeenCalled(); expect(f.state.targetId).toBeUndefined();
  });
});

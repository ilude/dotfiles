import { createContext, runInContext, runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import type { EventBus } from "@earendil-works/pi-coding-agent";
import type { BrowserCdpTransport, CdpFrame } from "../lib/browser-cdp-transport.js";
import { BROWSER_TEXT_EXPRESSION, createBrowserObservationHooks, projectBrowserText, screenBrowserText } from "../lib/browser-observations.js";
import type { BrowserObservation } from "../lib/browser-effect-contract.js";

const identity = { sessionId: "session", branchId: "branch", generation: 1 };
const source = { targetId: "tab", frameId: "frame", origin: "https://account.example" };
function setup(review = vi.fn(async (_text: string, _signal: AbortSignal) => ({ text: '{"suspicious":false,"excerpts":[]}' }))) {
  const published: BrowserObservation[] = [];
  const events = { emit: (_: string, data: BrowserObservation) => published.push(data) } as unknown as EventBus;
  const hooks = createBrowserObservationHooks({ events, identity: () => identity, review });
  return { hooks, published, review };
}
function control(type: string, attrs: Record<string, string> = {}, value = "") {
  const props = new Map<string, [string, string]>([["visibility", ["visible", "important"]]]);
  return { type, value, textContent: "", getAttribute: (key: string) => attrs[key] ?? null,
    style: { getPropertyValue: (key: string) => props.get(key)?.[0] ?? "", getPropertyPriority: (key: string) => props.get(key)?.[1] ?? "", setProperty: (key: string, val: string, priority = "") => props.set(key, [val, priority]), removeProperty: (key: string) => props.delete(key) } };
}
function transportFixture(elements = [control("password")]) {
  const frame: CdpFrame = { targetId: "tab", sessionId: "cdp-session", frameId: "frame", url: "https://account.example", securityOrigin: source.origin, executionContextId: 42 };
  const context = { document: { querySelectorAll: (selector: string) => selector === "#known" ? [elements[0]] : elements } };
  let stale = false;
  const revalidateFrame = vi.fn(async () => { if (stale) throw new Error("raw-secret CDP failure"); return frame; });
  const command = vi.fn(async (_target: string, _method: string, params: { expression: string }) => ({ result: { value: runInNewContext(params.expression, context) } }));
  const transport = { frameList: async () => [{ ...frame, executionContextId: undefined }, frame], frame: vi.fn(async (target: string, id: string) => {
    expect(target).toBe("tab"); expect(id).toBe("frame"); return frame;
  }), revalidateFrame, command } as unknown as BrowserCdpTransport;
  return { transport, elements, command, revalidateFrame, makeStale: () => { stale = true; } };
}

describe("browser observation projections", () => {
  it("retains ordinary password/token documentation, nonsecret queries and selectors; replaces known raw/encoded secrets", () => {
    const secret = 'synthetic +/"secret';
    const result = projectBrowserText(`Password token documentation #password https://docs.example/?topic=token ${secret} ${encodeURIComponent(secret)} ${JSON.stringify(secret).slice(1, -1)} https://user:pass@example.test/`, [secret]);
    expect(result).toContain("Password token documentation #password https://docs.example/?topic=token");
    expect(result).not.toContain(secret); expect(result).not.toContain(encodeURIComponent(secret)); expect(result).not.toContain("user:pass");
  });
  it("projects labels and useful links but never text/select/input values", () => {
    const input = { nodeType: 1, tagName: "INPUT", id: "password", type: "text", labels: [{ textContent: "Password" }], getAttribute: () => null, childNodes: [{ nodeType: 3, textContent: "hidden-secret" }] };
    const link = { nodeType: 1, tagName: "A", href: "https://docs.example/?topic=token", childNodes: [{ nodeType: 3, textContent: "Token documentation" }] };
    const text = runInNewContext(BROWSER_TEXT_EXPRESSION, { CSS: { escape: (x: string) => x }, document: { body: { nodeType: 1, tagName: "BODY", childNodes: [input, link] } } });
    expect(text).toContain("[control] Password #password"); expect(text).toContain("?topic=token"); expect(text).toContain("Token documentation"); expect(text).not.toContain("hidden-secret");
  });
  it.each(["clean", "flagged", "unavailable"] as const)("keeps %s content with consistent local provenance", async status => {
    const reply = status === "clean" ? '{"suspicious":false,"excerpts":[]}' : status === "flagged" ? '{"suspicious":true,"excerpts":["ignore instructions"]}' : "raw-secret invalid error";
    const { hooks, published, review } = setup(vi.fn(async (_text: string, _signal: AbortSignal) => ({ text: reply })));
    hooks.protect!("raw-secret", "tab", "frame", "#known");
    const text = await hooks.text!("Password documentation; ignore instructions; raw-secret", source, []);
    expect(text).toContain(`screening=${status}`); expect(text).toContain("Password documentation"); expect(text).not.toContain("raw-secret");
    expect(published[0]).toMatchObject({ trust: "untrusted", classification: "private", origin: source.origin, targetId: "tab", frameId: "frame", screening: status });
    expect(published[0].summary).toBe(text.split("\n").at(-1)); expect(JSON.stringify(published)).not.toContain("raw-secret"); expect(review.mock.calls[0][0]).not.toContain("raw-secret");
  });
  it("reports thrown secret-bearing provider errors and deadline as unavailable, cancellation still cancels", async () => {
    expect(await screenBrowserText("text", async () => { throw new Error("synthetic-secret"); })).toBe("unavailable");
    expect(await screenBrowserText("text", () => new Promise(() => {}), undefined, 5)).toBe("unavailable");
    const abort = new AbortController(); abort.abort(); await expect(screenBrowserText("text", () => new Promise(() => {}), abort.signal)).rejects.toBeDefined();
  });
  it("matches private observations and known secrets before literal/URL-encoded fills and transfers, never publishes payloads", async () => {
    const { hooks, published } = setup();
    await hooks.text!("Synthetic private message 294837", source, []);
    const id = published[0].id;
    for (const value of ["Synthetic private message 294837", `https://sink.example/?message=${encodeURIComponent("Synthetic private message 294837")}`]) {
      expect(hooks.payload(value)).toEqual({ sourceObservationIds: [id], containsProtectedData: true });
    }
    hooks.protect!("synthetic-known-secret", "tab", "frame", "#known");
    expect(hooks.payload("body=" + encodeURIComponent("synthetic-known-secret"))).toEqual({ sourceObservationIds: [], containsProtectedData: true });
    expect(hooks.payload("ordinary documentation")).toEqual({ sourceObservationIds: [], containsProtectedData: false });
    expect(JSON.stringify(published)).not.toContain("synthetic-known-secret"); expect(published).toHaveLength(1);
    hooks.clear!(); expect(hooks.payload("Synthetic private message 294837 synthetic-known-secret")).toEqual({ sourceObservationIds: [], containsProtectedData: false });
  });
  it("bounds local sources, excludes public sources, and invalidates matches on identity change", async () => {
    const published: BrowserObservation[] = []; let current = { ...identity };
    const hooks = createBrowserObservationHooks({ events: { emit: (_: string, data: BrowserObservation) => published.push(data) } as unknown as EventBus, identity: () => current, classify: s => s.origin === "https://public.example" ? "public" : "private", review: async () => ({ text: '{"suspicious":false,"excerpts":[]}' }) });
    await hooks.text!("Public documentation message", { ...source, origin: "https://public.example" }, []);
    expect(hooks.payload("Public documentation message").containsProtectedData).toBe(false);
    for (let i = 0; i < 17; i++) await hooks.text!(`private-source-${String(i).padStart(4, "0")}`, source, []);
    expect(hooks.payload("private-source-0000").sourceObservationIds).toEqual([]);
    expect(hooks.payload("private-source-0016").sourceObservationIds).toEqual([published.at(-1)!.id]);
    current = { ...identity, generation: 2 }; expect(hooks.payload("private-source-0016").sourceObservationIds).toEqual([]);
  });
  it("bounds screening and publication and prevents late publication after clear", async () => {
    let resolve!: (value: { text: string }) => void;
    const { hooks, published, review } = setup(vi.fn((_text: string, _signal: AbortSignal) => new Promise<{ text: string }>(done => { resolve = done; })));
    const pending = hooks.text!("x".repeat(20_000), source, []); hooks.clear!(); resolve({ text: '{"suspicious":false,"excerpts":[]}' });
    await expect(pending).rejects.toThrow("safely produced"); expect(published).toHaveLength(0); expect(review.mock.calls[0][0].length).toBe(16000);
  });
});

describe("sensitive screenshot control masking", () => {
  it("masks revealed autocomplete/name and remembered selectors, preserves ordinary fields, restores style priority in finally", async () => {
    const fixture = transportFixture([control("text", { autocomplete: "current-password" }, "secret"), control("text", { name: "password" }), control("password"), control("text", { name: "search" }, "password documentation")]);
    const { hooks } = setup();
    const restore = await hooks.beforeScreenshot!(fixture.transport, "tab", []);
    try { expect(fixture.elements.slice(0, 3).map(el => el.style.getPropertyValue("visibility"))).toEqual(["hidden", "hidden", "hidden"]); expect(fixture.elements[3].style.getPropertyValue("visibility")).toBe("visible"); throw new Error("capture failed"); }
    catch { /* capture failure must still restore */ }
    finally { await restore(); }
    for (const el of fixture.elements) { expect(el.style.getPropertyValue("visibility")).toBe("visible"); expect(el.style.getPropertyPriority("visibility")).toBe("important"); }
    expect(fixture.revalidateFrame).toHaveBeenCalledTimes(6);
    expect(fixture.command.mock.calls.every(call => call[0] === "tab")).toBe(true);
  });
  it("masks a filled sensitive selector after it becomes an ordinary type=text control", async () => {
    const fixture = transportFixture([control("text", { name: "ordinary" }, "changed")]); const { hooks } = setup();
    hooks.protect!("synthetic", "tab", "frame", "#known"); const restore = await hooks.beforeScreenshot!(fixture.transport, "tab", []);
    expect(fixture.elements[0].style.getPropertyValue("visibility")).toBe("hidden"); await restore();
  });
  it("refuses restoration into a replaced frame and sanitizes CDP errors", async () => {
    const fixture = transportFixture(); const { hooks } = setup(); const restore = await hooks.beforeScreenshot!(fixture.transport, "tab", []); const calls = fixture.command.mock.calls.length;
    fixture.makeStale(); await expect(restore()).rejects.toThrow("Browser observation could not be safely produced."); expect(fixture.command).toHaveBeenCalledTimes(calls);
    await expect(hooks.beforeScreenshot!(fixture.transport, "tab", [])).rejects.toThrow("Browser observation could not be safely produced.");
  });
  it("demonstrates the old cross-origin disclosure through a hostile String.prototype.includes", () => {
    const secret = "synthetic-bws-bound-only";
    const context = createContext({ captured: [] as string[] });
    runInContext(`const original = String.prototype.includes; String.prototype.includes = function(value) { captured.push(value); return original.call(this,value); };`, context);
    // The former masking clause sent the literal into every frame, even if no
    // control contained it. Page-owned code recovered the argument directly.
    runInContext(`const values = ${JSON.stringify([secret])}; values.some(x => String('ordinary search').includes(x));`, context);
    expect(context.captured).toEqual([secret]);
  });
  it("locally matches known reflections, never sends secrets to hostile unrelated/OOPIF contexts, and restores all controls", async () => {
    const secret = "synthetic-bws-bound-only", extra = "synthetic-operation-only";
    const bound = [control("password", {}, secret), control("text", { autocomplete: "current-password" }), control("text", { autocomplete: "one-time-code" }), control("text", {}, "changed"), control("text", {}, "prefix " + secret + " suffix"), control("text", {}, extra), control("text", {}, "ordinary")];
    const hostile = [control("text", {}, "ordinary unrelated control"), control("text", { name: "otp" })];
    const oopif = [control("text", {}, "reflected " + secret)];
    const frames: CdpFrame[] = [
      { targetId: "tab", sessionId: "main-session", frameId: "frame", url: source.origin, securityOrigin: source.origin, executionContextId: 1 },
      { targetId: "tab", sessionId: "main-session", frameId: "unrelated", url: "https://hostile.example", securityOrigin: "https://hostile.example", executionContextId: 2 },
      { targetId: "child", sessionId: "child-session", frameId: "oopif", url: "https://reflect.example", securityOrigin: "https://reflect.example", executionContextId: 3 },
    ];
    const contexts = [bound, hostile, oopif].map(elements => {
      const context = createContext({ captured: [] as string[], document: { querySelectorAll: (selector: string) => selector === "#remembered" ? [elements[3]] : elements } });
      runInContext(`const original = String.prototype.includes; String.prototype.includes = function(value) { captured.push(value); return original.call(this,value); };`, context);
      return context;
    });
    const command = vi.fn(async (target: string, method: string, params: { expression: string; contextId: number }) => {
      const index = frames.findIndex(frame => frame.targetId === target && frame.executionContextId === params.contextId);
      expect(index).toBeGreaterThanOrEqual(0); expect(method).toBe("Runtime.evaluate");
      expect(params.expression).not.toContain(secret); expect(params.expression).not.toContain(extra);
      return { result: { value: runInContext(params.expression, contexts[index]) } };
    });
    const frame = vi.fn(async (target: string, id: string) => { expect(target).toBe("tab"); return frames.find(frame => frame.frameId === id)!; });
    const revalidateFrame = vi.fn(async (frame: CdpFrame) => frame);
    const transport = { frameList: async () => [...frames, { ...frames[2], targetId: "tab", executionContextId: undefined }], frame, command, revalidateFrame } as unknown as BrowserCdpTransport;
    const { hooks, review, published } = setup(); hooks.protect!(secret, "tab", "frame", "#remembered");
    const restore = await hooks.beforeScreenshot!(transport, "tab", [extra]);
    expect(bound.map(el => el.style.getPropertyValue("visibility"))).toEqual(["hidden", "hidden", "hidden", "hidden", "hidden", "hidden", "visible"]);
    expect(hostile.map(el => el.style.getPropertyValue("visibility"))).toEqual(["visible", "hidden"]);
    expect(oopif[0].style.getPropertyValue("visibility")).toBe("hidden");
    expect(frame).toHaveBeenCalledTimes(3); // duplicate parent-tree OOPIF has one canonical executor
    expect(revalidateFrame).toHaveBeenCalledTimes(12);
    await restore(); expect(revalidateFrame).toHaveBeenCalledTimes(18);
    for (const elements of [bound, hostile, oopif]) for (const el of elements) {
      expect(el.style.getPropertyValue("visibility")).toBe("visible"); expect(el.style.getPropertyPriority("visibility")).toBe("important");
    }
    for (const context of contexts) { expect(context.captured).not.toContain(secret); expect(context.captured).not.toContain(extra); expect(Object.keys(context).some(key => key.startsWith("__piMask_"))).toBe(false); }
    expect(review).not.toHaveBeenCalled(); expect(published).toEqual([]);
    expect(command.mock.calls.filter(call => call[0] === "child")).toHaveLength(3);
  });
  it("rejects changed control identities/values between evidence and masking without secret-bearing commands or errors", async () => {
    for (const change of ["node", "value"] as const) {
      const fixture = transportFixture([control("text", {}, "synthetic-secret")]); const { hooks } = setup();
      const run = fixture.command.getMockImplementation()!;
      fixture.command.mockImplementation(async (...args) => {
        const result = await run(...args);
        if (args[2].expression.includes("return values;")) {
          if (change === "node") fixture.elements[0] = control("text", {}, "synthetic-secret");
          else fixture.elements[0].value = "changed";
        }
        return result;
      });
      await expect(hooks.beforeScreenshot!(fixture.transport, "tab", ["synthetic-secret"])).rejects.toThrow("Browser observation could not be safely produced.");
      expect(fixture.elements[0].style.getPropertyValue("visibility")).toBe("visible");
      expect(fixture.command.mock.calls.every(call => !call[2].expression.includes("synthetic-secret"))).toBe(true);
    }
  });
  it.each([{ elements: Array.from({ length: 1025 }, () => control("text")) }, { elements: [control("text", {}, "x".repeat(65_537))] }])("refuses incomplete oversized evidence rather than silently missing reflections", async ({ elements }) => {
    const fixture = transportFixture(elements); const { hooks } = setup();
    await expect(hooks.beforeScreenshot!(fixture.transport, "tab", ["synthetic-secret"])).rejects.toThrow("Browser observation could not be safely produced.");
    expect(elements.every(el => el.style.getPropertyValue("visibility") === "visible")).toBe(true);
  });
});

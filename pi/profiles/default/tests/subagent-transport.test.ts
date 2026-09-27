import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:net";
import { ChildTransport, requestParent, waitForParentEvents } from "../lib/subagents/transport.ts";
const servers: ChildTransport[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => server.close())); });
function server(handler: ConstructorParameters<typeof ChildTransport>[0]) {
  const transport = new ChildTransport(handler); servers.push(transport); return transport;
}
const identity = { child: "child-a", run: "run-a", origin: "origin-a" };
describe("authenticated child transport", () => {
  it.each(["host-poll", "app-poll", "heartbeat"])("recovers %s after two dropped connections without losing stop responses", async type => {
    let calls = 0;
    const diagnostic = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const socketServer = createServer(socket => socket.once("data", () => {
      if (++calls < 3) socket.destroy();
      else socket.end(JSON.stringify({ ok: true, result: { stop: true, force: true } }) + "\n");
    }));
    await new Promise<void>(resolve => socketServer.listen(0, "127.0.0.1", resolve));
    try {
      const address = socketServer.address();
      if (!address || typeof address === "string") throw new Error("missing address");
      expect(await requestParent({ ...identity, port: address.port, token: "secret-token" }, { type })).toEqual({ stop: true, force: true });
      expect(calls).toBe(3);
      expect(diagnostic.mock.calls.map(call => call[0]).join("")).not.toContain("secret-token");
    } finally { diagnostic.mockRestore(); await new Promise<void>(resolve => socketServer.close(() => resolve())); }
  });

  it.each([["host-poll", 3], ["turn", 1]] as const)("bounds failed %s attempts and never replays a final turn", async (type, expected) => {
    let calls = 0;
    const diagnostic = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const socketServer = createServer(socket => socket.once("data", () => { calls++; socket.destroy(); }));
    await new Promise<void>(resolve => socketServer.listen(0, "127.0.0.1", resolve));
    try {
      const address = socketServer.address();
      if (!address || typeof address === "string") throw new Error("missing address");
      await expect(requestParent({ ...identity, port: address.port, token: "hidden" }, { type })).rejects.toThrow("connection-closed");
      expect(calls).toBe(expected);
      expect(diagnostic.mock.calls.at(-1)?.[0]).toContain("action=fail");
    } finally { diagnostic.mockRestore(); await new Promise<void>(resolve => socketServer.close(() => resolve())); }
  });

  it("holds one event request while idle and wakes it with the host stop event", async () => {
    let calls = 0;
    let publish!: (value: unknown) => void;
    const transport = server((_identity, message, signal) => {
      calls++;
      expect(message).toMatchObject({ type: "parent-events", payload: { consumer: "visible-host" } });
      return new Promise((resolve, reject) => {
        publish = resolve;
        signal.addEventListener("abort", () => reject(new Error("request disconnected")), { once: true });
      });
    });
    const endpoint = await transport.register(identity);
    let complete = false;
    const waiting = waitForParentEvents(endpoint, "visible-host").then(value => { complete = true; return value; });
    await vi.waitFor(() => expect(calls).toBe(1));
    await new Promise(resolve => setTimeout(resolve, 40));
    expect(complete).toBe(false);
    expect(calls).toBe(1);
    publish({ consumer: "visible-host", stop: true, force: false });
    await expect(waiting).resolves.toEqual({ consumer: "visible-host", stop: true, force: false });
    expect(calls).toBe(1);
  });

  it("cancels a held event request and disconnects the parent waiter", async () => {
    let calls = 0, disconnected = false;
    const transport = server((_identity, _message, signal) => {
      calls++;
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => { disconnected = true; reject(new Error("request disconnected")); }, { once: true }));
    });
    const endpoint = await transport.register(identity), controller = new AbortController();
    const waiting = waitForParentEvents(endpoint, "headless-app", controller.signal);
    const assertion = expect(waiting).rejects.toThrow();
    await vi.waitFor(() => expect(calls).toBe(1));
    controller.abort();
    await assertion;
    await vi.waitFor(() => expect(disconnected).toBe(true));
    expect(calls).toBe(1);
  });

  it("revokes an owned endpoint by disconnecting its held event request", async () => {
    let received = false, disconnected = false;
    const transport = server((_identity, _message, signal) => new Promise((_resolve, reject) => {
      received = true;
      signal.addEventListener("abort", () => { disconnected = true; reject(new Error("endpoint revoked")); }, { once: true });
    }));
    const endpoint = await transport.register({ ...identity, child: "child-b" });
    const endpointWait = waitForParentEvents(endpoint, "headless-app");
    const assertion = expect(endpointWait).rejects.toThrow();
    await vi.waitFor(() => expect(received).toBe(true));
    transport.revoke("child-b");
    await assertion;
    expect(disconnected).toBe(true);
  });

  it("reports parent loss to a held event request and clears its waiter", async () => {
    let received = false, disconnected = false;
    const transport = server((_identity, _message, signal) => new Promise((_resolve, reject) => {
      received = true;
      signal.addEventListener("abort", () => { disconnected = true; reject(new Error("owner closed")); }, { once: true });
    }));
    const endpoint = await transport.register(identity);
    const waiting = waitForParentEvents(endpoint, "headless-app");
    const assertion = expect(waiting).rejects.toThrow();
    await vi.waitFor(() => expect(received).toBe(true));
    await transport.close();
    await assertion;
    expect(disconnected).toBe(true);
  });

  it("validates event channel payloads before exposing them to consumers", async () => {
    const transport = server(async () => ({ consumer: "visible-app", commands: [{ id: "bad", type: "message", delivery: "later" }] }));
    const endpoint = await transport.register(identity);
    await expect(waitForParentEvents(endpoint, "visible-app")).rejects.toThrow(/command batch/);
  });

  it("does not retry an explicit parent rejection even for polls", async () => {
    let calls = 0;
    const transport = server(async () => { calls++; throw new Error("Child unavailable"); });
    const endpoint = await transport.register(identity);
    await expect(requestParent(endpoint, { type: "app-poll" })).rejects.toThrow("Child unavailable");
    expect(calls).toBe(1);
  });
  it("relays messages using server-owned identity over real loopback sockets", async () => {
    const transport = server(async (caller, message) => ({ caller, message }));
    const endpoint = await transport.register(identity);
    expect(await requestParent(endpoint, { type: "question", payload: "Which file?" })).toEqual({ caller: identity, message: { type: "question", payload: "Which file?" } });
    expect(await requestParent(endpoint, { type: "reply" })).toEqual({ caller: identity, message: { type: "reply" } });
  });
  it.each(["token", "child", "run", "origin"] as const)("rejects wrong %s before dispatch", async key => {
    let calls = 0;
    const transport = server(async () => { calls++; });
    const endpoint = await transport.register(identity);
    await expect(requestParent({ ...endpoint, [key]: "wrong" }, { type: "result" })).rejects.toThrow();
    expect(calls).toBe(0);
  });
  it("rejects revoked children and duplicate registration", async () => {
    const transport = server(async () => "ok");
    const endpoint = await transport.register(identity);
    await expect(transport.register(identity)).rejects.toThrow(/already/);
    transport.revoke(identity.child);
    await expect(requestParent(endpoint, { type: "result" })).rejects.toThrow();
  });
  it("bounds payloads and propagates parent rejection", async () => {
    const transport = server(async () => { throw new Error("Not permitted"); });
    const endpoint = await transport.register(identity);
    await expect(requestParent(endpoint, { type: "delegate" })).rejects.toThrow("Not permitted");
    await expect(requestParent(endpoint, { type: "result", payload: "x".repeat(256 * 1024) })).rejects.toThrow(/limit/);
  });
  it("closes outstanding connections when the owner exits", async () => {
    const transport = server(async () => new Promise(() => {}));
    const endpoint = await transport.register(identity);
    const pending = requestParent(endpoint, { type: "question" });
    const assertion = expect(pending).rejects.toThrow();
    await transport.close();
    await assertion;
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { ChildTransport, requestParent } from "../lib/subagents/transport.ts";
const servers: ChildTransport[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => server.close())); });
function server(handler: ConstructorParameters<typeof ChildTransport>[0]) {
  const transport = new ChildTransport(handler); servers.push(transport); return transport;
}
const identity = { child: "child-a", run: "run-a", origin: "origin-a" };
describe("authenticated child transport", () => {
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

import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, it, vi } from "vitest";
import { bindBrowserPolicy, browserPolicyIdentity, requestBrowserLocalFilePolicy, type BrowserPolicyDecision } from "../../lib/browser-effect-contract.ts";
import { harness } from "./fixtures/fake-pi.ts";

it("authorizes an explicit synthetic local file without executing a read", async () => {
  const h = await harness();
  const path = join(h.cwd, "synthetic-does-not-exist.txt");
  await h.emit("input", { source: "interactive", text: `Read ${path}` });
  const executeTool = vi.fn();
  Object.assign(h.ctx, { executeTool });
  const identity = browserPolicyIdentity(h.api.events)!;
  const result = await requestBrowserLocalFilePolicy(h.api.events, identity, fileURLToPath(pathToFileURL(path)), new AbortController().signal);
  expect(result.outcome).toBe("allow");
  expect(executeTool).not.toHaveBeenCalled();
  expect(h.select).not.toHaveBeenCalled();
});

it("uses the actual protected-path policy, even with bypass and explicit intent", async () => {
  const h = await harness();
  h.gate.setBypass(true);
  const path = join(homedir(), ".ssh", "id_ed25519");
  await h.emit("input", { source: "interactive", text: `Read ${path}` });
  expect(await requestBrowserLocalFilePolicy(h.api.events, browserPolicyIdentity(h.api.events)!, fileURLToPath(pathToFileURL(path)), new AbortController().signal)).toMatchObject({ outcome: "deny" });
  expect(h.select).not.toHaveBeenCalled();
});

it("fails closed for missing/duplicate owners, stale generation, canceled calls and non-native paths", async () => {
  const h = await harness();
  const identity = browserPolicyIdentity(h.api.events)!;
  const path = join(h.cwd, "synthetic.txt");
  const signal = new AbortController().signal;
  const request = () => requestBrowserLocalFilePolicy(h.api.events, identity, path, signal);
  const unbind = bindBrowserPolicy(h.api.events, async () => ({ outcome: "allow", reason: "synthetic" }), { identity: () => identity, signal: () => signal, observe: () => {}, localFile: async () => ({ outcome: "allow", reason: "synthetic" }) });
  expect(await request()).toMatchObject({ outcome: "ask" });
  unbind();
  expect(await requestBrowserLocalFilePolicy(h.api.events, identity, pathToFileURL(path).href, signal)).toMatchObject({ outcome: "deny" });
  expect(await requestBrowserLocalFilePolicy(h.api.events, identity, "relative.txt", signal)).toMatchObject({ outcome: "deny" });
  const canceled = new AbortController(); canceled.abort();
  expect(await requestBrowserLocalFilePolicy(h.api.events, identity, path, canceled.signal)).toMatchObject({ outcome: "deny" });
  await h.emit("session_tree");
  expect(await request()).toMatchObject({ outcome: "deny" });
  await h.emit("session_shutdown");
  expect(await request()).toMatchObject({ outcome: "ask" });
});

it.each(["cancel", "tree"])("invalidates pending native filesystem approval on %s", async action => {
  const h = await harness();
  let entered!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  let finish!: (answer: string) => void;
  h.select.mockImplementation(async () => { entered(); return new Promise(resolve => { finish = resolve; }); });
  const caller = new AbortController();
  const pending = requestBrowserLocalFilePolicy(h.api.events, browserPolicyIdentity(h.api.events)!, join(h.cwd, "synthetic.tfvars"), caller.signal);
  await ready;
  if (action === "cancel") caller.abort(); else await h.emit("session_tree");
  expect(await pending).toMatchObject({ outcome: "deny" });
  finish("Allow once");
});

it.each(["cancel", "tree"])("invalidates pending filesystem review on %s", async action => {
  let entered!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  let finish!: (value: BrowserPolicyDecision) => void;
  const h = await harness();
  await h.emit("session_shutdown");
  const identity = { sessionId: "s", branchId: "b", generation: 1 };
  const lifetime = new AbortController();
  const caller = new AbortController();
  const stop = bindBrowserPolicy(h.api.events, async () => ({ outcome: "allow", reason: "unused" }), { identity: () => identity, signal: () => lifetime.signal, observe: () => {}, localFile: async () => { entered(); return new Promise(resolve => { finish = resolve; }); } });
  const pending = requestBrowserLocalFilePolicy(h.api.events, identity, join(h.cwd, "synthetic.txt"), caller.signal);
  await ready;
  if (action === "cancel") caller.abort(); else { identity.generation++; lifetime.abort(); }
  expect(await pending).toMatchObject({ outcome: "deny" });
  finish({ outcome: "allow", reason: "late" });
  stop();
});

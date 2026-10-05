import { afterEach, expect, it, vi } from "vitest";
import { createBrowserCredentialResolver, parseBrowserCredentialConfig, browserCredentialConfigPath } from "../lib/browser-credentials.ts";

const binding = { record_id: "synthetic-record", expected_key: "synthetic-user", origins: ["https://login.example"], frame_origins: ["https://login.example"], fields: ["username", "password"], form_origins: ["https://login.example"] };
const target = { origin: "https://login.example", frameOrigin: "https://login.example", field: "password", formOrigin: "https://login.example" };
const record = (key = "synthetic-user", value = "fixture-secret") => ({ code: 0, killed: false, stdout: JSON.stringify({ key, value }), stderr: "" });
afterEach(() => vi.unstubAllEnvs());

it("validates strict identity-free local bindings and computes the active-profile file", () => {
  expect(parseBrowserCredentialConfig({ version: 1, bindings: { test: binding } })).toEqual({ version: 1, bindings: { test: binding } });
  expect(browserCredentialConfigPath("/active/profile").replaceAll("\\", "/")).toBe("/active/profile/browser-credentials.json");
  expect(() => parseBrowserCredentialConfig({ version: 1, bindings: { test: { ...binding, origins: ["https://login.example/path"] } } })).toThrow();
  expect(() => parseBrowserCredentialConfig({ version: 2, bindings: {} })).toThrow();
  expect(() => parseBrowserCredentialConfig({ version: 1, bindings: {}, extra: true })).toThrow();
  expect(() => parseBrowserCredentialConfig({ version: 1, bindings: { test: { ...binding, extra: true } } })).toThrow();
  expect(() => parseBrowserCredentialConfig({ version: 1, bindings: { test: { ...binding, origins: ["https://user:pass@login.example"] } } })).toThrow();
});

it("allows a no-form login after binding its actual frame and field", async () => {
  vi.stubEnv("BITWARDEN_ACCESS_KEY", "synthetic-access-key");
  const noFormTarget = { origin: target.origin, frameOrigin: target.frameOrigin, field: target.field };
  const resolver = createBrowserCredentialResolver({ version: 1, bindings: { login: binding } }, vi.fn(async () => record()), new AbortController().signal);
  await expect(resolver.resolve("login", noFormTarget, new AbortController().signal)).resolves.toBe("fixture-secret");
});

it("defaults available form destinations to the bound frame origins", async () => {
  vi.stubEnv("BITWARDEN_ACCESS_KEY", "synthetic-access-key");
  const { form_origins: _forms, ...withoutForms } = binding;
  const exec = vi.fn(async () => record());
  const resolver = createBrowserCredentialResolver({ version: 1, bindings: { login: withoutForms } }, exec, new AbortController().signal);
  await expect(resolver.resolve("login", { ...target, formOrigin: "https://attacker.example" }, new AbortController().signal)).rejects.toThrow("not bound");
  expect(exec).not.toHaveBeenCalled();
  await expect(resolver.resolve("login", target, new AbortController().signal)).resolves.toBe("fixture-secret");
});

it("retrieves the exact bound record lazily, coalesces calls, and clears on lifetime end", async () => {
  vi.stubEnv("BITWARDEN_ACCESS_KEY", "synthetic-access-key");
  const lifetime = new AbortController();
  let finish!: (value: Awaited<ReturnType<typeof record>>) => void;
  const exec = vi.fn(() => new Promise<Awaited<ReturnType<typeof record>>>(resolve => { finish = resolve; }));
  const resolver = createBrowserCredentialResolver(parseBrowserCredentialConfig({ version: 1, bindings: { login: binding } }), exec, lifetime.signal);
  const first = resolver.resolve("login", target, new AbortController().signal);
  const second = resolver.resolve("login", target, new AbortController().signal);
  expect(exec).toHaveBeenCalledOnce();
  expect(exec).toHaveBeenCalledWith("uv", expect.arrayContaining(["--with", "bitwarden-sdk==2.1.0", expect.stringMatching(/credential\.py$/), "synthetic-record"]), expect.objectContaining({ timeout: 20_000 }));
  finish(record());
  expect(await Promise.all([first, second])).toEqual(["fixture-secret", "fixture-secret"]);
  lifetime.abort();
  await expect(resolver.resolve("login", target, new AbortController().signal)).rejects.toThrow("canceled");
});

it.each([
  ["wrong origin", { ...target, origin: "https://other.example" }],
  ["wrong frame", { ...target, frameOrigin: "https://other.example" }],
  ["wrong field", { ...target, field: "otp" }],
  ["wrong form", { ...target, formOrigin: "https://other.example" }],
] as const)("rejects %s before BWS access", async (_name, rejectedTarget) => {
  vi.stubEnv("BITWARDEN_ACCESS_KEY", "synthetic-access-key");
  const exec = vi.fn();
  const resolver = createBrowserCredentialResolver({ version: 1, bindings: { login: binding } }, exec, new AbortController().signal);
  await expect(resolver.resolve("login", rejectedTarget, new AbortController().signal)).rejects.toThrow("not bound");
  expect(exec).not.toHaveBeenCalled();
});

it("rejects wrong or malformed records without including secret material in errors", async () => {
  vi.stubEnv("BITWARDEN_ACCESS_KEY", "synthetic-access-key");
  for (const stdout of [JSON.stringify({ key: "wrong", value: "fixture-secret" }), "fixture-secret"]) {
    const resolver = createBrowserCredentialResolver({ version: 1, bindings: { login: binding } }, vi.fn(async () => ({ code: 0, killed: false, stdout, stderr: "fixture-secret" })), new AbortController().signal);
    await expect(resolver.resolve("login", target, new AbortController().signal)).rejects.not.toThrow("fixture-secret");
  }
});

it("normalizes trailing-dot request hosts and snapshots mutable configuration", async () => {
  vi.stubEnv("BITWARDEN_ACCESS_KEY", "synthetic-access-key");
  const mutable = { version: 1 as const, bindings: { login: { ...binding, origins: [...binding.origins], fields: [...binding.fields] } } };
  const resolver = createBrowserCredentialResolver(mutable, vi.fn(async () => record()), new AbortController().signal);
  mutable.bindings.login.origins.push("https://attacker.example");
  await expect(resolver.resolve("login", { ...target, origin: "https://login.example." }, new AbortController().signal)).resolves.toBe("fixture-secret");
  await expect(resolver.resolve("login", { ...target, origin: "https://attacker.example" }, new AbortController().signal)).rejects.toThrow("not bound");
  await expect(resolver.resolve("login", { ...target, origin: "https://user:pass@login.example" }, new AbortController().signal)).rejects.toThrow();
});

it("settles a canceled coalesced follower without waiting for the retrieval", async () => {
  vi.stubEnv("BITWARDEN_ACCESS_KEY", "synthetic-access-key");
  let finish!: (value: Awaited<ReturnType<typeof record>>) => void;
  const resolver = createBrowserCredentialResolver({ version: 1, bindings: { login: binding } }, vi.fn(() => new Promise<Awaited<ReturnType<typeof record>>>(resolve => { finish = resolve; })), new AbortController().signal);
  const first = resolver.resolve("login", target, new AbortController().signal);
  const controller = new AbortController();
  const follower = resolver.resolve("login", target, controller.signal);
  controller.abort();
  await expect(follower).rejects.toThrow("canceled");
  finish(record());
  await expect(first).resolves.toBe("fixture-secret");
});

it("rejects missing record values and never exposes secret material", async () => {
  vi.stubEnv("BITWARDEN_ACCESS_KEY", "synthetic-access-key");
  const resolver = createBrowserCredentialResolver({ version: 1, bindings: { login: binding } }, vi.fn(async () => ({ code: 0, killed: false, stdout: JSON.stringify({ key: "synthetic-user" }), stderr: "fixture-secret" })), new AbortController().signal);
  await expect(resolver.resolve("login", target, new AbortController().signal)).rejects.not.toThrow("fixture-secret");
});

it("stops canceled operations and never starts without the BWS access key", async () => {
  vi.stubEnv("BITWARDEN_ACCESS_KEY", "");
  const exec = vi.fn();
  const resolver = createBrowserCredentialResolver({ version: 1, bindings: { login: binding } }, exec, new AbortController().signal);
  await expect(resolver.resolve("login", target, new AbortController().signal)).rejects.toThrow("unavailable");
  expect(exec).not.toHaveBeenCalled();
  vi.stubEnv("BITWARDEN_ACCESS_KEY", "synthetic-access-key");
  const controller = new AbortController(); controller.abort();
  await expect(resolver.resolve("login", target, controller.signal)).rejects.toThrow("canceled");
  expect(exec).not.toHaveBeenCalled();
});

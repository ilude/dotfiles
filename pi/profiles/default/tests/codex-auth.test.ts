import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { CODEX_QUOTA_LOGIN, resolveCodexAuth } from "../lib/codex-auth.ts";

const token = (accountId: string) => `header.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: accountId } })).toString("base64url")}.signature`;
const native = { type: "oauth", access: "native-model-token", refresh: "native-refresh", expires: Date.now() + 3_600_000 };
const quota = { type: "oauth", access: token("quota-account"), refresh: "quota-refresh", expires: Date.now() + 3_600_000 };
let dir: string;
const signal = () => new AbortController().signal;
const authFile = () => join(dir, "auth.json");
const runtime = () => ModelRuntime.create({ authPath: authFile(), modelsPath: null, refreshOnCreate: false });
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pi-quota-auth-"));
  vi.stubEnv("PI_CODING_AGENT_DIR", dir);
  // A missing CLI and an unrelated CLI auth directory must not affect Pi auth.
  vi.stubEnv("PATH", "");
  vi.stubEnv("CODEX_HOME", join(dir, "missing-cli"));
  writeFileSync(authFile(), JSON.stringify({ openai: native, "openai-codex": quota }));
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Unexpected network request"); }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });

it("uses the active Pi profile's quota login without CLI or native model credentials", async () => {
  const registry = new ModelRegistry(await runtime());
  expect(await resolveCodexAuth(registry, signal())).toEqual({ accessToken: quota.access, accountId: "quota-account" });
  expect(fetch).not.toHaveBeenCalled();
  expect(JSON.parse(readFileSync(authFile(), "utf8")).openai).toEqual(native);
});

it("provides an actionable Pi login on a machine with only native model auth", async () => {
  writeFileSync(authFile(), JSON.stringify({ openai: native }));
  const rt = await runtime();
  expect(rt.getProvider("openai-codex")?.auth.oauth?.login).toBeTypeOf("function");
  await expect(resolveCodexAuth(new ModelRegistry(rt), signal())).rejects.toMatchObject({ status: "login needed", message: expect.stringContaining(CODEX_QUOTA_LOGIN) });
  expect(fetch).not.toHaveBeenCalled();
});

it("uses Pi's built-in device login and persists quota auth without changing native auth", async () => {
  writeFileSync(authFile(), JSON.stringify({ openai: native }));
  const rt = await runtime();
  vi.mocked(fetch).mockImplementation(async input => {
    const url = String(input);
    if (url.endsWith("/deviceauth/usercode")) return Response.json({ device_auth_id: "fixture", user_code: "ABCD", interval: "0" });
    if (url.endsWith("/deviceauth/token")) return Response.json({ authorization_code: "fixture-code", code_verifier: "fixture-verifier" });
    if (url.endsWith("/oauth/token")) return Response.json({ access_token: quota.access, refresh_token: quota.refresh, expires_in: 3600 });
    throw new Error("Unexpected login URL");
  });
  const notify = vi.fn();
  await rt.login("openai-codex", "oauth", { prompt: async () => "device_code", notify, signal: signal() });
  expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: "device_code", verificationUri: "https://auth.openai.com/codex/device" }));
  expect(await resolveCodexAuth(new ModelRegistry(rt), signal())).toEqual({ accessToken: quota.access, accountId: "quota-account" });
  const stored = JSON.parse(readFileSync(authFile(), "utf8"));
  expect(stored["openai-codex"]).toMatchObject({ type: "oauth", access: quota.access, refresh: quota.refresh });
  expect(stored.openai).toEqual(native);
});

it("renews once under Pi's file lock for concurrent runtimes and preserves both logins", async () => {
  writeFileSync(authFile(), JSON.stringify({ openai: native, "openai-codex": { ...quota, expires: 0 } }));
  const registries = await Promise.all([runtime(), runtime()]).then(runtimes => runtimes.map(rt => new ModelRegistry(rt)));
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    expect(String(input)).toBe("https://auth.openai.com/oauth/token");
    expect(new URLSearchParams(String(init?.body)).get("refresh_token")).toBe(quota.refresh);
    return Response.json({ access_token: token("renewed-account"), refresh_token: "rotated-refresh", expires_in: 3600 });
  });
  const results = await Promise.all(registries.map(registry => resolveCodexAuth(registry, signal())));
  expect(results).toEqual([0, 1].map(() => ({ accessToken: token("renewed-account"), accountId: "renewed-account" })));
  expect(fetch).toHaveBeenCalledOnce();
  const stored = JSON.parse(readFileSync(authFile(), "utf8"));
  expect(stored["openai-codex"].refresh).toBe("rotated-refresh");
  expect(stored.openai).toEqual(native);
});

it("reports renewal failures without leaking provider responses or changing model login", async () => {
  writeFileSync(authFile(), JSON.stringify({ openai: native, "openai-codex": { ...quota, expires: 0 } }));
  const registry = new ModelRegistry(await runtime());
  vi.mocked(fetch).mockResolvedValue(Response.json({ error: "invalid_grant", privateFixture: "not-for-report" }, { status: 400 }));
  await expect(resolveCodexAuth(registry, signal())).rejects.toMatchObject({ status: "auth renewal failed", message: expect.not.stringContaining("not-for-report") });
  expect(JSON.parse(readFileSync(authFile(), "utf8")).openai).toEqual(native);
});

it("cancels the reader promptly without discarding a credential Pi is renewing", async () => {
  writeFileSync(authFile(), JSON.stringify({ openai: native, "openai-codex": { ...quota, expires: 0 } }));
  const registry = new ModelRegistry(await runtime());
  let finish!: (response: Response) => void;
  let started!: () => void;
  const entered = new Promise<void>(resolve => { started = resolve; });
  vi.mocked(fetch).mockImplementation(() => { started(); return new Promise(resolve => { finish = resolve; }); });
  const abort = new AbortController();
  const pending = resolveCodexAuth(registry, abort.signal);
  await entered;
  abort.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  finish(Response.json({ access_token: token("renewed-account"), refresh_token: "rotated-refresh", expires_in: 3600 }));
  // Joining the same credential lock establishes that the refresh was persisted.
  expect((await resolveCodexAuth(registry, signal())).accountId).toBe("renewed-account");
  expect(JSON.parse(readFileSync(authFile(), "utf8"))["openai-codex"].refresh).toBe("rotated-refresh");
});

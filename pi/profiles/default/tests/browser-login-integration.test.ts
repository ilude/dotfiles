import { describe, expect, it } from "vitest";
import { browserFillExpression, type BrowserFill } from "../lib/browser-control.js";
import { createBrowserCredentialResolver, type BrowserCredentialConfig } from "../lib/browser-credentials.js";

describe("configured browser credential bindings", () => {
  const config: BrowserCredentialConfig = { version: 1, bindings: { login: {
    record_id: "synthetic-record", expected_key: "synthetic-key", origins: ["https://account.example"],
    frame_origins: ["https://idp.example"], fields: ["password"], form_origins: ["https://account.example"],
  } } };

  it("resolves only the configured account, exact frame, field, and form", async () => {
    const exec = async () => ({ code: 0, killed: false, stdout: JSON.stringify({ key: "synthetic-key", value: "synthetic-secret" }), stderr: "" });
    const lifetime = new AbortController();
    const resolver = createBrowserCredentialResolver(config, exec, lifetime.signal);
    const target = { origin: "https://account.example", frameOrigin: "https://idp.example", field: "password", formOrigin: "https://account.example" };
    await expect(resolver.resolve("login", target, lifetime.signal)).resolves.toBe("synthetic-secret");
    await expect(resolver.resolve("login", { ...target, frameOrigin: "https://attacker.example" }, lifetime.signal)).rejects.toThrow("not bound");
    lifetime.abort();
  });

  it("preserves the configured secret fill setter without policy or interception metadata", () => {
    const input: BrowserFill = { secret_ref: "login" };
    expect(input.secret_ref).toBe("login");
    const expression = browserFillExpression("#password", "synthetic-secret");
    expect(expression).toContain("setter.call(element");
    expect(expression).toContain("dispatchEvent(new InputEvent('input'");
  });
});

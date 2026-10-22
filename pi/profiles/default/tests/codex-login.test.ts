import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { getThemeByName, initTheme } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import { KeybindingsManager } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/keybindings.js";
import { ProcessTerminal, setKeybindings, TuiMainScreen, type Component, type TUI } from "@earendil-works/pi-tui";
import { codexLoginMethod, loginForCodexUsage } from "../lib/codex-login.ts";

initTheme("dark", false);
setKeybindings(new KeybindingsManager());
let dir: string;
const native = { type: "oauth", access: "native-fixture", refresh: "native-refresh", expires: Date.now() + 3_600_000 };
const access = `header.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "quota-account" } })).toString("base64url")}.signature`;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pi-footer-login-"));
  vi.stubEnv("PI_CODING_AGENT_DIR", dir);
  vi.stubEnv("SSH_CONNECTION", "remote-session-fixture");
  writeFileSync(join(dir, "auth.json"), JSON.stringify({ openai: native }));
  vi.stubGlobal("fetch", vi.fn(async input => {
    const url = String(input);
    if (url.endsWith("/deviceauth/usercode")) return Response.json({ device_auth_id: "fixture", user_code: "ABCD", interval: "0" });
    if (url.endsWith("/deviceauth/token")) return Response.json({ authorization_code: "fixture-code", code_verifier: "fixture-verifier" });
    if (url.endsWith("/oauth/token")) return Response.json({ access_token: access, refresh_token: "quota-refresh", expires_in: 3600 });
    throw new Error("Unexpected network request");
  }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });

function loginUI(onRender: (component: Component, text: string) => void) {
  const frames: string[] = [];
  const ui: Pick<ExtensionContext["ui"], "custom" | "notify"> = {
    notify: vi.fn(),
    custom<T>(factory: (tui: TUI, theme: Theme, keys: KeybindingsManager, done: (result: T) => void) => (Component & { dispose?(): void }) | Promise<Component & { dispose?(): void }>) {
      return new Promise<T>((resolve, reject) => {
        // Real native dialog rendering, without starting a terminal or opening a browser.
        const tui = new TuiMainScreen(new ProcessTerminal());
        let component: (Component & { dispose?(): void }) | undefined;
        const render = () => {
          if (!component) return;
          const text = component.render(100).join("\n");
          frames.push(text);
          onRender(component, text);
        };
        vi.spyOn(tui, "requestRender").mockImplementation(render);
        const done = (result: T) => { component?.dispose?.(); resolve(result); };
        Promise.resolve(factory(tui, getThemeByName("dark")!, new KeybindingsManager(), done)).then(value => {
          component = value;
          render();
        }, reject);
      });
    },
  };
  return { ui, frames };
}

it.each<{ platform: NodeJS.Platform; env: NodeJS.ProcessEnv; method: string }>([
  { platform: "win32", env: {}, method: "browser" },
  { platform: "darwin", env: {}, method: "browser" },
  { platform: "linux", env: { DISPLAY: ":0" }, method: "browser" },
  { platform: "linux", env: { WAYLAND_DISPLAY: "wayland-0" }, method: "browser" },
  { platform: "linux", env: {}, method: "device_code" },
  { platform: "linux", env: { WSL_DISTRO_NAME: "Ubuntu" }, method: "device_code" },
  { platform: "win32", env: { SSH_CONNECTION: "remote" }, method: "device_code" },
  { platform: "darwin", env: { SSH_CLIENT: "remote" }, method: "device_code" },
  { platform: "linux", env: { DISPLAY: "localhost:10", SSH_TTY: "/dev/pts/1" }, method: "device_code" },
  { platform: "linux", env: { MOSH_CONNECTION: "remote" }, method: "device_code" },
])("chooses $method for $platform with $env", ({ platform, env, method }) => {
  expect(codexLoginMethod(platform, env)).toBe(method);
});

it("starts native device login automatically over SSH and saves only the quota credential", async () => {
  const r = loginUI(() => {});
  expect(await loginForCodexUsage(r, new AbortController().signal)).toBe(true);
  const stored = JSON.parse(readFileSync(join(dir, "auth.json"), "utf8"));
  expect(stored.openai).toEqual(native);
  expect(stored["openai-codex"]).toMatchObject({ type: "oauth", access, refresh: "quota-refresh" });
  expect(r.frames.join("\n")).not.toContain("Select OpenAI Codex login method");
  expect(r.frames.join("\n")).toContain("ABCD");
  expect(r.frames.join("\n")).toContain("https://auth.openai.com/codex/device");
  expect(r.ui.notify).not.toHaveBeenCalled();
});

it("cancels native device login without changing credentials", async () => {
  const r = loginUI((component, text) => {
    if (text.includes("Waiting for authentication")) component.handleInput!("\x1b");
  });
  expect(await loginForCodexUsage(r, new AbortController().signal)).toBe(false);
  expect(fetch).toHaveBeenCalledOnce();
  expect(JSON.parse(readFileSync(join(dir, "auth.json"), "utf8"))).toEqual({ openai: native });
  expect(r.ui.notify).not.toHaveBeenCalled();
});

it("keeps token endpoint errors out of the UI and leaves the existing model login intact", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ privateTokenResponse: "do-not-display" }, { status: 400 }));
  const r = loginUI(() => {});
  expect(await loginForCodexUsage(r, new AbortController().signal)).toBe(false);
  expect(r.ui.notify).toHaveBeenCalledWith("Codex sign-in failed. Retry /usage login or use /login openai-codex.", "error");
  expect(r.frames.join("\n")).not.toContain("do-not-display");
  expect(JSON.parse(readFileSync(join(dir, "auth.json"), "utf8"))).toEqual({ openai: native });
});

import { LoginDialogComponent, ModelRuntime, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AuthPrompt } from "@earendil-works/pi-ai";
import { CODEX_QUOTA_PROVIDER } from "./codex-auth.ts";

/** Choose the local browser only when the session has a local desktop. */
export function codexLoginMethod(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env): "browser" | "device_code" {
  if (env.SSH_CONNECTION || env.SSH_CLIENT || env.SSH_TTY || env.MOSH_CONNECTION) return "device_code";
  if (platform === "win32" || platform === "darwin") return "browser";
  return platform === "linux" && (env.DISPLAY || env.WAYLAND_DISPLAY) ? "browser" : "device_code";
}

/** Use Pi's own OAuth flow, dialog and credential storage without selecting a model. */
export async function loginForCodexUsage(ctx: { ui: Pick<ExtensionContext["ui"], "custom" | "notify"> }, signal: AbortSignal): Promise<boolean> {
  return ctx.ui.custom<boolean>((tui, _theme, _keys, done) => {
    const dialog = new LoginDialogComponent(tui, CODEX_QUOTA_PROVIDER, () => {}, "OpenAI Codex");
    const abort = new AbortController();
    const loginSignal = AbortSignal.any([signal, dialog.signal, abort.signal]);
    let failed = false;
    const close = () => done(false);
    loginSignal.addEventListener("abort", close, { once: true });

    async function prompt(request: AuthPrompt): Promise<string> {
      const promptSignal = request.signal ? AbortSignal.any([loginSignal, request.signal]) : loginSignal;
      promptSignal.throwIfAborted();
      if (request.type === "select") return codexLoginMethod();
      const response = request.type === "manual_code"
        ? dialog.showManualInput(request.message)
        : dialog.showPrompt(request.message, request.placeholder);
      let onAbort = () => {};
      const cancelled = new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(new Error("Login cancelled"));
        promptSignal.addEventListener("abort", onAbort, { once: true });
      });
      try { return await Promise.race([response, cancelled]); }
      finally { promptSignal.removeEventListener("abort", onAbort); }
    }

    // The factory must return the component before asynchronous login work starts.
    void (async () => {
      try {
        const runtime = await ModelRuntime.create({ modelsPath: null, refreshOnCreate: false, signal: loginSignal });
        loginSignal.throwIfAborted();
        await runtime.login(CODEX_QUOTA_PROVIDER, "oauth", {
          signal: loginSignal,
          prompt,
          notify(event) {
            if (event.type === "auth_url") dialog.showAuth(event.url, event.instructions);
            else if (event.type === "device_code") { dialog.showDeviceCode(event); dialog.showWaiting("Waiting for authentication..."); }
            else if (event.type === "info") dialog.showInfo(event.message, event.links);
            else dialog.showProgress(event.message);
          },
        });
        done(true);
      } catch {
        // Provider exceptions may contain token responses. Do not put them in UI or history.
        failed = !loginSignal.aborted;
        done(false);
      }
    })();

    return {
      get focused() { return dialog.focused; },
      set focused(value: boolean) { dialog.focused = value; },
      render: (width: number) => dialog.render(width),
      invalidate: () => dialog.invalidate(),
      handleInput: (data: string) => dialog.handleInput(data),
      handleMouse: (event) => dialog.handleMouse(event),
      dispose() {
        loginSignal.removeEventListener("abort", close);
        abort.abort();
        if (failed) ctx.ui.notify("Codex sign-in failed. Retry /usage login or use /login openai-codex.", "error");
      },
    };
  });
}

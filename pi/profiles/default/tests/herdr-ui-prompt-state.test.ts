import { afterEach, expect, it, vi } from "vitest";
import register from "../extensions/herdr-ui-prompt-state.ts";
afterEach(() => vi.unstubAllEnvs());
it("publishes one waiting span and clears on cancellation/shutdown, TUI only", () => {
  vi.stubEnv("HERDR_ENV", "1"); vi.stubEnv("HERDR_SOCKET_PATH", "fixture"); vi.stubEnv("HERDR_PANE_ID", "p1");
  const handlers: Record<string, (...args: any[]) => void> = {}; const emit = vi.fn();
  register({ events: { emit }, on(n: string, h: any) { handlers[n] = h; } } as any);
  const start = () => handlers.ui_prompt_start({ kind: "custom" }, { mode: "tui" });
  handlers.ui_prompt_start({}, { mode: "rpc" }); expect(emit).not.toHaveBeenCalled();
  start(); start(); expect(emit).toHaveBeenCalledTimes(1);
  handlers.ui_prompt_end(); handlers.ui_prompt_end(); expect(emit).toHaveBeenCalledTimes(2);
  start(); handlers.session_shutdown(); expect(emit.mock.calls.at(-1)).toEqual(["herdr:blocked", { active: false }]);
  start(); handlers.session_start(); expect(emit.mock.calls.at(-1)).toEqual(["herdr:blocked", { active: false }]);
});

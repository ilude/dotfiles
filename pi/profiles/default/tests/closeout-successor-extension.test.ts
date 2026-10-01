import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import closeoutSuccessor from "../extensions/closeout-successor.ts";

const bind = vi.hoisted(() => vi.fn());
vi.mock("../lib/subagents/successor-surface.ts", () => ({ bindSuccessorSurface: bind }));

// The thin activation wrapper only forwards this identity to the binder.
const api = {} as ExtensionAPI;
beforeEach(() => { bind.mockReset(); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("successor extension discovery", () => {
  it.each([undefined, "", "0"])("is inert in ordinary discovery (mode=%s)", mode => {
    vi.stubEnv("PI_CLOSEOUT_SUCCESSOR", mode);
    closeoutSuccessor(api);
    expect(bind).not.toHaveBeenCalled();
  });

  it("binds the authenticated surface in successor mode", () => {
    vi.stubEnv("PI_CLOSEOUT_SUCCESSOR", "1");
    closeoutSuccessor(api);
    expect(bind).toHaveBeenCalledExactlyOnceWith(api);
  });

  it("does not suppress successor authority rejection", () => {
    vi.stubEnv("PI_CLOSEOUT_SUCCESSOR", "1");
    bind.mockImplementation(() => { throw new Error("Invalid restricted successor authority"); });
    expect(() => closeoutSuccessor(api)).toThrow("Invalid restricted successor authority");
  });
});

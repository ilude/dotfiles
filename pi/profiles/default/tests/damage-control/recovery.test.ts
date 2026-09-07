import { describe, expect, it, vi } from "vitest";

type RecoveryContext = {
  mode: "tui" | "rpc" | "json" | "print";
  hasUI: boolean;
  signal?: AbortSignal;
  ui: {
    setStatus: (key: string, value: string | undefined) => void;
    confirm: (title: string, message: string, options?: { signal?: AbortSignal }) => Promise<boolean>;
  };
};
type RecoveryHandler = (event: unknown, context: RecoveryContext) => unknown | Promise<unknown>;
type RecoveryApi = {
  on: (event: string, handler: RecoveryHandler) => void;
  getActiveTools: () => string[];
  setActiveTools: (names: string[]) => void;
};
type RecoveryFactory = (api: RecoveryApi) => void;
type RecoveryModule = {
  default: RecoveryFactory;
  createRecoveryExtension: (interactiveProcess?: () => boolean) => RecoveryFactory;
};

async function loadRecoveryModule(): Promise<RecoveryModule> {
  const loaded: unknown = await import(
    new URL("../../../../../scripts/pi-damage-control-recovery.js", import.meta.url).href
  );
  if (
    !loaded ||
    typeof loaded !== "object" ||
    !("default" in loaded) ||
    typeof loaded.default !== "function" ||
    !("createRecoveryExtension" in loaded) ||
    typeof loaded.createRecoveryExtension !== "function"
  ) {
    throw new Error("Recovery helper does not export the expected extension factory");
  }
  return loaded as RecoveryModule;
}

function mockApi(options: { failAfterGuard?: boolean } = {}) {
  const handlers = new Map<string, RecoveryHandler[]>();
  const registrations: string[] = [];
  let activeTools = ["read", "bash", "edit", "write"];
  const setActiveTools = vi.fn((names: string[]) => {
    activeTools = [...names];
  });
  const api: RecoveryApi = {
    on(event, handler) {
      registrations.push(event);
      if (options.failAfterGuard && registrations.length > 1) {
        throw new Error("fixture registration failure");
      }
      const current = handlers.get(event) ?? [];
      current.push(handler);
      handlers.set(event, current);
    },
    getActiveTools: () => [...activeTools],
    setActiveTools,
  };
  return { api, handlers, registrations, setActiveTools, activeTools: () => activeTools };
}

function mockContext(
  overrides: Partial<Pick<RecoveryContext, "mode" | "hasUI" | "signal">> = {},
  confirm: RecoveryContext["ui"]["confirm"] = async () => true,
) {
  const setStatus = vi.fn<RecoveryContext["ui"]["setStatus"]>();
  return {
    context: {
      mode: "tui",
      hasUI: true,
      signal: undefined,
      ...overrides,
      ui: { setStatus, confirm: vi.fn(confirm) },
    } satisfies RecoveryContext,
    setStatus,
  };
}

function handlerFor(handlers: Map<string, RecoveryHandler[]>, event: string): RecoveryHandler {
  const handler = handlers.get(event)?.[0];
  if (!handler) throw new Error(`Missing ${event} handler`);
  return handler;
}

function expectBlocked(value: unknown, text: string): void {
  expect(value).toEqual({ block: true, reason: expect.stringContaining(text) });
}

describe("independent damage-control recovery helper", () => {
  it("installs its guard first and releases the original tools only after confirmation", async () => {
    const recovery = await loadRecoveryModule();
    const mocked = mockApi();
    let resolveConfirmation: ((confirmed: boolean) => void) | undefined;
    const confirmation = new Promise<boolean>((resolve) => {
      resolveConfirmation = resolve;
    });
    const { context, setStatus } = mockContext({}, () => confirmation);

    recovery.createRecoveryExtension(() => true)(mocked.api);
    expect(mocked.registrations[0]).toBe("tool_call");
    expect(mocked.handlers.has("user_bash")).toBe(false);

    const starting = Promise.resolve(handlerFor(mocked.handlers, "session_start")({}, context));
    await vi.waitFor(() => expect(context.ui.confirm).toHaveBeenCalledOnce());
    expect(mocked.activeTools()).toEqual([]);
    expectBlocked(
      await handlerFor(mocked.handlers, "tool_call")({}, context),
      "until the operator confirms",
    );

    resolveConfirmation?.(true);
    await starting;
    expect(mocked.activeTools()).toEqual(["read", "bash", "edit", "write"]);
    expect(await handlerFor(mocked.handlers, "tool_call")({}, context)).toBeUndefined();
    expect(setStatus).toHaveBeenCalledWith("damage-control-recovery", "damage-control: recovery");
    expect(context.ui.confirm).toHaveBeenCalledWith(
      "DAMAGE-CONTROL RECOVERY",
      expect.stringContaining("relaunch pp normally"),
      { signal: undefined },
    );
  });

  it.each([
    { mode: "rpc" as const, hasUI: true, interactiveProcess: true },
    { mode: "print" as const, hasUI: false, interactiveProcess: true },
    { mode: "json" as const, hasUI: false, interactiveProcess: true },
    { mode: "tui" as const, hasUI: true, interactiveProcess: false },
    { mode: "tui" as const, hasUI: false, interactiveProcess: true },
  ])("does not auto-confirm outside an actual interactive TUI: $mode", async fixture => {
    const recovery = await loadRecoveryModule();
    const mocked = mockApi();
    const { context } = mockContext({ mode: fixture.mode, hasUI: fixture.hasUI });
    recovery.createRecoveryExtension(() => fixture.interactiveProcess)(mocked.api);

    await handlerFor(mocked.handlers, "session_start")({}, context);

    expect(context.ui.confirm).not.toHaveBeenCalled();
    expect(mocked.activeTools()).toEqual([]);
    expectBlocked(
      await handlerFor(mocked.handlers, "tool_call")({}, context),
      "requires TUI mode",
    );
  });

  it("keeps tools locked on denial, UI failure, and cancellation", async () => {
    const recovery = await loadRecoveryModule();

    for (const confirm of [
      async () => false,
      async () => {
        throw new Error("fixture UI failure");
      },
    ]) {
      const mocked = mockApi();
      const { context } = mockContext({}, confirm);
      recovery.createRecoveryExtension(() => true)(mocked.api);
      await handlerFor(mocked.handlers, "session_start")({}, context);
      expect(mocked.activeTools()).toEqual([]);
      expectBlocked(await handlerFor(mocked.handlers, "tool_call")({}, context), "disabled");
    }

    const abort = new AbortController();
    const cancelled = mockApi();
    const { context } = mockContext({ signal: abort.signal }, async () => {
      abort.abort();
      return true;
    });
    recovery.createRecoveryExtension(() => true)(cancelled.api);
    await handlerFor(cancelled.handlers, "session_start")({}, context);
    expect(cancelled.activeTools()).toEqual([]);
    expectBlocked(await handlerFor(cancelled.handlers, "tool_call")({}, context), "cancelled");
  });

  it("retains the guard when later helper initialization throws", async () => {
    const recovery = await loadRecoveryModule();
    const mocked = mockApi({ failAfterGuard: true });

    expect(() => recovery.createRecoveryExtension(() => true)(mocked.api)).not.toThrow();
    expect(mocked.registrations).toEqual(["tool_call", "session_start"]);
    expectBlocked(
      await handlerFor(mocked.handlers, "tool_call")({}, mockContext().context),
      "failed after installing its guard",
    );
  });

  it("does not persist a confirmed bypass across session starts or shutdown", async () => {
    const recovery = await loadRecoveryModule();
    const mocked = mockApi();
    const confirm = vi
      .fn<RecoveryContext["ui"]["confirm"]>()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const { context } = mockContext({}, confirm);
    recovery.createRecoveryExtension(() => true)(mocked.api);
    const guard = handlerFor(mocked.handlers, "tool_call");
    const start = handlerFor(mocked.handlers, "session_start");

    await start({}, context);
    expect(await guard({}, context)).toBeUndefined();
    await start({}, context);
    expectBlocked(await guard({}, context), "denied or cancelled");

    await handlerFor(mocked.handlers, "session_shutdown")({}, context);
    expectBlocked(await guard({}, context), "until the operator confirms");
  });
});

import { EventEmitter } from "node:events";
import { resolve } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const requests: any[] = [];
vi.mock("node:net", () => ({ default: { createConnection: vi.fn(() => {
  const socket = Object.assign(new EventEmitter(), { write: vi.fn((line: string) => {
    requests.push(JSON.parse(line));
    queueMicrotask(() => socket.emit("data", Buffer.from("{}\n")));
  }), destroy: vi.fn() });
  queueMicrotask(() => socket.emit("connect"));
  return socket;
}) } }));
beforeEach(() => {
  requests.length = 0;
  vi.stubEnv("HERDR_ENV", "1");
  vi.stubEnv("HERDR_SOCKET_PATH", "fixture");
  vi.stubEnv("HERDR_PANE_ID", "w1:p1");
});
afterEach(() => vi.unstubAllEnvs());

it("reconciles Pi reloads as a recognized Herdr lifecycle generation", async () => {
  vi.resetModules();
  const { default: register } = await import("../extensions/herdr-agent-state.ts");
  const handlers: Record<string, (...args: any[]) => any> = {};
  register({ on(name: string, handler: any) { handlers[name] = handler; }, events: { on: vi.fn() } } as any);
  const sessionFile = resolve("sessions/current.jsonl");
  await handlers.session_start({ reason: "reload" }, {
    mode: "tui", isIdle: () => true,
    sessionManager: { getSessionFile: () => sessionFile, getSessionId: () => "session-id" },
  });
  await vi.waitFor(() => expect(requests.length).toBeGreaterThanOrEqual(2));
  expect(requests[0]).toMatchObject({ method: "pane.report_agent_session", params: {
    pane_id: "w1:p1", agent_session_path: sessionFile, session_start_source: "startup",
  } });
  expect(requests[1]).toMatchObject({ method: "pane.report_agent", params: {
    pane_id: "w1:p1", agent_session_path: sessionFile, state: "idle",
  } });
});

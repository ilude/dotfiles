import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import { refreshCodexCliAuth } from "../lib/codex-auth.ts";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("node:fs", async importOriginal => ({
  ...await importOriginal<typeof import("node:fs")>(),
  existsSync: (file: string) => file.endsWith("codex.exe"),
}));

function cli(accountType?: string) {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
    kill: vi.fn(() => { queueMicrotask(() => child.emit("close", 1)); return true; }),
  });
  const requests: Record<string, unknown>[] = [];
  child.stdin.on("data", chunk => {
    const request = JSON.parse(String(chunk)); requests.push(request);
    if (accountType && request.id === 1) child.stdout.write(JSON.stringify({ id: 1, result: { userAgent: "test" } }) + "\n");
    if (accountType && request.id === 2) child.stdout.write(JSON.stringify({ id: 2, result: { account: { type: accountType } } }) + "\n");
  });
  child.stdin.on("finish", () => queueMicrotask(() => child.emit("close", 0)));
  vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);
  return { child, requests };
}

beforeEach(() => { vi.useFakeTimers(); vi.stubEnv("PATH", process.env.PATH || "fixture-cli"); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

it("asks the credential owner to renew ChatGPT auth without starting a login or model turn", async () => {
  const { child, requests } = cli("chatgpt");
  await refreshCodexCliAuth(new AbortController().signal);
  expect(requests.map(request => request.method)).toEqual(["initialize", "initialized", "account/read"]);
  expect(requests[2].params).toEqual({ refreshToken: true });
  expect(vi.mocked(spawn).mock.calls[0][1]).toEqual([
    "app-server", "--stdio", "-c", 'model_provider="openai"', "-c", 'cli_auth_credentials_store="file"',
  ]);
  expect(child.kill).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("cancels its owned CLI and releases the deadline when the session stops", async () => {
  const { child } = cli(); const abort = new AbortController();
  const renewal = refreshCodexCliAuth(abort.signal);
  const failed = expect(renewal).rejects.toThrow("renewal cancelled");
  abort.abort(); await failed;
  expect(child.kill).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it("bounds a stalled CLI request and rejects non-ChatGPT accounts", async () => {
  const { child } = cli();
  const failed = expect(refreshCodexCliAuth(new AbortController().signal)).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(10_000); await failed;
  expect(child.kill).toHaveBeenCalledOnce();
  cli("amazonBedrock");
  await expect(refreshCodexCliAuth(new AbortController().signal)).rejects.toThrow("ChatGPT sign-in unavailable");
  expect(vi.getTimerCount()).toBe(0);
});

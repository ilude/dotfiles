import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionToolContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Check } from "typebox/value";
import register from "../extensions/claude-usage-tool.ts";

let directory: string;
const request = vi.fn<typeof fetch>();
function setup() {
  let tool: ToolDefinition | undefined;
  register({ registerTool: (value: ToolDefinition) => { tool = value; } } as unknown as ExtensionAPI);
  if (!tool) throw new Error("tool not registered");
  return tool;
}
function execute(params: { config_dir?: string } = {}, signal?: AbortSignal) {
  return setup().execute("quota", params, signal, undefined, {} as ExtensionToolContext);
}
function respond(body: unknown, status = 200) {
  request.mockResolvedValue(new Response(JSON.stringify(body), { status }));
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "claude-quota-"));
  vi.stubEnv("CLAUDE_CONFIG_DIR", directory);
  vi.stubGlobal("fetch", request);
  await writeFile(join(directory, ".credentials.json"), JSON.stringify({ claudeAiOauth: { accessToken: "fixture-token" } }));
});
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  request.mockReset();
  await rm(directory, { recursive: true, force: true });
});

describe("claude_usage", () => {
  it("reports real windows, reset times, provenance and structured output without credentials", async () => {
    respond({
      five_hour: { utilization: 16, resets_at: "2026-11-14T22:29:59.655984+00:00" },
      seven_day: { utilization: 3, resets_at: "2026-11-20T18:59:59Z" },
      seven_day_opus: { utilization: 2, resets_at: "2026-11-20T18:59:59Z" },
      unrelated: "not returned",
    });
    const result = await execute();
    expect(result.structuredContent).toMatchObject({
      five_hour_used_percent: 16,
      five_hour_reset_at: Date.parse("2026-11-14T22:29:59.655Z") / 1000,
      weekly_used_percent: 3,
      weekly_reset_at: Date.parse("2026-11-20T18:59:59Z") / 1000,
      opus_weekly_used_percent: 2,
      config_dir: resolve(directory),
    });
    expect(Check(setup().outputSchema!, result.structuredContent)).toBe(true);
    expect(request).toHaveBeenCalledWith("https://api.anthropic.com/api/oauth/usage", expect.objectContaining({
      headers: expect.objectContaining({ authorization: "Bearer fixture-token" }),
      signal: expect.any(AbortSignal),
    }));
    expect(JSON.stringify(result)).not.toMatch(/fixture-token|not returned/);
    expect(result.content).toEqual([expect.objectContaining({ text: expect.stringContaining("Shared subscription") })]);
  });

  it("uses an explicit client directory instead of a different inherited account", async () => {
    const other = join(directory, "client");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(other);
    await writeFile(join(other, ".credentials.json"), JSON.stringify({ claudeAiOauth: { accessToken: "client-token" } }));
    respond({});
    const result = await execute({ config_dir: other });
    expect(result.structuredContent).toMatchObject({ config_dir: resolve(other) });
    expect(request).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      headers: expect.objectContaining({ authorization: "Bearer client-token" }),
    }));
  });

  it("reports missing or invalid quota as unavailable rather than free capacity", async () => {
    respond({ five_hour: { utilization: 101, resets_at: "invalid" }, seven_day: null });
    const result = await execute();
    expect(result.structuredContent).toMatchObject({
      five_hour_used_percent: null, five_hour_reset_at: null,
      weekly_used_percent: null, weekly_reset_at: null,
      opus_weekly_used_percent: null, opus_weekly_reset_at: null,
    });
    expect(Check(setup().outputSchema!, result.structuredContent)).toBe(true);
  });

  it.each([401, 429, 503])("surfaces HTTP %s without echoing the body or claiming headroom", async status => {
    respond({ secret: "not safe to echo" }, status);
    await expect(execute()).rejects.toThrow(`HTTP ${status}`);
  });

  it("fails clearly without starting login or replacing malformed credentials", async () => {
    const file = join(directory, ".credentials.json");
    await writeFile(file, "malformed-sensitive-content");
    await expect(execute()).rejects.toThrow("Claude quota credentials could not be read");
    const { readFile } = await import("node:fs/promises");
    expect(await readFile(file, "utf8")).toBe("malformed-sensitive-content");
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects missing subscription credentials and invalid response shapes", async () => {
    await writeFile(join(directory, ".credentials.json"), "{}");
    await expect(execute()).rejects.toThrow("subscription credentials are unavailable");
    expect(request).not.toHaveBeenCalled();
    await writeFile(join(directory, ".credentials.json"), JSON.stringify({ claudeAiOauth: { accessToken: "fixture-token" } }));
    respond([]);
    await expect(execute()).rejects.toThrow("response was not an object");
  });

  it("passes cancellation to the quota request", async () => {
    const abort = new AbortController();
    abort.abort();
    request.mockImplementation(async (_url, options) => {
      options?.signal?.throwIfAborted();
      return new Response("{}");
    });
    await expect(execute({}, abort.signal)).rejects.toThrow();
  });
});

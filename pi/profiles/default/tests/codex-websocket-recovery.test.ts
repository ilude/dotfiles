import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
// Bypass the profile's unit-test API alias to run the installed CLI over RPC.
import { RpcClient } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/rpc/rpc-client.js";
import manifest from "../node_modules/@earendil-works/pi-coding-agent/package.json";

const RPC_TIMEOUT_MS = 20_000;
const testOptions = { timeout: 30_000 };
const profilePath = (relative: string) => fileURLToPath(new URL(`../${relative}`, import.meta.url));
const cliPath = profilePath(`node_modules/@earendil-works/pi-coding-agent/${manifest.bin.pi}`);
const fixtureKey = `fixture.${Buffer.from(JSON.stringify({
  "https://api.openai.com/auth": { chatgpt_account_id: "fixture" },
})).toString("base64url")}.fixture`;

async function runFixture(scenario: "recover" | "repeated" | "unrelated" | "disabled") {
  const cwd = await mkdtemp(join(tmpdir(), "pi-codex-recovery-"));
  const client = new RpcClient({
    cliPath, cwd, provider: "openai-codex", model: "gpt-6.1-sol",
    env: { PI_CODING_AGENT_DIR: cwd, CODEX_RECOVERY_FIXTURE: scenario },
    args: ["--no-session", "--no-extensions", "--no-mcp", "--tools", "read",
      "-e", profilePath("tests/fixtures/codex-websocket-recovery.mjs"),
      "-e", profilePath("extensions/codex-websocket-recovery.ts")],
  });
  try {
    await writeFile(join(cwd, "fixture.txt"), "completed tool result");
    await writeFile(join(cwd, "auth.json"), JSON.stringify({
      "openai-codex": { type: "oauth", access: fixtureKey, refresh: "fixture", expires: Date.now() + 3_600_000, accountId: "fixture" },
    }));
    await writeFile(join(cwd, "settings.json"), JSON.stringify({ cacheWarming: "off", retry: { baseDelayMs: 1, enabled: scenario !== "disabled" } }));
    await client.start();
    const events = await client.promptAndWait("Read the fixture, then reply.", undefined, RPC_TIMEOUT_MS);
    expect(events.filter(event => event.type === "tool_execution_start")).toHaveLength(1);
    expect(events.filter(event => event.type === "agent_settled")).toHaveLength(1);
    const assistants = events.flatMap(event => event.type === "message_end" && event.message.role === "assistant" ? [event.message] : []);
    return { events, assistants, final: assistants.at(-1) };
  } finally {
    await client.stop();
    await rm(cwd, { recursive: true, force: true });
  }
}

it("reconnects once in the same RPC run without replaying tools or sending partial output back to Codex", testOptions, async () => {
  const { events, assistants, final } = await runFixture("recover");
  expect(assistants.map(message => message.stopReason)).toEqual(["toolUse", "error", "stop"]);
  expect(final?.content).toMatchObject([{ type: "text", text: "recovered with tool result" }]);
  expect(events.filter(event => event.type === "auto_retry_start")).toMatchObject([{ attempt: 1 }]);
  expect(events.filter(event => event.type === "auto_retry_end")).toMatchObject([{ success: true }]);
  expect(events.filter(event => event.type === "agent_end")).toMatchObject([{ willRetry: true }, { willRetry: false }]);
});

it("leaves the second expiry as the final error instead of retrying again", testOptions, async () => {
  const { events, assistants, final } = await runFixture("repeated");
  expect(assistants.map(message => message.stopReason)).toEqual(["toolUse", "error", "error"]);
  expect(final?.errorMessage).toMatch(/^Codex error: Responses websocket connection limit reached/);
  expect(events.filter(event => event.type === "auto_retry_start")).toMatchObject([{ attempt: 1 }]);
  expect(events.filter(event => event.type === "auto_retry_end")).toMatchObject([{ success: false, attempt: 1 }]);
});

it.each(["unrelated", "disabled"] as const)("does not retry when recovery is %s", testOptions, async scenario => {
  const { events, final } = await runFixture(scenario);
  expect(final?.stopReason).toBe("error");
  expect(events.filter(event => event.type === "auto_retry_start")).toHaveLength(0);
});

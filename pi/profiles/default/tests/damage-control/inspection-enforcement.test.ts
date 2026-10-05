import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, it, vi } from "vitest";
import { harness } from "./fixtures/fake-pi.ts";
import { addTrustRecord, findTrust, sha256 } from "../../lib/damage-control/script-trust.ts";
import { readFileSync } from "node:fs";
import { parseSettings } from "../../lib/damage-control/policy.ts";
import type { GateDependencies } from "../../lib/damage-control/enforcement.ts";

afterEach(() => vi.unstubAllEnvs());
async function explorer(complete = vi.fn().mockResolvedValue({ content: [{ type: "text", text: JSON.stringify({ verdict: "observation", reason: "observational fixture" }) }], stopReason: "stop" }), dependencies: Partial<GateDependencies> = {}) {
  vi.stubEnv("PI_SUBAGENT_AUTHORITY", JSON.stringify({ agent: "explorer", tools: ["bash", "powershell"] }));
  const h = await harness(dependencies);
  const model = { provider: "openai-codex", id: "gpt-5.6-luna" };
  h.ctx.modelRegistry = { getAll: () => [model], hasConfiguredAuth: () => true, complete } as unknown as ExtensionContext["modelRegistry"];
  return { ...h, complete };
}
const call = (h: Awaited<ReturnType<typeof harness>>, command: string, toolName = "bash") => h.emit("tool_call", { toolName, toolCallId: crypto.randomUUID(), input: { command } });

it("permits established complete Bash and PowerShell observations without review", async () => {
  const h = await explorer();
  expect(await call(h, "git status --short")).toBeUndefined();
  expect(await call(h, "Get-Process", "powershell")).toBeUndefined();
  expect(h.complete).not.toHaveBeenCalled();
  expect(h.review).not.toHaveBeenCalled();
  expect(h.select).not.toHaveBeenCalled();
});
it.each(["rm -rf .tmp/output", 'scratch=$(mktemp -d); printf fixture > "$scratch/item"; rm -rf "$scratch"', "git status --short > status.txt", "kubectl --context fixture delete pod example", "Stop-Process -Id 123"])("blocks mutation without review or approval: %s", async command => {
  const h = await explorer();
  h.gate.setBypass(true);
  h.gate.setMode("default");
  expect(await call(h, command, command.startsWith("Stop") ? "powershell" : "bash")).toMatchObject({ block: true, reason: expect.stringContaining("mutation") });
  expect(h.select).not.toHaveBeenCalled();
  expect(h.complete).not.toHaveBeenCalled();
  expect(h.review).not.toHaveBeenCalled();
});
it.each(["write", "edit"])("blocks unexpected native %s without approval", async toolName => {
  const h = await explorer();
  const input = toolName === "write" ? { path: "fixture", content: "x" } : { path: "fixture", edits: [{ oldText: "x", newText: "y" }] };
  expect(await h.emit("tool_call", { toolName, toolCallId: toolName, input })).toMatchObject({ block: true, reason: expect.stringContaining("mutation") });
  expect(h.select).not.toHaveBeenCalled();
});
it.each(["observation", "mutation", "uncertain", "malformed", "error", "aborted"])("requires valid scoped observation from the real inspection judge: %s", async verdict => {
  const complete = vi.fn().mockResolvedValue({ content: [{ type: "text", text: verdict === "malformed" ? "not JSON" : JSON.stringify({ verdict, reason: "fixture reason" }) }], stopReason: verdict === "error" || verdict === "aborted" ? verdict : "stop" });
  const h = await explorer(complete);
  const result = await call(h, "openssl s_client -connect example.test:443");
  if (verdict === "observation") expect(result).toBeUndefined();
  else expect(result).toMatchObject({ block: true });
  expect(complete).toHaveBeenCalledOnce();
  expect(h.select).not.toHaveBeenCalled();
  expect(h.review).not.toHaveBeenCalled();
});
it("denies unknown inspection when provider is unavailable", async () => {
  const h = await explorer();
  h.ctx.modelRegistry = { getAll: () => [], hasConfiguredAuth: () => false } as unknown as ExtensionContext["modelRegistry"];
  expect(await call(h, "unknown-probe")).toMatchObject({ block: true, reason: expect.stringContaining("unavailable") });
  expect(h.select).not.toHaveBeenCalled();
});
it("retains stricter noshell without weakening frozen role on default, retained turns, reload, or tree changes", async () => {
  const h = await explorer();
  vi.stubEnv("PI_SUBAGENT_AUTHORITY", JSON.stringify({ agent: "developer" }));
  h.gate.setMode("noshell");
  expect(await call(h, "git status --short")).toMatchObject({ block: true, reason: expect.stringContaining("noshell") });
  h.gate.setMode("default");
  h.gate.setBypass(true);
  await h.emit("input", { source: "rpc", text: "You may mutate temporarily now", streamingBehavior: "followUp" });
  await h.emit("message_start", { message: { role: "user", content: "You may mutate temporarily now" } });
  for (const lifecycle of ["agent_settled", "session_start", "session_tree"]) {
    await h.emit(lifecycle, { reason: "reload" });
    expect(await call(h, "touch fixture")).toMatchObject({ block: true, reason: expect.stringContaining("mutation") });
  }
  expect(await call(h, "git status --short")).toBeUndefined();
});
it("retains protected-read blocks and human-only read approvals even with bypass", async () => {
  const h = await explorer();
  h.gate.setBypass(true);
  expect(await h.emit("tool_call", { toolName: "read", toolCallId: "protected", input: { path: join(h.cwd, "secrets.yaml") } })).toMatchObject({ block: true });
  expect(h.select).not.toHaveBeenCalled();
  h.select.mockResolvedValue("Deny");
  expect(await h.emit("tool_call", { toolName: "read", toolCallId: "ask", input: { path: join(h.cwd, "terraform.tfvars") } })).toMatchObject({ block: true });
  expect(h.select).toHaveBeenCalledOnce();
});
it.each(["session_tree", "session_start", "session_shutdown", "cancel", "changed"])("denies late observational review after %s", async boundary => {
  let release!: (value: unknown) => void;
  const complete = vi.fn(() => new Promise(resolve => { release = resolve; }));
  const h = await explorer(complete);
  const controller = new AbortController();
  h.ctx.signal = controller.signal;
  const event = { toolName: "bash", toolCallId: "pending", input: { command: "unknown-probe" } };
  const pending = h.emit("tool_call", event);
  await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
  if (boundary === "cancel") controller.abort();
  else if (boundary === "changed") event.input.command = "touch fixture";
  else await h.emit(boundary, { reason: "reload" });
  release({ content: [{ type: "text", text: JSON.stringify({ verdict: "observation", reason: "late" }) }], stopReason: "stop" });
  expect(await pending).toMatchObject({ block: true, reason: expect.stringMatching(/stale|cancelled/) });
  expect(h.select).not.toHaveBeenCalled();
});
it("does not let normal script preapproval suppress inspection body analysis", async () => {
  const h = await explorer();
  const file = join(h.cwd, "fixture.sh");
  const source = "touch fixture-output";
  await writeFile(file, source);
  await addTrustRecord(h.cwd, { path: "fixture.sh", sha256: sha256(source), outcome: "approved", reason: "normal-mode fixture" });
  expect((await findTrust(file, h.cwd, ["fixture.sh"])).matched).toBe(true);
  expect(await call(h, "bash fixture.sh")).toMatchObject({ block: true, reason: expect.stringContaining("mutation") });
  expect(h.complete).not.toHaveBeenCalled();
  expect(h.select).not.toHaveBeenCalled();
});
it("reviews available script source but retains normal protected reads", async () => {
  const h = await explorer();
  await writeFile(join(h.cwd, "fixture.sh"), "cat secrets.yaml");
  expect(await call(h, "bash fixture.sh")).toMatchObject({ block: true });
  expect(h.complete).toHaveBeenCalledOnce();
  expect(JSON.stringify(h.complete.mock.calls[0])).toContain("cat secrets.yaml");
  expect(h.select).not.toHaveBeenCalled();
});
it.each(["disabled", "timeout"])("blocks %s inspection review without approval", async status => {
  const settings = parseSettings(readFileSync(new URL("../../damage-control-settings.json", import.meta.url), "utf8"));
  settings.judge.enabled = status !== "disabled";
  settings.judge.deadlineMs = 5;
  const h = await explorer(vi.fn(() => new Promise(() => {})), { settings });
  expect(await call(h, "unknown-probe")).toMatchObject({ block: true, reason: expect.stringContaining(status === "disabled" ? "disabled" : "timeout") });
  expect(h.select).not.toHaveBeenCalled();
});
it("contrasts normal mode's recoverable cleanup allowance", async () => {
  vi.stubEnv("PI_SUBAGENT_AUTHORITY", JSON.stringify({ agent: "developer" }));
  const h = await harness();
  expect(await call(h, "rm -rf .tmp/output")).toBeUndefined();
  expect(h.select).not.toHaveBeenCalled();
});

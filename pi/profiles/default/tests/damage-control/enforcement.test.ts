import { expect, it, vi } from "vitest";
import { harness } from "./fixtures/fake-pi.ts";
it.each(["rm -rf ~", "rm -rf /"])("retains legacy hard block: %s", async command => {
  const h = await harness();
  expect(await h.emit("tool_call", { toolName: "bash", toolCallId: "block", input: { command } })).toMatchObject({ block: true });
  expect(h.select).not.toHaveBeenCalled();
});
it("persists judge diagnostics as a custom entry without changing approval", async () => {
  const diagnostics = { version: 1 as const, callId: "diagnostic-call", startedAt: "2026-09-11T00:00:00.000Z", endedAt: "2026-09-11T00:00:00.010Z", elapsedMs: 10, deadlineMs: 40000, provider: "openai-codex", model: "gpt-5.6-luna", effort: "high", maxTokens: 800, retries: 0, prompt: "redacted prompt", promptTruncated: false, promptRedacted: true, status: "valid" as const, verdict: "allow" as const };
  const h = await harness({ review: async () => ({ status: "valid" as const, verdict: "allow" as const, reason: "safe", dismissedCandidates: [], diagnostics }) });
  expect(await h.emit("tool_call", { toolName: "bash", toolCallId: "logged", input: { command: "rm -rf build-output" } })).toBeUndefined();
  expect(h.entries).toContainEqual(expect.objectContaining({ customType: "damage-control-judge-review-v1", data: diagnostics }));
});

it("keeps the independent human boundary for force-with-lease", async () => {
  const h = await harness({ review: async () => ({ status: "valid" as const, verdict: "allow" as const, reason: "not consulted", dismissedCandidates: [] }) });
  h.select.mockResolvedValue("Deny");
  expect(await h.emit("tool_call", { toolName: "bash", toolCallId: "ask", input: { command: "git push --force-with-lease origin fixture" } })).toMatchObject({ block: true });
  expect(h.select).toHaveBeenCalledOnce();
  expect(h.review).not.toHaveBeenCalled();
});

it("bypasses only a parsed, contained local ask when /dc off is active", async () => {
  const h = await harness({ review: async () => ({ status: "valid" as const, verdict: "ask" as const, reason: "confirm local cleanup", dismissedCandidates: [] }) });
  h.gate.setBypass(true);
  expect(await h.emit("tool_call", { toolName: "bash", toolCallId: "local-bypass", input: { command: "rm -rf build-output" } })).toBeUndefined();
  expect(h.review).toHaveBeenCalledOnce();
  expect(h.select).not.toHaveBeenCalled();
});

it("does not bypass unresolved deletion after failed review", async () => {
  const h = await harness({ review: async () => ({ status: "unavailable" as const, reason: "injected failure" }) });
  h.gate.setBypass(true);
  h.select.mockResolvedValue("Deny");
  expect(await h.emit("tool_call", { toolName: "bash", toolCallId: "unresolved", input: { command: 'rm -rf "$UNRESOLVED_REVIEW_TARGET"' } })).toMatchObject({ block: true });
  expect(h.select).toHaveBeenCalledOnce();
});

it("keeps mixed local and remote operations on the approval path with bypass active", async () => {
  const h = await harness({ review: async () => ({ status: "valid" as const, verdict: "ask" as const, reason: "mixed consequences", dismissedCandidates: [] }) });
  h.gate.setBypass(true);
  h.select.mockResolvedValue("Deny");
  expect(await h.emit("tool_call", { toolName: "bash", toolCallId: "mixed-remote", input: { command: "rm -rf build-output; curl https://example.test" } })).toMatchObject({ block: true });
  expect(h.select).toHaveBeenCalledOnce();
});

it.each([
  "git -c remote.origin.url=https://example.test/repo reset --hard",
  "docker volume rm fixture",
])("does not bypass excluded parsed operation: %s", async command => {
  const h = await harness({ review: async () => ({ status: "valid" as const, verdict: "ask" as const, reason: "excluded operation", dismissedCandidates: [] }) });
  h.gate.setBypass(true);
  h.select.mockResolvedValue("Deny");
  expect(await h.emit("tool_call", { toolName: "bash", toolCallId: "excluded", input: { command } })).toMatchObject({ block: true });
  expect(h.select).toHaveBeenCalledOnce();
});

it("keeps bypass-off local asks on the approval path", async () => {
  const h = await harness({ review: async () => ({ status: "valid" as const, verdict: "ask" as const, reason: "confirm local cleanup", dismissedCandidates: [] }) });
  h.select.mockResolvedValue("Deny");
  expect(await h.emit("tool_call", { toolName: "bash", toolCallId: "bypass-off", input: { command: "rm -rf build-output" } })).toMatchObject({ block: true });
  expect(h.select).toHaveBeenCalledOnce();
});

it("runs the reported Herdr reproduction only as inert gate input", async () => {
  const { readFile } = await import("node:fs/promises");
  const command = await readFile(new URL("./fixtures/reported-herdr-command.txt", import.meta.url), "utf8");
  const h = await harness({ review: async () => ({ status: "valid" as const, verdict: "allow" as const, reason: "inert local fixture lifecycle", dismissedCandidates: [] }) });
  expect(await h.emit("tool_call", { toolName: "bash", toolCallId: "herdr", input: { command } })).toBeUndefined();
  expect(h.review).toHaveBeenCalledOnce();
  expect(h.select).not.toHaveBeenCalled();
});

it("allows a complete mktemp lifecycle without a parser special case", async () => {
  const h = await harness({ review: async () => ({ status: "valid" as const, verdict: "allow" as const, reason: "temporary lifecycle", dismissedCandidates: [] }) });
  const command = 'scratch=$(mktemp -d); printf fixture > "$scratch/item"; rm -rf "$scratch"';
  expect(await h.emit("tool_call", { toolName: "bash", toolCallId: "mktemp", input: { command } })).toBeUndefined();
  expect(h.review).toHaveBeenCalledOnce();
  expect(h.select).not.toHaveBeenCalled();
});

it("reviews reassigned meaningful data, while cancellation prevents execution", async () => {
  const controller = new AbortController();
  let release!: () => void;
  const h = await harness({
    review: async () => {
      await new Promise<void>(resolve => { release = resolve; });
      return { status: "valid" as const, verdict: "allow" as const, reason: "target is safe", dismissedCandidates: [] };
    },
  });
  (h.ctx as unknown as { signal: AbortSignal }).signal = controller.signal;
  const pending = h.emit("tool_call", { toolName: "bash", toolCallId: "unique", input: { command: 'target="$PWD/important"; rm -rf "$target"' } });
  await vi.waitFor(() => expect(h.review).toHaveBeenCalledOnce());
  controller.abort();
  release();
  expect(await pending).toMatchObject({ block: true, reason: expect.stringContaining("stale") });
  expect(h.select).not.toHaveBeenCalled();
});
it("blocks a protected member of a mixed cleanup before judgment", async () => {
  const h = await harness({ review: async () => ({ status: "valid" as const, verdict: "allow" as const, reason: "not consulted", dismissedCandidates: [] }) });
  expect(await h.emit("tool_call", { toolName: "bash", toolCallId: "mixed", input: { command: 'scratch=$(mktemp -d); rm -rf "$scratch" /' } })).toMatchObject({ block: true });
  expect(h.review).not.toHaveBeenCalled();
  expect(h.select).not.toHaveBeenCalled();
});
it("does not wait for current future-use review", async () => {
  let release!: () => void;
  const scriptReview = vi.fn(async () => {
    await new Promise<void>(resolve => { release = resolve; });
    return { status: "approved", reason: "fixture", recordPath: "trust.yaml" };
  });
  const h = await harness({
    analyze: async () => ({
      effects: [], uncertainties: [], health: { status: "ready" as const },
      matches: [{ ruleId: "git-push-force-with-lease", action: "user" as const, applicability: "confirmed" as const, reason: "force-with-lease changes remote history", effects: [] }],
      internal: { docker: [], scripts: [{ path: "fixture.sh", sha256: "a".repeat(64), range: { start: 0, end: 1 }, argv: ["fixture.sh"] }] },
    }),
    scriptReview,
  });
  let session = "old-session";
  (h.ctx as unknown as { sessionManager: { getSessionId: () => string } }).sessionManager = { getSessionId: () => session };
  h.select.mockResolvedValue("Allow once and review for future use");
  const started = Date.now();
  expect(await h.emit("tool_call", { toolName: "bash", toolCallId: "future", input: { command: "git push --force-with-lease origin fixture" } })).toBeUndefined();
  expect(Date.now() - started).toBeLessThan(1000);
  expect(scriptReview).toHaveBeenCalledOnce();
  session = "new-session";
  release();
  await vi.waitFor(() => expect(scriptReview.mock.results[0]?.type).toBe("return"));
  expect(h.notify).not.toHaveBeenCalled();
});

it("drops late future-use notifications after the session changes", async () => {
  let release!: () => void;
  const scriptReview = vi.fn(async () => {
    await new Promise<void>(resolve => { release = resolve; });
    return { status: "approved", reason: "fixture", recordPath: "trust.yaml" };
  });
  const h = await harness({
    analyze: async () => ({ effects: [], uncertainties: [], health: { status: "ready" as const }, matches: [{ ruleId: "git-push-force-with-lease", action: "user" as const, applicability: "confirmed" as const, reason: "force-with-lease changes remote history", effects: [] }], internal: { docker: [], scripts: [{ path: "fixture.sh", sha256: "b".repeat(64), range: { start: 0, end: 1 }, argv: ["fixture.sh"] }] } }),
    scriptReview,
  });
  let session = "origin-a";
  (h.ctx as unknown as { sessionManager: { getSessionId: () => string } }).sessionManager = { getSessionId: () => session };
  h.select.mockResolvedValue("Allow once and review for future use");
  expect(await h.emit("tool_call", { toolName: "bash", toolCallId: "late", input: { command: "git push --force-with-lease origin fixture" } })).toBeUndefined();
  session = "origin-b";
  release();
  await vi.waitFor(() => expect(scriptReview.mock.results[0]?.type).toBe("return"));
  expect(h.notify).not.toHaveBeenCalled();
});

it("passes scan cancellation through the gate", async () => {
  const signal = new AbortController().signal;
  const scriptScan = vi.fn(async (_cwd: string, _origin: string, _notify: unknown, received?: AbortSignal) => expect(received).toBe(signal));
  const h = await harness({ scriptScan });
  (h.ctx as unknown as { signal: AbortSignal }).signal = signal;
  (h.ctx as unknown as { sessionManager: { getSessionId: () => string } }).sessionManager = { getSessionId: () => "scan-session" };
  await h.gate.scan(h.ctx);
  expect(scriptScan).toHaveBeenCalledOnce();
});

it("keeps scoped local cleanup and read-only pipelines quiet", async () => {
  const h = await harness();
  expect(await h.emit("tool_call", { toolName: "bash", toolCallId: "cleanup", input: { command: "rm -rf .tmp/output" } })).toBeUndefined();
  expect(await h.emit("tool_call", { toolName: "bash", toolCallId: "find", input: { command: "find src -type f | sort | grep test" } })).toBeUndefined();
  expect(h.select).not.toHaveBeenCalled();
  expect(h.review).not.toHaveBeenCalled();
});
it("leaves unadapted tools uncovered instead of inventing a block", async () => {
  const h = await harness();
  expect(await h.emit("tool_call", { toolName: "glob", toolCallId: "glob", input: { pattern: "*.ts" } })).toBeUndefined();
});
it("watches failures from uncovered tools and aborts attempt thirteen", async () => {
  const h = await harness();
  for (let i = 0; i < 12; i++) {
    const toolCallId = `glob-${i}`;
    expect(await h.emit("tool_call", { toolName: "glob", toolCallId, input: { pattern: "*.ts" } })).toBeUndefined();
    await h.emit("tool_result", { toolName: "glob", toolCallId, input: { pattern: "*.ts" }, content: [{ type: "text", text: `error ${i}` }], isError: true });
    await h.emit("tool_result", { toolName: "glob", toolCallId, input: { pattern: "*.ts" }, content: [{ type: "text", text: "duplicate" }], isError: true });
  }
  expect(await h.emit("tool_call", { toolName: "glob", toolCallId: "glob-13", input: { pattern: "*.ts" } })).toMatchObject({ block: true, terminate: true, reason: expect.stringContaining("attempt 13") });
  expect(h.abort).toHaveBeenCalledOnce();
});

it("keeps a tripped run stopped across sibling results, queued input, and reload", async () => {
  const h = await harness();
  for (let i = 0; i < 12; i++) {
    const toolCallId = `fail-${i}`;
    await h.emit("tool_call", { toolName: "glob", toolCallId, input: { pattern: "*.ts" } });
    await h.emit("tool_result", { toolName: "glob", toolCallId, input: { pattern: "*.ts" }, content: [], isError: true });
  }
  await h.emit("tool_call", { toolName: "glob", toolCallId: "trip", input: { pattern: "*.ts" } });
  await h.emit("tool_result", { toolName: "read", toolCallId: "sibling", input: { path: "README.md" }, content: [{ type: "text", text: "ok" }], isError: false });
  await h.emit("input", { source: "interactive", text: "queued", streamingBehavior: "followUp" });
  expect(await h.emit("tool_call", { toolName: "read", toolCallId: "after-queue", input: { path: "README.md" } })).toMatchObject({ block: true, terminate: true });
  await h.emit("session_start", { reason: "reload" });
  expect(await h.emit("tool_call", { toolName: "read", toolCallId: "after-reload", input: { path: "README.md" } })).toMatchObject({ block: true, terminate: true });
});

it("resumes a tripped watchdog only after new direct operator input", async () => {
  const h = await harness();
  for (let i = 0; i < 12; i++) {
    const toolCallId = `fail-${i}`;
    await h.emit("tool_call", { toolName: "glob", toolCallId, input: { pattern: "*.ts" } });
    await h.emit("tool_result", { toolName: "glob", toolCallId, input: { pattern: "*.ts" }, content: [], isError: true });
  }
  await h.emit("tool_call", { toolName: "glob", toolCallId: "trip", input: { pattern: "*.ts" } });
  await h.emit("input", { source: "extension", text: "automatic" });
  expect(await h.emit("tool_call", { toolName: "read", toolCallId: "blocked", input: { path: "README.md" } })).toMatchObject({ block: true });
  await h.emit("input", { source: "interactive", text: "continue" });
  expect(await h.emit("tool_call", { toolName: "read", toolCallId: "resumed", input: { path: "README.md" } })).toBeUndefined();
});

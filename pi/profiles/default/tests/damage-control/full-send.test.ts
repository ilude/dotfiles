import { expect, it } from "vitest";
import { FULL_SEND_QUERY, type FullSendAuthorization } from "../../lib/goal/full-send.ts";
import { harness } from "./fixtures/fake-pi.ts";

const authorization: FullSendAuthorization = {
  source: "/full-send", sessionId: "fixture-session", runId: "task-run",
  task: { goal: "Rebuild generated output", scope: [], exclusions: ["No deployment"], decisions: [] },
};
function provide(h: Awaited<ReturnType<typeof harness>>, get: () => FullSendAuthorization | undefined = () => authorization) {
  h.api.events.on(FULL_SEND_QUERY, value => {
    if (!value || typeof value !== "object") return;
    const request = value as Record<string, unknown>;
    const active = get();
    if (active && request.sessionId === active.sessionId && typeof request.respond === "function") request.respond(active);
  });
}

it.each([true, false, undefined])("waives an eligible local ask only with confirmed task membership: %s", async taskAuthorized => {
  const h = await harness({ review: async () => ({ status: "valid", verdict: "ask", reason: "local cleanup", dismissedCandidates: [], ...(taskAuthorized === undefined ? {} : { taskAuthorized }) }) });
  provide(h);
  h.select.mockResolvedValue("Deny");
  const result = await h.emit("tool_call", { toolName: "bash", toolCallId: "local", input: { command: "rm -rf build-output" } });
  if (taskAuthorized) { expect(result).toBeUndefined(); expect(h.select).not.toHaveBeenCalled(); }
  else { expect(result).toMatchObject({ block: true }); expect(h.select).toHaveBeenCalledOnce(); }
  expect(h.review.mock.calls[0][0].taskAuthorization).toEqual(authorization);
});

it("rechecks authorization after asynchronous review", async () => {
  let active = true;
  const h = await harness({ review: async () => { active = false; return { status: "valid", verdict: "ask", reason: "scoped cleanup", dismissedCandidates: [], taskAuthorized: true }; } });
  provide(h, () => active ? authorization : undefined);
  h.select.mockResolvedValue("Deny");
  expect(await h.emit("tool_call", { toolName: "bash", toolCallId: "disarmed", input: { command: "rm -rf build-output" } })).toMatchObject({ block: true });
  expect(h.select).toHaveBeenCalledOnce();
});

it.each(["git push --force-with-lease origin fixture", "rm -rf build-output; curl https://example.test", "docker volume rm fixture"])('retains non-bypassable approvals: %s', async command => {
  const h = await harness({ review: async () => ({ status: "valid", verdict: "ask", reason: "consequential", dismissedCandidates: [], taskAuthorized: true }) });
  provide(h);
  h.select.mockResolvedValue("Deny");
  expect(await h.emit("tool_call", { toolName: "bash", toolCallId: "excluded", input: { command } })).toMatchObject({ block: true });
  expect(h.select).toHaveBeenCalledOnce();
});

it("retains hard blocks, review-failure approval, and noshell", async () => {
  const h = await harness({ review: async () => ({ status: "unavailable", reason: "review unavailable" }) });
  provide(h);
  h.select.mockResolvedValue("Deny");
  expect(await h.emit("tool_call", { toolName: "bash", toolCallId: "hard", input: { command: "rm -rf ~" } })).toMatchObject({ block: true });
  expect(h.select).not.toHaveBeenCalled();
  expect(await h.emit("tool_call", { toolName: "bash", toolCallId: "failed", input: { command: "rm -rf build-output" } })).toMatchObject({ block: true });
  expect(h.select).toHaveBeenCalledOnce();
  h.gate.setMode("noshell");
  expect(await h.emit("tool_call", { toolName: "bash", toolCallId: "noshell", input: { command: "rm -rf build-output" } })).toMatchObject({ block: true, reason: expect.stringContaining("noshell") });
});

it("does not change the independent /dc off behavior", async () => {
  const h = await harness({ review: async () => ({ status: "valid", verdict: "ask", reason: "local cleanup", dismissedCandidates: [], taskAuthorized: false }) });
  provide(h);
  h.gate.setBypass(true);
  expect(await h.emit("tool_call", { toolName: "bash", toolCallId: "legacy", input: { command: "rm -rf build-output" } })).toBeUndefined();
  expect(h.select).not.toHaveBeenCalled();
});

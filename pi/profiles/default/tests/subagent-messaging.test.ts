import { afterEach, describe, expect, it, vi } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RpcChild } from "../lib/subagents/rpc.ts";
import { VisibleChild } from "../lib/subagents/visible.ts";
import type { AgentDefinition } from "../lib/subagents/definitions.ts";
import type { MessageOptions } from "../lib/subagents/transport.ts";

const here = dirname(fileURLToPath(import.meta.url));
const children: RpcChild[] = [];
const definition: AgentDefinition = { name: "test", description: "test", tools: ["subagent_parent"], delegates: [], skills: [], prompt: "test", source: "profile", filePath: "test.md", model: "openai-codex/test", effort: "low" };

function child(instructions = "[hold]") {
  process.env.PI_SUBAGENT_BIN = process.execPath;
  process.env.PI_SUBAGENT_BIN_ARGS = JSON.stringify([join(here, "fixtures", "fake-subagent-rpc.mjs")]);
  const instance = new RpcChild({ definition, instructions, cwd: here, model: "openai-codex/test", effort: "low", skills: [], origin: "messaging-origin", retained: false, surface: "headless" }, join(here, "../extensions/subagent-child.ts"), join(here, ".."));
  children.push(instance);
  return instance;
}

afterEach(async () => {
  await Promise.all(children.splice(0).map(child => child.cancel()));
  delete process.env.PI_SUBAGENT_BIN;
  delete process.env.PI_SUBAGENT_BIN_ARGS;
});

describe("native subagent message boundaries", () => {
  it("steers a busy child without waiting for settlement", async () => {
    const instance = child();
    const settled = instance.start();
    await vi.waitFor(() => expect(instance.record.processState).toBe("running"));
    await instance.message("check the Windows path", { delivery: "queued", interaction: "notify" });
    await expect(settled).resolves.toMatchObject({ outcome: "complete", result: "steered: check the Windows path" });
  });

  it("interrupts intentionally and resumes the same conversation", async () => {
    const instance = child();
    const settled = instance.start();
    await vi.waitFor(() => expect(instance.record.processState).toBe("running"));
    const options: MessageOptions = { delivery: "immediate", interaction: "notify" };
    await instance.message("stop reading and report the known result", options);
    await expect(settled).resolves.toMatchObject({ outcome: "complete", result: "first answer" });
    expect(instance.snapshot().error).toBeUndefined();
  });

  it("yields a parent question without a polling loop and resumes by request id", async () => {
    const instance = child();
    void instance.start();
    await vi.waitFor(() => expect(instance.record.processState).toBe("running"));
    const request = instance.parentMessage({ type: "question", payload: { message: "Include generated files?", protocol: "question-answer" } }) as { id: string };
    expect(instance.snapshot()).toMatchObject({ status: "waiting", phase: "waiting-parent", requestId: request.id, result: "Include generated files?" });
    expect(instance.parentMessage({ type: "poll-answer", payload: request.id })).toMatchObject({ pending: true, requestId: request.id });
    await expect(instance.answer("stale", "wrong-request")).rejects.toThrow(/does not match/);
    expect(instance.snapshot()).toMatchObject({ status: "waiting", requestId: request.id });
    await instance.answer("No, keep the generated files out", request.id);
    await vi.waitFor(() => expect(instance.record.status).toBe("settled"));
    expect(instance.snapshot()).toMatchObject({ outcome: "complete", result: "first answer" });
  });

  it("uses the same queued and immediate boundaries for visible children", async () => {
    const instance = new VisibleChild({ definition, instructions: "visible", cwd: here, model: "openai-codex/test", effort: "low", skills: [], origin: "messaging-origin", retained: false, surface: "visible" }, "fixture-extension", "fixture-profile", {} as any);
    (instance as any).appReady = true;
    instance.record.status = "running";
    await instance.message("visible queued message", { delivery: "queued" });
    const queued = instance.parentMessage({ type: "app-poll" }) as { commands: Array<{ type: string; message?: string; delivery?: string }> };
    expect(queued.commands).toContainEqual(expect.objectContaining({ type: "message", message: "visible queued message", delivery: "queued" }));
    await instance.message("visible redirect", { delivery: "immediate" });
    const redirected = instance.parentMessage({ type: "app-poll" }) as { commands: Array<{ type: string; message?: string; delivery?: string }> };
    expect(redirected.commands).toContainEqual(expect.objectContaining({ type: "redirect", message: "visible redirect", delivery: "immediate" }));
  });

  it("counts visible question yields so a second question and final reply remain valid", async () => {
    const instance = new VisibleChild({ definition, instructions: "visible", cwd: here, model: "openai-codex/test", effort: "low", skills: [], origin: "messaging-origin", retained: true, surface: "visible" }, "fixture-extension", "fixture-profile");
    const first = instance.parentMessage({ type: "question", payload: "First question" }) as { id: string };
    expect(instance.parentMessage({ type: "turn", payload: { turn: 1, text: "" } })).toEqual({ accepted: true });
    expect(instance.snapshot()).toMatchObject({ turns: 1, status: "waiting", requestId: first.id });
    await instance.answer("First answer", first.id);
    await instance.message("Redirect the follow-up", { delivery: "immediate" });
    // The surface handles the redirect without emitting a settled wire turn.
    const second = instance.parentMessage({ type: "question", payload: "Second question" }) as { id: string };
    expect(instance.parentMessage({ type: "turn", payload: { turn: 2, text: "" } })).toEqual({ accepted: true });
    expect(instance.snapshot()).toMatchObject({ turns: 2, status: "waiting", requestId: second.id });
    expect(() => instance.parentMessage({ type: "turn", payload: { turn: 2, text: "duplicate" } })).toThrow("Invalid, duplicate, or late turn");
    await instance.answer("Second answer", second.id);
    expect(instance.parentMessage({ type: "turn", payload: { turn: 3, text: "Completed consultation" } })).toEqual({ accepted: true });
    expect(instance.snapshot()).toMatchObject({ turns: 3, status: "settled", outcome: "complete", result: "Completed consultation" });
    expect(instance.snapshot().error).toBeUndefined();
  });

  it("counts a visible question yield before child cancellation and a final reply", () => {
    const instance = new VisibleChild({ definition, instructions: "visible", cwd: here, model: "openai-codex/test", effort: "low", skills: [], origin: "messaging-origin", retained: true, surface: "visible" }, "fixture-extension", "fixture-profile");
    const question = instance.parentMessage({ type: "question", payload: "Need clarification" }) as { id: string };
    instance.parentMessage({ type: "turn", payload: { turn: 1, text: "" } });
    instance.parentMessage({ type: "cancel-question", payload: { requestId: question.id } });
    expect(instance.parentMessage({ type: "turn", payload: { turn: 2, text: "Resolved locally" } })).toEqual({ accepted: true });
    expect(instance.snapshot()).toMatchObject({ turns: 2, status: "settled", outcome: "complete", result: "Resolved locally" });
  });

  it("keeps ordinary visible input parent-coordinated and reserves ownership for explicit escalation", async () => {
    const instance = new VisibleChild({ definition, instructions: "visible", cwd: here, model: "openai-codex/test", effort: "low", skills: [], origin: "messaging-origin", retained: true, surface: "visible" }, "fixture-extension", "fixture-profile", {} as any);
    (instance as any).appReady = true;
    instance.record.status = "running";
    await instance.message("queued parent message", { delivery: "queued" });
    instance.record.status = "settled"; instance.record.outcome = "complete"; instance.record.result = "old result";
    instance.parentMessage({ type: "operator-input", payload: { text: "new operator turn" } });
    expect(instance.snapshot()).toMatchObject({ status: "running", assignment: "new operator turn", userOwned: false, outcome: undefined, result: undefined });
    await instance.message("parent still controls", { delivery: "queued" });
    const commands=(instance.parentMessage({ type: "app-poll" }) as any).commands;
    expect(commands).toContainEqual(expect.objectContaining({type:"message",message:"queued parent message"}));
    expect(commands).toContainEqual(expect.objectContaining({type:"message",message:"parent still controls"}));
    instance.parentMessage({type:"intervene"});
    expect(instance.snapshot().userOwned).toBe(true);
    await expect(instance.message("parent blocked")).rejects.toThrow(/intervention/);
    instance.parentMessage({type:"handback"});
    expect(instance.snapshot().userOwned).toBe(false);
  });

  it("keeps a pending question separate from an ordinary child turn", async () => {
    const instance = child();
    void instance.start();
    await vi.waitFor(() => expect(instance.record.processState).toBe("running"));
    const request = instance.parentMessage({ type: "question", payload: "Question from one tool" }) as { id: string };
    (instance as any).last = "A later assistant response from the same mixed batch";
    await (instance as any).finishFromTurn();
    expect(instance.snapshot()).toMatchObject({ status: "waiting", phase: "waiting-parent", requestId: request.id, result: "Question from one tool" });
    await expect(instance.answer("resolved", request.id)).resolves.toBeUndefined();
  });

  it.each(["answer", "cancel"] as const)("preserves first resolution and reports late %s resolution", async winner => {
    const instance = child();
    void instance.start();
    await vi.waitFor(() => expect(instance.record.processState).toBe("running"));
    const request = instance.parentMessage({ type: "question", payload: "Which result?" }) as { id: string };
    if (winner === "answer") await instance.answer("the first result", request.id);
    else instance.cancelQuestion(request.id);
    expect(instance.snapshot().requestId).toBeUndefined();
    if (winner === "answer") expect(() => instance.cancelQuestion(request.id)).toThrow(/already resolved by parent answered/);
    else await expect(instance.answer("too late", request.id)).rejects.toThrow(/already resolved by child cancelled/);
    (instance as any).last = "continued assignment";
    await (instance as any).finishFromTurn();
    expect(instance.snapshot()).toMatchObject({ status: "settled", outcome: "complete" });
  });

  it("does not turn ordinary assignment cancellation into a question answer", async () => {
    const instance = child();
    void instance.start();
    await vi.waitFor(() => expect(instance.record.processState).toBe("running"));
    const request = instance.parentMessage({ type: "question", payload: "Need a decision" }) as { id: string };
    await instance.cancel();
    await expect(instance.answer("too late", request.id)).rejects.toThrow(/already resolved by assignment cancelled/);
  });

  it("keeps a non-retained child alive until its question is resolved", async () => {
    const instance = child();
    const settled = instance.start();
    await vi.waitFor(() => expect(instance.record.processState).toBe("running"));
    const request = instance.parentMessage({ type: "question", payload: "Need a decision" }) as { id: string };
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(instance.record.processState).toBe("running");
    await instance.answer("decision supplied", request.id);
    await vi.waitFor(() => expect(instance.snapshot()).toMatchObject({ status: "settled", outcome: "complete" }));
    await settled;
  });
});

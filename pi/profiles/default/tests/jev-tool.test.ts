import { describe, expect, it, vi } from "vitest";
import { Value } from "typebox/value";
import registerJev, { jevOutputSchema, jevParameters, validQuestions } from "../extensions/jev.ts";
import { createMockPi } from "./helpers/mock-pi.ts";
import { JevClientError } from "../lib/jev/client.ts";

const questions = { urgent: { type: "noul", instructions: "Is this urgent?" } };

function client() {
	return { evaluate: vi.fn(async (_state: unknown, submitted: unknown, options?: { signal?: AbortSignal; model?: string }) => ({
		answers: { urgent: { type: "noul", noul: 0.25 } }, model: options?.model ?? "jev-1.13.0", usage: { input_tokens: 3, output_tokens: 0 }, submitted,
	})) };
}

describe("jev_evaluate", () => {
	it("registers as deferred and maps success to a schema-valid result", async () => {
		const pi = createMockPi();
		registerJev(pi as never, client() as never);
		const result = await pi._getTool("jev_evaluate")!.execute("id", { state: "synthetic", questions, model: "jev-test" }, undefined, undefined, {});
		expect(pi._getTool("jev_evaluate")!.exposure).toBe("deferred");
		expect(Value.Check(jevOutputSchema, result.structuredContent)).toBe(true);
		expect(result.structuredContent).toMatchObject({ ok: true });
		expect(result.isError).not.toBe(true);
		expect(JSON.parse(result.content[0].text)).toMatchObject({ model: "jev-test", answers: { urgent: { noul: 0.25 } }, elapsed_ms: expect.any(Number) });
	});

	it("validates inputs and preserves cancellation through the client boundary", async () => {
		expect(Value.Check(jevParameters, { state: "x", questions: {} })).toBe(false);
		expect(validQuestions({ urgent: { type: "noul", instructions: "Is this urgent?" } })).toBe(true);
		expect(validQuestions({ urgent: { type: "noul" } })).toBe(false);
		expect(validQuestions({ urgent: { type: "choice", instructions: "Pick one", criteria: { only: "x" } } })).toBe(false);
		expect(validQuestions({ urgent: { type: "choice", instructions: "Pick one", criteria: { yes: "x", no: { detail: ["y"] } } } })).toBe(true);
		expect(validQuestions({ priority: { type: "score", instructions: "Rate it", criteria: ["low", "high"] } })).toBe(true);
		expect(validQuestions({ priority: { type: "score", instructions: "Rate it", criteria: ["one"] } })).toBe(false);
		expect(validQuestions({ urgent: { type: "noul", instructions: "Is this urgent?", criteria: { true: "yes", false: "no" } } })).toBe(true);
		const pi = createMockPi();
		const jev = client();
		registerJev(pi as never, jev as never);
		const invalidResult = await pi._getTool("jev_evaluate")!.execute("id", { state: "synthetic", questions: {} }, undefined, undefined, {});
		expect(invalidResult.details).toEqual({ code: "request" });
		expect(Value.Check(jevOutputSchema, invalidResult.structuredContent)).toBe(true);
		expect(invalidResult.structuredContent).toMatchObject({ ok: false, error: { code: "request" } });
		expect(invalidResult.isError).toBe(true);
		expect(jev.evaluate).not.toHaveBeenCalled();
		const invalidStateResult = await pi._getTool("jev_evaluate")!.execute("id", { state: 42 as never, questions }, undefined, undefined, {});
		expect(invalidStateResult.isError).toBe(true);
		expect(jev.evaluate).not.toHaveBeenCalled();
		const controller = new AbortController();
		const cancelled = { evaluate: vi.fn(async (_state: unknown, _questions: unknown, options?: { signal?: AbortSignal }) => {
			expect(options?.signal?.aborted).toBe(true);
			throw new JevClientError("cancelled", "Jev request was cancelled");
		}) };
		const cancelledPi = createMockPi();
		registerJev(cancelledPi as never, cancelled as never);
		controller.abort();
		const result = await cancelledPi._getTool("jev_evaluate")!.execute("id", { state: "synthetic", questions }, controller.signal, undefined, {});
		expect(result.details).toEqual({ code: "cancelled" });
		expect(Value.Check(jevOutputSchema, result.structuredContent)).toBe(true);
		expect(result.structuredContent).toMatchObject({ ok: false, error: { code: "cancelled" } });
		expect(result.isError).toBe(true);
		expect(result.content[0].text).toBe("Jev evaluation failed: Jev request was cancelled");
		expect(result.content[0].text).not.toContain("synthetic");
	});

	it("does not evaluate or resolve credentials during registration", () => {
		const pi = createMockPi();
		const jev = client();
		registerJev(pi as never, jev as never);
		expect(jev.evaluate).not.toHaveBeenCalled();
		expect(pi._getTool("jev_evaluate")).toBeDefined();
	});
});

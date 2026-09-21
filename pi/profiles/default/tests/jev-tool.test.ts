import { describe, expect, it, vi } from "vitest";
import { Value } from "typebox/value";
import registerJev, { jevParameters, validQuestions } from "../extensions/jev.ts";
import registerToolSearch from "../extensions/tool-search.ts";
import registerToolVisibility from "../extensions/tool-visibility.ts";
import { createMockPi } from "./helpers/mock-pi.ts";
import { JevClientError } from "../lib/jev/client.ts";

const questions = { urgent: { type: "noul", instructions: "Is this urgent?" } };

function client() {
	return { evaluate: vi.fn(async (_state: unknown, submitted: unknown, options?: { signal?: AbortSignal; model?: string }) => ({
		answers: { urgent: { type: "noul", noul: 0.25 } }, model: options?.model ?? "jev-1.13.0", usage: { input_tokens: 3, output_tokens: 0 }, submitted,
	})) };
}

describe("jev_evaluate", () => {
	it("is deferred, discoverable, activates without disturbing other tools, and maps results", async () => {
		const pi = createMockPi();
		pi.registerTool({ name: "read", description: "Read", parameters: {}, execute: async () => ({ content: [] }) });
		registerJev(pi as never, client() as never); registerToolSearch(pi as never); registerToolVisibility(pi as never);
		await pi._getHook("session_start")[0]!.handler({}, {});
		expect(pi.getActiveTools()).toEqual(["read", "tool_search"]);
		const discovered = await pi._getTool("tool_search")!.execute("id", { query: "Jev evaluation" }, undefined, undefined, {});
		expect(discovered.details.activated).toEqual(["jev_evaluate"]);
		const result = await pi._getTool("jev_evaluate")!.execute("id", { state: "synthetic", questions, model: "jev-test" }, undefined, undefined, {});
		expect(result.isError).not.toBe(true);
		expect(JSON.parse(result.content[0].text)).toMatchObject({ model: "jev-test", answers: { urgent: { noul: 0.25 } }, elapsed_ms: expect.any(Number) });
		expect(pi.getActiveTools()).toEqual(["read", "tool_search", "jev_evaluate"]);
	});

	it("validates inputs and preserves cancellation through the client boundary", async () => {
		expect(Value.Check(jevParameters, { state: "x", questions: {} })).toBe(true);
		expect(validQuestions({ urgent: { type: "noul" } })).toBe(true);
		expect(validQuestions({ urgent: { type: "choice", criteria: { only: "x" } } })).toBe(false);
		const pi = createMockPi();
		const jev = client();
		registerJev(pi as never, jev as never);
		const invalidResult = await pi._getTool("jev_evaluate")!.execute("id", { state: "synthetic", questions: {} }, undefined, undefined, {});
		expect(invalidResult.details).toEqual({ code: "request" });
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

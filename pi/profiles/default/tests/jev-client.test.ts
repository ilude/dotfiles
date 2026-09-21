import { afterEach, describe, expect, it, vi } from "vitest";
import { choice, noul, score } from "@typesafe-ai/sdk";
import { createJevClient, createJevCredentialResolver, JEV_API_KEY_ID, JEV_API_KEY_NAME, JEV_ENDPOINT } from "../lib/jev/client.ts";

afterEach(() => vi.unstubAllEnvs());

const questions = {
	kind: choice("Which kind?", { bug: "A bug", feature: "A feature" }),
	priority: score("Priority", ["low", "high"] as const),
	urgent: noul("Is this urgent?"),
};

function response(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

it("uses the official SDK boundary and validates Choice, fractional Score, and Noul answers", async () => {
	const fetch = vi.fn(async (input: string, init?: RequestInit) => {
		expect(input).toBe(`${JEV_ENDPOINT}/v1/systemone`);
		expect(init?.headers).toMatchObject({ Authorization: "Bearer synthetic-key" });
		return response({ model: "jev-1.13.0", answers: {
			kind: { type: "choice", choice: "bug", confidence: 0.8, probabilities: { bug: 0.8, feature: 0.2 } },
			priority: { type: "score", score: 0.35, confidence: 0.7, legend: { 0: "low", 1: "high" }, probabilities: { 0: 0.65, 1: 0.35 } },
			urgent: { type: "noul", noul: 0.25 },
		}, usage: { input_tokens: 10, output_tokens: 0 } });
	});
	const client = createJevClient({ apiKey: "synthetic-key", fetch });
	const result = await client.evaluate("synthetic state", questions);
	expect(result.answers.priority.score).toBe(0.35);
	expect(result.answers.urgent).not.toHaveProperty("confidence");
	expect(fetch).toHaveBeenCalledOnce();
});

it("resolves credentials lazily from the exact BWS record without exposing helper output", async () => {
	const exec = vi.fn(async (_command: string, args: string[]) => ({ stdout: JSON.stringify({ key: JEV_API_KEY_NAME, value: "synthetic-bws-key" }), stderr: "" }));
	const resolve = createJevCredentialResolver(exec);
	const fetch = vi.fn(async () => response({ model: "jev-1.13.0", answers: { urgent: { type: "noul", noul: 0.5 } }, usage: { input_tokens: 1, output_tokens: 0 } }));
	const client = createJevClient({ credentialResolver: resolve, fetch });
	expect(exec).not.toHaveBeenCalled();
	await client.evaluate(null, { urgent: noul("Urgent?") });
	expect(exec).toHaveBeenCalledWith("uv", expect.arrayContaining([JEV_API_KEY_ID]), expect.anything());
	expect(exec.mock.calls[0][0]).toBe("uv");
});

it("rejects malformed or mismatched answers safely", async () => {
	const fetch = vi.fn(async () => response({ model: "jev-1.13.0", answers: { urgent: { type: "choice", choice: "yes" } }, usage: { input_tokens: 1, output_tokens: 0 } }));
	await expect(createJevClient({ apiKey: "synthetic-key", fetch }).evaluate("private synthetic state", { urgent: noul("Urgent?") })).rejects.toMatchObject({ code: "response" });
	await expect(createJevClient({ apiKey: "synthetic-key", fetch }).evaluate("private synthetic state", { urgent: noul("Urgent?") })).rejects.not.toThrow("private synthetic state");
});

describe("cancellation and timeout", () => {
	it("passes cancellation through the SDK boundary", async () => {
		const controller = new AbortController();
		const fetch = vi.fn(async (_input: string, init?: RequestInit) => {
			await new Promise<void>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
			return response({});
		});
		const promise = createJevClient({ apiKey: "synthetic-key", fetch }).evaluate("state", { urgent: noul("Urgent?") }, { signal: controller.signal });
		controller.abort();
		await expect(promise).rejects.toMatchObject({ code: "cancelled" });
	});

	it("reports SDK timeouts as safe failures", async () => {
		const fetch = vi.fn(async (_input: string, init?: RequestInit) => {
			await new Promise<void>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("timeout")), { once: true }));
			return response({});
		});
		await expect(createJevClient({ apiKey: "synthetic-key", fetch, timeoutMs: 10 }).evaluate("state", { urgent: noul("Urgent?") })).rejects.toMatchObject({ code: "timeout" });
	});
});

it("supports an environment override without credential lookup", async () => {
	vi.stubEnv(JEV_API_KEY_NAME, "synthetic-env-key");
	const resolver = vi.fn(async () => "should-not-be-used");
	const fetch = vi.fn(async () => response({ model: "jev-1.13.0", answers: { urgent: { type: "noul", noul: 1 } }, usage: { input_tokens: 1, output_tokens: 0 } }));
	await createJevClient({ credentialResolver: resolver, fetch }).evaluate("state", { urgent: noul("Urgent?") });
	expect(resolver).not.toHaveBeenCalled();
});

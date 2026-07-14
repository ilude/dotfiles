import { Type } from "@sinclair/typebox";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createAgentSessionMock, createExtensionRuntimeMock } = vi.hoisted(() => ({
	createAgentSessionMock: vi.fn(),
	createExtensionRuntimeMock: vi.fn(() => ({})),
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
	createAgentSession: createAgentSessionMock,
	createExtensionRuntime: createExtensionRuntimeMock,
	SessionManager: { inMemory: vi.fn(() => ({})) },
	SettingsManager: { inMemory: vi.fn(() => ({})) },
}));

import { defineAgent } from "../lib/typed-agent.js";

const InputSchema = Type.Object({ text: Type.String() });
const OutputSchema = Type.Object({
	classification: Type.Union([
		Type.Literal("accepted"),
		Type.Literal("rejected"),
	]),
});

function setupSession(responses: string[]) {
	const messages: Array<Record<string, unknown>> = [];
	const prompt = vi.fn(async () => {
		const response = responses.shift();
		if (response !== undefined) {
			messages.push({
				role: "assistant",
				content: [{ type: "text", text: response }],
			});
		}
	});
	const abort = vi.fn(async () => {});
	const dispose = vi.fn();
	createAgentSessionMock.mockResolvedValue({
		session: { messages, prompt, abort, dispose },
	});
	return { messages, prompt, abort, dispose };
}

function createAgent() {
	return defineAgent({
		id: "test-classifier",
		instructions: "Classify the input.",
		inputSchema: InputSchema,
		outputSchema: OutputSchema,
		resolveModel: () => ({ provider: "openai-codex", id: "gpt-test" }) as never,
		prompt: (input) => `Classify: ${input.text}`,
	});
}

function createContext(signal?: AbortSignal) {
	return {
		cwd: "C:/repo",
		model: undefined,
		modelRegistry: {} as never,
		signal,
	};
}

describe("typed agent", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("runs an isolated Pi session and validates structured output", async () => {
		const { prompt, dispose } = setupSession([
			'Here is the result: {"classification":"accepted"}',
		]);

		const result = await createAgent().run(
			{ text: "candidate" },
			createContext(),
		);

		expect(result).toEqual({
			output: { classification: "accepted" },
			attempts: 1,
		});
		expect(prompt).toHaveBeenCalledWith("Classify: candidate");
		expect(createAgentSessionMock).toHaveBeenCalledWith(
			expect.objectContaining({
				cwd: "C:/repo",
				thinkingLevel: "low",
				noTools: "all",
			}),
		);
		expect(dispose).toHaveBeenCalledOnce();
	});

	it("gives one correction attempt for invalid output", async () => {
		const { prompt } = setupSession([
			'{"classification":"unknown"}',
			'{"classification":"rejected"}',
		]);

		const result = await createAgent().run(
			{ text: "candidate" },
			createContext(),
		);

		expect(result).toEqual({
			output: { classification: "rejected" },
			attempts: 2,
		});
		expect(prompt).toHaveBeenCalledTimes(2);
		expect(prompt.mock.calls[1]?.[0]).toContain("failed output validation");
	});

	it("rejects invalid input before creating a session", async () => {
		await expect(
			createAgent().run({ text: 42 } as never, createContext()),
		).rejects.toThrow();
		expect(createAgentSessionMock).not.toHaveBeenCalled();
	});

	it("propagates cancellation to the nested session", async () => {
		let releasePrompt: (() => void) | undefined;
		const messages: Array<Record<string, unknown>> = [];
		const prompt = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					releasePrompt = resolve;
				}),
		);
		const abort = vi.fn(async () => {
			releasePrompt?.();
		});
		const dispose = vi.fn();
		createAgentSessionMock.mockResolvedValue({
			session: { messages, prompt, abort, dispose },
		});
		const controller = new AbortController();

		const run = createAgent().run(
			{ text: "candidate" },
			createContext(controller.signal),
		);
		await vi.waitFor(() => expect(prompt).toHaveBeenCalledOnce());
		controller.abort();

		await expect(run).rejects.toMatchObject({ name: "AbortError" });
		expect(abort).toHaveBeenCalledOnce();
		expect(dispose).toHaveBeenCalledOnce();
	});
});

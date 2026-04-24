import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@mariozechner/pi-ai/oauth", () => ({
	getOAuthProvider: vi.fn(() => ({
		name: "GitHub Copilot",
		login: "https://github.com/login",
		refreshToken: async () => {},
		getApiKey: async () => "test-key",
		usesCallbackServer: false,
		modifyModels: () => [],
	})),
}));

import { applyCopilotHeaders } from "../extensions/copilot-headers";

describe("applyCopilotHeaders", () => {
	it("injects Editor-Version and Copilot-Integration-Id into copilot models", () => {
		const mockRegisterProvider = vi.fn();
		const ctx = {
			modelRegistry: {
				getAll: () => [
					{
						provider: "github-copilot",
						id: "gpt-4.1",
						name: "GPT-4.1",
						api: "github-copilot",
						baseUrl: "https://api.github.com",
						reasoning: false,
						input: ["text"],
						cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
						contextWindow: 128000,
						maxTokens: 8192,
					},
				],
				registerProvider: mockRegisterProvider,
			},
		};

		const result = applyCopilotHeaders(ctx as any);
		expect(result).toEqual({ updated: 1 });
		expect(mockRegisterProvider).toHaveBeenCalledWith(
			"github-copilot",
			expect.objectContaining({
				models: expect.arrayContaining([
					expect.objectContaining({
						headers: expect.objectContaining({
							"Editor-Version": "VSCode/1.99.1",
							"Copilot-Integration-Id": "vscode/github-copilot",
						}),
					}),
				]),
			}),
		);
	});

	it("returns undefined when no copilot models", () => {
		const ctx = {
			modelRegistry: {
				getAll: () => [],
				registerProvider: vi.fn(),
			},
		};

		const result = applyCopilotHeaders(ctx as any);
		expect(result).toBeUndefined();
	});
});
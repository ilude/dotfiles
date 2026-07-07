import { describe, expect, it, vi } from "vitest";
import bedrockRefresh from "../extensions/bedrock-refresh.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

type ExtensionApiArg = Parameters<typeof bedrockRefresh>[0];

const foundationModels = {
	modelSummaries: [
		{ modelId: "anthropic.claude-opus-4-8" },
		{ modelId: "anthropic.claude-fable-5" },
		{ modelId: "anthropic.claude-sonnet-4-6" },
	],
};

const inferenceProfiles = {
	inferenceProfileSummaries: [
		{ inferenceProfileId: "us.anthropic.claude-opus-4-8" },
		{ inferenceProfileId: "us.anthropic.claude-fable-5" },
		{ inferenceProfileId: "us.anthropic.claude-sonnet-4-6" },
	],
};

describe("bedrock-refresh extension", () => {
	it("registers the slash command", () => {
		const pi = createMockPi();

		bedrockRefresh(pi as unknown as ExtensionApiArg);

		expect(pi.registerCommand).toHaveBeenCalledWith(
			"bedrock-refresh",
			expect.objectContaining({
				description: expect.stringContaining("AWS Bedrock"),
				handler: expect.any(Function),
			}),
		);
	});

	it("polls Bedrock directly in read-only mode", async () => {
		const pi = createMockPi();
		pi.exec = vi.fn(async (_cmd: string, args?: string[], _opts?: unknown) => ({
			code: 0,
			stdout: JSON.stringify(
				args?.includes("list-inference-profiles")
					? inferenceProfiles
					: foundationModels,
			),
			stderr: "",
		}));
		const ctx = createMockCtx();

		bedrockRefresh(pi as unknown as ExtensionApiArg);
		await pi._commands[0]?.handler("", ctx);

		expect(pi.exec).toHaveBeenCalledWith(
			"aws",
			expect.arrayContaining(["bedrock", "list-foundation-models"]),
			expect.objectContaining({ timeout: expect.any(Number) }),
		);
		expect(pi.exec).toHaveBeenCalledWith(
			"aws",
			expect.arrayContaining(["bedrock", "list-inference-profiles"]),
			expect.objectContaining({ timeout: expect.any(Number) }),
		);
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining(
				"Bedrock enabledModels are current for configured Opus, Fable, and Sonnet lines.",
			),
			"info",
		);
	});
});

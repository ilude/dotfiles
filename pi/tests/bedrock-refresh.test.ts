import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

let tempDir: string;
let settingsPath: string;

beforeEach(() => {
	tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-bedrock-refresh-"));
	vi.stubEnv("PI_CODING_AGENT_DIR", tempDir);
	settingsPath = path.join(tempDir, "settings.json");
	fs.writeFileSync(
		settingsPath,
		`${JSON.stringify(
			{
				bedrockRefresh: {
					models: [
						"us.anthropic.claude-opus-4-8",
						"us.anthropic.claude-fable-5",
						"us.anthropic.claude-sonnet-4-6",
					],
				},
				unrelated: { preserved: true },
			},
			null,
			2,
		)}\n`,
		"utf-8",
	);
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
	fs.rmSync(tempDir, { recursive: true, force: true });
});

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
				"Bedrock refresh models are current for configured Opus, Fable, and Sonnet lines.",
			),
			"info",
		);
	});

	it("updates only refresh inventory and preserves unrelated settings", async () => {
		fs.writeFileSync(
			settingsPath,
			`${JSON.stringify(
				{
					bedrockRefresh: {
						models: [
							"us.anthropic.claude-opus-4-7",
							"us.anthropic.claude-fable-5",
							"us.anthropic.claude-sonnet-4-6",
						],
						preserved: "nested",
					},
					enabledModels: ["amazon-bedrock/us.anthropic.claude-opus-4-7"],
					unrelated: { preserved: true },
				},
				null,
				2,
			)}\n`,
			"utf-8",
		);
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
		await pi._commands[0]?.handler("--apply", ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining(
				"Updated pi/settings.json bedrockRefresh.models.",
			),
			"info",
		);
		const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
		expect(settings).toEqual({
			bedrockRefresh: {
				models: [
					"us.anthropic.claude-opus-4-8",
					"us.anthropic.claude-fable-5",
					"us.anthropic.claude-sonnet-4-6",
				],
				preserved: "nested",
			},
			enabledModels: ["amazon-bedrock/us.anthropic.claude-opus-4-7"],
			unrelated: { preserved: true },
		});
	});

	it("does not replace settings when the recommended inventory is unchanged", async () => {
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
		const before = fs.readFileSync(settingsPath, "utf-8");

		bedrockRefresh(pi as unknown as ExtensionApiArg);
		await pi._commands[0]?.handler("--apply", ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("No settings update needed."),
			"warning",
		);
		expect(fs.readFileSync(settingsPath, "utf-8")).toBe(before);
	});
});

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import bedrockRefresh from "../extensions/bedrock-refresh.ts";
import {
	type BedrockAuthEnvironment,
	parseAwsIni,
	resolveBedrockTarget,
	selectBedrockCredentialsProfile,
} from "../lib/bedrock-auth.ts";
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

function createBedrockCtx(
	env: BedrockAuthEnvironment = {
		AWS_PROFILE: "provider-profile",
		AWS_REGION: "us-west-2",
	},
) {
	return createMockCtx({
		modelRegistry: {
			getAll: () => [{ provider: "amazon-bedrock", id: "bedrock-model" }],
			getApiKeyAndHeaders: vi.fn(async () => ({ ok: true, env })),
		},
	});
}

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

describe("Bedrock target resolution", () => {
	it("omits profile arguments for provider-scoped non-profile authentication", () => {
		expect(
			resolveBedrockTarget({
				providerEnv: {
					AWS_PROFILE: "ignored-profile",
					AWS_ACCESS_KEY_ID: "fixture-key",
					AWS_SECRET_ACCESS_KEY: "fixture-secret",
					AWS_REGION: "us-east-2",
				},
				processEnv: { AWS_PROFILE: "process-profile" },
			}),
		).toEqual({
			profile: undefined,
			region: "us-east-2",
			credentialSource: "non-profile",
		});
	});

	it("selects default or one named credential profile but not ambiguous profiles", () => {
		expect(
			selectBedrockCredentialsProfile(
				parseAwsIni("[default]\ncredential_process = default-command\n"),
			),
		).toBe("default");
		expect(
			selectBedrockCredentialsProfile(
				parseAwsIni("[work]\nsso_session = work-session\n"),
			),
		).toBe("work");
		expect(
			selectBedrockCredentialsProfile(
				parseAwsIni(
					"[work]\nsso_session = work-session\n[personal]\ncredential_process = personal-command\n",
				),
			),
		).toBeUndefined();
	});

	it("falls back to the default credential chain and region", () => {
		expect(resolveBedrockTarget({})).toEqual({
			profile: undefined,
			region: "us-east-2",
			credentialSource: "default-chain",
		});
	});
});

describe("bedrock-refresh extension", () => {
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
		const ctx = createBedrockCtx();

		bedrockRefresh(pi as unknown as ExtensionApiArg);
		await pi._commands[0]?.handler("", ctx);

		expect(pi.exec).toHaveBeenCalledWith(
			"aws",
			[
				"--profile",
				"provider-profile",
				"bedrock",
				"list-foundation-models",
				"--region",
				"us-west-2",
				"--by-provider",
				"Anthropic",
				"--output",
				"json",
			],
			expect.objectContaining({ timeout: expect.any(Number) }),
		);
		expect(pi.exec).toHaveBeenCalledWith(
			"aws",
			[
				"--profile",
				"provider-profile",
				"bedrock",
				"list-inference-profiles",
				"--region",
				"us-west-2",
				"--type-equals",
				"SYSTEM_DEFINED",
				"--output",
				"json",
			],
			expect.objectContaining({ timeout: expect.any(Number) }),
		);
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining(
				"Bedrock refresh models are current for configured Opus, Fable, and Sonnet lines.",
			),
			"info",
		);
	});

	it("passes provider-scoped non-profile credentials without --profile", async () => {
		vi.stubEnv("AWS_PROFILE", "process-profile");
		const pi = createMockPi();
		const executeAws = vi.fn(
			async (args: string[], _options: { env?: NodeJS.ProcessEnv }) => ({
				code: 0,
				stdout: JSON.stringify(
					args.includes("list-inference-profiles")
						? inferenceProfiles
						: foundationModels,
				),
				stderr: "",
				killed: false,
			}),
		);
		const ctx = createBedrockCtx({
			AWS_PROFILE: "ignored-profile",
			AWS_ACCESS_KEY_ID: "x",
			AWS_SECRET_ACCESS_KEY: "x",
			AWS_REGION: "us-east-2",
		});

		bedrockRefresh(pi as unknown as ExtensionApiArg, { executeAws });
		await pi._commands[0]?.handler("", ctx);

		expect(executeAws).toHaveBeenCalledTimes(2);
		for (const [args, options] of executeAws.mock.calls) {
			expect(args).not.toContain("--profile");
			expect(args).toEqual(expect.arrayContaining(["--region", "us-east-2"]));
			expect(options.env).toMatchObject({
				AWS_ACCESS_KEY_ID: "x",
				AWS_SECRET_ACCESS_KEY: "x",
				AWS_REGION: "us-east-2",
			});
			expect(options.env?.AWS_PROFILE).toBeUndefined();
		}
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
		const ctx = createBedrockCtx();

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
		const ctx = createBedrockCtx();
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

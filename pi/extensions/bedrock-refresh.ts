import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import type {
	ExecResult,
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	awsProfileRegions,
	type BedrockAuthEnvironment,
	type BedrockTarget,
	parseAwsIni,
	resolveBedrockTarget,
} from "../lib/bedrock-auth.ts";
import {
	getSettingsPath,
	updateJsonObjectAtomic,
} from "../lib/settings-file.ts";

const COMMAND_NAME = "bedrock-refresh";
const POLL_TIMEOUT_MS = 60_000;
const AWS_OUTPUT_MAX_BYTES = 10 * 1024 * 1024;
const execFileAsync = promisify(execFile);

interface AwsExecutionOptions {
	env?: NodeJS.ProcessEnv;
	signal?: AbortSignal;
}

type AwsExecutor = (
	args: string[],
	options: AwsExecutionOptions,
) => Promise<ExecResult>;

interface PollResult {
	profile: string;
	region: string;
	settingsFile: string;
	current: string[];
	latest: Record<string, string | null>;
	recommended: string[];
	missing: string[];
	stale: string[];
}

interface ParsedArgs {
	apply: boolean;
	profile?: string;
	region?: string;
}

function parseArgs(args: string): ParsedArgs {
	const parts = args.split(/\s+/).filter(Boolean);
	const parsed: ParsedArgs = { apply: false };

	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		switch (part) {
			case "--apply":
				parsed.apply = true;
				break;
			case "--profile": {
				const value = parts[++i];
				if (!value) throw new Error("--profile requires a value");
				parsed.profile = value;
				break;
			}
			case "--region": {
				const value = parts[++i];
				if (!value) throw new Error("--region requires a value");
				parsed.region = value;
				break;
			}
			case "--help":
			case "-h":
				throw new Error(helpText());
			default:
				throw new Error(`Unknown argument: ${part}\n${helpText()}`);
		}
	}

	return parsed;
}

function helpText(): string {
	return [
		"Usage: /bedrock-refresh [--apply] [--profile PROFILE] [--region REGION]",
		"",
		"Poll AWS Bedrock for newer configured Claude Opus, Fable, and Sonnet model IDs.",
		"Without --apply, this is read-only and reports current vs latest models.",
		"With --apply, it updates pi/settings.json bedrockRefresh.models.",
	].join("\n");
}

function resolveHomePath(filePath: string): string {
	if (filePath === "~") return os.homedir();
	if (filePath.startsWith("~/") || filePath.startsWith("~\\"))
		return path.join(os.homedir(), filePath.slice(2));
	return filePath;
}

function configuredProfileRegions(): Record<string, string> {
	const configPath = resolveHomePath(
		process.env.AWS_CONFIG_FILE ?? path.join(os.homedir(), ".aws", "config"),
	);
	if (!fs.existsSync(configPath)) return {};
	return awsProfileRegions(parseAwsIni(fs.readFileSync(configPath, "utf-8")));
}

async function providerEnvironment(
	ctx: ExtensionContext,
): Promise<BedrockAuthEnvironment | undefined> {
	const model = ctx.modelRegistry
		.getAll()
		.find((candidate) => candidate.provider === "amazon-bedrock");
	if (!model) return undefined;
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok) throw new Error(auth.error);
	return auth.env as BedrockAuthEnvironment | undefined;
}

function awsArgs(target: BedrockTarget, commandArgs: string[]): string[] {
	return [
		...(target.profile ? ["--profile", target.profile] : []),
		...commandArgs,
	];
}

function scopedAwsEnvironment(
	target: BedrockTarget,
	providerEnv: BedrockAuthEnvironment | undefined,
): NodeJS.ProcessEnv | undefined {
	if (target.credentialSource !== "non-profile" || !providerEnv)
		return undefined;
	const env: NodeJS.ProcessEnv = { ...process.env };
	delete env.AWS_PROFILE;
	delete env.AWS_DEFAULT_PROFILE;
	for (const [key, value] of Object.entries(providerEnv)) {
		if (key === "AWS_PROFILE" || key === "AWS_DEFAULT_PROFILE") continue;
		if (value) env[key] = value;
	}
	return env;
}

function createAwsExecutor(pi: ExtensionAPI): AwsExecutor {
	return async (args, options) => {
		if (!options.env)
			return pi.exec("aws", args, {
				timeout: POLL_TIMEOUT_MS,
				signal: options.signal,
			});
		try {
			const result = await execFileAsync("aws", args, {
				env: options.env,
				maxBuffer: AWS_OUTPUT_MAX_BYTES,
				signal: options.signal,
				timeout: POLL_TIMEOUT_MS,
				windowsHide: true,
			});
			return {
				stdout: result.stdout,
				stderr: result.stderr,
				code: 0,
				killed: false,
			};
		} catch (error) {
			const failure = error as Error & {
				code?: number;
				killed?: boolean;
				stdout?: string;
				stderr?: string;
			};
			return {
				stdout: failure.stdout ?? "",
				stderr: failure.stderr ?? failure.message,
				code: typeof failure.code === "number" ? failure.code : 1,
				killed: failure.killed ?? false,
			};
		}
	};
}

async function awsJson(
	executeAws: AwsExecutor,
	target: BedrockTarget,
	commandArgs: string[],
	options: AwsExecutionOptions,
): Promise<Record<string, unknown>> {
	const result = await executeAws(awsArgs(target, commandArgs), options);
	if (result.code !== 0) {
		const output = [result.stdout.trim(), result.stderr.trim()]
			.filter(Boolean)
			.join("\n");
		throw new Error(output || `aws ${commandArgs.join(" ")} failed`);
	}
	return JSON.parse(result.stdout) as Record<string, unknown>;
}

function stringValues(
	payload: Record<string, unknown>,
	listKey: string,
	idKey: string,
): string[] {
	const rawList = payload[listKey];
	if (!Array.isArray(rawList)) return [];
	return rawList
		.map((item) => {
			if (item === null || typeof item !== "object") return undefined;
			const value = (item as Record<string, unknown>)[idKey];
			return typeof value === "string" ? value : undefined;
		})
		.filter((value): value is string => value !== undefined);
}

function versionKey(modelId: string): number[] {
	const suffix = modelId.split("claude-").at(-1) ?? modelId;
	const matches = suffix.match(/\d+/g) ?? [];
	const numbers = matches
		.filter((value) => value.length !== 8)
		.map((value) => Number.parseInt(value, 10));
	return numbers.length > 0 ? numbers : [0];
}

function compareVersions(left: string, right: string): number {
	const a = versionKey(left);
	const b = versionKey(right);
	const length = Math.max(a.length, b.length);
	for (let index = 0; index < length; index++) {
		const delta = (a[index] ?? 0) - (b[index] ?? 0);
		if (delta !== 0) return delta;
	}
	return left.localeCompare(right);
}

function trackedLine(
	modelId: string,
): { family: string; major: number } | undefined {
	const match = /claude-(opus|fable|sonnet)-(\d+)/.exec(modelId);
	if (!match?.[1] || !match[2]) return undefined;
	return { family: match[1], major: Number.parseInt(match[2], 10) };
}

async function runPoll(
	parsed: ParsedArgs,
	ctx: ExtensionContext,
	executeAws: AwsExecutor,
): Promise<PollResult> {
	const providerEnv = await providerEnvironment(ctx);
	const target = resolveBedrockTarget({
		explicitProfile: parsed.profile,
		explicitRegion: parsed.region,
		providerEnv,
		processEnv: process.env as BedrockAuthEnvironment,
		profileRegions: configuredProfileRegions(),
	});
	const executionOptions: AwsExecutionOptions = {
		env: scopedAwsEnvironment(target, providerEnv),
		signal: ctx.signal,
	};
	const [foundation, profiles] = await Promise.all([
		awsJson(
			executeAws,
			target,
			[
				"bedrock",
				"list-foundation-models",
				"--region",
				target.region,
				"--by-provider",
				"Anthropic",
				"--output",
				"json",
			],
			executionOptions,
		),
		awsJson(
			executeAws,
			target,
			[
				"bedrock",
				"list-inference-profiles",
				"--region",
				target.region,
				"--type-equals",
				"SYSTEM_DEFINED",
				"--output",
				"json",
			],
			executionOptions,
		),
	]);
	const modelIds = new Set([
		...stringValues(foundation, "modelSummaries", "modelId"),
		...stringValues(
			profiles,
			"inferenceProfileSummaries",
			"inferenceProfileId",
		),
	]);
	const allModelIds = [...modelIds].sort();
	const settingsFile = getSettingsPath();
	const settings = JSON.parse(fs.readFileSync(settingsFile, "utf-8")) as Record<
		string,
		unknown
	>;
	const refreshSettings =
		settings.bedrockRefresh !== null &&
		typeof settings.bedrockRefresh === "object" &&
		!Array.isArray(settings.bedrockRefresh)
			? (settings.bedrockRefresh as Record<string, unknown>)
			: {};
	const current = Array.isArray(refreshSettings.models)
		? refreshSettings.models.filter(
				(value): value is string =>
					typeof value === "string" && value.startsWith("us.anthropic.claude-"),
			)
		: [];

	const latest: Record<string, string | null> = {};
	const recommended: string[] = [];
	for (const modelId of current) {
		const line = trackedLine(modelId);
		if (!line) continue;
		const key = `${line.family}-${line.major}`;
		const prefix = `us.anthropic.claude-${line.family}-${line.major}`;
		const candidates = allModelIds.filter((candidate) =>
			candidate.startsWith(prefix),
		);
		const latestCandidate = candidates.sort(compareVersions).at(-1) ?? null;
		latest[key] = latestCandidate;
		if (latestCandidate) recommended.push(latestCandidate);
	}

	const missing = recommended.filter((modelId) => !current.includes(modelId));
	const stale = current.filter((modelId) => !recommended.includes(modelId));
	return {
		profile: target.profile ?? "default credential chain",
		region: target.region,
		settingsFile,
		current,
		latest,
		recommended,
		missing,
		stale,
	};
}

function formatPollSummary(result: PollResult): string {
	const lines = [
		`AWS profile: ${result.profile}`,
		`AWS region:  ${result.region}`,
		`Settings:    ${result.settingsFile}`,
		"",
		"Latest Bedrock us.* model IDs for configured major lines:",
	];

	for (const key of Object.keys(result.latest).sort()) {
		lines.push(`  ${key}: ${result.latest[key] ?? "not found"}`);
	}

	lines.push("", "Configured Bedrock models:");
	if (result.current.length > 0) {
		for (const model of result.current) lines.push(`  ${model}`);
	} else {
		lines.push("  none");
	}

	if (result.missing.length > 0 || result.stale.length > 0) {
		lines.push("", "Update suggested:");
		for (const model of result.missing)
			lines.push(`  add/replace with ${model}`);
		for (const model of result.stale) lines.push(`  stale: ${model}`);
	} else {
		lines.push(
			"",
			"Bedrock refresh models are current for configured Opus, Fable, and Sonnet lines.",
		);
	}

	return lines.join("\n");
}

function applyRecommendedModels(result: PollResult): Promise<boolean> {
	return updateJsonObjectAtomic(getSettingsPath(), (settings) => {
		const refreshSettings =
			settings.bedrockRefresh !== null &&
			typeof settings.bedrockRefresh === "object" &&
			!Array.isArray(settings.bedrockRefresh)
				? (settings.bedrockRefresh as Record<string, unknown>)
				: {};
		const existing = Array.isArray(refreshSettings.models)
			? refreshSettings.models.filter(
					(value): value is string => typeof value === "string",
				)
			: [];
		if (JSON.stringify(existing) === JSON.stringify(result.recommended))
			return settings;
		return {
			...settings,
			bedrockRefresh: { ...refreshSettings, models: result.recommended },
		};
	});
}

function notify(
	ctx: ExtensionContext,
	message: string,
	level: "info" | "warning" | "error" = "info",
): void {
	ctx.ui.notify(message, level);
}

export default function bedrockRefresh(
	pi: ExtensionAPI,
	options: { executeAws?: AwsExecutor } = {},
): void {
	const executeAws = options.executeAws ?? createAwsExecutor(pi);
	pi.registerCommand(COMMAND_NAME, {
		description: "Poll AWS Bedrock for current Claude model IDs",
		handler: async (args, ctx) => {
			let parsed: ParsedArgs;
			try {
				parsed = parseArgs(args);
			} catch (error) {
				notify(
					ctx,
					error instanceof Error ? error.message : String(error),
					"warning",
				);
				return;
			}

			try {
				const poll = await runPoll(parsed, ctx, executeAws);
				const summary = formatPollSummary(poll);
				if (!parsed.apply) {
					notify(
						ctx,
						summary,
						poll.missing.length > 0 || poll.stale.length > 0
							? "warning"
							: "info",
					);
					return;
				}

				const changed = await applyRecommendedModels(poll);
				notify(
					ctx,
					`${summary}\n\n${changed ? "Updated pi/settings.json bedrockRefresh.models." : "No settings update needed."}`,
					changed ? "info" : "warning",
				);
			} catch (error) {
				notify(
					ctx,
					error instanceof Error ? error.message : String(error),
					"error",
				);
			}
		},
	});
}

import * as fs from "node:fs";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	getSettingsPath,
	updateJsonObjectAtomic,
} from "../lib/settings-file.ts";

const COMMAND_NAME = "bedrock-refresh";
const POLL_TIMEOUT_MS = 60_000;

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

function profile(parsed: ParsedArgs): string {
	return parsed.profile ?? process.env.AWS_PROFILE ?? "default";
}

function region(parsed: ParsedArgs): string {
	return (
		parsed.region ??
		process.env.AWS_REGION ??
		process.env.AWS_DEFAULT_REGION ??
		"us-east-2"
	);
}

function awsArgs(parsed: ParsedArgs, commandArgs: string[]): string[] {
	const args: string[] = [];
	const selectedProfile = profile(parsed);
	if (selectedProfile) args.push("--profile", selectedProfile);
	args.push(...commandArgs);
	return args;
}

async function awsJson(
	pi: ExtensionAPI,
	parsed: ParsedArgs,
	commandArgs: string[],
): Promise<Record<string, unknown>> {
	const result = await pi.exec("aws", awsArgs(parsed, commandArgs), {
		timeout: POLL_TIMEOUT_MS,
	});
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
	pi: ExtensionAPI,
	parsed: ParsedArgs,
): Promise<PollResult> {
	const selectedRegion = region(parsed);
	const [foundation, profiles] = await Promise.all([
		awsJson(pi, parsed, [
			"bedrock",
			"list-foundation-models",
			"--region",
			selectedRegion,
			"--by-provider",
			"Anthropic",
			"--output",
			"json",
		]),
		awsJson(pi, parsed, [
			"bedrock",
			"list-inference-profiles",
			"--region",
			selectedRegion,
			"--type-equals",
			"SYSTEM_DEFINED",
			"--output",
			"json",
		]),
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
		profile: profile(parsed),
		region: selectedRegion,
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

export default function bedrockRefresh(pi: ExtensionAPI): void {
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
				const poll = await runPoll(pi, parsed);
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

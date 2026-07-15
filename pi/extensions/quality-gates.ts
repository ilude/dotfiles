/**
 * Quality Gates Extension
 *
 * Collects files changed by write and edit operations, then runs the
 * appropriate linters when the agent run ends. Validation failures trigger
 * a bounded follow-up repair turn before the session settles.
 *
 * Validators are configured in:
 *   $HOME/.dotfiles/claude/hooks/quality-validation/validators.yaml
 */

// Convention exception: no extension-utils helpers apply directly.
// Risk: helper API drifts and this file is not visited; mitigated because
//   the file already uses the shared yaml-helpers loader and reports
//   validation failures as a transcript message, not a tool error envelope.
// Why shared helper is inappropriate: formatToolError does not apply to
//   transcript messages. canonicalize does not apply because the file uses
//   path.extname and path.basename, not absolute-path safety checks.
// uiNotify does not apply because failures need to remain in the transcript.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type {
	ExtensionAPI,
	ToolResultEvent,
} from "@earendil-works/pi-coding-agent";
import { loadYamlViaPython } from "../lib/yaml-helpers";

interface ValidatorConfig {
	name: string;
	command: string[];
	check?: string;
	detect?: string[];
	timeout?: number;
}

interface LanguageConfig {
	extensions: string[];
	markers?: string[];
	validators: ValidatorConfig[];
}

interface ValidatorsYaml {
	[language: string]: LanguageConfig;
}

// Load validators.yaml once at module init
const VALIDATORS_PATH = path.join(
	os.homedir(),
	".dotfiles/claude/hooks/quality-validation/validators.yaml",
);

function loadValidators(): ValidatorsYaml {
	try {
		const content = fs.readFileSync(VALIDATORS_PATH, "utf-8");
		return loadYamlViaPython<ValidatorsYaml>(content) ?? {};
	} catch {
		return {};
	}
}

const validators = loadValidators();

// Build extension-to-language lookup from the loaded config
export function buildExtMap(
	config: ValidatorsYaml,
): Map<string, LanguageConfig> {
	const map = new Map<string, LanguageConfig>();
	for (const langConfig of Object.values(config)) {
		if (!Array.isArray(langConfig?.extensions)) continue;
		for (const ext of langConfig.extensions) {
			map.set(ext, langConfig);
		}
	}
	return map;
}

const extMap = buildExtMap(validators);
const validatorAvailabilityCache = new Map<string, boolean>();
const VALIDATOR_LOOKUP_TIMEOUT_MS = 2000;
const VALIDATOR_RUN_TIMEOUT_MS = 10000;
const MAX_AUTO_REPAIR_ATTEMPTS = 2;

function normalizedRelativePath(root: string, filePath: string): string {
	const relative = path.relative(root, filePath).replaceAll("\\", "/");
	return process.platform === "win32" ? relative.toLowerCase() : relative;
}

function markerPattern(marker: string): RegExp {
	const escaped = marker.replace(/[.+^${}()|[\]\\]/g, "\\$&");
	const pattern = escaped.replaceAll("*", ".*").replaceAll("?", ".");
	return new RegExp(`^${pattern}$`, process.platform === "win32" ? "i" : "");
}

function directoryMatchesMarker(directory: string, marker: string): boolean {
	if (!marker.includes("*") && !marker.includes("?"))
		return fs.existsSync(path.join(directory, marker));
	try {
		const pattern = markerPattern(marker);
		return fs.readdirSync(directory).some((entry) => pattern.test(entry));
	} catch {
		return false;
	}
}

export function findProjectRoot(
	filePath: string,
	markers: string[],
): string | undefined {
	let current = path.dirname(path.resolve(filePath));
	while (true) {
		if (markers.some((marker) => directoryMatchesMarker(current, marker)))
			return current;
		const parent = path.dirname(current);
		if (parent === current) return undefined;
		current = parent;
	}
}

export function buildValidatorCommand(
	command: string[],
	filePath: string,
	projectRoot: string,
): string[] {
	return command.map((part) =>
		part
			.replaceAll("{file}", filePath)
			.replaceAll("{project_root}", projectRoot),
	);
}

export function filterValidatorsByDetection(
	validatorConfigs: ValidatorConfig[],
	projectRoot: string,
): ValidatorConfig[] {
	const detected = validatorConfigs.filter((validator) =>
		validator.detect?.every((filePath) =>
			fs.existsSync(path.join(projectRoot, filePath)),
		),
	);
	return detected.length > 0
		? detected
		: validatorConfigs.filter((validator) => !validator.detect);
}

function parseChangedPaths(output: string): Set<string> {
	const changed = new Set<string>();
	const entries = output.split("\0").filter(Boolean);
	for (let index = 0; index < entries.length; index++) {
		const entry = entries[index];
		if (entry.length < 4) continue;
		changed.add(entry.slice(3).replaceAll("\\", "/"));
		if (entry[0] === "R" || entry[0] === "C") {
			const destination = entries[++index];
			if (destination) changed.add(destination.replaceAll("\\", "/"));
		}
	}
	return changed;
}

export async function filterNetChangedFiles(
	pi: ExtensionAPI,
	files: string[],
	cwd: string,
): Promise<string[]> {
	const existing = files.filter((filePath) =>
		fs.existsSync(path.resolve(cwd, filePath)),
	);
	if (existing.length === 0) return [];

	const rootResult = await pi.exec("git", ["rev-parse", "--show-toplevel"], {
		cwd,
		timeout: VALIDATOR_LOOKUP_TIMEOUT_MS,
	});
	const root = rootResult.stdout.trim();
	if (rootResult.code !== 0 || !root) return existing;

	const insideRoot: Array<{ original: string; relative: string }> = [];
	const outsideRoot: string[] = [];
	for (const filePath of existing) {
		const absolute = path.resolve(cwd, filePath);
		const relative = normalizedRelativePath(root, absolute);
		if (relative === ".." || relative.startsWith("../"))
			outsideRoot.push(filePath);
		else insideRoot.push({ original: filePath, relative });
	}
	if (insideRoot.length === 0) return outsideRoot;

	const statusResult = await pi.exec(
		"git",
		[
			"status",
			"--porcelain=v1",
			"-z",
			"--untracked-files=all",
			"--",
			...insideRoot.map((item) => item.relative),
		],
		{ cwd: root, timeout: VALIDATOR_LOOKUP_TIMEOUT_MS },
	);
	if (statusResult.code !== 0) return existing;
	const changed = parseChangedPaths(statusResult.stdout);
	const normalizedChanged = new Set(
		[...changed].map((filePath) =>
			process.platform === "win32" ? filePath.toLowerCase() : filePath,
		),
	);
	return [
		...outsideRoot,
		...insideRoot
			.filter((item) => normalizedChanged.has(item.relative))
			.map((item) => item.original),
	];
}

function contentHash(filePath: string, cwd: string): string | undefined {
	try {
		return crypto
			.createHash("sha256")
			.update(fs.readFileSync(path.resolve(cwd, filePath)))
			.digest("hex");
	} catch {
		return undefined;
	}
}

export function getFilePath(event: ToolResultEvent): string | undefined {
	return (
		(event.input as { path?: string }).path ??
		(event.input as { file_path?: string }).file_path
	);
}

async function isValidatorAvailable(
	pi: ExtensionAPI,
	lookup: string,
	checkBin: string,
): Promise<boolean> {
	const cacheKey = `${lookup}\0${checkBin}`;
	const cached = validatorAvailabilityCache.get(cacheKey);
	if (cached !== undefined) return cached;

	const whichResult = await pi.exec(lookup, [checkBin], {
		timeout: VALIDATOR_LOOKUP_TIMEOUT_MS,
	});
	const available = whichResult.code === 0;
	validatorAvailabilityCache.set(cacheKey, available);
	return available;
}

export async function runFirstAvailableValidator(
	pi: ExtensionAPI,
	langConfig: LanguageConfig,
	filePath: string,
	cwd: string = process.cwd(),
): Promise<{ name: string; output: string } | undefined> {
	const absoluteFilePath = path.resolve(cwd, filePath);
	const projectRoot =
		findProjectRoot(absoluteFilePath, langConfig.markers ?? []) ?? cwd;

	for (const validator of filterValidatorsByDetection(
		langConfig.validators,
		projectRoot,
	)) {
		const command = buildValidatorCommand(
			validator.command,
			absoluteFilePath,
			projectRoot,
		);
		const checkBin = validator.check ?? command[0];
		const lookup = process.platform === "win32" ? "where.exe" : "which";
		if (!(await isValidatorAvailable(pi, lookup, checkBin))) continue;

		const result = await pi.exec(command[0], command.slice(1), {
			cwd: projectRoot,
			timeout: validator.timeout
				? validator.timeout * 1000
				: VALIDATOR_RUN_TIMEOUT_MS,
		});
		if (result.code !== 0) {
			return {
				name: validator.name,
				output: (result.stdout + result.stderr).trim(),
			};
		}
		return undefined;
	}
	return undefined;
}

export function registerQualityGates(
	pi: ExtensionAPI,
	languageByExtension: Map<string, LanguageConfig> = extMap,
): void {
	const touchedFiles = new Set<string>();
	const successfulHashes = new Map<string, string>();
	let repairAttempts = 0;
	let repairQueued = false;

	pi.on("agent_start", () => {
		if (repairQueued) {
			repairQueued = false;
			return;
		}
		repairAttempts = 0;
	});

	pi.on("tool_result", (event: ToolResultEvent) => {
		if (event.toolName !== "write" && event.toolName !== "edit") return;

		const filePath = getFilePath(event);
		if (!filePath) return;

		const ext = path.extname(filePath).toLowerCase();
		if (languageByExtension.has(ext)) touchedFiles.add(filePath);
	});

	pi.on("agent_settled", async (_event, ctx) => {
		const pendingFiles = Array.from(touchedFiles).sort();
		touchedFiles.clear();
		if (pendingFiles.length === 0) return;
		const cwd = ctx?.cwd ?? process.cwd();
		const files = await filterNetChangedFiles(pi, pendingFiles, cwd);
		if (files.length === 0) {
			repairAttempts = 0;
			return;
		}

		const failures: Array<{
			filePath: string;
			name: string;
			output: string;
		}> = [];
		for (const filePath of files) {
			const absolutePath = path.resolve(cwd, filePath);
			if (!fs.existsSync(absolutePath)) continue;
			const ext = path.extname(filePath).toLowerCase();
			const langConfig = languageByExtension.get(ext);
			if (!langConfig) continue;
			const hashBefore = contentHash(filePath, cwd);
			const cacheKey = absolutePath;
			if (hashBefore && successfulHashes.get(cacheKey) === hashBefore) continue;

			const failure = await runFirstAvailableValidator(
				pi,
				langConfig,
				filePath,
				cwd,
			);
			const hashAfter = contentHash(filePath, cwd);
			if (hashBefore !== hashAfter) {
				if (hashAfter) touchedFiles.add(filePath);
				continue;
			}
			if (failure) failures.push({ filePath, ...failure });
			else if (hashAfter) successfulHashes.set(cacheKey, hashAfter);
		}

		if (failures.length === 0) {
			repairAttempts = 0;
			return;
		}

		const content = `Quality gate validation failed:\n\n${failures
			.map(
				(failure) =>
					`${failure.name} reported issues in ${path.basename(failure.filePath)}:\n${failure.output}`,
			)
			.join("\n\n")}`;
		if (repairAttempts >= MAX_AUTO_REPAIR_ATTEMPTS) {
			repairAttempts = 0;
			pi.sendMessage({
				customType: "quality-gates",
				content: `${content}\n\nAutomatic repair limit reached. Resolve these failures before continuing.`,
				display: true,
			});
			return;
		}

		repairAttempts++;
		repairQueued = true;
		for (const failure of failures) touchedFiles.add(failure.filePath);
		pi.sendMessage(
			{
				customType: "quality-gates",
				content: `${content}\n\nAddress every validation failure, re-run the relevant checks, and do not finish until they pass. After they pass, provide a complete final summary of the original task, all changes and repairs, changed files, and final validation results. Do not summarize only this repair.`,
				display: true,
			},
			{ triggerTurn: true, deliverAs: "followUp" },
		);
	});
}

export default function (pi: ExtensionAPI) {
	registerQualityGates(pi);
}

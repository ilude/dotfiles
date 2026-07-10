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
}

interface LanguageConfig {
	extensions: string[];
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
): Promise<{ name: string; output: string } | undefined> {
	for (const validator of langConfig.validators) {
		const checkBin = validator.check ?? validator.command[0];
		const lookup = process.platform === "win32" ? "where.exe" : "which";
		if (!(await isValidatorAvailable(pi, lookup, checkBin))) continue;

		const args = validator.command
			.slice(1)
			.map((part) => (part === "{file}" ? filePath : part));

		const result = await pi.exec(validator.command[0], args, {
			timeout: VALIDATOR_RUN_TIMEOUT_MS,
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

	pi.on("agent_end", async () => {
		const files = Array.from(touchedFiles).sort();
		touchedFiles.clear();
		if (files.length === 0) return;

		const warnings: string[] = [];
		for (const filePath of files) {
			const ext = path.extname(filePath).toLowerCase();
			const langConfig = languageByExtension.get(ext);
			if (!langConfig) continue;

			const failure = await runFirstAvailableValidator(
				pi,
				langConfig,
				filePath,
			);
			if (failure) {
				warnings.push(
					`${failure.name} reported issues in ${path.basename(filePath)}:\n${failure.output}`,
				);
			}
		}

		if (warnings.length === 0) {
			repairAttempts = 0;
			return;
		}

		const content = `Quality gate validation failed:\n\n${warnings.join("\n\n")}`;
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
		for (const filePath of files) touchedFiles.add(filePath);
		pi.sendMessage(
			{
				customType: "quality-gates",
				content: `${content}\n\nAddress every validation failure, re-run the relevant checks, and do not finish until they pass.`,
				display: true,
			},
			{ triggerTurn: true, deliverAs: "followUp" },
		);
	});
}

export default function (pi: ExtensionAPI) {
	registerQualityGates(pi);
}

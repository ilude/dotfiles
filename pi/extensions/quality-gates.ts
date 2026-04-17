/**
 * Quality Gates Extension
 *
 * Intercepts tool_result events for write and edit operations,
 * runs the appropriate linter for the file's language, and
 * prepends a warning to the result content if the linter fails.
 *
 * Validators are configured in:
 *   $HOME/.dotfiles/claude/hooks/quality-validation/validators.yaml
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	type ExtensionAPI,
	type ToolResultEvent,
} from "@mariozechner/pi-coding-agent";
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
	".dotfiles/claude/hooks/quality-validation/validators.yaml"
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
export function buildExtMap(config: ValidatorsYaml): Map<string, LanguageConfig> {
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

export function getFilePath(event: ToolResultEvent): string | undefined {
	return (
		(event.input as { path?: string }).path ??
		(event.input as { file_path?: string }).file_path
	);
}

async function runFirstAvailableValidator(
	pi: ExtensionAPI,
	langConfig: LanguageConfig,
	filePath: string
): Promise<{ name: string; output: string } | undefined> {
	for (const validator of langConfig.validators) {
		const checkBin = validator.check ?? validator.command[0];
		const whichResult = await pi.exec("which", [checkBin]);
		if (whichResult.code !== 0) continue;

		const args = validator.command
			.slice(1)
			.map((part) => (part === "{file}" ? filePath : part));

		const result = await pi.exec(validator.command[0], args);
		if (result.code !== 0) {
			return { name: validator.name, output: (result.stdout + result.stderr).trim() };
		}
		return undefined;
	}
	return undefined;
}

export default function (pi: ExtensionAPI) {
	pi.on("tool_result", async (event: ToolResultEvent) => {
		if (event.toolName !== "write" && event.toolName !== "edit") {
			return undefined;
		}

		const filePath = getFilePath(event);
		if (!filePath) return undefined;

		const ext = path.extname(filePath).toLowerCase();
		const langConfig = extMap.get(ext);
		if (!langConfig) return undefined;

		const failure = await runFirstAvailableValidator(pi, langConfig, filePath);
		if (!failure) return undefined;

		const warningText = `\u26a0 Quality gate: ${failure.name} reported issues in ${path.basename(filePath)}:\n${failure.output}`;
		return {
			content: [
				{ type: "text" as const, text: warningText },
				...event.content,
			],
		};
	});
}

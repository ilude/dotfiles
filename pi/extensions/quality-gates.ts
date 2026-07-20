import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type {
	ExtensionAPI,
	ToolResultEvent,
} from "@earendil-works/pi-coding-agent";
import {
	evaluateDifferentialLizard,
	LIZARD_THRESHOLDS,
	type LizardThresholds,
	parseGitDiffLineMapper,
	parseLizardCsv,
} from "../lib/quality-gates/lizard.ts";
import {
	loadQualityGatesPolicy,
	type LanguageConfig,
	type QualityGatesPolicy,
	type ValidatorConfig,
} from "../lib/quality-gates/policy.ts";

export type { LanguageConfig, QualityGatesPolicy, ValidatorConfig };

const POLICY_PATH = fileURLToPath(
	new URL("../quality-gates.json", import.meta.url),
);
const VALIDATOR_LOOKUP_TIMEOUT_MS = 2000;
const VALIDATOR_RUN_TIMEOUT_MS = 10000;
const MAX_AUTO_REPAIR_ATTEMPTS = 2;
const MAX_VALIDATOR_OUTPUT_CHARS = 8000;
const MAX_QUALITY_MESSAGE_CHARS = 24000;
const REPAIR_GUIDANCE =
	"Fix reported issues using the most focused and minimal change needed to make the check pass; avoid wholesale refactors or scope expansion; if passing requires major refactoring or material scope expansion, stop and discuss with the user.";
const validatorAvailabilityCache = new Map<string, boolean>();

function loadValidators(): QualityGatesPolicy {
	return loadQualityGatesPolicy(POLICY_PATH);
}

const validators = loadValidators();

export function buildExtMap(
	config: QualityGatesPolicy | Record<string, LanguageConfig>,
): Map<string, LanguageConfig> {
	const languages = "languages" in config ? config.languages : config;
	const map = new Map<string, LanguageConfig>();
	for (const langConfig of Object.values(languages)) {
		if (!Array.isArray(langConfig?.extensions)) continue;
		for (const ext of langConfig.extensions) map.set(ext, langConfig);
	}
	return map;
}

const extMap = buildExtMap(validators);
const skippedPathPatterns = [
	...validators.excludedPaths,
	...validators.immutablePaths,
];

function relativePath(root: string, filePath: string): string {
	return path.relative(root, filePath).replaceAll("\\", "/");
}

function normalizedRelativePath(root: string, filePath: string): string {
	const relative = relativePath(root, filePath);
	return process.platform === "win32" ? relative.toLowerCase() : relative;
}

function globSource(pattern: string): string {
	let source = "";
	for (let index = 0; index < pattern.length; index++) {
		const char = pattern[index];
		if (char === "*" && pattern[index + 1] === "*") {
			if (pattern[index + 2] === "/") {
				source += "(?:.*/)?";
				index += 2;
			} else {
				source += ".*";
				index += 1;
			}
		} else if (char === "*") source += "[^/]*";
		else if (char === "?") source += "[^/]";
		else source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
	}
	return source;
}

export function matchesQualityPath(
	filePath: string,
	cwd: string,
	patterns: string[],
): boolean {
	const relative = relativePath(cwd, path.resolve(cwd, filePath));
	return patterns.some((pattern) =>
		new RegExp(
			`^${globSource(pattern.replaceAll("\\", "/").replace(/^\.\//, ""))}$`,
			process.platform === "win32" ? "i" : "",
		).test(relative),
	);
}

function markerPattern(marker: string): RegExp {
	const escaped = marker.replace(/[.+^${}()|[\]\\]/g, "\\$&");
	return new RegExp(
		`^${escaped.replaceAll("*", ".*").replaceAll("?", ".")}$`,
		process.platform === "win32" ? "i" : "",
	);
}

function directoryMatchesMarker(directory: string, marker: string): boolean {
	if (!marker.includes("*") && !marker.includes("?"))
		return fs.existsSync(path.join(directory, marker));
	try {
		return fs
			.readdirSync(directory)
			.some((entry) => markerPattern(marker).test(entry));
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
	return validatorConfigs.filter(
		(validator) =>
			validator.always === true ||
			(validator.detectAny === undefined &&
				validator.detectAll === undefined) ||
			validator.detectAny?.some((filePath) =>
				fs.existsSync(path.join(projectRoot, filePath)),
			) === true ||
			validator.detectAll?.every((filePath) =>
				fs.existsSync(path.join(projectRoot, filePath)),
			) === true,
	);
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
	const insideRoot: Array<{
		original: string;
		relative: string;
		comparisonKey: string;
	}> = [];
	const outsideRoot: string[] = [];
	for (const filePath of existing) {
		const absolutePath = path.resolve(cwd, filePath);
		const relative = relativePath(root, absolutePath);
		if (relative === ".." || relative.startsWith("../"))
			outsideRoot.push(filePath);
		else
			insideRoot.push({
				original: filePath,
				relative,
				comparisonKey: normalizedRelativePath(root, absolutePath),
			});
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
	const changed = new Set(
		[...parseChangedPaths(statusResult.stdout)].map((filePath) =>
			process.platform === "win32" ? filePath.toLowerCase() : filePath,
		),
	);
	return [
		...outsideRoot,
		...insideRoot
			.filter((item) => changed.has(item.comparisonKey))
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

export function getFilePaths(event: ToolResultEvent): string[] {
	const input = event.input as {
		path?: string;
		file_path?: string;
		paths?: unknown;
	};
	if (Array.isArray(input.paths))
		return input.paths.filter(
			(item): item is string => typeof item === "string",
		);
	const filePath = input.path ?? input.file_path;
	return filePath ? [filePath] : [];
}

export function getFilePath(event: ToolResultEvent): string | undefined {
	return getFilePaths(event)[0];
}

async function isValidatorAvailable(
	pi: ExtensionAPI,
	lookup: string,
	checkBin: string,
): Promise<boolean> {
	const cacheKey = `${lookup}\0${checkBin}`;
	const cached = validatorAvailabilityCache.get(cacheKey);
	if (cached !== undefined) return cached;
	const result = await pi.exec(lookup, [checkBin], {
		timeout: VALIDATOR_LOOKUP_TIMEOUT_MS,
	});
	const available = result.code === 0;
	validatorAvailabilityCache.set(cacheKey, available);
	return available;
}

async function runDifferentialLizard(
	pi: ExtensionAPI,
	filePath: string,
	cwd: string,
	thresholds: LizardThresholds,
): Promise<string | undefined> {
	const absolutePath = path.resolve(cwd, filePath);
	const currentResult = await pi.exec("lizard", ["--csv", absolutePath], {
		cwd,
		timeout: VALIDATOR_RUN_TIMEOUT_MS,
	});
	if (currentResult.code !== 0)
		return (
			(currentResult.stdout + currentResult.stderr).trim() || "Lizard failed"
		);
	const rootResult = await pi.exec("git", ["rev-parse", "--show-toplevel"], {
		cwd,
		timeout: VALIDATOR_LOOKUP_TIMEOUT_MS,
	});
	let baselineOutput: string | undefined;
	let baselineLineMapper: ReturnType<typeof parseGitDiffLineMapper> | undefined;
	if (rootResult.code === 0 && rootResult.stdout.trim()) {
		const root = rootResult.stdout.trim();
		const relative = relativePath(root, absolutePath);
		if (relative !== ".." && !relative.startsWith("../")) {
			let headRelative = relative;
			const renameResult = await pi.exec(
				"git",
				["diff", "--name-status", "-z", "--find-renames", "HEAD"],
				{ cwd: root, timeout: VALIDATOR_LOOKUP_TIMEOUT_MS },
			);
			if (renameResult.code === 0) {
				const entries = renameResult.stdout.split("\0").filter(Boolean);
				for (let index = 0; index < entries.length; ) {
					const status = entries[index++];
					if (status.startsWith("R") || status.startsWith("C")) {
						const oldPath = entries[index++];
						const newPath = entries[index++];
						if (newPath === relative) {
							headRelative = oldPath;
							break;
						}
					} else index += 1;
				}
			}
			const headResult = await pi.exec(
				"git",
				["show", `HEAD:${headRelative}`],
				{
					cwd: root,
					timeout: VALIDATOR_LOOKUP_TIMEOUT_MS,
				},
			);
			if (headResult.code === 0) {
				const diffResult = await pi.exec(
					"git",
					["diff", "--unified=0", "--no-ext-diff", "HEAD", "--", relative],
					{ cwd: root, timeout: VALIDATOR_LOOKUP_TIMEOUT_MS },
				);
				if (diffResult.code === 0)
					baselineLineMapper = parseGitDiffLineMapper(diffResult.stdout);
				const baselineDir = fs.mkdtempSync(
					path.join(os.tmpdir(), "pi-lizard-"),
				);
				fs.chmodSync(baselineDir, 0o700);
				const baselinePath = path.join(
					baselineDir,
					`baseline${path.extname(filePath)}`,
				);
				try {
					fs.writeFileSync(baselinePath, headResult.stdout, {
						encoding: "utf8",
						flag: "wx",
						mode: 0o600,
					});
					const baselineResult = await pi.exec(
						"lizard",
						["--csv", baselinePath],
						{ cwd, timeout: VALIDATOR_RUN_TIMEOUT_MS },
					);
					if (baselineResult.code === 0) baselineOutput = baselineResult.stdout;
				} finally {
					fs.rmSync(baselineDir, { recursive: true, force: true });
				}
			}
		}
	}
	const violations = evaluateDifferentialLizard(
		parseLizardCsv(currentResult.stdout),
		baselineOutput ? parseLizardCsv(baselineOutput) : undefined,
		thresholds,
		baselineLineMapper,
	);
	return violations.length === 0
		? undefined
		: violations
				.map(
					(violation) =>
						`${violation.functionName}: ${violation.metric} ${violation.current} exceeds ${violation.limit}${violation.baseline === undefined ? " (new)" : ` (HEAD: ${violation.baseline})`}`,
				)
				.join("\n");
}

export interface ValidationIssue {
	name: string;
	output: string;
	advisory?: true;
}

interface ValidationRunOptions {
	lizardThresholds?: LizardThresholds;
	executedProjectValidators?: Set<string>;
}

function boundedText(value: string, limit: number): string {
	if (value.length <= limit) return value;
	const suffix = "\n... output truncated";
	return `${value.slice(0, limit - suffix.length)}${suffix}`;
}

export async function runAvailableValidators(
	pi: ExtensionAPI,
	langConfig: LanguageConfig,
	filePath: string,
	cwd = process.cwd(),
	options: ValidationRunOptions = {},
): Promise<ValidationIssue[]> {
	const absoluteFilePath = path.resolve(cwd, filePath);
	const projectRoot =
		findProjectRoot(absoluteFilePath, langConfig.markers ?? []) ?? cwd;
	const failures: ValidationIssue[] = [];
	for (const validator of filterValidatorsByDetection(
		langConfig.validators,
		projectRoot,
	)) {
		if ("scope" in validator && validator.scope === "project") {
			const key = `${projectRoot}\0${validator.name}`;
			if (options.executedProjectValidators?.has(key)) continue;
			options.executedProjectValidators?.add(key);
		}
		const checkBin =
			validator.check ??
			("command" in validator ? validator.command[0] : "lizard");
		const lookup = process.platform === "win32" ? "where.exe" : "which";
		if (!(await isValidatorAvailable(pi, lookup, checkBin))) continue;
		if (!("command" in validator)) {
			const output = await runDifferentialLizard(
				pi,
				absoluteFilePath,
				projectRoot,
				{
					...(options.lizardThresholds ?? LIZARD_THRESHOLDS),
					...validator.thresholds,
				},
			);
			if (output)
				failures.push({
					name: validator.name,
					output: boundedText(output, MAX_VALIDATOR_OUTPUT_CHARS),
					...(validator.advisory ? { advisory: true } : {}),
				});
			continue;
		}
		const command = buildValidatorCommand(
			validator.command,
			absoluteFilePath,
			projectRoot,
		);
		const result = await pi.exec(command[0], command.slice(1), {
			cwd: projectRoot,
			timeout: validator.timeout
				? validator.timeout * 1000
				: VALIDATOR_RUN_TIMEOUT_MS,
		});
		if (result.code !== 0 || (validator.failOnStdout && result.stdout.trim()))
			failures.push({
				name: validator.name,
				output: boundedText(
					(result.stdout + result.stderr).trim() ||
						`Validator exited with code ${result.code}`,
					MAX_VALIDATOR_OUTPUT_CHARS,
				),
			});
	}
	return failures;
}

export async function runFirstAvailableValidator(
	pi: ExtensionAPI,
	langConfig: LanguageConfig,
	filePath: string,
	cwd = process.cwd(),
): Promise<{ name: string; output: string } | undefined> {
	return (await runAvailableValidators(pi, langConfig, filePath, cwd))[0];
}

interface FileValidationIssue extends ValidationIssue {
	filePath: string;
}

function formatIssueMessage(
	heading: string,
	issues: FileValidationIssue[],
): string {
	const content = `${heading}:\n\n${issues.map((issue) => `${issue.name} reported issues in ${path.basename(issue.filePath)}:\n${issue.output}`).join("\n\n")}`;
	return boundedText(content, MAX_QUALITY_MESSAGE_CHARS);
}

function sendAdvisoryIssues(
	pi: ExtensionAPI,
	advisories: FileValidationIssue[],
	failures: FileValidationIssue[],
): void {
	if (advisories.length === 0) return;
	if (failures.length > 0) return;
	pi.sendMessage({
		customType: "quality-gates",
		content: formatIssueMessage("Quality gate advisory", advisories),
		display: true,
	});
}

interface QualityGateState {
	touchedFiles: Set<string>;
	successfulHashes: Map<string, string>;
	repairAttempts: number;
	repairQueued: boolean;
}

interface PendingFileValidation {
	filePath: string;
	absolutePath: string;
	langConfig: LanguageConfig;
	hashBefore: string | undefined;
}

interface ValidationBatch {
	failures: FileValidationIssue[];
	advisories: FileValidationIssue[];
}

const emptyValidationBatch = (): ValidationBatch => ({
	failures: [],
	advisories: [],
});

function prepareFileValidation(
	filePath: string,
	cwd: string,
	languageByExtension: Map<string, LanguageConfig>,
	state: QualityGateState,
): PendingFileValidation | undefined {
	const absolutePath = path.resolve(cwd, filePath);
	if (!fs.existsSync(absolutePath)) return undefined;
	if (matchesQualityPath(filePath, cwd, skippedPathPatterns)) return undefined;
	const langConfig = languageByExtension.get(
		path.extname(filePath).toLowerCase(),
	);
	if (!langConfig) return undefined;
	const hashBefore = contentHash(filePath, cwd);
	if (hashBefore && state.successfulHashes.get(absolutePath) === hashBefore)
		return undefined;
	return { filePath, absolutePath, langConfig, hashBefore };
}

const validatePendingFile = async (
	pi: ExtensionAPI,
	pending: PendingFileValidation,
	cwd: string,
	executedProjectValidators: Set<string>,
	state: QualityGateState,
): Promise<ValidationBatch> => {
	const issues = await runAvailableValidators(
		pi,
		pending.langConfig,
		pending.filePath,
		cwd,
		{
			lizardThresholds: validators.lizardThresholds,
			executedProjectValidators,
		},
	);
	const hashAfter = contentHash(pending.filePath, cwd);
	if (pending.hashBefore !== hashAfter) {
		if (hashAfter) state.touchedFiles.add(pending.filePath);
		return emptyValidationBatch();
	}
	const failures = issues
		.filter((issue) => !issue.advisory)
		.map((issue) => ({ filePath: pending.filePath, ...issue }));
	const advisories = issues
		.filter((issue) => issue.advisory)
		.map((issue) => ({ filePath: pending.filePath, ...issue }));
	if (failures.length === 0 && hashAfter)
		state.successfulHashes.set(pending.absolutePath, hashAfter);
	return { failures, advisories };
};

async function collectValidationBatch(
	pi: ExtensionAPI,
	languageByExtension: Map<string, LanguageConfig>,
	state: QualityGateState,
	cwd: string,
): Promise<ValidationBatch> {
	const pendingFiles = [...state.touchedFiles].sort();
	state.touchedFiles.clear();
	if (pendingFiles.length === 0) return emptyValidationBatch();
	const files = await filterNetChangedFiles(pi, pendingFiles, cwd);
	const batch = emptyValidationBatch();
	const executedProjectValidators = new Set<string>();
	for (const filePath of files) {
		const pending = prepareFileValidation(
			filePath,
			cwd,
			languageByExtension,
			state,
		);
		if (!pending) continue;
		const result = await validatePendingFile(
			pi,
			pending,
			cwd,
			executedProjectValidators,
			state,
		);
		batch.failures.push(...result.failures);
		batch.advisories.push(...result.advisories);
	}
	return batch;
}

function handleValidationBatch(
	pi: ExtensionAPI,
	batch: ValidationBatch,
	state: QualityGateState,
): void {
	sendAdvisoryIssues(pi, batch.advisories, batch.failures);
	if (batch.failures.length === 0) {
		state.repairAttempts = 0;
		return;
	}
	const content = formatIssueMessage(
		"Quality gate validation failed",
		batch.failures,
	);
	if (state.repairAttempts >= MAX_AUTO_REPAIR_ATTEMPTS) {
		state.repairAttempts = 0;
		pi.sendMessage({
			customType: "quality-gates",
			content: `${content}\n\n${REPAIR_GUIDANCE}\n\nAutomatic repair limit reached. Resolve these failures before continuing.`,
			display: true,
		});
		return;
	}
	state.repairAttempts++;
	state.repairQueued = true;
	for (const failure of batch.failures)
		state.touchedFiles.add(failure.filePath);
	pi.sendMessage(
		{
			customType: "quality-gates",
			content: `${content}\n\n${REPAIR_GUIDANCE}`,
			display: true,
		},
		{ triggerTurn: true, deliverAs: "followUp" },
	);
}

export function registerQualityGates(
	pi: ExtensionAPI,
	languageByExtension: Map<string, LanguageConfig> = extMap,
): void {
	const state: QualityGateState = {
		touchedFiles: new Set<string>(),
		successfulHashes: new Map<string, string>(),
		repairAttempts: 0,
		repairQueued: false,
	};
	pi.on("agent_start", () => {
		if (state.repairQueued) {
			state.repairQueued = false;
			return;
		}
		state.repairAttempts = 0;
	});
	pi.on("tool_result", (event: ToolResultEvent) => {
		if (
			event.toolName !== "write" &&
			event.toolName !== "edit" &&
			event.toolName !== "text_edit" &&
			event.toolName !== "structured_edit"
		)
			return;
		for (const filePath of getFilePaths(event))
			if (languageByExtension.has(path.extname(filePath).toLowerCase()))
				state.touchedFiles.add(filePath);
	});
	pi.on("agent_settled", async (_event, ctx) => {
		const cwd = ctx?.cwd ?? process.cwd();
		const batch = await collectValidationBatch(
			pi,
			languageByExtension,
			state,
			cwd,
		);
		handleValidationBatch(pi, batch, state);
	});
}

export { POLICY_PATH, REPAIR_GUIDANCE };

export default function (pi: ExtensionAPI) {
	registerQualityGates(pi);
}

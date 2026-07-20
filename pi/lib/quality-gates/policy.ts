import * as fs from "node:fs";

export interface LizardThresholdsConfig {
	ccn: number;
	parameters: number;
	length: number;
}

export interface LizardValidatorConfig {
	name: string;
	kind: "lizard";
	check: "lizard";
	always: true;
	advisory?: true;
	thresholds?: Partial<LizardThresholdsConfig>;
	timeout?: number;
}

export interface CommandValidatorConfig {
	name: string;
	command: string[];
	check?: string;
	detectAny?: string[];
	detectAll?: string[];
	always?: true;
	failOnStdout?: true;
	scope?: "project";
	timeout?: number;
}

export type ValidatorConfig = LizardValidatorConfig | CommandValidatorConfig;

export interface LanguageConfig {
	extensions: string[];
	markers?: string[];
	validators: ValidatorConfig[];
}

export interface QualityGatesPolicy {
	version: 1;
	lizardThresholds: LizardThresholdsConfig;
	excludedPaths: string[];
	immutablePaths: string[];
	languages: Record<string, LanguageConfig>;
}

function isStringArray(value: unknown): value is string[] {
	return (
		Array.isArray(value) && value.every((item) => typeof item === "string")
	);
}

const trueField = (value: unknown): boolean => value === true;

const numberField = (value: unknown): number | undefined =>
	typeof value === "number" && Number.isFinite(value) && value >= 0
		? value
		: undefined;

const hasInvalidTimeout = (validator: Record<string, unknown>): boolean =>
	validator.timeout !== undefined &&
	numberField(validator.timeout) === undefined;

const thresholdMetrics = ["ccn", "parameters", "length"] as const;
const thresholdMetricNames = new Set<string>(thresholdMetrics);

const parseThresholdValue = (
	thresholds: Record<string, unknown>,
	metric: keyof LizardThresholdsConfig,
	requireAll: boolean,
): number | null | undefined => {
	if (thresholds[metric] === undefined) return requireAll ? null : undefined;
	return numberField(thresholds[metric]) ?? null;
};

const buildThresholds = (
	ccn: number | undefined,
	parameters: number | undefined,
	length: number | undefined,
): Partial<LizardThresholdsConfig> => {
	const parsed: Partial<LizardThresholdsConfig> = {};
	if (ccn !== undefined) parsed.ccn = ccn;
	if (parameters !== undefined) parsed.parameters = parameters;
	if (length !== undefined) parsed.length = length;
	return parsed;
};

const parseThresholds = (
	value: unknown,
	requireAll: boolean,
): Partial<LizardThresholdsConfig> | undefined => {
	if (!value || typeof value !== "object") return undefined;
	const thresholds = value as Record<string, unknown>;
	const keys = Object.keys(thresholds);
	if (keys.length === 0) return undefined;
	if (keys.some((key) => !thresholdMetricNames.has(key))) return undefined;
	const ccn = parseThresholdValue(thresholds, "ccn", requireAll);
	const parameters = parseThresholdValue(thresholds, "parameters", requireAll);
	const length = parseThresholdValue(thresholds, "length", requireAll);
	if ([ccn, parameters, length].includes(null)) return undefined;
	return buildThresholds(
		ccn as number | undefined,
		parameters as number | undefined,
		length as number | undefined,
	);
};

const hasInvalidLizardMetadata = (
	validator: Record<string, unknown>,
): boolean => {
	if (validator.check !== "lizard") return true;
	if (!trueField(validator.always)) return true;
	if (validator.detectAny !== undefined) return true;
	if (validator.detectAll !== undefined) return true;
	return validator.advisory !== undefined && !trueField(validator.advisory);
};

const buildLizardValidator = (
	validator: Record<string, unknown>,
	thresholds: Partial<LizardThresholdsConfig> | undefined,
): LizardValidatorConfig => {
	const parsed: LizardValidatorConfig = {
		name: validator.name as string,
		kind: "lizard",
		check: "lizard",
		always: true,
	};
	if (trueField(validator.advisory)) parsed.advisory = true;
	if (thresholds) parsed.thresholds = thresholds;
	const timeout = numberField(validator.timeout);
	if (timeout !== undefined) parsed.timeout = timeout;
	return parsed;
};

const parseLizardValidator = (
	validator: Record<string, unknown>,
): LizardValidatorConfig | undefined => {
	if (hasInvalidLizardMetadata(validator)) return undefined;
	const thresholds =
		validator.thresholds === undefined
			? undefined
			: parseThresholds(validator.thresholds, false);
	if (validator.thresholds !== undefined && !thresholds) return undefined;
	return buildLizardValidator(validator, thresholds);
};

const parseDetectionField = (value: unknown): string[] | null | undefined => {
	if (value === undefined) return undefined;
	if (!isStringArray(value)) return null;
	return value.length > 0 ? value : null;
};

const hasInvalidCommandScope = (validator: Record<string, unknown>): boolean =>
	validator.scope !== undefined && validator.scope !== "project";

const hasInvalidCommandMetadata = (
	validator: Record<string, unknown>,
): boolean => {
	if (validator.check !== undefined && typeof validator.check !== "string")
		return true;
	if (validator.always !== undefined && !trueField(validator.always))
		return true;
	if (
		validator.failOnStdout !== undefined &&
		!trueField(validator.failOnStdout)
	)
		return true;
	if (hasInvalidCommandScope(validator)) return true;
	return false;
};

const buildCommandValidator = (
	validator: Record<string, unknown>,
	detectAny: string[] | undefined,
	detectAll: string[] | undefined,
): CommandValidatorConfig => {
	const parsed: CommandValidatorConfig = {
		name: validator.name as string,
		command: validator.command as string[],
	};
	if (typeof validator.check === "string") parsed.check = validator.check;
	if (detectAny) parsed.detectAny = detectAny;
	if (detectAll) parsed.detectAll = detectAll;
	if (trueField(validator.always)) parsed.always = true;
	if (trueField(validator.failOnStdout)) parsed.failOnStdout = true;
	if (validator.scope === "project") parsed.scope = "project";
	const timeout = numberField(validator.timeout);
	if (timeout !== undefined) parsed.timeout = timeout;
	return parsed;
};

const parseCommandValidator = (
	validator: Record<string, unknown>,
): CommandValidatorConfig | undefined => {
	if (!isStringArray(validator.command)) return undefined;
	if (hasInvalidCommandMetadata(validator)) return undefined;
	const detectAny = parseDetectionField(validator.detectAny);
	const detectAll = parseDetectionField(validator.detectAll);
	if (detectAny === null) return undefined;
	if (detectAll === null) return undefined;
	const selectionModes =
		Number(trueField(validator.always)) +
		Number(detectAny !== undefined) +
		Number(detectAll !== undefined);
	if (selectionModes !== 1) return undefined;
	return buildCommandValidator(validator, detectAny, detectAll);
};

const parseValidator = (value: unknown): ValidatorConfig | undefined => {
	if (!value || typeof value !== "object") return undefined;
	const validator = value as Record<string, unknown>;
	if (typeof validator.name !== "string") return undefined;
	if (hasInvalidTimeout(validator)) return undefined;
	return validator.kind === "lizard"
		? parseLizardValidator(validator)
		: parseCommandValidator(validator);
};

export function parseQualityGatesPolicy(value: unknown): QualityGatesPolicy {
	if (!value || typeof value !== "object")
		throw new Error("Policy must be an object");
	const policy = value as Record<string, unknown>;
	const lizardThresholds = parseThresholds(policy.lizardThresholds, true);
	if (
		policy.version !== 1 ||
		!policy.languages ||
		typeof policy.languages !== "object" ||
		!lizardThresholds ||
		!isStringArray(policy.excludedPaths) ||
		!isStringArray(policy.immutablePaths)
	)
		throw new Error(
			"Policy must contain version 1, languages, Lizard thresholds, and path exclusions",
		);
	const languages: Record<string, LanguageConfig> = {};
	for (const [name, value] of Object.entries(policy.languages)) {
		if (!value || typeof value !== "object")
			throw new Error(`Invalid language: ${name}`);
		const language = value as Record<string, unknown>;
		if (
			!isStringArray(language.extensions) ||
			!Array.isArray(language.validators)
		)
			throw new Error(`Invalid language: ${name}`);
		if (language.markers !== undefined && !isStringArray(language.markers))
			throw new Error(`Invalid markers: ${name}`);
		const validators = language.validators.map(parseValidator);
		if (validators.some((validator) => !validator))
			throw new Error(`Invalid validator: ${name}`);
		languages[name] = {
			extensions: language.extensions,
			...(isStringArray(language.markers) ? { markers: language.markers } : {}),
			validators: validators as ValidatorConfig[],
		};
	}
	return {
		version: 1,
		lizardThresholds: lizardThresholds as LizardThresholdsConfig,
		excludedPaths: policy.excludedPaths,
		immutablePaths: policy.immutablePaths,
		languages,
	};
}

export function loadQualityGatesPolicy(policyPath: string): QualityGatesPolicy {
	const content = fs.readFileSync(policyPath, "utf-8");
	return parseQualityGatesPolicy(JSON.parse(content) as unknown);
}

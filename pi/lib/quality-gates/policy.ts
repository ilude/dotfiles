import * as fs from "node:fs";

export interface LizardValidatorConfig {
	name: string;
	kind: "lizard";
	check: "lizard";
	always: true;
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

const parseLizardValidator = (
	validator: Record<string, unknown>,
): LizardValidatorConfig | undefined => {
	if (validator.check !== "lizard") return undefined;
	if (!trueField(validator.always)) return undefined;
	if (validator.detectAny !== undefined) return undefined;
	if (validator.detectAll !== undefined) return undefined;
	const parsed: LizardValidatorConfig = {
		name: validator.name as string,
		kind: "lizard",
		check: "lizard",
		always: true,
	};
	const timeout = numberField(validator.timeout);
	if (timeout !== undefined) parsed.timeout = timeout;
	return parsed;
};

const parseDetectionField = (value: unknown): string[] | null | undefined => {
	if (value === undefined) return undefined;
	if (!isStringArray(value)) return null;
	return value.length > 0 ? value : null;
};

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
	if (
		policy.version !== 1 ||
		!policy.languages ||
		typeof policy.languages !== "object"
	)
		throw new Error("Policy must contain version 1 and languages");
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
	return { version: 1, languages };
}

export function loadQualityGatesPolicy(policyPath: string): QualityGatesPolicy {
	const content = fs.readFileSync(policyPath, "utf-8");
	return parseQualityGatesPolicy(JSON.parse(content) as unknown);
}

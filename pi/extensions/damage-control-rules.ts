import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { DamageControlHealth } from "../lib/damage-control-health.js";
import { parseYamlMini } from "../lib/yaml-mini.js";

export interface DangerousCommand {
	pattern: string;
	reason: string;
	action?: "block" | "ask";
	regex?: string;
	platforms?: string[];
	exclude_platforms?: string[];
	tools?: string[];
}

export interface AstAnalysisConfig {
	enabled: boolean;
	timeoutMs?: number;
	safeCommands?: string[];
	dangerousCommands?: string[];
}

export interface DamageControlRules {
	dangerous_commands: DangerousCommand[];
	astAnalysis?: AstAnalysisConfig;
	zero_access_paths: string[];
	zero_access_exclusions: string[];
	read_only_paths: string[];
	no_delete_paths: string[];
	write_confirm_paths: string[];
	read_confirm_paths: string[];
	content_scan_paths: string[];
	injection_patterns: string[];
	domain_constraints?: unknown;
}

export interface LoadedRules {
	rules: DamageControlRules;
	health: DamageControlHealth;
}

type YamlRecord = Record<string, unknown>;

function isRecord(value: unknown): value is YamlRecord {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringField(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function stringArrayField(value: unknown): string[] | undefined {
	if (value === undefined) return undefined;
	if (
		!Array.isArray(value) ||
		value.some((entry) => typeof entry !== "string")
	) {
		return undefined;
	}
	return value as string[];
}

function emptyRules(): DamageControlRules {
	return {
		dangerous_commands: [],
		zero_access_paths: [],
		zero_access_exclusions: [],
		read_only_paths: [],
		no_delete_paths: [],
		write_confirm_paths: [],
		read_confirm_paths: [],
		content_scan_paths: [],
		injection_patterns: [],
		astAnalysis: { enabled: false },
	};
}

const PYTHON_ONLY_REGEX_FEATURE = /\(\?P[<=]|\\[AZz]|(?:\*\+|\?\+|\+\+)/;

function validateRegex(pattern: string, errors: string[], label: string): void {
	if (PYTHON_ONLY_REGEX_FEATURE.test(pattern)) {
		errors.push(`${label} uses Python-only regex syntax`);
		return;
	}
	try {
		compileCommandRegex(pattern);
	} catch (err) {
		errors.push(
			`${label} is invalid under ECMAScript regex: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}

export function compileCommandRegex(pattern: string): RegExp {
	if (pattern.startsWith("(?i)")) return new RegExp(pattern.slice(4), "i");
	return new RegExp(pattern);
}

export function validateDamageControlRules(value: unknown): string[] {
	const errors: string[] = [];
	if (!isRecord(value)) return ["policy root must be a mapping"];

	const allowedRootKeys = new Set([
		"astAnalysis",
		"dangerous_commands",
		"zero_access_paths",
		"zero_access_exclusions",
		"read_only_paths",
		"no_delete_paths",
		"write_confirm_paths",
		"read_confirm_paths",
		"content_scan_paths",
		"injection_patterns",
	]);
	for (const key of Object.keys(value))
		if (!allowedRootKeys.has(key)) errors.push(`unknown policy field: ${key}`);

	for (const key of [
		"dangerous_commands",
		"zero_access_paths",
		"no_delete_paths",
	]) {
		if (!Array.isArray(value[key])) errors.push(`${key} must be an array`);
	}

	const commands = value.dangerous_commands;
	if (Array.isArray(commands)) {
		commands.forEach((entry, idx) => {
			if (!isRecord(entry)) {
				errors.push(`dangerous_commands[${idx}] must be a mapping`);
				return;
			}
			const allowedCommandKeys = new Set([
				"pattern",
				"regex",
				"reason",
				"action",
				"platforms",
				"exclude_platforms",
				"tools",
			]);
			for (const key of Object.keys(entry))
				if (!allowedCommandKeys.has(key))
					errors.push(`dangerous_commands[${idx}] unknown field: ${key}`);
			if (!stringField(entry.pattern)) {
				errors.push(`dangerous_commands[${idx}].pattern is required`);
			}
			if (!stringField(entry.reason)) {
				errors.push(`dangerous_commands[${idx}].reason is required`);
			}
			if (
				entry.action !== undefined &&
				entry.action !== "ask" &&
				entry.action !== "block"
			) {
				errors.push(`dangerous_commands[${idx}].action must be ask or block`);
			}
			for (const field of [
				"platforms",
				"exclude_platforms",
				"tools",
			] as const) {
				if (entry[field] !== undefined && !stringArrayField(entry[field])) {
					errors.push(
						`dangerous_commands[${idx}].${field} must be an array of strings`,
					);
				}
			}
			if (entry.regex !== undefined) {
				const regex = stringField(entry.regex);
				if (!regex) {
					errors.push(`dangerous_commands[${idx}].regex must be a string`);
				} else {
					validateRegex(regex, errors, `dangerous_commands[${idx}].regex`);
				}
			}
		});
	}

	for (const key of [
		"zero_access_paths",
		"zero_access_exclusions",
		"read_only_paths",
		"no_delete_paths",
		"write_confirm_paths",
		"read_confirm_paths",
		"content_scan_paths",
		"injection_patterns",
	] as const) {
		const section = value[key];
		if (
			section !== undefined &&
			(!Array.isArray(section) ||
				section.some((entry) => typeof entry !== "string"))
		) {
			errors.push(`${key} must be an array of strings`);
		}
	}

	const astAnalysis = value.astAnalysis;
	if (astAnalysis !== undefined) {
		if (!isRecord(astAnalysis)) {
			errors.push("astAnalysis must be a mapping");
		} else {
			const allowedAstKeys = new Set([
				"enabled",
				"timeoutMs",
				"safeCommands",
				"dangerousCommands",
			]);
			for (const key of Object.keys(astAnalysis))
				if (!allowedAstKeys.has(key))
					errors.push(`astAnalysis unknown field: ${key}`);
			if (
				astAnalysis.enabled === undefined ||
				booleanField(astAnalysis.enabled) === undefined
			)
				errors.push("astAnalysis.enabled must be true or false");
			if (
				astAnalysis.timeoutMs !== undefined &&
				numberField(astAnalysis.timeoutMs) === undefined
			)
				errors.push("astAnalysis.timeoutMs must be a non-negative number");
			for (const field of ["safeCommands", "dangerousCommands"] as const) {
				if (
					astAnalysis[field] !== undefined &&
					!stringArrayField(astAnalysis[field])
				)
					errors.push(`astAnalysis.${field} must be an array of strings`);
			}
		}
	}

	return errors;
}

export function parseDamageControlRules(content: string): DamageControlRules {
	const parsed = parseYamlMini(content);
	const errors = validateDamageControlRules(parsed);
	if (errors.length > 0) throw new Error(errors.join("; "));
	const root = parsed as YamlRecord;
	return {
		...emptyRules(),
		dangerous_commands: root.dangerous_commands as DangerousCommand[],
		astAnalysis: astAnalysisConfig(root.astAnalysis),
		zero_access_paths: root.zero_access_paths as string[],
		zero_access_exclusions: stringList(root, "zero_access_exclusions"),
		read_only_paths: stringList(root, "read_only_paths"),
		no_delete_paths: root.no_delete_paths as string[],
		write_confirm_paths: stringList(root, "write_confirm_paths"),
		read_confirm_paths: stringList(root, "read_confirm_paths"),
		content_scan_paths: stringList(root, "content_scan_paths"),
		injection_patterns: stringList(root, "injection_patterns"),
		domain_constraints: root.domain_constraints,
	};
}

function stringList(root: YamlRecord, key: string): string[] {
	const value = root[key];
	return Array.isArray(value) &&
		value.every((entry) => typeof entry === "string")
		? (value as string[])
		: [];
}

function booleanField(value: unknown): boolean | undefined {
	if (typeof value === "boolean") return value;
	if (value === "true") return true;
	if (value === "false") return false;
	return undefined;
}

function numberField(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value) && value >= 0)
		return value;
	if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
	return undefined;
}

function astAnalysisConfig(value: unknown): AstAnalysisConfig | undefined {
	if (!isRecord(value)) return undefined;
	return {
		enabled: booleanField(value.enabled) ?? false,
		timeoutMs: numberField(value.timeoutMs),
		safeCommands: stringArrayField(value.safeCommands),
		dangerousCommands: stringArrayField(value.dangerousCommands),
	};
}

function summarizeRules(
	rules: DamageControlRules,
	ruleSource?: string,
): DamageControlHealth {
	return {
		status: "active",
		ruleSource,
		commandRules: rules.dangerous_commands.length,
		zeroAccessRules: rules.zero_access_paths.length,
		noDeleteRules: rules.no_delete_paths.length,
	};
}

function failedHealth(error: string): DamageControlHealth {
	return {
		status: "failed",
		error,
		commandRules: 0,
		zeroAccessRules: 0,
		noDeleteRules: 0,
	};
}

export default function damageControlRulesModule(): void {
	// No-op default keeps Pi top-level extension auto-discovery from failing.
}

export function loadRules(): LoadedRules {
	const extensionDir = path.dirname(fileURLToPath(import.meta.url));
	const policyPath =
		process.env.PI_DAMAGE_CONTROL_POLICY_PATH ??
		path.join(extensionDir, "..", "damage-control-rules.yaml");
	try {
		const content = fs.readFileSync(policyPath, "utf-8");
		const rules = parseDamageControlRules(content);
		return { rules, health: summarizeRules(rules, policyPath) };
	} catch (err) {
		return {
			rules: emptyRules(),
			health: failedHealth(
				`${policyPath}: ${err instanceof Error ? err.message : String(err)}`,
			),
		};
	}
}

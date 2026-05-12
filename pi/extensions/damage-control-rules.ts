import * as fs from "node:fs";
import * as os from "node:os";
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

export interface DamageControlRules {
	dangerous_commands: DangerousCommand[];
	zero_access_paths: string[];
	no_delete_paths: string[];
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

export function validateDamageControlRules(value: unknown): string[] {
	const errors: string[] = [];
	if (!isRecord(value)) return ["policy root must be a mapping"];

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
					try {
						new RegExp(regex);
					} catch {
						errors.push(`dangerous_commands[${idx}].regex is invalid`);
					}
				}
			}
		});
	}

	for (const key of ["zero_access_paths", "no_delete_paths"] as const) {
		const section = value[key];
		if (
			Array.isArray(section) &&
			section.some((entry) => typeof entry !== "string")
		) {
			errors.push(`${key} must contain only strings`);
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
		dangerous_commands: root.dangerous_commands as DangerousCommand[],
		zero_access_paths: root.zero_access_paths as string[],
		no_delete_paths: root.no_delete_paths as string[],
		domain_constraints: root.domain_constraints,
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

function emptyRules(): DamageControlRules {
	return { dangerous_commands: [], zero_access_paths: [], no_delete_paths: [] };
}

export default function damageControlRulesModule(): void {
	// No-op default keeps Pi top-level extension auto-discovery from failing.
}

export function loadRules(cwd: string = process.cwd()): LoadedRules {
	const extensionDir = path.dirname(fileURLToPath(import.meta.url));
	const candidates = [
		path.join(cwd, ".pi", "damage-control-rules.yaml"),
		path.join(extensionDir, "..", "damage-control-rules.yaml"),
		path.join(os.homedir(), ".pi", "agent", "damage-control-rules.yaml"),
	];
	const errors: string[] = [];
	for (const candidate of candidates) {
		try {
			const content = fs.readFileSync(candidate, "utf-8");
			const rules = parseDamageControlRules(content);
			return { rules, health: summarizeRules(rules, candidate) };
		} catch (err) {
			errors.push(
				`${candidate}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}
	return {
		rules: emptyRules(),
		health: {
			status: "failed",
			error: `No damage-control rules loaded. Tried: ${errors.join("; ")}`,
			commandRules: 0,
			zeroAccessRules: 0,
			noDeleteRules: 0,
		},
	};
}

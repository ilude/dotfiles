import * as fs from "node:fs/promises";
import * as path from "node:path";

import { getOperatorStateDir } from "./operator-state.ts";

export const BEDROCK_COST_LEDGER_SCHEMA_VERSION = 1 as const;
export const BEDROCK_COST_LEDGER_FILE = "bedrock-costs.json";

export interface BedrockCostLedgerOptions {
	filePath?: string;
	operatorDir?: string;
}

export interface BedrockUsageCost {
	total?: number;
}

export interface BedrockUsageInput {
	input?: number;
	output?: number;
	cacheRead?: number;
	cacheWrite?: number;
	cost?: BedrockUsageCost;
}

export interface BedrockUsageRecordInput {
	provider?: string;
	model: string;
	usage: BedrockUsageInput;
	date?: Date;
}

export interface NormalizedBedrockUsageRecord {
	month: string;
	provider: string;
	model: string;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	costTotal: number;
	requestCount: number;
	unpricedRequestCount: number;
}

export interface BedrockModelUsageTotals {
	provider: string;
	model: string;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	costTotal: number;
	requestCount: number;
	unpricedRequestCount: number;
}

export interface BedrockCostMonth {
	models: Record<string, BedrockModelUsageTotals>;
}

export interface BedrockCostLedger {
	schemaVersion: typeof BEDROCK_COST_LEDGER_SCHEMA_VERSION;
	months: Record<string, BedrockCostMonth>;
}

export interface BedrockMonthSummary {
	month: string;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	costTotal: number;
	requestCount: number;
	unpricedRequestCount: number;
	models: BedrockModelUsageTotals[];
}

export function currentMonthKey(date: Date = new Date()): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	return `${year}-${month}`;
}

export function getBedrockCostLedgerPath(
	options: BedrockCostLedgerOptions = {},
): string {
	if (options.filePath) return options.filePath;
	return path.join(
		options.operatorDir ?? getOperatorStateDir(),
		BEDROCK_COST_LEDGER_FILE,
	);
}

export function normalizeUsageRecord(
	record: BedrockUsageRecordInput,
): NormalizedBedrockUsageRecord {
	if (!record.model) throw new Error("Bedrock usage record requires model");
	const provider = record.provider || "amazon-bedrock";
	const inputTokens = finiteNumber(record.usage.input);
	const outputTokens = finiteNumber(record.usage.output);
	const cacheReadTokens = finiteNumber(record.usage.cacheRead);
	const cacheWriteTokens = finiteNumber(record.usage.cacheWrite);
	const costTotal = finiteNumber(record.usage.cost?.total);
	const hasTokens =
		inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens > 0;
	const unpricedRequestCount = hasTokens && costTotal <= 0 ? 1 : 0;

	return {
		month: currentMonthKey(record.date),
		provider,
		model: record.model,
		inputTokens,
		outputTokens,
		cacheReadTokens,
		cacheWriteTokens,
		costTotal,
		requestCount: 1,
		unpricedRequestCount,
	};
}

export function summarizeMonth(
	ledger: BedrockCostLedger,
	month: string = currentMonthKey(),
): BedrockMonthSummary {
	const models = Object.values(ledger.months[month]?.models ?? {}).sort(
		(a, b) =>
			modelUsageKey(a.provider, a.model).localeCompare(
				modelUsageKey(b.provider, b.model),
			),
	);
	const summary: BedrockMonthSummary = {
		month,
		inputTokens: 0,
		outputTokens: 0,
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
		costTotal: 0,
		requestCount: 0,
		unpricedRequestCount: 0,
		models,
	};
	for (const model of models) {
		summary.inputTokens += model.inputTokens;
		summary.outputTokens += model.outputTokens;
		summary.cacheReadTokens += model.cacheReadTokens;
		summary.cacheWriteTokens += model.cacheWriteTokens;
		summary.costTotal += model.costTotal;
		summary.requestCount += model.requestCount;
		summary.unpricedRequestCount += model.unpricedRequestCount;
	}
	return summary;
}

export function formatMoney(amount: number): string {
	return `$${finiteNumber(amount).toFixed(4)}`;
}

export function formatTokenCount(tokens: number): string {
	return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
		finiteNumber(tokens),
	);
}

export async function readBedrockCostLedger(
	options: BedrockCostLedgerOptions = {},
): Promise<BedrockCostLedger> {
	const filePath = getBedrockCostLedgerPath(options);
	let raw: string;
	try {
		raw = await fs.readFile(filePath, "utf-8");
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return emptyLedger();
		throw error;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw new Error(
			`Malformed Bedrock cost ledger JSON at ${filePath}: ${errorMessage(error)}`,
		);
	}
	return validateLedger(parsed, filePath);
}

export async function recordBedrockUsage(
	record: BedrockUsageRecordInput,
	options: BedrockCostLedgerOptions = {},
): Promise<BedrockCostLedger> {
	const filePath = getBedrockCostLedgerPath(options);
	const ledger = await readBedrockCostLedger(options);
	const normalized = normalizeUsageRecord(record);
	const month = ledger.months[normalized.month] ?? { models: {} };
	ledger.months[normalized.month] = month;
	const key = modelUsageKey(normalized.provider, normalized.model);
	const totals =
		month.models[key] ??
		emptyModelTotals(normalized.provider, normalized.model);
	month.models[key] = totals;
	addUsage(totals, normalized);
	await writeLedgerAtomic(filePath, ledger);
	return ledger;
}

export async function getCurrentBedrockMonthSummary(
	options: BedrockCostLedgerOptions = {},
	date: Date = new Date(),
): Promise<BedrockMonthSummary> {
	return summarizeMonth(
		await readBedrockCostLedger(options),
		currentMonthKey(date),
	);
}

function emptyLedger(): BedrockCostLedger {
	return { schemaVersion: BEDROCK_COST_LEDGER_SCHEMA_VERSION, months: {} };
}

function emptyModelTotals(
	provider: string,
	model: string,
): BedrockModelUsageTotals {
	return {
		provider,
		model,
		inputTokens: 0,
		outputTokens: 0,
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
		costTotal: 0,
		requestCount: 0,
		unpricedRequestCount: 0,
	};
}

function addUsage(
	totals: BedrockModelUsageTotals,
	usage: NormalizedBedrockUsageRecord,
): void {
	totals.inputTokens += usage.inputTokens;
	totals.outputTokens += usage.outputTokens;
	totals.cacheReadTokens += usage.cacheReadTokens;
	totals.cacheWriteTokens += usage.cacheWriteTokens;
	totals.costTotal += usage.costTotal;
	totals.requestCount += usage.requestCount;
	totals.unpricedRequestCount += usage.unpricedRequestCount;
}

function modelUsageKey(provider: string, model: string): string {
	return `${provider}/${model}`;
}

async function writeLedgerAtomic(
	filePath: string,
	ledger: BedrockCostLedger,
): Promise<void> {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	const tmpPath = path.join(
		path.dirname(filePath),
		`.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
	);
	await fs.writeFile(tmpPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf-8");
	await fs.rename(tmpPath, filePath);
}

function validateLedger(value: unknown, filePath: string): BedrockCostLedger {
	if (!isRecord(value)) throw invalidLedger(filePath, "root must be an object");
	if (value.schemaVersion !== BEDROCK_COST_LEDGER_SCHEMA_VERSION) {
		throw invalidLedger(filePath, "schemaVersion must be 1");
	}
	if (!isRecord(value.months))
		throw invalidLedger(filePath, "months must be an object");
	const months: Record<string, BedrockCostMonth> = {};
	for (const [monthKey, month] of Object.entries(value.months)) {
		if (!/^\d{4}-\d{2}$/.test(monthKey)) {
			throw invalidLedger(filePath, `invalid month key ${monthKey}`);
		}
		if (!isRecord(month) || !isRecord(month.models)) {
			throw invalidLedger(
				filePath,
				`month ${monthKey} models must be an object`,
			);
		}
		const models: Record<string, BedrockModelUsageTotals> = {};
		for (const [key, model] of Object.entries(month.models)) {
			models[key] = validateModelTotals(model, filePath, monthKey, key);
		}
		months[monthKey] = { models };
	}
	return { schemaVersion: BEDROCK_COST_LEDGER_SCHEMA_VERSION, months };
}

function validateModelTotals(
	value: unknown,
	filePath: string,
	monthKey: string,
	modelKey: string,
): BedrockModelUsageTotals {
	if (!isRecord(value)) {
		throw invalidLedger(filePath, `${monthKey} ${modelKey} must be an object`);
	}
	if (typeof value.provider !== "string" || value.provider.length === 0) {
		throw invalidLedger(
			filePath,
			`${monthKey} ${modelKey} provider must be a string`,
		);
	}
	if (typeof value.model !== "string" || value.model.length === 0) {
		throw invalidLedger(
			filePath,
			`${monthKey} ${modelKey} model must be a string`,
		);
	}
	return {
		provider: value.provider,
		model: value.model,
		inputTokens: requireNumber(
			value.inputTokens,
			filePath,
			monthKey,
			modelKey,
			"inputTokens",
		),
		outputTokens: requireNumber(
			value.outputTokens,
			filePath,
			monthKey,
			modelKey,
			"outputTokens",
		),
		cacheReadTokens: requireNumber(
			value.cacheReadTokens,
			filePath,
			monthKey,
			modelKey,
			"cacheReadTokens",
		),
		cacheWriteTokens: requireNumber(
			value.cacheWriteTokens,
			filePath,
			monthKey,
			modelKey,
			"cacheWriteTokens",
		),
		costTotal: requireNumber(
			value.costTotal,
			filePath,
			monthKey,
			modelKey,
			"costTotal",
		),
		requestCount: requireNumber(
			value.requestCount,
			filePath,
			monthKey,
			modelKey,
			"requestCount",
		),
		unpricedRequestCount: requireNumber(
			value.unpricedRequestCount,
			filePath,
			monthKey,
			modelKey,
			"unpricedRequestCount",
		),
	};
}

function requireNumber(
	value: unknown,
	filePath: string,
	monthKey: string,
	modelKey: string,
	field: string,
): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		throw invalidLedger(
			filePath,
			`${monthKey} ${modelKey} ${field} must be a non-negative number`,
		);
	}
	return value;
}

function finiteNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? value
		: 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalidLedger(filePath: string, reason: string): Error {
	return new Error(`Invalid Bedrock cost ledger at ${filePath}: ${reason}`);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

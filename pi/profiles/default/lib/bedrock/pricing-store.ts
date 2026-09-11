import * as fs from "node:fs";
import * as path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { lock } from "proper-lockfile";
import { writeJsonObjectAtomic } from "../settings-file.ts";

export const BEDROCK_PRICING_FILE = "bedrock-pricing.json";
export type PricingRates = { input: number; output: number; cacheRead: number; cacheWrite: number };
export type PricingEntry = PricingRates & { source: string; date: string };
export type PricingTable = { schemaVersion: 1; updatedAt: string; entries: Record<string, PricingEntry> };

export const pricingTablePath = (profile = getAgentDir()) => path.join(profile, BEDROCK_PRICING_FILE);

function validRate(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function validDate(value: unknown): value is string {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const parsed = Date.parse(`${value}T00:00:00Z`);
	return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}
export function isPricingEntry(value: unknown): value is PricingEntry {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const entry = value as Record<string, unknown>;
	let sourceOk = false;
	if (typeof entry.source === "string") {
		try {
			const url = new URL(entry.source);
			sourceOk = url.protocol === "https:" && (url.hostname === "aws.amazon.com" || url.hostname.endsWith(".aws.amazon.com") || url.hostname.endsWith(".amazonaws.com"));
		} catch { sourceOk = false; }
	}
	return validRate(entry.input) && validRate(entry.output) && validRate(entry.cacheRead) && validRate(entry.cacheWrite) && sourceOk && validDate(entry.date);
}
function parseTable(value: unknown, file: string): PricingTable {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid Bedrock pricing table at ${file}`);
	const table = value as Record<string, unknown>;
	if (table.schemaVersion !== 1 || typeof table.updatedAt !== "string" || !table.entries || typeof table.entries !== "object" || Array.isArray(table.entries)) throw new Error(`Invalid Bedrock pricing table at ${file}`);
	const entries: Record<string, PricingEntry> = {};
	for (const [target, entry] of Object.entries(table.entries as Record<string, unknown>)) {
		if (!target || !isPricingEntry(entry)) throw new Error(`Invalid Bedrock pricing entry at ${file}`);
		entries[target] = entry;
	}
	return { schemaVersion: 1, updatedAt: table.updatedAt, entries };
}

let cachedPath: string | undefined;
let cachedEntries: Record<string, PricingEntry> = {};
let loaded = false;

export function loadPricingEntries(profile = getAgentDir()): Readonly<Record<string, PricingEntry>> {
	const file = pricingTablePath(profile);
	if (loaded && cachedPath === file) return cachedEntries;
	cachedPath = file;
	loaded = true;
	try { cachedEntries = parseTable(JSON.parse(fs.readFileSync(file, "utf8")), file).entries; }
	catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") cachedEntries = {};
		else cachedEntries = {};
	}
	return cachedEntries;
}

export async function mergePricingEntries(entries: Record<string, PricingEntry>, profile = getAgentDir()): Promise<void> {
	if (!Object.entries(entries).every(([target, entry]) => target.length > 0 && isPricingEntry(entry))) throw new Error("Invalid Bedrock pricing entries");
	if (!Object.keys(entries).length) return;
	const file = pricingTablePath(profile);
	await fs.promises.mkdir(path.dirname(file), { recursive: true });
	const release = await lock(`${file}.lock`, { realpath: false, stale: 10_000, retries: { retries: 400, minTimeout: 25, maxTimeout: 25 } });
	try {
		let current: PricingTable = { schemaVersion: 1, updatedAt: new Date(0).toISOString(), entries: {} };
		try { current = parseTable(JSON.parse(await fs.promises.readFile(file, "utf8")), file); }
		catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
		const merged = { ...current.entries, ...entries };
		await writeJsonObjectAtomic(file, { schemaVersion: 1, updatedAt: new Date().toISOString(), entries: merged });
		cachedPath = file;
		cachedEntries = merged;
		loaded = true;
	} finally { await release(); }
}

export function clearPricingEntriesCache(): void {
	loaded = false;
	cachedPath = undefined;
	cachedEntries = {};
}

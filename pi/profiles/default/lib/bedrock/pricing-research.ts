import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { loadDefinitions } from "../subagents/definitions.ts";
import { getSubagentRuntime } from "../subagents/runtime.ts";
import { resolveSkills } from "../subagents/options.ts";
import { isPricingEntry, mergePricingEntries, type PricingEntry } from "./pricing-store.ts";

export interface PricingResearchRequest {
	targetIds: string[];
	cwd: string;
	profile: string;
	origin: string;
}
export type PricingResearchRunner = (request: PricingResearchRequest, signal?: AbortSignal) => Promise<unknown>;

class PricingResearchDeferredError extends Error {
	readonly deferReload = true;
}
export interface PricingResearchResult {
	requested: string[];
	stored: string[];
	unresolved: string[];
	error?: string;
	/** The child is still active (for example waiting for input), so reload must be deferred. */
	deferReload?: boolean;
}

/** Strictly accepts complete, exact-target rows. Invalid or duplicate rows are never partly used. */
export function parsePricingResearchResult(value: unknown, requestedIds: readonly string[]): { entries: Record<string, PricingEntry>; unresolved: string[] } {
	const requested = [...new Set(requestedIds)];
	const requestedSet = new Set(requested);
	const rows: unknown[] | undefined = Array.isArray(value) ? value : value && typeof value === "object" && Array.isArray((value as Record<string, unknown>).prices) ? (value as Record<string, unknown>).prices as unknown[] : undefined;
	const entries: Record<string, PricingEntry> = {};
	if (!rows) return { entries, unresolved: requested };

	// Count first. This makes duplicate handling independent of row order: an
	// invalid->valid sequence and a third occurrence are rejected identically.
	const counts = new Map<string, number>();
	for (const row of rows) {
		if (!row || typeof row !== "object" || Array.isArray(row)) continue;
		const targetId = (row as Record<string, unknown>).targetId;
		if (typeof targetId === "string" && requestedSet.has(targetId))
			counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
	}
	for (const row of rows) {
		if (!row || typeof row !== "object" || Array.isArray(row)) continue;
		const item = row as Record<string, unknown>;
		const targetId = typeof item.targetId === "string" ? item.targetId : undefined;
		if (!targetId || !requestedSet.has(targetId) || counts.get(targetId) !== 1) continue;
		const candidate = {
			input: item.input,
			output: item.output,
			cacheRead: item.cacheRead,
			cacheWrite: item.cacheWrite,
			source: item.source,
			date: item.date,
		};
		if (isPricingEntry(candidate)) entries[targetId] = candidate;
	}
	return { entries, unresolved: requested.filter(id => !entries[id]) };
}

function resultText(value: unknown): unknown {
	if (typeof value !== "string") return value;
	try { return JSON.parse(value.trim()); } catch { return undefined; }
}

async function dispatchResearcher(request: PricingResearchRequest, signal?: AbortSignal): Promise<unknown> {
	const catalog = loadDefinitions(request.cwd, true, request.profile);
	const definition = catalog.agents.get("researcher");
	if (!definition) throw new Error(`Pricing researcher is unavailable. ${catalog.errors.join("; ")}`);
	if (!definition.model) throw new Error("Pricing researcher has no explicit model; no fallback is permitted.");
	const runtime = getSubagentRuntime();
	const instructions = [
		"Research AWS Bedrock prices for the exact target IDs below.",
		"Use original AWS sources, especially the AWS Bedrock pricing page and official AWS Bedrock model/pricing documentation or source tables. The public pricing page may omit its dynamically loaded current table, so follow official linked/source tables rather than treating an empty page as evidence.",
		"Do not use guesses, family-prefix matching, provider catalog prices, or third-party aggregators. Distinguish regional, global, and inference-profile target IDs exactly.",
		"Return ONLY strict JSON in this shape: {\"prices\":[{\"targetId\":\"exact requested ID\",\"input\":number,\"output\":number,\"cacheRead\":number,\"cacheWrite\":number,\"source\":\"https URL\",\"date\":\"YYYY-MM-DD\"}]}. Every numeric value is USD per one million tokens. Include one complete row only when the official source supports all four rates. Omit an unresolved target; never fill a missing rate with zero.",
		`EXACT TARGET IDS: ${JSON.stringify(request.targetIds)}`,
	].join("\n");
	const record = await runtime.launch({
		definition,
		instructions,
		cwd: request.cwd,
		model: definition.model,
		effort: definition.effort ?? "low",
		skills: resolveSkills(request.profile, definition.skills),
		origin: request.origin,
		retained: false,
		surface: process.env.HERDR_ENV === "1" ? "visible" : "headless",
		catalog: new Map([[definition.name, definition]]),
	}, request.profile, join(request.profile, "extensions", "subagent-child.ts"), false, signal);
	if (signal?.aborted) throw new Error("Pricing researcher was cancelled.");
	if (record.status !== "settled")
		throw new PricingResearchDeferredError(`Pricing researcher is still ${record.status}; reload deferred until it settles.`);
	if (record.error) throw new Error(record.error);
	return resultText(record.result ?? "");
}

export async function researchBedrockPricing(targetIds: readonly string[], options: Partial<Pick<PricingResearchRequest, "cwd" | "profile" | "origin">> & { runner?: PricingResearchRunner; signal?: AbortSignal } = {}): Promise<PricingResearchResult> {
	const requested = [...new Set(targetIds.filter(id => typeof id === "string" && id.length > 0))];
	if (!requested.length) return { requested, stored: [], unresolved: [] };
	const request: PricingResearchRequest = {
		targetIds: requested,
		cwd: options.cwd ?? process.cwd(),
		profile: options.profile ?? getAgentDir(),
		origin: options.origin ?? "refresh-models:pricing",
	};
	let value: unknown;
	try { value = await (options.runner ? options.runner(request, options.signal) : dispatchResearcher(request, options.signal)); }
	catch (error) { return { requested, stored: [], unresolved: requested, error: error instanceof Error ? error.message : String(error), ...(error instanceof PricingResearchDeferredError ? { deferReload: true } : {}) };
	}
	const parsed = parsePricingResearchResult(value, requested);
	try {
		await mergePricingEntries(parsed.entries, request.profile);
	} catch (error) {
		return { requested, stored: [], unresolved: requested, error: error instanceof Error ? error.message : String(error) };
	}
	return { requested, stored: Object.keys(parsed.entries), unresolved: parsed.unresolved };
}

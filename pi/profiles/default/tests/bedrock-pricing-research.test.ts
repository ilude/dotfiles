import { afterEach, describe, expect, it, vi } from "vitest";

const runtimeLaunch = vi.hoisted(() => vi.fn());
vi.mock("../lib/subagents/runtime.ts", () => ({ getSubagentRuntime: () => ({ launch: runtimeLaunch }) }));
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { appendRecord, makeRecord, summarize } from "../lib/bedrock/ledger.ts";
import { estimateUsage } from "../lib/bedrock/pricing.ts";
import { clearPricingEntriesCache, mergePricingEntries, pricingTablePath } from "../lib/bedrock/pricing-store.ts";
import * as pricingResearch from "../lib/bedrock/pricing-research.ts";
import { parsePricingResearchResult, researchBedrockPricing } from "../lib/bedrock/pricing-research.ts";
import registerRefreshModelsCommand from "../extensions/refresh-models.ts";

const dirs: string[] = [];
afterEach(() => { runtimeLaunch.mockReset(); vi.restoreAllMocks(); vi.unstubAllEnvs(); clearPricingEntriesCache(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function temp() { const dir = mkdtempSync(join(tmpdir(), "bedrock-pricing-")); dirs.push(dir); vi.stubEnv("PI_CODING_AGENT_DIR", dir); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, "settings.json"), "{}\n"); return dir; }

const valid = (targetId: string) => ({ targetId, input: 1.1, output: 2.2, cacheRead: 0.11, cacheWrite: 0.22, source: "https://docs.aws.amazon.com/bedrock/latest/userguide/quotas-token-burndown.html", date: "2026-09-11" });
const entry = (targetId: string) => { const { targetId: _targetId, ...rates } = valid(targetId); return rates; };

describe("Bedrock pricing research", () => {
	it("validates exact complete rows, persists provenance, and feeds accounting", async () => {
		const dir = temp();
		const result = await researchBedrockPricing(["custom.target"], {
			profile: dir,
			cwd: dir,
			runner: async () => ({ prices: [valid("custom.target")] }),
		});
		expect(result).toEqual({ requested: ["custom.target"], stored: ["custom.target"], unresolved: [] });
		expect(JSON.parse(readFileSync(pricingTablePath(dir), "utf8")).entries["custom.target"]).toEqual({ input: 1.1, output: 2.2, cacheRead: 0.11, cacheWrite: 0.22, source: valid("custom.target").source, date: "2026-09-11" });
		clearPricingEntriesCache();
		const price = estimateUsage("custom.target", { input: 1_000_000, output: 1_000_000, cacheRead: 1_000_000, cacheWrite: 1_000_000 });
		expect(price).toMatchObject({ status: "estimated", components: { input: 1.1, output: 2.2, cacheRead: 0.11, cacheWrite: 0.22 } });
		expect(price.total).toBeCloseTo(3.63);
	});

	it("keeps researched provenance distinct from the pinned catalog basis", async () => {
		const dir = temp();
		await researchBedrockPricing(["researched.target"], { profile: dir, cwd: dir, runner: async () => ({ prices: [valid("researched.target")] }) });
		clearPricingEntriesCache();
		expect(estimateUsage("researched.target", { input: 1_000_000 })).toMatchObject({
			status: "estimated",
			basis: "aws-bedrock-research",
			source: valid("researched.target").source,
			date: "2026-09-11",
		});
	});

	it("rejects every duplicate target regardless of row order or count", () => {
		const first = valid("duplicate");
		for (const prices of [
			[first, { ...first, input: 9 }],
			[{ ...first, cacheWrite: undefined }, first],
			[first, { ...first, input: 9 }, { ...first, output: 8 }],
		]) {
			const parsed = parsePricingResearchResult({ prices }, ["duplicate"]);
			expect(parsed.entries).toEqual({});
			expect(parsed.unresolved).toEqual(["duplicate"]);
		}
	});

	it("atomically merges concurrent researched batches without losing provenance", async () => {
		const dir = temp();
		await Promise.all([mergePricingEntries({ first: entry("first") }, dir), mergePricingEntries({ second: entry("second") }, dir)]);
		const entries = JSON.parse(readFileSync(pricingTablePath(dir), "utf8")).entries;
		expect(entries.first.input).toBe(1.1);
		expect(entries.second.source).toContain("docs.aws.amazon.com");
	});

	it("repairs historical unpriced records from the persisted table at read time", async () => {
		const dir = temp();
		await researchBedrockPricing(["historical.target"], { profile: dir, cwd: dir, runner: async () => ({ prices: [{ ...valid("historical.target"), input: 4 }] }) });
		const record = makeRecord({ timestamp: Date.parse("2026-09-11T12:00:00Z"), session: "history", provider: "bedrock-mantle", model: "historical", target: "historical.target", usage: { input: 1_000_000 } });
		record.pricing = { status: "unpriced", basis: "before-research" };
		await appendRecord(record);
		const summary = await summarize(record.month);
		expect(summary.cost).toBe(4);
		expect(summary.unpriced).toBe(0);
		expect(readFileSync(join(dir, "bedrock-usage.jsonl"), "utf8")).toContain('"status":"unpriced"');
	});

	it("does not store incomplete or malformed rows and reports omitted targets", async () => {
		const parsed = parsePricingResearchResult({ prices: [valid("good"), { ...valid("bad"), cacheWrite: undefined }, valid("unknown")] }, ["good", "bad"]);
		expect(Object.keys(parsed.entries)).toEqual(["good"]);
		expect(parsed.unresolved).toEqual(["bad"]);
		const dir = temp();
		const result = await researchBedrockPricing(["good", "bad"], { profile: dir, cwd: dir, runner: async () => ({ prices: [valid("good"), { ...valid("bad"), cacheWrite: undefined }] }) });
		expect(result.stored).toEqual(["good"]);
		expect(result.unresolved).toEqual(["bad"]);
		expect(existsSync(pricingTablePath(dir))).toBe(true);
		expect(JSON.parse(readFileSync(pricingTablePath(dir), "utf8")).entries.bad).toBeUndefined();
	});

	it("refreshes availability before awaiting the pricing dispatch boundary", async () => {
		const dir = temp();
		const reload = vi.fn(async () => undefined);
		const pricing = vi.spyOn(pricingResearch, "researchBedrockPricing").mockImplementation(async () => { expect(reload).not.toHaveBeenCalled(); return { requested: ["openai.gpt-5.6-luna"], stored: [], unresolved: ["openai.gpt-5.6-luna"] }; });
		const pi: any = { registerCommand: (name: string, command: any) => { pi.command = command; }, on: () => {}, registerProvider: () => {} };
		registerRefreshModelsCommand(pi);
		let models: any[] = [{ provider: "bedrock-mantle", id: "anthropic.claude-opus-5" }];
		const refresh = vi.fn(async () => { models = [...models, { provider: "bedrock-mantle", id: "openai.gpt-5.6-luna" }]; return { errors: new Map() }; });
		const notify = vi.fn();
		const nativeProvider = { getBedrockRouteTargetIds: (ids: readonly string[]) => [...ids] };
		await pi.command.handler("", { cwd: dir, reload, ui: { notify }, sessionManager: { getSessionId: () => "refresh-session" }, modelRegistry: { getAll: () => models, getProviderAuthStatus: () => ({ configured: true }), getRegisteredNativeProvider: () => nativeProvider, refresh } });
		expect(refresh).toHaveBeenCalledOnce();
		expect(pricing).toHaveBeenCalledWith(["openai.gpt-5.6-luna"], expect.objectContaining({ origin: "refresh-session" }));
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("unavailable"), "warning");
		expect(reload).toHaveBeenCalledOnce();
	});

	it("dispatches the named researcher through runtime.launch and parses complete JSON", async () => {
		const dir = temp();
		mkdirSync(join(dir, "agents"));
		copyFileSync(join(process.cwd(), "agents", "researcher.md"), join(dir, "agents", "researcher.md"));
		runtimeLaunch.mockImplementation(async (input: any) => {
			expect(input.definition.name).toBe("researcher");
			expect(input.instructions).toContain('EXACT TARGET IDS: ["dispatch.target"]');
			return { status: "settled", result: JSON.stringify({ prices: [valid("dispatch.target")] }) };
		});
		const result = await researchBedrockPricing(["dispatch.target"], { profile: dir, cwd: dir, origin: "dispatch-test" });
		expect(result).toEqual({ requested: ["dispatch.target"], stored: ["dispatch.target"], unresolved: [] });
		expect(runtimeLaunch).toHaveBeenCalledOnce();
	});

	it("reports an unavailable researcher without dispatching a child", async () => {
		const dir = temp();
		const result = await researchBedrockPricing(["unavailable"], { profile: dir, cwd: dir });
		expect(result.unresolved).toEqual(["unavailable"]);
		expect(result.error).toContain("researcher is unavailable");
		expect(runtimeLaunch).not.toHaveBeenCalled();
	});

	it("keeps malformed researcher text unavailable", async () => {
		const dir = temp();
		mkdirSync(join(dir, "agents"));
		copyFileSync(join(process.cwd(), "agents", "researcher.md"), join(dir, "agents", "researcher.md"));
		runtimeLaunch.mockResolvedValue({ status: "settled", result: "not strict JSON" });
		const result = await researchBedrockPricing(["malformed"], { profile: dir, cwd: dir });
		expect(result.stored).toEqual([]);
		expect(result.unresolved).toEqual(["malformed"]);
	});

	it("marks a waiting researcher so refresh can defer reload without cancellation", async () => {
		const dir = temp();
		mkdirSync(join(dir, "agents"));
		copyFileSync(join(process.cwd(), "agents", "researcher.md"), join(dir, "agents", "researcher.md"));
		runtimeLaunch.mockResolvedValue({ status: "waiting" });
		const result = await researchBedrockPricing(["waiting"], { profile: dir, cwd: dir });
		expect(result.deferReload).toBe(true);
		expect(result.error).toContain("reload deferred");
	});

	it("reloads after storing prices even when model and scope state are unchanged", async () => {
		const dir = temp();
		writeFileSync(join(dir, "settings.json"), JSON.stringify({ enabledModels: ["bedrock-mantle/openai.gpt-5.6-luna"] }));
		const reload = vi.fn(async () => undefined);
		vi.spyOn(pricingResearch, "researchBedrockPricing").mockResolvedValue({ requested: ["researched.target"], stored: ["researched.target"], unresolved: [] });
		const pi: any = { registerCommand: (_name: string, command: any) => { pi.command = command; }, on: () => {}, registerProvider: () => {} };
		registerRefreshModelsCommand(pi);
		const models: any[] = [{ provider: "bedrock-mantle", id: "openai.gpt-5.6-luna" }];
		const refresh = vi.fn(async () => ({ errors: new Map() }));
		await pi.command.handler("", { cwd: dir, reload, ui: { notify: vi.fn() }, sessionManager: { getSessionId: () => "refresh-session" }, modelRegistry: {
			getAll: () => models,
			getProviderAuthStatus: () => ({ configured: true }),
			getRegisteredNativeProvider: () => ({ getBedrockRouteTargetIds: () => ["researched.target"] }),
			refresh,
		} });
		expect(reload).toHaveBeenCalledOnce();
	});

	it("does not reload while a waiting researcher remains active", async () => {
		const dir = temp();
		const reload = vi.fn(async () => undefined);
		vi.spyOn(pricingResearch, "researchBedrockPricing").mockResolvedValue({ requested: ["waiting.target"], stored: [], unresolved: ["waiting.target"], error: "Pricing researcher is still waiting", deferReload: true });
		const pi: any = { registerCommand: (_name: string, command: any) => { pi.command = command; }, on: () => {}, registerProvider: () => {} };
		registerRefreshModelsCommand(pi);
		const models: any[] = [{ provider: "bedrock-mantle", id: "openai.gpt-5.6-luna" }];
		await pi.command.handler("", { cwd: dir, reload, ui: { notify: vi.fn() }, sessionManager: { getSessionId: () => "refresh-session" }, modelRegistry: {
			getAll: () => models,
			getProviderAuthStatus: () => ({ configured: true }),
			getRegisteredNativeProvider: () => ({ getBedrockRouteTargetIds: () => ["waiting.target"] }),
			refresh: vi.fn(async () => ({ errors: new Map() })),
		} });
		expect(reload).not.toHaveBeenCalled();
	});

	it("isolates researcher failure from model availability", async () => {
		temp();
		const result = await researchBedrockPricing(["unresolved"], { runner: async () => { throw new Error("research unavailable"); } });
		expect(result.stored).toEqual([]);
		expect(result.unresolved).toEqual(["unresolved"]);
		expect(result.error).toContain("research unavailable");
		expect(estimateUsage("unresolved", { input: 100 }).status).toBe("unpriced");
	});
});

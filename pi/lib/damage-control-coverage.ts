import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeCommandAst } from "../extensions/damage-control/ast-analyzer.ts";
import {
	canonicalizeOrBlock,
	checkNoDeletePaths,
	checkReadOnlyPath,
	checkWriteConfirmPath,
	checkZeroAccess,
	evaluateDangerousCommand,
	extractBashDeleteTargets,
	isExcludedPath,
} from "../extensions/damage-control-engine.ts";
import { loadRules } from "../extensions/damage-control-rules.ts";

const ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
);
const ORACLE = path.join(
	ROOT,
	"pi",
	"scripts",
	"damage-control-claude-oracle.py",
);
const WAIVERS = path.join(
	ROOT,
	"shared",
	"damage-control",
	"coverage-waivers.json",
);

export interface CoverageInventoryRow {
	id: string;
	section: string;
	index?: number;
	pattern: string;
	exfil?: boolean;
}

export interface CoverageFixture {
	id: string;
	tool: string;
	command: string;
	filePath?: string;
	targetRuleId?: string;
	expected: "allow" | "ask" | "block";
}

export interface CoverageWaiver {
	id: string;
	match: {
		section: string;
		exfil?: boolean;
	};
	reason: string;
}

interface CoverageWaiverFile {
	version: 1;
	waivers: CoverageWaiver[];
}

export interface AppliedCoverageWaiver {
	id: string;
	reason: string;
	patternIds: string[];
}

export interface CoverageDivergence {
	fixtureId: string;
	command: string;
	claude: string;
	pi: string;
}

export interface NegativeControlFailure {
	fixtureId: string;
	expected: string;
	actual: string;
}

export interface DamageControlCoverageReport {
	inventoryCount: number;
	fixtureCount: number;
	coveredPatternIds: string[];
	waivedPatternIds: string[];
	waivers: AppliedCoverageWaiver[];
	uncoveredPatternIds: string[];
	divergences: CoverageDivergence[];
	negativeControlFailures: NegativeControlFailure[];
	coverageDebtCount: number;
}

export function applyCoverageWaivers(
	inventory: CoverageInventoryRow[],
	waivers: CoverageWaiver[],
): AppliedCoverageWaiver[] {
	const seenIds = new Set<string>();
	return waivers.map((waiver) => {
		if (!waiver.id.trim() || !waiver.reason.trim())
			throw new Error("coverage waiver id and reason are required");
		if (seenIds.has(waiver.id))
			throw new Error(`duplicate coverage waiver: ${waiver.id}`);
		seenIds.add(waiver.id);
		const patternIds = inventory
			.filter(
				(row) =>
					row.section === waiver.match.section &&
					(waiver.match.exfil === undefined ||
						Boolean(row.exfil) === waiver.match.exfil),
			)
			.map((row) => row.id)
			.sort();
		if (patternIds.length === 0)
			throw new Error(`coverage waiver matches no policy rows: ${waiver.id}`);
		return { id: waiver.id, reason: waiver.reason, patternIds };
	});
}

function loadCoverageWaivers(): CoverageWaiver[] {
	const parsed = JSON.parse(
		fs.readFileSync(WAIVERS, "utf8"),
	) as CoverageWaiverFile;
	if (parsed.version !== 1 || !Array.isArray(parsed.waivers))
		throw new Error("coverage waiver file must use version 1");
	return parsed.waivers;
}

function oracle<T>(request: Record<string, unknown>): T {
	const result = spawnSync("python", [ORACLE], {
		cwd: ROOT,
		encoding: "utf8",
		input: JSON.stringify(request),
		windowsHide: true,
	});
	if (result.status !== 0)
		throw new Error(
			`Claude oracle failed (${result.status}): ${result.stderr || result.stdout}`,
		);
	return JSON.parse(result.stdout.trim()) as T;
}

function decisionFromReason(reason: string): "ask" | "block" {
	return reason.startsWith("Confirmation required") ? "ask" : "block";
}

async function evaluatePiBash(
	command: string,
	rules: ReturnType<typeof loadRules>["rules"],
): Promise<"allow" | "ask" | "block"> {
	const dangerous = await evaluateDangerousCommand(
		command,
		rules.dangerous_commands,
		{
			hasUI: false,
			toolName: "bash",
			astAnalysis: rules.astAnalysis,
			cwd: ROOT,
		},
	);
	if (dangerous) return decisionFromReason(dangerous.reason);
	const noDelete = checkNoDeletePaths(
		extractBashDeleteTargets(command),
		rules.no_delete_paths,
		ROOT,
	);
	return noDelete ? decisionFromReason(noDelete.reason) : "allow";
}

async function evaluatePiEdit(
	filePath: string,
	rules: ReturnType<typeof loadRules>["rules"],
): Promise<"allow" | "ask" | "block"> {
	const canonical = canonicalizeOrBlock(filePath, ROOT);
	if ("block" in canonical) return "block";
	const zeroAccess = isExcludedPath(
		canonical.canonical,
		rules.zero_access_exclusions,
	)
		? undefined
		: await checkZeroAccess(
				canonical.canonical,
				rules.zero_access_paths,
				"edit",
			);
	if (zeroAccess) return decisionFromReason(zeroAccess.reason);
	const readOnly = checkReadOnlyPath(
		filePath,
		rules.read_only_paths,
		rules.zero_access_exclusions,
		ROOT,
	);
	if (readOnly) return decisionFromReason(readOnly.reason);
	const writeConfirm = checkWriteConfirmPath(
		filePath,
		rules.write_confirm_paths,
		rules.zero_access_exclusions,
		ROOT,
	);
	return writeConfirm ? "ask" : "allow";
}

async function evaluatePiAst(
	command: string,
	rules: ReturnType<typeof loadRules>["rules"],
): Promise<"allow" | "ask" | "block"> {
	const result = await analyzeCommandAst(
		command,
		rules.dangerous_commands,
		rules.astAnalysis,
	);
	return result.decision;
}

export async function buildDamageControlCoverageReport(): Promise<DamageControlCoverageReport> {
	const inventory = oracle<CoverageInventoryRow[]>({ mode: "inventory" });
	const fixtures = oracle<CoverageFixture[]>({ mode: "fixtures" });
	const loaded = loadRules(ROOT);
	if (loaded.health.status !== "active")
		throw new Error(loaded.health.error ?? "Pi policy failed to load");
	const claudeResults = oracle<
		Array<{
			outcome: "allow" | "ask" | "block";
			matchedRuleId?: string;
		}>
	>({
		mode: "evaluate_batch",
		vectors: fixtures.map((fixture) => ({
			tool: fixture.tool,
			command: fixture.command,
			filePath: fixture.filePath,
			targetRuleId: fixture.targetRuleId,
		})),
	});
	const covered = new Set<string>();
	const appliedWaivers = applyCoverageWaivers(inventory, loadCoverageWaivers());
	const waived = new Set(appliedWaivers.flatMap((waiver) => waiver.patternIds));
	const divergences: CoverageDivergence[] = [];
	const negativeControlFailures: NegativeControlFailure[] = [];

	for (const [index, fixture] of fixtures.entries()) {
		const claude = claudeResults[index];
		if (!claude) throw new Error(`Claude oracle omitted fixture ${fixture.id}`);
		if (claude.matchedRuleId) covered.add(claude.matchedRuleId);
		if (claude.outcome !== fixture.expected)
			negativeControlFailures.push({
				fixtureId: fixture.id,
				expected: fixture.expected,
				actual: claude.outcome,
			});
		const pi =
			fixture.tool === "Bash"
				? await evaluatePiBash(fixture.command, loaded.rules)
				: fixture.tool === "Edit"
					? await evaluatePiEdit(fixture.filePath ?? "", loaded.rules)
					: await evaluatePiAst(fixture.command, loaded.rules);
		if (pi !== claude.outcome)
			divergences.push({
				fixtureId: fixture.id,
				command: fixture.command,
				claude: claude.outcome,
				pi,
			});
	}

	const coveredPatternIds = [...covered].sort();
	const overlap = coveredPatternIds.filter((id) => waived.has(id));
	if (overlap.length > 0)
		throw new Error(
			`covered policy rows must not remain waived: ${overlap.join(", ")}`,
		);
	const waivedPatternIds = [...waived].sort();
	const uncoveredPatternIds = inventory
		.map((row) => row.id)
		.filter((id) => !covered.has(id) && !waived.has(id))
		.sort();
	return {
		inventoryCount: inventory.length,
		fixtureCount: fixtures.length,
		coveredPatternIds,
		waivedPatternIds,
		waivers: appliedWaivers,
		uncoveredPatternIds,
		divergences,
		negativeControlFailures,
		coverageDebtCount:
			uncoveredPatternIds.length +
			divergences.length +
			negativeControlFailures.length,
	};
}

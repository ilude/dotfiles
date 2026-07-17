import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
	checkNoDeletePaths,
	evaluateDangerousCommand,
	extractBashDeleteTargets,
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
	expected: "allow" | "ask" | "block";
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
	uncoveredPatternIds: string[];
	divergences: CoverageDivergence[];
	negativeControlFailures: NegativeControlFailure[];
	coverageDebtCount: number;
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

export async function buildDamageControlCoverageReport(): Promise<DamageControlCoverageReport> {
	const inventory = oracle<CoverageInventoryRow[]>({ mode: "inventory" });
	const fixtures = oracle<CoverageFixture[]>({ mode: "fixtures" });
	const loaded = loadRules(ROOT);
	if (loaded.health.status !== "active")
		throw new Error(loaded.health.error ?? "Pi policy failed to load");
	const bashFixtures = fixtures.filter((fixture) => fixture.tool === "Bash");
	const claudeResults = oracle<
		Array<{
			outcome: "allow" | "ask" | "block";
			matchedRuleId?: string;
		}>
	>({
		mode: "evaluate_batch",
		tool: "Bash",
		commands: bashFixtures.map((fixture) => fixture.command),
	});
	const covered = new Set<string>();
	const divergences: CoverageDivergence[] = [];
	const negativeControlFailures: NegativeControlFailure[] = [];

	for (const [index, fixture] of bashFixtures.entries()) {
		const claude = claudeResults[index];
		if (!claude) throw new Error(`Claude oracle omitted fixture ${fixture.id}`);
		if (claude.matchedRuleId) covered.add(claude.matchedRuleId);
		if (claude.outcome !== fixture.expected)
			negativeControlFailures.push({
				fixtureId: fixture.id,
				expected: fixture.expected,
				actual: claude.outcome,
			});
		const pi = await evaluatePiBash(fixture.command, loaded.rules);
		if (pi !== claude.outcome)
			divergences.push({
				fixtureId: fixture.id,
				command: fixture.command,
				claude: claude.outcome,
				pi,
			});
	}

	const uncoveredPatternIds = inventory
		.map((row) => row.id)
		.filter((id) => !covered.has(id))
		.sort();
	return {
		inventoryCount: inventory.length,
		fixtureCount: fixtures.length,
		coveredPatternIds: [...covered].sort(),
		uncoveredPatternIds,
		divergences,
		negativeControlFailures,
		coverageDebtCount:
			uncoveredPatternIds.length +
			divergences.length +
			negativeControlFailures.length,
	};
}

import { describe, expect, it } from "vitest";

import {
	applyCoverageWaivers,
	buildDamageControlCoverageReport,
} from "../lib/damage-control-coverage.ts";

describe("damage-control Claude oracle coverage", () => {
	it("accounts for every policy row and reports uncovered debt", async () => {
		const report = await buildDamageControlCoverageReport();

		expect(report.inventoryCount).toBeGreaterThan(500);
		expect(report.fixtureCount).toBeGreaterThan(400);
		expect(report.coveredPatternIds.length).toBeGreaterThan(350);
		expect(report.waivedPatternIds.length).toBeGreaterThan(80);
		expect(
			report.coveredPatternIds.length +
				report.waivedPatternIds.length +
				report.uncoveredPatternIds.length,
		).toBe(report.inventoryCount);
		expect(report.coverageDebtCount).toBe(
			report.uncoveredPatternIds.length +
				report.divergences.length +
				report.negativeControlFailures.length,
		);

		console.log(
			`DAMAGE_CONTROL_COVERAGE ${JSON.stringify({
				inventoryCount: report.inventoryCount,
				fixtureCount: report.fixtureCount,
				coveredCount: report.coveredPatternIds.length,
				waivedCount: report.waivedPatternIds.length,
				uncoveredCount: report.uncoveredPatternIds.length,
				divergenceCount: report.divergences.length,
				negativeControlFailureCount: report.negativeControlFailures.length,
				coverageDebtCount: report.coverageDebtCount,
			})}`,
		);
		if (process.env.PI_DAMAGE_CONTROL_COVERAGE_DETAILS === "1")
			console.log(`DAMAGE_CONTROL_COVERAGE_DETAILS ${JSON.stringify(report)}`);
		if (process.env.PI_DAMAGE_CONTROL_COVERAGE_GATE === "1")
			expect(report.coverageDebtCount).toBe(0);
	});

	it("rejects waivers that do not identify policy rows", () => {
		expect(() =>
			applyCoverageWaivers(
				[
					{
						id: "bashToolPatterns:0000",
						section: "bashToolPatterns",
						pattern: "rm",
					},
				],
				[
					{
						id: "missing-section",
						match: { section: "not-present" },
						reason: "must not silently match nothing",
					},
				],
			),
		).toThrow("matches no policy rows");
	});
});

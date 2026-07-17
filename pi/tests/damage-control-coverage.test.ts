import { describe, expect, it } from "vitest";

import { buildDamageControlCoverageReport } from "../lib/damage-control-coverage.ts";

describe("damage-control Claude oracle coverage", () => {
	it("accounts for every policy row and reports uncovered debt", async () => {
		const report = await buildDamageControlCoverageReport();

		expect(report.inventoryCount).toBeGreaterThan(500);
		expect(report.fixtureCount).toBeGreaterThan(30);
		expect(report.coveredPatternIds.length).toBeGreaterThan(0);
		expect(
			report.coveredPatternIds.length + report.uncoveredPatternIds.length,
		).toBe(report.inventoryCount);
		expect(report.coverageDebtCount).toBe(
			report.uncoveredPatternIds.length +
				report.divergences.length +
				report.negativeControlFailures.length,
		);

		console.log(`DAMAGE_CONTROL_COVERAGE ${JSON.stringify(report)}`);
		if (process.env.PI_DAMAGE_CONTROL_COVERAGE_GATE === "1")
			expect(report.coverageDebtCount).toBe(0);
	});
});

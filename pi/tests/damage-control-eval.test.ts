import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let tmpRoot: string;
let prevOperatorDir: string | undefined;

beforeEach(() => {
	tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-damage-control-eval-"));
	prevOperatorDir = process.env.PI_OPERATOR_DIR;
	process.env.PI_OPERATOR_DIR = path.join(tmpRoot, "operator");
});

afterEach(() => {
	if (prevOperatorDir === undefined) delete process.env.PI_OPERATOR_DIR;
	else process.env.PI_OPERATOR_DIR = prevOperatorDir;
	fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("damage-control eval registry", () => {
	it("records, summarizes, and labels eval events", async () => {
		const mod = await import("../lib/damage-control-eval.ts");
		const approved = mod.recordDamageControlEval({
			decisionType: "ask_approved",
			toolName: "bash",
			redactedAction: "rm -rf ./build",
			rule: "rm recursive force",
			ruleSource: "policy.yaml",
			summary: "confirmed",
		});
		mod.recordDamageControlEval({
			decisionType: "hard_block",
			toolName: "read",
			redactedAction: "[redacted-secret-path]",
			rule: "~/.ssh/*",
			ruleSource: "policy.yaml",
			summary: "blocked",
		});

		expect(mod.listDamageControlEvalEvents()).toHaveLength(2);
		const labeled = mod.addDamageControlEvalLabel(
			approved.id.slice(0, 8),
			"noise",
		);
		expect(labeled.labels).toEqual(["noise"]);
		const stats = mod.summarizeDamageControlEval();
		expect(stats.total).toBe(2);
		expect(stats.byDecisionType.ask_approved).toBe(1);
		expect(stats.byDecisionType.hard_block).toBe(1);
		expect(stats.byRule[0].total).toBe(1);
	});

	it("persists hasUI so interactive denials are separable from auto-denials", async () => {
		const mod = await import("../lib/damage-control-eval.ts");
		mod.recordDamageControlEval({
			decisionType: "ask_denied",
			toolName: "bash",
			redactedAction: "rm -rf ./build",
			rule: "rm recursive force",
			hasUI: false,
		});
		mod.recordDamageControlEval({
			decisionType: "ask_denied",
			toolName: "bash",
			redactedAction: "rm -rf ./dist",
			rule: "rm recursive force",
			hasUI: true,
		});

		const events = mod.listDamageControlEvalEvents();
		expect(events.map((event) => event.hasUI)).toEqual([true, false]);
	});
});

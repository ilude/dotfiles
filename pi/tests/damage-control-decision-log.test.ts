import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	buildDamageControlDecision,
	compressOldDamageControlDecisionLogs,
	damageControlDecisionPath,
	recordDamageControlDecision,
} from "../lib/damage-control-decision-log.ts";

const NOW = new Date("2026-07-17T12:00:00.000Z");

describe("shared damage-control decision log", () => {
	let root: string;
	let previousRoot: string | undefined;

	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), "damage-control-decisions-"));
		previousRoot = process.env.DAMAGE_CONTROL_DECISION_DIR;
		process.env.DAMAGE_CONTROL_DECISION_DIR = root;
	});

	afterEach(() => {
		if (previousRoot === undefined)
			delete process.env.DAMAGE_CONTROL_DECISION_DIR;
		else process.env.DAMAGE_CONTROL_DECISION_DIR = previousRoot;
		fs.rmSync(root, { recursive: true, force: true });
	});

	it("writes a bounded secret-scrubbed monthly decision row", () => {
		const written = recordDamageControlDecision(
			{
				client: "pi",
				sessionId: "session-1",
				toolUseId: "call-1",
				tool: "bash",
				ruleId: "dangerous-rm",
				matchedPattern: "rm recursive",
				actionSummary: `token=${"x".repeat(40)} ${"a".repeat(700)}`,
				engineAction: "ask",
				userDecision: "approved",
				latencyMs: 12.5,
				latencyKind: "exact",
			},
			NOW,
		);

		expect(written).toBe(true);
		expect(damageControlDecisionPath(NOW)).toMatch(/decisions-2026-07\.jsonl$/);
		const row = JSON.parse(
			fs.readFileSync(damageControlDecisionPath(NOW), "utf8").trim(),
		);
		expect(row).toMatchObject({
			schemaVersion: 1,
			timestamp: NOW.toISOString(),
			client: "pi",
			sessionId: "session-1",
			toolUseId: "call-1",
			engineAction: "ask",
			userDecision: "approved",
			latencyKind: "exact",
		});
		expect(row.actionSummary).toContain("[REDACTED]");
		expect(Buffer.byteLength(row.actionSummary, "utf8")).toBeLessThanOrEqual(
			500,
		);
	});

	it("fails open when the destination cannot be created", () => {
		const fileRoot = path.join(root, "not-a-directory");
		fs.writeFileSync(fileRoot, "occupied", "utf8");
		process.env.DAMAGE_CONTROL_DECISION_DIR = fileRoot;

		expect(
			recordDamageControlDecision({
				client: "pi",
				sessionId: "session-1",
				tool: "bash",
				ruleId: "none",
				actionSummary: "pwd",
				engineAction: "allow",
				userDecision: "not_applicable",
				latencyMs: 1,
				latencyKind: "exact",
			}),
		).toBe(false);
	});

	it("compresses old logs without losing their JSONL content", () => {
		const source = path.join(root, "decisions-2026-05.jsonl");
		fs.writeFileSync(source, '{"schemaVersion":1}\n', "utf8");
		fs.utimesSync(
			source,
			new Date("2026-05-01T00:00:00Z"),
			new Date("2026-05-01T00:00:00Z"),
		);

		const compressed = compressOldDamageControlDecisionLogs(NOW);

		expect(compressed).toEqual([`${source}.gz`]);
		expect(fs.existsSync(source)).toBe(false);
		expect(
			zlib.gunzipSync(fs.readFileSync(`${source}.gz`)).toString("utf8"),
		).toBe('{"schemaVersion":1}\n');
	});

	it("rejects incomplete rows before writing", () => {
		expect(() =>
			buildDamageControlDecision({
				client: "pi",
				sessionId: "",
				tool: "bash",
				ruleId: "none",
				actionSummary: "pwd",
				engineAction: "allow",
				userDecision: "not_applicable",
				latencyMs: 0,
				latencyKind: "exact",
			}),
		).toThrow("sessionId, tool, and ruleId are required");
	});
});

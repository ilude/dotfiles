import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import orchestrationStatsExtension, {
	parseOrchestrationStatsDays,
	renderOrchestrationStatsReport,
} from "../extensions/orchestration-stats.js";

let root: string;
let metrics: string;
let friction: string;

function line(id: string, event: string, data: object, day = "2026-07-10") {
	return JSON.stringify({
		schemaVersion: 1,
		id,
		ts: `${day}T12:00:00.000Z`,
		event,
		data,
	});
}

function run(
	id: string,
	interactionId: string,
	status = "completed",
	cost: number | null = 0.25,
) {
	return {
		schemaVersion: 1,
		orchestrationId: id,
		interactionId,
		mode: "single",
		status,
		durationMs: 100,
		childWorkMs: 80,
		childTextBytes: 50,
		parentVisibleBytes: 20,
		workers: [
			{
				runId: `${id}-worker`,
				agent: "reviewer",
				resolvedModel: "worker-model",
				status,
				durationMs: 90,
				childTextBytes: 50,
				parentVisibleBytes: 20,
				usage: {
					inputTokens: 10,
					outputTokens: 5,
					totalTokens: 15,
					cacheCreationInputTokens: 0,
					cacheReadInputTokens: 3,
					processedTokens: 18,
					contextPeakTokens: 15,
					turns: 1,
					costUsd: cost,
					costSource: cost === null ? "unavailable" : "pi-usage",
				},
			},
		],
	};
}

function interaction(id: string, orchestrationIds: string[], direct = false) {
	return {
		schemaVersion: 1,
		interactionId: id,
		orchestrationIds,
		direct,
		durationMs: 200,
		parentUsageByModel: [
			{
				provider: "openai-codex",
				model: "parent-model",
				inputTokens: 20,
				outputTokens: 8,
				cacheReadTokens: 4,
				cacheWriteTokens: 0,
				contextPeakTokens: 28,
				costUsd: 0.5,
				costSource: "pi-usage",
			},
		],
	};
}

beforeEach(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orchestration-stats-"));
	metrics = path.join(root, "metrics");
	friction = path.join(root, "friction");
	fs.mkdirSync(metrics);
	fs.mkdirSync(friction);
	process.env.PI_METRICS_DIR = metrics;
	process.env.PI_WORKFLOW_FRICTION_DIR = friction;
});

afterEach(() => {
	delete process.env.PI_METRICS_DIR;
	delete process.env.PI_WORKFLOW_FRICTION_DIR;
	fs.rmSync(root, { recursive: true, force: true });
});

describe("orchestration stats report", () => {
	it("renders deterministic full observations without converting unavailable cost to zero", async () => {
		fs.writeFileSync(
			path.join(metrics, "metrics-2026-07-10.jsonl"),
			[
				line("run-1", "orchestration_run", run("orch-1", "interaction-1")),
				line(
					"run-2",
					"orchestration_run",
					run("orch-2", "interaction-2", "orphaned", null),
				),
				line(
					"interaction-1",
					"orchestration_interaction",
					interaction("interaction-1", ["orch-1"]),
				),
				line(
					"interaction-2",
					"orchestration_interaction",
					interaction("interaction-2", ["orch-2"]),
				),
				line(
					"interaction-3",
					"orchestration_interaction",
					interaction("interaction-3", ["pending-id"]),
				),
				line(
					"direct",
					"orchestration_interaction",
					interaction("interaction-direct", [], true),
				),
				"not json",
			].join("\n"),
		);
		fs.writeFileSync(
			path.join(friction, "reviews.jsonl"),
			`${JSON.stringify({ interactionId: "interaction-1", status: "completed", review: { classification: "productive" } })}\n`,
		);
		const now = new Date("2026-07-10T13:00:00.000Z");
		const first = await renderOrchestrationStatsReport(1, now);
		const second = await renderOrchestrationStatsReport(1, now);
		expect(second).toBe(first);
		expect(first).toContain(
			"Direct: 1; delegated: 3; pending referenced runs: 1; referenced run IDs: 3.",
		);
		expect(first).toContain(
			"Known parent cost: $2.0000; known worker cost: $0.2500; known total: $2.2500; unavailable parent models: 0; unavailable worker models: 1.",
		);
		expect(first).toContain(
			"Worker output bytes: 100; returned inline bytes: 40; worker output not returned inline: 60.",
		);
		expect(first).toContain("Run wall: p50 100 ms, p95 100 ms.");
		expect(first).toContain("Run statuses: completed 1, orphaned 1.");
		expect(first).toContain(
			"Friction classifications: productive 1, mixed 0, churn 0, uncertain 0, failed 0, pending 0, unreviewed 3, unmatched 0.",
		);
		expect(first.indexOf("### Parent models")).toBeLessThan(
			first.indexOf("### Worker models"),
		);
	});

	it("bounds unmatched friction reviews to valid reviewed timestamps in the report window", async () => {
		fs.writeFileSync(
			path.join(metrics, "metrics-2026-07-10.jsonl"),
			line(
				"interaction-1",
				"orchestration_interaction",
				interaction("interaction-1", []),
			),
		);
		fs.writeFileSync(
			path.join(friction, "reviews.jsonl"),
			[
				{
					interactionId: "at-window-start",
					reviewedAt: "2026-07-09T13:00:00.000Z",
					status: "completed",
				},
				{
					interactionId: "at-window-end",
					reviewedAt: "2026-07-10T13:00:00.000Z",
					status: "completed",
				},
				{
					interactionId: "before-window",
					reviewedAt: "2026-07-09T12:59:59.999Z",
					status: "completed",
				},
				{
					interactionId: "after-window",
					reviewedAt: "2026-07-10T13:00:00.001Z",
					status: "completed",
				},
				{ interactionId: "missing-timestamp", status: "completed" },
				{
					interactionId: "malformed-timestamp",
					reviewedAt: "not-a-timestamp",
					status: "completed",
				},
			]
				.map((review) => JSON.stringify(review))
				.join("\n"),
		);
		const now = new Date("2026-07-10T13:00:00.000Z");
		const first = await renderOrchestrationStatsReport(1, now);
		const second = await renderOrchestrationStatsReport(1, now);
		expect(second).toBe(first);
		expect(first).toContain(
			"Friction classifications: productive 0, mixed 0, churn 0, uncertain 0, failed 0, pending 0, unreviewed 1, unmatched 2.",
		);
	});

	it("parses the registered slash command and does not register a tool", async () => {
		const command = vi.fn();
		const registerTool = vi.fn();
		const sendMessage = vi.fn();
		orchestrationStatsExtension({
			registerCommand: command,
			registerTool,
			sendMessage,
		} as never);
		expect(command).toHaveBeenCalledWith(
			"orchestration-stats",
			expect.any(Object),
		);
		expect(registerTool).not.toHaveBeenCalled();
		const handler = command.mock.calls[0]?.[1].handler as (
			args: string,
			ctx: unknown,
		) => Promise<void>;
		await handler("1", { ui: { notify: vi.fn() } });
		expect(sendMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				customType: "orchestration-stats",
				display: true,
			}),
			{ triggerTurn: false },
		);
		expect(parseOrchestrationStatsDays("")).toBe(7);
		expect(parseOrchestrationStatsDays("365")).toBe(365);
		expect(parseOrchestrationStatsDays("366")).toBeNull();
	});
});

function planText() {
	const completed = [
		"T1",
		"T2",
		"V1",
		"T3",
		"T4",
		"T5",
		"V2",
		"T6",
		"T7",
		"V3",
		"F1",
		"F2",
		"F3",
		"F4",
	]
		.map(
			(id) =>
				`- [x] ${id}: complete\n  - Status: completed\n  - Evidence: evidence/${id}.log`,
		)
		.join("\n");
	return `${completed}\n- [ ] F5: archive\n  - Status: pending\n  - Evidence: pending\n`;
}

function verifierFixture() {
	const fixture = fs.mkdtempSync(
		path.join(os.tmpdir(), "pi-orchestration-verifier-"),
	);
	const evidence = path.join(fixture, "evidence");
	const smoke = path.join(fixture, "smoke");
	fs.mkdirSync(evidence);
	fs.writeFileSync(path.join(evidence, "capture.log"), "captured\n");
	for (const name of ["metrics", "operator", "friction"])
		fs.mkdirSync(path.join(smoke, name), { recursive: true });
	fs.writeFileSync(path.join(fixture, "plan.md"), planText());
	fs.writeFileSync(
		path.join(smoke, "metrics", "metrics-2026-07-10.jsonl"),
		[
			line("run", "orchestration_run", run("orch", "interaction")),
			line(
				"interaction",
				"orchestration_interaction",
				interaction("interaction", ["orch"]),
			),
		].join("\n"),
	);
	return { fixture, evidence, smoke, plan: path.join(fixture, "plan.md") };
}

describe("orchestration telemetry archive verifier", () => {
	it("accepts the active verifier output capture while rejecting unrelated empty evidence", () => {
		const script = path.resolve("scripts/orchestration-telemetry-verify.mjs");
		const fixture = verifierFixture();
		const capture = path.join(fixture.evidence, "archive-preflight.log");
		const shellPath = (value: string) => value.replaceAll("\\", "/");
		const command = [
			"set -o pipefail",
			`"${shellPath(process.execPath)}" "${shellPath(script)}" --plan "${shellPath(fixture.plan)}" --evidence-dir "${shellPath(fixture.evidence)}" --smoke-dir "${shellPath(fixture.smoke)}" 2>&1 | tee "${shellPath(capture)}"`,
		].join("; ");

		expect(
			execFileSync("bash", ["--noprofile", "--norc", "-c", command], {
				encoding: "utf8",
			}),
		).toContain("passed");
		expect(fs.readFileSync(capture, "utf8")).toContain("passed");

		fs.writeFileSync(path.join(fixture.evidence, "unrelated.log"), "");
		expect(() =>
			execFileSync(
				process.execPath,
				[
					script,
					"--plan",
					fixture.plan,
					"--evidence-dir",
					fixture.evidence,
					"--smoke-dir",
					fixture.smoke,
				],
				{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
			),
		).toThrow();
		fs.rmSync(fixture.fixture, { recursive: true, force: true });
	});

	it("passes a complete fixture and rejects each archive defect", () => {
		const script = path.resolve("scripts/orchestration-telemetry-verify.mjs");
		const invoke = (fixture: ReturnType<typeof verifierFixture>) =>
			execFileSync(
				process.execPath,
				[
					script,
					"--plan",
					fixture.plan,
					"--evidence-dir",
					fixture.evidence,
					"--smoke-dir",
					fixture.smoke,
				],
				{
					cwd: path.resolve(".."),
					encoding: "utf8",
					stdio: ["ignore", "pipe", "pipe"],
				},
			);
		const reject = (
			mutate: (fixture: ReturnType<typeof verifierFixture>) => void,
		) => {
			const fixture = verifierFixture();
			mutate(fixture);
			expect(() => invoke(fixture)).toThrow();
			fs.rmSync(fixture.fixture, { recursive: true, force: true });
		};
		const complete = verifierFixture();
		expect(invoke(complete)).toContain("passed");
		fs.rmSync(complete.fixture, { recursive: true, force: true });
		reject((fixture) =>
			fs.appendFileSync(
				path.join(fixture.smoke, "metrics", "metrics-2026-07-10.jsonl"),
				"\nnot json",
			),
		);
		reject((fixture) =>
			fs.writeFileSync(
				path.join(fixture.smoke, "metrics", "metrics-2026-07-10.jsonl"),
				`${line("run", "orchestration_run", { ...run("orch", "interaction"), mode: undefined })}\n${line("interaction", "orchestration_interaction", interaction("interaction", ["orch"]))}`,
			),
		);
		reject((fixture) =>
			fs.writeFileSync(
				path.join(fixture.smoke, "metrics", "metrics-2026-07-10.jsonl"),
				`${line("run", "orchestration_run", run("orch", "interaction"))}\n${line("interaction", "orchestration_interaction", interaction("interaction", ["wrong"]))}`,
			),
		);
		reject((fixture) =>
			fs.writeFileSync(
				path.join(fixture.smoke, "metrics", "metrics-2026-07-10.jsonl"),
				`${line("run", "orchestration_run", { ...run("orch", "interaction"), output: "forbidden" })}\n${line("interaction", "orchestration_interaction", interaction("interaction", ["orch"]))}`,
			),
		);
		reject((fixture) =>
			fs.writeFileSync(
				fixture.plan,
				planText().replace("- [x] T6", "- [ ] T6"),
			),
		);
		reject((fixture) =>
			fs.rmSync(path.join(fixture.smoke, "friction"), { recursive: true }),
		);
		reject((fixture) =>
			fs.writeFileSync(
				path.join(fixture.smoke, "metrics", "metrics.jsonl"),
				"{}\n",
			),
		);
		reject((fixture) => {
			const stale = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
			fs.utimesSync(fixture.smoke, stale, stale);
		});
	});
});

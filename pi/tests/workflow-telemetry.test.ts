import * as fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	appendWorkflowEvent,
	createWorkflowEpisodeId,
	startWorkflowEpisode,
	workflowTelemetryDir,
} from "../lib/workflow-telemetry.ts";

vi.mock("node:fs", () => ({
	mkdirSync: vi.fn(),
	appendFileSync: vi.fn(),
}));

describe("workflow telemetry", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("creates stable readable episode IDs from command and artifact path", () => {
		const id = createWorkflowEpisodeId({
			command: "do-it",
			args: ".specs/example/plan.md",
			artifactPath: ".specs/example/plan.md",
			now: new Date("2026-05-26T12:10:42.000Z"),
		});

		expect(id).toBe("2026-05-26T12-10-42-000Z-do-it-specs-example");
	});

	it("appends a structured runtime event without prompt or command content", () => {
		const record = appendWorkflowEvent({
			episodeId: "budget-1",
			eventId: "budget-001",
			phaseId: "session-budget",
			eventType: "budget_trip",
			evidence: "Session budget threshold reached.",
			data: { sensor: "budget", measured: 25, threshold: 25 },
			now: new Date("2026-05-26T12:10:42.000Z"),
		});

		expect(record).toMatchObject({
			episode_id: "budget-1",
			event_id: "budget-001",
			phase_id: "session-budget",
			event_type: "budget_trip",
			status: "recorded",
			data: { sensor: "budget", measured: 25, threshold: 25 },
		});
		expect(fs.appendFileSync).toHaveBeenCalledTimes(1);
		expect(String(vi.mocked(fs.appendFileSync).mock.calls[0][0])).toContain(
			"budget-1",
		);
		expect(vi.mocked(fs.appendFileSync).mock.calls[0][1]).not.toContain(
			"command_line",
		);
	});

	it("appends one runtime episode and one dispatch event as JSONL", () => {
		const episode = startWorkflowEpisode({
			command: "review-it",
			args: ".specs/example/plan.md",
			artifactPath: ".specs/example/plan.md",
			repoRoot: "C:/repo",
			now: new Date("2026-05-26T12:10:42.000Z"),
		});

		expect(episode).toEqual({
			schema_version: 1,
			episode_id: "2026-05-26T12-10-42-000Z-review-it-specs-example",
			command: "review-it",
			artifact_path: ".specs/example/plan.md",
			repo_root: "C:/repo",
			started_at: "2026-05-26T12:10:42.000Z",
			status: "started",
			redaction_status: "no_sensitive_output",
		});
		expect(fs.appendFileSync).toHaveBeenCalledTimes(2);
		expect(String(vi.mocked(fs.appendFileSync).mock.calls[0][0])).toContain(
			workflowTelemetryDir,
		);
		expect(vi.mocked(fs.appendFileSync).mock.calls[0][1]).toContain(
			'"command":"review-it"',
		);
		expect(vi.mocked(fs.appendFileSync).mock.calls[1][1]).toContain(
			'"event_type":"command"',
		);
		expect(vi.mocked(fs.appendFileSync).mock.calls[1][1]).toContain(
			'"phase_id":"dispatch"',
		);
	});
});

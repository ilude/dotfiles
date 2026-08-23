import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getMetricsLogPath, readRecentEvents } from "../lib/metrics.js";
import { invalidateSettingsCache } from "../lib/settings-loader.js";
import { sanitizeTimingMetadata, summarizeTimingSpans, TimingSpan, withTimingSpan, type Clock } from "../lib/observability.js";
import registerCommitTools from "../extensions/commit.js";
import { createMockPi } from "./helpers/mock-pi.js";
import { buildCommitPlan } from "../lib/commit/plan.ts";

let tmpRoot: string;
let prevMetricsDir: string | undefined;
let prevOperatorDir: string | undefined;

function fakeClock(values: number[]): Clock {
	let i = 0;
	return {
		nowMs: () => values[Math.min(i++, values.length - 1)],
		wallTime: () => new Date("2026-05-02T00:00:00.000Z"),
	};
}

beforeEach(() => {
	tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-observability-"));
	prevMetricsDir = process.env.PI_METRICS_DIR;
	prevOperatorDir = process.env.PI_OPERATOR_DIR;
	process.env.PI_METRICS_DIR = tmpRoot;
	process.env.PI_OPERATOR_DIR = path.join(tmpRoot, "operator");
	invalidateSettingsCache();
});

afterEach(() => {
	if (prevMetricsDir === undefined) delete process.env.PI_METRICS_DIR;
	else process.env.PI_METRICS_DIR = prevMetricsDir;
	if (prevOperatorDir === undefined) delete process.env.PI_OPERATOR_DIR;
	else process.env.PI_OPERATOR_DIR = prevOperatorDir;
	invalidateSettingsCache();
	fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("TimingSpan", () => {
	it("records deterministic positive duration and metadata", () => {
		const span = new TimingSpan({
			name: "subagent.run",
			category: "subagent",
			metadata: { agent: "reviewer", prompt: "must not persist" },
			clock: fakeClock([10, 42]),
		});
		span.finish("ok", { exitCode: 0 });
		const event = readRecentEvents()[0];
		expect(event.event).toBe("timing_span");
		expect(event.data?.schemaVersion).toBe(1);
		expect(event.data?.durationMs).toBe(32);
		expect(event.data?.metadata).toEqual({ agent: "reviewer", exitCode: 0 });
	});

	it("records thrown errors without swallowing them", async () => {
		await expect(
			withTimingSpan({ name: "slash.do-it", category: "command", clock: fakeClock([0, 3]) }, async () => {
				throw new TypeError("boom");
			}),
		).rejects.toThrow("boom");
		const event = readRecentEvents()[0];
		expect(event.data?.status).toBe("error");
		expect(event.data?.errorType).toBe("TypeError");
	});

	it("does not write source artifacts when metrics dir is redirected", () => {
		new TimingSpan({ name: "helper", category: "helper", clock: fakeClock([1, 2]) }).finish();
		expect(fs.existsSync(getMetricsLogPath())).toBe(true);
		expect(getMetricsLogPath().startsWith(tmpRoot)).toBe(true);
	});
});

describe("sanitizeTimingMetadata", () => {
	it("allow-lists metadata and truncates long safe strings", () => {
		const sanitized = sanitizeTimingMetadata({
			agent: "a".repeat(140),
			command: "do-it",
			apiKey: "secret",
			output: "private",
		});
		expect(sanitized?.command).toBe("do-it");
		expect(String(sanitized?.agent).length).toBeLessThanOrEqual(120);
		expect(sanitized).not.toHaveProperty("apiKey");
		expect(sanitized).not.toHaveProperty("output");
	});
});

describe("summarizeTimingSpans", () => {
	it("returns bounded slowest-span summaries", () => {
		const rows = summarizeTimingSpans([
			{ event: "timing_span", data: { category: "tool", name: "bash", durationMs: 5, status: "ok" } },
			{ event: "timing_span", data: { category: "subagent", name: "reviewer", durationMs: 50, status: "ok" } },
			{ event: "other", data: { durationMs: 100 } },
		], 1);
		expect(rows).toEqual(["subagent:reviewer 50ms ok"]);
	});
});

describe("commit tool timing spans", () => {
	const repos: string[] = [];

	function run(cwd: string, args: string[]) {
		const result = spawnSync("git", args, { cwd, encoding: "utf8" });
		if ((result.status ?? 1) !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
		return result.stdout;
	}

	function repo() {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-obs-commit-"));
		repos.push(dir);
		run(dir, ["init"]);
		run(dir, ["config", "user.email", "pi@example.invalid"]);
		run(dir, ["config", "user.name", "Pi Test"]);
		return dir;
	}

	function useRealGitExec(pi: ReturnType<typeof createMockPi>) {
		pi.exec.mockImplementation(async (command, args, options) => {
			const result = spawnSync(command, args, {
				cwd: options?.cwd,
				encoding: "utf8",
			});
			return {
				code: result.status ?? 1,
				stdout: result.stdout ?? "",
				stderr: result.stderr ?? "",
			};
		});
	}

	afterEach(() => {
		for (const dir of repos.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
	});

	it("commit_stage emits a commit.stage timing span", async () => {
		const dir = repo();
		fs.writeFileSync(path.join(dir, "staged.txt"), "hello\n");

		const pi = createMockPi();
		useRealGitExec(pi);
		registerCommitTools(pi as any);

		const planTool = pi._getTool("commit_plan")!;
		const stageTool = pi._getTool("commit_stage")!;
		const ctx = { cwd: dir };

		const planResult = await planTool.execute("id", {}, undefined, undefined, ctx);
		const plan = planResult.details as ReturnType<typeof buildCommitPlan> & {
			planId: string;
		};

		await stageTool.execute(
			"id",
			{ planId: plan.planId },
			undefined,
			undefined,
			ctx,
		);

		const events = readRecentEvents();
		const spanNames = events.filter((e) => e.event === "timing_span").map((e) => e.data?.name);
		expect(spanNames).toContain("commit.stage");
	});

	it("commit_create emits a commit.create timing span", async () => {
		const dir = repo();
		fs.writeFileSync(path.join(dir, "create.txt"), "hello\n");

		const pi = createMockPi();
		useRealGitExec(pi);
		registerCommitTools(pi as any);

		const planTool = pi._getTool("commit_plan")!;
		const stageTool = pi._getTool("commit_stage")!;
		const createTool = pi._getTool("commit_create")!;
		const ctx = { cwd: dir };

		const planResult = await planTool.execute("id", {}, undefined, undefined, ctx);
		const plan = planResult.details as ReturnType<typeof buildCommitPlan> & {
			planId: string;
		};

		const stageResult = await stageTool.execute(
			"id",
			{ planId: plan.planId },
			undefined,
			undefined,
			ctx,
		);

		await createTool.execute(
			"id",
			{
				message: "feat: add create.txt",
				stageId: stageResult.details.stageId,
			},
			undefined,
			undefined,
			ctx,
		);

		const events = readRecentEvents();
		const spanNames = events.filter((e) => e.event === "timing_span").map((e) => e.data?.name);
		expect(spanNames).toContain("commit.create");
	});

	it("commit_stage emits a span even when staging fails", async () => {
		const pi = createMockPi();
		registerCommitTools(pi as any);

		const stageTool = pi._getTool("commit_stage")!;
		const ctx = { cwd: "/nonexistent-repo-path" };

		await expect(
			stageTool.execute("id", { planId: "missing" }, undefined, undefined, ctx),
		).rejects.toThrow(/Unknown or expired commit planId/);

		const events = readRecentEvents();
		const spanNames = events.filter((e) => e.event === "timing_span").map((e) => e.data?.name);
		expect(spanNames).toContain("commit.stage");
	});
});

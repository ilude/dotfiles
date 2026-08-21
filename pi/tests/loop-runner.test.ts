import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initializeGitRepository } from "./helpers/git-fixture.ts";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pi-loop-runner-"));
	temporaryDirectories.push(directory);
	return directory;
}

function initializeRepository(workspace: string): void {
	fs.writeFileSync(path.join(workspace, "plan.md"), "# Plan\n");
	initializeGitRepository(workspace, {
		name: "Loop Runner",
		email: "loop-runner@example.invalid",
	});
	execFileSync("git", ["add", "--", "plan.md"], { cwd: workspace });
	execFileSync("git", ["commit", "-q", "-m", "test: initialize runner"], {
		cwd: workspace,
	});
}

function writeFakePi(
	directory: string,
	outcome: "modifying" | "approval" | "infrastructure",
): void {
	if (process.platform === "win32") {
		fs.writeFileSync(
			path.join(directory, "pi.cmd"),
			[
				"@echo off",
				...(outcome === "modifying"
					? [
							'echo {"schema_version":1,"event":"tool_execution_started","iteration":%PI_LOOP_ITERATION%,"attempt":%PI_LOOP_ATTEMPT%,"invocation_id":"%PI_LOOP_INVOCATION_ID%","modifying_capable":true}>>"%PI_LOOP_LOG_PATH%"',
						]
					: outcome === "approval"
						? [
								'echo {"schema_version":1,"event":"approval_required","iteration":%PI_LOOP_ITERATION%,"attempt":%PI_LOOP_ATTEMPT%,"invocation_id":"%PI_LOOP_INVOCATION_ID%"}>>"%PI_LOOP_LOG_PATH%"',
							]
						: []),
				"exit /b 1",
				"",
			].join("\r\n"),
		);
		return;
	}
	fs.writeFileSync(
		path.join(directory, "pi"),
		[
			"#!/bin/sh",
			...(outcome === "modifying"
				? [
						`printf '%s\\n' '{"schema_version":1,"event":"tool_execution_started","iteration":'"$PI_LOOP_ITERATION"',"attempt":'"$PI_LOOP_ATTEMPT"',"invocation_id":"'"$PI_LOOP_INVOCATION_ID"'","modifying_capable":true}' >> "$PI_LOOP_LOG_PATH"`,
					]
				: outcome === "approval"
					? [
							`printf '%s\\n' '{"schema_version":1,"event":"approval_required","iteration":'"$PI_LOOP_ITERATION"',"attempt":'"$PI_LOOP_ATTEMPT"',"invocation_id":"'"$PI_LOOP_INVOCATION_ID"'"}' >> "$PI_LOOP_LOG_PATH"`,
						]
					: []),
			"exit 1",
			"",
		].join("\n"),
		{ mode: 0o755 },
	);
}

function runRunner(
	outcome: "modifying" | "approval" | "infrastructure",
	retries: number,
	goal = false,
	staleEvidence = false,
) {
	const workspace = temporaryDirectory();
	const state = temporaryDirectory();
	const bin = temporaryDirectory();
	initializeRepository(workspace);
	writeFakePi(bin, outcome);
	if (staleEvidence)
		fs.writeFileSync(
			path.join(state, "loop.log"),
			`${JSON.stringify({
				event: "pi_process_started",
				iteration: 1,
				attempt: 1,
				invocation_id: "stale-invocation",
			})}\n`,
		);
	const script = path.resolve("scripts/run-loop.ps1");
	let exitCode = 0;
	try {
		execFileSync(
			"pwsh",
			[
				"-NoProfile",
				"-File",
				script,
				"-Workspace",
				workspace,
				"-StateRoot",
				state,
				"-JobId",
				"runner-test",
				"-PlanPaths",
				"plan.md",
				"-MaxIterations",
				"1",
				"-MaxInvocationRetries",
				String(retries),
				...(goal ? ["-GoalId", "goal-runner-test"] : []),
				"-InitialBackoffSeconds",
				"1",
			],
			{
				cwd: path.resolve(".."),
				env: {
					...process.env,
					PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
				},
				stdio: "pipe",
			},
		);
	} catch (error) {
		exitCode = (error as { status?: number }).status ?? -1;
	}
	const records = fs
		.readFileSync(path.join(state, "loop.log"), "utf8")
		.trim()
		.split(/\r?\n/)
		.map((line) => JSON.parse(line) as Record<string, unknown>);
	return { exitCode, records };
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0))
		fs.rmSync(directory, { recursive: true, force: true });
});

describe("detached loop runner recovery", () => {
	it("does not replay a failed invocation after a modifying-capable tool starts", () => {
		const { exitCode, records } = runRunner("modifying", 3);
		expect(exitCode).toBe(5);
		expect(records.filter((record) => record.event === "invocation_started")).toHaveLength(1);
		expect(records).toContainEqual(
			expect.objectContaining({
				event: "invocation_retry_suppressed",
				reason: "modifying_tool_started",
			}),
		);
		expect(records).toContainEqual(
			expect.objectContaining({
				event: "loop_stopped",
				reason: "modifying_invocation_failed",
			}),
		);
	});

	it("does not replay a failed invocation that requires operator approval", () => {
		const { exitCode, records } = runRunner("approval", 3);
		expect(exitCode).toBe(5);
		expect(records.filter((record) => record.event === "invocation_started")).toHaveLength(1);
		expect(records).toContainEqual(
			expect.objectContaining({
				event: "invocation_retry_suppressed",
				reason: "approval_required",
			}),
		);
	});

	it("fails closed when unattended runtime evidence is missing or stale", () => {
		const { exitCode, records } = runRunner(
			"infrastructure",
			3,
			true,
			true,
		);
		expect(exitCode).toBe(5);
		expect(records.filter((record) => record.event === "invocation_started")).toHaveLength(1);
		expect(records).toContainEqual(
			expect.objectContaining({
				event: "invocation_retry_suppressed",
				reason: "runtime_evidence_missing",
			}),
		);
	});

	it("retries infrastructure-only failures before execution", () => {
		const { exitCode, records } = runRunner("infrastructure", 2);
		expect(exitCode).toBe(2);
		expect(records.filter((record) => record.event === "invocation_started")).toHaveLength(2);
		expect(records).toContainEqual(
			expect.objectContaining({ event: "invocation_retry_scheduled" }),
		);
	});
});

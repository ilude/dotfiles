#!/usr/bin/env node
import { spawn } from "node:child_process";
import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	realpath,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CAPTURE_LIMIT = 64 * 1024;
const TIMEOUT_MS = 15_000;
const GOAL_LIFECYCLE_TIMEOUT_MS = 30_000;
const LIVE_TIMEOUT_MS = 180_000;
const LEGACY_SENTINEL = "isolated-smoke-legacy-task";

function appendBounded(current, chunk) {
	const combined = Buffer.concat([current, Buffer.from(chunk)]);
	return combined.length <= CAPTURE_LIMIT
		? combined
		: combined.subarray(combined.length - CAPTURE_LIMIT);
}

async function listFiles(root) {
	const files = [];
	for (const entry of await readdir(root, { withFileTypes: true })) {
		const candidate = join(root, entry.name);
		if (entry.isDirectory()) files.push(...(await listFiles(candidate)));
		else files.push(candidate);
	}
	return files;
}

function assertInside(root, candidate) {
	const rel = relative(root, candidate);
	if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return;
	throw new Error(`Smoke output escaped scratch root: ${candidate}`);
}

function reportCount(report, label) {
	const match = report.match(new RegExp(`\\b${label}:\\s*(\\d+)\\b`));
	return match ? Number(match[1]) : undefined;
}

async function runProcess({
	command,
	args,
	cwd,
	env,
	timeoutMs,
	rpc,
	rpcMessage,
	killAfterRpcResponse = true,
}) {
	const child = spawn(command, args, {
		cwd,
		env,
		stdio: ["pipe", "pipe", "pipe"],
		shell: false,
		windowsHide: true,
	});
	let stdout = Buffer.alloc(0);
	let stderr = Buffer.alloc(0);
	child.stdout.on("data", (chunk) => {
		stdout = appendBounded(stdout, chunk);
		if (
			rpc &&
			killAfterRpcResponse &&
			stdout.includes(`"id":"${rpcMessage?.id ?? "smoke-state"}"`)
		)
			child.kill();
	});
	child.stderr.on("data", (chunk) => {
		stderr = appendBounded(stderr, chunk);
	});
	if (rpc)
		child.stdin.write(
			`${JSON.stringify(rpcMessage ?? { id: "smoke-state", type: "get_state" })}\n`,
		);
	if (!rpc) child.stdin.end();
	const status = await new Promise((resolveResult, reject) => {
		const timer = setTimeout(() => {
			child.kill();
			reject(
				new Error(
					`Pi smoke timed out after ${timeoutMs}ms\nstdout:\n${stdout.toString("utf8")}\nstderr:\n${stderr.toString("utf8")}`,
				),
			);
		}, timeoutMs);
		child.once("error", (error) => {
			clearTimeout(timer);
			reject(error);
		});
		child.once("close", (code, signal) => {
			clearTimeout(timer);
			resolveResult({ code, signal });
		});
	});
	return {
		...status,
		stdout: stdout.toString("utf8"),
		stderr: stderr.toString("utf8"),
	};
}

export async function runIsolatedPiSmoke(options = {}) {
	const live = options.live ?? false;
	const scenario = options.scenario ?? "default";
	if (
		scenario !== "default" &&
		scenario !== "orchestration-telemetry" &&
		scenario !== "goal-lifecycle"
	)
		throw new Error(`Unknown smoke scenario: ${scenario}`);
	if (scenario === "orchestration-telemetry" && !live)
		throw new Error("orchestration-telemetry requires --live");

	const scratch = await realpath(
		await mkdtemp(
			join(options.scratchParent ?? tmpdir(), "pi-isolated-smoke-"),
		),
	);
	const projectDir = join(scratch, "project");
	const metricsDir = join(scratch, "metrics");
	const operatorDir = join(scratch, "operator");
	const frictionDir = join(scratch, "workflow-friction");
	const loopDir = join(scratch, "loops");
	const legacySourceDir = join(scratch, "legacy-source");
	await Promise.all(
		[
			projectDir,
			metricsDir,
			operatorDir,
			frictionDir,
			loopDir,
			legacySourceDir,
		].map(
			(dir) => mkdir(dir, { recursive: true }),
		),
	);
	await mkdir(join(projectDir, ".pi"), { recursive: true });
	await writeFile(
		join(projectDir, ".pi", "todo.json"),
		JSON.stringify({
			items: [
				{ id: LEGACY_SENTINEL, title: LEGACY_SENTINEL, status: "pending" },
			],
		}),
	);

	const scriptDir = dirname(fileURLToPath(import.meta.url));
	const localPiCli = resolve(
		scriptDir,
		"../node_modules/@earendil-works/pi-coding-agent/dist/cli.js",
	);
	const command = options.command ?? process.execPath;
	const commandArgs = options.commandArgs ?? [localPiCli];
	const extension = (name) => resolve(scriptDir, `../extensions/${name}`);
	const commonArgs = [
		"--no-session",
		"--no-skills",
		"--no-prompt-templates",
		"--no-context-files",
		"--no-approve",
		"--no-extensions",
	];
	const env = {
		...process.env,
		PI_LEGACY_TODO_SOURCE_DIR: legacySourceDir,
		PI_METRICS_DIR: metricsDir,
		PI_OPERATOR_DIR: operatorDir,
		PI_WORKFLOW_FRICTION_DIR: frictionDir,
		PI_LOOP_DIR: loopDir,
	};
	for (const name of [
		"PI_SUBAGENT_RUN_ID",
		"PI_SUBAGENT_ROLE",
		"PI_SUBAGENT_DEPTH",
		"PI_SUBAGENT_COORDINATOR_TASK_ID",
		"PI_SUBAGENT_TREE_BROKER_HOST",
		"PI_SUBAGENT_TREE_BROKER_PORT",
		"PI_SUBAGENT_TREE_BROKER_TOKEN",
		"PI_SUBAGENT_TREE_ID",
		"PI_SUBAGENT_TREE_RUN_ID",
		"PI_SUBAGENT_TREE_ROLE",
		"PI_SUBAGENT_TREE_DEPTH",
	])
		delete env[name];
	const invocations = [];
	const results = [];
	if (scenario === "goal-lifecycle") {
		const goalSpecDir = join(projectDir, ".specs", "smoke");
		await mkdir(goalSpecDir, { recursive: true });
		await writeFile(
			join(goalSpecDir, "goal.md"),
			"Complete the disposable lifecycle smoke.\n",
		);
		await writeFile(
			join(goalSpecDir, "plan.md"),
			[
				"---",
				"created: 2026-08-15",
				"status: ready",
				"completed:",
				"---",
				"",
				"# Plan",
				"",
				"## Objective",
				"",
				"Complete the disposable lifecycle smoke.",
				"",
				"## Boundaries",
				"",
				"- In scope: Disposable lifecycle state and command behavior.",
				"- Out of scope: Persistent repository or external service changes.",
				"",
				"## Tasks",
				"",
				"- [ ] **T1: Prepare the lifecycle smoke**",
				"  - Files: fixture.txt",
				"  - Change: Prepare the disposable lifecycle fixture.",
				"  - Done when: The fixture is ready for dependent work.",
				"  - Verify: Inspect the fixture state.",
				"- [ ] **T2: Complete the lifecycle smoke**",
				"  - Depends on: T1",
				"  - Files: fixture.txt",
				"  - Change: Complete the disposable lifecycle fixture.",
				"  - Done when: The dependent lifecycle work is complete.",
				"  - Verify: Run the lifecycle smoke check.",
				"",
				"## Validation",
				"",
				"- [ ] Run the lifecycle smoke.",
				"",
				"## Retention",
				"",
				"Archive to .specs/archive/smoke/.",
				"",
				"## Execution Status",
				"",
				"- State: ready",
				"- Resume: /do-it .specs/smoke/plan.md",
				"",
			].join("\n"),
		);
		for (const args of [
			["init", "-q"],
			["config", "user.email", "goal-smoke@example.invalid"],
			["config", "user.name", "Goal Smoke"],
			["add", "--", "."],
			["commit", "-q", "-m", "test: initialize goal smoke"],
		]) {
			const result = await runProcess({
				command: "git",
				args,
				cwd: projectDir,
				env,
				timeoutMs: TIMEOUT_MS,
				rpc: false,
			});
			if (result.code !== 0)
				throw new Error(`Goal smoke Git setup failed: ${result.stderr}`);
		}
		const piArgs = [
			...commonArgs,
			"--mode",
			"rpc",
			"--extension",
			extension("goal.ts"),
		];
		for (const [id, message] of [
			["goal-start", "/goal --unattended .specs/smoke/goal.md"],
			["goal-status", "/goal status"],
			["goal-stop", "/goal stop"],
			["goal-resume", "/goal resume"],
			["goal-stop-again", "/goal stop"],
		]) {
			invocations.push(piArgs);
			const result = await runProcess({
				command,
				args: [...commandArgs, ...piArgs],
				cwd: projectDir,
				env,
				timeoutMs: options.timeoutMs ?? GOAL_LIFECYCLE_TIMEOUT_MS,
				rpc: true,
				rpcMessage: { id, type: "prompt", message },
				killAfterRpcResponse: true,
			});
			results.push(result);
			if (!result.stdout.includes(`"id":"${id}"`))
				throw new Error(
					`Goal lifecycle command ${id} did not respond: ${result.stderr}\n${result.stdout}`,
				);
			if (id === "goal-start") {
				const jobs = await readdir(loopDir);
				if (jobs.length !== 1)
					throw new Error(
						`Expected one goal loop job, found ${jobs.length}: ${result.stderr}\n${result.stdout}`,
					);
				const job = JSON.parse(
					await readFile(join(loopDir, jobs[0], "job.json"), "utf8"),
				);
				if (job.goal?.state !== "running" || job.goal?.id !== job.id)
					throw new Error("Goal launch did not persist correlated running state");
				if (Object.keys(job.goal?.items ?? {}).length !== 2)
					throw new Error("Goal launch did not materialize both plan tasks");
				const prerequisite = JSON.parse(
					await readFile(
						join(operatorDir, "tasks", `${job.goal.items.T1.taskId}.json`),
						"utf8",
					),
				);
				const dependent = JSON.parse(
					await readFile(
						join(operatorDir, "tasks", `${job.goal.items.T2.taskId}.json`),
						"utf8",
					),
				);
				if (
					dependent.blockedBy?.length !== 1 ||
					dependent.blockedBy[0] !== prerequisite.id
				)
					throw new Error("Goal launch did not preserve the plan dependency edge");
			}
			if (id === "goal-stop" || id === "goal-stop-again") {
				const [jobId] = await readdir(loopDir);
				const job = JSON.parse(
					await readFile(join(loopDir, jobId, "job.json"), "utf8"),
				);
				if (job.goal?.state !== "stopped")
					throw new Error("Goal stop did not persist stopped state");
			}
			if (id === "goal-resume") {
				const [jobId] = await readdir(loopDir);
				const job = JSON.parse(
					await readFile(join(loopDir, jobId, "job.json"), "utf8"),
				);
				if (job.goal?.state !== "running")
					throw new Error("Goal resume did not restore running state");
			}
		}
	} else if (scenario === "orchestration-telemetry") {
		invocations.push([
			...commonArgs,
			"--mode",
			"json",
			"--extension",
			extension("subagent/index.ts"),
			"--extension",
			extension("workflow-friction-review.ts"),
			"--print",
			"Use the subagent tool exactly once with agent teamlead and role coordinator. Tell the coordinator to use subagent exactly once with agent explorer and role leaf, ask that leaf to reply exactly telemetry-worker-ok, and then reply exactly telemetry-coordinator-ok. After the coordinator completes, reply exactly orchestration-live-ok. Do not answer directly without completing this hierarchy.",
		]);
		invocations.push([
			...commonArgs,
			"--mode",
			"json",
			"--no-tools",
			"--extension",
			extension("orchestration-stats.ts"),
			"--print",
			"/orchestration-stats 1",
		]);
	} else {
		invocations.push(
			live
				? [
						...commonArgs,
						"--extension",
						extension("tasks.ts"),
						"--no-tools",
						"--print",
						"Reply with exactly: isolated-pi-smoke-ok",
					]
				: [
						...commonArgs,
						"--extension",
						extension("tasks.ts"),
						"--mode",
						"rpc",
					],
		);
	}

	if (scenario !== "goal-lifecycle")
		for (const piArgs of invocations) {
			results.push(
				await runProcess({
					command,
					args: [...commandArgs, ...piArgs],
					cwd: projectDir,
					env,
					timeoutMs:
						options.timeoutMs ?? (live ? LIVE_TIMEOUT_MS : TIMEOUT_MS),
					rpc: !live,
				}),
			);
		}
	const stdoutText = results.map((result) => result.stdout).join("\n");
	const stderrText = results.map((result) => result.stderr).join("\n");
	if (scenario === "orchestration-telemetry") {
		if (results.some((result) => result.code !== 0))
			throw new Error(`Orchestration telemetry smoke failed: ${stderrText}`);
		if (!results[0].stdout.includes("orchestration-live-ok"))
			throw new Error(`Paid delegation did not complete: ${stderrText}`);
		if (reportCount(results[1].stdout, "delegated") !== 1)
			throw new Error(
				`Expected one delegated interaction: ${results[1].stdout}`,
			);
		if (reportCount(results[1].stdout, "referenced run IDs") !== 1)
			throw new Error(`Expected one referenced run ID: ${results[1].stdout}`);
		const workers = [];
		for (const file of await listFiles(metricsDir)) {
			for (const line of (await readFile(file, "utf8")).split("\n")) {
				if (!line.trim()) continue;
				const record = JSON.parse(line);
				if (record.event === "orchestration_run")
					workers.push(...(record.data?.workers ?? []));
			}
		}
		const coordinator = workers.find((worker) => worker.role === "coordinator");
		const leaf = workers.find((worker) => worker.role === "leaf");
		if (!coordinator || !leaf || coordinator.treeId !== leaf.treeId)
			throw new Error(
				`Expected one correlated coordinator and leaf: ${results[0].stdout}`,
			);
	} else if (scenario === "goal-lifecycle") {
		if (results.length !== 5)
			throw new Error(`Expected five goal lifecycle commands, found ${results.length}`);
	} else if (
		live &&
		(results[0].code !== 0 ||
			!results[0].stdout.includes("isolated-pi-smoke-ok"))
	)
		throw new Error(`Live Pi smoke failed (${results[0].code}): ${stderrText}`);
	else if (!live && !results[0].stdout.includes('"id":"smoke-state"'))
		throw new Error(`Pi RPC smoke did not become ready: ${stderrText}`);

	for (const root of [metricsDir, operatorDir, frictionDir, loopDir]) {
		if (!isAbsolute(root))
			throw new Error(`Scratch root is not absolute: ${root}`);
		for (const file of await listFiles(root)) {
			assertInside(scratch, file);
			if ((await readFile(file, "utf8")).includes(LEGACY_SENTINEL))
				throw new Error(`Isolated smoke imported a legacy task: ${file}`);
		}
	}
	return {
		scratch,
		stdout: stdoutText,
		stderr: stderrText,
		args: [...commandArgs, ...invocations[0]],
		invocations: invocations.map((args) => [...commandArgs, ...args]),
	};
}

const isMain =
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
	const positional = process.argv.slice(2).filter((arg) => arg !== "--live");
	if (positional.length > 1)
		throw new Error(`Unknown argument: ${positional[1]}`);
	const scenario = positional[0] ?? "default";
	const result = await runIsolatedPiSmoke({
		live: process.argv.includes("--live"),
		scenario,
	});
	process.stdout.write(`isolated-pi-smoke-ok ${result.scratch}\n`);
}

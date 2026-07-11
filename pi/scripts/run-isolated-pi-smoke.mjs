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

async function runProcess({ command, args, cwd, env, timeoutMs, rpc }) {
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
		if (rpc && stdout.includes('"id":"smoke-state"')) child.kill();
	});
	child.stderr.on("data", (chunk) => {
		stderr = appendBounded(stderr, chunk);
	});
	if (rpc) child.stdin.write('{"id":"smoke-state","type":"get_state"}\n');
	child.stdin.end();
	const status = await new Promise((resolveResult, reject) => {
		const timer = setTimeout(() => {
			child.kill();
			reject(new Error(`Pi smoke timed out after ${timeoutMs}ms`));
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
	if (scenario !== "default" && scenario !== "orchestration-telemetry")
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
	const legacySourceDir = join(scratch, "legacy-source");
	await Promise.all(
		[projectDir, metricsDir, operatorDir, frictionDir, legacySourceDir].map(
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
	};
	const invocations = [];
	if (scenario === "orchestration-telemetry") {
		invocations.push([
			...commonArgs,
			"--mode",
			"json",
			"--extension",
			extension("subagent/index.ts"),
			"--extension",
			extension("workflow-friction-review.ts"),
			"--print",
			"Delegate exactly once with the subagent tool to coding-light. Ask it to reply with exactly telemetry-worker-ok. After it completes, reply with exactly orchestration-live-ok.",
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

	const results = [];
	for (const piArgs of invocations) {
		results.push(
			await runProcess({
				command,
				args: [...commandArgs, ...piArgs],
				cwd: projectDir,
				env,
				timeoutMs: options.timeoutMs ?? (live ? LIVE_TIMEOUT_MS : TIMEOUT_MS),
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
	} else if (
		live &&
		(results[0].code !== 0 ||
			!results[0].stdout.includes("isolated-pi-smoke-ok"))
	)
		throw new Error(`Live Pi smoke failed (${results[0].code}): ${stderrText}`);
	else if (!live && !results[0].stdout.includes('"id":"smoke-state"'))
		throw new Error(`Pi RPC smoke did not become ready: ${stderrText}`);

	for (const root of [metricsDir, operatorDir, frictionDir]) {
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

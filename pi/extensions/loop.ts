import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { wrapCommandRegistration } from "../lib/slash-command-echo.js";
import {
	filterCommitSafeFiles,
	listChangedFiles,
} from "./workflow-commands.js";

type LoopAction = "help" | "start" | "status" | "stop" | "resume";

type LoopRequest = {
	action: LoopAction;
	values: string[];
};

type LoopJob = {
	version: 1;
	id: string;
	cwd: string;
	plans: string[];
	pid: number;
	startedAt: string;
	initialHead: string;
};

function loopRoot(): string {
	if (process.env.PI_LOOP_DIR?.trim())
		return path.resolve(process.env.PI_LOOP_DIR);
	const localState = process.env.LOCALAPPDATA?.trim()
		? path.resolve(process.env.LOCALAPPDATA)
		: path.join(os.homedir(), ".local", "state");
	return path.join(localState, "pi", "loops");
}
const STATUS_KEY = "loop";
const STATUS_REFRESH_MS = 5_000;
const LOG_TAIL_BYTES = 8 * 1024;
const MAX_STATUS_JOBS = 64;
const SCRIPT_PATH = fileURLToPath(
	new URL("../scripts/run-loop.ps1", import.meta.url),
);
const PROMPT_PATH = fileURLToPath(
	new URL("../scripts/loop-prompt.md", import.meta.url),
);

function tokenize(input: string): string[] {
	const tokens: string[] = [];
	const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
	for (const match of input.matchAll(pattern))
		tokens.push(match[1] ?? match[2] ?? match[3]);
	return tokens;
}

function parseRequest(args: string): LoopRequest {
	const tokens = tokenize(args.trim());
	if (tokens.length === 0) return { action: "help", values: [] };
	const first = tokens[0].toLowerCase();
	if (["start", "status", "stop", "resume", "help"].includes(first))
		return { action: first as LoopAction, values: tokens.slice(1) };
	return { action: "start", values: tokens };
}

function boundedId(cwd: string, plans: string[]): string {
	return createHash("sha256")
		.update(`${cwd}\0${plans.join("\0")}`)
		.digest("hex")
		.slice(0, 12);
}

function isContained(root: string, candidate: string): boolean {
	const relative = path.relative(root, candidate);
	return (
		relative === "" ||
		(!relative.startsWith("..") && !path.isAbsolute(relative))
	);
}

function resolvePlans(cwd: string, values: string[]): string[] {
	if (values.length === 0) throw new Error("Provide at least one plan path.");
	const root = fs.realpathSync(cwd);
	return values.map((value) => {
		const candidate = fs.realpathSync(
			path.resolve(root, value.replace(/^@/, "")),
		);
		if (!isContained(root, candidate))
			throw new Error(`Plan must stay under the current workspace: ${value}`);
		if (!fs.statSync(candidate).isFile())
			throw new Error(`Plan is not a regular file: ${value}`);
		return path.relative(root, candidate).replaceAll(path.sep, "/");
	});
}

function jobDirectory(id: string): string {
	return path.join(loopRoot(), id);
}

function jobPath(id: string): string {
	return path.join(jobDirectory(id), "job.json");
}

function writeJob(job: LoopJob): void {
	const directory = jobDirectory(job.id);
	fs.mkdirSync(directory, { recursive: true });
	const target = jobPath(job.id);
	const temporary = `${target}.${process.pid}.tmp`;
	fs.writeFileSync(temporary, `${JSON.stringify(job, null, 2)}\n`, {
		encoding: "utf8",
		mode: 0o600,
	});
	fs.renameSync(temporary, target);
}

function readJob(id: string): LoopJob {
	return JSON.parse(fs.readFileSync(jobPath(id), "utf8")) as LoopJob;
}

function listJobs(): LoopJob[] {
	const root = loopRoot();
	if (!fs.existsSync(root)) return [];
	return fs
		.readdirSync(root, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.sort((left, right) => left.name.localeCompare(right.name))
		.slice(0, MAX_STATUS_JOBS)
		.flatMap((entry) => {
			try {
				return [readJob(entry.name)];
			} catch {
				return [];
			}
		})
		.sort((left, right) => left.startedAt.localeCompare(right.startedAt));
}

function processAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function readLoopIteration(id: string): number | undefined {
	const logPath = path.join(jobDirectory(id), "loop.log");
	try {
		const size = fs.statSync(logPath).size;
		const length = Math.min(size, LOG_TAIL_BYTES);
		const buffer = Buffer.alloc(length);
		const descriptor = fs.openSync(logPath, "r");
		try {
			fs.readSync(descriptor, buffer, 0, length, size - length);
		} finally {
			fs.closeSync(descriptor);
		}
		const lines = buffer.toString("utf8").split(/\r?\n/).reverse();
		for (const line of lines) {
			const match = line.match(/\biteration=(\d+)\b/);
			if (match) return Number(match[1]);
		}
	} catch {
		return undefined;
	}
	return undefined;
}

function formatLoopStatus(
	jobs: LoopJob[],
	isAlive: (pid: number) => boolean = processAlive,
): string | undefined {
	const running = jobs.filter((job) => isAlive(job.pid));
	if (running.length === 0) return undefined;
	if (running.length > 1) return `loops ${running.length} running`;
	const job = running[0];
	const iteration = readLoopIteration(job.id);
	return iteration === undefined
		? `loop ${job.id} starting`
		: `loop ${job.id} i${iteration}`;
}

function refreshLoopStatus(ctx: ExtensionContext): void {
	if (!ctx.hasUI) return;
	ctx.ui.setStatus(STATUS_KEY, formatLoopStatus(listJobs()));
}

function show(pi: ExtensionAPI, text: string): void {
	pi.sendMessage(
		{ customType: "loop-status", content: text, display: true },
		{ triggerTurn: false },
	);
}

function usage(): string {
	return [
		"/loop start <plan.md> [more-plan.md ...]",
		"/loop status [job-id]",
		"/loop stop <job-id>",
		"/loop resume <job-id>",
	].join("\n");
}

async function git(pi: ExtensionAPI, cwd: string, args: string[]) {
	return pi.exec("git", args, { cwd, timeout: 30_000 });
}

function committableChanges(cwd: string): string[] {
	return filterCommitSafeFiles(listChangedFiles(cwd).all).included;
}

async function preflight(pi: ExtensionAPI, cwd: string): Promise<string> {
	const root = await git(pi, cwd, ["rev-parse", "--show-toplevel"]);
	if (root.code !== 0)
		throw new Error("Current directory is not a Git worktree.");
	if (committableChanges(cwd).length > 0)
		throw new Error("The /commit baseline did not finish cleanly.");
	const head = await git(pi, cwd, ["rev-parse", "HEAD"]);
	if (head.code !== 0)
		throw new Error(head.stderr.trim() || "git rev-parse failed");

	const privatePath = path.join(cwd, "private");
	const hookPath = path.join(cwd, "scripts", "git-hooks", "pre-commit-dolos");
	if (!fs.existsSync(privatePath) && fs.existsSync(hookPath)) {
		const hook = await pi.exec("bash", [hookPath], { cwd, timeout: 30_000 });
		if (hook.code !== 0)
			throw new Error(hook.stderr.trim() || "Commit-hook preflight failed.");
	}
	return head.stdout.trim();
}

function launch(job: Omit<LoopJob, "pid" | "startedAt">): LoopJob {
	if (!fs.existsSync(SCRIPT_PATH))
		throw new Error(`Loop runner missing: ${SCRIPT_PATH}`);
	if (!fs.existsSync(PROMPT_PATH))
		throw new Error(`Loop prompt missing: ${PROMPT_PATH}`);
	const directory = jobDirectory(job.id);
	fs.mkdirSync(directory, { recursive: true });
	const child = spawn(
		"pwsh",
		[
			"-NoProfile",
			"-File",
			SCRIPT_PATH,
			"-Workspace",
			job.cwd,
			"-StateRoot",
			directory,
			"-JobId",
			job.id,
			"-PromptPath",
			PROMPT_PATH,
			"-PlanPaths",
			job.plans.join(";"),
			"-StartupDelaySeconds",
			"5",
		],
		{
			cwd: job.cwd,
			detached: true,
			stdio: "ignore",
			windowsHide: true,
		},
	);
	child.unref();
	const started: LoopJob = {
		...job,
		pid: child.pid ?? 0,
		startedAt: new Date().toISOString(),
	};
	writeJob(started);
	return started;
}

function selectJob(values: string[], cwd: string): LoopJob {
	if (values[0]) return readJob(values[0]);
	const matches = listJobs().filter(
		(job) => path.resolve(job.cwd) === path.resolve(cwd),
	);
	if (matches.length !== 1)
		throw new Error("Specify a job id. Use /loop status to list jobs.");
	return matches[0];
}

async function stopJob(pi: ExtensionAPI, job: LoopJob): Promise<void> {
	if (!processAlive(job.pid)) return;
	if (process.platform === "win32") {
		const result = await pi.exec(
			"taskkill",
			["/PID", String(job.pid), "/T", "/F"],
			{ timeout: 30_000 },
		);
		if (result.code !== 0 && processAlive(job.pid))
			throw new Error(
				result.stderr.trim() || "Failed to stop loop process tree.",
			);
		return;
	}
	process.kill(-job.pid, "SIGTERM");
}

async function handleLoop(
	pi: ExtensionAPI,
	args: string,
	ctx: ExtensionCommandContext,
): Promise<void> {
	const request = parseRequest(args);
	if (request.action === "help") {
		show(pi, usage());
		return;
	}
	if (request.action === "status") {
		const jobs = request.values[0] ? [readJob(request.values[0])] : listJobs();
		show(
			pi,
			jobs.length === 0
				? "No loop jobs found."
				: jobs
						.map(
							(job) =>
								`${job.id} ${processAlive(job.pid) ? "running" : "stopped"} ${job.cwd} ${job.plans.join(", ")}`,
						)
						.join("\n"),
		);
		return;
	}
	if (request.action === "stop") {
		const job = selectJob(request.values, ctx.cwd);
		await stopJob(pi, job);
		show(pi, `Stopped loop ${job.id}.`);
		return;
	}
	if (request.action === "resume") {
		const prior = selectJob(request.values, ctx.cwd);
		if (processAlive(prior.pid))
			throw new Error(`Loop ${prior.id} is already running.`);
		const started = launch({
			version: 1,
			id: prior.id,
			cwd: prior.cwd,
			plans: prior.plans,
			initialHead: prior.initialHead,
		});
		show(pi, `Resumed loop ${started.id} (PID ${started.pid}).`);
		return;
	}

	if (ctx.mode !== "tui") throw new Error("/loop start requires TUI mode.");
	const baselineComplete = request.values.includes("--baseline-complete");
	const planValues = request.values.filter(
		(value) => value !== "--baseline-complete",
	);
	const plans = resolvePlans(ctx.cwd, planValues);
	const cwd = fs.realpathSync(ctx.cwd);
	const active = listJobs().find(
		(job) =>
			processAlive(job.pid) &&
			job.plans.join("\0") === plans.join("\0") &&
			(path.resolve(job.cwd) === path.resolve(cwd) ||
				isContained(cwd, job.cwd) ||
				isContained(job.cwd, cwd)),
	);
	if (active)
		throw new Error(`Loop ${active.id} is already running for these plans.`);

	if (committableChanges(cwd).length > 0) {
		if (baselineComplete)
			throw new Error(
				"The /commit baseline left outstanding changes. Resolve them before restarting /loop.",
			);
		const quotedPlans = plans.map((plan) => `"${plan}"`).join(" ");
		show(pi, "Preparing the loop baseline through /commit.");
		setTimeout(() => {
			pi.sendUserMessage("/commit", { deliverAs: "followUp" });
			pi.sendUserMessage(`/loop start ${quotedPlans} --baseline-complete`, {
				deliverAs: "followUp",
			});
		}, 0);
		return;
	}

	const initialHead = await preflight(pi, cwd);
	const id = boundedId(cwd, plans);
	const started = launch({ version: 1, id, cwd, plans, initialHead });
	show(
		pi,
		`Started loop ${started.id} (PID ${started.pid}). Pi will exit so the loop can take over this worktree. Baseline: ${initialHead.slice(0, 12)}.`,
	);
	ctx.shutdown();
}

export const loopTestApi = {
	boundedId,
	formatLoopStatus,
	parseRequest,
	processAlive,
	readLoopIteration,
	resolvePlans,
};

export default function (pi: ExtensionAPI) {
	let statusTimer: ReturnType<typeof setInterval> | undefined;
	wrapCommandRegistration(pi);
	pi.on("session_start", (_event, ctx) => {
		if (statusTimer) clearInterval(statusTimer);
		refreshLoopStatus(ctx);
		if (!ctx.hasUI) return;
		statusTimer = setInterval(() => refreshLoopStatus(ctx), STATUS_REFRESH_MS);
		statusTimer.unref?.();
	});
	pi.on("session_shutdown", (_event, ctx) => {
		if (statusTimer) clearInterval(statusTimer);
		statusTimer = undefined;
		if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
	});
	pi.registerCommand("loop", {
		description: "Start, resume, inspect, or stop a durable plan loop",
		handler: async (args, ctx) => {
			try {
				await handleLoop(pi, args, ctx);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				show(pi, `Loop error: ${message}`);
				ctx.ui.notify(message, "error");
			}
		},
	});
}

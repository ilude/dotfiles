/**
 * Test Orchestrator (extension-first MVP core)
 *
 * Loads a project-local adapter config, validates the MVP schema shape,
 * resolves runtime state paths, discovers targets, executes one test run at a time,
 * persists attempt/recovery state to disk, and exposes status/debug commands.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

type ShellKind = "bash" | "pwsh";
type TargetKind = "spec";
type ClassificationStatus = "pass" | "test_failure" | "infra_failure" | "blocked" | "recovery_run";
type RecoveryStatus = "success" | "partial_failure" | "failed" | "cancelled";

interface RecoveryStep {
	kind: "command" | "delete_glob";
	shell?: ShellKind;
	command?: string;
	paths?: string[];
}

interface RecoveryAction {
	description: string;
	requiresConfirmation: boolean;
	steps: RecoveryStep[];
}

interface AdapterConfig {
	schemaVersion: number;
	project: {
		id: string;
		name: string;
		root: string;
		platform: string;
	};
	discovery: {
		targetKind: TargetKind;
		include: string[];
		exclude: string[];
	};
	runner: {
		command: string;
		shell: ShellKind;
		cwd: string;
		resultPaths: string[];
		env: Record<string, string>;
	};
	canary: {
		target: string;
		clearPathsBeforeRun: string[];
	};
	recoveryActions: Record<string, RecoveryAction>;
	classificationHints: {
		infraPatterns: string[];
		testPatterns: string[];
	};
	artifacts: {
		attemptRoot: string;
		stateRoot: string;
		recoveryLog: string;
	};
}

interface LoadedAdapter {
	configPath: string;
	repoRoot: string;
	config: AdapterConfig;
	resolved: {
		attemptRoot: string;
		stateRoot: string;
		recoveryLog: string;
		resultPaths: string[];
		lockPath: string;
		latestStatePath: string;
	};
	diagnostics: string[];
}

interface LockState {
	schemaVersion: number;
	lockId: string;
	projectId: string;
	owner: {
		pid: number;
		hostname: string;
		sessionId: string | null;
	};
	target: {
		kind: string;
		name: string;
		slug: string;
	};
	run: {
		command: string;
		startedAt: string;
		heartbeatAt: string;
		status: string;
	};
	stale: {
		timeoutMs: number;
		manualClearRequired: boolean;
	};
}

interface TargetInfo {
	kind: TargetKind;
	name: string;
	path: string;
	slug: string;
}

interface AttemptRecord {
	schemaVersion: number;
	id: string;
	projectId: string;
	target: TargetInfo;
	run: {
		command: string;
		shell: ShellKind;
		cwd: string;
		startedAt: string;
		endedAt: string;
		durationMs: number;
		exitCode: number;
	};
	classification: {
		status: ClassificationStatus;
		reason: string;
		evidence: string[];
	};
	artifacts: {
		resultPaths: string[];
		screenshots: string[];
		traces: string[];
		logs: string[];
	};
	related: {
		lockId: string;
		recoveryRunIds: string[];
		canaryAttemptId: string | null;
	};
	summary: string;
}

interface RecoveryLogEntry {
	schemaVersion: number;
	id: string;
	projectId: string;
	action: string;
	startedAt: string;
	endedAt: string;
	status: RecoveryStatus;
	trigger: {
		reason: string;
		confirmedByUser: boolean;
	};
	steps: Array<{
		name: string;
		status: "success" | "failed" | "cancelled";
		details?: string;
	}>;
	postChecks: string[];
	summary: string;
}

interface LatestState {
	schemaVersion: number;
	projectId: string;
	adapterPath: string;
	updatedAt: string;
	lastAttemptId: string | null;
	lastAttemptPath: string | null;
	lastAttemptStatus: ClassificationStatus | null;
	lastCanaryAttemptId: string | null;
	lastCanaryStatus: ClassificationStatus | null;
	lastRecoveryId: string | null;
	lastRecoveryStatus: RecoveryStatus | null;
}

const ADAPTER_CANDIDATES = [
	path.join(".pi", "test-orchestrator.config.json"),
	path.join(".specs", "test-orchestrator", "config.json"),
	path.join("docs", "workflows", "test-orchestrator.config.json"),
];
const LOCK_TIMEOUT_MS = 30 * 60 * 1000;

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exists(filePath: string): boolean {
	try {
		fs.accessSync(filePath);
		return true;
	} catch {
		return false;
	}
}

function readJson<T>(filePath: string): T {
	return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function writeJson(filePath: string, data: unknown): void {
	ensureDir(path.dirname(filePath));
	fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function appendJsonl(filePath: string, data: unknown): void {
	ensureDir(path.dirname(filePath));
	fs.appendFileSync(filePath, `${JSON.stringify(data)}\n`, "utf-8");
}

function nowIso(): string {
	return new Date().toISOString();
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function timestampId(): string {
	return nowIso().replace(/[:.]/g, "-");
}

function findAdapterConfig(startCwd: string): { configPath: string; repoRoot: string } | null {
	let current = path.resolve(startCwd);

	for (;;) {
		for (const rel of ADAPTER_CANDIDATES) {
			const candidate = path.join(current, rel);
			if (exists(candidate)) {
				return { configPath: candidate, repoRoot: current };
			}
		}
		const parent = path.dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}

function resolveFromRepo(repoRoot: string, maybeRelative: string): string {
	return path.isAbsolute(maybeRelative) ? maybeRelative : path.resolve(repoRoot, maybeRelative);
}

function slugify(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function ensureDir(dirPath: string): void {
	if (!exists(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function validateAdapterShape(config: unknown, repoRoot: string, configPath: string): { config?: AdapterConfig; diagnostics: string[] } {
	const diagnostics: string[] = [];
	if (!isObject(config)) {
		return { diagnostics: [`Adapter at ${configPath} is not a JSON object.`] };
	}

	const schemaVersion = config.schemaVersion;
	if (schemaVersion !== 1) diagnostics.push(`schemaVersion must be 1; got ${String(schemaVersion)}.`);

	const project = isObject(config.project) ? config.project : null;
	if (!project) diagnostics.push("project block is required.");
	const discovery = isObject(config.discovery) ? config.discovery : null;
	if (!discovery) diagnostics.push("discovery block is required.");
	const runner = isObject(config.runner) ? config.runner : null;
	if (!runner) diagnostics.push("runner block is required.");
	const canary = isObject(config.canary) ? config.canary : null;
	if (!canary) diagnostics.push("canary block is required.");
	const artifacts = isObject(config.artifacts) ? config.artifacts : null;
	if (!artifacts) diagnostics.push("artifacts block is required.");
	const recoveryActions = isObject(config.recoveryActions) ? config.recoveryActions : null;
	if (!recoveryActions) diagnostics.push("recoveryActions block is required.");
	const classificationHints = isObject(config.classificationHints) ? config.classificationHints : null;
	if (!classificationHints) diagnostics.push("classificationHints block is required.");

	if (project) {
		if (typeof project.id !== "string" || project.id.trim() === "") diagnostics.push("project.id must be a non-empty string.");
		if (typeof project.name !== "string" || project.name.trim() === "") diagnostics.push("project.name must be a non-empty string.");
	}

	if (discovery) {
		if (discovery.targetKind !== "spec") diagnostics.push(`discovery.targetKind must be 'spec'; got ${String(discovery.targetKind)}.`);
		if (!Array.isArray(discovery.include) || discovery.include.length === 0) diagnostics.push("discovery.include must contain at least one pattern.");
	}

	if (runner) {
		if (typeof runner.command !== "string" || !runner.command.includes("{{target}}")) {
			diagnostics.push("runner.command must be a string containing {{target}}.");
		}
		if (runner.shell !== "bash" && runner.shell !== "pwsh") diagnostics.push("runner.shell must be 'bash' or 'pwsh'.");
	}

	if (canary) {
		if (typeof canary.target !== "string" || canary.target.trim() === "") diagnostics.push("canary.target must be a non-empty string.");
	}

	if (artifacts) {
		for (const key of ["attemptRoot", "stateRoot", "recoveryLog"] as const) {
			if (typeof artifacts[key] !== "string" || artifacts[key].trim() === "") diagnostics.push(`artifacts.${key} must be a non-empty string.`);
		}
	}

	if (classificationHints) {
		if (!Array.isArray(classificationHints.infraPatterns)) diagnostics.push("classificationHints.infraPatterns must be an array.");
		if (!Array.isArray(classificationHints.testPatterns)) diagnostics.push("classificationHints.testPatterns must be an array.");
	}

	if (recoveryActions) {
		for (const [name, action] of Object.entries(recoveryActions)) {
			if (!isObject(action)) {
				diagnostics.push(`recoveryActions.${name} must be an object.`);
				continue;
			}
			if (!Array.isArray(action.steps) || action.steps.length === 0) {
				diagnostics.push(`recoveryActions.${name}.steps must be a non-empty array.`);
			}
		}
	}

	if (runner && Array.isArray(runner.resultPaths)) {
		for (const resultPath of runner.resultPaths) {
			const resolved = resolveFromRepo(repoRoot, String(resultPath));
			if (!exists(resolved)) diagnostics.push(`runner.resultPaths entry does not exist: ${resultPath}`);
		}
	}
	if (canary && typeof canary.target === "string") {
		const canaryPath = resolveFromRepo(repoRoot, path.join("eisa-ng", "e2e", "playwright", "tests", canary.target));
		if (!exists(canaryPath)) diagnostics.push(`canary target file not found at expected path: ${canary.target}`);
	}
	const waitForKeycloak = resolveFromRepo(repoRoot, path.join("scripts", "wait-for-keycloak.sh"));
	if (exists(configPath) && !exists(waitForKeycloak)) {
		diagnostics.push("scripts/wait-for-keycloak.sh is missing; adapter recovery assumptions will fail.");
	}

	if (diagnostics.length > 0) return { diagnostics };
	return { config: config as unknown as AdapterConfig, diagnostics };
}

function loadAdapter(ctx: ExtensionContext): LoadedAdapter | null {
	const found = findAdapterConfig(ctx.cwd);
	if (!found) return null;
	const raw = readJson<unknown>(found.configPath);
	const validated = validateAdapterShape(raw, found.repoRoot, found.configPath);
	if (!validated.config) {
		return {
			configPath: found.configPath,
			repoRoot: found.repoRoot,
			config: raw as AdapterConfig,
			resolved: {
				attemptRoot: resolveFromRepo(found.repoRoot, ".specs/pi-test-orchestrator-runtime/attempts"),
				stateRoot: resolveFromRepo(found.repoRoot, ".specs/pi-test-orchestrator-runtime/state"),
				recoveryLog: resolveFromRepo(found.repoRoot, ".specs/pi-test-orchestrator-runtime/recoveries.jsonl"),
				resultPaths: [],
				lockPath: resolveFromRepo(found.repoRoot, ".specs/pi-test-orchestrator-runtime/state/active-run.json"),
				latestStatePath: resolveFromRepo(found.repoRoot, ".specs/pi-test-orchestrator-runtime/state/latest.json"),
			},
			diagnostics: validated.diagnostics,
		};
	}

	const config = validated.config;
	const attemptRoot = resolveFromRepo(found.repoRoot, config.artifacts.attemptRoot);
	const stateRoot = resolveFromRepo(found.repoRoot, config.artifacts.stateRoot);
	const recoveryLog = resolveFromRepo(found.repoRoot, config.artifacts.recoveryLog);
	ensureDir(attemptRoot);
	ensureDir(stateRoot);
	ensureDir(path.dirname(recoveryLog));

	return {
		configPath: found.configPath,
		repoRoot: found.repoRoot,
		config,
		resolved: {
			attemptRoot,
			stateRoot,
			recoveryLog,
			resultPaths: config.runner.resultPaths.map((item) => resolveFromRepo(found.repoRoot, item)),
			lockPath: path.join(stateRoot, "active-run.json"),
			latestStatePath: path.join(stateRoot, "latest.json"),
		},
		diagnostics: [],
	};
}

function readLock(lockPath: string): LockState | null {
	try {
		return readJson<LockState>(lockPath);
	} catch {
		return null;
	}
}

function isLockStale(lock: LockState): boolean {
	return Date.now() - new Date(lock.run.heartbeatAt).getTime() > lock.stale.timeoutMs;
}

function writeLatestState(adapter: LoadedAdapter, patch: Partial<LatestState>): LatestState {
	const current = exists(adapter.resolved.latestStatePath)
		? readJson<LatestState>(adapter.resolved.latestStatePath)
		: {
				schemaVersion: 1,
				projectId: adapter.config.project.id,
				adapterPath: adapter.configPath,
				updatedAt: nowIso(),
				lastAttemptId: null,
				lastAttemptPath: null,
				lastAttemptStatus: null,
				lastCanaryAttemptId: null,
				lastCanaryStatus: null,
				lastRecoveryId: null,
				lastRecoveryStatus: null,
			};
	const next: LatestState = {
		...current,
		...patch,
		adapterPath: adapter.configPath,
		projectId: adapter.config.project.id,
		updatedAt: nowIso(),
	};
	writeJson(adapter.resolved.latestStatePath, next);
	return next;
}

function latestAttemptSummary(attemptRoot: string): { path: string; summary: string } | null {
	if (!exists(attemptRoot)) return null;
	const files: string[] = [];
	const walk = (dir: string) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (entry.isFile() && entry.name.endsWith(".json")) files.push(full);
		}
	};
	walk(attemptRoot);
	if (files.length === 0) return null;
	files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
	try {
		const latest = readJson<Record<string, unknown>>(files[0]);
		const summary = typeof latest.summary === "string" ? latest.summary : "No summary";
		return { path: files[0], summary };
	} catch {
		return { path: files[0], summary: "Unreadable latest attempt record" };
	}
}

function latestRecoverySummary(recoveryLogPath: string): { path: string; summary: string } | null {
	if (!exists(recoveryLogPath)) return null;
	const content = fs.readFileSync(recoveryLogPath, "utf-8").trim();
	if (!content) return null;
	const lines = content.split(/\r?\n/).filter(Boolean);
	if (lines.length === 0) return null;
	try {
		const latest = JSON.parse(lines[lines.length - 1]) as Record<string, unknown>;
		const summary = typeof latest.summary === "string" ? latest.summary : "No summary";
		return { path: recoveryLogPath, summary };
	} catch {
		return { path: recoveryLogPath, summary: "Unreadable latest recovery log entry" };
	}
}

function discoverTargets(adapter: LoadedAdapter): TargetInfo[] {
	const targets: TargetInfo[] = [];
	const base = path.join(adapter.repoRoot, "eisa-ng", "e2e", "playwright", "tests");
	if (!exists(base)) return targets;
	const walk = (dir: string) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
				continue;
			}
			if (!entry.isFile() || !entry.name.endsWith(".spec.ts")) continue;
			const rel = path.relative(adapter.repoRoot, full).replace(/\\/g, "/");
			targets.push({
				kind: "spec",
				name: entry.name,
				path: rel,
				slug: slugify(entry.name),
			});
		}
	};
	walk(base);
	targets.sort((a, b) => a.name.localeCompare(b.name));
	return targets;
}

function findTarget(adapter: LoadedAdapter, requested: string): TargetInfo | null {
	const trimmed = requested.trim();
	if (!trimmed) return null;
	const all = discoverTargets(adapter);
	return all.find((item) => item.name === trimmed || item.path === trimmed) ?? null;
}

function shellArgs(shell: ShellKind, command: string): { command: string; args: string[] } {
	if (shell === "pwsh") return { command: "pwsh", args: ["-NoLogo", "-Command", command] };
	return { command: "bash", args: ["-lc", command] };
}

async function clearGlobPaths(adapter: LoadedAdapter, patterns: string[]): Promise<string[]> {
	const deleted: string[] = [];
	for (const pattern of patterns) {
		const resolved = resolveFromRepo(adapter.repoRoot, pattern);
		if (!resolved.includes("*")) {
			if (exists(resolved)) {
				fs.rmSync(resolved, { force: true, recursive: false });
				deleted.push(path.relative(adapter.repoRoot, resolved).replace(/\\/g, "/"));
			}
			continue;
		}
		const dir = path.dirname(resolved);
		const base = path.basename(resolved);
		const regex = new RegExp(`^${base.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
		if (!exists(dir)) continue;
		for (const name of fs.readdirSync(dir)) {
			if (!regex.test(name)) continue;
			const full = path.join(dir, name);
			if (fs.statSync(full).isFile()) {
				fs.rmSync(full, { force: true });
				deleted.push(path.relative(adapter.repoRoot, full).replace(/\\/g, "/"));
			}
		}
	}
	return deleted;
}

function listArtifactFiles(dir: string, suffixes: string[]): string[] {
	if (!exists(dir)) return [];
	const files: string[] = [];
	const walk = (current: string) => {
		for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
			const full = path.join(current, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (entry.isFile() && suffixes.some((suffix) => entry.name.endsWith(suffix))) files.push(full);
		}
	};
	walk(dir);
	return files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

function createLock(adapter: LoadedAdapter, ctx: ExtensionContext, target: TargetInfo, command: string, status: string): LockState {
	return {
		schemaVersion: 1,
		lockId: `lock_${adapter.config.project.id}`,
		projectId: adapter.config.project.id,
		owner: {
			pid: process.pid,
			hostname: os.hostname(),
			sessionId: ctx.sessionManager.getSessionId() ?? null,
		},
		target: {
			kind: target.kind,
			name: target.name,
			slug: target.slug,
		},
		run: {
			command,
			startedAt: nowIso(),
			heartbeatAt: nowIso(),
			status,
		},
		stale: {
			timeoutMs: LOCK_TIMEOUT_MS,
			manualClearRequired: true,
		},
	};
}

function acquireLock(adapter: LoadedAdapter, lock: LockState): { ok: true } | { ok: false; reason: string; lock: LockState | null } {
	const existing = readLock(adapter.resolved.lockPath);
	if (existing) {
		if (isLockStale(existing)) {
			existing.run.status = "stale";
			writeJson(adapter.resolved.lockPath, existing);
			return { ok: false, reason: "Existing lock is stale and must be cleared explicitly with /test-lock-clear.", lock: existing };
		}
		return { ok: false, reason: `Active lock held for ${existing.target.name} since ${existing.run.startedAt}.`, lock: existing };
	}
	try {
		const fd = fs.openSync(adapter.resolved.lockPath, "wx");
		fs.writeFileSync(fd, JSON.stringify(lock, null, 2), "utf-8");
		fs.closeSync(fd);
		return { ok: true };
	} catch {
		const collision = readLock(adapter.resolved.lockPath);
		return { ok: false, reason: "Failed to acquire lock atomically.", lock: collision };
	}
}

function updateLockHeartbeat(adapter: LoadedAdapter, patch?: Partial<LockState["run"]>): void {
	const lock = readLock(adapter.resolved.lockPath);
	if (!lock) return;
	lock.run = {
		...lock.run,
		...patch,
		heartbeatAt: nowIso(),
	};
	writeJson(adapter.resolved.lockPath, lock);
}

function releaseLock(adapter: LoadedAdapter): void {
	if (exists(adapter.resolved.lockPath)) fs.rmSync(adapter.resolved.lockPath, { force: true });
}

function parseFailureText(output: string, adapter: LoadedAdapter): { reason: string; evidence: string[]; status: ClassificationStatus } {
	const text = output.toLowerCase();
	for (const pattern of adapter.config.classificationHints.infraPatterns) {
		if (text.includes(pattern.toLowerCase())) {
			return { status: "infra_failure", reason: `Matched infra pattern: ${pattern}`, evidence: [pattern] };
		}
	}
	for (const pattern of adapter.config.classificationHints.testPatterns) {
		if (text.includes(pattern.toLowerCase())) {
			return { status: "test_failure", reason: `Matched test pattern: ${pattern}`, evidence: [pattern] };
		}
	}
	return { status: "test_failure", reason: "Non-zero exit code without infra-pattern match", evidence: ["exit code != 0"] };
}

function latestState(adapter: LoadedAdapter): LatestState | null {
	try {
		return readJson<LatestState>(adapter.resolved.latestStatePath);
	} catch {
		return null;
	}
}

function classifyRun(adapter: LoadedAdapter, exitCode: number, output: string, resultPaths: string[], target: TargetInfo): { status: ClassificationStatus; reason: string; evidence: string[] } {
	if (exitCode === 0 && resultPaths.length > 0) {
		return { status: "pass", reason: "Exit code 0 and result artifacts present", evidence: ["exit code 0", "result artifact present"] };
	}
	if (target.name === adapter.config.canary.target) {
		const parsed = parseFailureText(output, adapter);
		const status = parsed.status === "test_failure" ? "infra_failure" : parsed.status;
		return {
			status,
			reason: `Canary target classified as ${status}: ${parsed.reason}`,
			evidence: ["canary target", ...parsed.evidence],
		};
	}
	const latest = latestState(adapter);
	if (latest?.lastCanaryStatus === "infra_failure") {
		return { status: "infra_failure", reason: "Latest canary failed in current state", evidence: ["latest canary status infra_failure"] };
	}
	return parseFailureText(output, adapter);
}

function writeAttempt(adapter: LoadedAdapter, record: AttemptRecord): string {
	const dir = path.join(adapter.resolved.attemptRoot, record.target.slug);
	ensureDir(dir);
	const filePath = path.join(dir, `${record.id}.json`);
	writeJson(filePath, record);
	writeLatestState(adapter, {
		lastAttemptId: record.id,
		lastAttemptPath: filePath,
		lastAttemptStatus: record.classification.status,
		...(record.target.name === adapter.config.canary.target
			? { lastCanaryAttemptId: record.id, lastCanaryStatus: record.classification.status }
			: {}),
	});
	return filePath;
}

async function runTarget(
	pi: ExtensionAPI,
	adapter: LoadedAdapter,
	ctx: ExtensionContext,
	target: TargetInfo,
	opts?: { preClearGlobs?: string[]; lockStatus?: string },
): Promise<{ record: AttemptRecord; path: string; output: string }> {
	const startedAt = Date.now();
	if (opts?.preClearGlobs && opts.preClearGlobs.length > 0) {
		await clearGlobPaths(adapter, opts.preClearGlobs);
	}
	const commandText = adapter.config.runner.command.replaceAll("{{target}}", target.name);
	const cwd = resolveFromRepo(adapter.repoRoot, adapter.config.runner.cwd);
	const shell = adapter.config.runner.shell;
	const lock = createLock(adapter, ctx, target, commandText, opts?.lockStatus ?? "running");
	const acquired = acquireLock(adapter, lock);
	if (!acquired.ok) {
		const blockedAt = nowIso();
		const record: AttemptRecord = {
			schemaVersion: 1,
			id: `${timestampId()}__${target.slug}`,
			projectId: adapter.config.project.id,
			target,
			run: {
				command: commandText,
				shell,
				cwd,
				startedAt: blockedAt,
				endedAt: blockedAt,
				durationMs: 0,
				exitCode: 999,
			},
			classification: {
				status: "blocked",
				reason: acquired.reason,
				evidence: acquired.lock ? [JSON.stringify(acquired.lock)] : ["lock acquisition failed"],
			},
			artifacts: { resultPaths: [], screenshots: [], traces: [], logs: [] },
			related: { lockId: `lock_${adapter.config.project.id}`, recoveryRunIds: [], canaryAttemptId: null },
			summary: `Blocked: ${acquired.reason}`,
		};
		const attemptPath = writeAttempt(adapter, record);
		return { record, path: attemptPath, output: acquired.reason };
	}

	let output = "";
	let exitCode = 1;
	try {
		updateLockHeartbeat(adapter, { status: opts?.lockStatus ?? "running" });
		const { command, args } = shellArgs(shell, commandText);
		const result = await pi.exec(command, args, { cwd });
		output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
		exitCode = result.code ?? 1;
		updateLockHeartbeat(adapter);
	} finally {
		releaseLock(adapter);
	}

	const resultFiles = adapter.resolved.resultPaths.flatMap((dir) => listArtifactFiles(dir, [".json"]).slice(0, 3));
	const screenshots = adapter.resolved.resultPaths.flatMap((dir) => listArtifactFiles(dir, [".png", ".jpg", ".jpeg"]).slice(0, 10));
	const traces = adapter.resolved.resultPaths.flatMap((dir) => listArtifactFiles(dir, [".zip", ".trace"]).slice(0, 10));
	const classification = classifyRun(adapter, exitCode, output, resultFiles, target);
	const endedAtIso = nowIso();
	const record: AttemptRecord = {
		schemaVersion: 1,
		id: `${timestampId()}__${target.slug}`,
		projectId: adapter.config.project.id,
		target,
		run: {
			command: commandText,
			shell,
			cwd,
			startedAt: new Date(startedAt).toISOString(),
			endedAt: endedAtIso,
			durationMs: Date.now() - startedAt,
			exitCode,
		},
		classification,
		artifacts: {
			resultPaths: resultFiles,
			screenshots,
			traces,
			logs: [],
		},
		related: {
			lockId: `lock_${adapter.config.project.id}`,
			recoveryRunIds: [],
			canaryAttemptId: target.name === adapter.config.canary.target ? null : latestState(adapter)?.lastCanaryAttemptId ?? null,
		},
		summary: `${target.name}: ${classification.status} (exit ${exitCode})`,
	};
	const attemptPath = writeAttempt(adapter, record);
	return { record, path: attemptPath, output };
}

async function runRecovery(
	pi: ExtensionAPI,
	adapter: LoadedAdapter,
	ctx: ExtensionContext,
	actionName: string,
	reason: string,
	options?: { postCheckCanary?: boolean },
): Promise<RecoveryLogEntry> {
	const action = adapter.config.recoveryActions[actionName];
	const startedAt = nowIso();
	const entry: RecoveryLogEntry = {
		schemaVersion: 1,
		id: `${timestampId()}__${slugify(actionName)}`,
		projectId: adapter.config.project.id,
		action: actionName,
		startedAt,
		endedAt: startedAt,
		status: "success",
		trigger: {
			reason,
			confirmedByUser: true,
		},
		steps: [],
		postChecks: [],
		summary: "",
	};

	for (const [index, step] of action.steps.entries()) {
		const stepName = `${index + 1}-${step.kind}`;
		if (step.kind === "delete_glob") {
			const deleted = await clearGlobPaths(adapter, step.paths ?? []);
			entry.steps.push({ name: stepName, status: "success", details: deleted.length > 0 ? deleted.join(", ") : "no matching files" });
			continue;
		}
		if (!step.command || !step.shell) {
			entry.steps.push({ name: stepName, status: "failed", details: "invalid recovery step configuration" });
			entry.status = "failed";
			break;
		}
		const { command, args } = shellArgs(step.shell, step.command);
		const result = await pi.exec(command, args, { cwd: adapter.repoRoot });
		if ((result.code ?? 1) !== 0) {
			entry.steps.push({
				name: stepName,
				status: "failed",
				details: [result.stdout, result.stderr].filter(Boolean).join("\n").trim() || `exit ${String(result.code)}`,
			});
			entry.status = "failed";
			break;
		}
		entry.steps.push({ name: stepName, status: "success" });
	}

	if (entry.status === "success" && options?.postCheckCanary !== false) {
		const canaryTarget = findTarget(adapter, adapter.config.canary.target);
		if (!canaryTarget) {
			entry.status = "partial_failure";
			entry.postChecks.push(`canary target missing: ${adapter.config.canary.target}`);
		} else {
			const maxAttempts = 3;
			let canaryPassed = false;
			for (let attempt = 1; attempt <= maxAttempts; attempt++) {
				const canaryResult = await runTarget(pi, adapter, ctx, canaryTarget, {
					preClearGlobs: adapter.config.canary.clearPathsBeforeRun,
					lockStatus: "recovery",
				});
				entry.postChecks.push(`canary attempt ${attempt}/${maxAttempts} ${canaryTarget.name}: ${canaryResult.record.classification.status}`);
				if (canaryResult.record.classification.status === "pass") {
					canaryPassed = true;
					break;
				}
				if (attempt < maxAttempts) {
					await sleep(15000);
				}
			}
			if (!canaryPassed) {
				entry.status = "partial_failure";
			}
		}
	}

	entry.endedAt = nowIso();
	entry.summary = `${actionName}: ${entry.status}`;
	appendJsonl(adapter.resolved.recoveryLog, entry);
	writeLatestState(adapter, {
		lastRecoveryId: entry.id,
		lastRecoveryStatus: entry.status,
	});
	return entry;
}

function formatPathList(paths: string[], repoRoot: string, limit = 8): string[] {
	return paths.slice(0, limit).map((item) => `- ${path.relative(repoRoot, item).replace(/\\/g, "/")}`);
}

function loadAdapterForCurrentCwd(): LoadedAdapter | null {
	return loadAdapter({ cwd: process.cwd() } as ExtensionContext);
}

function targetCompletions(prefix: string): Array<{ value: string; label: string }> | null {
	const adapter = loadAdapterForCurrentCwd();
	if (!adapter) return null;
	const values = discoverTargets(adapter)
		.filter((target) => target.name.startsWith(prefix) || target.path.startsWith(prefix))
		.slice(0, 50)
		.map((target) => ({ value: target.name, label: target.name }));
	return values.length > 0 ? values : null;
}

function recoveryCompletions(prefix: string): Array<{ value: string; label: string }> | null {
	const adapter = loadAdapterForCurrentCwd();
	if (!adapter) return null;
	const values = Object.keys(adapter.config.recoveryActions)
		.filter((name) => name.startsWith(prefix))
		.map((name) => ({ value: name, label: name }));
	return values.length > 0 ? values : null;
}

function buildStatusText(adapter: LoadedAdapter | null): string {
	if (!adapter) {
		return [
			"# Test Orchestrator Status",
			"",
			"No project adapter found.",
			"Searched relative to current cwd using:",
			...ADAPTER_CANDIDATES.map((item) => `- ${item}`),
		].join("\n");
	}

	const lock = readLock(adapter.resolved.lockPath);
	const latestAttempt = latestAttemptSummary(adapter.resolved.attemptRoot);
	const latestRecovery = latestRecoverySummary(adapter.resolved.recoveryLog);
	const latest = latestState(adapter);
	const recoveryNames = Object.keys(adapter.config.recoveryActions);

	return [
		"# Test Orchestrator Status",
		"",
		`Project: ${adapter.config.project.name} (${adapter.config.project.id})`,
		`Adapter: ${adapter.configPath}`,
		`Repo root: ${adapter.repoRoot}`,
		`Canary: ${adapter.config.canary.target}`,
		`Recovery actions: ${recoveryNames.length > 0 ? recoveryNames.join(", ") : "none"}`,
		"",
		"## Active Lock",
		lock
			? `- ${lock.target.name} (${lock.run.status}) since ${lock.run.startedAt}${isLockStale(lock) ? " [STALE]" : ""}`
			: "- none",
		"",
		"## Latest State",
		latest
			? `- lastAttemptStatus: ${latest.lastAttemptStatus ?? "none"}\n- lastCanaryStatus: ${latest.lastCanaryStatus ?? "none"}\n- lastRecoveryStatus: ${latest.lastRecoveryStatus ?? "none"}`
			: "- none",
		"",
		"## Latest Attempt",
		latestAttempt ? `- ${latestAttempt.summary}\n- ${latestAttempt.path}` : "- none",
		"",
		"## Latest Recovery",
		latestRecovery ? `- ${latestRecovery.summary}\n- ${latestRecovery.path}` : "- none",
	].join("\n");
}

function buildDebugText(adapter: LoadedAdapter | null): string {
	if (!adapter) {
		return [
			"# Test Orchestrator Debug",
			"",
			"No adapter found.",
			"Candidate paths:",
			...ADAPTER_CANDIDATES.map((item) => `- ${item}`),
		].join("\n");
	}

	const lock = readLock(adapter.resolved.lockPath);
	const targets = discoverTargets(adapter);
	return [
		"# Test Orchestrator Debug",
		"",
		`Adapter path: ${adapter.configPath}`,
		`Repo root: ${adapter.repoRoot}`,
		`Attempt root: ${adapter.resolved.attemptRoot}`,
		`State root: ${adapter.resolved.stateRoot}`,
		`Recovery log: ${adapter.resolved.recoveryLog}`,
		`Lock path: ${adapter.resolved.lockPath}`,
		`Latest state path: ${adapter.resolved.latestStatePath}`,
		"",
		"## Result Paths",
		...adapter.resolved.resultPaths.map((item) => `- ${item}`),
		"",
		"## Validation Diagnostics",
		...(adapter.diagnostics.length > 0 ? adapter.diagnostics.map((item) => `- ${item}`) : ["- none"]),
		"",
		"## Discovery",
		`- target count: ${targets.length}`,
		...targets.slice(0, 10).map((target) => `- ${target.name}`),
		"",
		"## Current Lock JSON",
		lock ? JSON.stringify(lock, null, 2) : "<none>",
	].join("\n");
}

export default function testOrchestratorExtension(pi: ExtensionAPI) {
	const sendReport = (customType: string, content: string) => {
		pi.sendMessage({ customType, content, display: true });
	};

	pi.on("session_start", async (_event, ctx) => {
		const adapter = loadAdapter(ctx);
		if (!adapter) {
			ctx.ui.setStatus("test-orchestrator", undefined);
			return;
		}
		const lock = readLock(adapter.resolved.lockPath);
		const lockStatus = lock ? `${lock.target.name}${isLockStale(lock) ? ":stale" : ":locked"}` : "idle";
		const status = adapter.diagnostics.length > 0
			? `test-orch: invalid (${adapter.config.project.id})`
			: `test-orch: ${adapter.config.project.id} ${lockStatus}`;
		ctx.ui.setStatus("test-orchestrator", status);
	});

	pi.registerCommand("test-status", {
		description: "Show test orchestrator adapter, lock, and latest attempt/recovery summaries",
		handler: async (_args, ctx) => {
			const adapter = loadAdapter(ctx);
			sendReport("test-orchestrator-status", buildStatusText(adapter));
		},
	});

	pi.registerCommand("test-debug", {
		description: "Show resolved adapter paths, validation diagnostics, discovery, and lock state",
		handler: async (_args, ctx) => {
			const adapter = loadAdapter(ctx);
			sendReport("test-orchestrator-debug", buildDebugText(adapter));
		},
	});

	pi.registerCommand("test-adapter-validate", {
		description: "Validate the current project test orchestrator adapter config",
		handler: async (_args, ctx) => {
			const adapter = loadAdapter(ctx);
			if (!adapter) {
				sendReport(
					"test-orchestrator-validate",
					["# Test Adapter Validation", "", "No adapter found.", ...ADAPTER_CANDIDATES.map((item) => `- ${item}`)].join("\n"),
				);
				return;
			}
			const ok = adapter.diagnostics.length === 0;
			sendReport(
				"test-orchestrator-validate",
				[
					"# Test Adapter Validation",
					"",
					`Adapter: ${adapter.configPath}`,
					`Result: ${ok ? "valid" : "invalid"}`,
					"",
					...(ok ? ["Diagnostics: none"] : adapter.diagnostics.map((item) => `- ${item}`)),
				].join("\n"),
			);
		},
	});

	pi.registerCommand("test-targets", {
		description: "List discovered test targets from the current project adapter",
		handler: async (_args, ctx) => {
			const adapter = loadAdapter(ctx);
			if (!adapter) {
				sendReport("test-orchestrator-targets", "# Test Targets\n\nNo adapter found.");
				return;
			}
			const targets = discoverTargets(adapter);
			sendReport(
				"test-orchestrator-targets",
				[
					"# Test Targets",
					"",
					`Count: ${targets.length}`,
					"",
					...targets.map((target) => `- ${target.name}`),
				].join("\n"),
			);
		},
	});

	pi.registerCommand("test-infra-research", {
		description: "Run manual infrastructure research for the latest or specified incident and persist a markdown report",
		handler: async (args, ctx) => {
			const adapter = loadAdapter(ctx);
			if (!adapter) {
				sendReport("test-orchestrator-infra-research", "# Test Infra Research\n\nNo adapter found.");
				return;
			}
			const trimmed = args.trim();
			const incidentArg = trimmed ? ["--incident", trimmed] : [];
			const result = await pi.exec("node", ["scripts/test-orchestrator-infra-research.mjs", ...incidentArg], {
				cwd: adapter.repoRoot,
				timeout: 1800,
			});
			const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
			if (result.code !== 0) {
				sendReport("test-orchestrator-infra-research", `# Test Infra Research\n\nFailed.\n\n${output || `exit ${String(result.code)}`}`);
				return;
			}
			sendReport("test-orchestrator-infra-research", `# Test Infra Research\n\nReport written:\n- ${output}`);
		},
	});

	pi.registerCommand("test-lock-clear", {
		description: "Clear a stale or unwanted active-run lock after confirmation",
		handler: async (_args, ctx) => {
			const adapter = loadAdapter(ctx);
			if (!adapter) {
				sendReport("test-orchestrator-lock-clear", "# Test Lock Clear\n\nNo adapter found.");
				return;
			}
			const lock = readLock(adapter.resolved.lockPath);
			if (!lock) {
				sendReport("test-orchestrator-lock-clear", "# Test Lock Clear\n\nNo active lock found.");
				return;
			}
			if (!ctx.hasUI) {
				sendReport("test-orchestrator-lock-clear", "# Test Lock Clear\n\nInteractive confirmation required.");
				return;
			}
			const ok = await ctx.ui.confirm("Clear test lock?", `${lock.target.name}\nStarted: ${lock.run.startedAt}\nStatus: ${lock.run.status}`);
			if (!ok) {
				sendReport("test-orchestrator-lock-clear", "# Test Lock Clear\n\nCancelled.");
				return;
			}
			releaseLock(adapter);
			sendReport("test-orchestrator-lock-clear", "# Test Lock Clear\n\nLock removed.");
		},
	});

	pi.registerCommand("test-run", {
		description: "Run one discovered test target by filename or repo-relative path",
		getArgumentCompletions: (prefix: string) => targetCompletions(prefix),
		handler: async (args, ctx) => {
			const adapter = loadAdapter(ctx);
			if (!adapter) {
				sendReport("test-orchestrator-run", "# Test Run\n\nNo adapter found.");
				return;
			}
			if (!args.trim()) {
				sendReport("test-orchestrator-run", "# Test Run\n\nUsage: /test-run <spec>.spec.ts");
				return;
			}
			const target = findTarget(adapter, args);
			if (!target) {
				sendReport("test-orchestrator-run", `# Test Run\n\nTarget not found: ${args.trim()}`);
				return;
			}
			const result = await runTarget(pi, adapter, ctx, target);
			sendReport(
				"test-orchestrator-run",
				[
					"# Test Run",
					"",
					`Target: ${target.name}`,
					`Status: ${result.record.classification.status}`,
					`Reason: ${result.record.classification.reason}`,
					`Attempt: ${result.path}`,
					"",
					"## Artifacts",
					...(result.record.artifacts.resultPaths.length > 0 ? formatPathList(result.record.artifacts.resultPaths, adapter.repoRoot) : ["- none"]),
					"",
					"## Output (tail)",
					result.output ? result.output.slice(-4000) : "<no output>",
				].join("\n"),
			);
		},
	});

	pi.registerCommand("test-canary", {
		description: "Run the configured cache-cleared canary target",
		handler: async (_args, ctx) => {
			const adapter = loadAdapter(ctx);
			if (!adapter) {
				sendReport("test-orchestrator-canary", "# Test Canary\n\nNo adapter found.");
				return;
			}
			const target = findTarget(adapter, adapter.config.canary.target);
			if (!target) {
				sendReport("test-orchestrator-canary", `# Test Canary\n\nCanary target not found: ${adapter.config.canary.target}`);
				return;
			}
			const result = await runTarget(pi, adapter, ctx, target, { preClearGlobs: adapter.config.canary.clearPathsBeforeRun, lockStatus: "running" });
			sendReport(
				"test-orchestrator-canary",
				[
					"# Test Canary",
					"",
					`Target: ${target.name}`,
					`Status: ${result.record.classification.status}`,
					`Reason: ${result.record.classification.reason}`,
					`Attempt: ${result.path}`,
					"",
					"## Output (tail)",
					result.output ? result.output.slice(-4000) : "<no output>",
				].join("\n"),
			);
		},
	});

	pi.registerCommand("test-recover", {
		description: "Run a named recovery action from the project adapter. Usage: /test-recover <action>",
		getArgumentCompletions: (prefix: string) => recoveryCompletions(prefix),
		handler: async (args, ctx) => {
			const adapter = loadAdapter(ctx);
			if (!adapter) {
				sendReport("test-orchestrator-recover", "# Test Recovery\n\nNo adapter found.");
				return;
			}
			const actionName = args.trim();
			if (!actionName) {
				sendReport(
					"test-orchestrator-recover",
					["# Test Recovery", "", "Usage: /test-recover <action>", "", ...Object.keys(adapter.config.recoveryActions).map((name) => `- ${name}`)].join("\n"),
				);
				return;
			}
			const action = adapter.config.recoveryActions[actionName];
			if (!action) {
				sendReport("test-orchestrator-recover", `# Test Recovery\n\nUnknown action: ${actionName}`);
				return;
			}
			if (action.requiresConfirmation) {
				if (!ctx.hasUI) {
					sendReport("test-orchestrator-recover", "# Test Recovery\n\nInteractive confirmation required.");
					return;
				}
				const ok = await ctx.ui.confirm("Run recovery action?", `${actionName}\n\n${action.description}`);
				if (!ok) {
					const cancelled: RecoveryLogEntry = {
						schemaVersion: 1,
						id: `${timestampId()}__${slugify(actionName)}`,
						projectId: adapter.config.project.id,
						action: actionName,
						startedAt: nowIso(),
						endedAt: nowIso(),
						status: "cancelled",
						trigger: { reason: "user cancelled", confirmedByUser: false },
						steps: [],
						postChecks: [],
						summary: `${actionName}: cancelled`,
					};
					appendJsonl(adapter.resolved.recoveryLog, cancelled);
					writeLatestState(adapter, { lastRecoveryId: cancelled.id, lastRecoveryStatus: cancelled.status });
					sendReport("test-orchestrator-recover", "# Test Recovery\n\nCancelled.");
					return;
				}
			}
			const result = await runRecovery(pi, adapter, ctx, actionName, "manual recovery invocation", { postCheckCanary: true });
			sendReport(
				"test-orchestrator-recover",
				[
					"# Test Recovery",
					"",
					`Action: ${actionName}`,
					`Status: ${result.status}`,
					`Summary: ${result.summary}`,
					`Recovery log: ${adapter.resolved.recoveryLog}`,
					"",
					"## Steps",
					...result.steps.map((step) => `- ${step.name}: ${step.status}${step.details ? ` (${step.details})` : ""}`),
					...(result.postChecks.length > 0 ? ["", "## Post Checks", ...result.postChecks.map((item) => `- ${item}`)] : []),
				].join("\n"),
			);
		},
	});

	pi.registerTool({
		name: "test_status",
		label: "Test Status",
		description: "Show the current test orchestrator status, including lock, latest attempt, canary, and recovery summaries.",
		promptSnippet: "Inspect orchestrator health, lock status, and latest test/canary/recovery state",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const adapter = loadAdapter(ctx);
			const text = buildStatusText(adapter);
			return { content: [{ type: "text", text }], details: { adapterPath: adapter?.configPath ?? null } };
		},
	});

	pi.registerTool({
		name: "test_debug",
		label: "Test Debug",
		description: "Show resolved adapter paths, diagnostics, discovery details, and current lock JSON for the test orchestrator.",
		promptSnippet: "Inspect orchestrator internals and resolved adapter/runtime paths",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const adapter = loadAdapter(ctx);
			const text = buildDebugText(adapter);
			return { content: [{ type: "text", text }], details: { adapterPath: adapter?.configPath ?? null } };
		},
	});

	pi.registerTool({
		name: "test_targets",
		label: "Test Targets",
		description: "List discovered test targets from the current project adapter.",
		promptSnippet: "List runnable test targets discovered by the adapter",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const adapter = loadAdapter(ctx);
			if (!adapter) {
				return { content: [{ type: "text", text: "No adapter found." }], details: { count: 0 } };
			}
			const targets = discoverTargets(adapter);
			const text = ["Discovered test targets:", "", ...targets.map((target) => `- ${target.name}`)].join("\n");
			return { content: [{ type: "text", text }], details: { count: targets.length, targets: targets.map((t) => t.name) } };
		},
	});

	pi.registerTool({
		name: "test_run",
		label: "Test Run",
		description: "Run one discovered test target by filename or repo-relative path. Enforces single active run via lock and persists an attempt record.",
		promptSnippet: "Run a single test target safely with lock enforcement and persisted attempt records",
		parameters: Type.Object({
			target: Type.String({ description: "Spec filename or repo-relative test path" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const adapter = loadAdapter(ctx);
			if (!adapter) {
				return { content: [{ type: "text", text: "No adapter found." }], details: { status: "blocked" } };
			}
			const target = findTarget(adapter, params.target);
			if (!target) {
				throw new Error(`Target not found: ${params.target}`);
			}
			const result = await runTarget(pi, adapter, ctx, target);
			const text = [
				`Target: ${target.name}`,
				`Status: ${result.record.classification.status}`,
				`Reason: ${result.record.classification.reason}`,
				`Attempt: ${result.path}`,
			].join("\n");
			return { content: [{ type: "text", text }], details: { attemptPath: result.path, record: result.record } };
		},
	});

	pi.registerTool({
		name: "test_canary",
		label: "Test Canary",
		description: "Run the configured cache-cleared canary target to assess current test infrastructure health.",
		promptSnippet: "Run the canary target after clearing configured auth/cache files",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const adapter = loadAdapter(ctx);
			if (!adapter) {
				return { content: [{ type: "text", text: "No adapter found." }], details: { status: "blocked" } };
			}
			const target = findTarget(adapter, adapter.config.canary.target);
			if (!target) throw new Error(`Canary target not found: ${adapter.config.canary.target}`);
			const result = await runTarget(pi, adapter, ctx, target, {
				preClearGlobs: adapter.config.canary.clearPathsBeforeRun,
				lockStatus: "running",
			});
			const text = [
				`Target: ${target.name}`,
				`Status: ${result.record.classification.status}`,
				`Reason: ${result.record.classification.reason}`,
				`Attempt: ${result.path}`,
			].join("\n");
			return { content: [{ type: "text", text }], details: { attemptPath: result.path, record: result.record } };
		},
	});

	pi.registerTool({
		name: "test_recover",
		label: "Test Recover",
		description: "Run a named recovery action from the project adapter. For actions requiring confirmation, set confirm=true explicitly.",
		promptSnippet: "Run a guarded recovery action and log steps plus canary post-check",
		parameters: Type.Object({
			action: Type.String({ description: "Recovery action name from the adapter" }),
			confirm: Type.Optional(Type.Boolean({ description: "Required true for actions marked requiresConfirmation" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const adapter = loadAdapter(ctx);
			if (!adapter) {
				return { content: [{ type: "text", text: "No adapter found." }], details: { status: "blocked" } };
			}
			const action = adapter.config.recoveryActions[params.action];
			if (!action) throw new Error(`Unknown recovery action: ${params.action}`);
			if (action.requiresConfirmation && params.confirm !== true) {
				throw new Error(`Recovery action ${params.action} requires confirm=true.`);
			}
			const result = await runRecovery(pi, adapter, ctx, params.action, "tool-invoked recovery", { postCheckCanary: true });
			const text = [
				`Action: ${params.action}`,
				`Status: ${result.status}`,
				`Summary: ${result.summary}`,
				...result.postChecks.map((item) => `Post-check: ${item}`),
			].join("\n");
			return { content: [{ type: "text", text }], details: { recovery: result } };
		},
	});

	pi.registerTool({
		name: "test_infra_research",
		label: "Test Infra Research",
		description: "Run manual infrastructure research for the latest or specified incident and persist a markdown report.",
		promptSnippet: "Research persistent infra incidents and write a markdown report with likely causes and improvements",
		parameters: Type.Object({
			incident: Type.Optional(Type.String({ description: "Optional incident file path; defaults to latest incident" })),
			queryHint: Type.Optional(Type.String({ description: "Optional extra search hint for the research prompt" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const adapter = loadAdapter(ctx);
			if (!adapter) {
				return { content: [{ type: "text", text: "No adapter found." }], details: { reportPath: null } };
			}
			const args = ["scripts/test-orchestrator-infra-research.mjs"];
			if (params.incident) args.push("--incident", params.incident);
			if (params.queryHint) args.push("--query-hint", params.queryHint);
			const result = await pi.exec("node", args, { cwd: adapter.repoRoot, timeout: 1800 });
			const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
			if (result.code !== 0) {
				throw new Error(output || `infra research failed with exit ${String(result.code)}`);
			}
			return { content: [{ type: "text", text: `Infra research report written to:\n${output}` }], details: { reportPath: output } };
		},
	});

	pi.registerTool({
		name: "test_lock_clear",
		label: "Test Lock Clear",
		description: "Clear the active test lock. Requires confirm=true.",
		promptSnippet: "Clear a stale or unwanted active test lock after explicit confirmation",
		parameters: Type.Object({
			confirm: Type.Boolean({ description: "Must be true to clear the lock" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (params.confirm !== true) throw new Error("Clearing the test lock requires confirm=true.");
			const adapter = loadAdapter(ctx);
			if (!adapter) {
				return { content: [{ type: "text", text: "No adapter found." }], details: { cleared: false } };
			}
			const lock = readLock(adapter.resolved.lockPath);
			if (!lock) {
				return { content: [{ type: "text", text: "No active lock found." }], details: { cleared: false } };
			}
			releaseLock(adapter);
			return { content: [{ type: "text", text: `Cleared lock for ${lock.target.name}.` }], details: { cleared: true, previousLock: lock } };
		},
	});
}

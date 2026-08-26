import {
	chmodSync,
	createWriteStream,
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
	spawn,
	spawnSync,
	type ChildProcessWithoutNullStreams,
} from "node:child_process";
import type { Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import { signalProcessTree } from "../../lib/process-tree.js";
import { recordEvent } from "../../lib/metrics.js";
import { correlationForEmission } from "../../lib/log-analytics/correlation.js";

const DEFAULT_MAX_ACTIVE = 8;
const DEFAULT_MAX_TRACKED = 32;
const DEFAULT_MEMORY_BYTES = 256 * 1024;
const DEFAULT_SPILL_BYTES = 64 * 1024 * 1024;
const KILL_GRACE_MS = 2_000;

export type BackgroundTerminalStatus =
	| "running"
	| "completed"
	| "failed"
	| "killed";

export interface BackgroundTerminalSnapshot {
	id: string;
	title: string;
	command: string;
	cwd: string;
	pid?: number;
	status: BackgroundTerminalStatus;
	startedAt: number;
	endedAt?: number;
	exitCode?: number;
	signal?: NodeJS.Signals;
	error?: string;
	stdout: string;
	stderr: string;
	stdoutBytes: number;
	stderrBytes: number;
	stdoutTruncated: boolean;
	stderrTruncated: boolean;
	stdoutPath?: string;
	stderrPath?: string;
}

export interface BackgroundTerminalStartInput {
	command: string;
	cwd: string;
	title?: string;
}

export interface BackgroundTerminalManagerOptions {
	maxActive?: number;
	maxTracked?: number;
	memoryBytes?: number;
	spillBytes?: number;
	killGraceMs?: number;
	tempRoot?: string;
	spawnProcess?: (
		command: string,
		cwd: string,
	) => ChildProcessWithoutNullStreams;
	terminateProcess?: (
		child: ChildProcessWithoutNullStreams,
		force: boolean,
	) => Promise<void>;
}

export interface BackgroundTerminalKillResult {
	id: string;
	found: boolean;
	wasRunning: boolean;
	snapshot?: BackgroundTerminalSnapshot;
}

interface TerminalEntry {
	id: string;
	title: string;
	command: string;
	cwd: string;
	child: ChildProcessWithoutNullStreams;
	status: BackgroundTerminalStatus;
	startedAt: number;
	endedAt?: number;
	exitCode?: number;
	signal?: NodeJS.Signals;
	error?: string;
	stdout: OutputCapture;
	stderr: OutputCapture;
	killRequested: boolean;
	completionConsumed: boolean;
	settled: boolean;
	settledPromise: Promise<void>;
	resolveSettled: () => void;
	terminationPromise?: Promise<void>;
}

export class BackgroundTerminalCapacityError extends Error {}
export class BackgroundTerminalDisposedError extends Error {}

function truncateUtf8Head(text: string, maxBytes: number): string {
	if (maxBytes <= 0) return "";
	if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
	let low = 0;
	let high = text.length;
	while (low < high) {
		const midpoint = Math.ceil((low + high) / 2);
		if (Buffer.byteLength(text.slice(0, midpoint), "utf8") <= maxBytes) {
			low = midpoint;
		} else {
			high = midpoint - 1;
		}
	}
	let end = low;
	const last = text.charCodeAt(end - 1);
	if (last >= 0xd800 && last <= 0xdbff) end -= 1;
	return text.slice(0, end);
}

function truncateUtf8Tail(text: string, maxBytes: number): string {
	if (maxBytes <= 0) return "";
	if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
	let low = 0;
	let high = text.length;
	while (low < high) {
		const midpoint = Math.floor((low + high) / 2);
		if (Buffer.byteLength(text.slice(midpoint), "utf8") <= maxBytes) {
			high = midpoint;
		} else {
			low = midpoint + 1;
		}
	}
	let start = low;
	const first = text.charCodeAt(start);
	if (first >= 0xdc00 && first <= 0xdfff) start += 1;
	return text.slice(start);
}

class OutputCapture {
	readonly path: string;
	private readonly memoryBytes: number;
	private readonly spillBytes: number;
	private readonly stream: ReturnType<typeof createWriteStream>;
	private readonly decoder = new StringDecoder("utf8");
	private readonly pausedSources = new Set<Readable>();
	private retained = "";
	private writtenBytes = 0;
	private streamFailed = false;
	private ended = false;
	totalBytes = 0;

	constructor(path: string, memoryBytes: number, spillBytes: number) {
		this.path = path;
		this.memoryBytes = memoryBytes;
		this.spillBytes = spillBytes;
		this.stream = createWriteStream(path, { encoding: "utf8", mode: 0o600 });
		this.stream.on("error", () => {
			this.streamFailed = true;
			this.resumePausedSources();
		});
	}

	append(chunk: Buffer | string, source: Readable): void {
		if (typeof chunk === "string") {
			this.totalBytes += Buffer.byteLength(chunk, "utf8");
			this.appendDecoded(chunk, source);
			return;
		}
		this.totalBytes += chunk.byteLength;
		this.appendDecoded(this.decoder.write(chunk), source);
	}

	text(): string {
		return this.retained;
	}

	isTruncated(): boolean {
		return (
			this.totalBytes > Buffer.byteLength(this.retained, "utf8") ||
			this.totalBytes > this.writtenBytes ||
			this.streamFailed
		);
	}

	async finish(): Promise<void> {
		if (this.ended) return;
		this.ended = true;
		this.appendDecoded(this.decoder.end());
		await new Promise<void>((resolve) => {
			if (this.stream.closed || this.stream.destroyed) {
				resolve();
				return;
			}
			this.stream.once("close", resolve);
			this.stream.end();
			setTimeout(resolve, 1_000).unref();
		});
		this.resumePausedSources();
	}

	private appendDecoded(text: string, source?: Readable): void {
		if (!text) return;
		this.retained = truncateUtf8Tail(`${this.retained}${text}`, this.memoryBytes);
		if (this.streamFailed || this.writtenBytes >= this.spillBytes) return;
		const remaining = this.spillBytes - this.writtenBytes;
		const toWrite = truncateUtf8Head(text, remaining);
		if (!toWrite) return;
		this.writtenBytes += Buffer.byteLength(toWrite, "utf8");
		if (!this.stream.write(toWrite) && source) {
			source.pause();
			this.pausedSources.add(source);
			this.stream.once("drain", () => {
				this.pausedSources.delete(source);
				source.resume();
			});
		}
	}

	private resumePausedSources(): void {
		for (const source of this.pausedSources) source.resume();
		this.pausedSources.clear();
	}
}

function isLegacyWslBashPath(value: string): boolean {
	const normalized = value.replace(/\//g, "\\").toLowerCase();
	return /^[a-z]:\\windows\\(?:system32|sysnative)\\bash\.exe$/.test(normalized);
}

function resolveBashShell(): string {
	const configured = process.env.PI_BACKGROUND_SHELL?.trim();
	if (configured) {
		if (existsSync(configured)) return configured;
		throw new Error(`PI_BACKGROUND_SHELL does not exist: ${configured}`);
	}
	if (process.platform === "win32") {
		for (const root of [
			process.env.ProgramFiles,
			process.env["ProgramFiles(x86)"],
		]) {
			if (!root) continue;
			const candidate = join(root, "Git", "bin", "bash.exe");
			if (existsSync(candidate)) return candidate;
		}
		const found = spawnSync("where", ["bash.exe"], {
			encoding: "utf8",
			timeout: 5_000,
			windowsHide: true,
		});
		const candidate =
			found.status === 0
				? found.stdout
						.trim()
						.split(/\r?\n/)
						.find((value) => value && !isLegacyWslBashPath(value))
				: undefined;
		if (candidate && existsSync(candidate)) return candidate;
		throw new Error("No Bash shell found for managed background terminals.");
	}
	if (existsSync("/bin/bash")) return "/bin/bash";
	const found = spawnSync("which", ["bash"], {
		encoding: "utf8",
		timeout: 5_000,
	});
	if (found.status === 0 && found.stdout.trim()) {
		return found.stdout.trim().split(/\r?\n/)[0] ?? "bash";
	}
	throw new Error("No Bash shell found for managed background terminals.");
}

function productionSpawn(
	command: string,
	cwd: string,
): ChildProcessWithoutNullStreams {
	const shell = resolveBashShell();
	const env = { ...process.env };
	for (const key of [
		"PI_SESSION_ID",
		"PI_SESSION_FILE",
		"PI_PROVIDER",
		"PI_MODEL",
		"PI_REASONING_LEVEL",
	]) {
		delete env[key];
	}
	return spawn(shell, ["-c", command], {
		cwd,
		detached: process.platform !== "win32",
		env,
		stdio: ["pipe", "pipe", "pipe"],
		windowsHide: true,
	});
}

async function productionTerminate(
	child: ChildProcessWithoutNullStreams,
	force: boolean,
): Promise<void> {
	await signalProcessTree(child, force);
}

function defaultTitle(command: string): string {
	const firstLine = command.trim().split(/\r?\n/)[0] ?? "background terminal";
	return firstLine.length <= 64 ? firstLine : `${firstLine.slice(0, 61)}...`;
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export class BackgroundTerminalManager {
	private readonly entries = new Map<string, TerminalEntry>();
	private readonly listeners = new Set<() => void>();
	private readonly settledListeners = new Set<
		(snapshot: BackgroundTerminalSnapshot, consumed: boolean) => void
	>();
	private readonly maxActive: number;
	private readonly maxTracked: number;
	private readonly memoryBytes: number;
	private readonly spillBytes: number;
	private readonly killGraceMs: number;
	private readonly tempRoot: string;
	private sessionDir?: string;
	private readonly spawnProcess: NonNullable<
		BackgroundTerminalManagerOptions["spawnProcess"]
	>;
	private readonly terminateProcess: NonNullable<
		BackgroundTerminalManagerOptions["terminateProcess"]
	>;
	private counter = 0;
	private disposed = false;

	constructor(options: BackgroundTerminalManagerOptions = {}) {
		this.maxActive = options.maxActive ?? DEFAULT_MAX_ACTIVE;
		this.maxTracked = options.maxTracked ?? DEFAULT_MAX_TRACKED;
		this.memoryBytes = options.memoryBytes ?? DEFAULT_MEMORY_BYTES;
		this.spillBytes = options.spillBytes ?? DEFAULT_SPILL_BYTES;
		this.killGraceMs = options.killGraceMs ?? KILL_GRACE_MS;
		this.spawnProcess = options.spawnProcess ?? productionSpawn;
		this.terminateProcess = options.terminateProcess ?? productionTerminate;
		this.tempRoot =
			options.tempRoot ?? join(tmpdir(), "pi-background-terminals");
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	onSettled(
		listener: (snapshot: BackgroundTerminalSnapshot, consumed: boolean) => void,
	): () => void {
		this.settledListeners.add(listener);
		return () => this.settledListeners.delete(listener);
	}

	list(): BackgroundTerminalSnapshot[] {
		return [...this.entries.values()].map((entry) => this.snapshot(entry));
	}

	get(id: string): BackgroundTerminalSnapshot | undefined {
		const entry = this.entries.get(id);
		return entry ? this.snapshot(entry) : undefined;
	}

	pendingCompletions(): BackgroundTerminalSnapshot[] {
		return [...this.entries.values()]
			.filter((entry) => entry.settled && !entry.completionConsumed)
			.map((entry) => this.snapshot(entry));
	}

	consumeCompletion(id: string): void {
		const entry = this.entries.get(id);
		if (entry?.settled) entry.completionConsumed = true;
	}

	hasPendingCompletion(id: string): boolean {
		const entry = this.entries.get(id);
		return Boolean(entry?.settled && !entry.completionConsumed);
	}

	start(input: BackgroundTerminalStartInput): BackgroundTerminalSnapshot {
		if (this.disposed) {
			throw new BackgroundTerminalDisposedError("Background terminal manager is disposed.");
		}
		const command = input.command.trim();
		if (!command) throw new Error("Background terminal command is required.");
		this.prune(Math.max(0, this.maxTracked - 1));
		if (this.entries.size >= this.maxTracked) {
			throw new BackgroundTerminalCapacityError(
				`At most ${this.maxTracked} background terminals may be tracked while completions are pending.`,
			);
		}
		const active = [...this.entries.values()].filter(
			(entry) => entry.status === "running",
		).length;
		if (active >= this.maxActive) {
			throw new BackgroundTerminalCapacityError(
				`At most ${this.maxActive} background terminals may run at once.`,
			);
		}

		const id = `bg-${++this.counter}`;
		const safeId = basename(id);
		const outputDirectory = this.ensureSessionDirectory();
		const stdout = new OutputCapture(
			join(outputDirectory, `${safeId}.stdout.log`),
			this.memoryBytes,
			this.spillBytes,
		);
		const stderr = new OutputCapture(
			join(outputDirectory, `${safeId}.stderr.log`),
			this.memoryBytes,
			this.spillBytes,
		);
		let child: ChildProcessWithoutNullStreams;
		try {
			child = this.spawnProcess(command, input.cwd);
		} catch (error) {
			void Promise.all([stdout.finish(), stderr.finish()]).then(() => {
				rmSync(stdout.path, { force: true });
				rmSync(stderr.path, { force: true });
			});
			throw new Error(`Could not start background terminal: ${errorText(error)}`);
		}
		let resolveSettled = () => {};
		const settledPromise = new Promise<void>((resolve) => {
			resolveSettled = resolve;
		});
		const entry: TerminalEntry = {
			id,
			title: input.title?.trim() || defaultTitle(command),
			command,
			cwd: input.cwd,
			child,
			status: "running",
			startedAt: Date.now(),
			stdout,
			stderr,
			killRequested: false,
			completionConsumed: false,
			settled: false,
			settledPromise,
			resolveSettled,
		};
		this.entries.set(id, entry);
		recordEvent({ event: "background_terminal_started", correlation: { ...correlationForEmission(), operation_id: entry.id }, data: { status: "running" } });
		child.stdout.on("data", (chunk: Buffer) => {
			entry.stdout.append(chunk, child.stdout);
			this.emitChange();
		});
		child.stderr.on("data", (chunk: Buffer) => {
			entry.stderr.append(chunk, child.stderr);
			this.emitChange();
		});
		child.once("error", (error) => {
			entry.error = errorText(error);
			this.emitChange();
		});
		child.once("close", (code, signal) => {
			void this.settle(entry, code, signal);
		});
		this.emitChange();
		return this.snapshot(entry);
	}

	async kill(
		ids: readonly string[],
		consumeCompletion = true,
	): Promise<BackgroundTerminalKillResult[]> {
		return Promise.all(
			ids.map(async (id) => {
				const entry = this.entries.get(id);
				if (!entry) return { id, found: false, wasRunning: false };
				const wasRunning = entry.status === "running";
				entry.completionConsumed ||= consumeCompletion;
				if (wasRunning) {
					try {
						await this.terminate(entry);
					} catch (error) {
						entry.error = errorText(error);
						this.emitChange();
					}
				}
				return {
					id,
					found: true,
					wasRunning,
					snapshot: this.snapshot(entry),
				};
			}),
		);
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		await Promise.allSettled(
			[...this.entries.values()]
				.filter((entry) => entry.status === "running")
				.map(async (entry) => {
					entry.completionConsumed = true;
					await this.terminate(entry);
				}),
		);
		this.listeners.clear();
		this.settledListeners.clear();
		this.cleanupDisposedSession();
	}

	private ensureSessionDirectory(): string {
		if (this.sessionDir) return this.sessionDir;
		mkdirSync(this.tempRoot, { recursive: true, mode: 0o700 });
		try {
			chmodSync(this.tempRoot, 0o700);
		} catch {
			// Best effort on platforms without POSIX modes.
		}
		this.sessionDir = mkdtempSync(join(this.tempRoot, "session-"));
		try {
			chmodSync(this.sessionDir, 0o700);
		} catch {
			// Best effort on platforms without POSIX modes.
		}
		return this.sessionDir;
	}

	private cleanupDisposedSession(): void {
		if (!this.disposed) return;
		if ([...this.entries.values()].some((entry) => !entry.settled)) return;
		this.entries.clear();
		if (this.sessionDir) {
			rmSync(this.sessionDir, { recursive: true, force: true });
			this.sessionDir = undefined;
		}
	}

	private snapshot(entry: TerminalEntry): BackgroundTerminalSnapshot {
		return {
			id: entry.id,
			title: entry.title,
			command: entry.command,
			cwd: entry.cwd,
			pid: entry.child.pid,
			status: entry.status,
			startedAt: entry.startedAt,
			endedAt: entry.endedAt,
			exitCode: entry.exitCode,
			signal: entry.signal,
			error: entry.error,
			stdout: entry.stdout.text(),
			stderr: entry.stderr.text(),
			stdoutBytes: entry.stdout.totalBytes,
			stderrBytes: entry.stderr.totalBytes,
			stdoutTruncated: entry.stdout.isTruncated(),
			stderrTruncated: entry.stderr.isTruncated(),
			stdoutPath: entry.stdout.path,
			stderrPath: entry.stderr.path,
		};
	}

	private async settle(
		entry: TerminalEntry,
		code: number | null,
		signal: NodeJS.Signals | null,
	): Promise<void> {
		if (entry.settled) return;
		entry.settled = true;
		entry.endedAt = Date.now();
		if (code !== null) entry.exitCode = code;
		if (signal) entry.signal = signal;
		entry.status = entry.killRequested
			? "killed"
			: code === 0 && !entry.error
				? "completed"
				: "failed";
		await Promise.all([entry.stdout.finish(), entry.stderr.finish()]);
		entry.resolveSettled();
		const snapshot = this.snapshot(entry);
		recordEvent({ event: "background_terminal_settled", correlation: { ...correlationForEmission(), operation_id: entry.id }, data: { status: entry.status, duration_ms: entry.endedAt - entry.startedAt, bytes: entry.stdout.totalBytes + entry.stderr.totalBytes } });
		this.emitChange();
		for (const listener of this.settledListeners) {
			try {
				listener(snapshot, entry.completionConsumed);
			} catch {
				// A UI or delivery listener must not affect process settlement.
			}
		}
		this.prune();
		this.cleanupDisposedSession();
	}

	private async terminate(entry: TerminalEntry): Promise<void> {
		if (entry.terminationPromise) return entry.terminationPromise;
		entry.killRequested = true;
		const attempt = (async () => {
			const errors: string[] = [];
			try {
				await this.terminateProcess(entry.child, false);
			} catch (error) {
				errors.push(`graceful termination failed: ${errorText(error)}`);
			}
			if (await this.waitForSettlement(entry, this.killGraceMs)) return;
			try {
				await this.terminateProcess(entry.child, true);
			} catch (error) {
				errors.push(`forced termination failed: ${errorText(error)}`);
			}
			if (await this.waitForSettlement(entry, this.killGraceMs)) return;
			const detail = errors.length > 0 ? ` ${errors.join("; ")}` : "";
			throw new Error(
				`Process termination could not be confirmed; ${entry.id} may still be running.${detail}`,
			);
		})();
		entry.terminationPromise = attempt;
		try {
			await attempt;
		} finally {
			if (!entry.settled) entry.terminationPromise = undefined;
		}
	}

	private async waitForSettlement(
		entry: TerminalEntry,
		timeoutMs: number,
	): Promise<boolean> {
		if (entry.settled) return true;
		await Promise.race([
			entry.settledPromise,
			new Promise<void>((resolve) => {
				setTimeout(resolve, timeoutMs).unref();
			}),
		]);
		return entry.settled;
	}

	private prune(limit = this.maxTracked): void {
		if (this.entries.size <= limit) return;
		const settled = [...this.entries.values()]
			.filter(
				(entry) => entry.status !== "running" && entry.completionConsumed,
			)
			.sort((left, right) => (left.endedAt ?? 0) - (right.endedAt ?? 0));
		while (this.entries.size > limit && settled.length > 0) {
			const entry = settled.shift();
			if (!entry) continue;
			this.entries.delete(entry.id);
			rmSync(entry.stdout.path, { force: true });
			rmSync(entry.stderr.path, { force: true });
		}
		this.emitChange();
	}

	private emitChange(): void {
		for (const listener of this.listeners) {
			try {
				listener();
			} catch {
				// A UI listener must not affect process management.
			}
		}
	}
}

const BACKGROUND_TERMINAL_MANAGER_VERSION = 1;
const BACKGROUND_TERMINAL_MANAGER_KEY = Symbol.for(
	"dotfiles.pi.background-terminal-manager",
);

type BackgroundTerminalManagerGlobal = {
	version: number;
	manager: BackgroundTerminalManager;
};

function managerGlobals(): typeof globalThis & Record<symbol, unknown> {
	return globalThis as typeof globalThis & Record<symbol, unknown>;
}

export function getBackgroundTerminalManager(): BackgroundTerminalManager {
	const globals = managerGlobals();
	const existing = globals[
		BACKGROUND_TERMINAL_MANAGER_KEY
	] as BackgroundTerminalManagerGlobal | undefined;
	if (existing?.version === BACKGROUND_TERMINAL_MANAGER_VERSION) {
		return existing.manager;
	}
	const manager = new BackgroundTerminalManager();
	globals[BACKGROUND_TERMINAL_MANAGER_KEY] = {
		version: BACKGROUND_TERMINAL_MANAGER_VERSION,
		manager,
	} satisfies BackgroundTerminalManagerGlobal;
	return manager;
}

export async function resetBackgroundTerminalManager(): Promise<void> {
	const globals = managerGlobals();
	const existing = globals[
		BACKGROUND_TERMINAL_MANAGER_KEY
	] as BackgroundTerminalManagerGlobal | undefined;
	if (existing) await existing.manager.dispose();
	delete globals[BACKGROUND_TERMINAL_MANAGER_KEY];
}

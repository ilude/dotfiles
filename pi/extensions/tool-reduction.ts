/**
 * Tool Reduction Extension
 *
 * Intercepts tool_result events for the Bash tool and pipes the raw output
 * through the Python reduce.py orchestrator to compact verbose results.
 *
 * Subprocess is spawned as bare python (never via the uv package manager) to
 * avoid the Windows conhost.exe flash caused by uv.exe spawning a new console.
 * See claude/tracking/windows-console-flashing.md for root cause details.
 *
 * Failure modes: non-zero exit, non-JSON stdout, spawn error, or timeout
 * all fall through to returning the raw tool output unchanged.
 */

// Convention exception: no extension-utils helpers apply directly.
// Risk: helper API drifts and this file is not visited by future refactors;
//   tool-reduction.ts has its own dedicated test file with end-to-end
//   compaction coverage and helper-function unit tests.
// Why shared helper is inappropriate: the file augments tool_result content
//   in place rather than producing a tool error result, so formatToolError
//   does not apply. canonicalize does not apply because the only path
//   handled is REDUCE_SCRIPT which is resolved once at module init via
//   path.resolve. uiNotify does not apply because the file does not
//   surface user-facing messages -- it transparently rewrites the bash
//   tool result the LLM consumes.

import * as child_process from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ToolResultMessage } from "@earendil-works/pi-ai";
import {
	type ContextEvent,
	type ExtensionAPI,
	type ExtensionContext,
	isBashToolResult,
	type ToolResultEvent,
} from "@earendil-works/pi-coding-agent";

function getHomeDir(): string {
	return process.env.HOME ?? process.env.USERPROFILE ?? os.homedir();
}

function getReduceScriptPath(): string {
	return path.resolve(
		getHomeDir(),
		".dotfiles",
		"pi",
		"tool-reduction",
		"reduce.py",
	);
}

const TIMEOUT_MS = 3000;
const MIN_REDUCER_INPUT_BYTES = 240;
const INGESTION_REDUCTION_MIN_BYTES = 64 * 1024;
const RETROACTIVE_CONTEXT_THRESHOLD_PERCENT = 50;
const RETROACTIVE_KEEP_LAST_RESULTS = 5;
const RETROACTIVE_MIN_RECLAIM_TOKENS = 5000;
const RETROACTIVE_MIN_RECLAIM_BYTES = 20_000;
const RAW_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const RAW_MAX_BYTES = 64 * 1024 * 1024;

function getRawOutputDir(): string {
	return path.join(
		getHomeDir(),
		".cache",
		"pi",
		"tool-reduction",
		"raw",
	);
}

export async function pruneRawOutputs(
	rawDir: string,
	options: {
		now?: number;
		retentionMs?: number;
		maxBytes?: number;
	} = {},
): Promise<void> {
	let entries: fs.Dirent[];
	try {
		entries = await fs.promises.readdir(rawDir, { withFileTypes: true });
	} catch {
		return;
	}
	const now = options.now ?? Date.now();
	const retentionMs = options.retentionMs ?? RAW_RETENTION_MS;
	const maxBytes = options.maxBytes ?? RAW_MAX_BYTES;
	const files: Array<{ path: string; mtimeMs: number; size: number }> = [];
	for (const entry of entries) {
		if (!entry.isFile()) continue;
		const filePath = path.join(rawDir, entry.name);
		try {
			const stat = await fs.promises.stat(filePath);
			if (now - stat.mtimeMs > retentionMs) {
				await fs.promises.unlink(filePath);
				continue;
			}
			files.push({ path: filePath, mtimeMs: stat.mtimeMs, size: stat.size });
		} catch {
			// A concurrent cleanup may already have removed the file.
		}
	}
	let total = files.reduce((sum, file) => sum + file.size, 0);
	for (const file of files.sort((a, b) => a.mtimeMs - b.mtimeMs)) {
		if (total <= maxBytes) break;
		try {
			await fs.promises.unlink(file.path);
			total -= file.size;
		} catch {
			// A concurrent cleanup may already have removed the file.
		}
	}
}

async function saveRawOutput(toolCallId: string, rawText: string): Promise<string> {
	const rawDir = getRawOutputDir();
	await fs.promises.mkdir(rawDir, { recursive: true, mode: 0o700 });
	await pruneRawOutputs(rawDir);
	const safeId = toolCallId.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 80);
	const filePath = path.join(rawDir, `${Date.now()}-${safeId || "bash"}.txt`);
	await fs.promises.writeFile(filePath, rawText, { encoding: "utf-8", mode: 0o600 });
	return filePath;
}

function stopProcessTree(pid: number): void {
	if (process.platform === "win32") {
		child_process.spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
			stdio: "ignore",
			windowsHide: true,
		});
		return;
	}

	try {
		process.kill(-pid, "SIGKILL");
	} catch {
		try {
			process.kill(pid, "SIGKILL");
		} catch {
			// Process already exited.
		}
	}
}

interface ReduceRequest {
	argv: string[];
	// Pi exposes only isError; encode it as 0/1 for reducer failure guards.
	exit_code: number;
	stdout: string;
}

type ReduceRequestMetadata = Omit<ReduceRequest, "stdout">;

interface ReduceResponse {
	inline_text: string;
	facts: Record<string, unknown>;
	rule_id: string | null;
	bytes_before: number;
	bytes_after: number;
	reduction_applied: boolean;
}

function splitArgv(command: string): string[] {
	// Shell-tokenize using whitespace split as a best-effort approximation.
	// The reducer uses this for rule classification only, not re-execution.
	return command.trim().split(/\s+/).filter(Boolean);
}

function extractTextContent(content: ToolResultEvent["content"]): string {
	const texts = content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text);
	// Bash tool emits one combined text stream; stderr is not separately available.
	return texts.join("");
}

export function shouldRunReducer(stdout: string): boolean {
	return Buffer.byteLength(stdout, "utf-8") >= MIN_REDUCER_INPUT_BYTES;
}

export function shouldReduceAtIngestion(stdout: string): boolean {
	return Buffer.byteLength(stdout, "utf-8") >= INGESTION_REDUCTION_MIN_BYTES;
}

interface PendingRequest {
	request: ReduceRequest;
	resolve: (response: ReduceResponse | null) => void;
}

class ReducerWorker {
	private child: child_process.ChildProcess | undefined;
	private readonly queue: PendingRequest[] = [];
	private pending: PendingRequest | undefined;
	private responseBuffer = "";
	private timer: ReturnType<typeof setTimeout> | undefined;

	constructor(private readonly scriptPath: string) {}

	reduce(request: ReduceRequest): Promise<ReduceResponse | null> {
		return new Promise((resolve) => {
			this.queue.push({ request, resolve });
			this.drain();
		});
	}

	shutdown(): void {
		this.queue.splice(0).forEach(({ resolve }) => resolve(null));
		this.finishPending(null);
		if (this.child?.pid) stopProcessTree(this.child.pid);
		this.child = undefined;
		this.responseBuffer = "";
	}

	private drain(): void {
		if (this.pending || this.queue.length === 0) return;
		const child = this.ensureChild();
		if (!child) {
			this.queue.shift()?.resolve(null);
			this.drain();
			return;
		}

		const pending = this.queue.shift();
		if (!pending) return;
		this.pending = pending;
		this.timer = setTimeout(() => {
			if (this.child === child) this.terminate(child);
			this.finishPending(null);
		}, TIMEOUT_MS);
		try {
			child.stdin?.write(`${JSON.stringify(pending.request)}\n`, "utf-8");
		} catch {
			this.terminate(child);
			this.finishPending(null);
		}
	}

	private ensureChild(): child_process.ChildProcess | undefined {
		if (this.child) return this.child;
		try {
			const child = child_process.spawn("python", [this.scriptPath, "--worker"], {
				detached: process.platform !== "win32",
				windowsHide: true,
				stdio: ["pipe", "pipe", "pipe"],
			});
			this.child = child;
			child.stdin?.on("error", () => {
				if (this.child !== child) return;
				this.terminate(child);
				this.finishPending(null);
			});
			child.stdout?.on("data", (chunk: Buffer) => this.readResponse(child, chunk));
			child.on("error", () => this.handleExit(child));
			child.on("close", () => this.handleExit(child));
			return child;
		} catch {
			return undefined;
		}
	}

	private readResponse(child: child_process.ChildProcess, chunk: Buffer): void {
		if (this.child !== child || !this.pending) return;
		this.responseBuffer += chunk.toString("utf-8");
		const newline = this.responseBuffer.indexOf("\n");
		if (newline === -1) return;
		const line = this.responseBuffer.slice(0, newline);
		this.responseBuffer = this.responseBuffer.slice(newline + 1);
		try {
			const response = JSON.parse(line) as ReduceResponse;
			if (typeof response.inline_text !== "string") throw new Error("invalid response");
			this.finishPending(response);
		} catch {
			this.terminate(child);
			this.finishPending(null);
		}
	}

	private handleExit(child: child_process.ChildProcess): void {
		if (this.child !== child) return;
		this.child = undefined;
		this.responseBuffer = "";
		this.finishPending(null);
	}

	private terminate(child: child_process.ChildProcess): void {
		if (this.child === child) this.child = undefined;
		this.responseBuffer = "";
		if (child.pid) stopProcessTree(child.pid);
	}

	private finishPending(response: ReduceResponse | null): void {
		if (this.timer) clearTimeout(this.timer);
		this.timer = undefined;
		const pending = this.pending;
		this.pending = undefined;
		pending?.resolve(response);
		this.drain();
	}
}

function isToolResultMessage(message: AgentMessage): message is ToolResultMessage {
	return message.role === "toolResult";
}

function addMarker(
	result: ReduceResponse,
	rawPath: string,
	locator?: string,
): string {
	const ruleId = result.rule_id ?? "generic";
	const facts = Object.keys(result.facts).length > 0
		? ` facts=${JSON.stringify(result.facts)}`
		: "";
	const location = locator ? ` raw=${rawPath} locator=${locator}` : ` raw=${rawPath}`;
	const marker = `[tool-reduction] bytes=${result.bytes_before}->${result.bytes_after} rule=${ruleId}${facts}${location}`;
	return result.inline_text.endsWith("\n")
		? `${result.inline_text}${marker}`
		: `${result.inline_text}\n${marker}`;
}

function replaceTextContent(
	message: ToolResultMessage,
	text: string,
): ToolResultMessage {
	let replaced = false;
	const content: ToolResultMessage["content"] = [];
	for (const block of message.content) {
		if (block.type !== "text") {
			content.push(block);
		} else if (!replaced) {
			content.push({ type: "text", text });
			replaced = true;
		}
	}
	if (!replaced) content.unshift({ type: "text", text });
	return { ...message, content };
}

export const EXTENSION_NAME = "tool-reduction";

export default function (pi: ExtensionAPI) {
	const worker = new ReducerWorker(getReduceScriptPath());
	const requests = new Map<string, ReduceRequestMetadata>();
	const compacted = new Set<string>();
	const compactCache = new Map<string, ReduceResponse>();
	let nextReductionTokenThreshold: number | undefined;

	pi.on("session_shutdown", () => {
		worker.shutdown();
		requests.clear();
		compacted.clear();
		compactCache.clear();
		nextReductionTokenThreshold = undefined;
	});
	pi.on("context", async (event: ContextEvent, ctx: ExtensionContext) => {
		if (process.env.PI_TOOL_REDUCTION?.toLowerCase() === "off") return undefined;

		const toolResults = event.messages.filter(isToolResultMessage);
		const currentIds = new Set(toolResults.map((message) => message.toolCallId));
		for (const id of compacted) {
			if (!currentIds.has(id)) compacted.delete(id);
		}
		for (const id of compactCache.keys()) {
			if (!currentIds.has(id)) compactCache.delete(id);
		}
		for (const id of requests.keys()) {
			if (!currentIds.has(id)) requests.delete(id);
		}

		const sessionFile = ctx.sessionManager.getSessionFile();
		if (!sessionFile) return undefined;
		const usage = ctx.getContextUsage();
		const usageTokens = usage?.tokens;
		const usagePercent = usage?.percent;
		if (compacted.size === 0 && (usagePercent ?? 0) < RETROACTIVE_CONTEXT_THRESHOLD_PERCENT) {
			nextReductionTokenThreshold = undefined;
		}
		const thresholdReached = usageTokens !== null &&
			usageTokens !== undefined &&
			usagePercent !== null &&
			usagePercent !== undefined &&
			usagePercent >= RETROACTIVE_CONTEXT_THRESHOLD_PERCENT &&
			(nextReductionTokenThreshold === undefined ||
				usageTokens >= nextReductionTokenThreshold);
		const eligible = toolResults.slice(0, -RETROACTIVE_KEEP_LAST_RESULTS);
		const eligibleIds = new Set(eligible.map((message) => message.toolCallId));

		if (thresholdReached) {
			for (const message of eligible) {
				if (compacted.has(message.toolCallId) || compactCache.has(message.toolCallId)) {
					continue;
				}
				const stdout = extractTextContent(message.content);
				if (!shouldRunReducer(stdout) || stdout.includes("[tool-reduction]")) {
					continue;
				}
				const metadata = requests.get(message.toolCallId) ?? {
					argv: [message.toolName],
					exit_code: message.isError ? 1 : 0,
				};
				const response = await worker.reduce({ ...metadata, stdout });
				if (response) compactCache.set(message.toolCallId, response);
			}

			const pending = eligible.filter((message) => {
				const result = compactCache.get(message.toolCallId);
				return !compacted.has(message.toolCallId) && result?.reduction_applied;
			});
			const reclaimBytes = pending.reduce((total, message) => {
				const result = compactCache.get(message.toolCallId);
				return total + (result ? result.bytes_before - result.bytes_after : 0);
			}, 0);
			if (reclaimBytes >= RETROACTIVE_MIN_RECLAIM_BYTES) {
				for (const message of pending) compacted.add(message.toolCallId);
				if (usageTokens !== null && usageTokens !== undefined) {
					nextReductionTokenThreshold =
						usageTokens + RETROACTIVE_MIN_RECLAIM_TOKENS;
				}
			}
		}

		if (compacted.size === 0) return undefined;
		let changed = false;
		const messages = event.messages.map((message) => {
			if (
				!isToolResultMessage(message) ||
				!eligibleIds.has(message.toolCallId) ||
				!compacted.has(message.toolCallId)
			) {
				return message;
			}
			const result = compactCache.get(message.toolCallId);
			if (!result?.reduction_applied) return message;
			changed = true;
			return replaceTextContent(
				message,
				addMarker(result, sessionFile, `toolCallId:${message.toolCallId}`),
			);
		});
		return changed ? { messages } : undefined;
	});

	pi.on("tool_result", async (event: ToolResultEvent) => {
		if (process.env.PI_TOOL_REDUCTION?.toLowerCase() === "off") return undefined;
		const stdout = extractTextContent(event.content);
		const command = isBashToolResult(event)
			? (event.input as { command?: string }).command ?? ""
			: event.toolName;
		const metadata: ReduceRequestMetadata = {
			argv: isBashToolResult(event) ? splitArgv(command) : [event.toolName],
			exit_code: event.isError ? 1 : 0,
		};
		requests.set(event.toolCallId, metadata);

		if (!isBashToolResult(event) || !shouldReduceAtIngestion(stdout)) {
			return undefined;
		}
		const result = await worker.reduce({ ...metadata, stdout });
		if (result === null || !result.reduction_applied) return undefined;

		let rawPath = event.details?.fullOutputPath;
		if (!rawPath) {
			try {
				rawPath = await saveRawOutput(event.toolCallId, stdout);
			} catch {
				return undefined;
			}
		}
		return {
			content: [{ type: "text" as const, text: addMarker(result, rawPath) }],
		};
	});
}

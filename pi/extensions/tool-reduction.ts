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
import {
	type ExtensionAPI,
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
	exit_code: number;
	stdout: string;
	stderr: string;
}

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

function extractTextContent(content: ToolResultEvent["content"]): {
	stdout: string;
	stderr: string;
} {
	const texts = content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text);
	// Bash tool emits a single text block combining stdout and stderr.
	return { stdout: texts.join(""), stderr: "" };
}

export function shouldRunReducer(stdout: string, stderr: string): boolean {
	const separator = stdout && stderr ? "\n" : "";
	const rawText = `${stdout}${separator}${stderr}`;
	return Buffer.byteLength(rawText, "utf-8") >= MIN_REDUCER_INPUT_BYTES;
}

function callReducer(
	request: ReduceRequest,
	scriptPath: string,
): Promise<ReduceResponse | null> {
	return new Promise((resolve) => {
		let child: child_process.ChildProcess;
		try {
			child = child_process.spawn("python", [scriptPath], {
				detached: process.platform !== "win32",
				windowsHide: true,
				stdio: ["pipe", "pipe", "pipe"],
			});
		} catch {
			resolve(null);
			return;
		}

		let stdout = "";
		let timedOut = false;

		const timer = setTimeout(() => {
			timedOut = true;
			if (child.pid) {
				stopProcessTree(child.pid);
			}
		}, TIMEOUT_MS);

		child.stdout?.on("data", (chunk: Buffer) => {
			stdout += chunk.toString("utf-8");
		});

		child.on("error", () => {
			clearTimeout(timer);
			resolve(null);
		});

		child.on("close", (code: number | null) => {
			clearTimeout(timer);
			if (timedOut || code !== 0) {
				resolve(null);
				return;
			}
			try {
				const parsed = JSON.parse(stdout.trim()) as ReduceResponse;
				if (typeof parsed.inline_text !== "string") {
					resolve(null);
					return;
				}
				resolve(parsed);
			} catch {
				resolve(null);
			}
		});

		try {
			child.stdin?.write(JSON.stringify(request), "utf-8");
			child.stdin?.end();
		} catch {
			clearTimeout(timer);
			resolve(null);
		}
	});
}

export const EXTENSION_NAME = "tool-reduction";

export default function (pi: ExtensionAPI) {
	pi.on("tool_result", async (event: ToolResultEvent) => {
		if (!isBashToolResult(event)) return undefined;
		if (process.env.PI_TOOL_REDUCTION?.toLowerCase() === "off") return undefined;

		const command = (event.input as { command?: string }).command ?? "";
		const { stdout, stderr } = extractTextContent(event.content);
		if (!shouldRunReducer(stdout, stderr)) return undefined;

		const request: ReduceRequest = {
			argv: splitArgv(command),
			exit_code: event.isError ? 1 : 0,
			stdout,
			stderr,
		};

		const result = await callReducer(request, getReduceScriptPath());

		if (result === null || !result.reduction_applied) {
			return undefined;
		}

		const separator = stdout && stderr ? "\n" : "";
		const rawText = `${stdout}${separator}${stderr}`;
		let rawPath = event.details?.fullOutputPath;
		if (!rawPath) {
			try {
				rawPath = await saveRawOutput(event.toolCallId, rawText);
			} catch {
				return undefined;
			}
		}
		const ruleId = result.rule_id ?? "generic";
		const marker = `[tool-reduction] bytes=${result.bytes_before}->${result.bytes_after} rule=${ruleId} raw=${rawPath}`;
		const compactText = result.inline_text.endsWith("\n")
			? `${result.inline_text}${marker}`
			: `${result.inline_text}\n${marker}`;

		return {
			content: [{ type: "text" as const, text: compactText }],
		};
	});
}

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
import * as os from "node:os";
import * as path from "node:path";
import { isBashToolResult, type ExtensionAPI, type ToolResultEvent } from "@mariozechner/pi-coding-agent";

const REDUCE_SCRIPT = path.resolve(
	os.homedir(),
	".dotfiles",
	"pi",
	"tool-reduction",
	"reduce.py",
);

const TIMEOUT_MS = 3000;

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

function extractTextContent(content: ToolResultEvent["content"]): { stdout: string; stderr: string } {
	const texts = content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text);
	// Bash tool emits a single text block combining stdout and stderr.
	return { stdout: texts.join(""), stderr: "" };
}

function callReducer(
	request: ReduceRequest,
	scriptPath: string,
): Promise<ReduceResponse | null> {
	return new Promise((resolve) => {
		let child: child_process.ChildProcess;
		try {
			child = child_process.spawn("python", [scriptPath], {
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
			child.kill("SIGKILL");
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

		const command = (event.input as { command?: string }).command ?? "";
		const { stdout, stderr } = extractTextContent(event.content);

		const request: ReduceRequest = {
			argv: splitArgv(command),
			exit_code: event.isError ? 1 : 0,
			stdout,
			stderr,
		};

		const result = await callReducer(request, REDUCE_SCRIPT);

		if (result === null) {
			return undefined;
		}

		return {
			content: [{ type: "text" as const, text: result.inline_text }],
		};
	});
}

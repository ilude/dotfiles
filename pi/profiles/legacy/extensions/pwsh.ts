import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  truncateTail,
  DEFAULT_MAX_LINES,
  DEFAULT_MAX_BYTES,
  formatSize,
} from "@earendil-works/pi-coding-agent";
// Convention exception: pwsh uses ctx.ui.notify directly for the "tool disabled" warning.
// Risk: if notify signature changes, this call silently breaks without compile-time guidance.
// Why shared helper is inappropriate: the message is modal-style user feedback about a missing
// system binary -- adding a [pwsh] prefix would be redundant with "pwsh not found" in the text.
import { Type } from "typebox";
import { Text } from "@earendil-works/pi-tui";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir, release } from "node:os";
import { join } from "node:path";
import { formatToolTiming, formatTranscriptTiming } from "../lib/tool-timing.js";

const DEFAULT_TIMEOUT_SECONDS = 120;

/** Check if OS release string indicates Windows 11 (build >= 22000). */
export function isWindows11Check(platform: string, osRelease: string): boolean {
  if (platform !== "win32") return false;
  try {
    const parts = osRelease.split(".");
    const build = parseInt(parts[2] || "0", 10);
    return build >= 22000;
  } catch {
    return false;
  }
}

/** Classify a PowerShell output line for coloring. */
export function classifyOutputLine(line: string): "verbose" | "debug" | "warning" | "error" | "normal" {
  if (line.includes("VERBOSE:")) return "verbose";
  if (line.includes("DEBUG:")) return "debug";
  if (line.includes("WARNING:")) return "warning";
  if (line.includes("ERROR:")) return "error";
  return "normal";
}

/** Build the truncation notice appended to output. */
export function buildTruncationNotice(truncResult: { outputLines: number; totalLines: number; outputBytes: number; totalBytes: number }, tempFile: string): string {
  const startLine = Math.max(1, truncResult.totalLines - truncResult.outputLines + 1);
  return (
    `\n\n[Showing lines ${startLine}-${truncResult.totalLines} of ${truncResult.totalLines} ` +
    `(${formatSize(DEFAULT_MAX_BYTES)} limit). Full output: ${tempFile}]`
  );
}

/**
 * Normalize terminal-oriented output for static TUI rendering.
 *
 * PowerShell-hosted CLIs such as winget often redraw progress/spinner lines with
 * carriage returns. If those raw CR frames are rendered as plain text, screenshots
 * show staggered blocks and duplicated spinner frames. Treat CR as "return to the
 * start of the current line" and keep only the latest version of that line.
 */
export function normalizeTerminalOutput(output: string): string {
  const escapeCharacter = String.fromCharCode(27);
  const ansiPattern = new RegExp(`${escapeCharacter}(?:[@-Z\\\\-_]|\\[[0-?]*[ -/]*[@-~])`, "g");
  const withoutAnsi = output.replace(ansiPattern, "");
  const lines: string[] = [];
  let current = "";

  for (let index = 0; index < withoutAnsi.length; index += 1) {
    const char = withoutAnsi[index];
    if (char === "\r") {
      if (withoutAnsi[index + 1] === "\n") {
        lines.push(current.trimEnd());
        current = "";
        index += 1;
      } else {
        current = "";
      }
    } else if (char === "\n") {
      lines.push(current.trimEnd());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.length > 0) lines.push(current.trimEnd());
  return lines.join("\n");
}

export function appendBoundedOutput(current: string, chunk: string): {
  output: string;
  truncated: boolean;
} {
  const normalized = normalizeTerminalOutput(current + chunk);
  const bounded = truncateTail(normalized, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });
  return { output: bounded.content, truncated: bounded.truncated };
}

function isWindows11(): boolean {
  return isWindows11Check(process.platform, release());
}

export default function (pi: ExtensionAPI) {
  if (!isWindows11()) return;
  registerPwshTool(pi);
}

function killProc(pid: number | undefined): void {
  if (pid === undefined) return;
  try {
    spawn("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore", windowsHide: true });
  } catch {
    // Process may have already exited
  }
}

function registerPwshTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: "pwsh",
    label: "PowerShell",
    description: `Execute PowerShell Core in the current working directory. Defaults to ${DEFAULT_TIMEOUT_SECONDS}s and returns stdout, stderr, and the PowerShell error stream, truncated to the last ${DEFAULT_MAX_LINES} lines or ${Math.round(DEFAULT_MAX_BYTES / 1024)}KB.`,
    promptSnippet: "Execute PowerShell Core (pwsh) commands for Windows-native tasks, .NET, and PowerShell modules",
    promptGuidelines: [
      "On Windows, use pwsh for cmdlets, .NET, registry, modules, and .ps1 files; use bash for Git, Node, and POSIX tools. On Unix, use pwsh only when requested.",
      "Use full cmdlet names and $env:VAR. Put multiline or quoting-heavy logic in .tmp/*.ps1 and run it with -File.",
      "Set an adequate timeout before network, module, package, or infrastructure work; do not repeat an unchanged timed-out command.",
    ],
    parameters: Type.Object({
      command: Type.String({ description: "PowerShell command to execute" }),
      timeout: Type.Optional(Type.Number({ description: "Timeout in seconds (optional)" })),
    }),
    execute: executePwsh,
    renderCall,
    renderResult,
  });
}

async function executePwsh(
  toolCallId: string,
  params: { command: string; timeout?: number },
  signal: AbortSignal | undefined,
  onUpdate: ((partial: any) => void) | undefined,
  ctx: any
): Promise<any> {
  const startTime = Date.now();
  const timeoutSeconds = params.timeout ?? DEFAULT_TIMEOUT_SECONDS;
  const timeoutMs = timeoutSeconds * 1000;
  const safeId = toolCallId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const spoolPath = join(tmpdir(), `pi-pwsh-${safeId}.txt`);
  const spool = createWriteStream(spoolPath, { encoding: "utf8" });
  let spoolError: Error | undefined;
  spool.on("error", (error) => {
    spoolError = error;
  });
  let proc: any = null;
  let timeoutHandle: NodeJS.Timeout | null = null;
  let output = "";
  let captureTruncated = false;
  let terminated = false;

  return new Promise((resolve, reject) => {
    const discardSpool = () => {
      spool.destroy();
      void rm(spoolPath, { force: true });
    };
    const onAbort = () => {
      terminated = true;
      killProc(proc?.pid);
      discardSpool();
      reject(new Error("Command aborted"));
    };

    const onDataChunk = (chunk: Buffer) => {
      spool.write(chunk);
      const bounded = appendBoundedOutput(output, chunk.toString());
      output = bounded.output;
      captureTruncated ||= bounded.truncated;
      if (onUpdate) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        onUpdate({
          content: [{ type: "text", text: output }],
          details: { command: params.command, elapsed, isPartial: true },
        });
      }
    };

    try {
      proc = spawn("pwsh", [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        params.command,
      ], {
        cwd: ctx.cwd,
        env: process.env,
        windowsHide: true,
      });

      if (signal) signal.addEventListener("abort", onAbort);

      timeoutHandle = setTimeout(() => {
        terminated = true;
        killProc(proc?.pid);
        discardSpool();
        reject(new Error(`Command timed out after ${timeoutSeconds}s`));
      }, timeoutMs);

      proc.stdout?.on("data", onDataChunk);
      proc.stderr?.on("data", onDataChunk);

      proc.on("error", (err: Error) => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (signal) signal.removeEventListener("abort", onAbort);
        terminated = true;
        discardSpool();
        reject(new Error(`Failed to spawn pwsh: ${err.message}`));
      });

      proc.on("close", async (code: number) => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (signal) signal.removeEventListener("abort", onAbort);
        if (terminated) return;

        await new Promise<void>((finish) => spool.end(finish));
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const truncResult = truncateTail(output, {
          maxLines: DEFAULT_MAX_LINES,
          maxBytes: DEFAULT_MAX_BYTES,
        });
        const truncated = captureTruncated || truncResult.truncated;
        let finalOutput = truncResult.content;
        let tempFile: string | undefined;

        if (truncated) {
          if (spoolError)
            return reject(new Error(`Could not preserve full pwsh output: ${spoolError.message}`));
          tempFile = spoolPath;
          finalOutput += `\n\n[Output truncated (${formatSize(DEFAULT_MAX_BYTES)} limit). Full raw output: ${tempFile}]`;
        } else {
          await rm(spoolPath, { force: true });
        }

        if (code !== 0) {
          reject(new Error(`pwsh exited with code ${code ?? "null"}\n${finalOutput}`));
        } else {
          resolve({
            content: [{ type: "text", text: finalOutput }],
            details: {
              command: params.command,
              exitCode: code,
              elapsed,
              truncated,
              ...(tempFile && { tempFile, full_output_path: tempFile }),
            },
          });
        }
      });
    } catch (err) {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      reject(err);
    }
  });
}

export function renderCall(
  args: { command: string; timeout?: number },
  theme: any,
  context: any
): any {
  if (context.executionStarted && context.state.transcriptStartedAt === undefined) {
    context.state.transcriptStartedAt = Date.now();
  }

  const lines = args.command.split("\n");
  const firstLine = lines[0];
  const isMultiline = lines.length > 1;
  const commandDisplay = isMultiline ? `${firstLine} ...` : firstLine;
  const timeoutSeconds = args.timeout ?? DEFAULT_TIMEOUT_SECONDS;
  const timing = formatToolTiming(context.state.transcriptStartedAt, timeoutSeconds);
  const timingSuffix = theme.fg("dim", ` [${timing ?? `timeout ${timeoutSeconds}s`}]`);
  const content = `PS> ${commandDisplay}${timingSuffix}`;
  return new Text(content, 0, 0);
}

export function selectDisplayLines(lines: string[], options: { expanded: boolean; isPartial: boolean }, elapsed: string, theme: any): string[] {
  if (options.isPartial) {
    const result = lines.slice(-5);
    result.push(theme.fg("dim", "..."));
    return result;
  }
  if (!options.expanded) {
    const result = lines.slice(0, 10);
    const moreLines = Math.max(0, lines.length - 10);
    if (moreLines > 0) result.push(theme.fg("dim", `… ${moreLines} more lines`));
    result.push(`[${elapsed}s]`);
    return result;
  }
  const result = [...lines];
  result.push(`[${elapsed}s]`);
  return result;
}

export function colorOutputLine(line: string, theme: any): string {
  const kind = classifyOutputLine(line);
  if (kind === "verbose" || kind === "debug") return theme.fg("dim", line);
  if (kind === "warning") return theme.fg("warning", line);
  if (kind === "error") return theme.fg("error", line);
  return line;
}

export function renderResult(
  result: any,
  options: { expanded: boolean; isPartial: boolean },
  theme: any,
  context: any
): any {
  const output = normalizeTerminalOutput(result.content?.[0]?.text || "");
  const lines = output.split("\n");
  const elapsed = result.details?.elapsed || "0.0";
  const truncated = result.details?.truncated;
  const tempFile = result.details?.full_output_path || result.details?.tempFile;

  const displayLines = selectDisplayLines(lines, options, elapsed, theme)
    .map((line) => colorOutputLine(line, theme));

  if (truncated && tempFile) {
    displayLines.push(theme.fg("dim", `[truncated - see ${tempFile} for full output]`));
  }

  const durationMs = options.isPartial ? undefined : Number(elapsed) * 1000;
  const timing = formatTranscriptTiming(
    context.state?.transcriptStartedAt,
    Number.isFinite(durationMs) ? durationMs : undefined,
  );
  if (timing) displayLines.push(theme.fg("dim", timing));

  return new Text(displayLines.join("\n"), 0, 0);
}

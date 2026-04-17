import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  truncateTail,
  DEFAULT_MAX_LINES,
  DEFAULT_MAX_BYTES,
  formatSize,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text } from "@mariozechner/pi-tui";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { tmpdir, release } from "node:os";
import { join } from "node:path";

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
  return (
    `\n\n[Output truncated: showing last ${truncResult.outputLines} of ` +
    `${truncResult.totalLines} lines ` +
    `(${formatSize(truncResult.outputBytes)} of ${formatSize(truncResult.totalBytes)}). ` +
    `Full output saved to: ${tempFile}]`
  );
}

function isWindows11(): boolean {
  return isWindows11Check(process.platform, release());
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    if (!isWindows11()) {
      // Silently skip — tool is Windows 11 only
      return;
    }

    try {
      const result = await pi.exec("pwsh", ["--version"], { timeout: 5000 });
      if (result.code !== 0) throw new Error("non-zero exit");
    } catch {
      ctx.ui.notify(
        "pwsh not found — PowerShell tool disabled. Install from https://aka.ms/powershell",
        "warning"
      );
      return;
    }
    registerPwshTool(pi);
    registerPlatformHook(pi);
  });
}

function killProc(pid: number | undefined): void {
  if (pid === undefined) return;
  try {
    spawn("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore" });
  } catch {
    // Process may have already exited
  }
}

function registerPwshTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: "pwsh",
    label: "PowerShell",
    description: `Execute a PowerShell Core (pwsh) command in the current working directory. Use for: PowerShell cmdlets (Get-*, Set-*, New-*, Remove-*), .ps1 scripts, Windows Registry/WMI/COM access, .NET type operations, $env: environment variables, and tasks requiring PowerShell modules. On non-Windows systems, only use if the user explicitly requests PowerShell. Returns stdout, stderr, and PowerShell error stream. Output truncated to last ${DEFAULT_MAX_LINES} lines or ${Math.round(DEFAULT_MAX_BYTES / 1024)}KB.`,
    promptSnippet: "Execute PowerShell Core (pwsh) commands for Windows-native tasks, .NET, and PowerShell modules",
    promptGuidelines: [
      "Use pwsh for Windows-native commands, PowerShell cmdlets, .NET CLI, registry access, and .ps1 scripts.",
      "Use bash for POSIX commands, git, npm/node, and Unix-style text pipelines (awk, sed, grep, curl).",
      "On Windows, prefer pwsh for platform-specific tasks. On Unix, prefer bash unless PowerShell is explicitly needed.",
      "In pwsh: use cmdlet names (Get-Content, Write-Output) over aliases (cat, echo). Use $env:VAR for environment variables.",
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
  const timeoutMs = params.timeout ? params.timeout * 1000 : undefined;
  let proc: any = null;
  let timeoutHandle: NodeJS.Timeout | null = null;
  let output = "";

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      killProc(proc?.pid);
      reject(new Error("Command aborted"));
    };

    const onDataChunk = () => {
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

      if (timeoutMs) {
        timeoutHandle = setTimeout(() => {
          killProc(proc?.pid);
          reject(new Error(`Command timed out after ${params.timeout}s`));
        }, timeoutMs);
      }

      proc.stdout?.on("data", (chunk: Buffer) => {
        output += chunk.toString();
        onDataChunk();
      });

      proc.stderr?.on("data", (chunk: Buffer) => {
        output += chunk.toString();
        onDataChunk();
      });

      proc.on("error", (err: Error) => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (signal) signal.removeEventListener("abort", onAbort);
        reject(new Error(`Failed to spawn pwsh: ${err.message}`));
      });

      proc.on("close", async (code: number) => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (signal) signal.removeEventListener("abort", onAbort);

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const truncResult = truncateTail(output, {
          maxLines: DEFAULT_MAX_LINES,
          maxBytes: DEFAULT_MAX_BYTES,
        });

        let finalOutput = truncResult.content;
        let tempFile: string | undefined;

        if (truncResult.truncated) {
          const safeId = toolCallId.replace(/[^a-zA-Z0-9_-]/g, "_");
          tempFile = join(tmpdir(), `pi-pwsh-${safeId}.txt`);
          await writeFile(tempFile, output, "utf8");
          finalOutput += buildTruncationNotice(truncResult, tempFile);
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
              truncated: truncResult.truncated,
              ...(tempFile && { tempFile }),
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
  _context: any
): any {
  const lines = args.command.split("\n");
  const firstLine = lines[0];
  const isMultiline = lines.length > 1;
  const commandDisplay = isMultiline ? `${firstLine} …` : firstLine;
  const timeoutSuffix = args.timeout ? theme.fg("dim", ` [timeout: ${args.timeout}s]`) : "";
  const content = `PS> ${commandDisplay}${timeoutSuffix}`;
  return new Text(content, 0, 0);
}

export function selectDisplayLines(lines: string[], options: { expanded: boolean; isPartial: boolean }, elapsed: string, theme: any): string[] {
  if (options.isPartial) {
    const result = lines.slice(-5);
    result.push(theme.fg("dim", `… [${elapsed}s]`));
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
  _context: any
): any {
  const output = result.content?.[0]?.text || "";
  const lines = output.split("\n");
  const elapsed = result.details?.elapsed || "0.0";
  const truncated = result.details?.truncated;
  const tempFile = result.details?.tempFile;

  const displayLines = selectDisplayLines(lines, options, elapsed, theme)
    .map((line) => colorOutputLine(line, theme));

  if (truncated && tempFile) {
    displayLines.push(theme.fg("dim", `[truncated — see ${tempFile} for full output]`));
  }

  return new Text(displayLines.join("\n"), 0, 0);
}

export function registerPlatformHook(pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, _ctx) => {
    const platformNote =
      "Both bash and pwsh tools are available. Prefer pwsh for Windows-native tasks (cmdlets, registry, WMI, .NET, COM). Use bash for git, npm, POSIX text tools.";

    return {
      systemPrompt: event.systemPrompt + `\n\n## Shell Selection\n${platformNote}`,
    };
  });
}

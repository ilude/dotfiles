import { mkdtempSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";

export type CommandLifetime = "task" | "agent" | "service";
export interface CommandJob { id: string; directory: string; pane: string; lifetime: CommandLifetime }
export interface CommandResult {
  state: "running" | "exited";
  exitCode?: number | null;
  signal?: string | null;
  output?: string;
  error?: string;
  cleanupError?: string;
  pane?: string;
}
export function prepareCommand(command: string, cwd: string, lifetime: CommandLifetime) {
  const directory = mkdtempSync(join(tmpdir(), "pi-herdr-command-"));
  const file = join(directory, "command.json");
  writeFileSync(file, JSON.stringify({ version: 1, command, cwd, lifetime }), { mode: 0o600 });
  return { directory, file };
}
export function admitCommand(directory: string, terminalId: string) {
  const file = join(directory, "ready.json");
  writeFileSync(`${file}.tmp`, JSON.stringify({ terminalId }));
  renameSync(`${file}.tmp`, file);
}
export async function collectCommand(job: CommandJob, timeoutSeconds = 0, signal?: AbortSignal): Promise<CommandResult> {
  const deadline = Date.now() + timeoutSeconds * 1000;
  do {
    signal?.throwIfAborted();
    let raw: string;
    try { raw = readFileSync(join(job.directory, "result.json"), "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (Date.now() >= deadline) return { state: "running" };
      await delay(Math.min(100, Math.max(1, deadline - Date.now())), undefined, { signal });
      continue;
    }
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") throw new Error("Invalid command result");
    const result = value as Record<string, unknown>;
    if (result.state !== "exited" || !(result.exitCode === null || Number.isInteger(result.exitCode))) throw new Error("Invalid command settlement");
    for (const key of ["signal", "output", "error", "cleanupError", "pane"]) if (result[key] != null && typeof result[key] !== "string") throw new Error(`Invalid command ${key}`);
    return { state: "exited", exitCode: result.exitCode as number | null, signal: result.signal as string | null | undefined,
      output: typeof result.output === "string" ? result.output.slice(-12_000) : undefined,
      error: typeof result.error === "string" ? result.error : undefined, cleanupError: typeof result.cleanupError === "string" ? result.cleanupError : undefined,
      pane: typeof result.pane === "string" ? result.pane : undefined };
  } while (true);
}

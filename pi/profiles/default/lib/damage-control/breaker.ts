import { createHash } from "node:crypto";
import type { ToolRequest } from "./types.ts";

export function fingerprint(value: unknown): string {
  const stable = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(stable);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)]));
    return typeof item === "string" ? item.replace(/\r\n?/g, "\n") : item;
  };
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

// Finite whitelist of read-only status operations, not arbitrary reads or tools
// declaring themselves polling. Long polls still stop after 20 unchanged results
// or two minutes (whichever occurs first).
export function isPolling(request: ToolRequest): boolean {
  if (request.tool !== "bash" && request.tool !== "powershell") return false;
  const command = request.input.command.trim().replace(/\s+/g, " ");
  return /^(?:git status(?: --(?:short|porcelain(?:=v[12])?))?|docker (?:container )?ls(?: --all|-a)?|kubectl rollout status (?:deployment|statefulset|daemonset)\/[a-z0-9._-]+(?: --timeout=\d+s)?)$/i.test(command);
}

type Entry = { result: string; failed: boolean; count: number; started: number; last: number; polling: boolean };
export class Breaker {
  private readonly entries = new Map<string, Entry>();
  private readonly now: () => number;
  constructor(now: () => number = Date.now) { this.now = now; }
  reset(): void { this.entries.clear(); }
  before(request: ToolRequest): string | undefined {
    const entry = this.entries.get(fingerprint({ tool: request.tool, input: request.input, cwd: request.cwd }));
    if (!entry) return;
    if (this.now() - entry.last > 30 * 60_000) { this.reset(); return; }
    const threshold = entry.failed ? 4 : entry.polling ? 20 : 5;
    if (entry.count >= threshold || (entry.polling && entry.count >= 2 && this.now() - entry.started >= 120_000)) {
      return `Repeated-call loop stopped before another attempt: ${entry.count} equivalent ${entry.failed ? "failures" : "unchanged results"}. Inspect the last result, change the approach, or ask the operator for missing facts; do not repeat or evade the same operation.`;
    }
  }
  result(request: ToolRequest, result: unknown, failed: boolean): void {
    const key = fingerprint({ tool: request.tool, input: request.input, cwd: request.cwd });
    const digest = fingerprint(result);
    const previous = this.entries.get(key);
    const same = previous?.result === digest && previous.failed === failed;
    const now = this.now();
    this.entries.delete(key);
    this.entries.set(key, { result: digest, failed, count: same ? previous.count + 1 : 1, started: same ? previous.started : now, last: now, polling: isPolling(request) });
    while (this.entries.size > 50) this.entries.delete(this.entries.keys().next().value!);
  }
}

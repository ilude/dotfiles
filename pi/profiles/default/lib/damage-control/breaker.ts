import { createHash } from "node:crypto";

export type WatchdogRequest = { tool: string; input: unknown; cwd: string };

export function fingerprint(value: unknown): string {
  const stable = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(stable);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)]));
    return typeof item === "string" ? item.replace(/\r\n?/g, "\n") : item;
  };
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

type Entry = { count: number; last: number };

/** Stops attempt 13 after twelve adjacent failures of the exact effective call. */
export class Breaker {
  private readonly entries = new Map<string, Entry>();
  private activeKey: string | undefined;
  private readonly now: () => number;
  constructor(now: () => number = Date.now) { this.now = now; }
  reset(): void { this.entries.clear(); this.activeKey = undefined; }
  before(request: WatchdogRequest): string | undefined {
    const key = fingerprint(request);
    if (this.activeKey !== undefined && this.activeKey !== key) this.reset();
    this.activeKey = key;
    const entry = this.entries.get(key);
    if (!entry) return;
    if (this.now() - entry.last > 30 * 60_000) { this.reset(); this.activeKey = key; return; }
    if (entry.count >= 12) return `Failed-call watchdog stopped attempt 13 after ${entry.count} equivalent failures. Tool: ${request.tool}; cwd: ${request.cwd}; input: ${JSON.stringify(request.input).slice(0, 1000)}. A direct operator instruction is required before retrying.`;
  }
  result(request: WatchdogRequest, failed: boolean): void {
    const key = fingerprint(request);
    if (this.activeKey !== undefined && this.activeKey !== key) this.reset();
    this.activeKey = key;
    if (!failed) { this.entries.delete(key); return; }
    const previous = this.entries.get(key);
    this.entries.set(key, { count: (previous?.count ?? 0) + 1, last: this.now() });
  }
}

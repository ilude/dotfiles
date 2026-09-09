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

export type BreakerSnapshot = {
  key?: string;
  request?: WatchdogRequest;
  count: number;
  stopped: boolean;
};

/** Stops attempt 13 after twelve adjacent failures of the exact effective call. */
export class Breaker {
  private state: BreakerSnapshot = { count: 0, stopped: false };

  reset(): void { this.state = { count: 0, stopped: false }; }
  restore(snapshot: BreakerSnapshot): void {
    if (snapshot.count < 0 || !Number.isInteger(snapshot.count)) return;
    if (snapshot.key && snapshot.request && fingerprint(snapshot.request) !== snapshot.key) return;
    this.state = structuredClone(snapshot);
  }
  snapshot(): BreakerSnapshot { return structuredClone(this.state); }
  before(request: WatchdogRequest): string | undefined {
    const key = fingerprint(request);
    if (this.state.stopped) return this.reason(this.state.request ?? request);
    if (this.state.key !== undefined && this.state.key !== key) this.reset();
    if (this.state.count < 12) return;
    this.state = { ...this.state, key, request: structuredClone(request), stopped: true };
    return this.reason(request);
  }
  result(request: WatchdogRequest, failed: boolean): void {
    if (this.state.stopped) return;
    const key = fingerprint(request);
    if (this.state.key !== undefined && this.state.key !== key) this.reset();
    if (!failed) { this.reset(); return; }
    this.state = { key, request: structuredClone(request), count: this.state.count + 1, stopped: false };
  }
  private reason(request: WatchdogRequest): string {
    return `Failed-call watchdog stopped attempt 13 after ${this.state.count} equivalent failures. Tool: ${request.tool}; cwd: ${request.cwd}; input: ${JSON.stringify(request.input).slice(0, 1000)}. A direct operator instruction is required before retrying.`;
  }
}

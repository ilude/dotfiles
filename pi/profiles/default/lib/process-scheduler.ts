import { randomUUID } from "node:crypto";

export interface ScheduledPrompt {
  id: string;
  runAt: string;
  prompt: string;
  error?: string;
}

type Delivery = (prompt: string) => void;
const MAX_TIMEOUT = 2_147_483_647;
const units = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

export function parseAtTime(when: string, now = Date.now()): number {
  const value = when.trim();
  const duration = /^(\d+)([smhd])$/i.exec(value);
  let time: number;
  if (duration) {
    const amount = Number(duration[1]);
    if (!Number.isSafeInteger(amount) || amount < 1) throw new Error("Duration must be a positive integer");
    time = now + amount * units[duration[2].toLowerCase() as keyof typeof units];
  } else {
    if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) throw new Error("Use an ISO timestamp or a duration such as 15m, 2h, or 1d");
    time = Date.parse(value);
  }
  if (!Number.isFinite(new Date(time).getTime()) || time <= now) throw new Error("Scheduled time must be a valid future time");
  return time;
}

export function formatScheduleFooterStatus(jobs: ScheduledPrompt[]): string | undefined {
  const next = jobs.filter(job => !job.error).sort((a, b) => a.runAt.localeCompare(b.runAt))[0];
  if (!next) return undefined;
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" })
    .format(new Date(next.runAt)).replace(/\s+(AM|PM)$/i, (_, period: string) => period.toLowerCase());
  return `sched@ ${time}`;
}

export class ProcessScheduler {
  private jobs = new Map<string, ScheduledPrompt>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private delivery: Delivery | undefined;
  private changed: (() => void) | undefined;

  bind(delivery: Delivery, changed: () => void): void {
    this.delivery = delivery;
    this.changed = changed;
    // Deliver on a later tick, after session_start has finished rebinding extensions.
    this.arm();
    this.changed();
  }

  unbind(delivery: Delivery): void {
    if (this.delivery !== delivery) return;
    this.delivery = undefined;
    this.changed = undefined;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  create(when: string, text: string): ScheduledPrompt {
    const runAt = new Date(parseAtTime(when)).toISOString();
    const prompt = text.trim();
    if (!prompt || prompt.length > 4000) throw new Error("Prompt must contain 1–4000 characters");
    if (prompt.startsWith("/")) throw new Error("Scheduled slash commands are not allowed");
    if (this.jobs.size >= 64) throw new Error("Process schedule limit reached (64)");
    const job = { id: randomUUID(), runAt, prompt };
    this.jobs.set(job.id, job);
    this.arm();
    this.changed?.();
    return { ...job };
  }

  list(): ScheduledPrompt[] {
    return [...this.jobs.values()].map(job => ({ ...job })).sort((a, b) => a.runAt.localeCompare(b.runAt));
  }

  cancel(id: string): ScheduledPrompt {
    if (!id.trim()) throw new Error("cancel requires id");
    const matches = this.list().filter(job => job.id.startsWith(id));
    if (!matches.length) throw new Error(`Schedule not found: ${id}. Delivered prompts cannot be recalled.`);
    if (matches.length > 1) throw new Error(`Schedule id is ambiguous: ${id}`);
    this.jobs.delete(matches[0].id);
    this.arm();
    this.changed?.();
    return matches[0];
  }

  stopAll(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.jobs.clear();
    this.delivery = undefined;
    this.changed?.();
    this.changed = undefined;
  }

  private arm(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    const next = this.list().find(job => !job.error);
    if (!this.delivery || !next) return;
    // Node overflows delays beyond ~24.8 days; re-arm long waits without polling.
    const delay = Math.min(MAX_TIMEOUT, Math.max(0, Date.parse(next.runAt) - Date.now()));
    this.timer = setTimeout(() => this.fire(), delay);
    this.timer.unref();
  }

  private fire(): void {
    for (const job of this.list()) {
      if (!this.delivery) break;
      if (job.error || Date.parse(job.runAt) > Date.now()) continue;
      try {
        this.delivery(job.prompt);
        this.jobs.delete(job.id);
      } catch (error) {
        // No retries or extra prompts. Inspect via list, then cancel/reschedule.
        this.jobs.set(job.id, { ...job, error: String(error).slice(0, 500) });
      }
    }
    this.arm();
    this.changed?.();
  }
}

// Memory only: survives module reload/session replacement, never restored from disk.
const key = Symbol.for("dotfiles.pi.default.one-shot-scheduler.v1");
export function getProcessScheduler(): ProcessScheduler {
  const globals = globalThis as typeof globalThis & { [key]?: ProcessScheduler };
  return globals[key] ??= new ProcessScheduler();
}

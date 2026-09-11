import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { CacheScan } from "./cache.js";

export type RemoteRecord = {
  endpoint: string;
  contentId?: string;
  jobId?: string;
  updatedAt: string;
};

export type BackfillState = {
  version: 1;
  /** The first valid entry to consider on the next daily attempt. */
  nextVideoId?: string;
  lastAttemptAt?: string;
  lastResult?: {
    at: string;
    status: "empty" | "completed" | "partial" | "failed" | "interrupted";
    processed: number;
    deleted: number;
    pending: number;
    invalid: number;
    error?: string;
  };
  entries: Record<string, RemoteRecord>;
};

export const EMPTY_STATE: BackfillState = { version: 1, entries: {} };

function bounded(value: string): string { return value.replace(/[\r\n]+/g, " ").slice(0, 500); }

export async function readState(path: string): Promise<BackfillState> {
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    const raw = value as Record<string, unknown>;
    const rawEntries = raw.entries;
    const entries: Record<string, RemoteRecord> = {};
    if (rawEntries !== undefined && rawEntries !== null && typeof rawEntries === "object" && !Array.isArray(rawEntries)) {
      for (const [videoId, candidate] of Object.entries(rawEntries)) {
        if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) continue;
        const record = candidate as Record<string, unknown>;
        if (typeof record.endpoint !== "string" || typeof record.updatedAt !== "string") continue;
        entries[videoId] = {
          endpoint: record.endpoint,
          updatedAt: record.updatedAt,
          ...(typeof record.contentId === "string" && record.contentId ? { contentId: record.contentId } : {}),
          ...(typeof record.jobId === "string" && record.jobId ? { jobId: record.jobId } : {}),
        };
      }
    }
    return {
      version: 1,
      ...(typeof raw.nextVideoId === "string" ? { nextVideoId: raw.nextVideoId } : {}),
      ...(typeof raw.lastAttemptAt === "string" ? { lastAttemptAt: raw.lastAttemptAt } : {}),
      ...(raw.lastResult !== undefined && typeof raw.lastResult === "object" && raw.lastResult !== null ? { lastResult: raw.lastResult as BackfillState["lastResult"] } : {}),
      entries,
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return { ...EMPTY_STATE, entries: {} };
    return { ...EMPTY_STATE, entries: {} };
  }
}

export async function writeState(path: string, state: BackfillState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  try { await chmod(temporary, 0o600); } catch { /* Windows may not support POSIX modes */ }
  await rename(temporary, path);
  try { await chmod(path, 0o600); } catch { /* Windows may not support POSIX modes */ }
}

export function isDue(state: BackfillState, now: number): boolean {
  if (state.lastAttemptAt === undefined) return true;
  const previous = Date.parse(state.lastAttemptAt);
  return !Number.isFinite(previous) || now - previous >= 24 * 60 * 60 * 1000;
}

export function setAttempt(state: BackfillState, now: number): void {
  state.lastAttemptAt = new Date(now).toISOString();
}

export function setRecord(state: BackfillState, videoId: string, record: RemoteRecord): void {
  state.entries[videoId] = record;
}

export function removeRecord(state: BackfillState, videoId: string): void { delete state.entries[videoId]; }

export function finishState(
  state: BackfillState,
  now: number,
  result: Omit<NonNullable<BackfillState["lastResult"]>, "at">,
): void {
  state.lastResult = { ...result, error: result.error === undefined ? undefined : bounded(result.error), at: new Date(now).toISOString() };
}

export function pendingCount(scan: CacheScan): number { return scan.entries.length; }

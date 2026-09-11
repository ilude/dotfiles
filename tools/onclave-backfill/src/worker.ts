import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import { dirname } from "node:path";
import type { ContentListItem, ContentResponse, IngestResponse, JobResponse, OnclaveClient } from "../../../modules/onclave/packages/client/src/index.js";
import { createOnclaveClient } from "../../../modules/onclave/packages/client/src/index.js";
import type { BackfillConfig } from "./config.js";
import { scanCache, deleteCacheEntry, type CacheEntry, type CacheScan } from "./cache.js";
import { acquireLock, type LockHandle } from "./lock.js";
import { finishState, isDue, pendingCount, readState, removeRecord, setAttempt, setRecord, writeState, type BackfillState, type RemoteRecord } from "./state.js";

export const RUN_DEADLINE_MS = 5 * 60 * 1000;
const REQUEST_LIMIT_MS = 30_000;
const MAX_LOG_BYTES = 1_000_000;
const ACTIVE = new Set(["pending", "processing", "running", "queued"]);
const FAILED = new Set(["failed", "error", "cancelled"]);

type Clock = { now(): number };
export type WorkerApi = Pick<OnclaveClient, "findByVideoId" | "getContent" | "job" | "ingest">;
export type WorkerTimer = {
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
};
export type WorkerOptions = {
  clock?: Clock;
  deadlineMs?: number;
  signal?: AbortSignal;
  timer?: WorkerTimer;
  apiFactory?: (config: BackfillConfig, signal: AbortSignal, timeoutMs: number) => Promise<WorkerApi>;
  logger?: (message: string) => void;
};

export type WorkerResult = {
  status: "not_due" | "empty" | "completed" | "partial" | "failed" | "locked" | "interrupted";
  processed: number;
  deleted: number;
  pending: number;
  invalid: number;
  error?: string;
};

function message(error: unknown): string { return (error instanceof Error ? error.message : String(error)).replace(/[\r\n]+/g, " ").slice(0, 500); }
function iso(now: number): string { return new Date(now).toISOString(); }
function statusOf(value: Record<string, unknown>): string | undefined {
  for (const key of ["processing_status", "status"]) if (typeof value[key] === "string") return value[key];
  return undefined;
}
function remoteVideoId(value: Record<string, unknown>): string | undefined {
  const metadata = value.metadata;
  if (metadata !== null && typeof metadata === "object" && !Array.isArray(metadata) && typeof (metadata as Record<string, unknown>).video_id === "string") return (metadata as Record<string, unknown>).video_id as string;
  return typeof value.video_id === "string" ? value.video_id : undefined;
}
function hasIdentity(value: Record<string, unknown>, videoId: string): boolean { return remoteVideoId(value) === videoId; }
function activeStatus(status: string | undefined): boolean { return status === undefined || ACTIVE.has(status.toLowerCase()); }
function failedStatus(status: string | undefined): boolean { return status !== undefined && FAILED.has(status.toLowerCase()); }
function contentId(value: ContentListItem | ContentResponse): string | undefined {
  return typeof value.id === "string" && value.id !== "" ? value.id : undefined;
}
function jobId(value: IngestResponse): string | undefined { return typeof value.job_id === "string" && value.job_id !== "" ? value.job_id : undefined; }

async function logFile(path: string, text: string): Promise<void> {
  try { await mkdir(dirname(path), { recursive: true }); } catch { /* logging is best effort */ }
  try {
    await appendFile(path, `${new Date().toISOString()} ${text.slice(0, 500)}\n`, "utf8");
    const size = (await stat(path)).size;
    if (size > MAX_LOG_BYTES) {
      const content = await readFile(path);
      await writeBoundedLog(path, content.subarray(Math.floor(content.length / 2)));
    }
  } catch { /* logging cannot make a scheduled attempt fail */ }
}
async function writeBoundedLog(path: string, bytes: Buffer): Promise<void> {
  const temporary = `${path}.${process.pid}.tmp`;
  await import("node:fs/promises").then(({ writeFile, rename }) => writeFile(temporary, bytes).then(() => rename(temporary, path)));
}

function deadlineSignal(clock: Clock, deadline: number, parent: AbortSignal | undefined, timerApi: WorkerTimer): { signal: AbortSignal; remaining: () => number; stop: () => void } {
  const controller = new AbortController();
  const onAbort = () => controller.abort(parent?.reason);
  parent?.addEventListener("abort", onAbort, { once: true });
  const timer = timerApi.setTimeout(() => controller.abort(new Error("backfill deadline exceeded")), Math.max(1, deadline - clock.now()));
  (timer as ReturnType<typeof setTimeout> & { unref?: () => void }).unref?.();
  return { signal: controller.signal, remaining: () => Math.max(0, deadline - clock.now()), stop: () => { timerApi.clearTimeout(timer); parent?.removeEventListener("abort", onAbort); } };
}

function recordFor(state: BackfillState, videoId: string, endpoint: string): RemoteRecord | undefined {
  const record = state.entries[videoId];
  return record?.endpoint === endpoint ? record : undefined;
}

/**
 * Cache scans are deterministic (see scanCache's sort), so a persisted next ID
 * gives each daily attempt a stable starting point without making entry state
 * endpoint-independent. An ID that disappeared since the previous scan simply
 * starts at the first current entry.
 */
function rotatedEntries(entries: CacheEntry[], state: BackfillState): CacheEntry[] {
  if (entries.length === 0) return [];
  const cursor = typeof state.nextVideoId === "string" ? state.nextVideoId : undefined;
  const found = cursor === undefined ? -1 : entries.findIndex((entry) => entry.videoId === cursor);
  const index = found >= 0 ? found : 0;
  state.nextVideoId = entries[(index + 1) % entries.length]!.videoId;
  return [...entries.slice(index), ...entries.slice(0, index)];
}

async function saveRemote(state: BackfillState, config: BackfillConfig, videoId: string, content: string | undefined, job: string | undefined, clock: Clock): Promise<void> {
  setRecord(state, videoId, { endpoint: config.endpoint, ...(content === undefined ? {} : { contentId: content }), ...(job === undefined ? {} : { jobId: job }), updatedAt: iso(clock.now()) });
  await writeState(config.statePath, state);
}

async function confirmAndDelete(entry: CacheEntry, config: BackfillConfig, state: BackfillState, remote: Record<string, unknown>, clock: Clock, logger: (message: string) => void): Promise<boolean> {
  if (!hasIdentity(remote, entry.videoId) || statusOf(remote)?.toLowerCase() !== "completed") return false;
  await deleteCacheEntry(config.cacheRoot, entry.videoId);
  removeRecord(state, entry.videoId);
  await writeState(config.statePath, state);
  logger(`${entry.videoId}: verified completed content; removed local cache`);
  return true;
}

async function observe(
  entry: CacheEntry,
  config: BackfillConfig,
  state: BackfillState,
  api: WorkerApi,
  record: RemoteRecord,
  signal: AbortSignal,
  clock: Clock,
  logger: (message: string) => void,
): Promise<"active" | "failed" | "deleted"> {
  if (record.jobId !== undefined) {
    const job: JobResponse = await api.job(record.jobId, false, signal);
    const status = typeof job.status === "string" ? job.status.toLowerCase() : undefined;
    if (status === "completed") {
      const resolvedContentId = record.contentId ?? (typeof job.content_id === "string" ? job.content_id : undefined);
      if (resolvedContentId === undefined) throw new Error(`${entry.videoId}: completed job omitted content id`);
      const content = await api.getContent(resolvedContentId, signal);
      if (await confirmAndDelete(entry, config, state, content, clock, logger)) return "deleted";
      throw new Error(`${entry.videoId}: completed job did not confirm video identity`);
    }
    if (failedStatus(status)) return "failed";
    return "active";
  }
  if (record.contentId === undefined) return "failed";
  const content = await api.getContent(record.contentId, signal);
  const contentRecord = content as Record<string, unknown>;
  if (await confirmAndDelete(entry, config, state, contentRecord, clock, logger)) return "deleted";
  const status = statusOf(contentRecord);
  if (failedStatus(status)) return "failed";
  if (activeStatus(status)) return "active";
  throw new Error(`${entry.videoId}: remote content has no safe processing status`);
}

async function lookup(entry: CacheEntry, api: WorkerApi, signal: AbortSignal): Promise<ContentListItem | undefined> {
  const found = await api.findByVideoId(entry.videoId, signal);
  if (found !== undefined && !hasIdentity(found as Record<string, unknown>, entry.videoId)) throw new Error(`${entry.videoId}: lookup returned unrelated content`);
  return found;
}

async function upload(
  entry: CacheEntry,
  config: BackfillConfig,
  state: BackfillState,
  api: WorkerApi,
  signal: AbortSignal,
  clock: Clock,
  logger: (message: string) => void,
): Promise<"active" | "deleted"> {
  const payload = {
    url: `https://youtube.com/watch?v=${entry.videoId}`,
    transcript_text: entry.transcript,
    transcript_format: "plain" as const,
    ...(entry.metadata === undefined ? {} : { metadata: entry.metadata }),
  };
  let response: IngestResponse;
  try {
    response = await api.ingest(payload, { signal });
  } catch (error) {
    // A lost response is ambiguous. Resolve it by identity before ever posting again.
    const recovered = await lookup(entry, api, signal);
    if (recovered === undefined) throw error;
    const recoveredId = contentId(recovered);
    if (recoveredId === undefined) throw new Error(`${entry.videoId}: recovery lookup omitted content id`);
    await saveRemote(state, config, entry.videoId, recoveredId, undefined, clock);
    const recoveredState = await observe(entry, config, state, api, { endpoint: config.endpoint, contentId: recoveredId, updatedAt: iso(clock.now()) }, signal, clock, logger);
    return recoveredState === "deleted" ? "deleted" : "active";
      }
  const remoteContentId = typeof response.content_id === "string" && response.content_id !== "" ? response.content_id : undefined;
  const remoteJobId = jobId(response);
  if (remoteContentId === undefined || remoteJobId === undefined) throw new Error(`${entry.videoId}: upload response omitted content_id or job_id`);
  await saveRemote(state, config, entry.videoId, remoteContentId, remoteJobId, clock);
  const observed = await observe(entry, config, state, api, { endpoint: config.endpoint, contentId: remoteContentId, jobId: remoteJobId, updatedAt: iso(clock.now()) }, signal, clock, logger);
  return observed === "deleted" ? "deleted" : "active";
}

async function processEntry(entry: CacheEntry, config: BackfillConfig, state: BackfillState, api: WorkerApi, signal: AbortSignal, clock: Clock, logger: (message: string) => void): Promise<"deleted" | "active"> {
  const saved = recordFor(state, entry.videoId, config.endpoint);
  if (saved !== undefined && (saved.contentId !== undefined || saved.jobId !== undefined)) {
    const observed = await observe(entry, config, state, api, saved, signal, clock, logger);
    if (observed === "deleted" || observed === "active") return observed;
  }
  // A lookup is deliberately made before every fresh POST. It both avoids duplicates and
  // resolves responses lost after the server accepted an upload.
  const found = await lookup(entry, api, signal);
  if (found !== undefined) {
    const foundId = contentId(found);
    if (foundId === undefined) throw new Error(`${entry.videoId}: lookup omitted content id`);
    await saveRemote(state, config, entry.videoId, foundId, undefined, clock);
    const observed = await observe(entry, config, state, api, { endpoint: config.endpoint, contentId: foundId, updatedAt: iso(clock.now()) }, signal, clock, logger);
    if (observed === "deleted" || observed === "active") return observed;
  }
  return upload(entry, config, state, api, signal, clock, logger);
}

function defaultFactory(config: BackfillConfig, signal: AbortSignal, timeoutMs: number): Promise<WorkerApi> {
  return createOnclaveClient({ endpoint: config.endpoint, keyPath: config.keyPath, timeoutMs, signal });
}

export async function runBackfill(config: BackfillConfig, options: WorkerOptions = {}): Promise<WorkerResult> {
  const clock = options.clock ?? { now: Date.now };
  const initial = await scanCache(config.cacheRoot);
  const lock: LockHandle | undefined = await acquireLock(config.lockPath, clock.now);
  if (lock === undefined) return { status: "locked", processed: 0, deleted: 0, pending: initial.entries.length, invalid: initial.invalid };
  const log = (text: string) => { options.logger?.(text); void logFile(config.logPath, text); };
  const deadline = clock.now() + (options.deadlineMs ?? RUN_DEADLINE_MS);
  const bounded = deadlineSignal(clock, deadline, options.signal, options.timer ?? globalThis);
  const state = await readState(config.statePath);
  try {
    if (!isDue(state, clock.now())) return { status: "not_due", processed: 0, deleted: 0, pending: initial.entries.length, invalid: initial.invalid };

    // Claim this daily attempt before constructing the client. In particular,
    // the default factory reads the key, so this write must complete before it
    // is called. A crash after this point is intentionally still a consumed
    // attempt and will be picked up by the next daily/login trigger.
    setAttempt(state, clock.now());
    await writeState(config.statePath, state);

    const scan: CacheScan = await scanCache(config.cacheRoot);
    if (scan.entries.length === 0) {
      finishState(state, clock.now(), { status: "empty", processed: 0, deleted: 0, pending: 0, invalid: scan.invalid });
      await writeState(config.statePath, state);
      return { status: "empty", processed: 0, deleted: 0, pending: 0, invalid: scan.invalid };
    }
    // Advance before doing any client work. This makes an interrupted run
    // rotate to the next valid entry instead of retrying the same prefix.
    const entries = rotatedEntries(scan.entries, state);
    await writeState(config.statePath, state);
    if (bounded.signal.aborted) throw new Error("backfill interrupted");
    if (config.endpoint === "") throw new Error("Backfill configuration is missing endpoint");
    const factory = options.apiFactory ?? defaultFactory;
    const api = await factory(config, bounded.signal, Math.max(1, Math.min(REQUEST_LIMIT_MS, bounded.remaining())));
    let processed = 0;
    let deleted = 0;
    let errors = 0;
    for (const entry of entries) {
      if (bounded.remaining() <= 0 || bounded.signal.aborted) break;
      processed += 1;
      try {
        if (await processEntry(entry, config, state, api, bounded.signal, clock, log) === "deleted") deleted += 1;
      } catch (error) {
        errors += 1;
        log(`${entry.videoId}: ${message(error)}`);
      }
    }
    const pending = Math.max(0, scan.entries.length - deleted);
    const status = bounded.signal.aborted ? "interrupted" : errors === 0 && pending === 0 ? "completed" : errors === scan.entries.length ? "failed" : "partial";
    finishState(state, clock.now(), { status, processed, deleted, pending, invalid: scan.invalid, ...(errors === 0 ? {} : { error: `${errors} cache entr${errors === 1 ? "y" : "ies"} failed` }) });
    await writeState(config.statePath, state);
    return { status, processed, deleted, pending, invalid: scan.invalid, ...(errors === 0 ? {} : { error: `${errors} cache entr${errors === 1 ? "y" : "ies"} failed` }) };
  } catch (error) {
    // The attempt write above is deliberately the first state mutation that
    // can gate network work. If it failed, do not retry client creation; make a
    // best-effort failure record and return even if the state path remains
    // unavailable.
    setAttempt(state, clock.now());
    finishState(state, clock.now(), { status: bounded.signal.aborted ? "interrupted" : "failed", processed: 0, deleted: 0, pending: initial.entries.length, invalid: initial.invalid, error: message(error) });
    try { await writeState(config.statePath, state); } catch { /* state persistence failure must not become network work */ }
    return { status: bounded.signal.aborted ? "interrupted" : "failed", processed: 0, deleted: 0, pending: initial.entries.length, invalid: initial.invalid, error: message(error) };
  } finally {
    bounded.stop();
    await lock.release();
  }
}

export async function status(config: BackfillConfig): Promise<Record<string, unknown>> {
  const scan = await scanCache(config.cacheRoot);
  const state = await readState(config.statePath);
  return {
    configured: config.endpoint !== "",
    endpoint: config.endpoint || undefined,
    cacheRoot: config.cacheRoot,
    statePath: config.statePath,
    due: isDue(state, Date.now()),
    pending: pendingCount(scan),
    invalid: scan.invalid,
    lastAttemptAt: state.lastAttemptAt,
    lastResult: state.lastResult,
  };
}

import { mkdir, readFile, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { scanCache } from "../src/cache.js";
import { acquireLock } from "../src/lock.js";
import { runBackfill, status, type WorkerApi } from "../src/worker.js";
import { readState } from "../src/state.js";
import type { BackfillConfig } from "../src/config.js";

const VIDEO = "dQw4w9WgXcQ";
const OTHER = "9bZkp7q19f0";
const now = 1_800_000_000_000;

async function fixture(): Promise<{ root: string; config: BackfillConfig }> {
  const root = await mkdtemp(join(tmpdir(), "onclave-backfill-"));
  return { root, config: { endpoint: "https://vault.example/api/v1/", keyPath: join(root, "id_ed25519"), cacheRoot: root, statePath: join(root, "state.json"), lockPath: join(root, "lock"), logPath: join(root, "worker.log") } };
}
async function complete(root: string, videoId = VIDEO, options: { metadata?: unknown; transcript?: string; metadataComplete?: boolean } = {}): Promise<void> {
  const directory = join(root, videoId);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, ".complete"), JSON.stringify({ transcript: true, metadata: options.metadataComplete ?? options.metadata !== undefined }));
  await writeFile(join(directory, "transcript.txt"), options.transcript ?? "a local transcript\n");
  if (options.metadata !== undefined) await writeFile(join(directory, "metadata.json"), JSON.stringify(options.metadata));
}
function api(overrides: Partial<WorkerApi> = {}): WorkerApi {
  return {
    findByVideoId: vi.fn(async () => undefined),
    getContent: vi.fn(async (id: string) => ({ id, content_type: "youtube", metadata: { video_id: VIDEO }, processing_status: "processing" })),
    job: vi.fn(async (id: string) => ({ job_id: id, content_id: "content", status: "processing" })),
    ingest: vi.fn(async () => ({ content_id: "content", content_type: "youtube", title: "Video", job_id: "job" })),
    ...overrides,
  };
}
function clock(value = now) { return { now: () => value }; }

 describe("local cache validation", () => {
  it("accepts only complete, non-empty, bounded UTF-8 transcripts and required metadata", async () => {
    const { root } = await fixture();
    await complete(root, VIDEO, { metadata: { video_id: VIDEO } });
    await complete(root, OTHER, { metadata: "not an object" });
    await complete(root, "a2345678901", { transcript: "" });
    await complete(root, "b2345678901", { metadata: { video_id: "b2345678901" } });
    await writeFile(join(root, "b2345678901", "transcript.txt"), Buffer.from([0xff, 0xfe]));
    await complete(root, "c2345678901", { metadata: { video_id: "c2345678901" } });
    await writeFile(join(root, "c2345678901", "transcript.txt"), Buffer.alloc(5 * 1024 * 1024 + 1, "x"));
    await mkdir(join(root, "not-a-video"));
    const result = await scanCache(root);
    expect(result.entries.map((entry) => entry.videoId)).toEqual([VIDEO]);
    expect(result.invalid).toBe(5);
    expect(result.diagnostics.join(" ")).toContain("metadata");
  });

  it("handles a missing cache as an empty scan", async () => {
    const { root } = await fixture();
    const result = await scanCache(join(root, "missing"));
    expect(result.entries).toEqual([]);
    expect(result.invalid).toBe(0);
  });
});

describe("daily worker", () => {
  it("does not create a client or read a key for an empty cache, while recording the attempt", async () => {
    const { config } = await fixture();
    config.keyPath = join(config.cacheRoot, "key-that-must-not-be-read");
    const factory = vi.fn();
    const result = await runBackfill(config, { clock: clock(), apiFactory: factory });
    expect(result.status).toBe("empty");
    expect(factory).not.toHaveBeenCalled();
    expect((await readState(config.statePath)).lastResult?.status).toBe("empty");
  });

  it("persists the daily attempt before client setup can be terminated", async () => {
    const { root, config } = await fixture();
    await complete(root, VIDEO, { metadata: { video_id: VIDEO } });
    const factory = vi.fn(async () => {
      expect((await readState(config.statePath)).lastAttemptAt).toBe(new Date(now).toISOString());
      throw new Error("forced termination during client setup");
    });
    const result = await runBackfill(config, { clock: clock(), apiFactory: factory });
    expect(result.status).toBe("failed");
    expect(factory).toHaveBeenCalledTimes(1);
    expect((await readState(config.statePath)).lastAttemptAt).toBe(new Date(now).toISOString());
  });

  it("does no client or network work when the daily attempt cannot be persisted", async () => {
    const { root, config } = await fixture();
    await complete(root, VIDEO, { metadata: { video_id: VIDEO } });
    config.statePath = join(root, "state-directory");
    await mkdir(config.statePath);
    const factory = vi.fn();
    const result = await runBackfill(config, { clock: clock(), apiFactory: factory });
    expect(result.status).toBe("failed");
    expect(factory).not.toHaveBeenCalled();
  });

  it("enforces first-run, daily, and catch-up due behavior", async () => {
    const { config } = await fixture();
    const first = await runBackfill(config, { clock: clock(), apiFactory: vi.fn() });
    expect(first.status).toBe("empty");
    const notDue = await runBackfill(config, { clock: clock(now + 23 * 60 * 60 * 1000), apiFactory: vi.fn() });
    expect(notDue.status).toBe("not_due");
    const catchUp = await runBackfill(config, { clock: clock(now + 24 * 60 * 60 * 1000), apiFactory: vi.fn() });
    expect(catchUp.status).toBe("empty");
  });

  it("uses the persisted job, confirms identity and processing before deleting only that cache", async () => {
    const { root, config } = await fixture();
    await complete(root, VIDEO, { metadata: { video_id: VIDEO } });
    await complete(root, OTHER, { metadata: { video_id: OTHER } });
    const state = await readState(config.statePath);
    state.lastAttemptAt = new Date(now - 25 * 60 * 60 * 1000).toISOString();
    state.entries[VIDEO] = { endpoint: config.endpoint, contentId: "content", jobId: "job", updatedAt: new Date(now).toISOString() };
    await writeFile(config.statePath, JSON.stringify(state));
    const remote = api({
      job: vi.fn(async () => ({ job_id: "job", content_id: "content", status: "completed" })),
      getContent: vi.fn(async () => ({ id: "content", content_type: "youtube", metadata: { video_id: VIDEO }, processing_status: "completed" })),
    });
    const result = await runBackfill(config, { clock: clock(now), apiFactory: vi.fn(async () => remote) });
    expect(result.deleted).toBe(1);
    await expect(readFile(join(root, VIDEO))).rejects.toThrow();
    await expect(readFile(join(root, OTHER, "transcript.txt"))).resolves.toBeTruthy();
  });

  it("keeps active and failed content local, without a polling sleep", async () => {
    const { root, config } = await fixture();
    await complete(root, VIDEO, { metadata: { video_id: VIDEO } });
    const remote = api({
      findByVideoId: vi.fn(async () => ({ id: "existing", content_type: "youtube", title: null, metadata: { video_id: VIDEO }, status: "failed", created_at: "", chunk_count: 0, tags: [] })),
      getContent: vi.fn(async () => ({ id: "existing", content_type: "youtube", metadata: { video_id: VIDEO }, processing_status: "failed" })),
    });
    const result = await runBackfill(config, { clock: clock(), apiFactory: vi.fn(async () => remote) });
    expect(result.pending).toBe(1);
    await expect(readFile(join(root, VIDEO, "transcript.txt"))).resolves.toBeTruthy();
    expect(remote.ingest).toHaveBeenCalledTimes(1);
  });

  it("recovers a lost upload response by video identity before resubmitting", async () => {
    const { root, config } = await fixture();
    await complete(root, VIDEO, { metadata: { video_id: VIDEO } });
    const remote = api({
      ingest: vi.fn(async () => { throw new Error("connection reset after upload"); }),
      findByVideoId: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValue({ id: "recovered", content_type: "youtube", title: null, metadata: { video_id: VIDEO }, status: "processing", created_at: "", chunk_count: 0, tags: [] }),
      getContent: vi.fn(async () => ({ id: "recovered", content_type: "youtube", metadata: { video_id: VIDEO }, processing_status: "processing" })),
    });
    await runBackfill(config, { clock: clock(), apiFactory: vi.fn(async () => remote) });
    expect(remote.ingest).toHaveBeenCalledTimes(1);
    expect((await readState(config.statePath)).entries[VIDEO].contentId).toBe("recovered");
  });

  it("does not reuse a persisted remote id at another endpoint", async () => {
    const { root, config } = await fixture();
    await complete(root, VIDEO, { metadata: { video_id: VIDEO } });
    const state = await readState(config.statePath);
    state.entries[VIDEO] = { endpoint: "https://other.example/api/v1/", contentId: "wrong", updatedAt: new Date(now - 25 * 60 * 60 * 1000).toISOString() };
    await writeFile(config.statePath, JSON.stringify(state));
    const remote = api();
    await runBackfill(config, { clock: clock(), apiFactory: vi.fn(async () => remote) });
    expect(remote.getContent).not.toHaveBeenCalledWith("wrong", expect.anything());
    expect(remote.ingest).toHaveBeenCalledTimes(1);
  });

  it("continues after an early failing entry so later entries are attempted", async () => {
    const { root, config } = await fixture();
    await complete(root, "00000000000", { metadata: { video_id: "00000000000" } });
    await complete(root, VIDEO, { metadata: { video_id: VIDEO } });
    const remote = api({
      findByVideoId: vi.fn(async (id: string) => { if (id === "00000000000") throw new Error("temporary failure"); return undefined; }),
    });
    const result = await runBackfill(config, { clock: clock(), apiFactory: vi.fn(async () => remote) });
    expect(result.processed).toBe(2);
    expect(remote.ingest).toHaveBeenCalledTimes(1);
  });

  it("rotates the durable start across daily timeout attempts", async () => {
    const { root, config } = await fixture();
    const first = "00000000000";
    await complete(root, first, { metadata: { video_id: first } });
    await complete(root, VIDEO, { metadata: { video_id: VIDEO } });
    const attempted: string[] = [];
    const controllers = [new AbortController(), new AbortController()];
    let runNumber = 0;
    const timer = {
      setTimeout: () => ({}) as ReturnType<typeof setTimeout>,
      clearTimeout: () => undefined,
    };
    const factory = vi.fn(async (_config: BackfillConfig, signal: AbortSignal) => {
      const controller = controllers[runNumber++]!;
      return api({
        findByVideoId: vi.fn(async (id: string) => {
          attempted.push(id);
          controller.abort();
          return await new Promise<never>((_resolve, reject) => {
            if (signal.aborted) reject(new Error("timed out"));
            else signal.addEventListener("abort", () => reject(new Error("timed out")), { once: true });
          });
        }),
      });
    });
    const firstRun = await runBackfill(config, { clock: clock(now), deadlineMs: 25, signal: controllers[0].signal, timer, apiFactory: factory });
    const secondRun = await runBackfill(config, { clock: clock(now + 24 * 60 * 60 * 1000), deadlineMs: 25, signal: controllers[1].signal, timer, apiFactory: factory });
    expect(firstRun.status).toBe("interrupted");
    expect(secondRun.status).toBe("interrupted");
    expect(attempted).toEqual([first, VIDEO]);
    expect((await readState(config.statePath)).nextVideoId).toBe(first);
  });

  it("retains data when the run is already aborted by its deadline", async () => {
    const { root, config } = await fixture();
    await complete(root, VIDEO, { metadata: { video_id: VIDEO } });
    const factory = vi.fn();
    const result = await runBackfill(config, { clock: clock(), deadlineMs: 1, apiFactory: factory });
    expect(result.status).toBe("interrupted");
    expect(factory).not.toHaveBeenCalled();
    await expect(readFile(join(root, VIDEO, "transcript.txt"))).resolves.toBeTruthy();
  });

  it("serializes concurrent invocations through the singleton lock", async () => {
    const { root, config } = await fixture();
    await complete(root, VIDEO, { metadata: { video_id: VIDEO } });
    let started!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const remote = api({ findByVideoId: vi.fn(async () => { started(); await gate; return undefined; }) });
    const first = runBackfill(config, { clock: clock(), apiFactory: vi.fn(async () => remote) });
    await entered;
    await expect(runBackfill(config, { clock: clock(), apiFactory: vi.fn() })).resolves.toMatchObject({ status: "locked" });
    release();
    await first;
  });

  it("reports pending state without loading credentials or making HTTP calls", async () => {
    const { root, config } = await fixture();
    await complete(root, VIDEO, { metadata: { video_id: VIDEO } });
    const result = await status(config);
    expect(result).toMatchObject({ configured: true, pending: 1, due: true });
  });
});

describe("singleton recovery", () => {
  it("rejects concurrent runs and recovers a dead stale lock", async () => {
    const { root } = await fixture();
    const lockPath = join(root, "lock");
    const first = await acquireLock(lockPath, () => now);
    expect(first).toBeDefined();
    expect(await acquireLock(lockPath, () => now)).toBeUndefined();
    await first?.release();
    await mkdir(lockPath);
    await writeFile(join(lockPath, "owner.json"), JSON.stringify({ pid: 999999, createdAt: now - 31 * 60 * 1000, token: "dead" }));
    const recovered = await acquireLock(lockPath, () => now);
    expect(recovered).toBeDefined();
    await recovered?.release();
  });
});

import { mkdir, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { TRANSCRIPT_LIMIT_BYTES } from "./config.js";

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export type CacheEntry = {
  videoId: string;
  directory: string;
  transcript: string;
  metadata?: Record<string, unknown>;
};

export type CacheScan = {
  entries: CacheEntry[];
  invalid: number;
  diagnostics: string[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function diagnostic(message: string, diagnostics: string[]): void {
  if (diagnostics.length < 50) diagnostics.push(message.slice(0, 240));
}

async function readEntry(root: string, videoId: string, diagnostics: string[]): Promise<CacheEntry | undefined> {
  const directory = join(root, videoId);
  let complete: unknown;
  try { complete = JSON.parse(await readFile(join(directory, ".complete"), "utf8")); }
  catch { diagnostic(`${videoId}: missing or malformed .complete`, diagnostics); return undefined; }
  if (!isObject(complete) || complete.transcript !== true) {
    diagnostic(`${videoId}: transcript is not complete`, diagnostics); return undefined;
  }
  let bytes: Buffer;
  try { bytes = await readFile(join(directory, "transcript.txt")); }
  catch { diagnostic(`${videoId}: transcript.txt is missing`, diagnostics); return undefined; }
  if (bytes.length === 0 || bytes.toString("utf8").trim() === "") {
    diagnostic(`${videoId}: transcript.txt is empty`, diagnostics); return undefined;
  }
  if (bytes.length > TRANSCRIPT_LIMIT_BYTES) {
    diagnostic(`${videoId}: transcript.txt exceeds 5 MB`, diagnostics); return undefined;
  }
  let transcript: string;
  try { transcript = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { diagnostic(`${videoId}: transcript.txt is not valid UTF-8`, diagnostics); return undefined; }

  let metadata: Record<string, unknown> | undefined;
  const metadataPath = join(directory, "metadata.json");
  if (complete.metadata === true) {
    try {
      const value: unknown = JSON.parse(await readFile(metadataPath, "utf8"));
      if (!isObject(value)) throw new Error("metadata is not an object");
      metadata = value;
    } catch { diagnostic(`${videoId}: required metadata.json is missing or malformed`, diagnostics); return undefined; }
  } else {
    try {
      const value: unknown = JSON.parse(await readFile(metadataPath, "utf8"));
      if (isObject(value)) metadata = value;
    } catch { /* optional metadata is allowed to be absent or stale */ }
  }
  return { videoId, directory, transcript, metadata };
}

export async function scanCache(root: string): Promise<CacheScan> {
  const entries: CacheEntry[] = [];
  const diagnostics: string[] = [];
  let names: string[];
  try { names = await readdir(root); }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return { entries, invalid: 0, diagnostics };
    throw error;
  }
  let invalid = 0;
  for (const name of names.sort()) {
    let isDirectory = false;
    try { isDirectory = (await stat(join(root, name))).isDirectory(); } catch { continue; }
    if (!isDirectory || !VIDEO_ID.test(name)) continue;
    const entry = await readEntry(root, name, diagnostics);
    if (entry) entries.push(entry); else invalid += 1;
  }
  return { entries, invalid, diagnostics };
}

export function isVideoId(value: string): boolean { return VIDEO_ID.test(value); }

export async function deleteCacheEntry(root: string, videoId: string): Promise<void> {
  if (!VIDEO_ID.test(videoId)) throw new Error("Refusing to delete an invalid video cache ID");
  const source = join(root, videoId);
  const deletedRoot = join(root, ".deleted");
  const target = join(deletedRoot, `${videoId}-${Date.now()}-${process.pid}-${randomUUID()}`);
  await mkdir(deletedRoot, { recursive: true });
  try {
    await rename(source, target);
  } catch (error) {
    throw new Error(`could not claim cache directory for deletion: ${error instanceof Error ? error.message : String(error)}`);
  }
  await rm(target, { recursive: true, force: true });
}

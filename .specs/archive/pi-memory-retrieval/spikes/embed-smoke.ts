#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const MODEL_ID = "local-placeholder-384";
const MODEL_REVISION = "2026-05-02";
const MODEL_SOURCE = "generated-local-placeholder";
const MODEL_PATH = join(homedir(), ".pi", "agent", "models", MODEL_ID, "artifact.txt");
const MODEL_CONTENT =
  "pi-memory-retrieval T3 deterministic local placeholder artifact v1\n" +
  "model: local-placeholder-384\n" +
  "dim: 384\n" +
  "source: generated locally by embed-smoke.ts; no network\n" +
  "revision: 2026-05-02\n";
const EXPECTED_SHA256 = "bec3125ffd49b8e836c05fa3041f3df56ca8ec438e03d8d2810ac9bc48225590";
const DIM = 384;

async function ensureLocalArtifact(): Promise<Uint8Array> {
  await mkdir(dirname(MODEL_PATH), { recursive: true });
  try {
    return await readFile(MODEL_PATH);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await writeFile(MODEL_PATH, MODEL_CONTENT, "utf8");
    return await readFile(MODEL_PATH);
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function embedPlaceholder(text: string, artifactSha: string): Float32Array {
  const out = new Float32Array(DIM);
  let norm = 0;
  for (let i = 0; i < DIM; i += 1) {
    const digest = createHash("sha256")
      .update(`${artifactSha}\0${text}\0${i}`)
      .digest();
    const value = (digest.readUInt32BE(0) / 0xffffffff) * 2 - 1;
    out[i] = value;
    norm += value * value;
  }
  const scale = Math.sqrt(norm) || 1;
  for (let i = 0; i < DIM; i += 1) out[i] /= scale;
  return out;
}

const started = performance.now();
const artifact = await ensureLocalArtifact();
const actualSha = sha256(artifact);
if (actualSha !== EXPECTED_SHA256) {
  console.error(`sha256-mismatch expected=${EXPECTED_SHA256} actual=${actualSha} path=${MODEL_PATH}`);
  process.exit(1);
}

const vector = embedPlaceholder("Pi memory retrieval smoke text", actualSha);
const elapsedMs = Math.round(performance.now() - started);
console.log(
  `model=${MODEL_ID} revision=${MODEL_REVISION} source=${MODEL_SOURCE} path=${MODEL_PATH} dim=${vector.length} sha256-ok elapsed_ms=${elapsedMs}`,
);

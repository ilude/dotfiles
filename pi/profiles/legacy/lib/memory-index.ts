import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export const GLOBAL_LAYER_REPO_ID = "__global-layer__";
const DIM = 384;
const MODEL_ID = "local-placeholder-384";
const DTYPE = "float32";
const MODEL_SHA256 = "bec3125ffd49b8e836c05fa3041f3df56ca8ec438e03d8d2810ac9bc48225590";
const SCHEMA_V = 1;
const CHUNKER_V = 1;
const EMBEDDER_LIB_V = "placeholder-v1";

export interface MemoryRow {
  id: string;
  jsonl_path: string;
  jsonl_offset: number;
  line: number;
  ts: string;
  agent: string;
  repo_id: string;
  kind: string;
  text: string;
  meta: Record<string, unknown>;
  embedding: Float32Array;
  superseded_by?: string;
}

export interface MemoryIndex { rows: MemoryRow[]; byId: Map<string, MemoryRow>; fingerprint: Record<string, unknown>; }
let currentIndex: MemoryIndex | null = null;

function homeDir(): string { return process.env.HOME || process.env.USERPROFILE || os.homedir(); }
export function indexDir(): string { return path.join(homeDir(), ".pi", "agent", "index"); }
export function fingerprintPath(): string { return path.join(indexDir(), "fingerprint.json"); }
export function indexPath(): string { return path.join(indexDir(), "memory-index.json"); }
function repoRoot(): string { return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."); }
function expertiseRoot(): string { return path.join(repoRoot(), "pi", "multi-team", "expertise"); }
export function expectedFingerprint() {
  return { model_id: MODEL_ID, dtype: DTYPE, model_sha256: MODEL_SHA256, chunker_v: CHUNKER_V, schema_v: SCHEMA_V, embedder_lib_v: EMBEDDER_LIB_V, dim: DIM };
}
function sameFingerprint(a: unknown, b = expectedFingerprint()): boolean { return JSON.stringify(a) === JSON.stringify(b); }

export function embedText(text: string): Float32Array {
  const out = new Float32Array(DIM); let norm = 0;
  for (const token of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    const h = crypto.createHash("sha1").update(token).digest();
    const idx = h.readUInt32BE(0) % DIM; const sign = (h[4] & 1) ? 1 : -1;
    out[idx] += sign; norm += 1;
  }
  norm = Math.sqrt(out.reduce((s, v) => s + v * v, 0)) || 1;
  for (let i = 0; i < DIM; i++) out[i] /= norm;
  return out;
}

function textOf(record: any): string {
  const e = record?.entry ?? record ?? {};
  return [e.decision, e.summary, e.topic, e.details, e.discovery, e.note, e.notes, e.description, e.path, e.role]
    .filter((v) => typeof v === "string" && v.trim()).join(" -- ") || JSON.stringify(e);
}
function kindOf(record: any): string { return String(record?.kind ?? record?.category ?? record?.entry?.kind ?? "observation"); }
function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : d.isFile() && d.name.endsWith("-expertise-log.jsonl") ? [p] : [];
  });
}
function repoIdFor(file: string, root = expertiseRoot()): string {
  const rel = path.relative(root, path.dirname(file)).split(path.sep).join("/");
  return rel === "" ? GLOBAL_LAYER_REPO_ID : rel;
}
function stableId(repoId: string, relPath: string, lfLine: string, line: number, offset: number): string {
  return crypto.createHash("sha1").update(`${repoId}\0${relPath.toLowerCase()}\0${lfLine.replace(/\r\n/g, "\n")}\0${line}\0${offset}`).digest("hex");
}

export function ingestExpertiseLogs(root = expertiseRoot()): MemoryRow[] {
  const rows: MemoryRow[] = [];
  for (const file of walk(root)) {
    const content = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    const repo_id = repoIdFor(file, root); const agent = path.basename(file).replace(/-expertise-log\.jsonl$/, "");
    const relPath = path.relative(root, file).split(path.sep).join("/");
    let offset = 0; let lineNo = 0;
    for (const line of content.split("\n")) {
      lineNo += 1; const jsonl_offset = offset; offset += Buffer.byteLength(line + "\n");
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line); const text = textOf(record); const id = record.id ?? stableId(repo_id, relPath, line, lineNo, jsonl_offset);
        rows.push({ id, jsonl_path: relPath, jsonl_offset, line: lineNo, ts: record.ts ?? record.timestamp ?? "", agent, repo_id, kind: kindOf(record), text, meta: record, embedding: embedText(text), superseded_by: record.superseded_by ?? record.entry?.superseded_by });
      } catch { /* skip malformed */ }
    }
  }
  return rows;
}

function activeRows(rows: MemoryRow[]): MemoryRow[] { return rows.filter(r => !r.superseded_by); }

export async function rebuildMemoryIndex(root = expertiseRoot()): Promise<MemoryIndex> {
    fs.mkdirSync(indexDir(), { recursive: true });
    const lock = path.join(indexDir(), "memory-index.lock");
    let fd: number | undefined;
    for (let i = 0; i < 50; i++) { try { fd = fs.openSync(lock, "wx"); break; } catch { await new Promise(r => setTimeout(r, 20)); } }
    if (fd === undefined) throw new Error("memory index rebuild lock timeout");
    try {
      const rows = activeRows(ingestExpertiseLogs(root)); const fingerprint = expectedFingerprint();
      const serial = { fingerprint, rows: rows.map(r => ({ ...r, embedding: Array.from(r.embedding) })) };
      const tmp = path.join(indexDir(), `memory-index.${process.pid}.${Date.now()}.tmp`);
      fs.writeFileSync(tmp, JSON.stringify(serial)); fs.renameSync(tmp, indexPath());
      const ftmp = path.join(indexDir(), `fingerprint.${process.pid}.${Date.now()}.tmp`);
      fs.writeFileSync(ftmp, JSON.stringify({ ...fingerprint, active: rows.length }, null, 2)); fs.renameSync(ftmp, fingerprintPath());
      currentIndex = { rows, byId: new Map(rows.map(r => [r.id, r])), fingerprint };
      return currentIndex;
    } finally { fs.closeSync(fd); fs.rmSync(lock, { force: true }); }
}

export async function loadMemoryIndex(): Promise<MemoryIndex> {
  try { if (currentIndex && sameFingerprint(currentIndex.fingerprint)) return currentIndex; } catch {}
  try {
    const fp = JSON.parse(fs.readFileSync(fingerprintPath(), "utf8"));
    if (!sameFingerprint(Object.fromEntries(Object.entries(fp).filter(([k]) => k !== "active")))) {
      console.error("fingerprint mismatch -- rebuilding"); return rebuildMemoryIndex();
    }
    const parsed = JSON.parse(fs.readFileSync(indexPath(), "utf8"));
    if (!sameFingerprint(parsed.fingerprint)) return rebuildMemoryIndex();
    const rows: MemoryRow[] = parsed.rows.map((r: any) => ({ ...r, embedding: Float32Array.from(r.embedding) }));
    currentIndex = { rows, byId: new Map(rows.map(r => [r.id, r])), fingerprint: parsed.fingerprint };
    return currentIndex;
  } catch { return rebuildMemoryIndex(); }
}

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { parse, stringify } from "yaml";
import { lock } from "proper-lockfile";

export type ScriptCondition = { argv: string[] } | { argv: string[]; helpers: Record<string, string> };
export type ScriptTrustRecord = {
  path: string;
  sha256: string;
  outcome: "approved" | "review";
  reason: string;
  conditions?: ScriptCondition[];
  reviewedAt?: string;
};
export type ScriptTrustStore = { version: 1; records: ScriptTrustRecord[] };
export type ScriptIdentity = { path: string; sha256: string; bytes: string };
export type TrustMatch = { matched: boolean; record?: ScriptTrustRecord; identity: ScriptIdentity; storePath: string };

const EMPTY: ScriptTrustStore = { version: 1, records: [] };
const storeCache = new Map<string, { stamp: string; store: ScriptTrustStore }>();

function hash(bytes: string | Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }
function normalize(p: string): string { return path.resolve(p); }

/** Resolve the working-tree root separately from the shared Git common directory. */
export async function gitWorktreeRoot(cwd: string): Promise<string> {
  let dir = normalize(cwd);
  while (true) {
    try { await stat(path.join(dir, ".git")); return dir; } catch { /* continue toward filesystem root */ }
    const parent = path.dirname(dir);
    if (parent === dir) return normalize(cwd);
    dir = parent;
  }
}

/** Resolve the shared Git common directory without invoking Git or reading a repository's contents. */
export async function gitCommonDir(cwd: string): Promise<string | undefined> {
  let dir = normalize(cwd);
  while (true) {
    const dotGit = path.join(dir, ".git");
    try {
      const dotGitStat = await stat(dotGit);
      if (dotGitStat.isDirectory()) return dotGit;
      const text = (await readFile(dotGit, "utf8")).trim();
      const match = /^gitdir:\s*(.+)$/i.exec(text);
      if (!match) return undefined;
      const gitDir = normalize(path.resolve(dir, match[1]));
      const commondir = path.join(gitDir, "commondir");
      try { return normalize(path.resolve(gitDir, (await readFile(commondir, "utf8")).trim())); }
      catch { return gitDir; }
    } catch { /* continue toward filesystem root */ }
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export async function trustPath(cwd: string): Promise<string> {
  const common = await gitCommonDir(cwd);
  return common ? path.join(common, "pi", "damage-control-trust.yaml") : path.join(normalize(cwd), ".pi", "damage-control-trust.yaml");
}

export async function scriptIdentity(file: string): Promise<ScriptIdentity> {
  const bytes = await readFile(file);
  return { path: normalize(file), sha256: hash(bytes), bytes: bytes.toString("utf8") };
}

function validCondition(value: unknown): value is ScriptCondition {
  if (!value || typeof value !== "object" || !Array.isArray((value as any).argv) || !(value as any).argv.every((arg: unknown) => typeof arg === "string")) return false;
  const helpers = (value as any).helpers;
  return helpers === undefined || (!!helpers && typeof helpers === "object" && !Array.isArray(helpers) && Object.entries(helpers).every(([key, digest]) => typeof key === "string" && typeof digest === "string"));
}

async function readStore(file: string): Promise<ScriptTrustStore> {
  let info;
  try { info = await stat(file); } catch { storeCache.delete(file); return EMPTY; }
  const stamp = `${info.ino}:${info.size}:${info.mtimeMs}`;
  const cached = storeCache.get(file);
  if (cached?.stamp === stamp) return cached.store;
  try {
    const raw = parse(await readFile(file, "utf8"));
    if (!raw || raw.version !== 1 || !Array.isArray(raw.records)) { storeCache.set(file, { stamp, store: EMPTY }); return EMPTY; }
    const records = raw.records.filter((r: any) =>
      typeof r?.path === "string" && !path.isAbsolute(r.path) && !r.path.split(/[\\/]/).includes("..") &&
      /^[a-f0-9]{64}$/i.test(r.sha256) && (r.outcome === "approved" || r.outcome === "review") &&
      typeof r.reason === "string" && (r.conditions === undefined || (Array.isArray(r.conditions) && r.conditions.every(validCondition)))
    ).map((r: any) => ({ ...r, sha256: r.sha256.toLowerCase() }));
    const store = { version: 1 as const, records };
    storeCache.set(file, { stamp, store });
    return store;
  } catch { storeCache.set(file, { stamp, store: EMPTY }); return EMPTY; }
}

async function conditionMatches(record: ScriptTrustRecord, argv: readonly string[], helpers: Record<string, string>, root: string): Promise<boolean> {
  if (!record.conditions?.length) return true;
  for (const condition of record.conditions) {
    if (condition.argv.length !== argv.length || !condition.argv.every((arg, i) => arg === argv[i])) continue;
    if (!("helpers" in condition)) return true;
    let matches = true;
    for (const [helper, expected] of Object.entries(condition.helpers)) {
      let actual = helpers[helper];
      if (actual === undefined) {
        try { actual = hash(await readFile(path.resolve(root, helper))); } catch { actual = ""; }
      }
      if (actual !== expected) { matches = false; break; }
    }
    if (matches) return true;
  }
  return false;
}

export async function trustRecordPath(file: string, cwd: string): Promise<string> {
  const root = await gitWorktreeRoot(cwd);
  return path.relative(root, normalize(file)).replaceAll(path.sep, "/");
}

export async function findTrust(file: string, cwd: string, argv: readonly string[], helpers: Record<string, string> = {}): Promise<TrustMatch> {
  const identity = await scriptIdentity(file);
  const storePath = await trustPath(cwd);
  const store = await readStore(storePath);
  const relative = await trustRecordPath(identity.path, cwd);
  const root = await gitWorktreeRoot(cwd);
  // A record outside this repository must never become a grant through a ../ path.
  const isRelative = relative !== "" && relative !== "." && !relative.split(/[\\/]/).includes("..") && !path.isAbsolute(relative);
  let record: ScriptTrustRecord | undefined;
  if (isRelative) {
    for (const candidate of store.records) {
      if (candidate.path === relative && candidate.sha256 === identity.sha256 && candidate.outcome === "approved" && await conditionMatches(candidate, argv, helpers, root)) { record = candidate; break; }
    }
  }
  return { matched: !!record, record, identity, storePath };
}

export async function addTrustRecord(cwd: string, record: ScriptTrustRecord): Promise<void> {
  const file = await trustPath(cwd);
  await mkdir(path.dirname(file), { recursive: true });
  // Lock a neighboring stable file so the target can be replaced atomically.
  const lockTarget = `${file}.lock`;
  await writeFile(lockTarget, "", { flag: "a" });
  const release = await lock(lockTarget, { retries: { retries: 8, minTimeout: 10, maxTimeout: 100 } });
  try {
    const store = await readStore(file);
    const next = store.records.filter(item => !(item.path === record.path && item.sha256 === record.sha256 && JSON.stringify(item.conditions ?? []) === JSON.stringify(record.conditions ?? [])));
    next.push(record);
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temp, stringify({ version: 1, records: next }), "utf8");
    await rename(temp, file);
    storeCache.delete(file);
  } finally { await release(); }
}

export async function loadTrust(cwd: string): Promise<{ path: string; store: ScriptTrustStore }> {
  const file = await trustPath(cwd);
  return { path: file, store: await readStore(file) };
}

export const sha256 = hash;

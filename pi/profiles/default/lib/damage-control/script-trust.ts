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

function hash(bytes: string | Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }
function normalize(p: string): string { return path.resolve(p); }

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

async function readStore(file: string): Promise<ScriptTrustStore> {
  try {
    const raw = parse(await readFile(file, "utf8"));
    if (!raw || raw.version !== 1 || !Array.isArray(raw.records)) return EMPTY;
    const records = raw.records.filter((r: any) => typeof r?.path === "string" && typeof r?.sha256 === "string" && (r.outcome === "approved" || r.outcome === "review") && typeof r.reason === "string");
    return { version: 1, records };
  } catch { return EMPTY; }
}

function conditionMatches(record: ScriptTrustRecord, argv: readonly string[], helpers: Record<string, string>): boolean {
  if (!record.conditions?.length) return true;
  return record.conditions.some(condition => condition.argv.length === argv.length && condition.argv.every((arg, i) => arg === argv[i]) && (!("helpers" in condition) || Object.entries(condition.helpers).every(([p, digest]) => helpers[p] === digest)));
}

export async function trustRecordPath(file: string, cwd: string): Promise<string> {
  const common = await gitCommonDir(cwd);
  const root = common ? path.dirname(common) : normalize(cwd);
  return path.relative(root, normalize(file)).replaceAll(path.sep, "/");
}

export async function findTrust(file: string, cwd: string, argv: readonly string[], helpers: Record<string, string> = {}): Promise<TrustMatch> {
  const identity = await scriptIdentity(file);
  const storePath = await trustPath(cwd);
  const store = await readStore(storePath);
  const relative = await trustRecordPath(identity.path, cwd);
  const record = store.records.find(item => item.path === relative && item.sha256 === identity.sha256 && item.outcome === "approved" && conditionMatches(item, argv, helpers));
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
  } finally { await release(); }
}

export async function loadTrust(cwd: string): Promise<{ path: string; store: ScriptTrustStore }> {
  const file = await trustPath(cwd);
  return { path: file, store: await readStore(file) };
}

export const sha256 = hash;

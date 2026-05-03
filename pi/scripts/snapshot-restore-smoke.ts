#!/usr/bin/env bun
/**
 * Snapshot archive restore-smoke (T4 AC #2).
 *
 * Copies an archive's mirrored snapshot files to a temp directory, JSON.parses
 * each *-mental-model.json file, and asserts the parsed value matches the
 * legacy ExpertiseSnapshot top-level shape.
 *
 * Exit codes:
 *   0 -- every file restored and parsed; ExpertiseSnapshot shape verified
 *   1 -- any restore copy, JSON parse, or shape assertion failed
 *
 * Usage:
 *   bun pi/scripts/snapshot-restore-smoke.ts [archiveDir]
 *
 * If archiveDir is omitted, the latest dir under ~/.pi/agent/index/archive/
 * is selected by lexicographic name (timestamps sort correctly).
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// Inlined ExpertiseSnapshot top-level shape -- the legacy snapshot library has
// been retired. We only assert the structural keys that every historical
// snapshot is required to carry. Items inside categories[] are not deeply
// validated -- presence of the array is enough.
interface LegacyExpertiseSnapshotShape {
  schema_version: number;
  agent: string;
  categories: {
    strong_decision: unknown[];
    key_file: unknown[];
    pattern: unknown[];
    observation: unknown[];
    open_question: unknown[];
    system_overview: unknown[];
  };
}

interface ManifestEntry {
  src: string;
  dst: string;
  sha256: string;
}

export function findLatestArchive(): string {
  const archiveRoot = path.join(os.homedir(), ".pi", "agent", "index", "archive");
  if (!fs.existsSync(archiveRoot)) {
    throw new Error(`archive root does not exist: ${archiveRoot}`);
  }
  const entries = fs
    .readdirSync(archiveRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  if (entries.length === 0) {
    throw new Error(`no archive subdirectories under ${archiveRoot}`);
  }
  return path.join(archiveRoot, entries[entries.length - 1]);
}

function isExpertiseSnapshotShape(value: unknown): value is LegacyExpertiseSnapshotShape {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.schema_version !== "number") return false;
  if (typeof v.agent !== "string") return false;
  const cats = v.categories;
  if (!cats || typeof cats !== "object") return false;
  const c = cats as Record<string, unknown>;
  for (const key of [
    "strong_decision",
    "key_file",
    "pattern",
    "observation",
    "open_question",
    "system_overview",
  ]) {
    if (!Array.isArray(c[key])) return false;
  }
  return true;
}

export function runRestoreSmoke(archiveDir: string): {
  archiveDir: string;
  total: number;
  parsed: number;
} {
  const manifestPath = path.join(archiveDir, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
    files: ManifestEntry[];
  };

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pi-snapshot-restore-smoke-"));
  let total = 0;
  let parsed = 0;

  try {
    for (const entry of manifest.files) {
      const srcAbs = path.join(archiveDir, entry.dst.split("/").join(path.sep));
      const dstAbs = path.join(tmp, entry.dst.split("/").join(path.sep));
      fs.mkdirSync(path.dirname(dstAbs), { recursive: true });
      fs.copyFileSync(srcAbs, dstAbs);
      total += 1;

      const text = fs.readFileSync(dstAbs, "utf8");
      const value = JSON.parse(text);

      // Only enforce ExpertiseSnapshot shape on the canonical mental-model
      // files. The .state.json siblings carry rebuild bookkeeping and never
      // matched the snapshot shape -- restoring + parse-OK is enough for them.
      const isMentalModel =
        entry.dst.endsWith("-mental-model.json") &&
        !entry.dst.endsWith("-mental-model.state.json");
      if (isMentalModel && !isExpertiseSnapshotShape(value)) {
        throw new Error(
          `archive ${entry.dst} does not match ExpertiseSnapshot shape`
        );
      }
      parsed += 1;
    }
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }

  return { archiveDir, total, parsed };
}

function isMain(): boolean {
  // Bun + Node ESM -- compare resolved paths to detect direct invocation.
  const entry = process.argv[1];
  if (!entry) return false;
  const here = new URL(import.meta.url).pathname;
  // Windows pathname has a leading slash; normalize for comparison.
  const norm = (p: string) => path.resolve(p).toLowerCase();
  return norm(entry) === norm(here.replace(/^\/(\w:)/, "$1"));
}

if (isMain()) {
  try {
    const argDir = process.argv[2];
    const archiveDir = argDir ? path.resolve(argDir) : findLatestArchive();
    const result = runRestoreSmoke(archiveDir);
    console.log(
      `restore_smoke=${result.parsed}/${result.total} archive=${result.archiveDir}`
    );
    process.exit(result.parsed === result.total ? 0 : 1);
  } catch (err) {
    console.error(String(err));
    process.exit(1);
  }
}

#!/usr/bin/env bun
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { indexDir } from "../lib/memory-index";
import {
  planArchive,
  writeArchive,
  restoreSmoke,
  sha256OfFile,
} from "../lib/memory-snapshot-archive";

const confirm = process.argv.includes("--confirm");

// Filesystem-safe ISO timestamp: replace colons, drop milliseconds and Z suffix.
// Example: 2026-05-02T17-42-08Z
function safeIsoTs(): string {
  return new Date()
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\.\d+Z$/, "Z");
}

const isoTs = safeIsoTs();
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);
const archiveRoot = path.join(indexDir(), "archive");

const plan = planArchive(repoRoot, archiveRoot, isoTs);

if (!confirm) {
  // Dry-run mode -- no filesystem writes under archiveRoot.
  const lines: string[] = [];
  function emit(s: string): void {
    lines.push(s);
    console.log(s);
  }

  emit("mode=dry-run");
  emit(`archive_dir=${plan.archiveDir}`);
  emit(`files_to_archive=${plan.sourceFiles.length}`);

  for (const entry of plan.manifestEntries) {
    emit(`  -> ${entry.src} (sha256=${entry.sha256.slice(0, 12)})`);
  }

  emit(`manifest_entries=${plan.manifestEntries.length}`);
  emit(`collision=${plan.collision}`);

  if (plan.collision) {
    emit(
      `WARNING: archive_dir already exists; confirm mode would refuse`
    );
  }

  emit("next: re-run with --confirm to write the archive");
  process.exit(0);
}

// Confirm mode.
const transcript: string[] = [];
function record(s: string): void {
  transcript.push(s);
  console.log(s);
}

record("mode=confirm");

try {
  writeArchive(plan, repoRoot, transcript);

  const smoke = restoreSmoke(plan.archiveDir);
  record(`restore_smoke=${smoke.restoredFiles}/${smoke.parsedFiles}`);
  record(`archive_complete=${plan.archiveDir}`);
} catch (err) {
  console.error(String(err));
  process.exit(1);
}

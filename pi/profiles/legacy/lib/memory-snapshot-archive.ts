import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface ManifestEntry {
  src: string;
  dst: string;
  sha256: string;
}

export interface ArchivePlan {
  archiveDir: string;
  sourceFiles: string[];
  manifestEntries: ManifestEntry[];
  collision: boolean;
}

/**
 * Returns absolute paths for all *-mental-model*.json files under
 * pi/multi-team/expertise (recursive). Sorted lexicographically.
 * YAML files are intentionally excluded.
 */
export function findSnapshotFiles(repoRoot: string): string[] {
  const expertiseRoot = path.join(repoRoot, "pi", "multi-team", "expertise");
  const results: string[] = [];
  collectJsonSnapshots(expertiseRoot, results);
  return results.sort();
}

function collectJsonSnapshots(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectJsonSnapshots(full, out);
    } else if (
      entry.isFile() &&
      entry.name.includes("-mental-model") &&
      entry.name.endsWith(".json")
    ) {
      out.push(full);
    }
  }
}

/** Returns hex SHA256 of the file at absPath. */
export function sha256OfFile(absPath: string): string {
  const buf = fs.readFileSync(absPath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/**
 * Builds an ArchivePlan without touching the filesystem.
 *
 * archiveDir = archiveRoot / isoTs
 * manifestEntries.src  = relative to repoRoot (forward slashes)
 * manifestEntries.dst  = same relative path (mirrored under archiveDir)
 */
export function planArchive(
  repoRoot: string,
  archiveRoot: string,
  isoTs: string
): ArchivePlan {
  const archiveDir = path.join(archiveRoot, isoTs);
  const collision = fs.existsSync(archiveDir);
  const sourceFiles = findSnapshotFiles(repoRoot);

  const manifestEntries: ManifestEntry[] = sourceFiles.map((abs) => {
    const rel = path.relative(repoRoot, abs).split(path.sep).join("/");
    return {
      src: rel,
      dst: rel,
      sha256: sha256OfFile(abs),
    };
  });

  return { archiveDir, sourceFiles, manifestEntries, collision };
}

/**
 * Writes the archive to plan.archiveDir.
 *
 * - Throws (with partial-dir cleanup) if archiveDir already exists.
 * - Copies each source file to its mirrored destination.
 * - Verifies post-copy SHA256; throws + cleans up on mismatch.
 * - Writes manifest.json, restore.md, transcript.log.
 */
export function writeArchive(
  plan: ArchivePlan,
  repoRoot: string,
  transcript: string[]
): void {
  if (plan.collision) {
    throw new Error(
      `archive_dir already exists and overwrite is refused: ${plan.archiveDir}`
    );
  }

  fs.mkdirSync(plan.archiveDir, { recursive: true });

  try {
    // Copy source files and verify SHA256s.
    for (const entry of plan.manifestEntries) {
      const srcAbs = path.join(repoRoot, entry.src.split("/").join(path.sep));
      const dstAbs = path.join(
        plan.archiveDir,
        entry.dst.split("/").join(path.sep)
      );
      fs.mkdirSync(path.dirname(dstAbs), { recursive: true });
      fs.copyFileSync(srcAbs, dstAbs);

      const actual = sha256OfFile(dstAbs);
      if (actual !== entry.sha256) {
        throw new Error(
          `SHA256 mismatch after copy for ${entry.dst}: expected ${entry.sha256}, got ${actual}`
        );
      }
    }

    // Write manifest.json.
    const manifest = {
      created: plan.manifestEntries.length > 0
        ? new Date().toISOString()
        : new Date().toISOString(),
      source_root: repoRoot,
      files: plan.manifestEntries,
    };
    fs.writeFileSync(
      path.join(plan.archiveDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf8"
    );

    // Derive isoTs from archiveDir basename.
    const isoTs = path.basename(plan.archiveDir);

    // Write restore.md.
    fs.writeFileSync(
      path.join(plan.archiveDir, "restore.md"),
      buildRestoreMd(isoTs, plan.archiveDir),
      "utf8"
    );

    // Write transcript.log.
    fs.writeFileSync(
      path.join(plan.archiveDir, "transcript.log"),
      transcript.join("\n") + "\n",
      "utf8"
    );
  } catch (err) {
    // Partial-archive cleanup: remove the directory we created.
    try {
      fs.rmSync(plan.archiveDir, { recursive: true, force: true });
    } catch {
      // best effort
    }
    throw err;
  }
}

/**
 * Smoke-tests an existing archive by copying its mirrored JSON files to a
 * temp directory and JSON.parsing each one. Returns counts.
 *
 * Throws on any JSON parse failure.
 */
export function restoreSmoke(archiveDir: string): {
  restoredFiles: number;
  parsedFiles: number;
} {
  const manifest: { files: ManifestEntry[] } = JSON.parse(
    fs.readFileSync(path.join(archiveDir, "manifest.json"), "utf8")
  );

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pi-restore-smoke-"));
  let restoredFiles = 0;
  let parsedFiles = 0;

  try {
    for (const entry of manifest.files) {
      const srcAbs = path.join(
        archiveDir,
        entry.dst.split("/").join(path.sep)
      );
      const dstAbs = path.join(tmp, entry.dst.split("/").join(path.sep));
      fs.mkdirSync(path.dirname(dstAbs), { recursive: true });
      fs.copyFileSync(srcAbs, dstAbs);
      restoredFiles += 1;

      // Parse every JSON file.
      JSON.parse(fs.readFileSync(dstAbs, "utf8"));
      parsedFiles += 1;
    }
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }

  return { restoredFiles, parsedFiles };
}

function buildRestoreMd(isoTs: string, archiveDir: string): string {
  return `# Restore mental-model snapshots from archive ${isoTs}

This archive was written by \`pi/scripts/memory-snapshot-archive.ts\`.

## What is here

- \`manifest.json\` -- list of every archived file with SHA256.
- \`transcript.log\` -- the run output.
- Mirrored \`pi/multi-team/expertise/**/*-mental-model*.json\` files under their
  original relative paths.

## How to restore

From the dotfiles repo root:

\`\`\`bash
ARCHIVE_DIR=${archiveDir}
# Verify SHA256s before restoring:
bun pi/scripts/memory-snapshot-archive-verify.ts "$ARCHIVE_DIR"   # T3 only writes the archive; this verify script is optional and may not exist yet.
# Copy mirrored files back:
cp -R "$ARCHIVE_DIR/pi/multi-team/expertise" pi/multi-team/expertise
\`\`\`

(Windows / pwsh equivalent: use \`Copy-Item -Path "$ARCHIVE_DIR/pi/multi-team/expertise" -Destination "pi/multi-team/expertise" -Recurse -Force\`.)

## Retention

Keep this archive for at least 30 days unless explicitly deleted.
`;
}

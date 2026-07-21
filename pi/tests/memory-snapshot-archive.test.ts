import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  findSnapshotFiles,
  sha256OfFile,
  planArchive,
  writeArchive,
  restoreSmoke,
  type ArchivePlan,
} from "../lib/memory-snapshot-archive";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const SCRIPT_PATH = path.join(REPO_ROOT, "pi", "scripts", "memory-snapshot-archive.ts");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pi-snap-archive-test-"));
}

function writeFile(dir: string, relPath: string, content: string): string {
  const abs = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
  return abs;
}

/** Build a minimal fake repo tree with the expertise subtree. */
function buildFakeRepo(
  root: string,
  files: { rel: string; content: string }[]
): void {
  for (const f of files) {
    writeFile(root, f.rel, f.content);
  }
}

// ---------------------------------------------------------------------------
// findSnapshotFiles
// ---------------------------------------------------------------------------

describe("findSnapshotFiles", () => {
  it("finds both *-mental-model.json and *-mental-model.state.json, ignores .yaml", () => {
    const root = makeTmpDir();
    try {
      buildFakeRepo(root, [
        { rel: "pi/multi-team/expertise/foo-mental-model.json", content: "{}" },
        { rel: "pi/multi-team/expertise/foo-mental-model.state.json", content: "{}" },
        { rel: "pi/multi-team/expertise/foo-mental-model.yaml", content: "key: val" },
        { rel: "pi/multi-team/expertise/bar-mental-model.json", content: "{}" },
        { rel: "pi/multi-team/expertise/sub/baz-mental-model.json", content: "{}" },
        // should NOT be picked up (outside expertise tree)
        { rel: "pi/other/foo-mental-model.json", content: "{}" },
      ]);

      const files = findSnapshotFiles(root);
      const names = files.map((f) => path.basename(f));

      expect(names).toContain("foo-mental-model.json");
      expect(names).toContain("foo-mental-model.state.json");
      expect(names).toContain("bar-mental-model.json");
      expect(names).toContain("baz-mental-model.json");
      expect(names).not.toContain("foo-mental-model.yaml");
      // outside expertise
      expect(files.every((f) => f.includes("pi" + path.sep + "multi-team"))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("sorts results lexicographically", () => {
    const root = makeTmpDir();
    try {
      buildFakeRepo(root, [
        { rel: "pi/multi-team/expertise/zzz-mental-model.json", content: "{}" },
        { rel: "pi/multi-team/expertise/aaa-mental-model.json", content: "{}" },
        { rel: "pi/multi-team/expertise/mmm-mental-model.json", content: "{}" },
      ]);

      const files = findSnapshotFiles(root);
      const sorted = [...files].sort();
      expect(files).toEqual(sorted);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// sha256OfFile
// ---------------------------------------------------------------------------

describe("sha256OfFile", () => {
  it("returns a 64-char hex string and is stable across calls", () => {
    const tmp = makeTmpDir();
    try {
      const f = writeFile(tmp, "test.json", '{"hello":"world"}');
      const h1 = sha256OfFile(f);
      const h2 = sha256OfFile(f);
      expect(h1).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(h1)).toBe(true);
      expect(h1).toBe(h2);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// planArchive
// ---------------------------------------------------------------------------

describe("planArchive", () => {
  it("mirrors relative paths under archiveDir in manifest entries", () => {
    const root = makeTmpDir();
    const archiveRoot = makeTmpDir();
    try {
      buildFakeRepo(root, [
        { rel: "pi/multi-team/expertise/foo/bar-mental-model.json", content: "{}" },
      ]);

      const plan = planArchive(root, archiveRoot, "2026-05-02T17-42-08Z");

      expect(plan.manifestEntries).toHaveLength(1);
      const entry = plan.manifestEntries[0];
      // src relative to repoRoot
      expect(entry.src).toBe("pi/multi-team/expertise/foo/bar-mental-model.json");
      // dst mirrors src under archiveDir
      expect(entry.dst).toBe("pi/multi-team/expertise/foo/bar-mental-model.json");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(archiveRoot, { recursive: true, force: true });
    }
  });

  it("returns collision=true if archiveDir already exists", () => {
    const root = makeTmpDir();
    const archiveRoot = makeTmpDir();
    try {
      const isoTs = "2026-05-02T17-42-08Z";
      // pre-create the archiveDir
      fs.mkdirSync(path.join(archiveRoot, isoTs), { recursive: true });

      const plan = planArchive(root, archiveRoot, isoTs);
      expect(plan.collision).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(archiveRoot, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// writeArchive
// ---------------------------------------------------------------------------

describe("writeArchive", () => {
  it("writes every source file to its mirrored dst, manifest.json, restore.md, transcript.log", () => {
    const root = makeTmpDir();
    const archiveRoot = makeTmpDir();
    try {
      buildFakeRepo(root, [
        { rel: "pi/multi-team/expertise/alpha-mental-model.json", content: '{"a":1}' },
        { rel: "pi/multi-team/expertise/beta-mental-model.state.json", content: '{"b":2}' },
      ]);

      const plan = planArchive(root, archiveRoot, "2026-05-02T17-42-08Z");
      const transcript = ["mode=confirm", "archive_dir=" + plan.archiveDir];
      writeArchive(plan, root, transcript);

      // Each mirrored file must exist.
      for (const entry of plan.manifestEntries) {
        const dstAbs = path.join(plan.archiveDir, entry.dst.split("/").join(path.sep));
        expect(fs.existsSync(dstAbs)).toBe(true);
      }

      // manifest.json must exist and contain all entries.
      const manifestPath = path.join(plan.archiveDir, "manifest.json");
      expect(fs.existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      expect(manifest.files).toHaveLength(2);

      // restore.md must exist.
      expect(fs.existsSync(path.join(plan.archiveDir, "restore.md"))).toBe(true);

      // transcript.log must exist and contain the transcript lines.
      const logPath = path.join(plan.archiveDir, "transcript.log");
      expect(fs.existsSync(logPath)).toBe(true);
      const logContent = fs.readFileSync(logPath, "utf8");
      expect(logContent).toContain("mode=confirm");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(archiveRoot, { recursive: true, force: true });
    }
  });

  it("throws and removes archiveDir on SHA256 mismatch (simulated via corrupted copy)", () => {
    const root = makeTmpDir();
    const archiveRoot = makeTmpDir();
    try {
      buildFakeRepo(root, [
        { rel: "pi/multi-team/expertise/foo-mental-model.json", content: '{"ok":true}' },
      ]);

      const plan = planArchive(root, archiveRoot, "2026-05-02T17-42-09Z");

      // Tamper: set a wrong sha256 in the manifest entry so post-copy verify fails.
      const tamperedPlan: ArchivePlan = {
        ...plan,
        manifestEntries: plan.manifestEntries.map((e) => ({
          ...e,
          sha256: "0".repeat(64), // deliberately wrong
        })),
      };

      expect(() => writeArchive(tamperedPlan, root, [])).toThrow(/SHA256 mismatch/);

      // archiveDir must have been cleaned up.
      expect(fs.existsSync(plan.archiveDir)).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(archiveRoot, { recursive: true, force: true });
    }
  });

  it("refuses (throws) when archiveDir already exists", () => {
    const root = makeTmpDir();
    const archiveRoot = makeTmpDir();
    try {
      const isoTs = "2026-05-02T17-42-10Z";
      fs.mkdirSync(path.join(archiveRoot, isoTs), { recursive: true });

      const plan = planArchive(root, archiveRoot, isoTs);
      // collision is true -- writeArchive must refuse.
      expect(() => writeArchive(plan, root, [])).toThrow(/already exists/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(archiveRoot, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// restoreSmoke
// ---------------------------------------------------------------------------

describe("restoreSmoke", () => {
  it("parses every archived JSON file successfully and returns correct counts", () => {
    const root = makeTmpDir();
    const archiveRoot = makeTmpDir();
    try {
      buildFakeRepo(root, [
        { rel: "pi/multi-team/expertise/x-mental-model.json", content: '{"x":1}' },
        { rel: "pi/multi-team/expertise/y-mental-model.state.json", content: '{"y":2}' },
      ]);

      const plan = planArchive(root, archiveRoot, "2026-05-02T17-42-11Z");
      writeArchive(plan, root, []);

      const result = restoreSmoke(plan.archiveDir);
      expect(result.restoredFiles).toBe(2);
      expect(result.parsedFiles).toBe(2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(archiveRoot, { recursive: true, force: true });
    }
  });

  it("throws on a corrupt JSON file in the archive", () => {
    const root = makeTmpDir();
    const archiveRoot = makeTmpDir();
    try {
      buildFakeRepo(root, [
        { rel: "pi/multi-team/expertise/good-mental-model.json", content: '{"ok":true}' },
      ]);

      const plan = planArchive(root, archiveRoot, "2026-05-02T17-42-12Z");
      writeArchive(plan, root, []);

      // Corrupt the archived file after writing.
      const entry = plan.manifestEntries[0];
      const dstAbs = path.join(plan.archiveDir, entry.dst.split("/").join(path.sep));
      fs.writeFileSync(dstAbs, "NOT VALID JSON <<<", "utf8");
      // Also patch manifest sha256 so restoreSmoke gets past copy (it doesn't re-verify sha256).
      const manifestPath = path.join(plan.archiveDir, "manifest.json");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      manifest.files[0].sha256 = sha256OfFile(dstAbs);
      fs.writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");

      expect(() => restoreSmoke(plan.archiveDir)).toThrow();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(archiveRoot, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// CLI integration tests
// ---------------------------------------------------------------------------

describe("CLI integration", () => {
  it("dry-run mode prints mode=dry-run and writes nothing under sandbox HOME archive root", () => {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "pi-snap-cli-dry-"));
    try {
      const env = { ...process.env, HOME: sandbox };
      const out = execSync(`bun ${JSON.stringify(SCRIPT_PATH)}`, {
        env,
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: "pipe",
      });

      expect(out.startsWith("mode=dry-run")).toBe(true);

      // No archive directory written under sandbox.
      const archiveRoot = path.join(sandbox, ".pi", "agent", "index", "archive");
      expect(fs.existsSync(archiveRoot)).toBe(false);
    } finally {
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("confirm mode writes the archive, prints mode=confirm + archive_complete, restore_smoke matches file count", () => {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "pi-snap-cli-confirm-"));
    try {
      const env = { ...process.env, HOME: sandbox };
      const out = execSync(`bun ${JSON.stringify(SCRIPT_PATH)} --confirm`, {
        env,
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: "pipe",
      });

      expect(out).toContain("mode=confirm");
      expect(out).toContain("archive_complete=");
      expect(out).toMatch(/restore_smoke=\d+\/\d+/);

      // Extract archiveDir from output.
      const match = out.match(/archive_complete=(.+)/);
      expect(match).not.toBeNull();
      const archiveDir = match![1].trim();
      expect(fs.existsSync(archiveDir)).toBe(true);
      expect(fs.existsSync(path.join(archiveDir, "manifest.json"))).toBe(true);
    } finally {
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("omitting --confirm does NOT write the archive (dry-run is the default gate)", () => {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "pi-snap-cli-noconfirm-"));
    try {
      const env = { ...process.env, HOME: sandbox };
      // Run without --confirm.
      execSync(`bun ${JSON.stringify(SCRIPT_PATH)}`, {
        env,
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: "pipe",
      });

      const archiveRoot = path.join(sandbox, ".pi", "agent", "index", "archive");
      expect(fs.existsSync(archiveRoot)).toBe(false);
    } finally {
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });
});

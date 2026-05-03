/**
 * Tests for pi/scripts/snapshot-restore-smoke.ts.
 *
 * Covers:
 *   - known-good archive restore + parse + ExpertiseSnapshot shape pass
 *   - corrupt JSON file in the archive -> smoke throws
 *   - non-snapshot-shape mental-model JSON -> smoke throws
 *   - findLatestArchive resolves to the lex-greatest dir under ~/.pi/agent/index/archive
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  findLatestArchive,
  runRestoreSmoke,
} from "../scripts/snapshot-restore-smoke.ts";

interface ManifestEntry {
  src: string;
  dst: string;
  sha256: string;
}

function writeArchive(
  archiveDir: string,
  files: Array<{ relPath: string; content: string }>,
): void {
  fs.mkdirSync(archiveDir, { recursive: true });
  const manifestEntries: ManifestEntry[] = [];
  for (const f of files) {
    const dstAbs = path.join(archiveDir, f.relPath.split("/").join(path.sep));
    fs.mkdirSync(path.dirname(dstAbs), { recursive: true });
    fs.writeFileSync(dstAbs, f.content, "utf8");
    manifestEntries.push({ src: f.relPath, dst: f.relPath, sha256: "0" });
  }
  fs.writeFileSync(
    path.join(archiveDir, "manifest.json"),
    JSON.stringify({ files: manifestEntries }, null, 2),
    "utf8",
  );
}

function makeSnapshotJson(agent: string): string {
  return JSON.stringify({
    schema_version: 1,
    agent,
    rebuilt_at: "2024-01-01T00:00:00.000Z",
    covers_through_timestamp: null,
    source_entry_count: 0,
    categories: {
      strong_decision: [],
      key_file: [],
      pattern: [],
      observation: [],
      open_question: [],
      system_overview: [],
    },
  });
}

function makeStateJson(): string {
  return JSON.stringify({
    schema_version: 1,
    dirty: false,
    rebuild_status: "ready",
  });
}

describe("snapshot-restore-smoke", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-restore-smoke-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("restores a known-good archive and reports parsed == total", () => {
    const archiveDir = path.join(tmpRoot, "2026-05-03T00-00-00Z");
    writeArchive(archiveDir, [
      {
        relPath: "pi/multi-team/expertise/agent-a-mental-model.json",
        content: makeSnapshotJson("agent-a"),
      },
      {
        relPath: "pi/multi-team/expertise/agent-a-mental-model.state.json",
        content: makeStateJson(),
      },
    ]);

    const result = runRestoreSmoke(archiveDir);
    expect(result.total).toBe(2);
    expect(result.parsed).toBe(2);
  });

  it("throws when an archived JSON file is corrupt", () => {
    const archiveDir = path.join(tmpRoot, "2026-05-03T00-00-01Z");
    writeArchive(archiveDir, [
      {
        relPath: "pi/multi-team/expertise/agent-b-mental-model.json",
        content: "{ this is not valid json",
      },
    ]);

    expect(() => runRestoreSmoke(archiveDir)).toThrow();
  });

  it("throws when a mental-model file lacks ExpertiseSnapshot top-level keys", () => {
    const archiveDir = path.join(tmpRoot, "2026-05-03T00-00-02Z");
    writeArchive(archiveDir, [
      {
        relPath: "pi/multi-team/expertise/agent-c-mental-model.json",
        // valid JSON but missing required snapshot keys
        content: JSON.stringify({ unrelated: "shape" }),
      },
    ]);

    expect(() => runRestoreSmoke(archiveDir)).toThrow(/ExpertiseSnapshot shape/);
  });

  it("findLatestArchive picks the lex-greatest directory under the archive root", () => {
    // Redirect HOME so findLatestArchive looks under tmpRoot/.pi/...
    const originalHome = process.env.HOME;
    const originalUserProfile = process.env.USERPROFILE;
    process.env.HOME = tmpRoot;
    process.env.USERPROFILE = tmpRoot;
    try {
      const archiveRoot = path.join(tmpRoot, ".pi", "agent", "index", "archive");
      fs.mkdirSync(path.join(archiveRoot, "2026-01-01T00-00-00Z"), { recursive: true });
      fs.mkdirSync(path.join(archiveRoot, "2026-05-03T04-23-50Z"), { recursive: true });
      fs.mkdirSync(path.join(archiveRoot, "2025-12-31T23-59-59Z"), { recursive: true });

      const latest = findLatestArchive();
      expect(path.basename(latest)).toBe("2026-05-03T04-23-50Z");
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      if (originalUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = originalUserProfile;
    }
  });
});

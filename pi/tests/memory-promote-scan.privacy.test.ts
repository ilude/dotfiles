import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// Adversarial privacy coverage for T2 in pi-memory-followups plan.
//
// The promotion scanner is a local, private artifact. These tests guard
// against four regressions:
//
//   1. The script source has no fs.write* calls targeting a tracked-repo
//      path (anything under pi/, .specs/, or the git working tree).
//   2. The output path is derived from $HOME/.pi/agent/index/ -- never
//      from the repo root.
//   3. Running the script with a sandboxed HOME sends the file there.
//   4. Running the script in a clean git working tree leaves the working
//      tree clean (i.e., the output is not inside any tracked path).

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const SCRIPT_PATH = path.join(REPO_ROOT, "pi", "scripts", "memory-promote-scan.ts");

describe("memory-promote-scan privacy", () => {
  it("script source writes only to paths derived from homeDir()/.pi/agent/index", () => {
    const src = fs.readFileSync(SCRIPT_PATH, "utf8");
    // Find every writeFile / writeFileSync / appendFile call.
    const writeCalls = src.match(/fs\.(writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream)\(([^)]*)\)/g) ?? [];
    expect(writeCalls.length).toBeGreaterThan(0); // sanity: there is at least one write
    for (const call of writeCalls) {
      // The first argument must be the bound `outPath` variable, never a literal repo path.
      expect(call).toMatch(/\(\s*outPath\s*,/);
    }
    // Defensive: outPath must be assembled from `homeDir()` and `.pi/agent/index`.
    expect(src).toMatch(/path\.join\(homeDir\(\)\s*,\s*"\.pi"\s*,\s*"agent"\s*,\s*"index"\)/);
    expect(src).toMatch(/policy-candidates\.md/);
    // No write target may reference the repo root via path.resolve(import.meta.url, "..", ...).
    expect(src).not.toMatch(/writeFile.*REPO_ROOT/);
    expect(src).not.toMatch(/writeFile.*\.specs/);
  });

  it("running with a sandboxed HOME writes only inside that sandbox", () => {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "pi-promote-scan-sandbox-"));
    try {
      // Override HOME only. The script's homeDir() prefers HOME over
      // USERPROFILE; touching USERPROFILE on Windows breaks PATH-shim
      // resolution for `bun` and is not needed for this assertion.
      const env = { ...process.env, HOME: sandbox };
      // Run the script. Status code does not matter for this test; we only
      // assert the side-effect path.
      execSync(`bun ${JSON.stringify(SCRIPT_PATH)}`, { env, cwd: REPO_ROOT, stdio: "pipe" });

      const expected = path.join(sandbox, ".pi", "agent", "index", "policy-candidates.md");
      expect(fs.existsSync(expected)).toBe(true);

      // No scanner output under the repo root was touched; the repo may have its own .pi metadata.
      const inRepoOutput = path.join(REPO_ROOT, ".pi", "agent", "index", "policy-candidates.md");
      expect(fs.existsSync(inRepoOutput)).toBe(false);
    } finally {
      try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  });

  it("output path resolves outside the repo working tree", () => {
    const src = fs.readFileSync(SCRIPT_PATH, "utf8");
    // Confirm the script does not assemble outDir from path.resolve(REPO_ROOT, ...).
    expect(src).not.toMatch(/path\.resolve\([^)]*REPO_ROOT/);
    // Confirm there is no tracked-path string in any write target.
    expect(src).not.toMatch(/writeFile[^)]*pi\/multi-team/);
    expect(src).not.toMatch(/writeFile[^)]*\.specs/);
  });

  it("emits explicit no-qualifying-candidates section when corpus has no qualifying clusters", () => {
    // This is T2 AC #5: scanner on current corpus must always produce
    // either candidates or an explicit no-qualifying section. The unit
    // test for formatCandidates([], ...) already covers the empty path;
    // this is the integration check.
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "pi-promote-scan-empty-"));
    try {
      const env = { ...process.env, HOME: sandbox };
      execSync(`bun ${JSON.stringify(SCRIPT_PATH)}`, { env, cwd: REPO_ROOT, stdio: "pipe" });
      const out = fs.readFileSync(path.join(sandbox, ".pi", "agent", "index", "policy-candidates.md"), "utf8");
      expect(out.startsWith("> LOCAL PRIVATE -- DO NOT COMMIT WITHOUT REVIEW")).toBe(true);
      // Either qualifying candidates appear, or the explicit empty section does.
      const hasCandidates = /## Candidate/.test(out);
      const hasEmpty = /## No qualifying candidates/.test(out);
      expect(hasCandidates || hasEmpty).toBe(true);
    } finally {
      try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  });
});

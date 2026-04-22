/**
 * Fixture-backed tests for deterministic repo ID derivation.
 *
 * These tests are intentionally failing until pi/lib/repo-id.ts is implemented (T3).
 * They encode the required behavior from the normative contract in pi/docs/expertise-layering.md.
 */
import { describe, expect, it } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import {
  type RepoId,
  type RepoIdContext,
  type ParsedRemote,
  deriveRepoId,
  parseRemoteUrl,
  resolveProviderPrefix,
  windowsSafeSlug,
  buildSlugFromParsed,
  localFallbackSlug,
  hashSuffix,
  WINDOWS_RESERVED_NAMES,
  MAX_SLUG_LENGTH,
  KNOWN_PROVIDER_PREFIXES,
} from "../lib/repo-id.js";
import { GIT_REMOTE_FIXTURES, WINDOWS_NORMALIZATION_FIXTURES } from "./helpers/mock-pi.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DUMMY_EXPERTISE_DIR = path.join(os.tmpdir(), "pi-test-expertise-nonexistent");

function makeContext(remotes: Record<string, string>, overrides: Partial<RepoIdContext> = {}): RepoIdContext {
  return {
    isGitRepo: true,
    remotes: new Map(Object.entries(remotes)),
    cwd: path.join(os.tmpdir(), "test-repo"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Preflight: confirm the module resolves before running detailed assertions.
// A clean import failure here is the expected Wave-1 failure mode.
// ---------------------------------------------------------------------------

describe("preflight: repo-id module availability", () => {
  it("exports required functions and constants", () => {
    expect(typeof deriveRepoId).toBe("function");
    expect(typeof parseRemoteUrl).toBe("function");
    expect(typeof resolveProviderPrefix).toBe("function");
    expect(typeof windowsSafeSlug).toBe("function");
    expect(typeof buildSlugFromParsed).toBe("function");
    expect(typeof localFallbackSlug).toBe("function");
    expect(typeof hashSuffix).toBe("function");
    expect(WINDOWS_RESERVED_NAMES).toBeDefined();
    expect(MAX_SLUG_LENGTH).toBe(120);
    expect(KNOWN_PROVIDER_PREFIXES["github.com"]).toBe("gh");
    expect(KNOWN_PROVIDER_PREFIXES["gitlab.com"]).toBe("gl");
  });
});

// ---------------------------------------------------------------------------
// parseRemoteUrl -- HTTPS remotes
// ---------------------------------------------------------------------------

describe("parseRemoteUrl -- HTTPS remotes", () => {
  const cases: Array<{ label: string; remote: string; expectedHost: string; expectedSegments: string[] }> = [
    {
      label: "GitHub HTTPS with .git suffix",
      remote: "https://github.com/owner/repo.git",
      expectedHost: "github.com",
      expectedSegments: ["owner", "repo"],
    },
    {
      label: "GitHub HTTPS without .git suffix",
      remote: "https://github.com/owner/repo",
      expectedHost: "github.com",
      expectedSegments: ["owner", "repo"],
    },
    {
      label: "GitHub HTTPS uppercase host and mixed-case path",
      remote: "https://GITHUB.COM/Owner/Repo.git",
      expectedHost: "github.com",
      expectedSegments: ["owner", "repo"],
    },
    {
      label: "GitLab HTTPS with .git suffix",
      remote: "https://gitlab.com/owner/repo.git",
      expectedHost: "gitlab.com",
      expectedSegments: ["owner", "repo"],
    },
    {
      label: "GitLab HTTPS uppercase host",
      remote: "https://GITLAB.COM/Owner/Repo.git",
      expectedHost: "gitlab.com",
      expectedSegments: ["owner", "repo"],
    },
    {
      label: "GitLab nested group (two levels)",
      remote: "https://gitlab.com/group/subgroup/repo.git",
      expectedHost: "gitlab.com",
      expectedSegments: ["group", "subgroup", "repo"],
    },
    {
      label: "GitLab nested group (three levels)",
      remote: "https://gitlab.com/org/team/project/repo.git",
      expectedHost: "gitlab.com",
      expectedSegments: ["org", "team", "project", "repo"],
    },
    {
      label: "Bitbucket HTTPS with .git suffix",
      remote: "https://bitbucket.org/owner/repo.git",
      expectedHost: "bitbucket.org",
      expectedSegments: ["owner", "repo"],
    },
    {
      label: "Azure DevOps HTTPS strips _git segment",
      remote: "https://dev.azure.com/org/project/_git/repo",
      expectedHost: "dev.azure.com",
      expectedSegments: ["org", "project", "repo"],
    },
    {
      label: "external host with non-standard port",
      remote: "https://example.com:8443/owner/repo.git",
      expectedHost: "example.com",
      expectedSegments: ["owner", "repo"],
    },
  ];

  for (const { label, remote, expectedHost, expectedSegments } of cases) {
    it(label, () => {
      const result: ParsedRemote | null = parseRemoteUrl(remote);
      expect(result, `parseRemoteUrl("${remote}") returned null`).not.toBeNull();
      expect(result!.host).toBe(expectedHost);
      expect(result!.pathSegments).toEqual(expectedSegments);
    });
  }
});

// ---------------------------------------------------------------------------
// parseRemoteUrl -- SSH and SCP-style remotes
// ---------------------------------------------------------------------------

describe("parseRemoteUrl -- SSH and SCP-style remotes", () => {
  const cases: Array<{ label: string; remote: string; expectedHost: string; expectedSegments: string[] }> = [
    {
      label: "GitHub SCP-style with .git suffix",
      remote: "git@github.com:owner/repo.git",
      expectedHost: "github.com",
      expectedSegments: ["owner", "repo"],
    },
    {
      label: "GitHub SCP-style without .git suffix",
      remote: "git@github.com:owner/repo",
      expectedHost: "github.com",
      expectedSegments: ["owner", "repo"],
    },
    {
      label: "GitLab SCP-style with .git suffix",
      remote: "git@gitlab.com:owner/repo.git",
      expectedHost: "gitlab.com",
      expectedSegments: ["owner", "repo"],
    },
    {
      label: "GitLab SCP nested group",
      remote: "git@gitlab.com:group/subgroup/repo.git",
      expectedHost: "gitlab.com",
      expectedSegments: ["group", "subgroup", "repo"],
    },
    {
      label: "GitHub SCP uppercase host",
      remote: "git@GITHUB.COM:Owner/Repo.git",
      expectedHost: "github.com",
      expectedSegments: ["owner", "repo"],
    },
    {
      label: "SSH URL without port",
      remote: "ssh://git@github.com/owner/repo.git",
      expectedHost: "github.com",
      expectedSegments: ["owner", "repo"],
    },
    {
      label: "SSH URL with explicit port number",
      remote: "ssh://git@github.com:22/owner/repo.git",
      expectedHost: "github.com",
      expectedSegments: ["owner", "repo"],
    },
  ];

  for (const { label, remote, expectedHost, expectedSegments } of cases) {
    it(label, () => {
      const result: ParsedRemote | null = parseRemoteUrl(remote);
      expect(result, `parseRemoteUrl("${remote}") returned null`).not.toBeNull();
      expect(result!.host).toBe(expectedHost);
      expect(result!.pathSegments).toEqual(expectedSegments);
    });
  }
});

// ---------------------------------------------------------------------------
// resolveProviderPrefix
// ---------------------------------------------------------------------------

describe("resolveProviderPrefix", () => {
  it("returns gh for github.com", () => {
    expect(resolveProviderPrefix("github.com")).toBe("gh");
  });
  it("returns gl for gitlab.com", () => {
    expect(resolveProviderPrefix("gitlab.com")).toBe("gl");
  });
  it("returns bb for bitbucket.org", () => {
    expect(resolveProviderPrefix("bitbucket.org")).toBe("bb");
  });
  it("returns az for dev.azure.com", () => {
    expect(resolveProviderPrefix("dev.azure.com")).toBe("az");
  });
  it("returns az for a visualstudio.com host", () => {
    expect(resolveProviderPrefix("myorg.visualstudio.com")).toBe("az");
  });
  it("returns ext for unknown hosts", () => {
    expect(resolveProviderPrefix("git.example.com")).toBe("ext");
  });
});

// ---------------------------------------------------------------------------
// deriveRepoId -- remote selection precedence
// ---------------------------------------------------------------------------

describe("deriveRepoId -- remote selection precedence", () => {
  it("uses configured preferred remote when present", () => {
    const ctx = makeContext(
      { upstream: "https://github.com/canonical/repo.git", origin: "https://github.com/fork/repo.git" },
      { preferredRemote: "upstream" },
    );
    const result: RepoId = deriveRepoId(ctx, DUMMY_EXPERTISE_DIR);
    expect(result.slug).toBe("gh/canonical/repo");
    expect(result.source).toBe("preferred-remote");
    expect(result.selectedRemote).toBe("upstream");
  });

  it("falls back to origin when no preferred remote is configured", () => {
    const ctx = makeContext({
      upstream: "https://github.com/canonical/repo.git",
      origin: "https://github.com/fork/repo.git",
    });
    const result: RepoId = deriveRepoId(ctx, DUMMY_EXPERTISE_DIR);
    expect(result.slug).toBe("gh/fork/repo");
    expect(result.source).toBe("origin");
    expect(result.selectedRemote).toBe("origin");
  });

  it("falls back to lexically-first remote when origin is absent", () => {
    const ctx = makeContext({
      upstream: "https://github.com/org/repo.git",
      backup: "https://github.com/backup/repo.git",
    });
    const result: RepoId = deriveRepoId(ctx, DUMMY_EXPERTISE_DIR);
    // "backup" < "upstream" lexically
    expect(result.slug).toBe("gh/backup/repo");
    expect(result.source).toBe("lexical-fallback");
  });

  it("ignores configured preferred remote that does not exist in remotes map", () => {
    const ctx = makeContext(
      { origin: "https://github.com/owner/repo.git" },
      { preferredRemote: "nonexistent" },
    );
    const result: RepoId = deriveRepoId(ctx, DUMMY_EXPERTISE_DIR);
    // Should fall through to origin
    expect(result.slug).toBe("gh/owner/repo");
    expect(result.source).toBe("origin");
  });
});

// ---------------------------------------------------------------------------
// deriveRepoId -- full slug derivation from shared fixture table
// ---------------------------------------------------------------------------

describe("deriveRepoId -- slug derivation from GIT_REMOTE_FIXTURES", () => {
  for (const fixture of GIT_REMOTE_FIXTURES) {
    it(fixture.label, () => {
      const ctx = makeContext(fixture.remotes, { preferredRemote: fixture.preferredRemote });
      const result: RepoId = deriveRepoId(ctx, DUMMY_EXPERTISE_DIR);
      expect(result.slug, `fixture: ${fixture.label}`).toBe(fixture.expectedSlug);
    });
  }
});

// ---------------------------------------------------------------------------
// deriveRepoId -- Windows-safe normalization via shared fixture table
// ---------------------------------------------------------------------------

describe("deriveRepoId -- Windows-safe normalization from WINDOWS_NORMALIZATION_FIXTURES", () => {
  for (const fixture of WINDOWS_NORMALIZATION_FIXTURES) {
    it(fixture.label, () => {
      const ctx = makeContext(fixture.remotes);
      const result: RepoId = deriveRepoId(ctx, DUMMY_EXPERTISE_DIR);
      expect(result.slug, `fixture: ${fixture.label}`).toBe(fixture.expectedSlug);
    });
  }
});

// ---------------------------------------------------------------------------
// deriveRepoId -- additional Windows normalization edge cases
// ---------------------------------------------------------------------------

describe("deriveRepoId -- Windows normalization direct", () => {
  it("produces a slug under MAX_SLUG_LENGTH even for long nested GitLab path", () => {
    const longSegment = "a".repeat(60);
    const ctx = makeContext({ origin: `https://gitlab.com/group/${longSegment}/${longSegment}.git` });
    const result: RepoId = deriveRepoId(ctx, DUMMY_EXPERTISE_DIR);
    expect(result.slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
  });

  it("case-folds the entire slug to lowercase", () => {
    const ctx = makeContext({ origin: "https://GITHUB.COM/MyOrg/MyRepo.git" });
    const result: RepoId = deriveRepoId(ctx, DUMMY_EXPERTISE_DIR);
    expect(result.slug).toBe("gh/myorg/myrepo");
  });
});

// ---------------------------------------------------------------------------
// deriveRepoId -- non-git and no-remote fallback
// ---------------------------------------------------------------------------

describe("deriveRepoId -- fallback scenarios", () => {
  it("returns global slug when not inside a git repo", () => {
    const ctx: RepoIdContext = {
      isGitRepo: false,
      remotes: new Map(),
      cwd: path.join(os.tmpdir(), "not-a-repo"),
    };
    const result: RepoId = deriveRepoId(ctx, DUMMY_EXPERTISE_DIR);
    expect(result.slug).toBe("global");
    expect(result.source).toBe("global-fallback");
    expect(result.hashSuffixApplied).toBe(false);
  });

  it("returns local fallback slug when git repo has no remotes", () => {
    const ctx: RepoIdContext = {
      isGitRepo: true,
      remotes: new Map(),
      cwd: path.join(os.tmpdir(), "my-local-project"),
    };
    const result: RepoId = deriveRepoId(ctx, DUMMY_EXPERTISE_DIR);
    expect(result.slug).toMatch(/^local\//);
    expect(result.source).toBe("local-fallback");
  });
});

// ---------------------------------------------------------------------------
// windowsSafeSlug -- unit tests
// ---------------------------------------------------------------------------

describe("windowsSafeSlug", () => {
  it("lowercases the input", () => {
    expect(windowsSafeSlug("GH/Owner/Repo")).toBe("gh/owner/repo");
  });

  it("appends underscore to each reserved name segment", () => {
    for (const name of ["con", "prn", "aux", "nul", "com1", "lpt1"]) {
      const slug = windowsSafeSlug(`gh/owner/${name}`);
      expect(slug, `${name} should have trailing underscore`).toMatch(new RegExp(`/${name}_$`));
    }
  });

  it("strips trailing dots from each segment", () => {
    expect(windowsSafeSlug("gh/owner/repo.")).toBe("gh/owner/repo");
  });

  it("does not modify a clean slug", () => {
    expect(windowsSafeSlug("gh/owner/repo")).toBe("gh/owner/repo");
  });

  it("truncates slug exceeding MAX_SLUG_LENGTH and appends hash suffix", () => {
    const longSlug = "gl/" + "a".repeat(60) + "/" + "b".repeat(60);
    const result = windowsSafeSlug(longSlug);
    expect(result.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
  });
});

// ---------------------------------------------------------------------------
// localFallbackSlug
// ---------------------------------------------------------------------------

describe("localFallbackSlug", () => {
  it("prefixes result with local/", () => {
    const result = localFallbackSlug(path.join(os.tmpdir(), "my-project"));
    expect(result).toMatch(/^local\//);
  });

  it("uses the basename of the provided path", () => {
    const result = localFallbackSlug(path.join(os.tmpdir(), "my-project"));
    expect(result).toBe("local/my-project");
  });

  it("returns local/unnamed when basename normalizes to empty", () => {
    // A path ending with only dots or reserved chars that normalize away
    const result = localFallbackSlug(path.join(os.tmpdir(), "..."));
    expect(result).toBe("local/unnamed");
  });
});

// ---------------------------------------------------------------------------
// hashSuffix
// ---------------------------------------------------------------------------

describe("hashSuffix", () => {
  it("returns exactly 7 lowercase hex characters", () => {
    const result = hashSuffix("https://github.com/owner/repo.git");
    expect(result).toMatch(/^[0-9a-f]{7}$/);
  });

  it("returns the same value for the same input (deterministic)", () => {
    const a = hashSuffix("https://github.com/owner/repo.git");
    const b = hashSuffix("https://github.com/owner/repo.git");
    expect(a).toBe(b);
  });

  it("returns different values for different inputs", () => {
    const a = hashSuffix("https://github.com/owner/repo.git");
    const b = hashSuffix("https://gitlab.com/owner/repo.git");
    expect(a).not.toBe(b);
  });
});

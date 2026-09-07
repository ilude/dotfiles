import { expect, it } from "vitest";
import { canonicalize, contains, normalizePath, pathMatches, type PathFacts } from "../../lib/damage-control/paths.ts";
import { parsePolicy } from "../../lib/damage-control/policy.ts";
import { readFileSync } from "node:fs";
const policy = parsePolicy(readFileSync(new URL("../../damage-control-rules.yaml", import.meta.url), "utf8"));
const facts: PathFacts = { platform: "posix", home: "/home/operator", cwd: "/work", profile: "/profile", repo: "/work", realpath: async p => p };
it("keeps canonical path and containment checks", async () => {
  expect((await canonicalize("file", facts))).toEqual({ status: "resolved", path: "/work/file", existed: true });
  expect(contains("/work", "/work/file", facts)).toBe(true);
  expect(contains("/work", "/other/file", facts)).toBe(false);
  expect(normalizePath("~/file", facts)).toBe("/home/operator/file");
});
it("restores legacy exclusions and direct path protections", () => {
  expect(pathMatches("/work/serviceAccountKey.json", "read", policy.paths, facts, "e")).toEqual([]);
  expect(pathMatches("/home/operator/.ssh/id_ed25519", "read", policy.paths, facts, "e")[0].action).toBe("block");
  expect(pathMatches("/work/README.md", "delete", policy.paths, facts, "e")[0].action).toBe("block");
  expect(pathMatches("/work/pnpm-lock.yaml", "write", policy.paths, facts, "e")[0].action).toBe("block");
});

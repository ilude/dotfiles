import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { parsePolicy, parseSettings } from "../../lib/damage-control/policy.ts";

const yaml = readFileSync(new URL("../../damage-control-rules.yaml", import.meta.url), "utf8");
const settings = readFileSync(new URL("../../damage-control-settings.json", import.meta.url), "utf8");
function rule(id: string) {
  return parsePolicy(yaml).commands.find(candidate => candidate.id === id);
}

describe("semantic damage-control policy", () => {
  it("uses stable semantic IDs rather than migration-order authority", () => {
    const policy = parsePolicy(yaml);
    expect(policy.commands.length).toBeGreaterThan(300);
    expect(policy.commands.every(candidate => /^[a-z][a-z0-9-]*$/.test(candidate.id))).toBe(true);
    expect(policy.commands.every(candidate => !candidate.id.startsWith("legacy-") && !/\bpolicy-operation\b/.test(candidate.id))).toBe(true);
    expect(policy.commands.some(candidate => candidate.id === "git-remove-working-tree")).toBe(true);
  });

  it("maps operation names to their own regexes and dispositions", () => {
    const policy = parsePolicy(yaml);
    const byId = new Map(policy.commands.map(candidate => [candidate.id, candidate]));
    expect(byId.get("uv-python-uninstall")?.regex).toBe("\\buv\\s+python\\s+uninstall\\b");
    expect(byId.get("npm-unpublish")?.regex).toBe("\\bnpm\\s+unpublish\\b");
    expect(byId.get("taskkill-force")?.regex).toBe("\\btaskkill\\s+/[fF]");
    expect(byId.get("glab-ci-delete")?.regex).toBe("\\bglab\\s+ci\\s+delete\\b");
    expect(byId.get("tofu-command-references-tfvars-file")?.action).toBe("review");
    expect(byId.get("git-stash-clear")?.action).toBe("review");
    expect(byId.get("glab-api-delete")?.action).toBe("review");
    expect(byId.get("secrets-exfiltrate-tfvars")?.action).toBe("review");
    expect(byId.get("gh-repo-delete")?.action).toBe("review");
    expect(byId.get("glab-project-repo-delete")?.action).toBe("review");
    expect(byId.get("npm-unpublish")?.action).toBe("review");
    expect(byId.get("infrastructure-terraform-destroy-unattended")?.action).toBe("review");
    expect(byId.get("tofu-workspace-delete-force")?.action).toBe("review");
    expect(byId.has("uv-cache-clean")).toBe(false);
    expect(byId.has("go-clean-cache")).toBe(false);
    expect(byId.has("poetry-cache-clear")).toBe(false);
    expect(byId.has("shell-history-clear")).toBe(false);
    expect(byId.has("integrity-protected-claude-config")).toBe(false);
    expect(byId.has("integrity-protected-agents-config")).toBe(false);
  });

  it("routes contextual consequences to review and retains hard protections", () => {
    expect(rule("filesystem-rm-recursive-or-force")?.action).toBe("review");
    expect(rule("filesystem-rm-file")?.action).toBe("review");
    expect(rule("git-remove-working-tree")?.action).toBe("review");
    expect(rule("container-compose-teardown")?.action).toBe("review");
    expect(rule("cluster-apply")?.action).toBe("review");
    expect(rule("secrets-exfiltrate-tfvars")?.action).toBe("review");
    expect(rule("filesystem-delete-root")?.action).toBe("block");
    expect(rule("infrastructure-terraform-destroy-unattended")?.action).toBe("review");
  });

  it("keeps path protections consequence-focused", () => {
    const { paths } = parsePolicy(yaml);
    expect(paths.exclusions).toEqual([]);
    expect(paths.zeroAccess).toContain("*serviceAccount*.json");
    expect(paths.zeroAccess).toContain("*private*.pem");
    expect(paths.readOnly).not.toContain("pnpm-lock.yaml");
    expect(paths.noDelete).toEqual([".git/"]);
    expect(paths.writeConfirm).toContain("**/damage-control-trust.yaml");
  });

  it("rejects malformed policy schemas and preserves the strict judge contract", () => {
    const raw = YAML.parse(yaml) as Record<string, unknown>;
    raw.version = 2;
    expect(() => parsePolicy(YAML.stringify(raw))).toThrow();
    expect(parseSettings(settings).judge).toEqual({ enabled: true, provider: "openai-codex", model: "gpt-5.6-luna", reasoning: "high", deadlineMs: 40000, retries: 0 });
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { parsePolicy, parseSettings } from "../../lib/damage-control/policy.ts";

const yaml = readFileSync(new URL("../../damage-control-rules.yaml", import.meta.url), "utf8");
const settings = readFileSync(new URL("../../damage-control-settings.json", import.meta.url), "utf8");
const migration = JSON.parse(readFileSync(new URL("./fixtures/policy-migration.json", import.meta.url), "utf8")) as {
  rows: { ordinal: number; id: string; action: string; original: { action?: string; regex: string } }[];
  removedBroadExclusions: string[];
};

describe("independent policy", () => {
  it("maps every audited rule with explicit authority and preserves all six implicit blocks", () => {
    const policy = parsePolicy(yaml);
    expect(policy.commands).toHaveLength(335);
    expect(migration.rows.map(r => r.ordinal)).toEqual(Array.from({ length: 335 }, (_, i) => i + 1));
    expect(migration.rows.filter(r => !r.original.action)).toHaveLength(6);
    expect(migration.rows.filter(r => r.original.action === "block")).toHaveLength(104);
    expect(migration.rows.filter(r => r.original.action === "ask")).toHaveLength(225);
    for (const row of migration.rows) {
      const rule = policy.commands.find(r => r.id === row.id)!;
      expect(rule).toBeDefined();
      expect(rule.regex).toBe(row.original.regex);
      expect(rule.action).toBe(row.action);
      if (row.original.action !== "ask") expect(rule.action).toBe("block");
    }
  });
  it("restores operator authority for every legacy ask rule", () => {
    const policy = parsePolicy(yaml);
    for (const [id, action] of [["legacy-019", "user"], ["legacy-110", "user"], ["legacy-137", "user"], ["legacy-007", "user"], ["legacy-141", "user"]]) {
      expect(policy.commands.find(r => r.id === id)?.action).toBe(action);
    }
    expect(policy.commands.find(r => r.id === "legacy-139")?.languages).toEqual(["bash"]);
    for (const rule of policy.commands.filter(r => ["legacy-168", "legacy-169", "legacy-172", "legacy-262", "legacy-330"].includes(r.id))) expect(rule.action).toBe("block");
  });
  it("restores legacy path inventories and exclusions", () => {
    const { paths } = parsePolicy(yaml);
    expect(paths.exclusions).toContain("serviceAccountKey.json");
    expect(paths.zeroAccess).toContain("*serviceAccount*.json");
    expect(paths.readOnly).toContain("*.tfstate.backup");
    expect(paths.readOnly).toContain("pnpm-lock.yaml");
    expect(paths.generated).toEqual([]);
    expect(paths.noDelete).toContain("README.md");
    expect(paths.integrity).toEqual([]);
  });
  it.each([
    (p: Record<string, unknown>) => { p.version = 2; },
    (p: Record<string, unknown>) => { p.extra = true; },
    (p: Record<string, unknown>) => { delete p.paths; },
    (p: Record<string, unknown>) => { p.commands = []; },
  ])("rejects malformed root schemas", mutate => {
    const raw = YAML.parse(yaml) as Record<string, unknown>;
    mutate(raw);
    expect(() => parsePolicy(YAML.stringify(raw))).toThrow();
  });
  it.each(["action", "regex", "id", "languages", "extra"])("rejects malformed rule %s", key => {
    const raw = YAML.parse(yaml) as { commands: Record<string, unknown>[] };
    raw.commands[0][key] = { action: "allow", regex: "[", id: "legacy-002", languages: ["pwsh"], extra: true }[key];
    expect(() => parsePolicy(YAML.stringify(raw))).toThrow();
  });
  it("rejects duplicate keys, YAML aliases, unknown tags, and malformed path lists", () => {
    expect(() => parsePolicy(yaml + "\nversion: 1\n")).toThrow();
    expect(() => parsePolicy("version: &v 1\ncommands: *v\npaths: {}\n")).toThrow();
    expect(() => parsePolicy(yaml.replace("version: 1", "version: !custom 1"))).toThrow();
    const raw = YAML.parse(yaml) as { paths: Record<string, unknown> };
    raw.paths.zeroAccess = "*";
    expect(() => parsePolicy(YAML.stringify(raw))).toThrow();
  });
  it("pins Luna high, single attempt, bounded deadline; disabling judge does not alter rules", () => {
    expect(parseSettings(settings).judge).toEqual({ enabled: true, provider: "openai-codex", model: "gpt-5.6-luna", reasoning: "high", deadlineMs: 20000, retries: 0 });
    const raw = JSON.parse(settings);
    raw.judge.enabled = false;
    expect(parseSettings(JSON.stringify(raw)).judge.enabled).toBe(false);
    for (const [key, value] of [["retries", 1], ["provider", "other"], ["model", "other"], ["extra", true]]) {
      expect(() => parseSettings(JSON.stringify({ ...raw, judge: { ...raw.judge, [key as string]: value } }))).toThrow();
    }
  });
});

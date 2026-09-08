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

// Operator-approved departures from the historical migration, not a blanket authority downgrade.
const contextualRules = new Set([
  15, 16, 17, 18, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56,
  60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75,
  ...Array.from({ length: 55 }, (_, i) => i + 79),
  ...Array.from({ length: 7 }, (_, i) => i + 146), 158,
  165, 166, 167, ...Array.from({ length: 8 }, (_, i) => i + 181), 190, 191,
  ...Array.from({ length: 8 }, (_, i) => i + 194), ...Array.from({ length: 13 }, (_, i) => i + 203),
  ...Array.from({ length: 14 }, (_, i) => i + 216), 234, 235, ...Array.from({ length: 6 }, (_, i) => i + 237),
  ...Array.from({ length: 9 }, (_, i) => i + 296), 307, 308, 317, 318, 322, 326, 330, 331, 332, 334,
  43, 44, 141, 153, 154, 155, 156, 157, 159, 160, 161, 162, 163, 164,
  168, 169, 170, 171, 172, 173, 174, 175, 176, 257, 258, 259, 260, 261, 262, 263,
  309, 310, 312, 329,
].map(n => `legacy-${String(n).padStart(3, "0")}`));

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
      // Preserve the migration fixture as historical evidence; this is an approved policy departure.
      expect(rule.action).toBe(contextualRules.has(row.id) ? "review" : row.action);
      if (row.original.action !== "ask" && !contextualRules.has(row.id)) expect(rule.action).toBe("block");
    }
  });
  it("preserves unrelated rules and grants review authority only to the selected families", () => {
    const policy = parsePolicy(yaml);
    for (const [id, action] of [["legacy-019", "user"], ["legacy-110", "review"], ["legacy-137", "user"], ["legacy-007", "user"], ["legacy-141", "review"]]) {
      expect(policy.commands.find(r => r.id === id)?.action).toBe(action);
    }
    expect(policy.commands.find(r => r.id === "legacy-139")?.languages).toEqual(["bash"]);
    expect(new Set(policy.commands.filter(r => r.action === "review").map(r => r.id))).toEqual(contextualRules);
    for (const id of ["legacy-014", "legacy-042", "legacy-180"]) expect(policy.commands.find(r => r.id === id)?.action).toBe("block");
    expect(policy.commands.find(r => r.id === "legacy-330")?.action).toBe("review");
    for (const id of ["legacy-137", "legacy-139", "legacy-140", "legacy-311"]) expect(policy.commands.find(r => r.id === id)?.action).toBe("user");
    for (const id of ["legacy-150", "legacy-151", "legacy-152", "legacy-158", "legacy-165", "legacy-166", "legacy-167"]) expect(policy.commands.find(r => r.id === id)?.action).toBe("review");
  });
  it("restores legacy path inventories and exclusions", () => {
    const { paths } = parsePolicy(yaml);
    expect(paths.exclusions).toEqual([]);
    expect(paths.zeroAccess).toContain("*serviceAccount*.json");
    expect(paths.zeroAccess).toContain("*private*.pem");
    expect(paths.readOnly).toContain("*.tfstate.backup");
    expect(paths.readOnly).not.toContain("pnpm-lock.yaml");
    expect(paths.generated).toEqual([]);
    expect(paths.noDelete).toEqual([".git/"]);
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

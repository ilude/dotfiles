import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseDocument } from "yaml";
import type { CompiledRule, Language, PathPolicy, Policy, RuleAction, Settings } from "./types.ts";

function object(value: unknown, keys: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}: expected object`);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(record, key))) {
    throw new Error(`${label}: unknown or missing fields`);
  }
  return record;
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) throw new Error(`${label}: expected nonempty text`);
  return value;
}
function list(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label}: expected list`);
  const result = value.map(item => text(item, label));
  if (new Set(result).size !== result.length) throw new Error(`${label}: duplicate values`);
  return result;
}
function integer(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new Error(`${label}: invalid integer`);
  return value;
}
const pathKeys = ["zeroAccess", "exclusions", "readOnly", "noDelete", "writeConfirm", "readConfirm", "generated", "scratch", "integrity"] as const;
const languages: Language[] = ["bash", "powershell", "python", "javascript", "typescript"];
const actions: RuleAction[] = ["block", "user", "review"];

export function parsePolicy(source: string): Policy {
  const doc = parseDocument(source, { version: "1.2", uniqueKeys: true, strict: true });
  if (doc.errors.length || doc.warnings.length) throw new Error("Policy YAML is invalid or has unsupported tags");
  const raw = object(doc.toJS({ maxAliasCount: 0 }), ["version", "commands", "paths"], "policy");
  if (raw.version !== 1) throw new Error("Unsupported policy version");
  if (!Array.isArray(raw.commands) || raw.commands.length === 0) throw new Error("Policy commands are required");
  const ids = new Set<string>();
  const commands: CompiledRule[] = raw.commands.map(value => {
    const rule = object(value, ["id", "action", "regex", "reason", "languages"], "command");
    const id = text(rule.id, "id");
    if (!/^[a-z][a-z0-9-]*$/.test(id) || ids.has(id)) throw new Error(`Invalid or duplicate rule ID: ${id}`);
    ids.add(id);
    if (!actions.includes(rule.action as RuleAction)) throw new Error(`Unsupported action for ${id}`);
    const langs = list(rule.languages, "languages");
    if (!langs.length || langs.some(lang => !languages.includes(lang as Language))) throw new Error(`Unsupported language for ${id}`);
    const regex = text(rule.regex, "regex");
    return { id, action: rule.action as RuleAction, regex, reason: text(rule.reason, "reason"), languages: langs as Language[], compiled: new RegExp(regex, "i") };
  });
  const paths = object(raw.paths, [...pathKeys], "paths");
  const validated = Object.fromEntries(pathKeys.map(key => [key, list(paths[key], key)])) as PathPolicy;
  for (const key of ["zeroAccess", "readOnly", "noDelete"] as const) {
    if (!validated[key].length) throw new Error(`Required protection is empty: ${key}`);
  }
  return { version: 1, commands, paths: validated };
}

export function parseSettings(source: string): Settings {
  const raw = object(JSON.parse(source), ["version", "judge", "parseBudgetMs"], "settings");
  if (raw.version !== 1) throw new Error("Unsupported settings version");
  const judge = object(raw.judge, ["enabled", "provider", "model", "reasoning", "deadlineMs", "retries"], "judge");
  if (typeof judge.enabled !== "boolean" || judge.provider !== "openai-codex" || judge.model !== "gpt-5.6-luna" || judge.reasoning !== "high" || judge.retries !== 0) {
    throw new Error("Unsupported judge settings: exact Luna/high, zero retries required");
  }
  return {
    version: 1,
    judge: { enabled: judge.enabled, provider: judge.provider, model: judge.model, reasoning: judge.reasoning, deadlineMs: integer(judge.deadlineMs, 1, 20_000, "deadlineMs"), retries: 0 },
    parseBudgetMs: integer(raw.parseBudgetMs, 1, 50, "parseBudgetMs"),
  };
}

export async function loadPolicy(profile: string): Promise<{ policy: Policy; settings: Settings }> {
  const [policy, settings] = await Promise.all([
    readFile(join(profile, "damage-control-rules.yaml"), "utf8"),
    readFile(join(profile, "damage-control-settings.json"), "utf8"),
  ]);
  return { policy: parsePolicy(policy), settings: parseSettings(settings) };
}

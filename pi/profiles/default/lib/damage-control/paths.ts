import * as fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PathPolicy, RuleMatch } from "./types.ts";
import type { SearchInventory } from "./search.ts";

export type PathFacts = {
  platform: "win32" | "posix";
  home: string;
  cwd: string;
  profile: string;
  repo: string;
  realpath: (target: string) => Promise<string>;
};
export type CanonicalPath = { status: "resolved"; path: string; existed: boolean } | { status: "unknown"; reason: string };
export const nativeRealpath = fs.realpath;
export type TreeFacts = {
  kind: (target: string) => Promise<"directory" | "file" | "link">;
  children: (target: string) => Promise<string[]>;
};
export const nativeTreeFacts: TreeFacts = {
  kind: async target => { const s = await fs.lstat(target); return s.isSymbolicLink() ? "link" : s.isDirectory() ? "directory" : "file"; },
  children: target => fs.readdir(target),
};
export async function trackedWork(targets: string[], cwd: string, signal?: AbortSignal): Promise<SearchInventory> {
  if (!targets.length) return { status: "resolved", paths: [] };
  try {
    const result = await promisify(execFile)("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "ls-files", "-z", "--", ...targets], { cwd, signal, timeout: 1500, maxBuffer: 256 * 1024, windowsHide: true });
    const paths = result.stdout.split("\0").filter(Boolean).map(file => path.resolve(cwd, file));
    return paths.length <= 2000 ? { status: "resolved", paths } : { status: "unknown", reason: "Tracked-work inspection exceeds its 2000-entry bound" };
  } catch { return { status: "unknown", reason: "Tracked-work identity could not be established with bounded read-only Git metadata" }; }
}

const moduleFor = (facts: PathFacts) => facts.platform === "win32" ? path.win32 : path.posix;

export function normalizePath(value: string, facts: PathFacts): string {
  if (!value || value.includes("\0")) throw new Error("Empty or NUL path");
  const p = moduleFor(facts);
  let input = value.replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ");
  input = input.startsWith("@") ? input.slice(1) : input;
  if (input.startsWith("file://")) {
    const url = new URL(input);
    if (/%(?:2f|5c)/i.test(url.pathname)) throw new Error("Encoded path separator requires a transparent path");
    input = decodeURIComponent(url.pathname);
    if (facts.platform === "win32") {
      input = url.hostname ? `//${url.hostname}${input}` : input.replace(/^\/([a-z]:)/i, "$1");
    } else if (url.hostname && url.hostname !== "localhost") throw new Error("Nonlocal file URL");
    if (input.includes("\0")) throw new Error("NUL path");
  }
  if (input === "~") input = facts.home;
  else if (input.startsWith("~/") || (facts.platform === "win32" && input.startsWith("~\\"))) input = p.join(facts.home, input.slice(2));
  if (facts.platform === "win32") {
    if (!input.includes("\\")) input = input.replace(/^\/(?:mnt\/|cygdrive\/)?([a-z])(?=\/|$)/i, "$1:");
    input = input.replace(/^[a-z]:/i, drive => drive.toUpperCase());
    if (/^[a-z]:[^/\\]/i.test(input)) throw new Error("Drive-relative path requires a transparent absolute rewrite");
    if (input.replace(/^[a-z]:/i, "").includes(":")) throw new Error("Alternate streams or provider paths require an explicit supported adapter");
  }
  if (!input) throw new Error("Empty path after @ prefix");
  return p.resolve(facts.cwd, input).replaceAll("\\", facts.platform === "win32" ? "/" : "\\");
}

export async function canonicalize(value: string, facts: PathFacts): Promise<CanonicalPath> {
  let current: string;
  try { current = normalizePath(value, facts); } catch (error) { return { status: "unknown", reason: String(error) }; }
  if (/[?*\[\]]/.test(current)) return { status: "unknown", reason: "Glob target requires expansion before protection checks" };
  const p = moduleFor(facts);
  const suffix: string[] = [];
  for (;;) {
    try {
      const resolved = await facts.realpath(current);
      return { status: "resolved", path: p.join(resolved, ...suffix).replaceAll("\\", facts.platform === "win32" ? "/" : "\\"), existed: suffix.length === 0 };
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") return { status: "unknown", reason: "Canonicalization failed; target identity cannot be established" };
      const parent = p.dirname(current);
      if (parent === current) return { status: "unknown", reason: "No resolvable ancestor" };
      suffix.unshift(p.basename(current));
      current = parent;
    }
  }
}
export const canonicalizeRead = canonicalize;

const comparable = (value: string, facts: PathFacts) => facts.platform === "win32" ? value.replaceAll("\\", "/").toLowerCase() : value;
export function contains(parent: string, child: string, facts: PathFacts): boolean {
  const a = comparable(parent, facts).replace(/\/$/, "");
  const b = comparable(child, facts).replace(/\/$/, "");
  return b === a || b.startsWith(`${a}/`);
}

function expanded(pattern: string, facts: PathFacts): string {
  return pattern.replace("{profile}", facts.profile.replace(/[\\/]+$/, "")).replace("{repo}", facts.repo.replace(/[\\/]+$/, "")).replace(/^~(?=\/|$)/, facts.home.replace(/[\\/]+$/, "")).replaceAll("\\", "/");
}
function globRegex(pattern: string): string {
  return pattern.split("*").map(part => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
}
export function matchesPath(pattern: string, target: string, facts: PathFacts): boolean {
  const value = expanded(pattern, facts);
  const rooted = /^(?:\/|[a-z]:\/)/i.test(value);
  const directory = value.endsWith("/");
  const body = globRegex(value.replace(/\/$/, ""));
  const regex = new RegExp(`${rooted ? "^" : "(?:^|/)"}${body}${directory ? "(?:/|$)" : "$"}`, facts.platform === "win32" ? "i" : "");
  return regex.test(target);
}

export function pathMatches(target: string, operation: "read" | "metadata" | "write" | "delete" | "truncate", policy: PathPolicy, facts: PathFacts, effectId: string): RuleMatch[] {
  if (policy.exclusions.some(pattern => matchesPath(pattern, target, facts))) return [];
  const result: RuleMatch[] = [];
  const add = (key: keyof PathPolicy, action: RuleMatch["action"], reason: string) => {
    policy[key].forEach((pattern, i) => {
      const anchor = expanded(pattern, facts);
      const deletesAncestor = (operation === "delete" || operation === "truncate") && !anchor.includes("*") && /^(?:\/|[a-z]:\/)/i.test(anchor) && contains(target, anchor, facts);
      if (matchesPath(pattern, target, facts) || deletesAncestor) result.push({ ruleId: `path-${key.toLowerCase()}-${i + 1}`, action, applicability: "confirmed", reason, effects: [effectId] });
    });
  };
  if (operation !== "metadata" || !contains(facts.home + "/.ssh", target, facts)) add("zeroAccess", "block", "Protected credential/content path; use non-sensitive evidence instead");
  else if (contains(facts.home + "/.ssh", target, facts)) result.push({ ruleId: "ssh-metadata", action: "user", applicability: "confirmed", reason: "SSH metadata inspection requires approval for this call", effects: [effectId] });
  if (["write", "delete", "truncate"].includes(operation)) {
    add("integrity", "block", "Safety integrity protection: use explicit operator recovery to repair enforcement");
    add("readOnly", "block", "Protected system/configuration data is read-only");
    add("writeConfirm", "user", "Protected configuration change requires approval for this call");
  }
  if (operation === "delete" || operation === "truncate") {
    add("noDelete", "block", "Protected file/directory cannot be deleted or truncated");
    if (contains(target, facts.home, facts) || target === "/" || /^[a-z]:\/?$/i.test(target)) result.push({ ruleId: "protected-floor", action: "block", applicability: "confirmed", reason: "Home/root destruction is prohibited", effects: [effectId] });
  }
  if (operation === "read") add("readConfirm", "user", "Sensitive file content requires approval for this call");
  return result;
}

// Bounded metadata inspection, never opening file contents. Deleting an ancestor
// really deletes its protected children; content searches additionally depend on
// tool ignore/glob semantics, so descendant matches remain candidates until resolved.
export async function inspectPathTree(target: string, operation: "read" | "metadata" | "write" | "delete" | "truncate", policy: PathPolicy, facts: PathFacts, tree: TreeFacts, effectId: string, signal?: AbortSignal): Promise<{ matches: RuleMatch[]; uncertainties: string[] }> {
  const matches = pathMatches(target, operation, policy, facts, effectId);
  const uncertainties: string[] = [];
  if (operation === "write" || operation === "truncate") return { matches, uncertainties };
  const queue = [target];
  const visited = new Set<string>();
  let count = 0;
  while (queue.length) {
    if (signal?.aborted) return { matches, uncertainties: [...uncertainties, "Path inspection cancelled"] };
    if (++count > 2000) return { matches, uncertainties: [...uncertainties, "Path inspection omitted entries beyond its 2000-entry bound"] };
    const current = queue.shift()!;
    if (visited.has(comparable(current, facts))) continue;
    visited.add(comparable(current, facts));
    try {
      const kind = await tree.kind(current);
      if (current !== target) {
        const nested = pathMatches(current, operation, policy, facts, effectId);
        matches.push(...nested.map(match => operation === "read" || operation === "metadata" ? { ...match, applicability: "candidate" as const, reason: `${match.reason}; confirm search glob/ignore scope` } : match));
        const name = moduleFor(facts).basename(current);
        const protectedEnvironment = /^\.env(?:\.(?!(?:example|template|sample|j2)$).+)?$/i.test(name) || /^\w+\.env$/i.test(name);
        if (operation === "read" && protectedEnvironment) matches.push({
          ruleId: "shell-search-environment-descendant", action: "block", applicability: "candidate",
          reason: "Recursive shell content search may read a protected environment file; narrow or exclude the target explicitly", effects: [effectId],
        });
      }
      if (kind === "link") {
        if (operation !== "delete") uncertainties.push(`Search through symbolic link requires scope resolution: ${current}`);
        continue;
      }
      if (kind === "directory") {
        const children = await tree.children(current);
        if (children.length + count + queue.length > 2000) uncertainties.push("Directory enumeration exceeds bounded inspection; scope must be resolved");
        for (const child of children.slice(0, Math.max(0, 2000 - count - queue.length))) queue.push(moduleFor(facts).join(current, child).replaceAll("\\", facts.platform === "win32" ? "/" : "\\"));
      }
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") continue;
      uncertainties.push(`Unable to inspect path metadata: ${current}`);
    }
  }
  return { matches, uncertainties };
}

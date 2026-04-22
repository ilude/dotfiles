/**
 * Repo ID helper -- deterministic compact repo IDs derived from git remote URLs.
 *
 * Normative spec: pi/docs/expertise-layering.md
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Provider prefix map
// ---------------------------------------------------------------------------

export type ProviderPrefix = "gh" | "gl" | "bb" | "az" | "ext" | "local" | "global";

export const KNOWN_PROVIDER_PREFIXES: Readonly<Record<string, ProviderPrefix>> = {
  "github.com": "gh",
  "gitlab.com": "gl",
  "bitbucket.org": "bb",
  "dev.azure.com": "az",
  "visualstudio.com": "az",
} as const;

// ---------------------------------------------------------------------------
// Parsed remote
// ---------------------------------------------------------------------------

export interface ParsedRemote {
  host: string;
  port?: number;
  pathSegments: string[];
  rawUrl: string;
}

// ---------------------------------------------------------------------------
// Repo ID resolution context
// ---------------------------------------------------------------------------

export interface RepoIdContext {
  isGitRepo: boolean;
  remotes: Map<string, string>;
  preferredRemote?: string;
  cwd: string;
}

// ---------------------------------------------------------------------------
// Repo ID result
// ---------------------------------------------------------------------------

export type RepoIdSource =
  | "preferred-remote"
  | "origin"
  | "lexical-fallback"
  | "local-fallback"
  | "global-fallback";

export interface RepoId {
  slug: string;
  source: RepoIdSource;
  selectedRemote?: string;
  selectedRemoteUrl?: string;
  hashSuffixApplied: boolean;
}

// ---------------------------------------------------------------------------
// Windows normalization
// ---------------------------------------------------------------------------

export const WINDOWS_RESERVED_NAMES: ReadonlySet<string> = new Set([
  "con", "prn", "aux", "nul",
  "com0", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
  "lpt0", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
]);

export const MAX_SLUG_LENGTH = 120;

// ---------------------------------------------------------------------------
// URL parsing
// ---------------------------------------------------------------------------

const SCP_REGEX = /^(?:[^@\s]+@)?([^:\s]+):(.+)$/;

function stripDotGit(segment: string): string {
  return segment.replace(/\.git$/i, "");
}

const RESERVED_CANONICAL: ReadonlySet<string> = new Set([
  "CON", "PRN", "AUX", "NUL",
  "COM0", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
  "LPT0", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
]);

function applyReservedSuffixIfOriginalUppercase(originalSegment: string, lowered: string): string {
  // Reserved-name suffix is applied only when the original segment matched a
  // reserved canonical name in its uppercase form. Pure-lowercase originals
  // are passed through unchanged so existing repos like github.com/owner/aux
  // do not collide with the Windows reserved-name guard.
  const upper = originalSegment.toUpperCase();
  if (RESERVED_CANONICAL.has(upper) && originalSegment === upper) return `${lowered}_`;
  return lowered;
}

function cleanPathSegments(rawPath: string, host: string): string[] {
  const rawSegments = rawPath.split("/").filter((s) => s.length > 0);
  if (rawSegments.length === 0) return [];
  rawSegments[rawSegments.length - 1] = stripDotGit(rawSegments[rawSegments.length - 1]);
  const filtered = rawSegments.filter((s) => s.length > 0);
  const azureFiltered = host === "dev.azure.com" ? filtered.filter((s) => s !== "_git") : filtered;
  return azureFiltered.map((seg) => {
    const lowered = seg.toLowerCase();
    return applyReservedSuffixIfOriginalUppercase(seg, lowered);
  });
}

export function parseRemoteUrl(remoteUrl: string): ParsedRemote | null {
  if (!remoteUrl || typeof remoteUrl !== "string") return null;
  const trimmed = remoteUrl.trim();
  if (!trimmed) return null;

  // Reject local file paths and unsupported schemes
  if (/^file:\/\//i.test(trimmed)) return null;

  // HTTPS or SSH with explicit scheme
  const schemeMatch = trimmed.match(/^(https?|ssh):\/\/(.+)$/i);
  if (schemeMatch) {
    let rest = schemeMatch[2];
    // Strip user info
    const atIdx = rest.indexOf("@");
    const slashIdx = rest.indexOf("/");
    if (atIdx >= 0 && (slashIdx < 0 || atIdx < slashIdx)) {
      rest = rest.slice(atIdx + 1);
    }
    const firstSlash = rest.indexOf("/");
    const hostPart = firstSlash >= 0 ? rest.slice(0, firstSlash) : rest;
    const pathPart = firstSlash >= 0 ? rest.slice(firstSlash + 1) : "";
    let host = hostPart;
    let port: number | undefined;
    const colonIdx = hostPart.indexOf(":");
    if (colonIdx >= 0) {
      host = hostPart.slice(0, colonIdx);
      const portStr = hostPart.slice(colonIdx + 1);
      const parsedPort = Number(portStr);
      if (Number.isFinite(parsedPort) && parsedPort > 0) port = parsedPort;
    }
    host = host.toLowerCase();
    if (!host) return null;
    const segments = cleanPathSegments(pathPart, host);
    return { host, port, pathSegments: segments, rawUrl: remoteUrl };
  }

  // SCP-style: [user@]host:path
  const scpMatch = trimmed.match(SCP_REGEX);
  if (scpMatch) {
    const host = scpMatch[1].toLowerCase();
    const pathPart = scpMatch[2];
    if (!host) return null;
    const segments = cleanPathSegments(pathPart, host);
    return { host, pathSegments: segments, rawUrl: remoteUrl };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Provider prefix
// ---------------------------------------------------------------------------

export function resolveProviderPrefix(host: string): ProviderPrefix {
  const normalized = host.toLowerCase();
  if (KNOWN_PROVIDER_PREFIXES[normalized]) return KNOWN_PROVIDER_PREFIXES[normalized];
  if (normalized === "dev.azure.com" || normalized.endsWith(".visualstudio.com")) return "az";
  return "ext";
}

// ---------------------------------------------------------------------------
// Hash suffix
// ---------------------------------------------------------------------------

export function hashSuffix(input: string): string {
  return crypto.createHash("sha1").update(input, "utf-8").digest("hex").slice(0, 7);
}

// ---------------------------------------------------------------------------
// Windows-safe slug normalization
// ---------------------------------------------------------------------------

function normalizeSegmentBasic(segment: string): string {
  if (!segment) return "";
  let s = segment.toLowerCase().replace(/[<>:"\\|?*\x00-\x1f]/g, "-");
  s = s.replace(/[. ]+$/g, "");
  return s;
}

function normalizeSegmentFull(segment: string): string {
  const s = normalizeSegmentBasic(segment);
  if (!s) return "";
  if (WINDOWS_RESERVED_NAMES.has(s)) return `${s}_`;
  return s;
}

function applyLengthCap(raw: string, segments: string[]): string {
  let slug = segments.join("/");
  const byteLen = Buffer.byteLength(slug, "utf-8");
  if (byteLen > MAX_SLUG_LENGTH && segments.length > 0) {
    const suffix = `-${hashSuffix(raw)}`;
    const lastIdx = segments.length - 1;
    const others = segments.slice(0, lastIdx).join("/");
    const prefixLen = others.length + (others.length > 0 ? 1 : 0);
    const budget = MAX_SLUG_LENGTH - prefixLen - suffix.length;
    const lastSeg = segments[lastIdx];
    const truncated = budget > 0 ? lastSeg.slice(0, budget) : "";
    segments[lastIdx] = `${truncated}${suffix}`;
    slug = segments.join("/");
  }
  return slug;
}

export function windowsSafeSlug(raw: string): string {
  if (!raw) return "";
  const segments = raw.split("/").map(normalizeSegmentFull).filter((s) => s.length > 0);
  return applyLengthCap(raw, segments);
}

// ---------------------------------------------------------------------------
// Build slug from parsed remote
// ---------------------------------------------------------------------------

export function buildSlugFromParsed(parsed: ParsedRemote): string {
  const prefix = resolveProviderPrefix(parsed.host);
  const segments: string[] = [prefix];
  if (prefix === "ext") segments.push(parsed.host);
  for (const seg of parsed.pathSegments) segments.push(seg);
  const cleaned = segments.map(normalizeSegmentBasic).filter((s) => s.length > 0);
  const raw = segments.join("/");
  return applyLengthCap(raw, cleaned);
}

// ---------------------------------------------------------------------------
// Local fallback slug
// ---------------------------------------------------------------------------

export function localFallbackSlug(cwd: string): string {
  const base = path.basename(cwd || "");
  const normalized = normalizeSegmentFull(base);
  if (!normalized) return "local/unnamed";
  return `local/${normalized}`;
}

// ---------------------------------------------------------------------------
// Remote selection
// ---------------------------------------------------------------------------

interface SelectedRemote {
  name: string;
  url: string;
  source: RepoIdSource;
}

function selectRemote(context: RepoIdContext): SelectedRemote | null {
  if (context.preferredRemote && context.remotes.has(context.preferredRemote)) {
    return {
      name: context.preferredRemote,
      url: context.remotes.get(context.preferredRemote) as string,
      source: "preferred-remote",
    };
  }
  if (context.remotes.has("origin")) {
    return { name: "origin", url: context.remotes.get("origin") as string, source: "origin" };
  }
  if (context.remotes.size > 0) {
    const sorted = [...context.remotes.keys()].sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase()),
    );
    const name = sorted[0];
    return { name, url: context.remotes.get(name) as string, source: "lexical-fallback" };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Collision detection (reads sibling repo-id.json files)
// ---------------------------------------------------------------------------

function detectCollision(slug: string, rawUrl: string, expertiseBaseDir: string): boolean {
  try {
    const candidateDir = path.join(expertiseBaseDir, ...slug.split("/"));
    const metaPath = path.join(candidateDir, "repo-id.json");
    if (!fs.existsSync(metaPath)) return false;
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as RepoIdMeta;
    return Boolean(meta.remoteUrl) && meta.remoteUrl !== rawUrl;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Derive repo ID
// ---------------------------------------------------------------------------

export function deriveRepoId(context: RepoIdContext, expertiseBaseDir: string): RepoId {
  if (!context.isGitRepo) {
    return { slug: "global", source: "global-fallback", hashSuffixApplied: false };
  }

  const selected = selectRemote(context);
  if (!selected) {
    return {
      slug: localFallbackSlug(context.cwd),
      source: "local-fallback",
      hashSuffixApplied: false,
    };
  }

  const parsed = parseRemoteUrl(selected.url);
  if (!parsed) {
    return {
      slug: localFallbackSlug(context.cwd),
      source: "local-fallback",
      hashSuffixApplied: false,
    };
  }

  let slug = buildSlugFromParsed(parsed);
  let hashSuffixApplied = false;
  if (detectCollision(slug, selected.url, expertiseBaseDir)) {
    slug = `${slug}-${hashSuffix(selected.url)}`;
    hashSuffixApplied = true;
  }

  return {
    slug,
    source: selected.source,
    selectedRemote: selected.name,
    selectedRemoteUrl: selected.url,
    hashSuffixApplied,
  };
}

// ---------------------------------------------------------------------------
// Repo ID metadata
// ---------------------------------------------------------------------------

export interface RepoIdMeta {
  schema_version: 1;
  slug: string;
  remoteUrl?: string;
  created_at: string;
  last_verified_at: string;
}

export type DriftCheckResult =
  | { drifted: false }
  | {
      drifted: true;
      previousSlug: string;
      currentSlug: string;
      dualReadEnabled: boolean;
    };

export function checkRepoDrift(meta: RepoIdMeta | null, current: RepoId): DriftCheckResult {
  if (!meta) return { drifted: false };
  if (meta.slug === current.slug) return { drifted: false };
  return {
    drifted: true,
    previousSlug: meta.slug,
    currentSlug: current.slug,
    dualReadEnabled: true,
  };
}

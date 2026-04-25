import * as fs from "node:fs";

export type ExpertiseCategory =
  | "pattern"
  | "strong_decision"
  | "key_file"
  | "observation"
  | "open_question"
  | "system_overview";

export interface ExpertiseRecord {
  timestamp?: string;
  session_id?: string;
  category?: ExpertiseCategory;
  entry?: Record<string, unknown>;
}

export interface SnapshotItem {
  summary: string;
  evidence_count: number;
  first_seen: string;
  last_seen: string;
  merge_metadata?: SnapshotMergeMetadata;
}

export interface SnapshotMergeMetadata {
  method: "deterministic" | "provider";
  confidence?: number;
  merged_from_count?: number;
}

export interface StrongDecisionItem extends SnapshotItem {
  decision: string;
  why_good?: string;
}

export interface KeyFileItem extends SnapshotItem {
  path: string;
  role?: string;
  notes?: string;
}

export interface SimilarityUsageSummary {
  enabled: boolean;
  active: boolean;
  provider?: string;
  model?: string;
  min_confidence?: number;
  timeout_ms?: number;
  reason:
    | "disabled"
    | "missing_provider"
    | "missing_model"
    | "registry_unavailable"
    | "model_not_found"
    | "auth_unavailable"
    | "ready";
  attempted: number;
  merged: number;
  kept_separate: number;
  failed: number;
  malformed: number;
  skipped_for_low_confidence: number;
  last_error?: string;
}

const SNAPSHOT_SUMMARY_FORMAT_VERSION = 2;

export interface ExpertiseSnapshot {
  schema_version: 1;
  summary_format_version: number;
  agent: string;
  rebuilt_at: string;
  covers_through_timestamp: string | null;
  source_entry_count: number;
  similarity?: SimilarityUsageSummary;
  categories: {
    strong_decision: StrongDecisionItem[];
    key_file: KeyFileItem[];
    pattern: SnapshotItem[];
    observation: SnapshotItem[];
    open_question: SnapshotItem[];
    system_overview: SnapshotItem[];
  };
}

export interface ExpertiseSnapshotState {
  schema_version: 1;
  dirty: boolean;
  rebuild_status: "missing" | "ready" | "failed" | "stale";
  last_attempt_at?: string;
  last_success_at?: string;
  last_error?: string;
}

export type SimilarityEligibleCategory = Extract<ExpertiseCategory, "pattern" | "observation" | "open_question">;

export interface SimilarityDecision {
  decision: "merge" | "keep_separate";
  confidence: number;
  merged_summary?: string;
}

export interface SimilarityCandidate {
  category: SimilarityEligibleCategory;
  left: SnapshotItem;
  right: SnapshotItem;
}

export interface ExpertiseSimilarityConfig {
  enabled: boolean;
  provider?: string;
  model?: string;
  timeoutMs?: number;
  minConfidence?: number;
  usage?: SimilarityUsageSummary;
  decide?: (candidate: SimilarityCandidate) => Promise<SimilarityDecision>;
}

const SIMILARITY_ALLOWED_CATEGORIES = new Set<SimilarityEligibleCategory>([
  "pattern",
  "observation",
  "open_question",
]);

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function summarizeEntry(entry: Record<string, unknown>): string {
  const topic = firstNonEmpty(entry.topic, entry.name);
  const detail = firstNonEmpty(entry.details, entry.discovery, entry.summary, entry.note, entry.notes, entry.description);
  if (topic && detail) return `${topic}: ${detail}`;
  if (topic) return topic;
  if (detail) return detail;

  const priorityKeys = ["decision", "path", "role", "question"];
  const parts = priorityKeys
    .map((key) => firstNonEmpty(entry[key]))
    .filter(Boolean);
  if (parts.length > 0) return parts.join(" -- ");
  const text = JSON.stringify(entry);
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}

function timestampOrFallback(record: ExpertiseRecord, fallback: string): string {
  return typeof record.timestamp === "string" && record.timestamp ? record.timestamp : fallback;
}

function sortByLastSeen<T extends SnapshotItem>(items: T[]): T[] {
  return [...items].sort((a, b) => b.last_seen.localeCompare(a.last_seen) || a.summary.localeCompare(b.summary));
}

function buildStrongDecisions(records: ExpertiseRecord[]): StrongDecisionItem[] {
  const merged = new Map<string, StrongDecisionItem>();
  for (const record of records) {
    const entry = asObject(record.entry);
    const decision = firstNonEmpty(entry.decision, entry.summary, entry.note);
    if (!decision) continue;
    const key = normalizeText(decision);
    const stamp = timestampOrFallback(record, "1970-01-01T00:00:00.000Z");
    const whyGood = firstNonEmpty(entry.why_good);
    const existing = merged.get(key);
    if (existing) {
      existing.evidence_count += 1;
      existing.last_seen = stamp;
      if (whyGood) existing.why_good = whyGood;
      continue;
    }
    merged.set(key, {
      decision,
      why_good: whyGood || undefined,
      summary: decision,
      evidence_count: 1,
      first_seen: stamp,
      last_seen: stamp,
    });
  }
  return sortByLastSeen([...merged.values()]);
}

function buildKeyFiles(records: ExpertiseRecord[]): KeyFileItem[] {
  const merged = new Map<string, KeyFileItem>();
  for (const record of records) {
    const entry = asObject(record.entry);
    const filePath = firstNonEmpty(entry.path);
    if (!filePath) continue;
    const role = firstNonEmpty(entry.role);
    const notes = firstNonEmpty(entry.notes, entry.note, entry.summary);
    const key = normalizeText(filePath);
    const stamp = timestampOrFallback(record, "1970-01-01T00:00:00.000Z");
    const existing = merged.get(key);
    if (existing) {
      existing.evidence_count += 1;
      existing.last_seen = stamp;
      if (role) existing.role = role;
      if (notes) existing.notes = notes;
      existing.summary = [filePath, existing.role, existing.notes].filter(Boolean).join(" -- ");
      continue;
    }
    merged.set(key, {
      path: filePath,
      role: role || undefined,
      notes: notes || undefined,
      summary: [filePath, role, notes].filter(Boolean).join(" -- ") || filePath,
      evidence_count: 1,
      first_seen: stamp,
      last_seen: stamp,
    });
  }
  return sortByLastSeen([...merged.values()]);
}

/**
 * Deterministic compaction is the current and required default for expertise snapshots.
 *
 * Future provider-assisted similarity, if added, must remain provider-gated and disabled by
 * default. The contract for that path is intentionally narrow:
 * - raw JSONL remains the source of truth; no compaction pass may rewrite history
 * - no background orchestration; any model call must happen only inside the synchronous rebuild path
 * - deterministic pre-grouping must happen before any model call so only ambiguous candidates are sent
 * - only observation, pattern, and open_question are eligible unless docs explicitly expand the allowlist
 * - strong_decision and key_file are prohibited from any provider-assisted merge path
 * - provider decisions must carry explicit confidence and meet the configured threshold
 * - low-confidence, timeout, unavailable provider, malformed output, or other failure must fall back to
 *   deterministic compaction without breaking rebuilds
 * - deterministic compaction must remain both the default behavior and the guaranteed fallback behavior
 */
function buildGenericCategory(records: ExpertiseRecord[], category: ExpertiseCategory): SnapshotItem[] {
  const merged = new Map<string, SnapshotItem>();
  for (const record of records) {
    const entry = asObject(record.entry);
    const project = firstNonEmpty(entry.project, entry.repo);
    const baseSummary = summarizeEntry(entry);
    const keyParts = category === "observation" ? [project, normalizeText(baseSummary)] : [normalizeText(baseSummary)];
    const key = keyParts.filter(Boolean).join("::");
    if (!key) continue;
    const summary = project && category === "observation" ? `${project}: ${baseSummary}` : baseSummary;
    const stamp = timestampOrFallback(record, "1970-01-01T00:00:00.000Z");
    const existing = merged.get(key);
    if (existing) {
      existing.evidence_count += 1;
      existing.last_seen = stamp;
      continue;
    }
    merged.set(key, {
      summary,
      evidence_count: 1,
      first_seen: stamp,
      last_seen: stamp,
      merge_metadata: { method: "deterministic", merged_from_count: 1 },
    });
  }
  return sortByLastSeen([...merged.values()]);
}

function splitObservationProject(summary: string): { project: string; text: string } {
  const match = summary.match(/^([^:]+):\s+(.*)$/);
  if (!match) return { project: "", text: summary };
  return { project: match[1].trim(), text: match[2].trim() };
}

function tokenSetFor(summary: string, category: SimilarityEligibleCategory): Set<string> {
  const source = category === "observation" ? splitObservationProject(summary).text : summary;
  return new Set(normalizeText(source).split(" ").filter((token) => token.length > 2));
}

function getOverlapScore(left: SnapshotItem, right: SnapshotItem, category: SimilarityEligibleCategory): number {
  const leftTokens = tokenSetFor(left.summary, category);
  const rightTokens = tokenSetFor(right.summary, category);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  if (category === "observation") {
    const leftProject = splitObservationProject(left.summary).project;
    const rightProject = splitObservationProject(right.summary).project;
    if (leftProject && rightProject && normalizeText(leftProject) !== normalizeText(rightProject)) return 0;
  }

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  if (overlap < 2) return 0;
  return overlap / new Set([...leftTokens, ...rightTokens]).size;
}

function isAmbiguousCandidate(score: number): boolean {
  return score >= 0.35 && score < 0.8;
}

function defaultSimilarityUsage(config?: ExpertiseSimilarityConfig): SimilarityUsageSummary {
  return {
    enabled: config?.enabled ?? false,
    active: Boolean(config?.enabled && config?.decide),
    provider: config?.provider,
    model: config?.model,
    min_confidence: config?.minConfidence,
    timeout_ms: config?.timeoutMs,
    reason: config?.usage?.reason ?? (config?.enabled && config?.decide ? "ready" : "disabled"),
    attempted: 0,
    merged: 0,
    kept_separate: 0,
    failed: 0,
    malformed: 0,
    skipped_for_low_confidence: 0,
    last_error: config?.usage?.last_error,
  };
}

function mergeSnapshotItems(left: SnapshotItem, right: SnapshotItem, mergedSummary: string, confidence: number): SnapshotItem {
  return {
    summary: mergedSummary,
    evidence_count: left.evidence_count + right.evidence_count,
    first_seen: left.first_seen.localeCompare(right.first_seen) <= 0 ? left.first_seen : right.first_seen,
    last_seen: left.last_seen.localeCompare(right.last_seen) >= 0 ? left.last_seen : right.last_seen,
    merge_metadata: {
      method: "provider",
      confidence,
      merged_from_count: (left.merge_metadata?.merged_from_count ?? 1) + (right.merge_metadata?.merged_from_count ?? 1),
    },
  };
}

async function applySimilarityTieBreaker(
  items: SnapshotItem[],
  category: SimilarityEligibleCategory,
  config?: ExpertiseSimilarityConfig,
): Promise<SnapshotItem[]> {
  const usage = config?.usage ?? defaultSimilarityUsage(config);
  if (!config?.enabled || !config.decide || !SIMILARITY_ALLOWED_CATEGORIES.has(category)) {
    return sortByLastSeen(items);
  }

  const minConfidence = Number.isFinite(config.minConfidence) ? Math.max(0, Math.min(1, config.minConfidence ?? 0.75)) : 0.75;
  const working = sortByLastSeen(items);
  const blockedPairs = new Set<string>();

  while (true) {
    let bestPair: { leftIndex: number; rightIndex: number; score: number } | null = null;

    for (let i = 0; i < working.length; i += 1) {
      for (let j = i + 1; j < working.length; j += 1) {
        const pairKey = [normalizeText(working[i].summary), normalizeText(working[j].summary)].sort().join("::");
        if (blockedPairs.has(pairKey)) continue;
        const score = getOverlapScore(working[i], working[j], category);
        if (!isAmbiguousCandidate(score)) continue;
        if (!bestPair || score > bestPair.score) {
          bestPair = { leftIndex: i, rightIndex: j, score };
        }
      }
    }

    if (!bestPair) break;

    const left = working[bestPair.leftIndex];
    const right = working[bestPair.rightIndex];
    const pairKey = [normalizeText(left.summary), normalizeText(right.summary)].sort().join("::");
    usage.attempted += 1;

    let decision: SimilarityDecision;
    try {
      decision = await config.decide({ category, left, right });
    } catch (error) {
      usage.failed += 1;
      usage.last_error = error instanceof Error ? error.message : "similarity decision failed";
      blockedPairs.add(pairKey);
      continue;
    }

    const mergedSummary = typeof decision.merged_summary === "string" ? decision.merged_summary.trim() : "";
    const numericConfidence = Number(decision.confidence);
    const hasValidConfidence = Number.isFinite(numericConfidence);
    const validDecision = decision.decision === "merge" || decision.decision === "keep_separate";
    if (!validDecision || !hasValidConfidence) {
      usage.malformed += 1;
      usage.last_error = "similarity provider returned malformed decision";
      blockedPairs.add(pairKey);
      continue;
    }

    if (decision.decision !== "merge") {
      usage.kept_separate += 1;
      blockedPairs.add(pairKey);
      continue;
    }

    if (numericConfidence < minConfidence) {
      usage.skipped_for_low_confidence += 1;
      blockedPairs.add(pairKey);
      continue;
    }

    if (!mergedSummary) {
      usage.malformed += 1;
      usage.last_error = "similarity provider returned merge decision without merged_summary";
      blockedPairs.add(pairKey);
      continue;
    }

    usage.merged += 1;
    const merged = mergeSnapshotItems(left, right, mergedSummary, numericConfidence);
    working.splice(bestPair.rightIndex, 1);
    working.splice(bestPair.leftIndex, 1, merged);
  }

  return sortByLastSeen(working);
}

export async function buildExpertiseSnapshot(
  agent: string,
  records: ExpertiseRecord[],
  config?: ExpertiseSimilarityConfig,
): Promise<ExpertiseSnapshot> {
  const usableRecords = records.filter((record) => record.category && record.entry);
  const timestamps = usableRecords.map((record) => timestampOrFallback(record, "1970-01-01T00:00:00.000Z"));
  const rebuiltAt = new Date().toISOString();
  const byCategory = (category: ExpertiseCategory) => usableRecords.filter((record) => record.category === category);
  const similarity = defaultSimilarityUsage(config);
  const similarityConfig = config ? { ...config, usage: similarity } : undefined;

  return {
    schema_version: 1,
    summary_format_version: SNAPSHOT_SUMMARY_FORMAT_VERSION,
    agent,
    rebuilt_at: rebuiltAt,
    covers_through_timestamp: timestamps.length > 0 ? timestamps[timestamps.length - 1] : null,
    source_entry_count: usableRecords.length,
    similarity,
    categories: {
      strong_decision: buildStrongDecisions(byCategory("strong_decision")),
      key_file: buildKeyFiles(byCategory("key_file")),
      pattern: await applySimilarityTieBreaker(buildGenericCategory(byCategory("pattern"), "pattern"), "pattern", similarityConfig),
      observation: await applySimilarityTieBreaker(buildGenericCategory(byCategory("observation"), "observation"), "observation", similarityConfig),
      open_question: await applySimilarityTieBreaker(buildGenericCategory(byCategory("open_question"), "open_question"), "open_question", similarityConfig),
      system_overview: buildGenericCategory(byCategory("system_overview"), "system_overview"),
    },
  };
}

export function createDirtyState(status: ExpertiseSnapshotState["rebuild_status"] = "stale", lastError?: string): ExpertiseSnapshotState {
  return {
    schema_version: 1,
    dirty: true,
    rebuild_status: status,
    last_attempt_at: new Date().toISOString(),
    last_error: lastError,
  };
}

export function createReadyState(snapshot: ExpertiseSnapshot): ExpertiseSnapshotState {
  return {
    schema_version: 1,
    dirty: false,
    rebuild_status: "ready",
    last_attempt_at: snapshot.rebuilt_at,
    last_success_at: snapshot.rebuilt_at,
  };
}

export function isSnapshotFresh(
  snapshot: ExpertiseSnapshot | null,
  state: ExpertiseSnapshotState | null,
  records: ExpertiseRecord[],
): boolean {
  if (!snapshot || !state) return false;
  if (state.dirty || state.rebuild_status !== "ready") return false;
  if (snapshot.summary_format_version !== SNAPSHOT_SUMMARY_FORMAT_VERSION) return false;
  if (snapshot.source_entry_count !== records.filter((record) => record.category && record.entry).length) return false;
  const latest = records.length > 0 ? timestampOrFallback(records[records.length - 1], "1970-01-01T00:00:00.000Z") : null;
  return snapshot.covers_through_timestamp === latest;
}

export function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

export type ExpertiseReadMode = "concise" | "full" | "debug";

export const EXPERTISE_CATEGORY_ORDER: Array<[string, keyof ExpertiseSnapshot["categories"]]> = [
  ["Strong decisions", "strong_decision"],
  ["Key files", "key_file"],
  ["Patterns", "pattern"],
  ["Observations", "observation"],
  ["Open questions", "open_question"],
  ["System overview", "system_overview"],
];

const CONCISE_LIMITS: Record<keyof ExpertiseSnapshot["categories"], number> = {
  strong_decision: 5,
  key_file: 5,
  pattern: 8,
  observation: 5,
  open_question: 5,
  system_overview: 3,
};

function isHistoricalOrTaskSpecific(summary: string): boolean {
  const text = summary.toLowerCase();
  return /\b(added|updated|changed|implemented|executing|reviewing|currently|current logs|live migration|was already|now carries|now breaks|now emits)\b/.test(text)
    || /\b(http 400|endpoint details|headers?|get https?:|response-body|this session)\b/.test(text)
    || /\/[a-z][\w-]+\b/i.test(summary)
    || /\b[\w./-]+\.(ts|py|md|yaml|json|ps1)\b/i.test(summary)
    || /\b\.specs\//.test(text);
}

function isDomainSpecificStrongDecision(summary: string): boolean {
  return /\b(playwright|scim|mps|keycloak|e2e|real-backend|compose stack|make targets?)\b/i.test(summary);
}

function getObservationProject(summary: string): string | null {
  const match = summary.match(/^([^:]{2,80}):\s+/);
  return match ? normalizeText(match[1]) : null;
}

export function shouldShowExpertiseItem(
  category: keyof ExpertiseSnapshot["categories"],
  item: SnapshotItem,
  mode: ExpertiseReadMode,
  options: { currentProjects?: string[] } = {},
): boolean {
  if (mode !== "concise") return true;
  if (category === "strong_decision") return !isHistoricalOrTaskSpecific(item.summary) && !isDomainSpecificStrongDecision(item.summary);
  if (category === "system_overview") return true;
  if (category === "key_file") return !/^[a-z]:\//i.test(item.summary);
  if (isHistoricalOrTaskSpecific(item.summary)) return false;
  if (category === "observation") {
    const project = getObservationProject(item.summary);
    const allowedProjects = new Set((options.currentProjects ?? []).map(normalizeText).filter(Boolean));
    if (project && !allowedProjects.has(project)) return false;
    return /\b(prefer|avoid|should|must|rule|strategy|principle|pattern|can safely|bottleneck)\b/i.test(item.summary);
  }
  return true;
}

export function formatExpertiseItem(item: SnapshotItem, mode: ExpertiseReadMode): string {
  if (mode !== "debug") return `- ${item.summary}`;
  const mergeSuffix = item.merge_metadata?.method === "provider"
    ? `; provider merge (${item.merge_metadata.confidence?.toFixed(2) ?? "?"})`
    : "";
  return `- ${item.summary} (evidence: ${item.evidence_count}${mergeSuffix})`;
}

export function formatExpertiseSnapshotText(
  agent: string,
  snapshot: ExpertiseSnapshot,
  options: { warning?: string; mode?: ExpertiseReadMode; currentProjects?: string[] } = {},
): string {
  const mode = options.mode ?? "concise";
  const lines = mode === "debug"
    ? [
      `Expertise for ${agent} (${snapshot.source_entry_count} raw entries, snapshot)`,
      `Rebuilt: ${snapshot.rebuilt_at}`,
      `Covers through: ${snapshot.covers_through_timestamp ?? "n/a"}`,
    ]
    : [`Expertise for ${agent}`];

  if (options.warning) {
    lines.push(`Warning: ${options.warning}`);
  }

  if (mode === "debug" && snapshot.similarity) {
    lines.push(
      `Similarity: ${snapshot.similarity.active ? "active" : "inactive"} (${snapshot.similarity.reason}) -- attempted ${snapshot.similarity.attempted}, merged ${snapshot.similarity.merged}, kept ${snapshot.similarity.kept_separate}, low-confidence ${snapshot.similarity.skipped_for_low_confidence}, malformed ${snapshot.similarity.malformed}, failed ${snapshot.similarity.failed}`,
    );
  }

  for (const [heading, category] of EXPERTISE_CATEGORY_ORDER) {
    const items = snapshot.categories[category]
      .filter((item) => shouldShowExpertiseItem(category, item, mode, { currentProjects: options.currentProjects }))
      .slice(0, mode === "concise" ? CONCISE_LIMITS[category] : 8);
    if (items.length === 0) continue;
    lines.push("", `${heading}:`);
    for (const item of items) {
      lines.push(formatExpertiseItem(item, mode));
    }
  }

  return lines.join("\n");
}

export function formatRawExpertiseFallback(agent: string, records: ExpertiseRecord[], warning?: string): string {
  const lines = [`Expertise for ${agent} (${records.length} entries, raw fallback)`];
  if (warning) lines.push(`Warning: ${warning}`);
  for (const record of records) {
    lines.push(
      `[${timestampOrFallback(record, "?").slice(0, 10)}] ${record.category ?? "unknown"}: ${JSON.stringify(record.entry ?? {})}`,
    );
  }
  return lines.join("\n");
}

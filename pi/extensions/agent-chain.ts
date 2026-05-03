/**
 * Agent Chain Extension
 *
 * Implements the expertise file system -- the core mechanism for knowledge compounding.
 * Agents append discoveries to per-agent JSONL logs (the source of truth) and read
 * them back as a category-grouped raw view. Startup bootstrapping uses procedural
 * memory plus the JSONL-backed retrieval block (see lib/memory-retrieve.ts) -- the
 * legacy mental-model snapshot machinery has been retired.
 *
 * Registers:
 *   - /chain command: sequentially runs planner -> builder -> reviewer agents
 *   - append_expertise tool: agents call this to record discoveries (append-only, thread-safe)
 *   - log_exchange tool: records all agent exchanges to the shared session JSONL
 *   - read_expertise tool: returns category-grouped JSONL records (no snapshot rebuild)
 */

// Convention exception: direct ctx.ui.notify calls in /chain command flow.
// Risk: notification wording could drift from the rest of the extension set
//   if the helper format changes; today uiNotify only adds an extension prefix
//   that would be redundant since the user typed /chain to trigger this flow.
// Why shared helper is inappropriate: the prefix `[agent-chain]` would echo
//   back the slash-command name the user just typed and add visual noise to
//   the chain progress narrative.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Type } from "@mariozechner/pi-ai";
import { type ExtensionAPI, withFileMutationQueue } from "@mariozechner/pi-coding-agent";
import { getAgentDir } from "../lib/extension-utils.js";
import { readMergedSettings } from "../lib/settings-loader.js";
import { createTask, transitionTask } from "../lib/task-registry.js";
import { retrieve, renderRelevantPriorExpertise } from "../lib/memory-retrieve";
import {
	type RepoId,
	type RepoIdMeta,
	checkRepoDrift,
	deriveRepoId,
} from "../lib/repo-id";

/**
 * Operator task registry: record /chain dispatch as durable work. Underlying
 * planner/builder/reviewer subagent invocations track themselves via
 * subagent/index.ts. Defensive try/catch so registry I/O never breaks /chain.
 */
function safeRecordChainDispatch(task: string): void {
	try {
		const preview = task.length > 200 ? `${task.slice(0, 200)}...` : task;
		const record = createTask({
			origin: "team",
			summary: "Dispatched /chain (planner -> builder -> reviewer)",
			agentName: "chain",
			prompt: preview,
			state: "running",
		});
		transitionTask(record.id, "completed");
	} catch {
		// ignore -- registry should never block /chain
	}
}

// Local expertise record shape -- the JSONL log is the source of truth.
// (The legacy lib/expertise-snapshot.ts module that previously exported this
// has been retired together with the snapshot loader/regenerator path.)
type ExpertiseCategory =
	| "pattern"
	| "strong_decision"
	| "key_file"
	| "observation"
	| "open_question"
	| "system_overview";

interface ExpertiseRecord {
	timestamp?: string;
	session_id?: string;
	category?: ExpertiseCategory | string;
	entry?: Record<string, unknown>;
}

type ExpertiseReadMode = "concise" | "full" | "debug";

const EXPERTISE_CATEGORY_ORDER: Array<[string, ExpertiseCategory]> = [
	["Strong decisions", "strong_decision"],
	["Key files", "key_file"],
	["Patterns", "pattern"],
	["Observations", "observation"],
	["Open questions", "open_question"],
	["System overview", "system_overview"],
];

// Resolve the multi-team directory relative to the Pi agent dir (~/.pi/agent)
function getMultiTeamDir(): string {
	return path.join(getAgentDir(), "multi-team");
}

// Append a single JSONL record to a file, using withFileMutationQueue to prevent corruption
async function appendJsonl(filePath: string, record: object): Promise<void> {
	await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
	await withFileMutationQueue(filePath, async () => {
		const line = JSON.stringify(record) + "\n";
		await fs.promises.appendFile(filePath, line, { encoding: "utf-8" });
	});
}

// Read all JSONL records from a file (returns [] if file doesn't exist)
async function readJsonl(filePath: string): Promise<ExpertiseRecord[]> {
	try {
		const content = await fs.promises.readFile(filePath, "utf-8");
		return content
			.split("\n")
			.filter((line) => line.trim())
			.flatMap((line) => {
				try {
					return [JSON.parse(line) as ExpertiseRecord];
				} catch {
					return [];
				}
			});
	} catch {
		return [];
	}
}

function getExpertisePaths(multiTeamDir: string, agent: string) {
	const expertiseDir = path.join(multiTeamDir, "expertise");
	return {
		expertiseDir,
		logPath: path.join(expertiseDir, `${agent}-expertise-log.jsonl`),
	};
}

function getLayerPaths(expertiseDir: string, agent: string, slug: string) {
	const layerDir = path.join(expertiseDir, ...slug.split("/"));
	return {
		expertiseDir: layerDir,
		layerDir,
		logPath: path.join(layerDir, `${agent}-expertise-log.jsonl`),
		metaPath: path.join(layerDir, "repo-id.json"),
	};
}

type RetrievalFallbackReason = "none" | "missing_index" | "stale_index" | "corrupt_index" | "partial_index" | "rebuild_failed" | "provider_disabled" | "no_matches" | "invalid_cache_version";
type RetrievalLayerLabel = "project-local" | "drift" | "global";
type RetrievalLayerEntry = { label: RetrievalLayerLabel; paths: LayerPaths; entries: ExpertiseRecord[] };

interface RetrievalDetails {
	query: string;
	max_results: number;
	strategy: "lexical";
	entry_count_considered: number;
	result_count: number;
	used_index: boolean;
	rebuilt_index: boolean;
	fallback_reason: RetrievalFallbackReason;
}

interface FocusedItem {
	text: string;
	score: number;
	categoryRank: number;
	layerRank: number;
	timestamp: string;
	ordinal: number;
	dedupKey: string;
}

const RETRIEVAL_INDEX_VERSION = 1;
const CATEGORY_RANK: Record<string, number> = {
	strong_decision: 0,
	key_file: 1,
	pattern: 2,
	observation: 3,
	open_question: 4,
	system_overview: 5,
};
const LAYER_RANK: Record<RetrievalLayerLabel, number> = { "project-local": 0, drift: 1, global: 2 };
const STOPWORDS = new Set(["a", "an", "and", "are", "as", "for", "in", "is", "of", "on", "or", "the", "to", "with"]);

function validateReadExpertiseInput(agent: string, query?: string, maxResults?: unknown): void {
	if (typeof agent !== "string" || !agent.trim()) throw new Error("agent must be a non-empty string");
	if (query !== undefined && typeof query === "string" && query.trim().length > 500) throw new Error("query must be 500 characters or fewer");
	if (query !== undefined && typeof query !== "string") throw new Error("query must be a string");
	const hasQuery = typeof query === "string" && query.trim().length > 0;
	if (!hasQuery) return;
	if (maxResults === undefined) return;
	if (!Number.isInteger(maxResults) || (maxResults as number) < 1 || (maxResults as number) > 20) {
		throw new Error("max_results must be an integer from 1 to 20");
	}
}

function normalizeRetrievalText(value: string): string {
	return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

function retrievalTokens(value: string): string[] {
	return normalizeRetrievalText(value).split(" ").filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function collectStringLeaves(value: unknown): string[] {
	if (typeof value === "string" && value.trim()) return [value.trim()];
	if (Array.isArray(value)) return value.flatMap(collectStringLeaves);
	if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).flatMap(collectStringLeaves);
	return [];
}

function firstString(...values: unknown[]): string {
	for (const value of values) if (typeof value === "string" && value.trim()) return value.trim();
	return "";
}

function renderFocusedRecord(record: ExpertiseRecord): string {
	const entry = record.entry ?? {};
	if (record.category === "strong_decision") return firstString(entry.decision, entry.summary, entry.note) || JSON.stringify(entry);
	if (record.category === "key_file") return [firstString(entry.path), firstString(entry.role), firstString(entry.notes, entry.note, entry.summary)].filter(Boolean).join(" -- ");
	return firstString(entry.topic, entry.name, entry.details, entry.discovery, entry.summary, entry.note, entry.notes, entry.description) || JSON.stringify(entry);
}

// Build the per-record summary line used by the category-grouped renderer.
// Mirrors the legacy summary logic for observations: when an entry carries a
// `project` (or `repo`) tag, prefix the summary with `${project}: `.
function renderCategorizedRecord(record: ExpertiseRecord): string {
	const entry = (record.entry ?? {}) as Record<string, unknown>;
	const base = renderFocusedRecord(record);
	if (record.category === "observation") {
		const project = firstString(entry.project, entry.repo);
		if (project) return `${project}: ${base}`;
	}
	return base;
}

function sourceIdentity(layers: RetrievalLayerEntry[]): string {
	return layers.map((layer) => {
		try {
			const stat = fs.statSync(layer.paths.logPath);
			const content = fs.readFileSync(layer.paths.logPath);
			return `${layer.label}:${layer.paths.logPath}:${stat.mtimeMs}:${stat.size}:${crypto.createHash("sha256").update(content).digest("hex")}`;
		} catch {
			return `${layer.label}:${layer.paths.logPath}:missing`;
		}
	}).join("|");
}

function getRetrievalIndexPath(agent: string, layers: RetrievalLayerEntry[]): string {
	const globalLayer = layers.find((layer) => layer.label === "global") ?? layers[0];
	return path.join(globalLayer.paths.expertiseDir, `${agent}-retrieval-index.json`);
}

function classifyIndexState(indexPath: string, expectedSource: string): { usedIndex: boolean; rebuiltIndex: boolean; reason: RetrievalFallbackReason } {
	if (!fs.existsSync(indexPath)) return { usedIndex: false, rebuiltIndex: true, reason: "missing_index" };
	try {
		const parsed = JSON.parse(fs.readFileSync(indexPath, "utf-8")) as Record<string, unknown>;
		if (!Array.isArray(parsed.entries)) return { usedIndex: false, rebuiltIndex: true, reason: "partial_index" };
		if (parsed.index_version !== RETRIEVAL_INDEX_VERSION) return { usedIndex: false, rebuiltIndex: true, reason: "stale_index" };
		if (parsed.source_identity !== expectedSource) return { usedIndex: false, rebuiltIndex: true, reason: "stale_index" };
		return { usedIndex: true, rebuiltIndex: false, reason: "none" };
	} catch {
		return { usedIndex: false, rebuiltIndex: true, reason: "corrupt_index" };
	}
}

async function writeRetrievalIndex(indexPath: string, agent: string, source: string, entryCount: number): Promise<void> {
	await fs.promises.mkdir(path.dirname(indexPath), { recursive: true });
	const tmp = `${indexPath}.${process.pid}.${Date.now()}.tmp`;
	const payload = { index_version: RETRIEVAL_INDEX_VERSION, agent, source_identity: source, built_at: new Date().toISOString(), entry_count: entryCount, entries: [] };
	await fs.promises.writeFile(tmp, JSON.stringify(payload, null, 2), "utf-8");
	await fs.promises.rename(tmp, indexPath);
}

function scoreRecord(query: string, record: ExpertiseRecord): number {
	const entry = record.entry ?? {};
	const weighted = [firstString(entry.topic, entry.decision, entry.path), firstString(entry.summary, entry.details, entry.discovery, entry.note, entry.notes), ...collectStringLeaves(entry)].join(" ");
	const haystack = normalizeRetrievalText(weighted);
	const normalizedQuery = normalizeRetrievalText(query);
	let score = haystack.includes(normalizedQuery) && normalizedQuery ? 100 : 0;
	for (const token of retrievalTokens(query)) {
		if (haystack.includes(token)) score += 5;
	}
	return score;
}

function createEmptyRetrievalDetails(query: string, maxResults: number, fallbackReason: RetrievalFallbackReason): RetrievalDetails {
	return { query, max_results: maxResults, strategy: "lexical", entry_count_considered: 0, result_count: 0, used_index: false, rebuilt_index: false, fallback_reason: fallbackReason };
}

async function retrieveFocusedExpertise(agent: string, query: string, maxResults: number, layers: RetrievalLayerEntry[], ctx: unknown): Promise<{ items: FocusedItem[]; details: RetrievalDetails }> {
	const source = sourceIdentity(layers);
	const indexPath = getRetrievalIndexPath(agent, layers);
	const indexState = classifyIndexState(indexPath, source);
	try {
		if (indexState.rebuiltIndex) await writeRetrievalIndex(indexPath, agent, source, layers.reduce((sum, layer) => sum + layer.entries.length, 0));
	} catch {
		indexState.reason = "rebuild_failed";
	}
	const providerRequested = Boolean((ctx as { retrievalProviderRequested?: unknown } | undefined)?.retrievalProviderRequested);
	let ordinal = 0;
	const candidates: FocusedItem[] = [];
	for (const layer of layers) {
		for (const record of layer.entries) {
			const score = scoreRecord(query, record);
			if (score <= 0) { ordinal += 1; continue; }
			const text = renderFocusedRecord(record);
			const dedupKey = normalizeRetrievalText(text);
			candidates.push({ text, score, categoryRank: CATEGORY_RANK[record.category ?? ""] ?? 99, layerRank: LAYER_RANK[layer.label], timestamp: record.timestamp ?? "", ordinal, dedupKey });
			ordinal += 1;
		}
	}
	const deduped = new Map<string, FocusedItem>();
	for (const item of candidates.sort(compareFocusedItems)) {
		if (!deduped.has(item.dedupKey)) deduped.set(item.dedupKey, item);
	}
	const items = [...deduped.values()].sort(compareFocusedItems).slice(0, maxResults);
	const fallbackReason: RetrievalFallbackReason = providerRequested ? "provider_disabled" : items.length === 0 ? "no_matches" : indexState.reason;
	return {
		items,
		details: { query, max_results: maxResults, strategy: "lexical", entry_count_considered: ordinal, result_count: items.length, used_index: indexState.usedIndex, rebuilt_index: indexState.rebuiltIndex, fallback_reason: fallbackReason },
	};
}

function compareFocusedItems(a: FocusedItem, b: FocusedItem): number {
	return b.score - a.score || a.layerRank - b.layerRank || a.categoryRank - b.categoryRank || b.timestamp.localeCompare(a.timestamp) || a.ordinal - b.ordinal;
}

function appendFocusedRetrievalText(baseline: string, query: string, items: string[]): string {
	const lines = [baseline, "", `Focused retrieval for: ${query}`];
	if (items.length === 0) lines.push("No focused matches found; using baseline expertise only.");
	else for (const item of items) lines.push(`- ${item}`);
	return lines.join("\n");
}

function findGitRoot(startDir: string): string | null {
	let current = path.resolve(startDir);
	const root = path.parse(current).root;
	while (true) {
		if (fs.existsSync(path.join(current, ".git"))) return current;
		if (current === root) return null;
		const parent = path.dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}

function parseGitConfigRemotes(gitRoot: string): Map<string, string> {
	const remotes = new Map<string, string>();
	const configPath = path.join(gitRoot, ".git", "config");
	let content: string;
	try {
		content = fs.readFileSync(configPath, "utf-8");
	} catch {
		return remotes;
	}
	const lines = content.split(/\r?\n/);
	let currentRemote: string | null = null;
	for (const line of lines) {
		const sectionMatch = line.match(/^\s*\[remote\s+"([^"]+)"\]\s*$/);
		if (sectionMatch) {
			currentRemote = sectionMatch[1];
			continue;
		}
		if (/^\s*\[/.test(line)) {
			currentRemote = null;
			continue;
		}
		if (currentRemote) {
			const urlMatch = line.match(/^\s*url\s*=\s*(.+?)\s*$/);
			if (urlMatch) remotes.set(currentRemote, urlMatch[1]);
		}
	}
	return remotes;
}

interface RepoSettings {
	preferredRemote?: string;
	sensitiveRepo: boolean;
}

function readRepoSettings(gitRoot: string): RepoSettings {
	const settings: RepoSettings = { sensitiveRepo: false };
	// Project-level settings only; user/local layers do not inform repo
	// trust posture, so the cascade is restricted here.
	const raw = readMergedSettings({ projectRoot: gitRoot, skipUser: true, skipLocal: true });
	if (typeof raw.preferredRemote === "string") settings.preferredRemote = raw.preferredRemote;
	if (raw.sensitive_repo === true || raw.sensitiveRepo === true) settings.sensitiveRepo = true;
	if (process.env.SENSITIVE_REPO && /^(1|true|yes|on)$/i.test(process.env.SENSITIVE_REPO)) {
		settings.sensitiveRepo = true;
	}
	return settings;
}

interface ResolvedLayer {
	mode: "global" | "project-local";
	repoId?: RepoId;
	gitRoot?: string;
	sensitiveRepo: boolean;
}

function findDriftedLayer(
	expertiseDir: string,
	currentRepoId: RepoId,
	agent: string,
): { paths: ReturnType<typeof getLayerPaths>; previousSlug: string } | null {
	// Walk slug-shaped subdirectories; pick the one whose repo-id.json matches
	// the current remote URL but has a different slug. Conservative: only
	// dual-read when both the remote URL is identical and the slug differs.
	if (!currentRepoId.selectedRemoteUrl) return null;
	const candidates = collectSlugDirs(expertiseDir);
	for (const slug of candidates) {
		if (slug === currentRepoId.slug) continue;
		const layerPaths = getLayerPaths(expertiseDir, agent, slug);
		const meta = readRepoIdMeta(layerPaths.metaPath);
		if (!meta) continue;
		const drift = checkRepoDrift(meta, currentRepoId);
		if (!drift.drifted) continue;
		if (meta.remoteUrl && meta.remoteUrl !== currentRepoId.selectedRemoteUrl) continue;
		return { paths: layerPaths, previousSlug: meta.slug };
	}
	// Fallback: when current layer has no metadata yet (new slug first session),
	// any sibling slug dir with matching remoteUrl indicates drift.
	for (const slug of candidates) {
		if (slug === currentRepoId.slug) continue;
		const layerPaths = getLayerPaths(expertiseDir, agent, slug);
		if (!fs.existsSync(layerPaths.logPath)) continue;
		// In absence of metadata pointers, treat sibling project-local layers as
		// drift candidates if no metadata says otherwise. This keeps L8 dual-read
		// safe even before the metadata file has been written.
		return { paths: layerPaths, previousSlug: slug };
	}
	return null;
}

function readRepoIdMeta(metaPath: string): RepoIdMeta | null {
	try {
		const text = fs.readFileSync(metaPath, "utf-8");
		return JSON.parse(text) as RepoIdMeta;
	} catch {
		return null;
	}
}

function collectSlugDirs(expertiseDir: string): string[] {
	if (!fs.existsSync(expertiseDir)) return [];
	const out: string[] = [];
	const knownPrefixes = ["gh", "gl", "bb", "az", "ext", "local"];
	for (const prefix of knownPrefixes) {
		const prefixDir = path.join(expertiseDir, prefix);
		if (!fs.existsSync(prefixDir)) continue;
		walkSlugLevel(expertiseDir, prefix, out);
	}
	return out;
}

function walkSlugLevel(rootDir: string, currentSlug: string, out: string[]): void {
	const fullDir = path.join(rootDir, ...currentSlug.split("/"));
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(fullDir, { withFileTypes: true });
	} catch {
		return;
	}
	let hasLayerFile = false;
	for (const e of entries) {
		if (e.isFile() && (e.name === "repo-id.json" || e.name.endsWith("-expertise-log.jsonl"))) {
			hasLayerFile = true;
		}
	}
	if (hasLayerFile) {
		out.push(currentSlug);
	}
	for (const e of entries) {
		if (e.isDirectory()) walkSlugLevel(rootDir, `${currentSlug}/${e.name}`, out);
	}
}

function resolveLayer(
	multiTeamDir: string,
	ctx: { cwd?: string; repoId?: string } | undefined,
): ResolvedLayer {
	const expertiseDir = path.join(multiTeamDir, "expertise");
	const cwd = ctx?.cwd;
	if (!cwd || typeof cwd !== "string") {
		return { mode: "global", sensitiveRepo: false };
	}

	// Caller may pass an explicit repoId override (used by some tests / advanced flows)
	if (typeof ctx?.repoId === "string" && ctx.repoId.length > 0) {
		return {
			mode: "project-local",
			repoId: { slug: ctx.repoId, source: "preferred-remote", hashSuffixApplied: false },
			sensitiveRepo: false,
		};
	}

	const gitRoot = findGitRoot(cwd);
	if (!gitRoot) return { mode: "global", sensitiveRepo: false };

	const settings = readRepoSettings(gitRoot);
	const remotes = parseGitConfigRemotes(gitRoot);
	const repoId = deriveRepoId(
		{ isGitRepo: true, remotes, preferredRemote: settings.preferredRemote, cwd: gitRoot },
		expertiseDir,
	);
	if (settings.sensitiveRepo) {
		return { mode: "global", repoId, gitRoot, sensitiveRepo: true };
	}
	return { mode: "project-local", repoId, gitRoot, sensitiveRepo: false };
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
	await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
	const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
	await fs.promises.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
	await fs.promises.rename(tempPath, filePath);
}

interface LayerPaths {
	expertiseDir: string;
	logPath: string;
}

interface LayerView {
	label: RetrievalLayerLabel;
	entries: ExpertiseRecord[];
	entryCount: number;
}

function normalizeForDedupe(line: string): string {
	// Strip a leading "project: " prefix so the same note text recorded under
	// different project tags (e.g. global vs project-local) collapses to one
	// dedupe key per the layered read precedence rule.
	const withoutPrefix = line.replace(/^[^:\n]{1,80}:\s+/, "");
	return withoutPrefix.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Render a category-grouped raw view of expertise records across one or more
// layers. Order: project-local first, then drift, then global. Within each
// layer, categories are emitted in EXPERTISE_CATEGORY_ORDER. Duplicate items
// (by normalizeForDedupe) are dropped so project-local wins over global.
function formatRawExpertiseView(agent: string, views: LayerView[]): string {
	const totalEntries = views.reduce((sum, v) => sum + v.entryCount, 0);
	const lines = [`Expertise for ${agent}`];

	const seen = new Set<string>();
	const sectionLines = new Map<ExpertiseCategory, string[]>();

	for (const view of views) {
		// Bucket records by category.
		const buckets = new Map<ExpertiseCategory, ExpertiseRecord[]>();
		for (const record of view.entries) {
			const cat = (record.category as ExpertiseCategory) ?? "observation";
			if (!buckets.has(cat)) buckets.set(cat, []);
			buckets.get(cat)!.push(record);
		}
		for (const [, category] of EXPERTISE_CATEGORY_ORDER) {
			const recs = buckets.get(category) ?? [];
			for (const record of recs) {
				const summary = renderCategorizedRecord(record);
				if (!summary) continue;
				const key = normalizeForDedupe(summary);
				if (key && seen.has(key)) continue;
				if (key) seen.add(key);
				if (!sectionLines.has(category)) sectionLines.set(category, []);
				sectionLines.get(category)!.push(`- ${summary}`);
			}
		}
	}

	for (const [heading, category] of EXPERTISE_CATEGORY_ORDER) {
		const items = sectionLines.get(category);
		if (!items || items.length === 0) continue;
		lines.push("", `${heading}:`, ...items);
	}

	// totalEntries is intentionally referenced so future debug-mode renders
	// can re-introduce a count line; keep silent for the default view.
	void totalEntries;
	return lines.join("\n");
}

export async function buildRelevantPriorExpertiseBlock(options: { task?: string; agent: string; repoId: string; maxTokens?: number; mode?: "semantic" | "recency" }): Promise<string> {
	const results = await retrieve({
		task: options.task,
		agent: options.agent,
		repoId: options.repoId,
		k: options.mode === "recency" ? 20 : 5,
		maxTokens: options.maxTokens ?? 1500,
		crossRepo: "policies-only",
		mode: options.task?.trim() ? "semantic" : "recency",
	});
	return results.length ? renderRelevantPriorExpertise(results, options.maxTokens ?? 1500) : "";
}

export default function (pi: ExtensionAPI) {
	const multiTeamDir = getMultiTeamDir();
	// Silence unused-import warning when writeJsonAtomic is only used for repo-id metadata.
	void writeJsonAtomic;

	// -- Tool: append_expertise -----------------------------------------------
	// Agents call this to record discoveries. The JSONL log is the append-only
	// source of truth. There is no derived snapshot to keep in sync.
	pi.registerTool({
		name: "append_expertise",
		label: "Append Expertise",
		description:
			"Append a discovery or decision to your expertise log. Use this at the end of a task to record what you learned. " +
			"Entries are appended to {agent}-expertise-log.jsonl -- never overwrites existing knowledge.",
		parameters: Type.Object({
			agent: Type.String({ description: "Agent name (e.g. backend-dev, orchestrator)" }),
			category: Type.String({
				description: "Category: pattern | strong_decision | key_file | observation | open_question | system_overview",
			}),
			entry: Type.Object(
				{},
				{
					additionalProperties: true,
					description: "Structured entry. For strong_decision include why_good. For key_file include role.",
				},
			),
			session_id: Type.Optional(Type.String({ description: "Session ID for traceability" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { agent, category, entry, session_id } = params as {
				agent: string;
				category: string;
				entry: object;
				session_id?: string;
			};

			const globalPaths = getExpertisePaths(multiTeamDir, agent);
			const layer = resolveLayer(multiTeamDir, ctx as { cwd?: string; repoId?: string } | undefined);

			const targetPaths = layer.mode === "project-local" && layer.repoId
				? getLayerPaths(globalPaths.expertiseDir, agent, layer.repoId.slug)
				: globalPaths;

			const record: ExpertiseRecord = {
				timestamp: new Date().toISOString(),
				session_id: session_id ?? "unknown",
				category: category as ExpertiseRecord["category"],
				entry: entry as Record<string, unknown>,
			};

			await appendJsonl(targetPaths.logPath, record);

			// On first project-local write, persist repo-id metadata for drift detection
			if (layer.mode === "project-local" && layer.repoId) {
				const layerPaths = targetPaths as ReturnType<typeof getLayerPaths>;
				if (!fs.existsSync(layerPaths.metaPath)) {
					const meta: RepoIdMeta = {
						schema_version: 1,
						slug: layer.repoId.slug,
						remoteUrl: layer.repoId.selectedRemoteUrl,
						created_at: new Date().toISOString(),
						last_verified_at: new Date().toISOString(),
					};
					await writeJsonAtomic(layerPaths.metaPath, meta);
				}
			}

			return {
				content: [{ type: "text", text: `Appended ${category} entry to ${agent}-expertise-log.jsonl.` }],
				details: {
					agent,
					category,
					logPath: targetPaths.logPath,
					layer: layer.mode,
					repoId: layer.repoId?.slug,
					sensitiveRepo: layer.sensitiveRepo,
				},
			};
		},
	});

	// -- Tool: log_exchange ---------------------------------------------------
	// Records all agent exchanges to the shared session JSONL (H-3 schema).
	pi.registerTool({
		name: "log_exchange",
		label: "Log Exchange",
		description: "Record an agent exchange to the shared session conversation log. " +
			"Schema: {role, agent, content, session_id, timestamp}",
		parameters: Type.Object({
			session_id: Type.String({ description: "Session ID (directory name under sessions/)" }),
			role: Type.String({ description: "Role: user | orchestrator | planning-lead | engineering-lead | validation-lead | worker" }),
			agent: Type.Union([Type.String(), Type.Null()], { description: "Agent name, or null for user messages" }),
			content: Type.String({ description: "Message content" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const { session_id, role, agent, content } = params as {
				session_id: string;
				role: string;
				agent: string | null;
				content: string;
			};

			const sessionDir = path.join(multiTeamDir, "sessions", session_id);
			const logPath = path.join(sessionDir, "conversation.jsonl");

			const record = {
				role,
				agent,
				content,
				session_id,
				timestamp: new Date().toISOString(),
			};

			await appendJsonl(logPath, record);

			return {
				content: [{ type: "text", text: `Logged ${role} exchange to session ${session_id}` }],
				details: { session_id, role, agent, logPath },
			};
		},
	});

	// -- Tool: read_expertise -------------------------------------------------
	// Returns the agent's expertise as a category-grouped raw view of the
	// JSONL log. Layered storage (project-local + drift + global) is preserved;
	// the snapshot loader/regenerator that previously sat behind this call has
	// been retired.
	pi.registerTool({
		name: "read_expertise",
		label: "Read Expertise",
		description:
			"Read your expertise from the JSONL log, grouped by category. The raw JSONL log is the source of truth.",
		parameters: Type.Object({
			agent: Type.String({ description: "Agent name (e.g. backend-dev, orchestrator)" }),
			mode: Type.Optional(Type.String({ description: "Output mode: concise (default) | full | debug" })),
			query: Type.Optional(Type.String({ description: "Optional topic/query for focused local expertise retrieval" })),
			max_results: Type.Optional(Type.Number({ description: "Maximum focused retrieval results when query is present (1-20, default 5)" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { agent, mode: rawMode, query: rawQuery, max_results: rawMaxResults } = params as { agent: string; mode?: string; query?: string; max_results?: unknown };
			validateReadExpertiseInput(agent, rawQuery, rawMaxResults);
			const mode: ExpertiseReadMode = rawMode === "full" || rawMode === "debug" ? rawMode : "concise";
			const query = typeof rawQuery === "string" && rawQuery.trim() ? rawQuery.trim() : undefined;
			const maxResults = query ? (rawMaxResults === undefined ? 5 : rawMaxResults as number) : undefined;

			const globalPaths = getExpertisePaths(multiTeamDir, agent);
			const layer = resolveLayer(multiTeamDir, ctx as { cwd?: string; repoId?: string } | undefined);

			const layerEntries: Array<{ label: LayerView["label"]; paths: LayerPaths; entries: ExpertiseRecord[] }> = [];

			let driftDetected = false;
			let driftPrevious: string | undefined;

			if (layer.mode === "project-local" && layer.repoId) {
				const projectPaths = getLayerPaths(globalPaths.expertiseDir, agent, layer.repoId.slug);
				const projectEntries = await readJsonl(projectPaths.logPath);
				if (projectEntries.length > 0 || fs.existsSync(projectPaths.layerDir)) {
					layerEntries.push({ label: "project-local", paths: projectPaths, entries: projectEntries });
				}

				// Drift detection: scan sibling slug dirs for repo-id.json with different slug
				const driftPath = findDriftedLayer(globalPaths.expertiseDir, layer.repoId, agent);
				if (driftPath) {
					const driftEntries = await readJsonl(driftPath.paths.logPath);
					if (driftEntries.length > 0) {
						layerEntries.push({ label: "drift", paths: driftPath.paths, entries: driftEntries });
						driftDetected = true;
						driftPrevious = driftPath.previousSlug;
					}
				}
			}

			const globalEntries = await readJsonl(globalPaths.logPath);
			if (globalEntries.length > 0) {
				layerEntries.push({ label: "global", paths: globalPaths, entries: globalEntries });
			}

			const totalEntries = layerEntries.reduce((sum, l) => sum + l.entries.length, 0);
			if (totalEntries === 0) {
				const details: Record<string, unknown> = { agent, mode, entryCount: 0, layerSources: [] };
				let text = `No expertise recorded yet for ${agent}. This is your first session.`;
				if (query && maxResults !== undefined) {
					const retrieval = createEmptyRetrievalDetails(query, maxResults, "no_matches");
					details.retrieval = retrieval;
					text = appendFocusedRetrievalText(text, query, []);
				}
				return {
					content: [{ type: "text", text }],
					details,
				};
			}

			const views: LayerView[] = layerEntries.map((le) => ({
				label: le.label,
				entries: le.entries,
				entryCount: le.entries.length,
			}));

			const mergedText = formatRawExpertiseView(agent, views);

			const layerSources = views.map((v) => v.label);

			const details: Record<string, unknown> = {
				agent,
				mode,
				entryCount: totalEntries,
				layerSources,
				driftDetected,
			};
			if (driftPrevious) details.driftPreviousSlug = driftPrevious;
			if (layer.repoId) details.repoId = layer.repoId.slug;

			let outputText = mergedText;
			if (query && maxResults !== undefined) {
				const focused = await retrieveFocusedExpertise(agent, query, maxResults, layerEntries, ctx);
				details.retrieval = focused.details;
				outputText = appendFocusedRetrievalText(mergedText, query, focused.items.map((item) => item.text));
			}

			return {
				content: [{ type: "text", text: outputText }],
				details,
			};
		},
	});

	// -- Command: /chain ------------------------------------------------------
	// Runs a plan-build-review sequence: planner -> builder -> reviewer (sequential).
	// Each agent gets the previous agent's output as input context.
	pi.registerCommand("chain", {
		description: "Run plan-build-review sequence: planner -> builder -> reviewer",
		handler: async (args, ctx) => {
			if (!args.trim()) {
				ctx.ui.notify("Usage: /chain <task description>", "warning");
				return;
			}

			const agentsDir = path.join(multiTeamDir, "agents");
			const agentFiles: Record<string, string> = {
				planner: path.join(agentsDir, "planner.md"),
				builder: path.join(agentsDir, "builder.md"),
				reviewer: path.join(agentsDir, "reviewer.md"),
			};

			// Verify agent persona files exist
			const missing = Object.entries(agentFiles)
				.filter(([, p]) => !fs.existsSync(p))
				.map(([name]) => name);

			if (missing.length > 0) {
				ctx.ui.notify(
					`Missing agent persona files: ${missing.join(", ")}. Create them in ${agentsDir}`,
					"warning",
				);
				return;
			}

			const repo = resolveLayer(multiTeamDir, ctx as { cwd?: string; repoId?: string } | undefined).repoId?.slug ?? "global";
			const memoryBlock = await buildRelevantPriorExpertiseBlock({ task: args.trim(), agent: "orchestrator", repoId: repo });
			const message = [
				`Run the plan-build-review chain for this task: ${args.trim()}`,
				"",
				memoryBlock,
				memoryBlock ? "" : undefined,
				"Use the subagent tool to execute each stage sequentially, passing the previous output as input to the next:",
				`1. Planner: ${agentFiles.planner}`,
				`2. Builder: ${agentFiles.builder} (receives planner output)`,
				`3. Reviewer: ${agentFiles.reviewer} (receives builder output)`,
				"",
				"Do not proceed to the next stage until the current one completes.",
			].filter((line): line is string => typeof line === "string").join("\n");

			safeRecordChainDispatch(args.trim());
			await pi.sendUserMessage(message);
		},
	});

	// `os` is imported by historical convention (some helpers call os.homedir
	// indirectly through getAgentDir). Reference it once so unused-import lint
	// stays quiet without changing the dependency surface.
	void os;
}

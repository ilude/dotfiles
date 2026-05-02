import { GLOBAL_LAYER_REPO_ID, embedText, loadMemoryIndex, type MemoryRow } from "./memory-index";

export interface RetrieveArgs { task?: string; agent?: string; repoId: string; k?: number; maxTokens?: number; crossRepo?: "off" | "policies-only"; mode?: "semantic" | "recency"; }
export interface RetrieveResult { id: string; text: string; ts: string; repo_id: string; agent: string; kind: string; similarity: number; lexicalScore: number; }

const STOP = new Set(["a", "an", "and", "are", "as", "for", "in", "is", "of", "on", "or", "the", "to", "with"]);
export function estimateTokens(s: string): number { return Math.ceil(s.length / 4); }
function toks(s: string): Set<string> { return new Set((s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(t => t.length > 1 && !STOP.has(t))); }
function lexical(q: string, text: string): number { const a = toks(q), b = toks(text); if (!a.size || !b.size) return 0; let hit = 0; for (const t of a) if (b.has(t)) hit++; return hit / Math.sqrt(a.size * b.size); }
function cosine(a: Float32Array, b: Float32Array): number { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
function isVisible(row: MemoryRow, args: RetrieveArgs): boolean {
  if (args.agent && row.agent !== args.agent) return false;
  if (row.repo_id === args.repoId) return true;
  return args.crossRepo === "policies-only" && row.repo_id === GLOBAL_LAYER_REPO_ID && row.kind === "policy";
}
function chainTail(rows: MemoryRow[]): MemoryRow[] {
  const by = new Map(rows.map(r => [r.id, r]));
  const superseded = new Set<string>();
  for (const r of rows) if (r.superseded_by && by.has(r.superseded_by)) superseded.add(r.id);
  return rows.filter(r => !superseded.has(r.id));
}
export function renderRelevantPriorExpertise(results: RetrieveResult[], maxTokens = 1500): string {
  const lines = ["Relevant prior expertise (retrieved from JSONL memory index):"];
  for (const r of results) lines.push(`- [${r.id}] (${r.agent}, ${r.repo_id}, ${r.ts}) ${r.text}`);
  let out = lines.join("\n");
  while (estimateTokens(out) > maxTokens && lines.length > 1) { lines.pop(); out = lines.join("\n"); }
  return out;
}

export async function retrieve(args: RetrieveArgs): Promise<RetrieveResult[]> {
  const k = args.k ?? 5; const maxTokens = args.maxTokens ?? 1500;
  const index = await loadMemoryIndex();
  const scoped = chainTail(index.rows.filter(r => isVisible(r, args)));
  const query = args.task?.trim() ?? "";
  const qv = query ? embedText(query) : undefined;
  const scored = scoped.map(row => ({ row, similarity: qv ? cosine(qv, row.embedding) : 0, lexicalScore: query ? lexical(query, row.text) : 0 }))
    .sort((a, b) => args.mode === "recency" || !query ? String(b.row.ts).localeCompare(String(a.row.ts)) : (b.similarity + b.lexicalScore) - (a.similarity + a.lexicalScore) || String(b.row.ts).localeCompare(String(a.row.ts)));
  const out: RetrieveResult[] = [];
  for (const s of scored) {
    if (out.length >= k) break;
    const next = { id: s.row.id, text: s.row.text, ts: s.row.ts, repo_id: s.row.repo_id, agent: s.row.agent, kind: s.row.kind, similarity: s.similarity, lexicalScore: s.lexicalScore };
    const rendered = renderRelevantPriorExpertise([...out, next], maxTokens);
    if (estimateTokens(rendered) > maxTokens) break;
    out.push(next);
  }
  return out;
}

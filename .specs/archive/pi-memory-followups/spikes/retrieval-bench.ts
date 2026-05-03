#!/usr/bin/env bun
/**
 * Retrieval latency benchmark for pi in-memory expertise index.
 * Measurement artifact -- not production code; lives under .specs/ only.
 *
 * Usage: bun .specs/pi-memory-followups/spikes/retrieval-bench.ts
 * Run from worktree root: C:/Users/mglenn/.dotfiles-worktrees/pi-memory-followups
 */

import { retrieve } from "../../../pi/lib/memory-retrieve";

const REPO_ID = "gh/ilude/dotfiles";

// 25 representative queries synthesized from actual JSONL entry text
const QUERIES: string[] = [
  "pi agent caching research PI_CACHE_RETENTION extended prompt cache",
  "pi model list updates user-level models.json custom providers",
  "pi custom slash command subscription model refresh ctx.modelRegistry",
  "refresh-models endpoint OpenAI Codex GET baseUrl codex models semver",
  "github-copilot models refresh 400 missing Editor-Version header",
  "anthropic subscription model discovery GET api.anthropic.com v1 models",
  "refresh-models diff output addedIds removedIds provider refresh",
  "copilot model filtering refresh picker-enabled entries internal router IDs",
  "copilot model list non-usable entries embeddings text-embedding router",
  "codex hidden model filtering visibility hide supported_in_api false",
  "provider credential management command authStorage set remove auth.json",
  "startup model pruning noisy providers github-copilot opencode",
  "provider-scoped model blocklists prefix exact-ID openrouter catalogs",
  "pi context reporting extension ctx.getContextUsage total context usage",
  "read_expertise layered output compaction multi-layer merged snapshot",
  "expertise read defaults durable working memory not changelog history",
  "pi auto-discovers top-level ts files extensions directory factory function",
  "prompt router openai-codex gpt-5.5 effort bias medium demoted low",
  "Pi GPT-5.5 startup thinking level session_start probe non-mutating",
  "pi setup refactor test failure extension-utils transcript tool-reduction HOME",
  "refresh-models api-key providers openrouter opencode generic models endpoint",
  "pi-cli-markdown-code-fences TUI Markdown renderer fenced code blocks",
  "windows pi self-update pnpm stale installation upgrade pi update --force",
  "Pi model re-registration thinkingLevelMap legacy compat reasoningEffortMap",
  "read_expertise focused retrieval lexical bounded deterministic ranking dedup",
];

const K = 5;
const MAX_TOKENS = 1500;
const WARM_RUNS = 5;
const DISCARD_FIRST = 1;

async function runOnce(queries: string[]): Promise<number[]> {
  const durations: number[] = [];
  for (const q of queries) {
    const t0 = performance.now();
    await retrieve({ task: q, repoId: REPO_ID, k: K, maxTokens: MAX_TOKENS });
    durations.push(performance.now() - t0);
  }
  return durations;
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

async function main() {
  console.log(`Warming index (run 0 of ${WARM_RUNS}, discarded)...`);
  await runOnce(QUERIES); // cold run -- discarded

  const allDurations: number[] = [];
  for (let run = 1; run <= WARM_RUNS - DISCARD_FIRST; run++) {
    process.stdout.write(`Run ${run}/${WARM_RUNS - DISCARD_FIRST}... `);
    const d = await runOnce(QUERIES);
    allDurations.push(...d);
    const runP50 = percentile([...d].sort((a, b) => a - b), 50);
    console.log(`p50=${runP50.toFixed(2)} ms (${d.length} queries)`);
  }

  const sorted = [...allDurations].sort((a, b) => a - b);
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const p99 = percentile(sorted, 99);

  console.log("");
  console.log("=== Retrieval Latency Results ===");
  console.log(`Samples : ${sorted.length}`);
  console.log(`Queries : ${QUERIES.length} per run x ${WARM_RUNS - DISCARD_FIRST} warm runs`);
  console.log(`p50     : ${p50.toFixed(3)} ms`);
  console.log(`p95     : ${p95.toFixed(3)} ms`);
  console.log(`p99     : ${p99.toFixed(3)} ms`);
  console.log(`min     : ${sorted[0].toFixed(3)} ms`);
  console.log(`max     : ${sorted[sorted.length - 1].toFixed(3)} ms`);
}

await main();

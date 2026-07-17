# Context preservation and tool-output compression research

Date: 2026-07-16. Web survey plus local Pi API verification, feeding Phase D
of `../plan.md`. Question: is ingestion-time compaction (current
tool-reduction design) the right architecture for the goal of slower context
growth without information loss?

## Findings

### 1. The industry converged on retroactive clearing, not ingestion-time

Anthropic's context editing API (`clear_tool_uses_20250919`) keeps tool
results at full fidelity while fresh and clears the oldest ones only when
context crosses a configured threshold - keeping the K most recent, clearing
in minimum batches, replacing cleared results with placeholders, and letting
critical tools be excluded. Measured results: context editing alone +29%
task performance over baseline, +39% combined with the memory tool, and a
100-turn agent test finishing with 84% fewer tokens.
Source: https://platform.claude.com/docs/en/build-with-claude/context-editing
and https://platform.claude.com/cookbook/tool-use-context-engineering-context-engineering-tools

### 2. Observations dominate trajectories and are mostly read once

In software-agent benchmarks, tool observations are roughly 84% of
trajectory tokens, and most are consumed once during the turn after the call
and never referenced again. That is the case for reduction. The caveat that
matters: hard-masking recent observations reduces solve rate (about 10%
reported for extended-thinking configurations) - the model needs full
fidelity in a recency window. Reduction must be windowed, not immediate.
Source: https://agentpatterns.ai/context-engineering/observation-masking/

### 3. Terminal output specifically punishes lossy generic pruning

The TACO paper (terminal-agent compression) states the exact risk Phase D
invariant 1 guards: terminal output interleaves noise with sparse exact
evidence - error messages, file paths, test names, versions - and generic
pruning or abstractive summarization discards or paraphrases it. It also
reports that static compression rule sets yield unstable gains across
heterogeneous environments, which supports keeping the corpus/replay loop as
the mechanism for growing rules from observed usage.
Source: https://arxiv.org/abs/2604.19572

### 4. Lossless archive and recovery is the differentiator

VISTA's framing: rule-based eviction layers fail when a fixed rule cannot
know which evidence matters later; the mitigation is pairing any reduction
with lossless archive and recovery so the agent can get evidence back.
Source: https://arxiv.org/html/2606.30005v1

### 5. Cache economics forbid per-turn sliding windows

Retroactive editing rewrites the request prefix, which invalidates
prefix-based prompt caches. Anthropic's mitigation is threshold-triggered
batch clearing with a minimum clear amount (5k+ tokens) so cache
invalidation is amortized - garbage-collector generations, not a
continuously sliding window. Any Pi implementation must clear in batches at
thresholds for the same reason (Codex provider caching is also
prefix-based).

## Local feasibility (verified 2026-07-16)

`@earendil-works/pi-coding-agent` `dist/core/extensions/types.d.ts` exposes:

- `ContextEvent` - "Fired before each LLM call. Can modify messages." This
  is the retroactive reduction hook: mutate old tool-result messages in the
  outgoing payload only.
- The session transcript on disk always retains the full tool results, so
  payload-side reduction is non-destructive by construction - the raw output
  is never lost, satisfying the recoverability invariant without extra
  scratch files for the retroactive path.
- `SessionBeforeCompactEvent` exposes compaction `reason`
  ("manual" | "threshold" | "overflow") - usable both to reduce before
  compaction fires and to measure compaction frequency for T14.

## Multi-agent context patterns (added 2026-07-16, feeds phase 3)

### 6. The game of telephone is the failure mode of delegation

Anthropic's multi-agent research system: subagent outputs re-summarized
through the coordinator lose fidelity (citations, exact strings), so
subagents write to the filesystem and the lead consumes references -
full-fidelity artifacts bypass re-summarization. Their subagent contract has
four legs: objective, output format, tool/source guidance, task boundaries -
"miss any of the four and the subagent drifts." Token economics: multi-agent
runs cost roughly 15x single-chat tokens; split work only when context can
be truly isolated.
Source: https://www.anthropic.com/engineering/multi-agent-research-system
and https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them

### 7. Parallel reads, single-threaded writes

Cognition's "Don't Build Multi-Agents" argued splitting interdependent work
loses critical context in transmission; share full traces, not summaries.
Their 2026 update narrows it: multi-agent setups that work in practice are
those where multiple agents contribute intelligence (read, review, research)
while writes stay single-threaded. This matches the Pi roster's shape
(read-only orchestrator/planner/validators/reviewers, writing builders) and
"work directly by default" for interdependent coding.
Source: https://cognition.com/blog/dont-build-multi-agents and
https://cognition.com/blog/multi-agents-working

### 8. KV-cache hit rate governs retroactive editing economics

Manus: KV-cache hit rate is the top production metric (100:1 input:output
ratio); stable prompt prefixes, append-only context, no timestamps in
prompts, mask tools rather than add/remove them (tool-list changes
invalidate cache). Their five-dimension framework - offload (filesystem),
reduce (compaction), retrieve (file search), isolate (subagents), cache -
is a useful completeness check: Pi has offload (artifacts), reduce
(tool-reduction), retrieve (grep/glob), isolate (subagents); cache-awareness
is the dimension Pi does not yet manage deliberately.
Source: https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus

### 9. Worktree isolation is the 2026 consensus for parallel writers

Claude Code shipped first-class worktree isolation (v2.1.50 `--worktree`;
Agent Teams v2.1.32 gives every teammate its own worktree) and the field
converged on `isolation: worktree` as the default for every code-writing
subagent: merge conflicts at integration are reviewable, runtime overwrites
are lost work. Semantics to mirror: temporary worktree per agent,
auto-removed when the agent finishes without changes; a
`.worktreeinclude`-style mechanism copies needed gitignored files (.env,
local config) into fresh worktrees - their absence is the top confusing
failure. Field scale numbers: 4-8 concurrent worktrees per developer is
reliable; beyond that the bottleneck is human review. Decomposition rule:
split by feature boundary, avoid assigning same-file work to parallel
agents in the first place.
Source: https://code.claude.com/docs/en/worktrees and
https://addyosmani.com/blog/code-agent-orchestra/

### 10. Dynamic scheduling beats rigid upfront DAGs for long horizons

Research caveat on static task graphs: upfront decomposition assumes the
schedule is knowable before execution, but orchestration is stateful -
without state feedback, execution faults propagate into brittle
long-horizon runs. Practical mitigations: allow tasks created mid-run to
join the schedule, propagate failure state explicitly, and keep the graph
version-controlled and persistent for recovery. Open-source prior art for
the goal -> planner -> task graph -> orchestrator -> parallel agents
pipeline with pre-merge verification: Bernstein.
Source: https://arxiv.org/abs/2604.17009 and
https://amux.io/guides/ai-agent-orchestration-2026/

## Implications for Phase D

1. Ingestion-time reduction (current design) remains right for two cases:
   extreme unmatched dumps (fallback clamp) and outputs so large they should
   never enter context at full size. For routine output, reduction should
   move to a retroactive, threshold-triggered batch pass at `ContextEvent`
   with a keep-last-K window - full fidelity while fresh, deterministic
   compact form when old.
2. The rules engine, corpus, and replay harness (T8, T9) are unchanged in
   value: the retroactive pass applies the same deterministic compact forms.
   The work is reusable across both layers.
3. Recovery for retroactively reduced results is structurally free (session
   file retains raw); the T10 marker/scratch mechanism stays for
   ingestion-time reductions.
4. Batch thresholds with minimum clear amounts, never per-turn sliding, to
   protect provider prefix caches.

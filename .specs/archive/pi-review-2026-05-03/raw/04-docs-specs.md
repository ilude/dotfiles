# Code Review: docs-specs drift, contradictions, and stale references
# Branch: main | Scope: last 2 days (bbeaa3b..HEAD)

**Files reviewed:** 15 documentation and spec files, cross-referenced against
pi/lib/commit/types.ts, pi/extensions/commit.ts, pi/lib/observability.ts,
pi/lib/metrics.ts, pi/extensions/workflow-commands.ts, pi/extensions/subagent/index.ts

---

## BLOCKER

### [BLOCKER-1] docs/commit-helper-contract.md -- classification names do not match TypeScript implementation

**File:** `docs/commit-helper-contract.md:59-68`
**Confidence:** 97%

The contract lists these classification values:

```
staged, modified, deleted, untracked, ignored, renamed, copied, unknown
```

The TypeScript type `CommitClassification` in `pi/lib/commit/types.ts:4-11` uses a
different set:

```
staged_deletion, staged_change, unstaged_change, untracked,
ignored_untracked, unmerged, unknown
```

Divergences that are not aliases -- they are genuinely different names:

- `staged` (contract) vs `staged_change` (code)
- `modified` (contract) vs `unstaged_change` (code)
- `deleted` (contract) -- no counterpart (subsumed into `staged_deletion` or `unstaged_change`)
- `ignored` (contract) vs `ignored_untracked` (code)
- `renamed`, `copied` (contract) -- absent from `CommitClassification`; the
  Python helper may emit them but the TypeScript plan.ts does not

Any non-Pi consumer reading the contract to interpret Pi tool output will
misidentify entries. The contract claims to describe what "the committer should"
use; with two clients sharing it that divergence is a live bug surface.

**Suggested fix:** Update `docs/commit-helper-contract.md` section
"## Classifications" to reflect the TypeScript types, adding a note that the
Python `scripts/commit-helper` may emit the legacy names and that Pi tooling
uses the camelCase/revised set. Alternatively, split the contract into
Python-helper and Pi-extension sections explicitly.

---

### [BLOCKER-2] docs/commit-helper-contract.md -- `recommended_action: none` listed but not implemented in Pi

**File:** `docs/commit-helper-contract.md:54`
**Confidence:** 95%

The contract states `recommended_action` is one of `stage`, `keep_staged`,
`skip`, `block`, `none`.

The TypeScript union `RecommendedAction` at `pi/lib/commit/types.ts:13`:

```ts
export type RecommendedAction = "keep_staged" | "stage" | "skip" | "block";
```

`none` is absent. Code in `pi/lib/commit/plan.ts` does not emit it either.
A consumer following the contract docs who branches on `none` will handle a
value that Pi never produces, silently losing the case.

**Suggested fix:** Remove `none` from the contract's enumeration, or add it
back to `RecommendedAction` if it was intentionally deferred. If the Python
helper still emits it, note that in the compatibility section.

---

## FOLLOW-UP

### [FOLLOW-UP-1] .specs/archive/pi-observability-timing -- T5/T6 deliverables not present in code

**File:** `.specs/archive/pi-observability-timing/plan.md:163-178`
**Confidence:** 90%

The archived plan marks status `completed-and-archived` and lists manual
validation as confirmed. However, the deliverables for T5 and T6 are not
present in the codebase:

- **T5** ("Instrument /review-it reviewer, panel, and recovery timings"): only
  a single top-level `withTimingSpan` wrapping the entire `review-it` command
  is present in `pi/extensions/workflow-commands.ts:799`. Per-reviewer,
  per-panel, and recovery timing spans described in T5 are absent from the
  extension code and from the subagent extension.

- **T6** ("Add timing summaries to review synthesis"): `summarizeTimingSpans`
  is exported from `pi/lib/observability.ts` but is called nowhere in
  `pi/extensions/workflow-commands.ts` or `pi/extensions/subagent/index.ts`.
  The review synthesis path in `workflow-commands.ts` does not surface a
  timing summary.

- `pi/skills/workflow/review-it.md:169` acknowledges timing events "when
  available" but that advisory language implies the instrumentation the plan
  committed to delivering does not yet exist.

The plan's success criteria #2 ("per-reviewer, panel, recovery, subagent, tool,
and command durations available") and #3 ("review synthesis includes timing
summaries") are unmet in code.

**Suggested fix:** Either re-open the plan as `partially-implemented` and
create follow-up tasks for T5/T6, or document explicitly in
`docs/pi/observability.md` that per-reviewer/panel timing and synthesis
integration are deferred to a future phase. The plan must not stay archived
as `completed` against criteria it does not meet.

---

### [FOLLOW-UP-2] docs/commit-helper-contract.md -- top-level JSON schema fields describe Python helper only, not Pi TypeScript output

**File:** `docs/commit-helper-contract.md:38-44`
**Confidence:** 88%

The documented top-level fields are:

```
schema_version, repo_root, clean, entries, warnings, errors
```

The Pi TypeScript `CommitPlanResult` (`pi/lib/commit/types.ts:42-51`) emits:

```
repoRoot, preflight, entries, confirmationToken,
stageConfirmationToken, createConfirmationToken,
safeStagePaths, expectedStagedPaths
```

Missing from the contract: `preflight`, `stageConfirmationToken`,
`createConfirmationToken`, `safeStagePaths`, `expectedStagedPaths`.

Present in the contract but absent from Pi output: `schema_version`, `clean`,
`warnings`, `errors` (at top level).

The contract header correctly positions itself as "for non-Pi consumers and
parity checks," but agents reading the contract to interpret Pi `commit_plan`
tool output will find fields that don't exist and miss fields that do.

**Suggested fix:** Add a "Pi extension output" section to
`docs/commit-helper-contract.md` that mirrors `CommitPlanResult`, and
explicitly label the existing schema as the Python helper schema.

---

## QUESTIONS

### [QUESTION-1] AGENTS.md vs CLAUDE.md -- package manager policy overlap but not contradictory

**File:** `AGENTS.md:60`, `CLAUDE.md:32`
**Confidence:** N/A (clarification)

Both files describe the same pnpm-for-Pi/bun-elsewhere rule. They are
consistent in substance. The only mild inconsistency is wording:

- `AGENTS.md:60` -- "prefer `bun`; use `pnpm` where Bun cannot resolve the Pi
  package graph or where a package already has `pnpm-lock.yaml`"
- `CLAUDE.md:32` -- "prefer `bun`, or `pnpm` where documented/locked"

Neither contradicts the other; `CLAUDE.md` is correctly a summary-form pointer
to `pi/README.md`. No fix required unless the maintainer wants to collapse
these into a single source.

---

## Verified Safe

- `pi/PI-INSTRUCTIONS.md`: no references to deleted files
  (`probe-thinking-level.ts`, `memory-index.ts`, `memory-retrieve.ts`,
  `commit-fast.md`). The policy text accurately points to `pi/extensions/commit.ts`
  and `workflow-commands.ts`.
- `docs/agent-command-surfaces.md`: accurately reflects the current surface.
  `commit-fast` is not mentioned; the Pi commit extension is correctly described
  as the canonical path.
- `pi/extensions/README.md`: consistent with the implementation. The commit
  extension section matches the code structure.
- `docs/pi/observability.md`: the metrics path (`~/.pi/agent/logs/metrics-YYYY-MM-DD.jsonl`)
  and `PI_METRICS_DIR` override are accurate against `pi/lib/metrics.ts`. The
  `metrics_rotation_needed` event name and `maxFileBytes` marker are present in
  the code.
- `.specs/archive/pi-commit-extension/plan.md`: the deliverables for T0-T8 are
  present in code. `pi/lib/commit/{types,plan,message,stage,create,git,token}.ts`,
  `pi/extensions/commit.ts`, and the test files match the task descriptions.
  Archived status `completed-and-archived` is accurate for the commit extension.
- `claude/shared/commit-instructions.md`: correctly defers to Pi for Pi clients
  and uses `scripts/commit-helper` for Claude/OpenCode. The compatibility note
  at the top is accurate.

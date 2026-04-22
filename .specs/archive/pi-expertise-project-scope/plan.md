---
created: 2026-04-21
status: completed
completed: 2026-04-21
---

# Plan: Project-scoped expertise layers for Pi

## Context & Motivation

The current Pi expertise system in this repo stores one global expertise log and one derived snapshot per agent under `~/.pi/agent/multi-team/expertise/`. That works for cross-project Pi knowledge, but the conversation identified a growing relevance problem: unrelated repo-specific architecture, decisions, and file knowledge can pollute an agent’s mental model over time.

Recent work already hardened the snapshot system, added optional provider-assisted similarity, and confirmed that `read_expertise` now serves a compact snapshot instead of replaying the full raw log. That makes the next scaling issue more obvious: storage scope. The user wants a two-layer memory model so agents keep reusable global knowledge while isolating repo-specific expertise. A follow-on requirement is to define a compact, filesystem-friendly repo ID slug format using short host/provider prefixes like `gh` for GitHub and `gl` for GitLab.

Review of the first draft surfaced four plan-blocking gaps that this revision now resolves at the planning level: repo ID parsing and Windows-safe slug rules were underspecified, global-vs-project merge semantics and migration ordering were undefined, repo-ID drift/rename handling lacked rollback-safe behavior, and acceptance criteria relied too heavily on grep/string checks instead of behavioral verification. This revised plan narrows v1 to deterministic remote-derived repo IDs plus explicit fallback rules, defers a checked-in alias table unless real collisions justify it, and adds migration, locking, redaction, and fixture-backed validation requirements.

## Constraints

- Platform: Windows
- Shell: `cmd.exe` host with bash/pwsh tooling available in this repo
- The current deterministic snapshot system and optional provider-assisted similarity must keep working
- Raw JSONL expertise logs remain the source of truth; snapshots remain derived artifacts
- Existing global expertise files under `~/.pi/agent/multi-team/expertise/` cannot be broken or silently discarded
- The read path must reduce cross-project pollution without losing valuable global Pi/tooling knowledge
- Repo ID slugs must be compact, filesystem-friendly, deterministic, and stable across sessions
- Git provider/host prefixes should be short and recognizable (`gh`, `gl`, etc.)
- V1 should prefer deterministic remote-derived slugs; a checked-in alias table is deferred unless real collisions or rename-stability issues are demonstrated
- The implementation should behave sensibly outside git repos (global-only fallback)
- Project-local scoping should prefer real repo identity over ad hoc current-directory names when git metadata is available
- Windows filesystem constraints must be handled explicitly: reserved names, case-folding, trailing dots/spaces, and path-length pressure
- Repo ID drift (remote rename, remote selection change, future aliasing) must not silently orphan or fork expertise state
- Validation must prove mixed old/new state behavior, not just greenfield project-local behavior
- Sensitive project-local expertise should support redaction and repo-level disable/opt-out safeguards

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Keep one global expertise store per agent | Simplest design, no migration, preserves all cross-project learning | Project-specific expertise pollutes unrelated sessions and reduces read relevance over time | Rejected: does not address the pollution problem that motivated this work |
| Move entirely to project-only expertise | Strongest repo isolation, simplest relevance model within a repo | Loses reusable cross-project Pi/tooling knowledge and forces duplicate rediscovery | Rejected: too aggressive; throws away useful global memory |
| Two-layer memory: global + project-local | Preserves reusable global knowledge while isolating repo-specific expertise; best long-term relevance | More implementation complexity; needs deterministic merge/read rules and repo ID design | **Selected** |
| Infer project separation only from `entry.project` inside one giant log | No storage migration, minimal code changes | Weak separation, harder compaction, poorer token efficiency, and brittle reliance on consistent tagging | Rejected: not robust enough as expertise grows |
| Use hashed repo IDs only | Collision-safe and deterministic | Opaque to humans; harder to inspect/debug expertise directories | Rejected: reserve hashes for suffix/fallback only |
| Ship deterministic remote-derived slugs in v1; defer alias table until collisions or rename-stability issues are proven | Solves the core problem with less speculative machinery; keeps review surface smaller | Future overrides may need a follow-on slice if edge cases appear | **Selected for v1** |
| Ship a checked-in alias table in v1 | Human-readable overrides for tricky repos and future renames | Extra scope, migration complexity, and more failure modes before real need is demonstrated | Rejected for v1: revisit only after evidence of collisions/drift pain |

## Objective

Extend the Pi expertise system so each agent can maintain both global expertise and project-local expertise, keyed by a deterministic compact repo ID slug. `append_expertise` should default to project-local storage inside a git repo and global storage outside one. `read_expertise` should read both layers safely, keep project-local knowledge first, preserve the compact snapshot contract, and apply explicit dedupe/conflict rules so overlapping facts do not double-count or fight nondeterministically. The implementation must preserve backward compatibility with existing global expertise files, include drift-safe migration behavior, and avoid silent expertise loss when repo identity changes.

## Project Context

- **Language**: Mixed repo; target implementation is TypeScript in `pi/extensions/` and `pi/lib/`, plus Markdown docs and Vitest tests
- **Test command**: `make test-pytest` (repo-wide) and `cd pi/tests && bun vitest run` (Pi extension tests)
- **Lint command**: `make lint-python` (repo-wide Python lint detected); Pi-specific TypeScript validation uses `python pi/extensions/tsc-check.py`

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Define explicit repo ID, layering, migration, and safety contract | 4 | feature | medium | planning-lead | — |
| T2 | Add fixture-backed tests for repo ID resolution and layered state behavior | 4 | feature | medium | qa-engineer | — |
| T3 | Implement deterministic repo IDs and layered expertise storage/read behavior | 5 | architecture | large | engineering-lead | V1 |
| V1 | Validate wave 1 | — | validation | medium | validation-lead | T1, T2 |
| V2 | Validate wave 2 | — | validation | large | validation-lead | T3 |

## Execution Waves

### Wave 1 (parallel)

**T1: Define explicit repo ID, layering, migration, and safety contract** [medium] — planning-lead
- Description: Define the storage layout, repo ID resolution contract, layer merge semantics, migration ordering, and safety rules before implementation. This task must produce a normative contract, not just prose. It should specify:
  - canonical remote selection precedence (for example: configured preferred remote if present, else `origin`, else deterministic lexical fallback)
  - parsing rules for HTTPS, SSH, SCP-style remotes, optional ports, `.git` suffixes, and nested GitLab groups
  - compact repo ID format with short host/provider prefixes (`gh`, `gl`, etc.) and Windows-safe normalization rules
  - reserved-name/path-length/collision handling, including deterministic hash suffix rules when needed
  - non-git and no-remote fallback behavior
  - read semantics: project-local first, then global, with explicit dedupe/conflict precedence by source + timestamp + summary identity
  - migration rules for mixed legacy global state, snapshot invalidation, and repo ID drift/rename handling
  - safety rules for secret redaction/sensitive-repo disable behavior
- Files: `pi/README.md`, `pi/multi-team/skills/mental-model.md`, `pi/lib/repo-id.ts` (new helper contract/TODOs), `pi/docs/expertise-layering.md` (new normative decision table or equivalent checked-in spec)
- Acceptance Criteria:
  1. [ ] A single normative contract defines repo ID derivation, layer precedence, and migration behavior.
     - Verify: `rg -n "remote precedence|scp|\.git|nested GitLab|reserved names|hash suffix|project-local first|dedupe|migration|drift" pi/README.md pi/multi-team/skills/mental-model.md pi/lib/repo-id.ts pi/docs/expertise-layering.md`
     - Pass: The docs/helper cover remote parsing, filesystem safety, merge semantics, migration, and drift explicitly enough that an implementer need not infer behavior.
     - Fail: Key behaviors are split across scattered prose or still left to implementer judgment.
  2. [ ] The contract includes executable examples or decision tables, not just keyword mentions.
     - Verify: `rg -n "Example|Decision table|Input remote|Expected repo id|Conflict rule|Legacy global|Drift" pi/docs/expertise-layering.md pi/README.md`
     - Pass: There is at least one compact table/set of fixtures mapping repo inputs and layered state scenarios to expected behavior.
     - Fail: Keyword grep passes while contradictory interpretations remain possible.
  3. [ ] Safety and rollout boundaries are explicit.
     - Verify: `rg -n "redact|sensitive repo|disable|dual-read|rollback|snapshot invalidation|lock" pi/docs/expertise-layering.md pi/README.md pi/multi-team/skills/mental-model.md`
     - Pass: The contract explains how secrets, migration rollback, locking, and drift are handled in v1.
     - Fail: Safety-critical behavior remains implicit.

**T2: Add fixture-backed tests for repo ID resolution and layered state behavior** [medium] — qa-engineer
- Description: Add tests that encode the desired behavior before implementation. Cover compact repo ID derivation from GitHub/GitLab remotes, SCP SSH remotes, uppercase hosts, `.git` suffixes, multiple remotes, nested GitLab groups, Windows-safe normalization, collision/hash-suffix behavior, non-git fallback, project-local default writes, mixed legacy-global + new project-local reads, stale snapshot rebuilds, and drift-safe coexistence behavior. Also add a lightweight preflight/assumption test or helper so Wave 1 fails clearly when the Pi test environment is not runnable.
- Files: `pi/tests/agent-chain.test.ts`, `pi/tests/helpers/mock-pi.ts`, `pi/tests/repo-id.test.ts` (new), `pi/tests/expertise-layering.test.ts` (new or folded into agent-chain tests)
- Acceptance Criteria:
  1. [ ] Repo ID tests cover real-world remote formats and Windows-safe slug generation.
     - Verify: `rg -n "scp|ssh|https|GitHub|GitLab|uppercase|\.git|multiple remotes|nested group|reserved" pi/tests/repo-id.test.ts`
     - Pass: Table-driven tests cover ambiguous remote formats and filesystem hazards, not just happy-path owner/repo inputs.
     - Fail: The test suite would miss the real-world remote parsing bugs reviewers identified.
  2. [ ] Layered-state tests cover backward compatibility and mixed legacy/new state.
     - Verify: `rg -n "legacy global|project-local|stale snapshot|mixed state|drift|dual-read|read order|dedupe" pi/tests/agent-chain.test.ts pi/tests/expertise-layering.test.ts`
     - Pass: Tests cover coexistence of old global files with new project-local files, including snapshot rebuild and dedupe behavior.
     - Fail: The suite only proves greenfield project-local behavior.
  3. [ ] Wave 1 targeted Pi tests pass and fail clearly when prerequisites are missing.
     - Verify: `cd pi/tests && bun vitest run tests/repo-id.test.ts tests/expertise-layering.test.ts tests/agent-chain.test.ts`
     - Pass: Tests are green in a valid Pi test environment and emit actionable failure if prerequisites are not available.
     - Fail: The suite is flaky, ambiguous, or silently skips critical behavior.

### Wave 1 — Validation Gate

**V1: Validate wave 1** [medium] — validation-lead
- Blocked by: T1, T2
- Checks:
  1. Run acceptance criteria for T1 and T2
  2. `cd pi/tests && bun vitest run tests/repo-id.test.ts tests/expertise-layering.test.ts tests/agent-chain.test.ts` — targeted Pi tests pass
  3. `python pi/extensions/tsc-check.py` — Pi extension TypeScript validation passes
  4. `make lint-python` — no unrelated Python lint regressions from repo edits
  5. Cross-task integration: verify the normative contract examples exactly match the repo-ID fixtures and layered-state test fixtures
- On failure: create a fix task, re-validate after fix

### Wave 2

**T3: Implement deterministic repo IDs and layered expertise storage/read behavior** [large] — engineering-lead
- Blocked by: V1
- Description: Implement layered expertise storage and reading using deterministic remote-derived repo IDs. Add a dedicated repo ID helper that handles canonical remote selection, parsing, Windows-safe slug generation, and deterministic fallback. Update `append_expertise` so it defaults to project-local storage inside git repos and global storage outside one, while preserving backward-safe behavior for existing global files. Update `read_expertise` to load both layers, keep project-local knowledge first, and apply explicit dedupe/conflict rules rather than blind concatenation. Preserve snapshot rebuild/fallback guarantees, similarity support, and add drift-safe behavior so remote changes do not silently orphan state.
- Files: `pi/extensions/agent-chain.ts`, `pi/lib/expertise-snapshot.ts`, `pi/lib/repo-id.ts` (new), `pi/tests/agent-chain.test.ts`, `pi/tests/repo-id.test.ts`, `pi/tests/expertise-layering.test.ts`, `pi/README.md`, `pi/docs/expertise-layering.md`
- Acceptance Criteria:
  1. [ ] Repo ID resolution generates compact, filesystem-friendly IDs deterministically for real remote formats.
     - Verify: `cd pi/tests && bun vitest run tests/repo-id.test.ts --reporter=verbose`
     - Pass: Tests show stable IDs for GitHub/GitLab HTTPS + SSH/SCP remotes, nested GitLab groups, Windows-safe normalization, and deterministic fallback when remotes are unavailable.
     - Fail: IDs are unstable, collide on Windows, or disagree with the documented examples.
  2. [ ] `append_expertise` scopes writes correctly and safely under mixed old/new state.
     - Verify: `cd pi/tests && bun vitest run tests/agent-chain.test.ts tests/expertise-layering.test.ts --reporter=verbose`
     - Pass: Tests confirm in-repo writes go to project-local storage by default, non-repo writes stay global, sensitive-repo disable/redaction behavior is enforced, and old global files remain readable.
     - Fail: Writes go to the wrong layer, secrets are durably stored when they should be blocked/redacted, or manual migration is required before the feature works.
  3. [ ] `read_expertise` applies explicit layer precedence, dedupe, and conflict rules.
     - Verify: `cd pi/tests && bun vitest run tests/expertise-layering.test.ts tests/agent-chain.test.ts --reporter=verbose`
     - Pass: Tests confirm project-local knowledge is shown first, overlapping facts are deduplicated deterministically, conflicting facts resolve according to the documented rules, and global knowledge remains available without dominating unrelated reads.
     - Fail: Output order is unclear, duplicate/conflicting facts appear nondeterministically, or unrelated global content still overwhelms project-local state.
  4. [ ] Migration and repo-ID drift are rollback-safe.
     - Verify: `cd pi/tests && bun vitest run tests/expertise-layering.test.ts --reporter=verbose`
     - Pass: Tests cover coexistence of legacy global state, snapshot invalidation on cutover, and dual-read/drift-safe behavior when repo identity changes.
     - Fail: Repo ID changes silently fork or hide expertise history, or snapshots stay stale/incorrect across the cutover.
  5. [ ] Layered snapshots remain concurrency-safe and type-safe.
     - Verify: `cd pi/tests && bun vitest run tests/agent-chain.test.ts --reporter=verbose && python pi/extensions/tsc-check.py`
     - Pass: Tests and TS validation confirm per-layer locking/atomic writes preserve snapshot integrity and no TS/runtime assumptions break on the current Windows npm-managed Pi setup.
     - Fail: Concurrent writes can corrupt per-layer snapshots, or TS/runtime assumptions fail.

### Wave 2 — Validation Gate

**V2: Validate wave 2** [large] — validation-lead
- Blocked by: T3
- Checks:
  1. Run acceptance criteria for T3
  2. `cd pi/tests && bun vitest run` — all Pi extension tests pass
  3. `python pi/extensions/tsc-check.py` — Pi extension TypeScript validation passes after implementation
  4. `make test-pytest` — no repo-wide Python test regressions from surrounding changes
  5. `make lint-python` — no new Python lint warnings
  6. Cross-task integration: verify layered reads reduce unrelated project pollution, preserve global Pi/tooling expertise, survive legacy coexistence, and remain stable when repo identity drifts
- On failure: create a fix task, re-validate after fix

## Dependency Graph

```text
Wave 1: T1, T2 (parallel) → V1
Wave 2: T3 → V2
```

## Success Criteria

1. [ ] Pi expertise can be stored in both global and project-local layers using deterministic compact repo IDs.
   - Verify: `cd pi/tests && bun vitest run tests/repo-id.test.ts tests/expertise-layering.test.ts tests/agent-chain.test.ts`
   - Pass: Tests confirm project-local scoping, global fallback, stable repo ID generation, and Windows-safe normalization.
2. [ ] `read_expertise` reduces cross-project pollution without losing reusable global knowledge.
   - Verify: `cd pi/tests && bun vitest run tests/expertise-layering.test.ts tests/agent-chain.test.ts --reporter=verbose`
   - Pass: Tests and rendered output show project-local knowledge is prioritized, overlaps are deduplicated, and global knowledge remains available without duplicating or overriding project-local state unexpectedly.
3. [ ] The implementation stays safe and compatible with current Pi expertise behavior.
   - Verify: `cd pi/tests && bun vitest run && python pi/extensions/tsc-check.py && make lint-python`
   - Pass: Full Pi tests, TS validation, and lint all succeed with layered expertise enabled, including mixed legacy/new fixtures and drift-safe behavior.

## Handoff Notes

- Keep the existing per-agent global files as the backward-compatibility baseline; do not require users to manually migrate everything before the feature works.
- Prefer a dedicated repo ID helper (`pi/lib/repo-id.ts`) over scattering remote parsing logic through `agent-chain.ts`.
- In v1, implement deterministic remote-derived slugs plus explicit fallback rules; do not ship a checked-in alias table unless the implementation uncovers real collisions that cannot be handled safely with deterministic suffix rules.
- Persist stable repo identity metadata with entries/snapshots so future repo-ID drift can be detected and handled rather than silently forking state.
- If the exact rendered shape of layered `read_expertise` output is still debatable, keep the external tool contract stable and express layers explicitly in headings/structured details while preserving deterministic dedupe/conflict rules.
- Secret redaction/sensitive-repo disable behavior should be conservative in v1; if detection confidence is low, prefer refusing project-local persistence over silently storing questionable sensitive content.

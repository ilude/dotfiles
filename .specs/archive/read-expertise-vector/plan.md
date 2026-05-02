---
created: 2026-05-01
status: completed
completed:
  - T1
  - T2
  - V1
  - T3
  - V2
  - T4
  - T5
  - V3
---

# Plan: Add Focused Retrieval to read_expertise

## Context & Motivation

`read_expertise` currently returns an agent's compact accumulated expertise snapshot. This is reliable, but as expertise grows it can become less focused on the current task and more token-expensive. The chosen direction is Option 2: preserve the current snapshot as the stable baseline, and add an optional focused retrieval layer so callers can request expertise relevant to the current task/topic.

This plan intentionally starts with a deterministic local retrieval MVP and a pluggable vector/embedding path. A full vector database is allowed only if the design gate shows deterministic lexical/hybrid retrieval is insufficient for the focus/token goals. Expertise JSONL logs remain the source of truth; any index is disposable cache state. The implementation must also document Option 3 -- a future retrieval-first expertise system -- as an alternative to revisit if this layered approach does not work.

## Constraints

- Platform: Windows via Git Bash/MSYS2 (`MINGW64_NT-10.0-26200`)
- Shell: `/usr/bin/bash`
- Existing expertise JSONL logs remain the source of truth; retrieval/vector data must be rebuildable cache state.
- Preserve backward compatibility for existing `read_expertise(agent, mode)` callers.
- Default behavior remains deterministic and safe when no query, provider, or index is available.
- First implementation should prefer local deterministic lexical/hybrid retrieval; external embedding providers require explicit opt-in.
- Do not modify secrets or `.env` files.
- Do not commit generated indexes/caches; add or verify gitignore coverage.
- Add explicit comments near implementation docs or local `AGENTS.md` describing Option 3 as a future fallback if Option 2 fails.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Keep snapshot-only `read_expertise` | Simple, deterministic, easy to debug, no embedding/index dependency | Token cost and topical drift grow with expertise; manual curation required to stay focused | Rejected: does not address focus/token goals |
| Deterministic lexical/hybrid retrieval layered on snapshots | Local, private, dependency-light, easy to test; may solve most focus/token issues | Less semantic than embeddings; may miss paraphrased matches | **Selected as MVP gate**: must be tried before adding full vector DB |
| Optional vector/embedding retrieval layered on snapshots | Backward compatible; can improve semantic matching; preserves JSONL source of truth | Provider/privacy risks, cache lifecycle, dependency and runtime complexity | Selected only if justified by T2 against MVP criteria |
| Retrieval-first expertise system | Maximum focus and long-term scalability; lower steady-state token use | Risk of missing critical stable knowledge; harder to debug; requires strong query generation | Rejected for now: document as Option 3 for future exploration |

## Objective

Extend expertise tooling so `read_expertise` can optionally accept a topic/query and return bounded focused expertise merged with the existing compact snapshot. The completed system preserves no-query behavior, has local/private fallback behavior, includes behavioral tests, and documents Option 3 without implementing it.

## Project Context

- **Language**: Python and shell scripts in the dotfiles repo; Pi runtime/tooling also includes TypeScript under `pi/`
- **Test command**: `make test-pytest`
- **Lint command**: `make lint`
- **TypeScript validation**: discover exact command in T1; if none exists, add/define a minimal validation command for changed TS files before implementation is accepted.

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Map implementation, tests, and TS validation | 0-2 | mechanical | small | planning-lead | -- |
| T2 | Design retrieval contract, security, and MVP gate | 2-3 | feature | medium | engineering-lead | -- |
| V1 | Validate wave 1 | -- | validation | medium | validation-lead | T1, T2 |
| T3 | Add behavioral fixtures and test skeletons | 2-4 | feature | medium | qa-engineer | V1 |
| V2 | Validate wave 2 | -- | validation | medium | validation-lead | T3 |
| T4 | Implement focused retrieval and cache handling | 3-5 | feature | medium | backend-dev | V2 |
| T5 | Complete docs, Option 3 note, and final tests | 2-4 | feature | medium | docs-dev | V2 |
| V3 | Validate wave 3 | -- | validation | medium | validation-lead | T4, T5 |

## Execution Waves

### Wave 1 (parallel)

**T1: Map implementation, tests, and TS validation** [small] -- planning-lead
- Description: Locate `read_expertise`, `append_expertise`, snapshot builder, raw JSONL logs, cache/snapshot paths, tool schema, package metadata, and existing Python/TypeScript tests. Identify exact TS validation command or document that one must be added.
- Files: likely `pi/lib/expertise-snapshot.ts`, Pi tool registration files, package metadata, existing tests under `pi/` or harness directories.
- Acceptance Criteria:
  1. [ ] Implementation map identifies source logs, cache/snapshot paths, schema/handler, package metadata, and tests.
     - Verify: `grep -R "read_expertise\|expertise-snapshot\|append_expertise" -n pi .pi 2>/dev/null | head -80`
     - Pass: Relevant implementation/test/doc files are listed in a handoff note.
     - Fail: Broaden search outside this repo and document exact paths.
  2. [ ] TypeScript validation command is known or explicitly added to scope.
     - Verify: `find pi -maxdepth 3 -name package.json -o -name tsconfig.json | sort`
     - Pass: Handoff names exact TS test/typecheck command, or states no command exists and T4 must add one.
     - Fail: Do not proceed to V1 until TS validation path is explicit.

**T2: Design retrieval contract, security, and MVP gate** [medium] -- engineering-lead
- Description: Define exact API and output contract: optional `query`, `max_results`, defaults, bounds, invalid input behavior, output section names, deduplication, ranking, merge order, cache format, index versioning, JSONL hash/mtime invalidation, and fallback behavior. Include a privacy/security section: local retrieval default, external embedding opt-in only, no secrets edits, cache gitignore, corrupt/partial index recovery. Decide whether deterministic lexical/hybrid retrieval is sufficient before approving vector DB work.
- Files: `.specs/read-expertise-vector/retrieval-contract.md` and/or implementation-adjacent design comments.
- Acceptance Criteria:
  1. [ ] Contract specifies inputs, outputs, ranking/merge semantics, and fallback behavior.
     - Verify: `grep -R "max_results\|invalid input\|dedup\|index version\|JSONL" -n .specs/read-expertise-vector pi 2>/dev/null`
     - Pass: Contract includes all listed behaviors with concrete defaults.
     - Fail: Add missing contract details before implementation.
  2. [ ] Security/cache policy is explicit.
     - Verify: `grep -R "external embedding\|opt-in\|gitignore\|corrupt\|partial index" -n .specs/read-expertise-vector pi 2>/dev/null`
     - Pass: Contract forbids external provider use by default and defines cache recovery.
     - Fail: Add privacy/cache rules before implementation.

### Wave 1 -- Validation Gate

**V1: Validate wave 1** [medium] -- validation-lead
- Blocked by: T1, T2
- Checks:
  1. Run acceptance criteria for T1 and T2.
  2. `make test-quick` -- quick baseline passes before changes.
  3. `make lint-python` -- no baseline Python lint failures introduced.
  4. Run the TS validation command identified by T1, or confirm T4 is explicitly tasked to add it.
  5. Confirm T2 contract references concrete files/paths discovered by T1.
- On failure: create a fix task, re-validate after fix.

### Wave 2

**T3: Add behavioral fixtures and test skeletons** [medium] -- qa-engineer
- Blocked by: V1
- Description: Add deterministic expertise JSONL fixtures and test skeletons for no-query compatibility, query retrieval, max-results bounds, ranking/deduplication, missing/stale/corrupt/partial index fallback, provider-disabled behavior, and invalid input. Tests may initially fail until T4, but expected outputs must be concrete.
- Files: likely Pi expertise tests/fixtures and test runner config discovered by T1.
- Acceptance Criteria:
  1. [ ] Behavioral tests use fixtures and expected outputs, not grep-only checks.
     - Verify: run the discovered expertise test command or TS test command from T1.
     - Pass: Tests execute and fail only for not-yet-implemented retrieval behavior, while no-query compatibility expectations are explicit.
     - Fail: If tests cannot run or only inspect text, fix test harness before implementation.
  2. [ ] Fixtures cover privacy/fallback edge cases.
     - Verify: `grep -R "corrupt\|partial\|stale\|provider-disabled\|max_results\|dedup" -n pi test .specs/read-expertise-vector 2>/dev/null`
     - Pass: Matching test names/fixtures/assertions exist.
     - Fail: Add missing fixture coverage.

### Wave 2 -- Validation Gate

**V2: Validate wave 2** [medium] -- validation-lead
- Blocked by: T3
- Checks:
  1. Run T3 acceptance criteria.
  2. Confirm failing tests are expected implementation failures, not broken harness/setup.
  3. Confirm T4 has enough concrete expected behavior to implement against tests.
- On failure: create a fix task, re-validate after fix.

### Wave 3

**T4: Implement focused retrieval and cache handling** [medium] -- backend-dev
- Blocked by: V2
- Description: Implement the contract from T2 against tests from T3. Preserve no-query behavior. Use deterministic local retrieval first; add vector/embedding support only if T2 approved it. Implement cache/index versioning, invalidation by JSONL hash/mtime, atomic writes, corrupt/partial index recovery, max-results bounds, deduplication, and stable merge order. Ensure generated cache files are ignored.
- Files: likely `pi/lib/expertise-snapshot.ts`, tool schema/handler files, cache/index helpers, tests, package metadata if justified.
- Acceptance Criteria:
  1. [ ] Existing no-query calls are backward compatible.
     - Verify: run no-query compatibility test from T3.
     - Pass: Output matches golden/fixture snapshot contract and existing callers need no changes.
     - Fail: Restore backward-compatible defaults before proceeding.
  2. [ ] Query retrieval is bounded, deterministic, and tested.
     - Verify: run focused retrieval tests from T3.
     - Pass: Results match expected ranking/dedup/max-results behavior.
     - Fail: Inspect scoring, merge, and bounds logic.
  3. [ ] Cache and provider fallback behavior is safe.
     - Verify: run fallback/corrupt-index/provider-disabled tests from T3.
     - Pass: Tool returns stable snapshot or local retrieval without unhandled errors or external calls.
     - Fail: Fix fallback and recovery paths.

**T5: Complete docs, Option 3 note, and final tests** [medium] -- docs-dev
- Blocked by: V2
- Description: Document user-facing `read_expertise` parameters, fallback behavior, privacy/provider policy, cache source-of-truth rule, and TypeScript validation command. Add code-adjacent or local `AGENTS.md` note: Option 3 retrieval-first expertise is a future alternative only if layered retrieval fails to reduce tokens/focus enough.
- Files: likely `pi/README.md`, local `AGENTS.md` or implementation comments, `.specs/read-expertise-vector/retrieval-contract.md`, tests if documentation examples are executable.
- Acceptance Criteria:
  1. [ ] Documentation matches implementation contract.
     - Verify: compare docs against T2 contract and T4 schema/tests.
     - Pass: Parameter names, defaults, output sections, and fallback semantics match.
     - Fail: Update docs or implementation until aligned.
  2. [ ] Option 3 is documented as future-only.
     - Verify: `grep -R "Option 3\|retrieval-first" -n pi AGENTS.md .specs/read-expertise-vector 2>/dev/null`
     - Pass: Note explains when to revisit retrieval-first and says not implemented in this plan.
     - Fail: Add concise implementation-adjacent note.

### Wave 3 -- Validation Gate

**V3: Validate wave 3** [medium] -- validation-lead
- Blocked by: T4, T5
- Checks:
  1. Run acceptance criteria for T4 and T5.
  2. `make test-pytest` -- all pytest suites pass.
  3. `make lint` -- no new lint warnings.
  4. Run TypeScript validation command identified/added by T1/T4.
  5. Verify generated cache/index files are gitignored and not staged.
  6. Cross-task integration: docs, tests, and implementation agree on schema, fallback semantics, privacy policy, and source-of-truth rules.
- On failure: create a fix task, re-validate after fix.

## Dependency Graph

```text
Wave 1: T1, T2 (parallel) → V1
Wave 2: T3 → V2
Wave 3: T4, T5 (parallel, both blocked by V2) → V3
```

## Success Criteria

1. [ ] Existing expertise behavior remains backward compatible.
   - Verify: run no-query golden/fixture tests and invoke `read_expertise` without a query.
   - Pass: Output matches prior snapshot-only contract and existing callers need no changes.
2. [ ] Topic-focused retrieval works locally and is bounded.
   - Verify: run focused retrieval fixture tests with `query` and `max_results`.
   - Pass: Response contains stable summary plus no more than `max_results` relevant, deduplicated entries in expected order.
3. [ ] Fallback and privacy requirements hold.
   - Verify: run missing/stale/corrupt/partial index and provider-disabled tests.
   - Pass: No external provider is called by default; failures return safe snapshot/local output without unhandled errors.
4. [ ] Full project validation passes.
   - Verify: `make test-pytest && make lint` plus the TS validation command.
   - Pass: All commands complete successfully with no new warnings or failures.

## Handoff Notes

- Treat any retrieval/vector index as disposable cache state. JSONL expertise logs remain canonical.
- External embedding providers must be disabled by default and require explicit opt-in; do not edit `.env` files.
- Prefer deterministic local lexical/hybrid retrieval for the MVP. Add vector DB/provider dependencies only if T2 documents why local retrieval cannot satisfy the plan goals.
- Option 3 -- retrieval-first expertise -- should be documented only as a future exploration path, not implemented here.

---
date: 2026-05-02
status: synthesis-complete
---

# Review: Pi Expertise Memory v2 -- Retrieval over JSONL

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle |
|----------|------------|-------------------------|--------------|-------------------|
| Standard completeness | reviewer | Completeness & explicitness reviewer | Mandatory reviewer for assumptions, gaps, and weak acceptance criteria | Assume future implementers have no conversation context and will follow ambiguous text literally |
| Standard red team | security-reviewer | Privacy, operational safety, and rollback reviewer | Mandatory reviewer for realistic failure modes, privacy risks, and state damage | Assume local/global memory boundaries and home-directory mutations fail under realistic conditions |
| Standard simplicity | product-manager | Scope and simpler-alternative reviewer | Mandatory reviewer for over-engineering and scope mismatch | Assume the plan is trying to solve future scale before proving current value |
| Domain expert | typescript-pro | TypeScript runtime/build/toolchain reviewer | Plan changes Pi TypeScript extensions, Bun/Vitest, embedding runtime, and cross-platform commands | Assume implementers underestimate Bun/Node/native dependency friction and Windows path issues |
| Domain expert | qa-engineer | Memory eval validity and regression-gate reviewer | Plan success depends on stratified eval, deterministic scoring, bootstrap gates, and deletion decisions | Assume the eval will be too weak or confounded to justify snapshot removal |
| Domain expert | backend-dev | Data model/index/retrieval semantics reviewer | Plan introduces JSONL ingest, stable IDs, supersede filtering, scope isolation, fingerprinting, and promotion clustering | Assume retrieval edge cases corrupt memory or leak across repos |

## Standard Reviewer Findings
### reviewer
- The plan still contains stale execution-state assumptions around `pi/tests/read-expertise-retrieval.test.ts`, calling it untracked/in-flight even though the file is now tracked.
- Several acceptance criteria rely on commands that are incomplete or path-fragile, especially jq snippets missing full paths and Windows parity claims that are not consistently backed by `just` recipes.
- Home-directory side effects in T3/T10 are underspecified for dry-run, backup, and cleanup behavior.
- The plan is executable, but only if implementers already understand the prior expertise snapshot/retrieval work.

### security-reviewer
- T3's first-run model acquisition still needs a stronger supply-chain story: expected source URL/package version, lockfile/pin, and checksum-before-use behavior.
- Cross-repo privacy is mostly specified, but the plan should explicitly test that non-policy global and other-repo raw entries are excluded even when semantically top-ranked.
- Snapshot deletion is guarded, but the archive path under `~/.pi/agent/index/archive/{ts}/` needs retention, overwrite, and restore failure handling made explicit.
- Promotion candidates are human-reviewed, but the candidate file can still expose private cross-repo facts; the plan should specify local-only storage and review hygiene.

### product-manager
- The plan remains too broad for a first execution pass: semantic retrieval, eval harness, embedder pinning, promotion detection, and snapshot deletion are bundled together.
- The smallest safe MVP is: preserve lexical default, add opt-in semantic retrieval, run eval, and stop before promotion/deletion unless lift is proven.
- T9 promotion and T10 snapshot deletion are not required to prove memory lift and should be explicitly deferred behind a separate decision point.
- Phase 2 DuckDB/vss is already deferred, but the plan still spends significant text on it; it should remain a note, not part of executable scope.

## Additional Expert Findings
### typescript-pro
- Dependency/runtime risk remains under-specified: `transformers.js`, model artifacts, Bun runtime, and Windows path handling may not behave the same as Node examples.
- T2/T3 acceptance commands mix `bun`, `just`, jq, bash, and pwsh without a single portable wrapper for every important check.
- The Phase 1 LOC budget is likely unrealistic if it includes parsing, embedding, fingerprinting, scope filtering, supersede handling, and tests.
- The plan should pin package versions and add a minimal TypeScript parse/build check for each new extension/script.

### qa-engineer
- The baseline/retrieval comparison can be confounded unless the runner cleanly toggles semantic retrieval while holding all other memory behavior constant.
- The eval fixture design is ambitious but not yet operationally precise: fixture schema, scoring fields, and provenance constraints need exact examples before implementation.
- Positive tasks requiring non-empty `retrieved_ids` can pass even if the retrieved memory is irrelevant; traces need expected IDs or relevance assertions for seeded fixtures.
- The deletion gate should require not only non-negative lift but also a restore drill and post-restore startup smoke.

### backend-dev
- Supersede semantics are described late in handoff notes but not promoted into T4/T5 data-model acceptance with enough concrete fixture coverage.
- Stable IDs based on JSONL path + line offset SHA-1 are vulnerable to path normalization and line-ending differences unless canonicalization is specified.
- Promotion clustering should specify how entry text is normalized before cosine comparison, or near-duplicates may fail/double-count unpredictably.
- Fingerprint mismatch rebuild behavior needs concurrency semantics: what happens when multiple Pi sessions start and rebuild simultaneously?

## Suggested Additional Reviewers
- `typescript-pro` -- relevant because the plan changes TypeScript/Bun extension runtime, embedding library integration, and test tooling.
- `qa-engineer` -- relevant because the plan's proceed/delete decisions hinge on eval validity and regression gates.
- `backend-dev` -- relevant because the core risk is data/index correctness across JSONL truth, derived indexes, scopes, and promotion semantics.

## Bugs (must fix before execution)
1. **Stale T0a precondition references a now-tracked test as untracked/in-flight.** The plan repeatedly says `pi/tests/read-expertise-retrieval.test.ts` is untracked/in-flight and T0a must decide whether to commit or rebase it. That is no longer true, so T0a can waste time or gate the plan on an already-resolved state. Update the plan to say the test is tracked and T0a must rebase/extend the tracked test surface if needed.
2. **Baseline/retrieval eval isolation is underspecified.** T7 runs after V2, after T4-T6 have implemented and wired retrieval. It says to run the existing snapshot + lexical baseline, but does not require a concrete runtime flag/env setting proving semantic retrieval is disabled while all other behavior is held constant. Add an explicit `memoryMode` or config matrix for baseline vs retrieval runs.
3. **Positive eval trace criterion can pass with irrelevant retrieval.** T8 only requires `retrieved_ids` to be non-empty for positive tasks. A positive task could retrieve any unrelated memory and pass that criterion. Seeded positive fixtures need expected memory IDs or expected fact assertions, and the trace check should verify the expected item appears or that deterministic task outcome depends on it.
4. **Supply-chain/offline model pinning needs pre-use verification.** T3 records SHA256 after first-run download and verifies on load, but the plan does not clearly require package/model source pinning and checksum verification before the model is trusted for eval/index generation. Add exact package/version/source fields and fail closed on checksum mismatch before embedding any corpus rows.
5. **T10 snapshot deletion remains in executable scope before the MVP has proven operational value.** Even with gates, deletion is bundled into this plan's execution path. Given current corpus size and the plan's own two-phase KISS rationale, make T10 a separate follow-up plan or explicitly require a human approval checkpoint after V3 before deletion work starts.

## Hardening
1. Add explicit negative privacy tests: other-repo raw entries and non-policy global entries must not appear even when they are the highest semantic matches.
2. Canonicalize stable ID inputs: repo-relative normalized path, LF-normalized byte offset policy, and Windows case handling.
3. Add concurrency tests for startup/rebuild: two Pi sessions should not corrupt `fingerprint.json` or serve a half-built index.
4. Move supersede-chain fixture requirements from handoff notes into T4/T5 acceptance criteria.
5. Add exact fixture schema examples to T2, including expected IDs for seeded positive tasks and expected no-fire cases for negative tasks.
6. Wrap shell-specific validation in `just` recipes where possible to satisfy the plan's own bash/pwsh parity constraint.
7. Specify local-only/private handling for `policy-candidates.md`; candidates may contain cross-repo facts and should not be committed by default.
8. Add a post-archive restore drill to T10: restore archived snapshots to a temp profile and prove agent startup can read them before live deletion.

## Simpler Alternatives / Scope Reductions
1. Split the plan into MVP and follow-up: MVP = T0a, T2/T3 minimal embedder decision, T4-T6 semantic retrieval, T7-T8 eval. Defer T9 promotion and T10 deletion.
2. Keep lexical retrieval as the default and do not delete snapshot machinery until semantic retrieval demonstrates repeated value across more than one eval run.
3. Treat Phase 2 DuckDB/vss as a separate notes section only; do not include T11 in the executable task table.
4. Replace global policy promotion in this plan with a manually reviewed notes artifact until there are enough repos to justify clustering.

## Contested or Dismissed Findings
1. **Dismissed: cross-repo defaults are inherently contradictory.** The plan is mostly consistent: default scope is current repo plus promoted global policies, and raw cross-repo similarity is blocked. However, it still needs stronger negative privacy tests.
2. **Downgraded: DuckDB/vss persistence risk.** Phase 2 is deferred and metric-triggered, so DuckDB/vss issues are not a current execution blocker. Keep the warnings as future T11 requirements.
3. **Contested: eval should be removed entirely.** Rebuttal favored keeping eval as the core safety gate. The scope reduction is to stop before promotion/deletion, not to remove eval.
4. **Dismissed: full Graphify/SCIP backend should be considered here.** This plan is specifically expertise-memory retrieval; broader code-intelligence graph work is captured separately in `.specs/code-intelligence-notes/notes.md`.

## Verification Notes
1. Stale tracked-test claim verified by `git ls-files pi/tests/read-expertise-retrieval.test.ts`, which returns the file, while the plan still says it is untracked at lines mentioning `read-expertise-retrieval.test.ts`.
2. Baseline/retrieval isolation issue verified in plan Wave 3: T7 is blocked by V2, while T4-T6 already implement and wire retrieval; T7 lacks an explicit config/env flag proving semantic retrieval is disabled for baseline.
3. Positive trace weakness verified in T8 acceptance criterion: it checks only `retrieved_ids|length == 0` for positives, not expected IDs or relevance.
4. Model pinning issue verified in T3: the plan records first-run download, warm-start, bundle size, and SHA256, but does not specify trusted source/version pinning or pre-use checksum verification before embeddings are generated.
5. Snapshot deletion scope issue verified in the task table and Wave 4: T10 is an executable task in this plan, not a separate follow-up, despite the plan's own Phase 1 KISS rationale.

## Review Artifact
Wrote full synthesis to: `.specs/pi-memory-retrieval/review-2/synthesis.md`

## Overall Verdict
**Fix bugs first**

## Recommended Next Step
- Apply selected review fixes to the plan before execution.
- Then execute via `/do-it .specs/pi-memory-retrieval/plan.md`.

Apply options:

1. Apply bugs only (Recommended — 5 fixes, all mechanical edits to the plan)
2. Apply bugs + selected hardening — pick which
3. Apply everything (bugs + 8 hardening)
4. No changes — review only

Next-step command:
`/do-it .specs/pi-memory-retrieval/plan.md`

How do you want to proceed?

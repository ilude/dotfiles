---
date: 2026-05-02
status: synthesis-complete
---

# Review: Pi Memory Retrieval Follow-ups -- Promotion, Snapshot Retirement, and Scalable Backend

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle |
|----------|------------|-------------------------|--------------|-------------------|
| Standard completeness | reviewer | Completeness & explicitness reviewer | Mandatory reviewer for plan completeness and acceptance criteria | Assume implementers have no context and execute exactly what is written |
| Standard red team | security-reviewer | Privacy, rollback, and filesystem safety reviewer | Mandatory reviewer for realistic security and operational hazards | Assume promotion candidates leak private facts and snapshot deletion is hard to recover |
| Standard simplicity | product-manager | Scope and MVP-shape reviewer | Mandatory reviewer for overbroad plans and unnecessary coupling | Assume the plan bundles unrelated follow-ups to avoid making hard sequencing choices |
| Domain expert | typescript-pro | TypeScript tooling and script-safety reviewer | Plan proposes Bun/TS scripts, just recipes, tests, and agent-chain changes | Assume scripts mutate tracked files or behave differently on Windows/Git Bash |
| Domain expert | qa-engineer | Restore/regression validation reviewer | Plan relies on archive/restore gates and no-regression validation | Assume deletion succeeds but restore fails or tests miss it |
| Domain expert | backend-dev | Memory data lifecycle and backend-decision reviewer | Plan touches promotion clustering, JSONL source of truth, snapshot retirement, and backend candidates | Assume candidate scanning corrupts/leaks memory and backend metrics are under-specified |

> Note: attempts to launch the subagent panel failed with no subagent output in this session. The synthesis below is based on direct plan inspection and verification commands.

## Standard Reviewer Findings
### reviewer
- The plan file is visibly truncated at `Evaluat` under T5 and lacks complete Wave 3 content.
- The plan lacks a `## Success Criteria` section, making it unsafe for `/do-it` execution under the workflow contract.
- Acceptance criteria for destructive snapshot retirement do not specify exact scripts, confirmation semantics, or rollback verification strongly enough.

### security-reviewer
- Snapshot deletion is too dangerous without an explicit dry-run report artifact, human confirmation prompt, and restore drill before deletion.
- Promotion candidates may contain private cross-repo facts; plan says local-only but does not require gitignore/check-ignore verification.
- Archive location is in `~/.pi/agent/index/archive/{ISO-ts}/`, but retention, collision handling, and failed-archive cleanup are not specified.

### product-manager
- The plan combines three separate concerns: promotion scanning, snapshot retirement, and backend decision. This makes execution harder to validate.
- Backend decision should not depend on snapshot retirement; it can run independently after MVP metrics are available.
- Snapshot retirement should probably be its own plan after promotion scanner and current retrieval have been used for more than one session.

## Additional Expert Findings
### typescript-pro
- `just memory-snapshot-archive --dry-run` may not be valid `just` argument syntax unless the recipe is explicitly designed to pass arguments.
- The plan does not require TypeScript parse/build checks for new scripts.
- Cross-platform commands are bash-only in validation snippets despite the plan's Windows/Git Bash constraint.

### qa-engineer
- “Restore instructions can copy archived files into a temp directory and parse them” is too weak; it does not prove Pi can actually start or read restored snapshots.
- “Full targeted memory tests pass” is ambiguous; exact tests should be listed.
- No new skipped tests should be verified mechanically against a baseline, not by visual inspection.

### backend-dev
- Promotion clustering relies on similarity threshold `0.85` but does not define text normalization, embedding/scoring source, or deterministic tie behavior in enough detail.
- Backend decision metrics are named but not defined precisely: p99 over what query set, how many runs, warm vs cold cache, and threshold for opening a backend plan.
- Snapshot deletion should verify no live code path still references `mental-model` before deleting files.

## Suggested Additional Reviewers
- `typescript-pro` -- TS/Bun scripts, `just` argument handling, cross-platform execution.
- `qa-engineer` -- restore/regression gates and skipped-test verification.
- `backend-dev` -- promotion clustering, JSONL lifecycle, and backend metric validity.

## Bugs (must fix before execution)
1. **Plan is truncated and lacks required sections.** The file ends mid-word at `Evaluat` in T5 and has no complete backend decision section, final validation, success criteria, deployment/follow-up closure, or archive instructions.
2. **No `## Success Criteria` section.** `/do-it` requires an Objective, Task Breakdown, Execution Waves, and Success Criteria. This plan has the first three but not Success Criteria.
3. **Snapshot deletion gate is under-specified for a destructive filesystem change.** T4 allows deleting live `*mental-model*.json` files but does not require a concrete confirmation prompt, code-reference grep proving no live dependency remains, or a Pi startup/read smoke after restore.
4. **Local-only promotion candidate safety is not mechanically verified.** The plan says candidates must not be committed but does not require `.gitignore`/`git check-ignore` or `git status --short` verification for `~/.pi/agent/index/policy-candidates.md`.
5. **Backend decision metrics are incomplete.** T5 names active row count and p99 but does not define measurement command, query set, warm/cold runs, or decision thresholds.

## Hardening
1. Split backend decision into an independent wave that can run before snapshot retirement or even as a separate notes-only plan.
2. Add explicit `just` recipe signatures, e.g. `memory-snapshot-archive ARGS=''` or separate `memory-snapshot-archive-dry-run` and `memory-snapshot-archive-confirm` recipes.
3. Require `grep -R "mental-model\|snapshot" pi/extensions pi/lib pi/tests` before deletion and document expected remaining references.
4. Require restore smoke to run against a temporary `PI_HOME`/test profile, not just parse JSON files.
5. Define promotion text normalization and scoring backend before threshold tests.
6. Add pwsh equivalents or `just` wrappers for every validation command.
7. Require no-new-skips verification using pre/post vitest summary comparison.
8. Add archive retention and collision policy.

## Simpler Alternatives / Scope Reductions
1. First fix the plan file, then execute only Wave 1 promotion scanner.
2. Make snapshot retirement a separate plan after promotion scanner proves useful and retrieval runs cleanly in more than one real session.
3. Make backend decision a standalone notes/research artifact; do not gate it on deletion work.

## Contested or Dismissed Findings
1. **Dismissed: implement scalable backend immediately.** The current plan correctly avoids backend implementation by default.
2. **Downgraded: promotion scanner is inherently unsafe.** It can be safe if strictly local-only, ignored, and human-reviewed; the issue is missing mechanical verification.
3. **Dismissed: keep snapshots forever.** Keeping them temporarily is safer, but eventual retirement is reasonable if restore and regression gates are strong.

## Verification Notes
1. Truncation verified by reading `.specs/pi-memory-followups/plan.md`; line 208 ends with `Evaluat`.
2. Missing Success Criteria verified by searching the plan; no `## Success Criteria` heading exists.
3. Snapshot deletion risk verified in T4 acceptance criterion #2: it requires no live `*mental-model*.json` files after confirm mode but lacks code-reference and startup smoke requirements.
4. Promotion local-only gap verified in T2 acceptance criteria: path and warning are checked, but git ignore/status verification is absent.
5. Backend metrics gap verified in T5: it begins “Do not implement a backend swap by default. Measure and document.” but the section is truncated before metric definitions.

## Review Artifact
Wrote full synthesis to: `.specs/pi-memory-followups/review-1/synthesis.md`

## Overall Verdict
**Fix bugs first**

## Recommended Next Step
- Repair and complete the plan before execution.
- Then re-run review or execute after fixes.

Apply options:

1. Apply bugs only (Recommended — 5 fixes, all mechanical edits to the plan)
2. Apply bugs + selected hardening — pick which
3. Apply everything (bugs + 8 hardening)
4. No changes — review only

Next-step command:
`/do-it .specs/pi-memory-followups/plan.md`

How do you want to proceed?

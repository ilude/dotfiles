---
date: 2026-05-11
status: synthesis-complete
---

# Review: Consolidated Pi Control Plane Cleanup

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle | Artifact |
|----------|------------|-------------------------|--------------|-------------------|----------|
| reviewer | reviewer | Completeness & explicitness reviewer | Mandatory standard reviewer | Cold `/do-it` session will fail on missing context | `.specs/pi-control-plane-consolidation/review-1/reviewer.md` |
| security-reviewer | security-reviewer | Safety and rollback reviewer | Mandatory standard reviewer | Config/archive/task persistence changes can damage state | `.specs/pi-control-plane-consolidation/review-1/security-reviewer.md` |
| product-manager | product-manager | Scope and simplicity reviewer | Mandatory standard reviewer | Consolidation may overbuild instead of sequence MVPs | `.specs/pi-control-plane-consolidation/review-1/product-manager.md` |
| typescript-pro | typescript-pro | Pi TypeScript extension and command-surface reviewer | Pi extension commands/tools are central | Implementers may create unintended extension files or miss registration contracts | `.specs/pi-control-plane-consolidation/review-1/typescript-pi-extension-reviewer.md` |
| backend-dev | backend-dev | Task registry state-transition and persistence reviewer | Durable registry/dependency graph work is central | State updates may corrupt graph or report false success | `.specs/pi-control-plane-consolidation/review-1/backend-state-reviewer.md` |
| qa-engineer | qa-engineer | Automation-readiness and regression coverage reviewer | Plan requires many focused tests/evidence gates | Cold executor may skip ambiguous checks | `.specs/pi-control-plane-consolidation/review-1/qa-automation-reviewer.md` |
| ux-researcher | ux-researcher | Pi operator workflow and command ergonomics reviewer | User-facing command surfaces change | Users may be surprised by removed/changed commands | `.specs/pi-control-plane-consolidation/review-1/operator-ux-reviewer.md` |

## Standard Reviewer Findings
### reviewer
- Missing required plan sections (`Task Breakdown`, `Execution Waves`, `Success Criteria`, `Validation Contract`) make `/do-it` readiness weak.
- `or equivalent` subagent discovery is ambiguous.
- Focused validation lacks exact commands and evidence names.

### security-reviewer
- Agent cleanup can leave stale `pi/multi-team/agents` definitions in runtime discovery.
- Tool restriction changes lack recovery/admin validation.
- Archive and evidence movement needs a manifest and secret scanning.
- Task persistence needs atomic writes and corruption recovery.

### product-manager
- Task-control-plane scope is too large for one MVP wave.
- Removing `/team` before equivalent subagent dispatch is proven risks workflow breakage.
- A single redaction API is needed rather than scattered checks.
- Full `make check` every iteration may be overkill; final gate still needs repo-wide validation.

## Additional Expert Findings
### typescript-pro
- `pi/extensions/agent-team.ts` currently registers `team`; removal must disable the auto-discovered extension path, not just docs.
- The plan does not define the exact registered `subagent` team/lead interface.
- Task tools module placement and tool naming conventions are unspecified.
- `/tasks create/show/list` must test secret ingress through registered command/tool paths.

### backend-dev
- `skipped` lifecycle semantics are undefined.
- Dependency graph updates over one-file-per-task storage need atomic multi-record behavior.
- Legacy migration/backfill behavior is underspecified.
- Mutating tools/commands must not emit success on failed persistence.
- Tombstone dependency semantics are missing.

### qa-engineer
- Focused test commands and evidence names are absent.
- Grep checks need active-source vs archive allowlists.
- Checklist lacks a durable per-item evidence ledger format.
- Archive must be a final gated move, not an early action that breaks resume.
- Subjective pass criteria need fixtures and expected outputs.

### ux-researcher
- Removing `/team` without migration messaging may surprise users.
- `/tasks` changes need backward-compatibility/help checks.
- Declined/ambiguous routing messages need exact actionable content.
- Manual validation should cover command discoverability and hidden-mode recovery.

## Suggested Additional Reviewers
- typescript-pro -- relevant for Pi extension auto-discovery, registered tools, and pnpm validation.
- backend-dev -- relevant for durable task state, migrations, dependency graph invariants, and persistence outcomes.
- qa-engineer -- relevant for automation readiness, exact validation commands, and evidence gates.
- ux-researcher -- relevant for operator command changes and migration messaging.

## Bugs (must fix before execution)
1. Missing plan sections required by the review workflow and `/do-it` readiness make the plan non-standalone.
2. `/team` removal is unsafe/ambiguous because `pi/extensions/agent-team.ts` currently registers `team`; the plan must require disabling that registration and proving absence through extension registration tests.
3. The subagent team/lead interface is undefined; implementers do not know whether to add tool fields, a slash command, or helper-only behavior.
4. Task persistence/dependency mutation semantics are under-specified; one-file-per-task updates need atomicity, rollback/recovery, tombstones, and no false success outcomes.
5. Focused validation lacks exact commands/evidence names, allowing false completion.
6. The task MVP is too broad for reliable execution unless phased into foundation first and tools/UX second.
7. `skipped` lifecycle and dependency-unblocking semantics are missing.
8. Archive/move operations need a manifest and active-vs-archive allowlists to avoid deleting evidence or treating historical references as active failures.

## Hardening
1. Define a single task sanitizer/redactor API and require every persistence/render/tool/command ingress/egress path to call it.
2. Add an emergency/admin recovery check for lead/tool restriction changes.
3. Add explicit operator migration/help messages for removed `/team` and changed `/tasks` behavior.
4. Make branch support contract explicit, including Ghostty fallback-only unless implemented.
5. Add a durable evidence ledger format after each checklist item.

## Simpler Alternatives / Scope Reductions
1. Split task work into foundation first (`TaskCreate/List/Get/Update`, lifecycle, persistence) and defer dependency graph/display modes if foundation gates fail.
2. Use add-and-verify sequencing for subagent team dispatch before removing `/team`.
3. Treat unsupported `/branch` terminals as fallback-only instead of implementing every terminal adapter now.

## Automation Readiness
- Agent-runnable operational steps: not ready; needs exact focused commands and task breakdown/dependencies.
- Credential/auth flow clarity: mostly not applicable; secret/evidence handling needs stronger fake-token scans.
- Evidence and archive gates: present but too vague; needs named evidence files, archive manifest, active-source grep allowlists.
- Manual-only steps and justification: `/branch` manual validation exists but command-discovery/manual UX validation is incomplete.
- Execution Checklist: exists, but needs alignment with Task Breakdown, Execution Waves, Success Criteria, and Validation Contract.

## Contested or Dismissed Findings
1. UX reviewer requested a `/team` deprecation alias. This conflicts with the original requirement to remove `/team` as an active surface. Applied fix should require non-command migration docs/help and optional explicit error only if it does not preserve `/team` as an active workflow.
2. Product recommendation to make `make check` non-blocking was downgraded. Repo instructions require strong validation; keep `make check` as final gate but use focused/Pi tests for iterative gates.

## Verification Notes
1. Confirmed missing sections with `grep -n '^## ' .specs/pi-control-plane-consolidation/plan.md`; only Context, Objective, Constraints, Non-Goals, Execution Checklist, Validation Commands, Execution Status existed.
2. Confirmed active `/team` registration with `grep -n registerCommand.*team pi/extensions/agent-team.ts`, which reports `pi.registerCommand("team")` at line 169.
3. Confirmed subagent implementation path with `find pi/extensions -maxdepth 2 -type f -path '*subagent*'`; actual path is `pi/extensions/subagent/index.ts`, making `subagent.ts or equivalent` ambiguous.
4. Confirmed current task states omit `skipped` by reading `pi/lib/operator-state.ts`; states are pending/running/blocked/completed/failed/cancelled.

## Reviewer Artifact Status
| Reviewer | Artifact | Status | Notes |
|----------|----------|--------|-------|
| reviewer | `.specs/pi-control-plane-consolidation/review-1/reviewer.md` | read | initial artifact write failed; recovered with constrained artifact writer |
| security-reviewer | `.specs/pi-control-plane-consolidation/review-1/security-reviewer.md` | read | preview truncation ignored because artifact was usable |
| product-manager | `.specs/pi-control-plane-consolidation/review-1/product-manager.md` | read | preview truncation ignored because artifact was usable |
| typescript-pro | `.specs/pi-control-plane-consolidation/review-1/typescript-pi-extension-reviewer.md` | read | preview truncation ignored because artifact was usable |
| backend-dev | `.specs/pi-control-plane-consolidation/review-1/backend-state-reviewer.md` | read | preview truncation ignored because artifact was usable |
| qa-engineer | `.specs/pi-control-plane-consolidation/review-1/qa-automation-reviewer.md` | read | preview truncation ignored because artifact was usable |
| ux-researcher | `.specs/pi-control-plane-consolidation/review-1/operator-ux-reviewer.md` | read | preview truncation ignored because artifact was usable |

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unavailable | 7 reviewers launched; per-reviewer timing unavailable |
| Artifact reads | unavailable | all expected reviewer artifacts read after one recovery |
| Recovery calls | unavailable | reviewer artifact recovered via constrained tool |
| Verification | unavailable | grep/read checks for headings, `/team`, subagent path, task states |
| Synthesis | unavailable | `.specs/pi-control-plane-consolidation/review-1/synthesis.md` |

## Auto-Apply Plan
- Applied fixes artifact: `.specs/pi-control-plane-consolidation/review-1/applied-fixes.md`
- Known-blocker fixes artifact: not run/no prior blockers
- Section integrity check: passed (`Objective`, `Task Breakdown`, `Execution Waves`, `Success Criteria`, `Validation Contract`, `Execution Checklist`, and `Execution Status` each appear exactly once)
- Standalone-readiness result: STANDALONE READY
- Repair passes used: 0

## Review Artifact
Wrote full synthesis to: `.specs/pi-control-plane-consolidation/review-1/synthesis.md`

## Overall Verdict
**Ready to execute after auto-applied plan fixes**

## Recommended Next Step
- Execute via `/do-it .specs/pi-control-plane-consolidation/plan.md`.

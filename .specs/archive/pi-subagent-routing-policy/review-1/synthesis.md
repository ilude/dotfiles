---
reviewed: 2026-04-17
plan: .specs/pi-subagent-routing-policy/plan.md
reviewers: completeness, adversarial, simplicity, planning-lead, engineering-lead, validation-lead
---

# Plan Review: Pi command-aware subagent routing policy

## Summary

The plan captures the right high-level architectural intent, especially the distinction between command routing and freeform prompt classification. But it is not safely executable as written: several tasks do not produce named artifacts, the wave sequencing leaves a key dependency ambiguous, and the validation strategy mostly proves that text exists rather than that the architecture questions were actually answered. Fix those issues first, then the plan becomes a solid handoff document for later implementation.

## Bugs (must fix before execution)

| # | Finding | Location | Impact |
|---|---------|----------|--------|
| B1 | Core tasks do not name the design artifact(s) they must produce | T1, T2, T3, T4; both validation gates | Downstream tasks and validators cannot reliably tell whether the required architecture outputs exist or are complete |
| B2 | Wave 2 parallelizes rollout planning before the subagent policy is fully defined | T3, T4, Wave 2, dependency graph | The rollout plan can be written against incomplete or wrong policy decisions, causing rework or contradictory guidance |
| B3 | Validation and success criteria are mostly manual or string-presence checks | Acceptance Criteria across T1-T4, V1-V2, Success Criteria | The plan can “pass” even if the actual routing design is weak, inconsistent, or unusable for future implementation |

### B1: Missing concrete deliverables for architecture tasks

**Finding:** The plan asks T1-T4 to document, design, define, and specify important routing decisions, but it never says what exact artifact each task must create or update. Validators are then forced to rely on vague “manual review of the design artifact” checks without a stable filename or section target.
**Location:** T1, T2, T3, T4 and the validation gates that reference “the design artifact,” “resulting design/spec artifact,” and “rollout plan.”
**Impact:** Builders can complete the tasks in incompatible ways, validators cannot consistently verify completion, and future implementers may still lack the specific architecture document needed to resume work later.
**Fix:** Name the exact deliverable for each task (for example, `.specs/pi-subagent-routing-policy/design.md`, `subagent-policy.md`, or dedicated sections inside `plan.md`) and update each validation gate to check those specific artifacts.

### B2: Wave 2 sequencing is underspecified and likely wrong

**Finding:** T4 (“Specify rollout plan and migration sequence”) runs in parallel with T3 (“Define subagent routing policy”), but the rollout sequence logically depends on the policy decisions produced by T3. Several reviewers flagged that the migration plan is likely to bake in assumptions before the per-command and per-role policy is settled.
**Location:** T3, T4, Wave 2, and the dependency graph.
**Impact:** The rollout plan may be internally inconsistent, require immediate rewrite, or endorse a migration order that does not fit the final routing policy.
**Fix:** Make T4 depend on T3 (or explicitly split T4 into a preliminary skeleton plus finalization after T3). Update the task table, wave definitions, and dependency graph so the sequencing matches the actual information flow.

### B3: Validation is too weak to prove the plan outcome

**Finding:** Most acceptance criteria use manual review or simple `rg`/`test -f` checks. Those can succeed even if the design is shallow, contradictory, or fails to answer the stated architecture problem. The current success criteria only prove that the spec file exists and contains certain words, not that it is a usable routing policy plan.
**Location:** Acceptance criteria for T1-T4, V1, V2, and both Success Criteria items.
**Impact:** The plan can be marked complete without actually producing a reliable command/subagent routing architecture, making future implementation stall or drift.
**Fix:** Replace some manual checks with artifact-specific review criteria: require a command-to-policy matrix, required APIs, explicit open-questions section, per-command parent/subagent routing tables, and migration-stage verification checklists. Update success criteria to verify those concrete outputs rather than mere file presence or keyword matches.

## Hardening (recommended improvements)

| # | Finding | Location | Impact |
|---|---------|----------|--------|
| H1 | T1/T2 and T3/T4 likely duplicate work and could be merged or scoped more sharply | Task breakdown and wave structure | Medium — extra handoff overhead and repeated documentation effort |
| H2 | Some model assignments are heavier than the work described | T2, T3 | Medium — higher cost/latency without clear gain for a documentation-first plan |
| H3 | Verification commands check implementation-shaped details instead of decision quality | V1, V2, Success Criteria | Medium — increases false positives and stale-state passes |
| H4 | Preconditions for the listed test command are implicit | Project Context, V1, V2 | Low — validation may fail for environment reasons unrelated to the plan itself |

### H1: Task boundaries are more granular than necessary

**Finding:** T1 and T2 both produce architecture understanding artifacts, while T3 and T4 both extend that architecture into policy and rollout guidance. Several reviewers noted that these pairs may be separable conceptually but are not cleanly separable in output, which creates unnecessary handoff churn.
**Location:** Task Breakdown and both execution waves.
**Impact:** More coordination overhead, more opportunities for duplicated notes, and weaker ownership of the final architecture write-up.
**Fix:** Either merge T1+T2 into a single “current-state + target-state architecture” task and/or merge T3+T4 into “policy + rollout design,” or define much sharper artifact boundaries between the paired tasks.

### H2: Model sizing appears heavier than needed for some tasks

**Finding:** T2 and T3 are assigned `opus` even though the plan is documentation-heavy and bounded to a small set of known files and commands. That may be justified later, but the plan does not explain why `sonnet` would be insufficient.
**Location:** T2 and T3 model assignments.
**Impact:** Higher review/execution cost and slower planning cycles without clear evidence the extra reasoning budget is needed.
**Fix:** Either downgrade one or both tasks to `sonnet`, or add explicit justification for why `opus` is required for those specific architecture decisions.

### H3: Several checks can pass on stale or superficial outputs

**Finding:** Commands like `rg -n "resolve(Command|Prompt|Subagent)Model|text.startsWith..." pi` verify that certain strings exist somewhere, not that the right architecture was produced. This is especially risky for a future-facing design plan where placeholder text can satisfy the grep.
**Location:** V1, V2, Success Criteria.
**Impact:** Reviewers may accept incomplete work because the validation emphasizes grep hits over architectural completeness.
**Fix:** Point validators at named design artifacts and require specific sections/tables (for example command routing policy matrix, subagent role matrix, migration stages, unresolved questions) instead of broad repository-wide grep checks.

### H4: Test-environment assumptions are not stated

**Finding:** The plan declares `cd /c/Users/mglenn/.dotfiles/pi/tests && npx vitest run` as the test command, but does not state that Node/npm dependencies must already be installed and that the command is only required if implementation spikes happen.
**Location:** Project Context and both validation gates.
**Impact:** Future reviewers may read environment failures as plan failures, or skip validation because the prerequisites were never stated.
**Fix:** Add a constraint or handoff note that the Vitest command assumes the existing `pi/tests` Node environment is installed, and clarify whether it is mandatory for pure design-only execution or only after code spikes.

## Verdict

- **Bugs found:** 3
- **Hardening items:** 4
- **Recommendation:** Fix bugs first

The plan direction is good, but it needs concrete deliverables, corrected sequencing, and stronger validation before it can be safely handed to a builder.

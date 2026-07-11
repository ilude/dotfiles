# Adversarial Plan Review State Machine

Coordinate an adversarial, artifact-backed review of the path in `$ARGUMENTS`.
Default mode is **auto-apply**. If arguments contain `ask` or `--ask`, remove that
token from the path and use ask mode. If no path remains, ask for the plan path.

Do not summarize or praise the artifact. Find evidence-backed defects, hardening,
simpler alternatives, and automation-readiness gaps before execution.

## State Machine

```text
RESOLVE_ARTIFACT
  -> CLASSIFY
  -> DERIVE_REVIEW_DIR
  -> COMPOSE_PANEL
  -> LAUNCH_PANEL
  -> VERIFY_ARTIFACTS
  -> REBUTTAL_IF_NEEDED
  -> VERIFY_HIGH_SEVERITY
  -> SYNTHESIZE
  -> APPLY_MODE
  -> KNOWN_BLOCKER_QUICKFIX
  -> STANDALONE_READINESS
  -> REPORT
```

A blocked state transitions directly to REPORT. Do not skip a state unless its
entry condition says it is optional.

## Global Command Invariants
- The independent panel is always 3 standard reviewers plus at least 3 additional domain-specific expert reviewers.
- Reviewers work independently and adversarially before any rebuttal.
- Lead/coordinator agents are not reviewers. Never panel `planning-lead`,
  `engineering-lead`, `validation-lead`, `ml-research-lead`, or `orchestrator`.
- Findings distinguish substantive defect, process defect, duplicate,
  low-value/theater, and false positive. Treat severity rationale, evidence,
  required fix, and confidence as mandatory reviewer data.
- Read `templates/review-it-reviewer-prompts.md` at dispatch time. It owns the
  dispatch shape, artifact schema, finding budget, and return budget.
- Prefer `review_artifact_write`; do not silently route reviewer personas through proxy agents merely to gain write access. Proxy substitution requires user
  approval or an explicitly reported emergency degraded mode.
- Never edit implementation files. Review and apply changes only to the supplied
  artifact.
- Treat findings as prioritized backlog inputs. Applying all findings to a plan
  must not collapse migrations, stateful replacements, hardening, backup redesign,
  and orchestration changes into one rollout wave.
- Report progress at panel launch, artifact verification, synthesis, apply, and
  standalone-readiness checkpoints.

## RESOLVE_ARTIFACT
1. Parse mode and path from `$ARGUMENTS`.
2. Default to auto-apply; `ask` and `--ask` select ask mode.
3. Read the explicit path. Do not infer another artifact when it is missing.
4. If empty, stubbed, or too short for meaningful review, stop and request a
   complete artifact.

## CLASSIFY
Classify from the file name:

- `plan.md`: run the complete state machine. Extract objective, tasks,
  acceptance criteria, constraints, platforms, dependencies, and domains.
- `PRD.md`: review ambiguity, goals/non-goals, scope, contradictions,
  assumptions, testability, and readiness for `/plan-it`. Do not require task
  breakdown, waves, checklist, or archive gates. Synthesis and reporting still
  apply; plan-edit and standalone execution mechanics do not.
- Any other name: ask whether it should be treated as a plan or PRD.

For `plan.md`, assess `/do-it` readiness explicitly:

- one independent stateful service replacement per rollout wave until its direct
  endpoint and state gate passes
- current backup evidence, restore action, rollback boundary, and exact target for
  every stateful replacement
- an incident transition that blocks later rollout waves after the first failed
  live mutation until direct recovery checks pass

- runnable commands, scripts, playbooks, or wrappers for operational steps
- safe credential flow; credentials alone do not justify a manual gate
- risk level, blast radius, rollback, before/after approval decisions, and reason
- manual gates only for destructive, irreversible, shared/work/production,
  paid/data-cost, secret-exposure, hardware, or subjective-risk operations
- personal/local repository work is normally runnable when reversible and tested
- exact actions, commands, evidence, success signals, and rollback for true gates
- named non-secret evidence artifacts and explicit archive conditions
- one durable `## Execution Checklist` resume ledger

If manual-gate need remains uncertain, ask now and update the plan. Never defer
that ambiguity to `/do-it`.

## DERIVE_REVIEW_DIR
Derive `plan-name` and `review-{N}` before dispatch:

1. For `.specs/{plan-name}/plan.md`, use that immediate directory name.
2. For `.specs/archive/{plan-name}/...`, keep the review beside the archived
   artifact under `.specs/archive/{plan-name}/review-{N}/`.
3. Otherwise use the parent directory name, or file stem when needed, and place
   the review at `.specs/{plan-name}/review-{N}/`.
4. Count existing `review-*` siblings and choose the next integer.
5. Create the directory. Reserve `synthesis.md`, `applied-fixes.md`, and one
   unique deterministic artifact path per reviewer.

## COMPOSE_PANEL
Always include these standard workers:

1. `reviewer` -- completeness, assumptions, explicitness, verification
2. `security-reviewer` -- realistic safety, permissions, rollback, failure modes
3. `product-manager` -- simplicity, reuse, scope, and over-engineering

Choose at least three domain workers matching the artifact, such as
`backend-dev`, `frontend-dev`, `qa-engineer`, `devops-pro`, `terraform-pro`,
`python-pro`, `typescript-pro`, `rust-pro`, `ux-researcher`, `planner`, or a
coding tier. Keep most panels at six; add workers only for distinct cross-cutting
risk.

Every domain reviewer requires persona seeding:

- closest available base agent
- plan-specific expert persona
- why the persona matters to this plan
- exact sections or issue area to inspect
- adversarial angle and likely failure modes
- unique artifact path, including a persona slug if a base agent repeats

Never dispatch a generic instruction such as "review this plan as backend-dev."
Use a neutral prompt: do not seed reviewers with the coordinator's conclusions.
Record complexity, risk, recommended count, selected personas, selection reasons,
and expected high-risk areas for `review_panel_decision`.

## LAUNCH_PANEL
Read `templates/review-it-reviewer-prompts.md`, then make one parallel subagent
call containing the whole panel in its top-level `tasks` array. Never use
separate single calls or a chain for the independent panel.

Panel call invariants:

- `agentScope: "both"`
- `confirmProjectAgents: false`
- `modelSize: "small"` by default
- `modelPolicy: "same-family"`
- never set per-task `output: false`; omit `output` because coercion can create a
  repository-root file literally named `false`

Small panels earn their keep through breadth: six independent adversarial reads
at small size have produced verified line-level findings; do not raise the whole
panel tier by default. Escalate independent reviewers to `modelSize: "medium"`
only for an unusually large, security-critical, or architecturally risky plan.
Each task must identify
its independent worker role, persona seed, plan path, review directory, unique
artifact path, skeptical focus, and the template-owned artifact/return contract.

Report that the panel launched. Capture timing spans when available; otherwise
record wall-clock start/end for panel, recovery, verification, and synthesis.
Never invent per-reviewer timing.

## VERIFY_ARTIFACTS
After the panel returns, say:
`Review panel completed; verifying reviewer artifacts.`

Artifact files, not subagent previews, are the source of truth:

1. Verify every expected artifact path exists before reading any content.
2. Read every expected artifact before synthesis.
3. Preview truncation is harmless when the artifact is present and usable.
4. Never synthesize from preview text. If writing was explicitly unavailable,
   use inline findings only as a recorded exception in Timing Notes.
5. Missing, empty, unreadable, or structurally non-actionable artifacts are
   reviewer failures even when panel status says success.

Recover only the failed reviewer, preserving the same base agent and persona,
and prefer `review_artifact_write`. Do not rerun healthy reviewers. If exactly
one reviewer fails, make one targeted retry with the same artifact path and
return contract. If 2 or more reviewers fail for artifact-write, tooling, or
shared infrastructure/model reasons, stop as blocked. Never perform broad compact
recovery unless every artifact is unusable.

Do not rerun the full panel for verbose or truncated previews. A second full
panel is allowed only after a material plan change or explicit user request.
Record every artifact as read/missing/unusable, whether truncation was
preview-only, and why recovery did or did not run.

After successful reads, say:
`Reviewer artifacts verified; writing synthesis.`

## REBUTTAL_IF_NEEDED
Skip rebuttal unless disagreement would change verdict, required fixes, scope,
or the treatment of a HIGH/CRITICAL claim. Valid triggers include incompatible
fixes, weak outcome-changing severity, or a simplicity proposal conflicting with
specific domain safety.

Target only contested findings and only relevant reviewers. Use
`modelSize: "medium"` and `modelPolicy: "same-family"`; use `large` only when a
contested critical/security verdict depends on it. Do not debate wording or
low/medium hardening.

If suspicious unanimity favors a fashionable architecture or pattern, run one
neutral contrarian follow-up requiring concrete evidence for the opposite view.

## VERIFY_HIGH_SEVERITY
Before accepting each CRITICAL/HIGH bug, verify it against the plan and relevant
repository evidence using the cheapest adequate method: read, targeted search,
then a command only when static evidence cannot decide.

- Confirmed: retain with concrete evidence.
- Incorrect: move to Contested or Dismissed Findings as a false positive.
- Unverifiable: downgrade unless the plan proves it; label `needs human
  confirmation`.

Verify only verdict-changing bugs, not routine hardening.

## SYNTHESIZE
Read `templates/review-synthesis-template.md` immediately before synthesis. It
owns every synthesis section, including Contested or Dismissed Findings, Timing
Notes, Reviewer Artifact Status, and Auto-Apply Plan. Do not invent a parallel
structure.

Write the full synthesis to `{review_dir}/synthesis.md` before responding, with:

```markdown
---
date: YYYY-MM-DD
status: synthesis-complete
---
```

Merge duplicates; rank bugs before hardening and by impact. Group accepted
findings into safe implementation and rollout waves rather than one batch. Include
automation readiness, verified high-severity evidence, artifact/recovery status,
and actual or unknown timing. Record `per-reviewer timing unavailable` when needed.

Also record:

- `review_panel_decision` as composed above
- `review_yield`: totals for must-fix, hardening, duplicates, low-value/theater,
  false positives, applied/rejected, readiness change, and per-reviewer yield
- `panel_quality_inputs`: findings that changed task structure, validation
  commands, manual-gate decision, archive rules, or automation readiness

Say `Synthesis written; applying structured plan fixes.` before default apply.

## APPLY_MODE
### Auto-apply
Apply every verified bug, hardening item, readiness fix, and necessary clarity
change to the reviewed plan only, while preserving separate implementation and
rollout waves. First write `{review_dir}/applied-fixes.md`
with a table mapping finding, category, target sections, edit intent, and
checklist impact. Record any intentional omission and reason.

After every plan edit, run the Section Integrity Check before another edit:

- required headings occur exactly once: `## Objective`, `## Task Breakdown`,
  `## Execution Waves`, `## Success Criteria`, `## Validation Contract`,
  `## Execution Checklist`, and `## Execution Status`
- no malformed headings or duplicate large sections
- heading order remains coherent; validation precedes checklist/status
- no executable item was newly marked complete

Checklist maintenance is mandatory:

- preserve checked items and evidence unless the edit invalidates them
- never mark implementation, validation, deployment, or archive work complete
- add unchecked items for new executable tasks, criteria, and gates
- remove/retire removed pending work; explain before changing checked work
- uncheck invalidated work, mark it pending/invalidated, and explain why
- align IDs across checklist, tasks, waves, and dependency graph
- checked means verified complete; all other states remain unchecked

### Ask mode
Do not apply before user choice. Offer exactly four choices: bugs only; bugs plus
selected hardening; everything; or review only. Include counts and
`/do-it <plan-path>`. If a choice edits the plan, use the same apply-plan,
integrity, and checklist rules, then recommend `/do-it`, not another review.

## KNOWN_BLOCKER_QUICKFIX
Auto-apply only. Say:
`Synthesis written; checking prior standalone blockers before final readiness.`

If the previous review has `standalone-readiness-blockers.md`, read it and apply
only listed blocker fixes before standalone review. Do not launch a new panel.
Write `{review_dir}/known-blocker-fixes.md` with source path, each blocker,
sections edited, and omissions with reasons. Run Section Integrity Check.
If safe repair requires user/product scope input, ask and stop before readiness.

## STANDALONE_READINESS
Auto-apply only. Say:
`Plan fixes applied; running standalone-readiness check.`

Launch one final standalone-readiness reviewer with `agentScope: "both"`,
`confirmProjectAgents: false`, `modelSize: "medium"`, and
`modelPolicy: "same-family"`. This gate is a single serial reviewer, so
consolidation failures cost whole repair passes; medium is the floor, not small.
It must assume a brand-new session and verify the plan can safely and completely
run via `/do-it <plan-path>` with all context,
commands, assumptions, credentials, evidence, gates, rollback, archive criteria,
and checklist mappings. It classifies issues as `blocker`, `hardening`, or `nit`,
returns `STANDALONE READY` when no blockers exist, and does not block on
hardening/nits.

For blockers, edit only the plan, announce each repair pass, run Section Integrity
Check, and retry the same goal. Escalate every readiness recheck after a repair
pass to `modelSize: "large"` so remaining and adjacent defects are consolidated
into one pass instead of dribbling across the budget. Allow at most two repair
passes after the initial
review. Never rerun the full panel. If blockers remain, write them to
`{review_dir}/standalone-readiness-blockers.md`, mark not ready, and stop. Do not
silently continue patching.

## REPORT
Use the synthesis template for review content. This section alone owns the chat
wrapper contract.

The first line must be exactly one of:
```text
PASS: REVIEW COMPLETE: plan is ready to execute.
FAIL: REVIEW COMPLETE: plan is not ready to execute until bugs are fixed.
WARN: REVIEW COMPLETE: plan can execute, but hardening is recommended.
```

Include `## Outcome` with:

- **Status:** `READY TO EXECUTE`, `NOT READY TO EXECUTE`, or
  `READY WITH HARDENING RECOMMENDED`
- **Reason:** concise bug/hardening basis
- **Plan state:** active path and `{review_dir}/synthesis.md`
- **Recommended next action:** fixes first when needed, otherwise
  `/do-it <plan-path>`

Auto-apply reporting is concise: synthesis path, updated plan path, applied bug
and hardening counts, standalone result, and `/do-it <plan-path>`. Ask mode ends
with its four choices and question.

The final line must be exactly one of:
```text
FINAL STATUS: READY TO EXECUTE -- no must-fix bugs found.
FINAL STATUS: NOT READY TO EXECUTE -- must-fix bugs remain.
FINAL STATUS: READY WITH HARDENING RECOMMENDED -- no must-fix bugs, but hardening remains.
```

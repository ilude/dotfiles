# Agent instruction feedback log

## AIF-008 — Do not invent rollback work

- **Reference:** Operator correction during web-fetch gateway plan execution.
- **Feedback:** Plans must not include rollback steps unless the user requests them.
- **Finding:** The agent added rollback-path verification to the gateway plan and later treated it as required completion work without an operator request.
- **Decision:** Added a direct boundary to the planning skill and template, and removed rollback verification from the active gateway plan. Drift-recovery guidance is unchanged because it governs agent scope control, not product rollback.
- **Related:** AIF-002 (requirements versus proposals), AIF-003/APR-002 (bounded completion).
- **Status:** Instruction updated; behavioral effectiveness remains unverified.

Factual history for refining agent instructions. This log is not executable policy; active rules belong in the owning `AGENTS.md` or skill. Record concise operator feedback and the resulting decision without storing raw session transcripts or private task content.

## AIF-007 — Present materially different planning interpretations

- **Reference:** Operator review after comparing an AI coding-guidelines video with the default Pi profile.
- **Feedback:** The planning skill should present plausible interpretations when ambiguity could produce materially different plans instead of silently selecting one.
- **Decision:** Added one conditional sentence to the existing requirement and decision-boundary step. Discoverable facts and minor ambiguity still use repository evidence and model judgment; no mandatory format, fixed number of alternatives, or global clarification rule was added.
- **Related:** AIF-002 (requirements versus proposals), AIF-004 (narrow and flexible workflow changes).
- **Status:** Instruction updated; behavioral effectiveness remains unverified.

## AIF-006 — Keep scope rules global and testing detail in a skill

- **Reference:** Operator approval following the default-profile instruction-stack review.
- **Feedback:** Mock guidance belongs in a testing skill, not global AGENTS.md. Approved the other narrow scope and verification changes and correction of the stale global-instruction reference.
- **Decision:** Default AGENTS.md now excludes invented requirements, limits fixes to demonstrated task-relevant problems, and bounds repeated checks. Added on-demand `testing` for mock boundaries and observable behavior; corrected the root reference. Pi's built-in prompt, existing tests, and runtime remain unchanged.
- **Follow-up:** Operator approved test selection for required behavior, demonstrated defects, and credible risks in the changed path, without imagined-case expansion. Updated `testing` accordingly. Operator subsequently approved optional-work boundaries, scope-change questions, sparse phase checkpoints, and bounded cleanup/recovery in the planning skill and generated plans. Implemented in the skill and template; recovery removes agent-introduced extras without disturbing pre-existing or concurrent work and reports unsafe-to-remove leftovers at final handoff rather than routinely interrupting the user. Existing plans, global rules, and runtime were not changed in this follow-up.
- **Related:** AIF-003/APR-002 (testing churn), AIF-004 (narrow instruction changes), AIF-002 (requirements versus proposals).
- **Status:** Instructions updated; behavioral effectiveness remains unverified.

## AIF-001 — Prefer concise, plain language

- **Reference:** Operator feedback during default-profile instruction refinement.
- **Feedback:** Avoid professor-like, overly formal, or needlessly sophisticated language. Complexity should serve understanding, not demonstrate expertise.
- **Decision:** Added a communication-style rule to `pi/profiles/default/AGENTS.md`. The operator later approved extending it to chat and files: no em dashes, filler, theatrical framing, repeated apologies, or sycophancy; no flattery or agreement without evidence. Technical terminology remains appropriate when needed for precision.
- **Scope:** Default Pi profile.
- **Related incidents:** None recorded.
- **Status:** Active; effectiveness has not yet been reviewed.

## AIF-004 — Keep workflows flexible and instruction changes narrow

- **Reference:** Operator feedback during default-profile agent-process refinement.
- **Feedback:** Instructions should solve the observed problem with minimal wording, ceremony, ambiguity, and scope expansion. Workflows should retain model judgment unless a narrow factual question is straightforward enough that deterministic code provides greater value.
- **Example:** Git can deterministically list changed paths, but deciding which new files belong in a commit requires judgment.
- **Decision:** Added this principle to the `agent-process` skill for future instruction and workflow refinements. It was not promoted to the global `AGENTS.md`.
- **Scope:** Default Pi agent-process reviews.
- **Related entries:** AIF-001.
- **Status:** Active; effectiveness has not yet been reviewed.

## AIF-002 — Make implementation handoffs explicit and distinguish proposed choices

- **Reference:** Operator review of an infrastructure implementation proposal.
- **Feedback:** Asked whether the plan had Markdown checkboxes and clear steps that a smaller model could follow from fresh context without filling gaps with poor choices or invented requirements.
- **Finding:** The inspected proposal had numbered phases but no task checkboxes. It left contracts and implementation choices incomplete and included assistant-proposed defaults that were not operator-supplied requirements.
- **Decision:** Describe the document as an architecture proposal, not an execution-ready handoff. A task-local revision should separate requirements, proposals, and unresolved decisions; specify inputs, outputs, dependencies, checks, and evidence for each step. No global instruction change is needed for this review.
- **Scope:** Implementation-plan handoff quality; not authorization to implement or deploy.
- **Related entries:** AIF-001 (plain language); APR-001 (continuation and completion evidence, a different observed failure). These entries do not establish recurrence of this planning gap.
- **Status:** Operator authorized the task-local conversion and reusable planning skill in AIF-005. The plan now has checkbox tasks and explicit proposal/decision boundaries; fresh-context execution quality remains unverified.

## AIF-003 — Stop expanding verification

- **Reference:** Damage Control implementation follow-up about testing churn.
- **Feedback:** Prevent open-ended edge-case hunting; use plain language.
- **Decision:** Operator approved adding: “Test what the task needs. Fix problems you find, but don’t keep hunting for more. Stop when the agreed checks pass.” It was added under Proportionality in the active default profile's `AGENTS.md`. Operator also approved a bounded remaining-work list in the implementation plan.
- **Scope:** Default profile instructions; Damage Control plan execution. No additional global rules proposed.
- **Related:** AIF-001 (plain language), AIF-002 (clear finish criteria), APR-002 (observed churn).
- **Status:** Rule and plan changes recorded; future adherence remains unverified.

## AIF-005 — Keep profile-aware plans in specs and archive completed work

- **Reference:** Operator follow-up to the fresh-context plan review.
- **Feedback:** Move the plan to `.specs/<stub>/plan.md`; capture concise planning guidance in a new profile skill using agent-process context. Completed plans must carry an internal completion date and move to `.specs/archive/`. Record relevant execution Pi profiles.
- **Decision:** Added default-profile `planning` with a small template, ordered task/evidence guidance, requirement/proposal separation, profile provenance, and model-directed completion/archive instructions. Moved and rewrote the requested plan only; no automatic archiver, global AGENTS change, or bulk migration of old plans.
- **Scope:** Plan authoring, maintenance, resumption, and closeout. Not authorization to implement the planned system, deploy, commit, or push.
- **Related entries:** AIF-002 (handoff gaps), AIF-001/AIF-004 (concise and flexible instructions), AIF-003/APR-002 (bounded verification), APR-001 (continuation).
- **Status:** Installed Pi loader discovered the default planning skill without related diagnostics; local links, ten ordered unchecked plan tasks, and removal of the old plan copy were checked. Smaller-model execution and real completed-plan archival remain unverified.

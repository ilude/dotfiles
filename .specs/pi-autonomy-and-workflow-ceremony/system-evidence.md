# Evidence for the system-wide investigation

This second pass is organized around how work and policy expand, not around the goal startup defect. Cases were selected to contrast different mechanisms; they do not establish prevalence or comparative model performance. Session entry IDs are local evidence locators, not claims about current live systems. No commands from the historical transcripts were executed in this investigation.

## Selection and limitations

Two bounded queries of `friction_reviews` selected recent summaries, followed by exact transcript inspection. The first returned 24 recent entries (many null summaries and repeated sessions); the second selected the latest non-null review per session from 2026-08-25 through 2026-09-04, returning 18 rows. Each scanned one approximately 2.70 MB file. Reviews only located candidates. A synthetic-looking `session-review-bounds` entry was not treated as a real user case. Related inherited transcript entries were not counted as independent work.

The reviews are fallible: one labelled this investigation completed before the user rejected its narrow scope. An Angular-design review described alignment, but the actual response also introduced a detailed Definition of success. Outcome labels are therefore not accepted without examining the conversation.

## C1: Direct Git work needs no artificial workflow

Session `01a06db9-710f-74b4-8b16-59b583bbcaea`, entries `2c6c3f2f`, `b6530581`, `b4b9bfd4`, `a7f01ca2`.

- Request: create a local tracking branch for an identified remote branch and switch to it.
- Observed sequence: inspect current Git/branch state, perform the requested switch, inspect resulting status, report completion.
- Direct tool output confirms branch creation, tracking, and clean status.
- No plan, root task, review, generic test suite, new instruction, or archive ceremony appears in this bounded sequence.

Interpretation: target inspection and result verification provide the protection this operation needs. A universal plan/delegation/test/closeout pipeline would add work without addressing another demonstrated risk. This is not a recommendation to skip target checks.

## C2: Clarifying the actual objective changes the solution space

Same session, distinct design discussion: `d6a1aa17`, `829af513`, `9c136ab0`, `a2b64786`, `39aed4f7`.

- Initial question: investigate removing a UI dependency. Source inspection and bounded specialist inspection followed.
- User later identified the actual objective as easier Angular upgrades, and explicitly raised characterization tests.
- The response then compared keeping/upgrading the dependency, direct replacement, application-owned boundaries, and an incremental hybrid. It explained why removing all abstractions or changing all callers at once was not necessarily best.
- No replacement implementation was performed in this inspected discussion.

Positive lesson: outcome clarification can delete unnecessary work before it becomes a plan. Alternatives were materially different, not a mandatory format exercise.

Qualification: the same response stated a new detailed Definition of success, including complete dependency removal and architectural concentration. Those are recommendations, not automatically accepted requirements merely because the broader objective was supplied. A useful design response can still harden its chosen means into apparent obligations. The transcript does not establish a later unauthorized implementation of those recommendations.

## C3: Deletion can retire the entire local maintenance burden

Session `01a06a68-2266-7edd-9952-a19aaaac423a`, entries `3a7b5e25`, `b9134f10`, `e4f2f14a`.

- User asked what the unused custom provider command did and whether it needed cleanup.
- Inspection identified overlap with built-in authentication/model commands and a stale parallel credential-management surface.
- Recommendation was deletion of the extension, its tests, and documentation, not refinement of its UI bells or provider catalog.
- The user authorized removal. Git commit `65edd715` records removal of the redundant provider credential command.

Interpretation: compare the custom feature's whole ongoing value against an existing maintained capability. Do not preserve a thin wrapper because it has tests or one mildly unique feature. Exact current authentication behavior was not revalidated here; this case demonstrates the accepted deletion decision and its history.

## C4: Real consequential ambiguity needs conversation, not automatic elaboration

Session `01a06cb7-b1ea-7169-ba73-1d40a7ed05c4`.

- `22d17c12`: initial question about allowing users some cluster operations.
- `dc0d32f8`, `c4c124cb`: user distinguished destructive-operation risk from other access concerns and permitted some development-environment restarts.
- `a14bfad9`, `d3cb42ef`: user challenged two authorization sources and clarified the desired owner.
- `c3c6845b`, `06580a0a`: after understanding the identity prerequisite, the user reconsidered the approach.
- `f9bfc3cb`, `dcdebcd2`: lockout and cluster access scope were explicit concerns.
- `3c5f164a`, `f630ea8b`: user explicitly requested Windows setup convenience and multiple configurations.
- `ccf2fac8`: user requested a durable implementation plan and investigative tests to preserve the understanding across compaction.

Interpretation: substantial planning, compatibility checks, restricted rollout, and durable notes are warranted here. Much of the expanded scope came from explicit user decisions. It must not be removed as ceremony simply because it is complex.

Failure opportunity: the technical identity/account prerequisite was understood late, after several designs had been presented confidently. Front-load the facts and tradeoffs that would change the user's choice; do not prematurely converge and repeatedly rebuild the design. This is comprehension and communication work, not a reason to add a universal authorization-design questionnaire.

Independent review output `4523d74b` identified a real contradiction: a configuration placement was simultaneously confirmed, a proof gate, and an open question. That illustrates a useful review contribution. The later positive review is not proof of a live rollout; none is claimed here.

## C5: A local complaint becomes both broad repair and durable policy

Session `01a06cf6-a913-7ee6-b262-bcc5a6f948fc`, bounded to the September 4 diagnostics/anti-churn discussion, not its inherited initial planning history.

- `08ef46d6`: user explicitly requested fixing missing model-visible extension errors across custom extensions and adding owning skill guidance. The broad audit and instruction update were authorized; they were not automatically invented.
- `28db1e11`: response restated this as an eight-part requirement, adding a behavioral parity test as item 7.
- `1a206202`: user challenged the need for that extra proof. This is direct evidence that a proposed implementation/testing choice was presented as part of the requirement before its necessity was settled.
- `769a813a`, `4ac887f8`: user rejected test/check churn and asked for guidance that still validates work without chasing imagined problems.
- `34b16798`: initial recommendation used contextual evidence validity, coherent slices, and relevance to acceptance rather than a global ban on early checks.
- `abd1839c`, `983d345f`, `520a063d`: user repeatedly asked for a whole-system view rather than another narrow quality-gate fix.
- `0ad235c3`, `58b3167a`: user rejected tests that assert contract text.
- `644015a3`, `e1ec78e0`: discussion of completed prose cleanup distinguished direct content inspection from irrelevant TypeScript tests.
- `90ce7106`: user asked to carry the useful lesson into future plans when it makes sense.

Interpretation: the user sometimes explicitly asks for durable learning. The error is not always unsolicited policy editing. The critical transformation is from a conditional lesson to a compulsory general procedure, and from a proposed means of verification to a claimed requirement. Keep the qualification "when it makes sense" rather than implementing a stronger universal schedule.

The same session contains direct approval of clearing the session when starting a plan (`2e5e5d1b`). Existing session-handoff complexity is partly the cost of a requested feature, not wholly invented machinery. Simplification must distinguish removing an unnecessary prerequisite from deleting a convenience the user actually uses.

## C6: Verification-only outcomes can hide a remaining operator decision

Session `01a06d1b-93a1-7421-be7b-a4814dc0ba28`, entries `f4be47d7`, `34168a9b`, `ad9dd547`.

Selected metadata shows bounded work followed by an explicit request to merge and complete. This supports treating Git closeout as a distinct requested operation, not an implicit obligation of every coding request. This case was not deeply re-audited because C1 and the existing workflow preservation tests already establish the relevant direct-operation pattern. No independent claim of current merge health is made.

## H1: Validation policy repeatedly changed direction

Direct Git history, not inferred from commit volume:

| Commit | Observed policy change | What it establishes |
| --- | --- | --- |
| `d485d97e` (July 22) | Report validation outcomes without automatic repairs; mark unsuitable validators nonautomatic | Earlier report-only design existed |
| `e0a0c474` (August 12) | Add deterministic autofix, bounded active/delegated model repair, no-progress guard, opt-out attribute, and repair telemetry | A reporting system became an additional work initiator with its own recovery policy |
| `497fad73` (September 4) | Remove model repair turns; retain report-only settlement for surviving failures; refine planning validation timing and review rubric | Partial deletion plus more workflow guidance |
| `65aedd54` (September 5) | Disable all shipped automatic command validators; prescribe root-only final validation and shared one-repair allowance across workflows/skills/agents/tests | Control moved from automatic execution into compulsory instruction-level scheduling |

The current contract says settlement does not run validators or fixes under shipped policy. Source `pi/extensions/quality-gates.ts:1019-1050` still collects successful file mutations and processes settlement batches; `automaticSkipReason` skips explicit-only validators. Low-level validator execution remains available to explicit callers.

Conclusion: removing automatic repair did not necessarily remove the higher-level assumption that a universal process should control validation. Policy can move between code, configuration, and prompts without reducing what the operator and agent must manage. This history does not prove that every intermediate change lacked user authorization or that all validation infrastructure should disappear.

## H2: A simplification preference became an algorithm, then was relaxed

- `2d94583c` (September 3) changed solution selection into an ordered ladder: reuse repository, standard library, platform, installed dependency, one line, then custom code; stop at the first sufficient rung.
- `0097a0d3` (September 5) removed that universal rank. It restored fit, caller complexity, complete solutions, and necessary restructuring, using smaller changes as a tie-breaker.

This is a separate policy loop from validation. The first mechanism can favor an insufficiently comprehensive local reuse even when a deeper correction is better. The later change is useful counterevidence: removing an overprecise rule restores judgment without a new runtime gate. No comparative performance effect is claimed.

## H3: Consolidation is not the same as removing obligations

`55b5bea7` consolidated guidance across root/Pi/skills/workflows. The associated prose-cleanup discussion measured word count, prohibited phrases, and retention of existing exceptions. `plan-it.md` still requires standard-mode review bookkeeping, a final subtractive review, a verification rubric for each task, and fixed validation timing.

A shorter or single-owner instruction can remain an unnecessary requirement. Single ownership prevents drift, but does not decide whether the obligation should exist. Tests and document contracts can preserve a procedural preference after its original context is forgotten.

## Exact file locators

- C1/C2: `C:/Users/mglenn/.pi/agent/sessions/--C--Projects-Work-Gitlab-eisa--/2026-09-04T18-41-04-783Z_01a06db9-710f-74b4-8b16-59b583bbcaea.jsonl`
- C3: `C:/Users/mglenn/.pi/agent/sessions/--C--Users-mglenn-.dotfiles--/2026-09-04T03-13-24-582Z_01a06a68-2266-7edd-9952-a19aaaac423a.jsonl`
- C4: `C:/Users/mglenn/.pi/agent/sessions/--C--Projects-Work-Gitlab-gitlab-helm--/2026-09-04T13-59-33-098Z_01a06cb7-b1ea-7169-ba73-1d40a7ed05c4.jsonl`
- C5: `C:/Users/mglenn/.pi/agent/sessions/--C--Users-mglenn-.dotfiles--/2026-09-04T15-08-19-603Z_01a06cf6-a913-7ee6-b262-bcc5a6f948fc.jsonl`
- C6: `C:/Users/mglenn/.pi/agent/sessions/--C--Users-mglenn-.dotfiles--/2026-09-04T15-48-38-946Z_01a06d1b-93a1-7421-be7b-a4814dc0ba28.jsonl`

The original goal and repair-limit cases remain in findings.md as supporting examples. They are not the scope of this second-pass conclusion.

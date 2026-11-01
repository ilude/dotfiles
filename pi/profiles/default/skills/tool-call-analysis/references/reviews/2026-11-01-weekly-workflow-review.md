# TCA-018: Weekly session and feedback-system review

Review date: 2026-11-01. Investigation and evidence records only. Recommendations are not implementation authority.

## Scope and coverage

- Default-profile Pi history stored on this machine, fixed event interval `[2026-10-25T20:49:53.806Z,2026-11-01T20:49:53.806Z)`. Historical legacy data, independent Claude transcripts, and other clients were not inspected. No external upload or peer communication.
- Native analytics catalog and paged user-message searches were followed by the supported read-only parsed-JSONL fallback. Intermediate native search traversals were partial and are not the basis of the complete-input claim. Codemode small-state limits and a native follow-up output bound made bounded direct extraction more useful for this review.
- The primary fallback traversed all 514 local default session files, 1,793,611,555 bytes and 116,141 parsed records, with per-file byte horizons. No malformed lines, invalid headers, read errors, unavailable timestamps, or size/mtime changes were reported during that pass.
- The interval contained 89,306 stored records in 399 session files: 335 with a matching own-session subagent-lineage marker and 64 without one. Unmarked does not prove operator-only origin. User-role messages include scheduled prompts and peer/task messages, so no operator correction rate is claimed.
- There were 15,929 stored tool results, including 787 flagged `isError`. These are not tool-defect counts. Forked/inherited records can duplicate events. Signature triage and selected contextual review followed complete parsed-input traversal; this is not semantic review of every message or adjudication of all flagged results.
- A supplemental signature scan collapsed copies by persisted record ID, timestamp, and tool-call ID, selecting the earliest containing session-header timestamp as representative. Counts below are narrow signatures, not an exhaustive failure inventory. Initial broad matches, including ordinary test output mentioning overlap, were discarded rather than promoted into defects.
- Read classification feedback TCF-001 through TCF-006, relevant TCA-017 evidence, current agent-process/planning guidance, recent feedback/failure entries, relevant runtime source, and current survival-demo continuity/visual guidance. A read-only explorer reconciled feedback records and project guidance; parent owns this synthesis.

## Recommended improvements

### 1. Make terminal partial subagent results unmistakable

**Category:** Lifecycle presentation and caller interpretation, with child output-quality failures kept separate.

Existing `APR-subagent-partial-mistaken-for-running` records three settled research children whose prose was mistaken for ongoing work. The current `lib/subagents/status.ts` still labels ordinary settled partial results simply `partial`; it does not explicitly say that the assignment ended or that more work needs a follow-up. Its timing distinguishes duration from elapsed, but that is an indirect cue.

This review independently encountered two terminal partial reports from child session `01a198e0-ec38-75de-8bcd-c468bbba1aac`. One promised later synthesis after its process had ended. Explicit follow-ups recovered the requested final report. These events occurred after the cutoff and are not included in weekly counts. Parent did not misreport those partials as live work.

**Proposed remedy:** Implement the existing narrow proposal in outcome presentation: explicitly distinguish assignment-settled partial/blocked outcomes from live progress and pending parent questions, show resource state only when observed, and explain follow-up requirements. Do not auto-retry, poll, retain idle processes, or treat a clearer notification as a cure for weak child output.

### 2. Resolve the ordinary-planning continuation ambiguity

**Category:** Specific instruction conflict/omission, not general permission failure.

`AIF-planning-to-ready` remains a proposal. Current `skills/planning/SKILL.md` requires discoverable technical investigation and consequential clarification, but ends with “Fix consequential gaps, then stop” and permits a draft with open decisions without an explicit sequential question-and-answer continuation loop. `APR-herdr-plan-false-authorization-blocker` separately records asking for permission where technical planning was unfinished.

**Proposed remedy:** Consolidate the owning planning skill/template so ordinary planning investigates, asks one consequential question with explanation and a recommendation, incorporates the answer, and continues to executable readiness. Preserve intentionally requested drafts, genuine external blockers, and the distinction between planning and execution. No new global rule, checklist, review gate, or automatic implementation.

### 3. Diagnose the newer repository-scoping failure in `/commit`

**Category:** Verified invalid reviewer plan; why it was produced remains unresolved.

On October 31, parent session `01a19335-cbf7-7294-b4db-f1a7b11a49ce`, custom result near line 139 and operator correction `d760535b` at line 142, reported a plan for `modules/homelab-infra` containing dotfiles-root paths. Validation rejected unknown paths and no valid replacement plan was submitted. Requested earlier feature commits had already been published; this failing invocation performed no new pushes.

The existing reviewer prompt already says to work only in the current repository for each pass (`commands/commit/reviewer.ts`, current repository prompt). Thus the evidence does not justify another generic repository-boundary reminder or weakening validation.

This is distinct from October 28 parent `01a17f0e-32f5-77bf-b51d-8d4635622c17`, custom result near line 736 and operator correction `7d940a9c` at line 740: no new commits accompanied a misleading `Pushed` label. `APR-commit-unfinished-success` records the structured runner remedy now present in source. Different symptoms are not proof of one recurring root cause or regression of that remedy.

**Proposed next step:** Inspect the repository-scoped reviewer context and submission/retry path for the October 31 case before choosing a code or prompt fix. This review does not establish the exact loaded version, private model sequence, or a new live reproduction.

### 4. Carry forward the narrow analytics renderer repair

**Category:** Previously observed isolated, high-impact runtime/UI defect, not a new weekly recurrence.

TCA-017 records the October 20 child crash at `args.profiles?.join is not a function`. Current `lib/log-analytics/render.ts` still casts raw renderer input and calls `args.profiles?.join(...)` without verifying its shape. Ordinary valid calls working here do not establish safe rendering of partial or unexpected input.

**Proposed remedy:** A narrowly scoped renderer robustness fix. No new permissions or feedback-system gate. The historical in-flight argument and live reproduction remain unavailable; no second crash in this week was established.

## Additional evidence, not blanket policy changes

- Seven distinct failed readiness notifications in one parent, `01a17de6-f956-7574-bad4-16819c300ebd`, October 30, including `f95bfcd7`, `592086ff`, `ef68fcb0`, `32a884c9`, and `964b94de`, reported `Visible child did not become ready`. Some cleanup notices also said the pane was not owned. This is a high-impact within-session loop, not seven independent sessions or a proven shared cause. TCA-017 supplies older independent readiness evidence. Exact startup/ownership diagnosis is justified; increasing deadlines or blaming models is not.
- Fourteen narrow non-unique-edit signatures in 13 representative sessions establish recurring caller mistakes. Examples: `01a17400-7b3a-72fb-a99f-1d8ec04d6af9` / `acfeccac` and `01a175e1-e33d-7669-a908-33737d516d59` / `a4c3e09b`. Unique-context requirements already exist. Not every recovery was adjudicated; no edit-tool defect or additional global rule is proposed.
- One exact `browser_page` `Target.autoAttachRelated` parameter-error result occurred October 31 in `01a18f33-bd5b-7089-b610-e9f26469f8eb` / `9a4906c4`. Browser changes were already in progress during this review. Do not prescribe a second overlapping repair or infer current recovery from source changes alone.
- Ordinary test failures, successful error-reporting commands, operational prerequisites, deliberate cancellations, and broad text matches were not combined into tool-defect totals.

## What does not need another rule

- `AIF-asset-review-target`, `APR-relative-progress-design-lock`, `APR-asset-review-author-substitution`, and `APR-parallel-creation-narrowing` show persistent goal/judgment/adherence problems. Current survival-demo guidance already preserves the parent outcome, rejects invented constraints from relative preferences, prioritizes primary forms, and specifies fresh Sol High reviews with periodic Opus perspectives. Do not add universal dual-review, per-adjustment approval, or further generic continuity rules. Future quality and compliance remain unproven.
- `AIF-vehicle-work-execution` is directly supported by October 26 parent `01a1754c-95d5-7700-ad56-544217a02e0c`, operator correction `f3ad12da` at line 1949. Repeated scope acknowledgments preceded actual work; reviews/implementation then started. Existing do-the-work guidance already applies.
- `APR-comparison-baseline-provenance` is an evaluation-evidence defect with a recorded correction, not grounds for another standing gate.
- Existing records distinguish evidence, hypotheses, remedy, authority, and status. This review found no demonstrated need for a new feedback store, curator, scheduler, automatic prompt optimizer, mandatory reflection cycle, or wholesale feedback-system rewrite. Reconcile a record's status when its owning task supplies new evidence; do not equate implemented wording with proven effectiveness.

## Disposition

Save this report and its concise analysis-log entry. No shared instruction changes, runtime fixes, new tests, reload, commit, or push. The smallest proposed instruction edit is the planning-loop consolidation; the strongest tooling follow-ups concern settled-partial presentation, the isolated `/commit` scope case, and the known renderer crash path. Implementation choices and any expanded work remain for operator approval.

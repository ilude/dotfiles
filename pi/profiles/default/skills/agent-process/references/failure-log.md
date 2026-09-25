# Agent process failure log

## APR-072 - Documentation-review findings were presented without investigation or usable detail

- **Reference:** MPS Markdown-review discussion, 2026-09-24; related AIF-092.
- **Observed:** The orchestrator converted raw council uncertainties into serial operator questions, revisited an explicitly skipped item, treated a current failing test first as documentation trivia and then as proof that reconstructed production-derived UserSearch source should change, and described six proposed fixes without initially naming their code, data, or validation surfaces. Operator corrections supplied the missing provenance and forced the fixture/configuration distinction.
- **Impact:** The operator had to recover context the review should have established, prevent an unsafe compatibility change, and repeatedly request concrete explanations. The discussion created churn instead of reducing the decision set.
- **Remediation:** Validate each remaining candidate before presenting it. For the active UserSearch finding, preserve the production-compatible implementation while tracing actual EISA creation, legacy `uid` persistence, current IS 7.2 mappings, and synthetic fixture fidelity. Record durable project evidence at the existing EISA/MPS investigation owner and process feedback in AIF-092.
- **Status:** Evidence recorded; remaining review candidates still require evidence-first triage.

## APR-070 - Quiet commit attempted to stage an ignored archive path

- **Reference:** Operator correction during CAC setup workflow, 2026-09-24.
- **Observed:** `commit_run` explicitly staged an ignored `.specs` archive path and Git rejected it. The orchestrator repeatedly inferred its source without evidence. The private agent transcript was not retained, so the path-selection cause remains unresolved.
- **Related:** AIF-009 (repository inventory and commit ordering).
- **Remediation:** With operator approval, replaced staging guidance in the commit-only prompt: use current status candidates, not file references; refresh before subsequent groups; require explicit authorization to force-add ignored files. No general agent rule or runtime gate added.
- **Status:** Prompt revised; effectiveness against a live recurrence is unverified.

## APR-069 - Retained completed subagents and delayed recovery after partial result

- **Reference:** Default session `01a0d212-1862-72be-825b-4865b83bbd33`, 2026-09-24; validator child session `99e5a8d3-4e52-4508-b3a8-d55ae1f3a8c2`.
- **Observed:** The coordinator explicitly retained developers for speculative future work. After correction, it finished idle Clara and Iris. Later, validator emitted a partial at 15:05:51Z saying recovery checks were being run, but had actually settled. The coordinator reported checks still running and did not resume until the operator asked “so what is going on here?” around 15:18. Inspection confirmed the work was settled; an explicit follow-up completed checks, final validation completed, and the worker closed promptly.
- **Finding:** Caller-side retention and outcome handling were at fault. The record does not establish a backend defect.
- **Related:** AIF-067 (foreground Strategist outcome handling); APR-017 (integrating delivered outcomes rather than duplicating or overlooking them); AIF-087 (distinguishing runtime ownership and pane state).
- **Remediation:** Retain a child only for a concrete expected follow-up, not speculative later work. Treat a delivered partial as settled unless current status proves it is still active; continue with an explicit concrete follow-up when needed.
- **Status:** Recovery completed. Log-only feedback; no instruction or runtime change authorized.

## APR-068 - Requested cache default left pending reconfirmation

- **Reference:** Default-profile Mantle accounting discussion, 2026-09-24, session `01a0d39b-3fb2-73a0-825d-761f5467d6d4`.
- **Observed:** The operator specified five-minute cache writes while approving the accounting fix. The orchestrator fixed accounting but asked for confirmation of the default and then reported it as pending. The operator had to repeat the requested default.
- **Finding:** The orchestrator treated the requested behavior as an unresolved proposal. Existing scope and intent guidance applied; no additional approval rule was needed.
- **Related:** APR-064 (corrections did not carry through to the next action); APR-066 (confusing requested work with proposals).
- **Remediation:** Changed both PowerShell and zsh defaults to `short`, preserving explicit overrides. Syntax and default/override checks passed. Existing Pi processes must be relaunched with the updated environment. No instruction changes.

## APR-071 - Durable-job assignment exceeded one independently provable responsibility

- **Reference:** Default Iris session `01a0d4ec-c9be-723e-96b7-d30060f9c741`, coordinator lineage rooted at `01a0d4e4-c99a-7500-aada-813b6db55846`, fixed interval `[2026-09-24T19:32:40Z,2026-09-24T20:49:16Z)`; AIF-091 and TCA-012.
- **Observed:** Strategist and coordinator treated “B” as one named task even though it joined database migration and transaction design, recovery/CAS state machines, pipeline fencing, delivery semantics, configuration, observability contracts, lifecycle integration, and all focused tests. Coordinator sent five additional messages during Iris's first 7 minutes 23 seconds, including shared-worktree ownership traffic unrelated to B's disjoint paths and contract details that were not frozen before launch. Iris then had to design, implement, integrate, and repeatedly validate the whole dependency chain in one session.
- **Impact:** The worker made continuous progress and recovered every observed local issue, so the long model phase is not inactivity or a failed handoff. The broad critical path nevertheless concentrated 93,914 recorded output tokens, 111 tool calls, six intermediate typecheck/test failure outcomes, and four caller tool-use mistakes in one child. By the cutoff the contract and implementation were substantially complete; the final post-edit validation landed just after it.
- **Finding:** This is a coordinator/Strategist subagent-use failure in task sizing. A smaller-model mismatch remains a hypothesis, not a proved cause, because no controlled stronger-model comparison exists. The successful post-cutoff checks also rule out describing the child as simply incapable or failed.
- **Remediation:** For comparable work, freeze interfaces first and sequence separate persistence/migration/atomicity, pipeline fencing/events, job recovery/CAS, and delivery/lifecycle assignments. Keep the terminal-plus-outbox transaction with the persistence writer; transfer shared-file ownership explicitly between sequential assignments. Route coupled transaction/state-machine work to Sol high and use Luna only for bounded leaves after dependencies are fixed, pending comparative evidence.
- **Post-cutoff outcome:** At 20:49:47Z typecheck, 56 focused tests, and diff checks passed. At 20:50Z the parent froze the candidate contract and requested final evidence/ownership release with no new implementation scope.
- **Status:** Log-only process record. Active B was not cancelled, reassigned, or modified by this review.

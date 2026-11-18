---
name: intent-review
description: Run a bounded fresh-context review against the original request to find completion blockers and unnecessary additions. Use only when the user explicitly requests an intent review or invokes this skill, including within a goal.
---

# Intent review

Keep the change anchored to what the user asked for, not to the accumulated reasons for doing more. Invocation requests this review and minimal in-scope corrections, not a new acceptance gate or a continuation engine. Use the existing goal controller when running within `/goal`.

## Fix the target and brief

Inspect `git status --short`. Establish the repository, base, task paths and one diff command, including relevant untracked files. Reuse that target across rounds; preserve unrelated changes. Investigate overlaps before asking if ownership or scope cannot be resolved. Reuse agreed-check results that cover the reviewed state; run agreed checks where current evidence is missing. Fix demonstrated task-related failures and report missing or pre-failing checks without adding a validation phase.

Build a short brief from source authority, not the implementer's narrative:

- Quote the original user request and explicit decisions/exclusions verbatim. Under `/goal`, include the durable **User authority** section. Include referenced user-approved acceptance text when needed to understand the request.
- Give the checkout, base, diff command, task paths and observed agreed-check results.
- Recover original messages when available. If only a summary survives, label it as a summary and state the limitation; do not present reconstructed wording as a quote or invent acceptance.

Do not send the conversation history, implementation rationale, investigation narrative, or earlier reviewer conclusions in round 1. The reviewer can inspect surrounding code and applicable repository instructions independently.

## One independent reviewer

Use the existing `reviewer` role and its `code-review` skill, with configured model/effort defaults unless the user explicitly selects otherwise. Follow existing provider/harness routing; do not silently substitute. Start no council or nested reviewers.

Each round is a fresh assignment, never a follow-up to the previous reviewer's retained context. Follow existing foreground/background and completion-delivery rules. Do not edit the reviewed scope while a reviewer is running or launch a duplicate on continuation. If waiting for a background result, retain its task identity and await delivery without polling or treating the pending review as completion.

Ask the reviewer:

> Review only; do not edit or delegate. Compare the scoped diff with the quoted user intent. What still prevents the requested result? What did this task add that the result does not need? Is it time to finish?
>
> B: a demonstrated completion blocker or task-related regression. Identify the affected requirement/caller, trigger and consequence.
> R: an unnecessary task-created addition that can be removed or narrowed without losing requested behavior. Include excess code, tests, guards, options, docs and approval steps.
> O: an optional improvement outside the request, not a requirement.
>
> Use stable IDs such as B1/R1/O1, file:line, evidence and the smallest relevant correction. Judge uncommon cases by actual impact and reachability, not rarity alone. Do not invent requirements, mandatory checks, or findings to fill a category. Give an advisory FINISH or FIX verdict, and distinguish evidence gaps from demonstrated defects.

## Triage and minimal corrections

Verify findings against the request and evidence. Follow existing Steward consultation rules when assessing reviewer findings; this skill neither bypasses them nor introduces another approval authority. Findings and severity labels are proposals, not user decisions.

Fix demonstrated in-scope blockers with the smallest correction. Remove or narrow unnecessary additions only when created during this task; preserve pre-existing and unrelated user changes. Prefer subtraction when it solves the problem, not smaller diffs at the expense of requested behavior. Do not adopt optional hardening, abstractions, fallback paths or gates without user direction.

Keep a short in-context ledger of finding IDs and fixed/declined/disputed dispositions with evidence. Do not create a ledger file or turn optional findings into a mandatory backlog. Under `/goal`, findings remain operational evidence, never authority. Re-run affected agreed checks after corrections. Inspect diff growth for unnecessary work; growth alone is not a defect.

## Bounded rounds and completion

- At most **three review rounds**, unless the user explicitly requests another limit. No automatic extension for security terminology, disagreement or a goal continuation.
- Round 1 covers the scoped change. Start another round only when an accepted correction changes behavior that needs fresh verification, and only while the round budget remains. Declined findings and comment/doc/format-only corrections do not trigger another round. For prose/instruction tasks, changed instructions are behavior, not cosmetic documentation.
- Later fresh assignments receive the same source-authority brief, the concise ledger and the change since the previous round. Review only changed code/instructions and open findings, marking old IDs resolved or still open with evidence. Do not reopen the whole project.
- Finish when requested behavior and agreed checks are satisfied with no demonstrated task-related defect remaining. Reviewer approval or unanimity is not an extra acceptance condition. Decline unsupported findings with evidence instead of negotiating agreement or automatically asking the user.
- Ask only for a consequential unresolved choice about behavior, scope or acceptance. A reviewer disagreement alone does not establish such a choice.
- At the round limit, stop launching reviews. Complete an already justified bounded correction and its agreed checks within resource limits; report any final change not re-reviewed. A remaining demonstrated defect is unfinished work, not approval. A timeout, error or unavailable reviewer is missing coverage, not approval; follow existing cancellation rules and report the gap without an automatic retry loop.

Report the outcome, actual rounds/model/effort when exposed, necessary fixes, removed excess, material declined findings and verification gaps. Under `/goal`, record completion with evidence when acceptance is met, otherwise the concrete unresolved outcome. Commit, integration, publication and deployment authority remain unchanged.

Inspired by [Theo's tstack sol-loop](https://github.com/t3dotgg/tstack/blob/main/skills/sol-loop/SKILL.md), adapted for intent preservation and this profile's existing role, scope and stopping rules.

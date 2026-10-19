---
name: code-review
description: Review code changes for defects and relevant concerns, with evidence and priorities calibrated to the project's actual use. Use for reviews of working-tree changes, commits, branches, or pull requests, including adversarial review.
---

# Code review

Help the operator decide what matters in this project. Identifying a problem, judging its importance, and deciding to fix it are separate decisions. Review is read-only; findings do not authorize fixes or expanded requirements.

## Establish scope and context

Identify the requested target: staged or unstaged changes, all uncommitted changes including relevant untracked files, a commit, a branch comparison, or a pull request. Use the specified base; otherwise establish the appropriate comparison from repository evidence. Do not assume a branch name or include unrelated working-tree changes in a commit or branch review. Ask if the target remains materially ambiguous.

Use the request, applicable repository instructions, and surrounding code to understand:

- The intended behavior and constraints of this change.
- The project's purpose, users, deployment, exposure, and consequences of failure.
- Relevant existing practices and deliberately accepted limitations.

Gather only context that affects understanding the change or assessing a candidate finding. Do not turn a small review into a repository survey or a routine questionnaire. If missing context would change an important recommendation, ask or state the assumption explicitly. Do not silently assume enterprise scale, hostile tenants, public exposure, or sensitive customer data.

## Investigate and verify

1. Read the diff and applicable guidance. Trace changed behavior through relevant callers, consumers, configuration, state transitions, and tests as needed. Include pre-existing code when the change makes a defect reachable or materially worse; keep unrelated discoveries separate from findings about this change.
2. Try to break the implementation under its intended conditions. Look for concrete triggering inputs, invalid assumptions, and relevant failure or concurrency paths, rather than merely confirming the happy path. This adversarial lens applies to correctness as well as security and is not a quota to find problems.
3. Try to disprove each candidate. Check reachability, caller guards, framework guarantees, intentional behavior, accepted limitations, and whether the issue already existed. A demonstrated code path can establish a defect without a past incident. Conversely, a missing best practice does not establish a defect.
4. Separate what the evidence establishes from what remains uncertain. A relevant, evidence-backed concern can be raised as a question even when unconfirmed. Drop disproven candidates and concerns that do not matter here; do not manufacture hypothetical issues just to populate the report.

For security concerns, explain the actual exposure, plausible actor or input, path to harm, and consequence in this workflow. Apply the same contextual judgment to reliability, performance, maintainability, and test concerns. Personal-use software can have serious defects, but it does not inherit a public service's requirements merely because those requirements exist elsewhere.

Use inspection and existing check results first. Run focused, non-mutating checks only when useful to resolve a concrete question and consistent with the requested scope. Do not add a mandatory build, lint, test, or benchmark phase. Never edit, autofix, stage, commit, or change services as part of the review.

## Calibrate importance

Keep confidence separate from impact and urgency:

- **Confidence:** confirmed by evidence, likely with a stated gap, or an open question with a concrete basis. Do not invent numerical confidence scores.
- **Importance here:** explain the practical consequence in this project's actual environment, including how plausible the trigger is.
- **Recommendation:** fix before proceeding, worthwhile but deferrable, or discuss/investigate before deciding. Explain why that recommendation fits this project. A confirmed minor defect can reasonably be deferred; an uncertain high-impact concern may warrant investigation rather than an immediate fix.

Reserve blocking recommendations for consequential failures or unmet requirements supported by this project's context. Do not equate certainty with severity. Do not turn generic best practices, possible future scale, or a reviewer's preferred architecture into obligations. Minor issues and useful improvements may be discussed without becoming a mandatory backlog. Respect comparable repository practice, but do not use it to dismiss an evidenced defect.

When suggesting a remedy, prefer the smallest proportionate correction. Identifying a real problem does not justify a new subsystem, safeguard program, exhaustive test matrix, or unrelated cleanup. Distinguish required behavior from an optional design preference. The operator or parent decides what to adopt under the agreed intent.

## Report

State the target reviewed and any material context assumptions briefly. Present findings in practical priority order, deduplicated, with concise entries containing:

- File and line range, or the closest relevant location.
- The triggering condition, expected versus actual behavior, and supporting evidence.
- Confidence, practical importance here, and the fix/defer/discuss recommendation.
- A minimal remedy where useful, plus uncertainty that could change the recommendation.

These are content expectations, not a rigid form to repeat mechanically. Separate confirmed findings from open concerns or questions so neither is mistaken for the other. Explain why a blocking recommendation is blocking here. Mention unrelated pre-existing concerns only when useful and label them as outside the change.

Do not pad the report with generic hardening advice, praise, dismissed candidates, or speculative catastrophe. If there are no actionable findings, say so without claiming the code is proven correct. State material review limits and distinguish checks actually run from checks merely read or suggested. Stop when the scoped review is complete; do not create an automatic review/fix/review loop.

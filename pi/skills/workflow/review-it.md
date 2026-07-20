# Review and Repair an Artifact

Review the artifact at `$ARGUMENTS`, apply supported fixes to that artifact, and report whether it is ready for its next workflow.

Do not edit implementation files. Ask only when the path is missing or a required product decision cannot be resolved from the artifact and repository.

## Flow

```text
RESOLVE -> INSPECT -> REVIEW -> VERIFY -> APPLY -> VALIDATE -> REPORT
```

Keep the review proportional. Do not create review directories, synthesis files, timing tables, finding counts, or recovery ledgers unless the user or an external contract requires them.

## Resolve and Inspect

1. Read the explicit artifact path. Ask for it when absent.
2. Stop when the path does not exist or the artifact is empty.
3. Read the complete artifact and only enough repository context to verify its claims.
4. Identify its objective, intended next workflow, scope, dependencies, validation, and actual risk.

Plans require execution readiness. Requirements documents require clarity, consistency, scope, and testability. Other artifacts use the closest relevant criteria.

## Review

Use available subagents when independent perspectives can inspect distinct concerns without duplicating work. A narrow artifact may need one delegated perspective; broader or cross-domain artifacts may benefit from parallel reviewers. Keep serial synthesis and artifact edits in the parent.

Each delegated assignment must name the artifact, repository scope, perspective, evidence required, allowed changes, and stop condition. Prefer bounded inline findings. Persist reviewer artifacts only when the active workflow, user, or review coordinator requires them.

Review only concerns that can affect the artifact's objective or next workflow:

- correctness and unsupported claims;
- missing or contradictory scope, dependencies, and assumptions;
- executable ordering and fresh-session usability;
- realistic validation of the requested contract;
- destructive, stateful, external, credential, paid, or subjective risk when present;
- avoidable complexity and duplicated ceremony.

A failed reviewer is not automatically a blocker. Continue when remaining evidence is sufficient; do not retry an equivalent failed delegation without a reason the retry will differ.

## Verify and Apply

Reviewer output is advisory. Verify verdict-changing findings against the artifact and repository using the cheapest decisive evidence.

Apply supported must-fix defects and necessary clarity changes directly to the artifact in one coherent pass. Preserve its objective and valid completed work. Do not add optional hardening, a new architecture, or operational controls unrelated to actual risk.

If a required fix depends on an unresolved product choice, unsafe external action, credential, or unavailable prerequisite, leave the choice unmade and report the artifact as blocked.

## Validate

Read the revised artifact as a fresh executor would.

For a plan, confirm that tasks are actionable, real dependencies agree with order, validation exercises the requested workflow, conditional safety controls match actual risk, and resume state is clear. Do not require duplicate task tables, gate IDs, evidence destinations, or separate review artifacts.

For prose-only changes, validate the content directly. Run repository tests only when parsing, loading, generated output, or runtime behavior changed and the test exercises that contract.

## Report

State:

- `READY`, `READY WITH DEFERRALS`, `NOT READY`, or `BLOCKED`;
- reviewed artifact path;
- material findings and fixes;
- direct validation performed;
- remaining blocker or optional deferral;
- next workflow command when ready.

Keep the report concise. Do not manufacture metrics or artifacts for the report.

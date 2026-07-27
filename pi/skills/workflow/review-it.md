# Review an Artifact

Review the artifact at `$ARGUMENTS`, repair it when supported, and report whether it is ready for its next workflow. By default, apply supported must-fix defects and necessary clarity repairs in place so it is ready when possible. An explicit review-only request is non-mutating. Never edit implementation files during review.

Ask only when the path is missing or a required product decision cannot be resolved from the artifact and repository. Keep the review proportional. Do not create review directories, synthesis files, timing tables, finding counts, or recovery ledgers unless the user or an external contract requires them.

## Skill Ownership

Load `planning` for requirements, acceptance criteria, plan outcomes, and verification. Load `prd` for a PRD, `docs` for document structure, and `no-ai-slop` only when wording quality is relevant. Do not copy their detailed rules into this wrapper.

## Resolve and Inspect

1. Read the explicit artifact path. Ask for it when absent.
2. Stop when the path does not exist or the artifact is empty.
3. Read the complete artifact and only enough repository context to verify its claims.
4. Identify its objective, intended next workflow, scope, dependencies, validation, and actual risk.

Plans require execution readiness. Requirements documents require clarity, consistency, scope, and testability. Other artifacts use the closest relevant criteria.

## Review

Delegate only when independent perspectives materially improve the review without duplicating work. Keep synthesis and all artifact edits in the parent.

Each delegated assignment must name the artifact, repository scope, perspective, evidence required, allowed changes, and stop condition. Prefer bounded inline findings. Persist reviewer artifacts only when the active workflow, user, or review coordinator requires them.

Review only concerns that can affect the artifact's objective or next workflow:

- correctness and unsupported claims;
- missing or contradictory scope, dependencies, and assumptions;
- executable ordering and fresh-session usability;
- realistic validation of the requested contract;
- destructive, stateful, external, credential, paid, or subjective risk when present;
- avoidable complexity and duplicated ceremony.

Sentence length, passive voice, or a style score is not a defect by itself. Repair wording only when it obscures meaning, responsibility, conditions, evidence, or the artifact's next action.

A failed reviewer is not automatically a blocker. Continue when remaining evidence is sufficient; do not retry an equivalent failed delegation without a reason the retry will differ.

## Verify

Reviewer output is advisory. Verify verdict-changing findings against the artifact and repository using the cheapest decisive evidence.

Unless the request is explicitly review-only, apply only supported must-fix defects and necessary clarity changes in one coherent pass. Preserve the artifact's objective and valid completed work. Keep optional hardening advisory; do not add a new architecture or operational controls unrelated to actual risk.

If a required fix depends on an unresolved product choice, unsafe external action, credential, or unavailable prerequisite, leave the choice unmade and report the blocker.

## Validate

Read the artifact as a fresh executor would. If repaired, inspect the revised content directly.

For a plan, confirm that tasks are actionable, real dependencies agree with order, validation exercises the requested workflow, conditional safety controls match actual risk, and resume state is clear. Do not require duplicate task tables, gate IDs, evidence destinations, or separate review artifacts.

For prose-only changes, validate the content directly. Run repository tests only when parsing, loading, generated output, or runtime behavior changed and the test exercises that contract.

## Report

State whether the artifact is ready, the material findings, any applied fixes, relevant validation, and any remaining blocker or optional deferral. Keep the report concise. Do not manufacture metrics or artifacts.

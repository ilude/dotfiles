# Adaptive Artifact Review

Review the artifact at `$ARGUMENTS`, apply supported fixes to that artifact, validate the result, and report whether it is ready for its next workflow.

Do not edit implementation files. Do not ask for approval before applying recommended artifact edits. Ask only when the path is missing or a required product decision cannot be resolved from repository evidence.

## Flow

```text
RESOLVE -> INSPECT -> DISCOVER -> REVIEW -> VERIFY -> SYNTHESIZE -> APPLY -> VALIDATE -> REPORT
```

Keep the workflow proportional. One review invocation gets one independent review panel and one apply pass. Do not automatically launch a second panel because the artifact changed.

## 1. Resolve

1. Read the explicit path from `$ARGUMENTS`.
2. If no path is provided, ask for it.
3. Stop if the path does not exist or the artifact is empty or stubbed.
4. Derive a review directory beside the artifact:
   - For `.specs/<name>/...`, use `.specs/<name>/review-<N>/`.
   - For archived artifacts, keep the review under the matching archive directory.
   - Otherwise use `.specs/<parent-or-stem>/review-<N>/`.
5. Reserve `synthesis.md` and unique reviewer artifact names. Do not overwrite an existing review.

## 2. Inspect

Read the complete artifact and enough repository context to understand its claims. Determine:

- artifact type and intended next workflow;
- objective, scope, constraints, dependencies, and risk;
- implementation, operational, product, and validation domains involved;
- destructive, external, credential, paid, or subjective decisions;
- commands, files, services, and evidence that can be verified directly.

Infer the artifact type from its content and name. Plans require execution readiness. Product or requirements documents require clarity, consistency, scope, and testability. Other artifacts use the closest applicable criteria.

## 3. Discover

Discover the capabilities available in the current runtime before composing the review:

- available worker or delegation mechanisms;
- available reviewer or domain-agent definitions;
- available tools for repository inspection and constrained artifact writing;
- available model routing or defaults.

Choose from what is actually available. Do not require particular agent names, model names, providers, model sizes, or a fixed organization chart. Let runtime defaults handle model selection unless direct evidence shows an override is necessary.

Compose a proportional set of independent perspectives. Cover the concerns that matter for this artifact, such as:

- completeness and standalone usability;
- correctness, safety, and failure handling;
- simplicity, scope, and reuse;
- validation realism and automation readiness;
- domain-specific implementation or operational risks.

A reviewer may cover more than one concern. Use the smallest panel that provides independent coverage. Add reviewers only when they own a distinct risk that the existing panel does not cover.

Record the discovered capabilities, selected perspectives, selection reasons, and omitted perspectives in the synthesis.

## 4. Review

Read `templates/review-it-reviewer-prompts.md` before dispatch.

Run reviewers independently and in parallel when the runtime supports it. Use the runtime's normal worker and model-routing behavior. Do not create a coordinator layer, nested delegation, or extra synthesis worker unless the available runtime requires it.

Each reviewer receives:

- artifact path and relevant repository scope;
- one clearly defined perspective and skeptical focus;
- permission to inspect but not modify repository implementation;
- a unique reviewer artifact path when file-backed output is available;
- the bounded finding and return contract from the reviewer template.

Prefer a constrained review-artifact writer when available. Otherwise use the narrowest available artifact output. If file output is unavailable, accept bounded inline findings and record the degraded path in synthesis.

Report one launch checkpoint. Do not expose raw reviewer chatter in the main context when artifact-backed output is available.

## 5. Verify

Reviewer output is advisory. Before synthesis:

1. Verify every expected artifact exists and is usable, or record the explicit inline-output exception.
2. Read every usable reviewer result.
3. Deduplicate overlapping findings.
4. Classify each finding as:
   - must-fix defect;
   - required readiness or safety hardening;
   - optional improvement;
   - duplicate;
   - false positive.
5. Verify verdict-changing findings against the artifact and repository with the cheapest decisive evidence.
6. Downgrade or reject claims that are unsupported, theoretical, already handled, or outside the artifact's objective.

If one reviewer fails, retry only that reviewer once when doing so is useful. If enough independent coverage remains, continue and record the gap instead of rerunning healthy reviewers. Stop only when missing coverage makes a reliable verdict impossible.

Run a targeted rebuttal only when conflicting findings would materially change the verdict or required edit. Do not debate wording or optional hardening.

## 6. Synthesize

Read `templates/review-synthesis-template.md`, then write `<review-dir>/synthesis.md` before editing the artifact.

The synthesis must include:

- discovered runtime capabilities and selected perspectives;
- accepted must-fix and readiness findings with evidence;
- optional or deferred improvements;
- duplicates and rejected findings;
- planned artifact edits;
- reviewer artifact and recovery status;
- actual timing when available, otherwise `unavailable`;
- readiness before edits.

Do not include praise, raw transcripts, or unsupported metrics.

## 7. Apply

Apply all verified must-fix defects, required readiness fixes, and necessary clarity changes to the reviewed artifact. Do not ask first.

Keep edits minimal and objective-preserving:

- fix incorrect commands, dependencies, ordering, validation, rollback, evidence, and missing assumptions;
- preserve valid checked work and its evidence;
- add or update unchecked checklist items when executable work changes;
- keep task, wave, dependency, success, validation, and checklist IDs aligned;
- separate independent stateful or high-risk changes into safe waves;
- defer optional hardening instead of expanding the artifact;
- do not introduce a new architecture, objective, or product decision solely because a reviewer suggested it.

If a required fix depends on an unresolved product choice, unsafe external action, missing credential, or unavailable prerequisite, leave that choice unmade and report the artifact as blocked.

Record applied and deferred findings in `applied-fixes.md` when edits are made. Apply edits in one coherent pass.

## 8. Validate

Validate the revised artifact directly. For plans, require:

- required sections occur once and remain coherent;
- executable tasks, waves, dependencies, and checklist IDs agree;
- no pending work was marked complete by review;
- commands use repository-supported tools and entrypoints;
- each gate has an action, success signal, failure action, and evidence destination;
- mutation, rollback, manual-gate, deployment, and archive behavior is explicit where applicable;
- the plan can be resumed in a fresh session without conversation-only context.

For requirements or other artifacts, validate their own schema, scope, consistency, testability, and next-workflow readiness instead of imposing plan-only sections.

Run repository checks only when they validate the artifact contract and are safe in the current environment. Fix deterministic artifact defects found by this audit once. Do not launch another general review panel. If the artifact still cannot be made ready without guessing, record the blocker and stop.

Update `synthesis.md` with applied counts, deferred counts, validation evidence, and final readiness.

## 9. Report

The first line must be exactly one of:

```text
PASS: REVIEW COMPLETE: artifact is ready.
WARN: REVIEW COMPLETE: artifact is ready with deferred improvements.
FAIL: REVIEW COMPLETE: artifact is not ready.
BLOCKED: REVIEW INCOMPLETE: required input or capability is unavailable.
```

Include:

- reviewed artifact path;
- synthesis path;
- number of accepted, applied, deferred, duplicate, and rejected findings;
- validation performed;
- concise blocker when not ready;
- the appropriate next workflow command when ready.

Keep the report concise. Full details belong in `synthesis.md`.

The final line must be exactly one of:

```text
FINAL STATUS: READY -- no must-fix defects remain.
FINAL STATUS: READY WITH DEFERRALS -- no must-fix defects remain.
FINAL STATUS: NOT READY -- must-fix defects remain.
FINAL STATUS: REVIEW BLOCKED -- required input or capability is unavailable.
```

# QA Review: Verification Realism

## Finding 1
- **Severity:** High
- **Evidence:** Most acceptance checks use broad `grep -E` alternatives, e.g. `"optional|not required|not mandatory"` and `"Problem|Goals|..."`. A file containing one keyword can pass despite missing required behavior or sections.
- **Required fix:** Replace OR greps with per-requirement checks, or add a scripted validation that asserts every required section/category appears exactly where expected.

## Finding 2
- **Severity:** High
- **Evidence:** V1 requires the PRD flow be “self-contained and usable by a fresh agent,” but no automated or review artifact proves a fresh agent can follow `/prd-it` from invocation through writing `.specs/{auto-slug}/PRD.md`.
- **Required fix:** Add a required evidence artifact: a short dry-run transcript or checklist showing trigger, questions, slug creation, PRD write path, and handoff behavior.

## Finding 3
- **Severity:** Medium
- **Evidence:** The plan says users should not need to provide `.specs/{slug}`, but validation only greps for positive workflow text. It does not detect instructions that still require a slug or latest-filesystem discovery.
- **Required fix:** Add negative checks for prohibited language such as “user must provide slug,” “latest PRD,” or mandatory `.specs/{slug}` input, plus human review of surrounding instructions.

## Finding 4
- **Severity:** Medium
- **Evidence:** Repo validation includes `make test-quick && make lint` and optional `make check`, but the implementation edits only markdown workflow files. These commands may pass while command behavior remains unusable.
- **Required fix:** Keep repo validation, but make task-specific workflow validation blocking and evidence-based: capture exact command outputs plus review of actual `prd-it.md`, `plan-it.md`, and `review-it.md` behavior paths.

## Finding 5
- **Severity:** Medium
- **Evidence:** `/review-it PRD.md` must branch differently from `plan.md`, but the check `grep -n "PRD.md\|plan.md"` only proves both strings exist somewhere, not that dispatch behavior is unambiguous.
- **Required fix:** Require explicit branch headings or a decision table for artifact type detection, with separate required criteria for PRD review and plan review preservation.

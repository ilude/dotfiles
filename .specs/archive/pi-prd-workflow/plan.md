---
created: 2026-05-06
status: completed
completed: 2026-05-06
---

# Plan: Pi PRD Workflow Skill

## Context & Motivation

The user wants Pi to support PRD-driven idea refinement without making PRDs mandatory for every plan. Some tasks already have enough current-session context for `/plan-it`; other ideas are fuzzy and need a conversational PRD skill that activates from `/prd-it` or clear PRD/product-requirements intent, guides the user through refinement, and writes `.specs/{auto-slug}/PRD.md` without requiring the user to know or provide a slug.

Research and discussion identified useful lightweight patterns from PRD best practices, Amazon Working Backwards PR/FAQ, Shape Up pitches, Jobs-to-Be-Done, divergent/convergent thinking, and Kano-style prioritization. The desired system should stay simple but include high-quality idea refinement: social/linguistic cues for uncertainty, scope ambiguity, premature implementation, product value framing, and readiness to write.

## Constraints

- Platform: Windows via Git Bash/MSYS2 (`MINGW64_NT-10.0-26200`)
- Shell: bash in Git Bash/MSYS2
- Repository policy: Pi workflow work should be Pi-native and update `pi/skills/workflow/` rather than Claude/OpenCode command surfaces unless explicitly needed.
- A PRD is optional; `/plan-it` must still work from current conversation context when no PRD exists.
- Users should not need to provide `.specs/{slug}` directory names for normal PRD creation.
- `/prd-it` should be skill-backed. Natural-language PRD mentions should enter PRD mode only when the user asks to create, refine, review, or flesh out a PRD/product requirements artifact. Incidental PRD mentions should receive at most one opt-in question, not automatic mode switching.
- Before writing a PRD file, the skill must either have an explicit user request to write now or present a brief scope/path summary and get confirmation.
- PRD content must avoid secrets, credentials, tokens, private customer data, sensitive personal data, and proprietary evidence unless the user explicitly approves a redacted/summarized form.
- Slugs must be safe repo-local path components: lowercase kebab-case, max 40 chars, no `..`, path separators, drive prefixes, control characters, or reserved names; collisions append `-2`, `-3`, etc.; never write through symlinked `.specs/{slug}` targets.
- Keep implementation simple: markdown skills/templates first; avoid runtime state or complex resolver code unless needed later.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Dedicated `/prd-it` skill plus small updates to `/plan-it` and `/review-it` | Clear optional artifact pipeline; supports conversational PRD refinement; minimal files; matches existing Pi workflow skill pattern | Requires documenting artifact resolution behavior in multiple command files | **Selected**: best balance of clarity and small implementation |
| Fold PRD creation into `/plan-it --prd` | Fewer top-level commands | Overloads `/plan-it`; less likely to activate on natural PRD intent; blurs product discovery and execution planning | Rejected: violates simple mental model |
| Shared spec-directory resolver accepting `.specs/{slug}/` everywhere | Long-term ergonomic consistency | Requires users or agents to reason about slug directories; more implementation/detail than current need | Rejected for now: user specifically noted slug-directory input is the wrong center of gravity |
| Persistent session metadata tracking most recent PRD | Could make implicit `/plan-it` resolution more robust | Adds runtime state and hidden behavior; harder to validate with markdown skills alone | Rejected for first pass: document current-conversation artifact precedence instead |

## Objective

Create a Pi PRD workflow that lets users invoke `/prd-it` or clearly ask for PRD/product-requirements refinement, optionally write `.specs/{auto-slug}/PRD.md`, and hand off naturally to `/plan-it` and `/review-it`. Update `/plan-it` and `/review-it` instructions so they can use an explicit PRD path or the PRD path just created/referenced in the current conversation, while preserving conversation-only planning when no PRD is needed.

## Project Context

- **Language**: Markdown workflow skills in a Python/shell dotfiles repository (`pyproject.toml`, `Makefile`, `.gitattributes` detected)
- **Test command**: `make test-quick` for fast repo validation; `make check` for strongest repo-wide validation
- **Lint command**: `make lint`

## Automation Plan

| Operation | Command/wrapper | Credentials | Evidence |
|-----------|-----------------|-------------|----------|
| Preflight | `test -f pi/skills/workflow/plan-it.md && test -f pi/skills/workflow/review-it.md && test -f pi/skills/workflow/templates/plan-template.md` | none | command exits 0 |
| Implement | edit/write markdown files under `pi/skills/workflow/` | none | git diff showing `prd-it.md`, PRD template, and targeted command updates |
| Deploy | not applicable | none | none |
| Verify | task-specific checks plus dry-run evidence artifact below | none | command outputs and `.specs/pi-prd-workflow/review-implementation-dry-run.md` |
| Repo validation | `make test-quick && make lint` then `make check` if practical | none | commands exit 0 with no new warnings, or exact environment blocker documented |
| Rollback | `git restore -- pi/skills/workflow/plan-it.md pi/skills/workflow/review-it.md && rm -f pi/skills/workflow/prd-it.md pi/skills/workflow/templates/prd-template.md` before commit, only after confirming the new files are expected untracked files | none | tracked edits restored and expected new files removed |

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Add PRD workflow skill and template | 2 | feature | medium | planner | -- |
| T2 | Update `/plan-it` PRD handoff rules | 1 | feature | small | coding-light | T1 |
| T3 | Update `/review-it` PRD review rules | 1 | feature | small | coding-light | T1 |
| V1 | Validate workflow documentation coherence | -- | validation | medium | qa-engineer | T1, T2, T3 |

## Execution Waves

### Wave 1

**T1: Add PRD workflow skill and template** [medium] -- planner
- Description: Create `pi/skills/workflow/prd-it.md` and `pi/skills/workflow/templates/prd-template.md`. The skill must define optional PRD behavior, activation boundaries, non-activation behavior, readiness detection, cue categories, small-batch questioning, user escape hatches, proportionality, divergent/convergent refinement, safe slug generation, write confirmation, redaction guidance, `.specs/{slug}/PRD.md` writing, and handoff to `/plan-it` and `/review-it`.
- Files: `pi/skills/workflow/prd-it.md`, `pi/skills/workflow/templates/prd-template.md`
- Acceptance Criteria:
  1. [ ] PRD skill states PRDs are optional idea-refinement artifacts, not required before every plan.
     - Verify: `grep -qi "optional" pi/skills/workflow/prd-it.md && grep -Eqi "not required|not mandatory" pi/skills/workflow/prd-it.md`
     - Pass: both required concepts are present.
     - Fail: add explicit optional-PRD rule.
  2. [ ] Skill defines activation boundaries and incidental-mention opt-in behavior.
     - Verify: `grep -Eqi "incidental|opt-in|only.*create|only.*refine" pi/skills/workflow/prd-it.md`
     - Pass: PRD mode starts only for create/refine/review/flesh-out intent or offers opt-in for incidental mentions.
     - Fail: add activation boundary rules.
  3. [ ] Skill requires a readiness checkpoint before writing unless the user explicitly requested immediate file creation.
     - Verify: `grep -Eqi "confirm|confirmation|draft now|write now" pi/skills/workflow/prd-it.md`
     - Pass: confirmation or explicit-write bypass is documented.
     - Fail: add write-readiness checkpoint.
  4. [ ] Skill defines safe slug generation, collision handling, and repo-local path safety.
     - Verify: `grep -Eqi "kebab|collision|symlink|reserved|path separator|drive prefix" pi/skills/workflow/prd-it.md`
     - Pass: slug/path rules are present.
     - Fail: add safe slug contract.
  5. [ ] Skill includes redaction guidance for secrets and sensitive content before persisting PRDs.
     - Verify: `grep -Eqi "secret|credential|token|redact|sensitive" pi/skills/workflow/prd-it.md`
     - Pass: sensitive-content persistence guidance is present.
     - Fail: add redaction guidance.
  6. [ ] Skill includes cue categories for uncertainty, scope ambiguity, premature implementation, product/value framing, and readiness.
     - Verify: `for term in "Uncertainty" "Scope ambiguity" "Premature implementation" "Product" "Readiness"; do grep -q "$term" pi/skills/workflow/prd-it.md || exit 1; done`
     - Pass: all cue categories are present.
     - Fail: add missing cue categories.
  7. [ ] Skill limits interrogation and supports user control.
     - Verify: `grep -Eqi "at most 3 questions|skip|assume|draft now|proportional" pi/skills/workflow/prd-it.md`
     - Pass: max question batch, escape hatch, and proportionality guidance are present.
     - Fail: add user-control rules.
  8. [ ] Template includes every required PRD section.
     - Verify: `for term in "Problem" "Goals" "Non-Goals" "Requirements" "Acceptance Criteria" "Alternatives Considered" "Risks" "Plan Handoff"; do grep -q "$term" pi/skills/workflow/templates/prd-template.md || exit 1; done`
     - Pass: every required section is present.
     - Fail: update template sections.

**T2: Update `/plan-it` PRD handoff rules** [small] -- coding-light
- Blocked by: T1
- Description: Update `pi/skills/workflow/plan-it.md` so `/plan-it` can use an explicit `PRD.md` path, the PRD path just created or referenced in the current conversation, or ordinary current-session context if no PRD is needed. Do not require latest-filesystem PRD discovery by default.
- Files: `pi/skills/workflow/plan-it.md`
- Acceptance Criteria:
  1. [ ] `/plan-it` documents PRD input precedence: explicit PRD path, current-conversation PRD artifact, then conversation context.
     - Verify: `grep -n "PRD" pi/skills/workflow/plan-it.md && grep -Eqi "explicit.*PRD|current.*conversation.*PRD|conversation context" pi/skills/workflow/plan-it.md`
     - Pass: output includes the precedence and conversation-only fallback.
     - Fail: add clear PRD resolution instructions.
  2. [ ] `/plan-it` still asks for task goal/context if there is no substantive context.
     - Verify: `grep -n "no substantive context" pi/skills/workflow/plan-it.md`
     - Pass: existing no-context behavior remains.
     - Fail: restore no-context question behavior.

**T3: Update `/review-it` PRD review rules** [small] -- coding-light
- Blocked by: T1
- Description: Update `pi/skills/workflow/review-it.md` so `/review-it PRD.md` performs PRD readiness review rather than treating it as a plan. It should check ambiguity, goals/non-goals, testability, hidden assumptions, scope, contradictions, and readiness for `/plan-it`. Existing plan review behavior for `plan.md` must remain intact.
- Files: `pi/skills/workflow/review-it.md`
- Acceptance Criteria:
  1. [ ] `/review-it` distinguishes `plan.md` review from `PRD.md` review using explicit branch headings or a decision table.
     - Verify: `grep -n "PRD.md\|plan.md" pi/skills/workflow/review-it.md && grep -Eqi "decision table|artifact type|branch" pi/skills/workflow/review-it.md`
     - Pass: both artifact types and their behaviors are documented unambiguously.
     - Fail: add branching rules.
  2. [ ] PRD review criteria include ambiguity, goals/non-goals, testability, hidden assumptions, scope, contradictions, and `/plan-it` readiness.
     - Verify: `grep -Eqi "ambiguity|non-goals|testability|hidden assumptions|scope|contradictions|plan-it" pi/skills/workflow/review-it.md`
     - Pass: criteria are present.
     - Fail: add missing criteria.

### Wave 1 -- Validation Gate

**V1: Validate workflow documentation coherence** [medium] -- qa-engineer
- Blocked by: T1, T2, T3
- Checks:
  1. Run all acceptance criteria for T1, T2, and T3.
  2. Produce `.specs/pi-prd-workflow/review-implementation-dry-run.md` with two evidence cases: a positive sample fuzzy prompt showing trigger → questions → safe slug/path → write confirmation → handoff, and a negative case showing `/plan-it` remains conversation-only when a PRD is unnecessary.
  3. Verify the new PRD flow is self-contained and usable by a fresh agent without hidden conversation context.
  4. Verify no instruction requires users to provide `.specs/{slug}` to create a PRD.
  5. Verify no instruction silently selects the latest filesystem PRD by default.
  6. `make test-quick && make lint` -- fast repo validation passes.
  7. `make check` -- strongest validation passes, unless documented as environment-blocked with exact failure evidence.
- On failure: create a fix task, apply the minimal documentation correction, and re-run affected checks plus repo-wide validation.

## Dependency Graph

```text
Wave 1: T1 → T2, T3 → V1
```

## Success Criteria

1. [ ] A user can say “help me create a PRD” or run `/prd-it` and the skill describes how to guide them from fuzzy idea to `.specs/{auto-slug}/PRD.md` without hijacking incidental PRD mentions.
   - Verify: `grep -E "fuzzy|guided|auto.*slug|\.specs/.*/PRD.md" pi/skills/workflow/prd-it.md && grep -Eqi "incidental|opt-in" pi/skills/workflow/prd-it.md`
   - Pass: all concepts and activation boundaries are present.
2. [ ] `/plan-it` can consume a PRD without making PRDs mandatory.
   - Verify: `grep -E "explicit.*PRD|current.*conversation.*PRD|conversation context" pi/skills/workflow/plan-it.md`
   - Pass: precedence and fallback are documented.
3. [ ] `/review-it` can review PRDs for readiness and still review plans normally.
   - Verify: `grep -E "PRD.*review|plan.md|readiness" pi/skills/workflow/review-it.md`
   - Pass: both review modes are documented.
4. [ ] Workflow dry-run evidence exists and covers positive and negative cases.
   - Verify: `test -f .specs/pi-prd-workflow/review-implementation-dry-run.md && grep -Eqi "positive|negative|confirmation|handoff" .specs/pi-prd-workflow/review-implementation-dry-run.md`
   - Pass: dry-run evidence artifact exists and includes the required cases.
5. [ ] Repo validation passes.
   - Verify: `make test-quick && make lint`
   - Pass: exits 0 with no new warnings.

## Validation Contract

`/do-it` must satisfy this contract before reporting the plan complete or archiving it.

### Automation completeness

- Required: yes
- `/do-it` must be able to run all validation steps through documented shell commands.
- No credentials are required.
- Manual-only steps are not required.

### Required automated validation

1. [ ] Run fast repo validation.
   - Command: `make test-quick && make lint`
   - Pass: exits 0 with no errors or warnings
   - Fail: do not archive; update `## Execution Status` with the failing command and next fix

2. [ ] Run strongest repo-wide validation if practical in the environment.
   - Command: `make check`
   - Pass: exits 0 with no errors or warnings, or environment-only blockers are documented with exact output
   - Fail: do not archive unless the failure is proven unrelated/environmental and documented

3. [ ] Run task-specific verification from every acceptance criterion above.
   - Command: see each task's `Verify:` command
   - Pass: every acceptance criterion passes exactly as written
   - Fail: create/fix a task, rerun affected checks, then rerun repo-wide validation

4. [ ] Verify workflow dry-run evidence.
   - Command: `test -f .specs/pi-prd-workflow/review-implementation-dry-run.md && grep -Eqi "positive|negative|confirmation|handoff" .specs/pi-prd-workflow/review-implementation-dry-run.md`
   - Pass: positive and negative workflow cases are documented with non-secret evidence
   - Fail: do not archive; create the evidence artifact and rerun validation

### Manual validation

- Required: no
- Steps:
  1. None.

### Deployment validation

- Required: no
- Procedure: None.

### Archive rule

`/do-it` may archive this plan only after all required automated validation, task-specific verification, workflow dry-run evidence, and repo-wide validation pass or any environment-only blockers are explicitly documented with evidence.

## Handoff Notes

- Keep edits limited to Pi workflow markdown files unless review identifies a real need for runtime changes.
- Do not create persistent session state for “latest PRD” in this first pass; use explicit PRD paths and current-conversation references in the skill instructions.
- Prefer simple phrasing so the skill can load cheaply and guide behavior without becoming a long product-management manual.

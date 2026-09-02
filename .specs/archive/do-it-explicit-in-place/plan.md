---
created: 2026-09-02
status: complete
completed: 2026-09-02
---

# Enforce explicit do-it execution workspace selection

## Objective

Make `/do-it` start in a fresh session and use an owned implementation worktree by default, permit explicit `--no-clear` and `--in-place` exceptions, expose both flags and active canonical plans through native argument completion, prevent natural-language plan requests from bypassing workflow setup, and require `/plan-it` to record concise parallel-subagent and smaller-model execution hints.

## Completion Evidence

- Evidence: Focused command, parser, session-replacement, workflow-ownership, input-routing, completion, and plan-contract tests prove that default `/do-it` clears into one fresh session and creates or resumes an owned worktree; exact option-prefix `--no-clear` and `--in-place` flags independently suppress only their named defaults; bounded direct-input predicates route canonical-plan execution through the same dispatcher; durable in-place state drives distinct fail-closed closeout; autocomplete presents both flags plus cached active plans; cache refresh follows plan readiness and archival; and new canonical plans contain validated parallel-work and smaller-model assessments.
- Fails when: Default dispatch retains prior conversation context or loops while clearing; failed session replacement mutates Git; commit, merge, squash, branch, rollback, or plan-content wording selects in-place execution; a misplaced, repeated, or abbreviated flag authorizes either exception; current-worktree mode uses owned-worktree merge or cleanup; closeout proceeds with missing or mismatched durable state; archived or completed plans appear in suggestions; autocomplete scans per keystroke; execution hints force delegation or scheduler state; or unrelated tracked or untracked files are changed.

## Boundaries

- In scope: `/do-it` option parsing, default session replacement, execution dispatch, explicit current-worktree state and closeout, bounded direct-input routing, native argument completions, active-plan cache lifecycle, `/plan-it` execution-strategy guidance and validation, focused tests, and owning workflow contracts.
- Out of scope: Herdr or subagent implementation, Ponytail work, generic mutation restrictions for ordinary non-plan coding, global editor keybinding changes, archived plan search, fuzzy completion, changes to `/goal` worktree policy, model-specific hard pins, and treating trusted extensions as a lower-privilege security boundary than the operator.
- Preserve: Existing `/plan-it` primary-repository behavior and review lifecycle, default `/do-it` owned worktree recovery, canonical plan validation and materialization, commit-and-retain policy, unrelated working-tree state, bounded previous-session usage/status notices, Tab acceptance and Up/Down navigation, and literal option text in raw tasks after `--`.
- Assumptions: `getArgumentCompletions` is the supported completion seam. Default clearing uses the existing replacement-session lifecycle before repository mutation and carries the complete normalized request once into the fresh session through a one-use internal continuation marker. In-place execution requires a clean invoking Git worktree for raw work, or one whose only change is the exact canonical plan. Trusted extensions are operator-equivalent at the command API because command input provenance is unavailable.

## Tasks

- [x] **T1: Add explicit execution-mode parsing and enforcement**
  - Files: `pi/extensions/workflow-commands.ts`, `pi/lib/workflow-worktree.ts`, `pi/tests/workflow-dispatch.test.ts`, `pi/tests/workflow-worktree.test.ts`
  - Change: Add one option-prefix grammar for exact `--no-clear` and `--in-place` flags in either order, reject duplicates and abbreviations, and support `--` before literal raw text. Unless `--no-clear` is present, use the existing replacement-session lifecycle before repository discovery or mutation, write a one-use internal continuation entry in the new session, and redispatch the complete normalized request exactly once without exposing internal continuation as operator authorization; cancellation or failure stops without Git state. Keep owned-worktree mode as the default. Before in-place dispatch, require a clean invoking worktree for raw work or allow only the canonical plan as pre-existing dirt. Persist durable in-place identity and add a distinct verifier requiring the same worktree and branch, a committed descendant of baseline, clean state, and completed archive for plans; never create, merge, remove, or inspect another worktree. Add bounded interactive/RPC input routing for an execution verb plus exact canonical path, or `this plan` with one uniquely identified recent canonical plan; extension input cannot mint this route, and commit wording never selects either exception.
  - Done when: Dispatch and reload/resume tests prove one default clear, no recursion, complete raw/canonical argument transfer, preserved bounded prior-usage notices, failure before Git mutation, default worktree ownership, independent flag combinations, durable in-place recovery, invalid-option rejection, literal post-terminator text, wrong-worktree and branch-change rejection, and distinct verification. Input tests cover interactive, RPC, extension exclusion, direct path, unique `this plan`, ambiguous discussion, and the incident wording.
  - Verify: `cd pi && pnpm test workflow-dispatch.test.ts workflow-worktree.test.ts`

- [x] **T2: Add cached do-it argument discovery**
  - Depends on: T1
  - Files: `pi/extensions/workflow-commands.ts`, `pi/lib/workflow-commands/plan-lifecycle.ts`, `pi/tests/workflow-dispatch.test.ts`, `pi/tests/plan-lifecycle.test.ts`
  - Change: Register native `getArgumentCompletions` for `/do-it`. Return `--no-clear`, `--in-place`, and active `.specs/{slug}/plan.md` entries for an empty prefix; filter locally for partial prefixes; suppress already selected flags; and offer remaining flags and plans after either valid flag combination. Build the bounded plan list outside the keystroke path, exclude archives and completed or conflicting plans, and refresh it on session start or reload, successful `/plan-it` readiness, and successful archival. Preserve native Tab acceptance and Up/Down selection rather than changing Right Arrow.
  - Done when: Completion tests cover empty, each flag, both flag orders, path, post-flag, duplicate suppression, and terminator prefixes; active plans appear; archived, completed, conflicting, malformed, and unrelated files do not; readiness adds and archival removes a plan without reload or per-keystroke scanning.
  - Verify: `cd pi && pnpm test workflow-dispatch.test.ts plan-lifecycle.test.ts`

- [x] **T3: Align the public workflow contract and validate the integrated boundary**
  - Depends on: T1, T2
  - Files: `pi/skills/workflow/do-it.md`, `pi/skills/workflow/plan-it.md`, `pi/lib/workflow-commands/plan-lifecycle.ts`, `pi/skills/pi-extension/references/contracts/workflow-lifecycle.md`, `pi/tests/plan-lifecycle.test.ts`
  - Change: Document independent session, workspace, and closeout controls: default clear and worktree; only exact flags suppress those defaults; plan content and commit wording cannot. Define owned/default, owned/retain, in-place/default, and in-place/retain closeout behavior. Extend the canonical plan contract with required `## Execution Strategy` bullets `- Parallel work:` and `- Smaller-model work:`. Each records concrete independent task keys and bounded leaf packages or `None`; smaller-model hints use advisory dynamic sizing and exclude authority-sensitive, integration-owning, or acceptance-gating work. Validate the section for newly readied plans while accepting legacy plans during execution preflight. Document direct-input routing, cache refresh, trusted-extension provenance, and fail-closed recovery.
  - Done when: Workflow guidance, durable mode state, closeout matrix, autocomplete, and tests agree; new standard and quick plans contain concise strategy assessments without forced delegation or scheduler records; legacy ready plans remain executable; and no Herdr, Ponytail, unrelated spec, or working-tree path is changed.
  - Verify: `cd pi && pnpm test workflow-dispatch.test.ts workflow-worktree.test.ts plan-lifecycle.test.ts && pnpm run typecheck && cd .. && git diff --check`

## Validation

- [x] `/do-it <plan>` clears exactly once and creates or resumes an owned worktree; `--no-clear` preserves the session; `--in-place` uses only the invoking worktree; combined flags suppress only their named defaults.
- [x] Invalid or implied in-place requests fail before mutation; the incident phrase "build and apply to main as one squashed commit" routes the uniquely identified current plan through default `/do-it` and cannot authorize in-place execution.
- [x] `/do-it ` completion returns both flags and active plans; partial, combined, duplicate-suppression, terminator, path, and post-flag prefixes filter correctly through cached data.
- [x] Successful `/plan-it` readiness adds its plan to completion immediately, successful archival removes it, and archived, complete, conflicting, or malformed plans remain absent.
- [x] New ready plans contain valid `Execution Strategy` parallel and smaller-model assessments or explicit `None`; execution preflight accepts legacy plans without the section.
- [x] Focused workflow tests, Pi typecheck, and `git diff --check` pass with no changes outside the listed workflow files and this plan.

## Retention

Keep incomplete work at `.specs/do-it-explicit-in-place/plan.md`. After completion, `/do-it` archives this directory to `.specs/archive/do-it-explicit-in-place/`.

## Execution Status

- State: Complete; implementation and validation passed.
- Blocker: None.
- Next: Archive, commit, merge, and verify closeout.
- Resume: `/do-it .specs/do-it-explicit-in-place/plan.md`

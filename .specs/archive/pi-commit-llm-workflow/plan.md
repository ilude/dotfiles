---
created: 2026-04-17
status: draft
completed:
---

# Plan: Pi `/commit` hybrid LLM workflow

## Context & Motivation

Pi currently implements `/commit` directly in `pi/extensions/workflow-commands.ts` as a mostly deterministic TypeScript workflow. It checks status, scans for secrets, lets the user choose staged vs all changed files, proposes a single conventional commit message, and performs the commit/push. That local command does not currently use the canonical Claude commit instructions, does not use an LLM to group files into multiple logical commits, and does not have a shared routing policy for picking a mini model specifically for commit-planning work.

The user wants Pi `/commit` to behave more like their established Claude workflow while still keeping safety-critical parts deterministic. Specifically, Pi should use a mini model (preferably `openai-codex/gpt-5.4-mini`, but any OpenAI or GitHub mini model is acceptable as fallback) for **logical file grouping** and **commit message generation**, while deterministic code continues to handle git inspection, secret scanning, validation, staging, commit execution, and push. The command should generally follow `claude/shared/commit-instructions.md`, but Pi-specific improvements are allowed where they increase determinism or safety.

## Constraints

The user explicitly approved a hybrid design: deterministic execution for safety and correctness, LLM use only where grouping and commit phrasing require judgment. `/commit` should automatically create multiple commits when grouping suggests it. Commands are considered routed intents and should not go through the freeform complexity classifier. The workflow must preserve conventional commit validation, avoid assumptions, and keep a reliable fallback path if model planning fails.

- Platform: Windows (Git Bash / MSYS2 environment)
- Shell: bash for git/repo operations; pwsh available separately
- Use `openai-codex/gpt-5.4-mini` for commit planning when available
- Accept fallback to an OpenAI or GitHub mini model if the preferred model is unavailable
- Use `claude/shared/commit-instructions.md` as the canonical instruction source for LLM planning
- Keep deterministic handling for status, secret scan, staging, commit execution, push, and commit-message validation
- `/commit` should create multiple commits automatically when grouping warrants it
- If model output is invalid, use a safe fallback rather than blindly committing incomplete groups

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Keep current deterministic single-commit `/commit` | Predictable, simple, already works for basic cases | Cannot group files into multiple logical commits well; does not use canonical commit instructions; model choice irrelevant | Rejected: insufficient for desired workflow quality |
| Replace `/commit` entirely with a pure prompt-template command | Reuses existing Claude instructions directly; simple to author | Loses deterministic control over staging, validation, and push; harder to guarantee full file coverage and safe execution | Rejected: too much nondeterminism |
| Hybrid workflow: deterministic execution + LLM grouping/message planning | Best mix of safety and judgment; aligns with user preference; preserves conventional-commit and execution safeguards | Requires new plumbing for command-specific model selection and structured model output validation | **Selected** |
| Add a new `/commit-claude` command and keep current `/commit` unchanged | Low-risk rollout path; preserves old behavior | Splits user mental model; doubles maintenance burden; main command remains inconsistent | Rejected for now: use current `/commit` as the primary UX |

## Objective

Refactor Pi `/commit` so that it:
- plans one or more atomic commit groups with a mini model,
- generates conventional commit messages per group with that model,
- validates and executes each commit deterministically,
- optionally pushes after all commits complete,
- and fits into a broader command-routing architecture where slash commands are routed deterministically rather than classified as freeform prompts.

## Project Context

- **Language**: TypeScript extensions inside a Python/shell dotfiles repo
- **Test command**: `cd /c/Users/mglenn/.dotfiles/pi/tests && npx vitest run`
- **Lint command**: none detected — tasks define targeted verification

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Capture current `/commit` behavior and reusable deterministic pieces | 2 | feature | sonnet | engineering | — |
| T2 | Design command-aware commit-planning model routing with fallback chain | 2-3 | architecture | sonnet | engineering | — |
| V1 | Validate wave 1 | — | validation | sonnet | validation | T1, T2 |
| T3 | Implement LLM commit-plan generation and structured validation | 2-4 | architecture | opus | engineering | V1 |
| T4 | Integrate canonical Claude commit instructions into Pi planning prompt | 2-3 | feature | sonnet | engineering | V1 |
| T5 | Refactor `/commit` execution loop to apply multiple commit groups safely | 2-4 | architecture | opus | engineering | V1 |
| V2 | Validate wave 2 | — | validation | sonnet | validation | T3, T4, T5 |
| T6 | Add tests for grouping, fallback, and command-specific routing behavior | 2-4 | feature | sonnet | engineering | V2 |
| V3 | Validate wave 3 | — | validation | sonnet | validation | T6 |

## Execution Waves

### Wave 1 (parallel)

**T1: Capture current `/commit` behavior and reusable deterministic pieces** [sonnet] — engineering
- Description: Inventory the existing `/commit` workflow in `workflow-commands.ts`, identify which parts stay deterministic, and document where the current single-commit flow needs to expand to support multiple commits.
- Files: `pi/extensions/workflow-commands.ts`, `pi/skills/workflow/commit.md`
- Acceptance Criteria:
  1. [ ] Existing deterministic phases are clearly identified and preserved as explicit responsibilities.
     - Verify: `cd /c/Users/mglenn/.dotfiles && rg -n "prepareCommitSelection|executeCommitCommand|proposeCommitMessage|commitCurrentChanges|pushCurrentBranch" pi/extensions/workflow-commands.ts`
     - Pass: Output identifies the current commit flow building blocks to retain or refactor
     - Fail: Deterministic execution responsibilities remain implicit or mixed into new LLM planning work
  2. [ ] The current limitations relative to the desired workflow are documented.
     - Verify: manual review of the planning notes or design artifact from this task
     - Pass: Notes explicitly mention single-commit bias, lack of LLM grouping, lack of command-model routing, and weak reuse of Claude instructions
     - Fail: The redesign begins without a concrete delta from the current implementation

**T2: Design command-aware commit-planning model routing with fallback chain** [sonnet] — engineering
- Description: Define how `/commit` selects a mini model for LLM planning, preferring `openai-codex/gpt-5.4-mini` and falling back to an available OpenAI or GitHub mini model. The design should fit the broader command-routing architecture without using the freeform classifier.
- Files: `pi/extensions/prompt-router.ts`, `pi/extensions/workflow-commands.ts`, possible shared helper under `pi/lib/`
- Acceptance Criteria:
  1. [ ] The routing design defines a deterministic lookup path for `/commit` planning models.
     - Verify: manual review of design notes or implementation plan artifact
     - Pass: The selected order includes preferred model, fallback candidates, and final fallback behavior if no mini model is found
     - Fail: The design still relies on freeform classifier tiers for `/commit`
  2. [ ] The routing design keeps slash-command routing separate from freeform prompt classification.
     - Verify: `cd /c/Users/mglenn/.dotfiles && rg -n "text.startsWith\(\"/\"\)" pi/extensions/prompt-router.ts`
     - Pass: Current skip behavior remains acknowledged and the new design layers command-specific routing on top
     - Fail: The design implies that `/commit` should be classified like a normal prose prompt

### Wave 1 — Validation Gate

**V1: Validate wave 1** [sonnet] — validation
- Blocked by: T1, T2
- Checks:
  1. Run acceptance criteria for T1 and T2
  2. `cd /c/Users/mglenn/.dotfiles/pi/tests && npx vitest run` — all tests pass if any exploratory implementation landed
  3. `cd /c/Users/mglenn/.dotfiles && rg -n "registerCommand\(\"commit\"|text.startsWith\(\"/\"\)" pi/extensions` — current command boundary and `/commit` entrypoint remain explicit
  4. Cross-task integration: deterministic responsibilities from T1 must align with the command-routing design from T2
- On failure: create a fix task, re-validate after fix

### Wave 2 (parallel)

**T3: Implement LLM commit-plan generation and structured validation** [opus] — engineering
- Blocked by: V1
- Description: Add a commit-planning phase that sends structured commit context to a mini model and requires machine-parseable output (for example JSON with commit groups, file lists, and conventional commit messages). Validate that every changed file is accounted for exactly once or explicitly flagged as ambiguous.
- Files: `pi/extensions/workflow-commands.ts`, possible helper under `pi/lib/`, test fixtures as needed
- Acceptance Criteria:
  1. [ ] The planner requests and parses structured output suitable for deterministic execution.
     - Verify: `cd /c/Users/mglenn/.dotfiles && rg -n "JSON|commit plan|groups|parse" pi/extensions/workflow-commands.ts pi/lib`
     - Pass: Code clearly builds, parses, and validates a structured plan rather than relying on free-form prose
     - Fail: Planner output is too loose to validate automatically
  2. [ ] Validation prevents silent file omission or duplicate file assignment across commit groups.
     - Verify: targeted tests or code inspection of validation logic
     - Pass: The implementation rejects plans that omit changed files or assign one file to multiple groups
     - Fail: Invalid plans can still reach staging/commit execution

**T4: Integrate canonical Claude commit instructions into Pi planning prompt** [sonnet] — engineering
- Blocked by: V1
- Description: Load `claude/shared/commit-instructions.md` as the canonical source material for commit behavior, then wrap/adapt it for Pi so the model is constrained to grouping and message generation instead of directly driving git execution.
- Files: `claude/shared/commit-instructions.md`, `pi/extensions/workflow-commands.ts`, possible prompt helper under `pi/lib/`
- Acceptance Criteria:
  1. [ ] Pi reuses the Claude instructions as planning context instead of duplicating a divergent commit policy.
     - Verify: `cd /c/Users/mglenn/.dotfiles && rg -n "commit-instructions\.md|claude/shared/commit-instructions" pi`
     - Pass: The implementation references the canonical instruction file or a documented wrapper built from it
     - Fail: Pi continues to use a wholly separate undocumented commit prompt
  2. [ ] Pi-specific wrapper text narrows the model's role to grouping and commit-message planning.
     - Verify: manual review of the wrapper/prompt builder code
     - Pass: The prompt clearly says deterministic code will handle staging, execution, and push
     - Fail: The prompt asks the model to directly decide or execute git operations outside its intended scope

**T5: Refactor `/commit` execution loop to apply multiple commit groups safely** [opus] — engineering
- Blocked by: V1
- Description: Update the command to iterate over validated commit groups, stage each group deterministically, confirm or revise commit messages as needed, create multiple commits, and push only after all commits succeed.
- Files: `pi/extensions/workflow-commands.ts`, related tests under `pi/tests/`
- Acceptance Criteria:
  1. [ ] `/commit` can create multiple commits in one run when the planner returns multiple logical groups.
     - Verify: targeted tests and manual dry-run in a repo with multiple logical changes
     - Pass: Separate commits are created in planner order with validated messages
     - Fail: The command collapses everything into one commit or leaves uncommitted tracked files without explicit handling
  2. [ ] Planner failure or invalid output falls back safely.
     - Verify: targeted tests simulating invalid planner output
     - Pass: The command reports the issue and uses a deterministic fallback path or asks for intervention instead of partially committing bad state
     - Fail: The command stages or commits from an invalid/incomplete plan

### Wave 2 — Validation Gate

**V2: Validate wave 2** [sonnet] — validation
- Blocked by: T3, T4, T5
- Checks:
  1. Run acceptance criteria for T3, T4, and T5
  2. `cd /c/Users/mglenn/.dotfiles/pi/tests && npx vitest run` — all tests pass
  3. `cd /c/Users/mglenn/.dotfiles && rg -n "registerCommand\(\"commit\"|commit-instructions\.md|gpt-5\.4-mini|github" pi/extensions pi/lib`
     - no broken references; command routing and planner wiring are discoverable
  4. Cross-task integration: model routing, prompt construction, plan validation, and execution loop work together without bypassing deterministic safeguards
- On failure: create a fix task, re-validate after fix

### Wave 3

**T6: Add tests for grouping, fallback, and command-specific routing behavior** [sonnet] — engineering
- Blocked by: V2
- Description: Add or update tests covering commit planning output validation, model fallback selection, multiple commit execution behavior, and slash-command-specific routing assumptions.
- Files: `pi/tests/`, `pi/extensions/workflow-commands.ts`, possible shared routing helper tests
- Acceptance Criteria:
  1. [ ] Tests cover valid multi-group plans, invalid plans, and no-mini-model fallback behavior.
     - Verify: `cd /c/Users/mglenn/.dotfiles/pi/tests && npx vitest run --reporter=verbose`
     - Pass: Relevant new tests pass and clearly exercise the added behavior
     - Fail: New functionality exists without targeted regression coverage
  2. [ ] Tests preserve the rule that slash commands are routed without freeform classification.
     - Verify: test names and assertions explicitly cover command-entry routing behavior
     - Pass: There is a regression guard against accidentally classifying `/commit` like normal input
     - Fail: Future refactors could silently reintroduce classifier-based command routing

### Wave 3 — Validation Gate

**V3: Validate wave 3** [sonnet] — validation
- Blocked by: T6
- Checks:
  1. Run acceptance criteria for T6
  2. `cd /c/Users/mglenn/.dotfiles/pi/tests && npx vitest run` — all tests pass
  3. `cd /c/Users/mglenn/.dotfiles && git diff --stat -- pi/extensions/workflow-commands.ts pi/tests` — change footprint matches tested surface area
  4. Cross-task integration: regression coverage maps to the behavior introduced in waves 1 and 2
- On failure: create a fix task, re-validate after fix

## Dependency Graph

```
Wave 1: T1, T2 (parallel) → V1
Wave 2: T3, T4, T5 (parallel) → V2
Wave 3: T6 → V3
```

## Success Criteria

1. [ ] Pi `/commit` can create one or more logical commits using LLM-generated grouping and commit messages while deterministic code handles execution.
   - Verify: manual run of `/commit` in a repo with multiple logical changes, plus `git log --oneline -n 5`
   - Pass: Output shows multiple well-scoped conventional commits when appropriate, with no missed tracked files
2. [ ] `/commit` uses a mini model through deterministic command routing rather than freeform classifier routing.
   - Verify: inspect routing/selection code and, if available, surface selected model in command diagnostics or temporary logging during testing
   - Pass: The planner uses `gpt-5.4-mini` or an explicit mini fallback path, and slash-command routing never goes through the normal complexity classifier

## Handoff Notes

This plan assumes the preferred first step toward a broader command-routing architecture is to establish shared command-aware model selection through `/commit`. If implementation reveals that the current `workflow-commands.ts` structure is too rigid, introducing a helper under `pi/lib/` is preferred over embedding more routing logic directly into `workflow-commands.ts`.
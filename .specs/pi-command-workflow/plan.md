---
created: 2026-05-08
status: draft
completed:
---

# Plan: Pi command authoring workflow

## Context & Motivation

A prompt-only `/handoff` command was implemented in `pi/extensions/workflow-commands.ts`, then the conversation established that Pi already has native prompt templates with slash-command autocomplete, frontmatter, `argument-hint`, and argument substitution. The initial TypeScript implementation works, but it is the wrong abstraction for a markdown-only workflow. This plan moves `/handoff` to a native prompt template and adds durable guidance so future agents choose the correct command surface.

## Constraints

- Platform: Windows via Git Bash/MSYS2 (`MINGW64_NT-10.0-26200`)
- Shell: `/usr/bin/bash`
- Pi TypeScript validation is pnpm-only: use `cd pi/extensions && pnpm run typecheck`; do not use Bun for Pi extension checks.
- Pi docs say prompt templates load from global/project/package/settings/CLI sources and Settings supports a `prompts` array, but implementation must still verify the exact runtime-supported schema/path behavior before editing `pi/settings.json`.
- Extension commands run before prompt templates; any top-level `pi/extensions/*.ts` registering `handoff` shadows `pi/prompts/handoff.md`.
- Migrating `/handoff` from TypeScript to a prompt template intentionally gives up `echoSlashCommand()` and `sendHiddenWorkflowPrompt()` behavior unless runtime inspection proves native prompt templates provide equivalent echo/hidden dispatch. The accepted behavior is native template expansion as a visible user prompt with TUI autocomplete.
- Keep logic-heavy commands TypeScript-backed: `/commit`, `/branch`, `/clear`, `/exit`, `/permissions`, `/test-*`, `/provider`, `/doctor`, `/router-*`.
- Current working tree had a newline-only modification to `pi/settings.json` when this plan was created; preflight must snapshot existing diff before editing and preserve unrelated changes.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Keep prompt-only commands in `workflow-commands.ts` | Minimal change; already works | Requires TS edits for simple prompts and hides native prompt-template support | Rejected: wrong abstraction for markdown-only commands |
| Use native prompt templates from tracked `pi/prompts/` | Uses Pi slash autocomplete/frontmatter/argument substitution; simple to author | Requires verified settings/runtime loading and collision checks | **Selected** |
| Build a new `pi/commands/` loader now | Supports future TS command folders with helpers | Larger architectural change before proving native prompt-template workflow | Rejected for this plan; revisit later |
| Put everything into skills | Skills are reusable and discoverable | Skills are not the same as prompt templates and may not be slash-command templates | Rejected for prompt-only commands; use a skill to guide authorship |

Trend-bias check: if a command needs runtime state mutation, UI notifications, custom autocomplete, git operations, or session lifecycle control, the opposite pattern is correct here--use TypeScript, not markdown.

## Objective

Create a verified Pi command-authoring workflow where prompt-only slash commands live as native prompt templates, TypeScript commands remain for runtime logic, and future agents are guided by a `pi-command` skill. First migration: move `/handoff` out of `workflow-commands.ts` and into `pi/prompts/handoff.md` without leaving an extension command that shadows it.

## Project Context

- **Language**: Python/shell repo with Pi TypeScript extensions under `pi/extensions`; markers detected: `pyproject.toml`, `Makefile`, `.gitattributes`.
- **Test command**: `make test` for repo-wide tests; task-specific Pi extension check is `cd pi/extensions && pnpm run typecheck`.
- **Lint command**: `make lint`; task-specific checks include JSON parsing, frontmatter checks, collision grep, and prompt registry/manual smoke validation.

## Automation Plan

| Operation | Command/wrapper | Credentials | Evidence |
|-----------|-----------------|-------------|----------|
| Preflight snapshot | `git status --short && git diff -- pi/settings.json > .specs/pi-command-workflow/settings-preflight.diff` | none | pre-existing settings diff captured |
| Verify prompt settings schema | inspect Pi docs/source for Settings `prompts` and path expansion; cite file/line in plan status | none | source/doc path recorded in `## Execution Status` |
| Configure prompt discovery | edit `pi/settings.json` only after schema verification | none | `python -m json.tool pi/settings.json >/dev/null` and registry/manual smoke passes |
| Migrate `/handoff` | create `pi/prompts/handoff.md`; remove `/handoff` registration and `HANDOFF_PROMPT` from `workflow-commands.ts` | none | template frontmatter checks; all-extension collision scan clean |
| Add authoring guidance | add `pi-command` skill in verified loader-supported/source location | none | skill location decision and inventory/source evidence recorded |
| Verify | `cd pi/extensions && pnpm run typecheck`; JSON/frontmatter/collision checks; prompt registry or manual TUI smoke | none | commands exit 0 and smoke evidence recorded |
| Repo-wide validation | `make check` | none | archive-blocking unless captured environment blocker plus compensating targeted checks |
| Deploy | not applicable | none | none |
| Safe rollback before commit | restore tracked files from git only after reviewing `.specs/pi-command-workflow/settings-preflight.diff`; remove new files with `rm -f pi/prompts/handoff.md pi/skills/pi-command/SKILL.md` if those are still untracked | none | unrelated pre-existing settings diff preserved or explicitly confirmed discarded |

## Execution Checklist

This checklist is the durable resume ledger for `/do-it`. Every executable task, validation gate, and final completion gate has exactly one matching checkbox. Checked means verified complete; unchecked means pending, in-progress, blocked, or invalidated.

`/do-it` must mark each item `[x]` immediately after that item passes its required verification and before starting any dependent or next sequential step. `/review-it` must preserve checked state, add unchecked items for new executable work, and never mark implementation or validation work complete.

### Wave 0

- [ ] P0: Capture preflight state
  - Status: pending
  - Evidence: --

### Wave 1

- [ ] T0: Verify Pi prompt-template and skill discovery schemas
  - Status: pending
  - Evidence: --
- [ ] T1: Wire tracked Pi prompt-template discovery
  - Status: pending
  - Evidence: --
- [ ] T2: Migrate `/handoff` to a prompt template
  - Status: pending
  - Evidence: --
- [ ] T3: Add `pi-command` authoring skill
  - Status: pending
  - Evidence: --
- [ ] V1: Validate wave 1
  - Status: pending
  - Evidence: --

### Wave 2

- [ ] T4: Update command-surface documentation and cleanup notes
  - Status: pending
  - Evidence: --
- [ ] V2: Validate wave 2
  - Status: pending
  - Evidence: --

### Final Gates

- [ ] F1: Task-specific verification complete
  - Status: pending
  - Evidence: --
- [ ] F2: Repo-wide validation complete
  - Status: pending
  - Evidence: --
- [ ] F3: Manual validation complete or not required
  - Status: pending
  - Evidence: --
- [ ] F4: Deployment validation complete or not required
  - Status: pending
  - Evidence: --
- [ ] F5: Archive preflight complete
  - Status: pending
  - Evidence: --

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| P0 | Capture preflight state | 1 artifact (`.specs/pi-command-workflow/settings-preflight.diff`) | mechanical | small | utility-mini | -- |
| T0 | Verify Pi prompt-template and skill discovery schemas | 0-1 | research | small | utility-mini | P0 |
| T1 | Wire tracked Pi prompt-template discovery | 1 (`pi/settings.json`) | mechanical | small | typescript/config specialist | T0 |
| T2 | Migrate `/handoff` to a prompt template | 2 (`pi/prompts/handoff.md`, `pi/extensions/workflow-commands.ts`) | feature | medium | typescript specialist | T0 |
| T3 | Add `pi-command` authoring skill | 1 (`pi/skills/pi-command/SKILL.md` or verified path) | feature | medium | skills engineer | T0 |
| V1 | Validate wave 1 | -- | validation | medium | validation lead | T1, T2, T3 |
| T4 | Update command-surface documentation and cleanup notes | 1-2 (exact docs chosen after inspection) | feature | medium | docs specialist | V1 |
| V2 | Validate wave 2 | -- | validation | medium | validation lead | T4 |

## Execution Waves

### Wave 0

**P0: Capture preflight state** [small] -- utility-mini
- Description: Capture current git state and the pre-existing `pi/settings.json` diff before any implementation edits, so rollback and archive checks can distinguish plan changes from unrelated local state.
- Files: `.specs/pi-command-workflow/settings-preflight.diff`
- Acceptance Criteria:
  1. [ ] Preflight state is captured before edits.
     - Verify: `git status --short && git diff -- pi/settings.json > .specs/pi-command-workflow/settings-preflight.diff && test -f .specs/pi-command-workflow/settings-preflight.diff`
     - Pass: status is reviewed and the settings preflight diff artifact exists before T0/T1/T2/T3 modify files.
     - Fail: edits begin before preflight evidence is captured.

### Wave 1a

**T0: Verify Pi prompt-template and skill discovery schemas** [small] -- utility-mini
- Blocked by: P0
- Description: Inspect Pi docs/source and current repo conventions before implementation. Confirm exact settings key for prompt templates, path expansion behavior, whether `pi/skills/<name>/SKILL.md` is runtime-discovered or source-only, and a way to verify command registry/autocomplete.
- Files: read-only unless documenting findings in `## Execution Status`
- Acceptance Criteria:
  1. [ ] Prompt-template loading schema is verified before `pi/settings.json` is edited.
     - Verify: cite a Pi doc/source path that states Settings `prompts` or another exact mechanism loads prompt templates.
     - Pass: `## Execution Status` records the mechanism and path evidence.
     - Fail: no source evidence; stop and ask whether to use a `resources_discover` extension instead.
  2. [ ] Skill discovery/source placement is verified.
     - Verify: inspect `pi/extensions/skill-loader.ts`, `pi/lib/skill-discovery.ts`, and/or Pi docs for loaded roots.
     - Pass: plan execution records whether `pi/skills/pi-command/SKILL.md` is runtime-loaded, source-only, or needs a link/install step.
     - Fail: skill path remains guesswork.

### Wave 1b (parallel after T0)

**T1: Wire tracked Pi prompt-template discovery** [small] -- typescript/config specialist
- Blocked by: T0
- Description: Configure tracked prompt templates under `pi/prompts/` using the verified mechanism. Preserve valid JSON, final newline, and unrelated pre-existing `pi/settings.json` changes.
- Files: `pi/settings.json`
- Acceptance Criteria:
  1. [ ] Pi has a tracked prompt-template directory configured with verified schema.
     - Verify: `python -m json.tool pi/settings.json >/dev/null` plus the schema-specific check identified by T0.
     - Pass: settings parse and reference `~/.dotfiles/pi/prompts` or an equivalent tracked path using a supported key.
     - Fail: JSON parse error, unsupported key, or runtime path ignored.

**T2: Migrate `/handoff` to a prompt template** [medium] -- typescript specialist
- Blocked by: T0
- Description: Create `pi/prompts/handoff.md` with native prompt-template frontmatter and body equivalent to the requested handoff command. Use `$ARGUMENTS` to preserve optional next-session focus. Remove extension-backed `/handoff` registration and `HANDOFF_PROMPT` so templates are not shadowed.
- Files: `pi/prompts/handoff.md`, `pi/extensions/workflow-commands.ts`
- Acceptance Criteria:
  1. [ ] Handoff template has valid frontmatter and argument handling.
     - Verify: check `pi/prompts/handoff.md` starts with `---`, contains `description:`, `argument-hint:`, closes frontmatter, includes `$ARGUMENTS`, and includes `mktemp -t handoff-XXXXXX.md` plus read-before-write instruction.
     - Pass: structural checks pass and optional focus args are represented via `$ARGUMENTS`.
     - Fail: missing/invalid frontmatter or behavior drift.
  2. [ ] No extension command shadows `/handoff`.
     - Verify: `! grep -R 'registerCommand("handoff"\|HANDOFF_PROMPT' pi/extensions/*.ts`
     - Pass: no matches in auto-discovered top-level extensions.
     - Fail: any extension registration/constant remains.
  3. [ ] Prompt-template content safety reviewed.
     - Verify: manually inspect `pi/prompts/handoff.md` for destructive commands, secret exposure, unsafe environment-wide mutation, or exfiltration instructions.
     - Pass: no unsafe instruction beyond writing the requested temp handoff file.
     - Fail: unsafe command/prompt behavior remains.

**T3: Add `pi-command` authoring skill** [medium] -- skills engineer
- Blocked by: T0
- Description: Add a skill in the verified repo/source location. It must activate when creating, reviewing, or relocating Pi slash commands and include a concrete placement decision table, collision warning, and worked examples.
- Files: `pi/skills/pi-command/SKILL.md` or another T0-verified path
- Acceptance Criteria:
  1. [ ] Skill exists with unambiguous placement rules.
     - Verify: `grep -n 'pi/prompts/.*\.md' <skill> && grep -n 'pi/skills/.*/SKILL.md' <skill> && grep -n 'TypeScript' <skill>`.
     - Pass: decision table covers prompt-only slash command, reusable domain workflow, and runtime/state/UI/autocomplete/git/session command.
     - Fail: guidance remains vague.
  2. [ ] Skill warns about extension precedence and includes worked examples.
     - Verify: grep for `workflow-commands.ts`, `registerCommand`, `/handoff`, `/commit`, and `shadow` or `precedence`.
     - Pass: future authors are told not to add prompt-only commands to `workflow-commands.ts` and to search for collisions first.
     - Fail: recurrence risk remains.

### Wave 1 -- Validation Gate

**V1: Validate wave 1** [medium] -- validation lead
- Blocked by: T1, T2, T3
- Checks:
  1. Run all acceptance criteria for T0, T1, T2, and T3.
  2. `cd pi/extensions && pnpm run typecheck` -- Pi TypeScript compiles after removing `/handoff` extension code.
  3. `python -m json.tool pi/settings.json >/dev/null` -- settings remain valid JSON.
  4. Cross-task integration: confirm `pi/prompts/handoff.md` is in a configured prompt path and no top-level extension shadows `/handoff`.
  5. Runtime discovery: if an automated Pi `get_commands`/registry check is available, verify `handoff` source is `prompt`; otherwise mark F3 manual validation required and record exact manual smoke instructions.
- On failure: create a fix task, re-validate after fix.

### Wave 2

**T4: Update command-surface documentation and cleanup notes** [medium] -- docs specialist
- Blocked by: V1
- Description: Inspect existing docs and update the exact tracked command-surface guidance file(s). Consider `AGENTS.md` for repo-wide agent guidance, `pi/AGENTS.md` for Pi-specific agent guidance, `pi/README.md` for source-vs-runtime/user documentation, and `pi/extensions/README.md` for extension authoring details. Document prompt-only templates versus TypeScript runtime commands and warn that top-level `pi/extensions/*.ts` files are auto-discovered.
- Files: exact tracked docs chosen after inspection; must include an agent-facing guidance file (`AGENTS.md` or `pi/AGENTS.md`) unless inspection proves another loaded agent guidance file is more authoritative.
- Acceptance Criteria:
  1. [ ] Documentation explains the three-way command placement decision in both author docs and agent-facing guidance.
     - Verify: targeted grep in edited docs for `prompt-only`, `pi/prompts`, `TypeScript`, and `runtime`; additionally grep the selected agent-facing guidance file for `pi-command` or `Pi command`.
     - Pass: at least one tracked author doc and one loaded/agent-facing guidance file explain prompt-only templates versus TypeScript runtime commands.
     - Fail: convention exists only in the skill or only in human docs that agents may not read.

### Wave 2 -- Validation Gate

**V2: Validate wave 2** [medium] -- validation lead
- Blocked by: T4
- Checks:
  1. Run T4 acceptance criteria.
  2. Re-run `cd pi/extensions && pnpm run typecheck`.
  3. Re-run `python -m json.tool pi/settings.json >/dev/null`.
  4. Run all collision/frontmatter checks from T2.
  5. Review `git diff -- pi/extensions/workflow-commands.ts pi/settings.json pi/prompts/handoff.md pi/skills/pi-command/SKILL.md pi/extensions/README.md pi/AGENTS.md` for unrelated changes, allowing absent paths as appropriate.
- On failure: create a fix task, re-validate after fix.

## Dependency Graph

```
Wave 0: P0
Wave 1a: P0 → T0
Wave 1b: T1, T2, T3 (parallel after T0) → V1
Wave 2: T4 → V2
Final: V2 → F1, F2, F3, F4, F5
```

## Success Criteria

1. [ ] `/handoff` is authored as a native prompt template and not as an extension command.
   - Verify: `test -f pi/prompts/handoff.md && ! grep -R 'registerCommand("handoff"\|HANDOFF_PROMPT' pi/extensions/*.ts`
   - Pass: template exists and no extension-backed `/handoff` remains.
2. [ ] Pi can discover tracked prompt templates using a verified mechanism.
   - Verify: settings/schema evidence from T0 plus `python -m json.tool pi/settings.json >/dev/null` and registry/manual smoke evidence.
   - Pass: `/handoff` is discoverable as a prompt template after reload, or manual smoke is recorded.
3. [ ] Future agents have durable guidance for placing Pi commands correctly.
   - Verify: skill and docs include the placement table, collision warning, `/handoff` prompt-template example, and `/commit` TypeScript example.
   - Pass: guidance is specific enough to prevent prompt-only commands being added to `workflow-commands.ts`.
4. [ ] TypeScript command code still compiles.
   - Verify: `cd pi/extensions && pnpm run typecheck`
   - Pass: exits 0.

## Validation Contract

`/do-it` must satisfy this contract before reporting the plan complete or archiving it.

### Automation completeness

- Required: yes
- `/do-it` must run all agent-runnable validation steps through documented commands.
- No credentials are required.
- Manual validation is required unless V1 records an automated registry check proving `/handoff` is discoverable from the prompt-template source.

### Required automated validation

1. [ ] Run task-specific validation.
   - Command: `cd pi/extensions && pnpm run typecheck && python -m json.tool pi/settings.json >/dev/null`
   - Pass: exits 0 with no errors or warnings.
   - Fail: do not archive; update `## Execution Status` with the failing command and next fix.

2. [ ] Run task-specific acceptance checks from every task above.
   - Command: see each task's `Verify:` command.
   - Pass: every acceptance criterion passes exactly as written.
   - Fail: create/fix a task, rerun affected checks, then rerun validation.

3. [ ] Run repo-wide validation.
   - Command: `make check`
   - Pass: exits 0 with no errors or warnings.
   - Fail: archive is blocked unless output is captured, failure is classified as unrelated/environmental, and compensating targeted checks from this plan pass.

### Manual validation

- Required: conditional; required if no automated command-registry check proves prompt-template discovery.
- Steps:
  1. Reload/restart Pi.
  2. Type `/hand` in the TUI.
  3. Confirm `/handoff` appears with the prompt-template description and argument hint.
  4. Invoke `/handoff test focus` in a disposable session or use an available dry-run/registry view, and confirm the submitted prompt includes the focus via `$ARGUMENTS`, the `mktemp -t handoff-XXXXXX.md` instruction, and read-before-write instruction.

If required manual validation is not confirmed passed, `/do-it` must classify the result as `implemented-awaiting-manual-validation`, update `## Execution Status`, and must not archive the plan.

### Deployment validation

- Required: no
- Procedure: None.

If deployment is required later and skipped, cancelled, or fails, `/do-it` must not archive the plan.

### Archive rule

`/do-it` may archive this plan only after all required automated validation, task-specific verification, manual validation when required, deployment validation, repo-wide validation or documented compensating validation, prompt-template content safety review, and archive preflight pass.

### Archive preflight (F5) pass/fail criteria

Before marking F5 complete or archiving, verify:

1. All implementation tasks, validation gates, and final gates F1-F4 are checked or explicitly marked not required with evidence.
2. `## Execution Status` records final validation command outputs or artifact paths.
3. `git status --short` has been reviewed and only intended changes remain.
4. Targeted `git diff` for edited files has been reviewed for unrelated changes.
5. `.specs/pi-command-workflow/settings-preflight.diff` was used to preserve, intentionally absorb, or explicitly resolve any pre-existing `pi/settings.json` diff.
6. Plan state is not `implemented-awaiting-manual-validation`.

Fail F5 if any required evidence is missing, unrelated changes are unresolved, or required manual validation remains pending.

## Handoff Notes

- A commit already exists for the initial TypeScript `/handoff` implementation (`feat(pi): add handoff workflow command`), but this plan intentionally supersedes that design.
- Do not use Bun in `pi/extensions` or `pi/tests`.
- If settings-based prompt discovery does not work as documented, stop and choose between native `.pi/prompts`, package prompt configuration, or a tiny `resources_discover` extension; do not invent an unverified loader.
- Be careful with command collisions: extension commands are processed before templates.
- Preserve unrelated `pi/settings.json` preflight diff unless the user explicitly approves absorbing/discarding it.

## Execution Status

- Created: 2026-05-08
- Review status: review fixes applied from `.specs/pi-command-workflow/review-1/synthesis.md`
- Current state: ready for `/do-it` execution after standalone-readiness check
- Evidence log: pending implementation

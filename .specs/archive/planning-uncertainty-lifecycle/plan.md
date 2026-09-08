---
created: 2026-09-08
status: completed
completed: 2026-09-08
---

# Clarify planning decisions and worktree integration

## Scope and authorization

Implement the operator-approved default planning skill/template changes: consequential uncertainty gets focused questions and recommendations; investigations stay bounded; simplification preserves required functions; handoffs replace stale status. Execute plans in task worktrees and integrate completed changes with archived plans.

Authorized: local task commits and merge to `main`. No push, deployment, runtime changes, legacy changes, or migration of existing plans. Preserve the original AIF-014 feedback while incorporating its approved decision.

## Context

Paths are relative to the dotfiles repository root. Read root instructions, `pi/profiles/default/skills/{planning,agent-process}/SKILL.md`, the planning template, feedback/failure logs, and relevant vault scope/stopping research. Installed Pi skills documentation describes the unchanged skill format.

- Worktree: `.worktrees/planning-uncertainty-lifecycle`
- Task branch: `docs/planning-uncertainty-lifecycle`
- Merge target: `main`, starting at `f74c545f`
- Planning/execution profile: default, verified from `PI_CODING_AGENT_DIR`, mapped to `pi/profiles/default/` by the launcher documentation.
- Verification: prose and Git only; no runtime or model-behavior test claim.

## Tasks and evidence

- [x] **T1: Update existing skill and template guidance.** Preserve scope/validation boundaries and explicit Git restrictions. Done when uncertainty and execution/closeout guidance agree without a new phase or system.
  - Evidence: Updated in the task worktree, together with the corresponding `pi/README.md` summary, AIF-014 decision, and root changelog.
- [x] **T2: Review guidance.** Review the scoped diff for contradictory authorization, unnecessary requirements, and preservation mistakes; run `git diff --check`.
  - Evidence: Prose review and whitespace check passed. Clarified that blocked integration differs from unfinished implementation. Existing instructions and legacy remain unchanged.

## Handoff

Implementation and prose validation complete. This dated archive is included with the changes for local merge to `main`. The integrating session verifies the target contains this archive and changes before removing its clean task worktree; Git history records actual integration. No known blocker. No runtime checks were warranted for prose-only changes; effectiveness on later planning sessions remains unverified.

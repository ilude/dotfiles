# Phase 2 Expertise-to-Skills/AGENTS Migration Walkthrough

## Purpose

Plan an interactive migration from opaque expertise logs/tools to durable, inspectable instruction files. This artifact does **not perform the migration**; migration is deferred until the user reviews categories and destinations.

## Current expertise sources to inventory

- Pi expertise JSONL logs such as `*-expertise-log.jsonl` and category snapshots.
- Existing `read_expertise` / `append_expertise` tool data and retrieval behavior.
- Any mental-model or local note files that currently substitute for project instructions.
- Existing global `~/.pi/agent/AGENTS.md`, compatibility `~/.pi/AGENTS.md`, repo `AGENTS.md`, and client-specific instruction files.

## Classification rubric

Classify each expertise entry into exactly one destination:

1. **User/global skill**
   - Stable, cross-repo behavior or operating preference.
   - Useful across many projects and not tied to one repository path.
2. **Project `.pi/skills/` skill**
   - Reusable project-local procedure with an activation trigger.
   - Too detailed or workflow-specific for root `AGENTS.md`.
3. **Project root `AGENTS.md`**
   - Repo-wide architecture, commands, conventions, validation rules, or safety constraints.
   - Should be loaded for most work in the project.
4. **Subdirectory `AGENTS.md`**
   - Local rules that only apply under a path such as `pi/`, `claude/`, `opencode/`, `wsl/`, or `docs/research/`.
5. **Archive/delete/ignore**
   - Stale facts, one-off observations, superseded decisions, or data that should not become instructions.

## Inventory process

1. Export or read expertise entries in a sanitized local-only way.
2. Group entries by category: pattern, strong_decision, key_file, observation, open_question, and system_overview.
3. Deduplicate entries that already exist in `AGENTS.md`, skills, README files, or tests.
4. Apply the classification rubric and produce a review table with proposed destination and rationale.
5. Ask the user to approve, edit, or reject each category group before any file writes.

## User review questions

- Which entries are personal operating preferences versus repository facts?
- Which repo facts should be root-level `AGENTS.md` rules versus scoped subdirectory rules?
- Which repeated procedures deserve a user/global skill or project `.pi/skills/` skill?
- Which expertise entries are stale enough to archive/delete/ignore?
- Should compatibility with Claude/OpenCode/Codex instruction surfaces be preserved for each destination?

## Safe migration rules

- Do not delete expertise logs during initial migration; keep rollback simple.
- Prefer additive edits first, then remove duplicates only after user approval.
- Preserve source references for migrated strong decisions and key files.
- Keep generated skills small, triggerable, and inspectable.
- Validate changed markdown and any affected Pi skill loading tests before considering migration complete.

## Rollback

- Before commit: restore edited `AGENTS.md` and skill files with `git restore -- <paths>`.
- After commit: use `git revert <commit>`.
- Expertise logs remain intact until the user explicitly approves deletion or archival.

## Deferred status

Deferred: this artifact is a walkthrough plan only and does not perform the migration.

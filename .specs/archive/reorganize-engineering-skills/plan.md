---
created: 2026-09-01
status: complete
completed: 2026-09-01
---

# Reorganize engineering workflow skills

## Objective

Reorganize the tracked Pi and Claude engineering skills so parsed skill metadata and agent assignments give active approach selection, edit consistency, architecture design, planning, and correctness review one functional owner each, while Pi's retrospective churn method remains available through `pi-log-analytics` without a general engineering skill or shared client implementation.

## Completion Evidence

- Evidence: Repository-backed discovery finds `analysis-workflow` for approach selection, `least-astonishment` for focused edits, and `architecture-design` for structural design in both clients; parsed modifying-agent assignments include approach-selection and edit-consistency owners; the three activation descriptions state distinct positive scopes and exclusions; correctness review exposes an explicit-request complexity lens; `pi-log-analytics` conditionally references the complete RG-1 through RG-4 churn method and queries; analyzer intent mappings, stale-reference checks, focused tests, reference inspection, and diff checks pass.
- Fails when: `development-philosophy` or `overengineering-churn-monitor` remains discoverable or appears in active agent, skill, or analyzer routing; an activation description combines ordinary approach selection, edit consistency, and architecture design; parsed agent assignments omit an intended owner; any RG failure class, manual check, screening step, interpretation constraint, or bounded-query rule is lost; a changed relative reference is broken; Pi and Claude use a shared or symlinked implementation; protected primary-working-tree content is incorporated or changed; a focused check fails; or the reorganization adds Ponytail runtime modes, marker state, debt ledgers, evaluation machinery, compatibility aliases, or other unrequested workflow state.

## Boundaries

- In scope: Tracked Pi and Claude engineering skill entrypoints and owned references, the exact agent assignments listed below, a parsed taxonomy test, Claude skill-analyzer intent mappings and their focused test, migration of Pi churn diagnostics under `pi-log-analytics`, and the Ponytail ownership record.
- Out of scope: Root or client safety-policy rewrites; Pi runtime behavior; deterministic claims about model activation beyond parsed metadata and analyzer mappings; new evaluation frameworks, telemetry, modes, marker files, debt schemas, compatibility aliases, or cross-client adapters; unrelated documentation; `.specs/herdr-visible-subagents/`, `.specs/pi-browser-profile-control/`, `pi/README.md`, `pi/prompts/ponytail-updates.md`, `pi/skills/browser-tools/`, `.tmp/`, modules, and every other pre-existing primary-working-tree change.
- Preserve: Independent Pi and Claude ownership with no shared skill symlinks; existing safety, damage-control, validation, accessibility, cleanup, public interfaces, and client-specific tool guidance; progressive disclosure for newly moved detailed procedures; Git history through ordinary moves; the primary working tree remains untouched while implementation and validation occur in the worktree created and owned by `/do-it`.
- Assumptions: Tracked skill files at the implementation worktree's base commit are the canonical migration inputs; untracked primary-working-tree skill content is operator-owned and must not be copied into the worktree; tracked active references can be updated in their owning client without old-name aliases.

## Tasks

- [x] **T1: Prove the Pi ownership split**
  - Files: `pi/skills/analysis-workflow/SKILL.md`, `pi/skills/analysis-workflow/solution-selection.md`, `pi/skills/development-philosophy/SKILL.md`, `pi/skills/development-philosophy/architecture-review.md`, `pi/skills/development-philosophy/codebase-design.md`, `pi/skills/architecture-design/`, `pi/skills/least-astonishment/SKILL.md`, `pi/agents/developer.md`, `pi/skills/planning/SKILL.md`, `pi/skills/domain-modeling/SKILL.md`, `pi/skills/typed-agent-workflows/SKILL.md`, `pi/tests/engineering-skill-taxonomy.test.ts`
  - Change: In the `/do-it`-owned worktree, make `analysis-workflow` the concise approach-selection owner, with positive scope for analysis, diagnosis, adversarial critique, and solution selection and exclusions for diff review, architecture design, planning, and routine edit consistency. Add a conditional solution-selection reference for evidence-based reuse and minimal implementation. Keep `least-astonishment` as the focused edit owner and exclude architecture strategy. Replace the old skill entrypoint with `architecture-design`, moving `architecture-review.md` and `codebase-design.md` there and limiting its scope to module, interface, seam, dependency, and structural design. Update `developer.md` to assign `analysis-workflow` and `least-astonishment`, update the three named live references, and add a repository-backed test that uses the existing parser on the tracked Pi skill root and parsed developer assignment. The test shall verify owner presence, removed-owner absence, and assignment metadata without asserting policy prose or file layout. Stop immediately if this smallest slice cannot pass without duplicate owners, aliases, runtime machinery, or files outside this task.
  - Done when: Pi discovery contains the three intended owners and excludes `development-philosophy`, parsed developer assignments contain the two modifying owners, the three descriptions have the stated boundaries on inspection, and the focused test passes without broader migration work.
  - Verify: `cd pi && pnpm test engineering-skill-taxonomy.test.ts -t "Pi taxonomy"`

- [x] **T2: Finish Pi-owned references and diagnostics**
  - Depends on: T1
  - Files: `pi/skills/development-philosophy/security-first.md`, `pi/skills/development-philosophy/documentation.md`, `pi/skills/analysis-workflow/security-analysis.md`, `pi/skills/docs/`, `pi/skills/code-review/SKILL.md`, `pi/skills/overengineering-churn-monitor/`, `pi/skills/pi-log-analytics/SKILL.md`, `pi/skills/pi-log-analytics/overengineering-churn.md`, `pi/docs/pi-research-report.md`, `pi/docs/upstream/ponytail.md`
  - Change: Move `security-first.md` to a conditional analysis reference. Compare `documentation.md` with the existing `docs` owner, merge only unique durable guidance, then delete the duplicate and empty old directory. Add the explicit-request complexity lens directly to `code-review/SKILL.md`; create no separate reference unless the resulting entrypoint demonstrates a concrete progressive-disclosure need. Consolidate every RG-1 through RG-4 definition, required manual check, screening step, interpretation constraint, bounded analytics rule, and query from both churn-monitor files into `pi-log-analytics/overengineering-churn.md`; link it conditionally from `pi-log-analytics/SKILL.md`, retain historical baselines and provenance in `pi/docs/pi-research-report.md`, remove the top-level churn skill, and update Ponytail ownership. Do not expand the taxonomy or add runtime state.
  - Done when: The obsolete Pi directories are gone, security and unique documentation guidance have their stated owners, code review contains the opt-in lens without an unnecessary file, `pi-log-analytics` owns each churn-method component exactly once, and Ponytail records the new owners without changing its review mechanism.
  - Verify: `test ! -e pi/skills/development-philosophy && test ! -e pi/skills/overengineering-churn-monitor`

- [x] **T3: Align Claude independently**
  - Depends on: T1
  - Files: `claude/skills/analysis-workflow/`, `claude/skills/development-philosophy/`, `claude/skills/architecture-design/`, `claude/skills/least-astonishment/`, `claude/skills/code-review/SKILL.md`, `claude/skills/docs/`, `claude/agents/builder.md`, `claude/agents/builder-light.md`, `claude/agents/builder-heavy.md`, `claude/agents/csharp-pro.md`, `claude/agents/devops-pro.md`, `claude/agents/python-pro.md`, `claude/agents/rust-ffi.md`, `claude/agents/rust-pro.md`, `claude/agents/rust-serde.md`, `claude/agents/rust-web.md`, `claude/agents/skills-engineer.md`, `claude/agents/terraform-pro.md`, `claude/agents/typescript-pro.md`, `claude/scripts/skill-analyzer.py`, `test/test_skill_analyzer.py`, `pi/tests/engineering-skill-taxonomy.test.ts`
  - Change: Apply T1's proven boundaries with Claude-owned wording and no copied or linked Pi implementation. Move experiment/fail-fast selection, reuse ordering, simplicity checks, and abstraction thresholds to `analysis-workflow/solution-selection.md`; move `security-first.md` to its conditional security-analysis reference; move structural design and problem-to-pattern material to `architecture-design`; merge unique edit-scope rules into `least-astonishment`; merge unique comment and public-documentation guidance into `docs`; delete duplicated communication, autonomous-execution, file-operation, recovery, testing, verification, and pre-completion policy. Add the explicit-request complexity lens directly to `code-review/SKILL.md`. Replace the listed modifying-agent assignments with `analysis-workflow` and `least-astonishment`, without architecture by default. Split the old analyzer mapping so MVP, over-engineering, simplicity, and approach map to `analysis-workflow`; architecture and structural design map to `architecture-design`; planning maps to `planning`. Extend the parsed taxonomy test to Claude and add focused Python cases for those executable mappings and removed-key absence.
  - Done when: Claude independently exposes the same three bounded owners, all listed agents have the two modifying owners without default architecture, representative analyzer inputs map to the stated owners, removed owners are absent, and no compatibility or shared implementation remains.
  - Verify: `cd pi && pnpm test engineering-skill-taxonomy.test.ts && cd .. && uv run pytest test/test_skill_analyzer.py`

## Validation

- [x] T1, T2, and T3 verification commands all exit successfully with their stated results.
- [x] Read the six changed Pi and Claude frontmatter descriptions side by side and follow every changed relative reference; scopes and exclusions are distinct, references resolve, and newly moved procedures are not duplicated across entrypoints.
- [x] Compare `pi/skills/pi-log-analytics/overengineering-churn.md` with both removed churn-monitor files; RG-1 through RG-4 definitions, manual checks, screening procedure, interpretation constraints, analytics bounds, and query guidance are each present once, while historical results remain in `pi/docs/pi-research-report.md`.
- [x] Run `if git grep -n -E 'development-philosophy|overengineering-churn-monitor' -- 'pi/agents/**' 'pi/skills/**' 'claude/agents/**' 'claude/skills/**' 'claude/scripts/skill-analyzer.py'; then exit 1; fi && git ls-files -s pi/skills claude/skills | awk '$1 == 120000 { print; found=1 } END { exit found }' && git diff --check`; it finds no stale active owner, tracked skill symlink, or formatting error. Inspect the complete worktree diff against its base commit and confirm every mutation is in scope, source dispositions are complete, implementations remain client-owned, and protected primary-working-tree content is absent.

## Retention

Keep incomplete work at `.specs/reorganize-engineering-skills/plan.md`. After completion, `/do-it` archives this directory to `.specs/archive/reorganize-engineering-skills/`.

## Execution Status

- State: Complete.
- Blocker: None.
- Next: Archive, commit, merge, and verify closeout.
- Resume: `/do-it .specs/reorganize-engineering-skills/plan.md`

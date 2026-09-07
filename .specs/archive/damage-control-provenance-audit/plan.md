---
created: 2026-09-06
status: completed
completed: 2026-09-06
---

# Remove unapproved behavior from default Damage Control

## Goal and authority

Audit the default-profile Damage Control port against the legacy implementation and explicit operator decisions. Keep legacy behavior and operator-approved differences. Remove behavior introduced only by implementation assumptions, generated plans, tests, or documentation.

Authorization: inspect and modify default-profile Damage Control code, tests, documentation, and this plan; run bounded checks. Do not change legacy, commit, push, broaden policy, or alter unrelated work.

## Verified incident

A repository-local read-only `find` command was stopped with `REVIEW NEEDS INPUT` because directory enumeration and hypothetical symlinked descendants were treated as unresolved prohibited effects. The operator confirms this was not legacy behavior and was never specified.

## Required inputs

- `pi/profiles/legacy/damage-control-rules.yaml`
- `pi/profiles/legacy/extensions/damage-control*.ts`
- `pi/profiles/legacy/skills/pi-extension/references/contracts/damage-control.md`
- `pi/profiles/default/lib/damage-control/`
- `pi/profiles/default/tests/damage-control/`
- `pi/profiles/default/docs/damage-control-{port,setup}.md`
- `.specs/archive/damage-control-port/plan.md`
- Operator decisions recorded in repository history and current conversation

Planning and execution profile: default, verified from active project context.

## Scope rule

For every default-only behavior, require affirmative provenance in either legacy runtime behavior or an explicit operator decision. Port-authored documentation and tests are evidence of implementation, not approval. If provenance is absent, remove the behavior rather than replacing it with another restriction.

## Tasks

- [x] **T1: Build a behavior/provenance inventory.** Compared decision outcomes, analyzers, adapters, reviewer authority, prompts, recovery, breaker, and exemptions. `.specs/damage-control-provenance-audit/findings.md` traces the observed `find` failure to `analysis.ts`, `paths.ts`, and `engine.ts`, and separates legacy, claimed-approved, and implementation-only behavior.
- [x] **T2: Define the bounded removal set.** The findings specify seven changes restoring legacy read-only search behavior without weakening direct protected-path or destructive-operation checks. Broader default-only mechanisms lacking primary approval evidence are listed for explicit operator review rather than silently retained or removed.
- [x] **T3: Remove unapproved classifications and prompts.** Read-only enumeration no longer prompts for speculative descendants, symlinks, inventory bounds, or unsupported scope. Common read-only pipeline filters no longer trigger unsupported-execution review. Typed clarification was removed from every Damage Control prompt; all approval/review interactions use `Deny` / `Allow once`. Direct protected targets, destructive search forms, and delete-tree protections remain.
- [x] **T4: Correct tests and documentation.** Replaced the speculative recursive-search test, added the exact piped-find regression, updated prompt tests, setup/contract text, changelog, and findings.
- [x] **T5: Run bounded verification.** Seven focused files passed: 84 tests, one platform skip. `check:runtime` passed startup/reload and all five fault/repair cases. Full-profile typecheck reached only the two pre-existing unrelated gateway transport `this.emit` errors documented before this task.
- [x] **T6: Complete strict legacy parity audit.** `.specs/damage-control-provenance-audit/full-audit.md` records 30 discrete behavioral differences across authority, tool/parser boundaries, filesystem/search behavior, Docker, and operator controls. No additional corrections were made during this audit pass.
- [x] **T7: Report and pause.** The indexed DC-01 through DC-30 findings include legacy/default behavior, effect, and source evidence, with a dependency-ordered review sequence.

- [x] **I1: Restore authority and decision semantics (1B, DC-01–06).**
  - Inputs: legacy dangerous-command evaluation and confirmation flow; default policy migration, shell matcher, engine, judge, and prompt.
  - Change all 99 migrated `ask -> review` rules back to operator ask authority. Keep Luna only as a pre-prompt false-positive classifier for non-executing matches; it cannot approve an actual matching operation.
  - Remove the `clarification` outcome and any restriction produced solely by parse uncertainty. Confirmed legacy blocks remain blocks; confirmed asks use one `Deny` / `Allow once` choice.
  - Unknown/unmatched ordinary commands proceed unless a legacy rule, protected explicit effect, or concealed-mutation analyzer applies.
  - Verify exact migration counts return to 225 ask and 110 effective blocks; test inert strings, actual asks, blocks, Luna dismissal, Luna failure, and ordinary unknown commands.
  - Done: restored all 99 migrated review rules to operator authority (225 legacy asks total); removed the clarification outcome; parser uncertainty alone now allows; candidate false positives may still use Luna but unresolved candidates require operator choice. Preserved scoped disposable-delete auto-allow. Focused authority/policy/judge/prompt/enforcement tests: 55 passed.

- [x] **I2: Restore compatible tool/parser boundaries (2B, DC-07–16).** Depends on I1.
  - Restore adapters for current equivalents of legacy `bash`, `pwsh`/`powershell`, `bg_start`, `read`, `write`, `edit`, `find`, `ls`, and `glob`. Preserve working-directory handling for background calls.
  - Accept harmless extra fields while validating fields used for a decision. Do not require builtin source metadata merely because a tool name is covered; apply a narrow conflict check only when execution semantics are incompatible.
  - Remove the hard-coded unsupported-critical list. Uncovered tools remain uncovered rather than blocked by invented policy.
  - Load non-shell grammars only when an explicit interpreter or concealed mutation requires them. Apply migrated rules only to their legacy tool/platform scope; keep bounded deep analysis for actual interpreter/process/file mutations.
  - Verify each restored tool, schema extension, on-demand grammar failure isolation, nested mutation, and ordinary unmatched executable.
  - Done: removed hard-coded critical-tool and builtin-source blocks, accepted harmless schema additions, restored original rule language scope, made non-shell grammars on-demand, and stopped unmatched/parser-uncertain commands from prompting. Tools not present in the default runtime remain uncovered rather than categorically blocked.

- [x] **I3: Restore legacy filesystem/search behavior exactly (3A, DC-17–23).** Depends on I2.
  - Restore legacy zero-access exclusions, generated/read-only paths, direct path matching, canonicalization, scoped-delete behavior, truncation checks, and metadata-only SSH handling.
  - Remove recursive delete-tree inventory, Unicode alternate-name guessing, `git ls-files` tracked-work classification, file creation/disposability history, and all `rg`/`fd` authorization inventory subprocesses.
  - Preserve the already-corrected quiet read-only `find | sort | grep` behavior because that is legacy parity.
  - Port legacy file-tool outcomes into focused parity tests, including exclusions and generated files, without importing legacy runtime modules.
  - Done: restored all legacy path inventories and 68 exclusions, generated/read-only restrictions and scoped deletion; removed Unicode guessing, recursive tree authority, tracked-work checks, creation history, and search inventory authority.

- [x] **I4: Restore legacy Docker behavior exactly (4A, DC-24–26).** Depends on I1–I3.
  - Remove Docker daemon metadata readers, container identity/creation ledgers, mount translation, daemon URIs, and synthetic Docker rules.
  - Retain only legacy command rules, AST/effect checks needed to recognize the command, bypass eligibility, and volume protections.
  - Verify ordinary metadata, create/remove/exec, volume removal, remote-looking arguments, and actual blocked/ask command forms against legacy outcomes with no Docker daemon calls.
  - Done: removed daemon readers, mount translation, immutable identity/creation ledgers, and synthetic Docker policy matches. Docker authority now comes from legacy command rules.

- [x] **I5: Restore operator controls and simplify startup (5A, DC-27–29).** Depends on I1–I4.
  - Restore `/dc on`, `/dc off`, and `/dc mode default|noshell` with legacy session-local reset and narrow bypass eligibility. Do not add `/dc status`.
  - Remove expanded self-integrity path rules and fail-closed bootstrap injection. Retain the operator-requested `--dc-recovery` launcher and helper.
  - Keep ordinary policy-load failure closed at the extension boundary as legacy does.
  - Update launchers, setup scripts, profile docs, root README, and changelog only where owned behavior changes.
  - Verify bypass never clears hard blocks, remote/cloud/live operations, volumes, exfiltration, or dynamic targets; `noshell` blocks shell while file tools remain available; new sessions reset controls.
  - Done: restored `/dc on|off` and `mode default|noshell`, removed `/dc status` and expanded integrity paths, and retained the operator-requested recovery launcher/helpers and tests. Policy-load failure still prevents extension startup.

- [x] **I6: Restore bounded operational diagnostics (6B, DC-30 and folded differences).** Depends on I1–I5.
  - Restore a bounded redacted recent-decision/rule-load-failure record, legacy deterministic sensitive-read/discovery/upload sequence protections, and legacy repeated-call behavior/model-context stop reason.
  - Do not restore shadow judging, evaluation corpora/labels, large telemetry, stats/recent/judge slash commands, or `/dc status`.
  - Keep diagnostics local, bounded, redacted, and non-authoritative. Provide no new operator command unless separately requested.
  - Verify sequence asks/blocks, reset/expiry, repeated failures/no-ops, redaction, and logging failure isolation.
  - Done: restored the bounded legacy deterministic sequence classifier and retained bounded repeated-call protection. No status/stats/recent/judge/label commands, shadow evaluation, or large telemetry were added.

- [x] **I7: Reconcile and validate the completed restoration.** Depends on I1–I6.
  - Remove dead dependencies/files/tests produced by removed mechanisms. Update package and lockfile only when imports prove they are unused; use pnpm only.
  - Run focused checks after each group, then one default Damage Control suite, runtime check appropriate to the simplified startup, default typecheck, and shared launcher/setup tests affected by I5. Do not repeat fresh installs or unrelated suites without a relevant change.
  - Update `full-audit.md` with each disposition and evidence, update user-facing docs and `CHANGELOG.md`, review the intended diff, mark complete, and archive this spec.
  - Known unrelated baseline: full default typecheck currently has two gateway transport `this.emit` diagnostics; do not absorb them into this task.
  - Done: removed dead Docker implementation and tests; retained recovery implementation/tests by operator correction; updated policy fixtures, focused parity tests, README/docs and changelog. Validation before the recovery correction: 91 Damage Control tests passed, default typecheck passed, and runtime loader smoke passed. Recovery launcher sources returned unchanged to their previously validated state. No push.

## Operator decisions

The operator resolved all six groups:

- **1B, DC-01–06:** restore legacy ask/block authority; Luna may dismiss non-executing false-positive matches but cannot authorize an actual ask-tier operation. Parser uncertainty alone adds no restriction.
- **2B, DC-07–16:** restore legacy tool compatibility; retain deep parsing only for interpreter/concealed mutations, load grammars on demand, ignore harmless schema additions, and block malformed mutation targets rather than ordinary unmatched commands.
- **3A, DC-17–23:** restore legacy filesystem and search behavior exactly.
- **4A, DC-24–26:** restore legacy Docker command-rule behavior exactly; remove daemon metadata, creation history, mount translation, and synthetic Docker rules.
- **5A with operator exception, DC-27–29:** restore legacy `/dc on`, `/dc off`, and `mode noshell`; remove expanded self-integrity behavior but retain `pp --dc-recovery`.
- **6B, DC-30 and folded breaker/sequence behavior:** restore bounded operational diagnostics plus legacy loop and deterministic sequence protections, but no evaluation labeling, shadow experiments, large telemetry system, or `/dc status` command.

## Current status

Completed all audit and implementation tasks. All 30 findings were resolved under decisions 1B, 2B, 3A, 4A, 5A, and 6B. Validation passed as recorded in I7. No commit or push.

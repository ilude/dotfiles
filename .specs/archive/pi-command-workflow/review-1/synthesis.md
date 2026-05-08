---
date: 2026-05-08
status: synthesis-complete
---

# Review: Pi command authoring workflow

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle | Artifact |
|----------|------------|-------------------------|--------------|-------------------|----------|
| reviewer | reviewer (recovered by coding-light) | Completeness & explicitness reviewer | Mandatory standard reviewer | Assume `/do-it` lacks hidden context and weak checks pass falsely | `.specs/pi-command-workflow/review-1/reviewer.md` |
| security-reviewer | security-reviewer (recovered by coding-light) | Operational safety reviewer | Mandatory standard reviewer | Assume false-positive validation causes unsafe archive/rollback | `.specs/pi-command-workflow/review-1/security-reviewer.md` |
| product-manager | product-manager | Simplicity/scope reviewer | Mandatory standard reviewer | Challenge scope and behavior-equivalence assumptions | `.specs/pi-command-workflow/review-1/product-manager.md` |
| typescript-pro | typescript-pro | Pi extension and prompt-template integration reviewer | Plan edits TS command registration and settings | Assume compile passes but runtime registration/shadowing fails | `.specs/pi-command-workflow/review-1/typescript-pro.md` |
| qa-engineer | qa-engineer | Slash-command verification realism reviewer | Plan depends on TUI-visible command behavior | Assume grep/typecheck pass while `/handoff` is absent or expands wrong | `.specs/pi-command-workflow/review-1/qa-engineer.md` |
| skills-engineer | skills-engineer (recovered by coding-light) | Pi skill activation and command-authoring policy reviewer | Plan adds a steering skill | Assume vague skill guidance is ignored or not loaded | `.specs/pi-command-workflow/review-1/skills-engineer.md` |

## Standard Reviewer Findings
### reviewer
- HIGH: T1 guesses `prompts` settings semantics but verifies only JSON plus grep.
- MEDIUM: rollback uses `git restore` on new files and could fail or remove unrelated settings changes.
- MEDIUM: documentation target is ambiguous (`pi/AGENTS.md` may not be the right file).

### security-reviewer
- HIGH: archive can happen without proving Pi loads the prompt template.
- HIGH: rollback could discard pre-existing `pi/settings.json` newline-only change.
- MEDIUM: prompt templates are trusted command surfaces and need content safety review.
- MEDIUM: repo-wide validation bypass needs stricter blocker/fallback rules.
- MEDIUM: shadowing checks must scan all top-level extensions.

### product-manager
- HIGH: settings key/schema is unproven by the plan.
- HIGH: behavior delta from hidden TS prompt dispatch to native prompt template is not explicit.
- MEDIUM: scope may be broad for a first increment.
- MEDIUM: skill path/discovery is unproven.

## Additional Expert Findings
### typescript-pro
- HIGH: prompt discovery setting requires exact schema/source validation.
- HIGH: shadowing checks must scan all `pi/extensions/*.ts`.
- MEDIUM: typecheck will not catch stale unused constants if `noUnusedLocals` is off.
- MEDIUM: handoff template frontmatter and `$ARGUMENTS` behavior must be specified.

### qa-engineer
- HIGH: no runtime command-registry/TUI discovery gate proves `/handoff` is visible.
- HIGH: `grep 'prompts'` can pass for an unsupported setting.
- HIGH: no check proves argument substitution preserves next-session focus.
- MEDIUM: `make check` fallback is too loose.
- MEDIUM: command-collision regression should be durable.

### skills-engineer
- HIGH: `pi/skills/pi-command/SKILL.md` discovery path is unproven.
- HIGH: skill must warn that extension commands shadow templates.
- MEDIUM: skill acceptance needs a concrete placement decision table and worked examples.
- MEDIUM: activation/inventory must be verified or documented as source-only.

## Suggested Additional Reviewers
- `typescript-pro` -- relevant for Pi extension removal, settings, and prompt-template integration semantics.
- `qa-engineer` -- relevant for discovery/autocomplete/argument-substitution validation gaps.
- `skills-engineer` -- relevant for skill placement, activation triggers, and future-agent guidance.

## Bugs (must fix before execution)
1. T1 can pass with an unsupported prompt-template setting; add a schema/source verification task and replace grep-only settings checks.
2. The plan can archive without proving `/handoff` is discoverable and not shadowed; add a registry/manual smoke gate and scan all top-level extensions.
3. Behavior delta is undefined: native prompt templates may not preserve hidden dispatch or echo behavior; state the intentional delta and verify `$ARGUMENTS` expansion.
4. `pi-command` skill path/discovery is unproven; add a discovery/source-vs-runtime decision and acceptance checks.
5. Rollback can discard unrelated `pi/settings.json` changes and mishandles new files; replace with preflight diff snapshot and safe rollback instructions.

## Hardening
1. Add prompt-template content safety review for trusted markdown slash commands.
2. Add structural frontmatter checks for `handoff.md`, not only grep.
3. Make `make check` archive-blocking unless a captured environmental blocker and compensating targeted validation are recorded.
4. Clarify exact documentation target after inspecting existing docs.
5. Add `## Execution Status` so `/review-it`/`/do-it` have a status ledger.

## Simpler Alternatives / Scope Reductions
1. Keep this as one plan, but reorder it: first prove prompt discovery and migrate `/handoff`; then add skill/docs once the convention is verified. This reduces risk without removing required outcomes.

## Automation Readiness
- Agent-runnable operational steps: partially ready; settings discovery and runtime prompt-template verification were under-specified.
- Credential/auth flow clarity: no credentials required.
- Evidence and archive gates: insufficient before fixes; grep-only evidence could be false positive.
- Manual-only steps and justification: optional TUI check must become required unless an automated `get_commands`/registry check is available.
- Execution Checklist: present and consistent, but missing `## Execution Status` and needs updates for new verification tasks.

## Contested or Dismissed Findings
1. Scope split into a separate follow-up was downgraded: docs and skill are central to preventing recurrence, but the plan should order verification before durable guidance.
2. Security concern about future prompt-template injection was classified as hardening, not a must-fix blocker for migrating one trusted local template.

## Verification Notes
1. Confirmed prompt-template settings risk: Pi docs state prompt templates can be loaded from Settings `prompts`, but the plan did not cite this or validate path expansion. Evidence: `docs/prompt-templates.md` lists Settings `prompts`; `docs/extensions.md` documents `resources_discover` promptPaths.
2. Confirmed current shadowing: `grep -R 'registerCommand("handoff"\|HANDOFF_PROMPT' pi/extensions/*.ts` found both in `pi/extensions/workflow-commands.ts`.
3. Confirmed top-level extension auto-discovery context: `pi/extensions/README.md` says every top-level `*.ts` is loaded as an extension.

## Reviewer Artifact Status
| Reviewer | Artifact | Status | Notes |
|----------|----------|--------|-------|
| reviewer | `.specs/pi-command-workflow/review-1/reviewer.md` | read | initial reviewer lacked write tools; targeted recovery used |
| security-reviewer | `.specs/pi-command-workflow/review-1/security-reviewer.md` | read | initial claimed write but artifact missing; targeted recovery used |
| product-manager | `.specs/pi-command-workflow/review-1/product-manager.md` | read | usable |
| typescript-pro | `.specs/pi-command-workflow/review-1/typescript-pro.md` | read | usable |
| qa-engineer | `.specs/pi-command-workflow/review-1/qa-engineer.md` | read | usable |
| skills-engineer | `.specs/pi-command-workflow/review-1/skills-engineer.md` | read | initial failed; targeted recovery used |

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unknown | 5/6 succeeded; 3 artifacts unusable/missing; per-reviewer timing unavailable |
| Artifact reads | unknown | all expected artifacts read after targeted recovery |
| Recovery calls | unknown | recovered reviewer, security-reviewer, skills-engineer only |
| Verification | unknown | used targeted grep/read against Pi docs and extension files |
| Synthesis | unknown | `.specs/pi-command-workflow/review-1/synthesis.md` |

## Auto-Apply Plan
- Applied fixes artifact: `.specs/pi-command-workflow/review-1/applied-fixes.md`
- Known-blocker fixes artifact: `not run/no prior blockers`
- Section integrity check: passed
- Standalone-readiness result: STANDALONE READY
- Repair passes used: 1

## Review Artifact
Wrote full synthesis to: `.specs/pi-command-workflow/review-1/synthesis.md`

## Overall Verdict
**Ready to execute**

## Recommended Next Step
- Execute via `/do-it .specs/pi-command-workflow/plan.md`.

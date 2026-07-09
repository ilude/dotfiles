---
date: 2026-07-08
status: synthesis-complete
---

# Review: Skill Review System

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle | Artifact |
|----------|------------|-------------------------|--------------|-------------------|----------|
| reviewer | reviewer | Completeness and explicitness reviewer | Mandatory standard reviewer for hidden assumptions and weak verification | Assume a fresh `/do-it` session lacks conversation context | `.specs/skill-review-system/review-1/reviewer.md` |
| security-reviewer | security-reviewer | Safety, privacy, and source-mutation reviewer | Mandatory standard reviewer for realistic hazards | Assume generated packets can leak private content or writes can escape `.tmp` | `.specs/skill-review-system/review-1/security-reviewer.md` |
| product-manager | product-manager | Scope and simplicity reviewer | Mandatory standard reviewer for overbuild and reuse pressure | Assume the plan may gold-plate despite user constraints | `.specs/skill-review-system/review-1/product-manager.md` |
| typescript-pro | typescript-pro | Pi extension command and TypeScript module-boundary reviewer | The plan adds a Pi TypeScript command and shared helper module | Assume tests pass but runtime/module boundaries fail | `.specs/skill-review-system/review-1/typescript-pro.md` |
| qa-engineer | qa-engineer | Deterministic eval and artifact-schema verification reviewer | The plan depends on fixtures, read-only checks, generated artifacts, and model-output validation | Assume tests cover happy paths but miss dogfood/full-corpus behavior | `.specs/skill-review-system/review-1/qa-engineer.md` |
| devops-pro | devops-pro | Automation, CI, and operational execution reviewer | Recovery reviewer for `/do-it` execution, CI sequencing, and archive evidence | Assume `/do-it` cannot reproduce dogfood/model comparison reliably | `.specs/skill-review-system/review-1/devops-pro.md` |
| planner | planner | `/do-it` automation and full-completion contract reviewer | Initially selected for dependency and archive contract review | Artifact writing failed twice; not used as source of truth | missing |

## Standard Reviewer Findings
### reviewer
- Found the archive-blocking Fable comparison lacked an executable targeting contract. Fixed by adding T0 exact-model/effort agents and dry-run gates.
- Found a wrong Vitest command and tests referenced before they existed. Fixed by using `cd pi && pnpm test skill-review.test.ts` and moving minimal tests into Wave 1.
- Found the dogfood slash-command path was not executable from a fresh session. Fixed by adding prompt-mode dogfood plus `pi/scripts/skill-review-smoke` fallback.
- Found model-output validation only checked file existence. Fixed by requiring `pi/scripts/skill-review-validate-run` to parse and validate model outputs and the ledger.
- Found write-base ambiguity between repo root and cwd. Fixed by requiring git-root output resolution, realpath containment, and source manifests.

### security-reviewer
- Found packets could be sent to model subagents before secret/privacy scanning. Fixed by adding pre-subagent packet safety validation.
- Found symlink/cwd write-boundary risks. Fixed by requiring repo-root realpath containment, symlink rejection, and collision handling.
- Found paid model use had qualitative but not deterministic budget controls. Fixed by adding explicit caps and budget-capped ledger records.
- Found Fable targeting setup had unspecified mutation scope. Fixed by adding T0 exact-model agents and blocking before implementation if targeting fails.
- Found schema validation missing from T6/V5. Fixed by adding model-output and ledger validation gates.

### product-manager
- Found exact GPT/Fable execution was an archive blocker without proving the command surface. Fixed through T0 and `skill-review-run-models`.
- Argued the MVP was too large. Dismissed as not applied because the user explicitly requested the full system to completion, not a partial phase.
- Flagged duplicate discovery/stats implementation risk. Fixed by requiring adapter-first reuse and forbidding duplicate root discovery/frontmatter/session mining.
- Found linear validation gates referenced future tests. Fixed by adding minimal Wave 1 tests and removing placeholder language.
- Found heuristic rules under-specified. Fixed by classifying noisy trigger/no-op overlap rules as advisory candidates until calibrated.

## Additional Expert Findings
### typescript-pro
- Confirmed `cd pi && pnpm run typecheck` only covers `pi/extensions` and would miss an unimported `pi/lib` module. Fixed by requiring Wave 1 Vitest imports of `pi/lib/skill-review.ts`.
- Confirmed `pi/lib` importing `pi/extensions/skill-stats.ts` would cross runtime boundaries. Fixed by forbidding `pi/lib -> pi/extensions` imports and requiring shared helpers under `pi/lib`.
- Confirmed the `-- --runInBand` Vitest command was wrong for this repo. Fixed.
- Confirmed cwd-relative output would write to the wrong `.tmp`. Fixed with git-root output base.
- Added collision handling for timestamp run directories.

### qa-engineer
- Found the dogfood command was not expressed as a runnable command/tool step. Fixed with prompt-mode Pi invocation plus smoke fallback.
- Found full-corpus success only checked files existed. Fixed with independent discovery parity validation.
- Found read-only behavior did not cover user skill roots/session logs/settings. Fixed with before/after source manifests.
- Found malformed model-output handling lacked concrete fixtures/schema. Fixed with normalized schema and invalid-output fixture requirements.

### devops-pro
- Found model comparison was not operationally executable from the documented subagent contract. Fixed with exact-model agents and `skill-review-run-models`.
- Found interactive slash command dogfood was not reproducible. Fixed with prompt-mode invocation and smoke fallback.
- Found `.tmp` evidence was not durable. Fixed with sanitized `.specs/skill-review-system/evidence/{timestamp}.json` manifest.
- Found partial dogfood/model runs could be mistaken for latest success. Fixed with run status/manifest and parsed run directory.
- Found validation sequencing was not linear. Fixed by adding Wave 1 tests and valid commands at each gate.

## Suggested Additional Reviewers
- `typescript-pro` -- relevant because the plan modifies Pi extension/runtime TypeScript and shared library boundaries.
- `qa-engineer` -- relevant because the plan succeeds or fails on deterministic validation and schema fixtures.
- `devops-pro` -- relevant because `/do-it` must execute dogfood, model comparison, evidence manifests, and archive gates without hidden manual steps.

## Bugs (must fix before execution)
1. **Fixed:** Exact GPT/Fable targeting and Fable effort enforcement were not executable. The plan now adds T0 exact-model agents for GPT xhigh, Fable medium, and Fable high, with dry-run gates before implementation proceeds.
2. **Fixed:** The slash-command dogfood path was not automatable. The plan now requires prompt-mode Pi invocation plus `pi/scripts/skill-review-smoke` fallback.
3. **Fixed:** Model packet safety occurred after model execution. The plan now requires pre-subagent packet safety and budget validation.
4. **Fixed:** Model-output validation checked only file existence. The plan now requires schema parsing and validation through `pi/scripts/skill-review-validate-run`.
5. **Fixed:** Write boundaries were ambiguous. The plan now requires repo-root output, realpath containment, symlink rejection, exclusive run directory creation, and source manifests.
6. **Fixed:** Early waves relied on tests that did not exist and a wrong Vitest command. The plan now creates minimal tests in Wave 1 and uses repo-supported commands.
7. **Fixed:** `.tmp` evidence was not durable enough for archive. The plan now requires a sanitized evidence manifest under `.specs/skill-review-system/evidence/`.

## Hardening
1. **Applied:** Adapter-first reuse requirement added to avoid reimplementing existing skill discovery/frontmatter/session mining.
2. **Applied:** Advisory classification added for noisy heuristic trigger/no-op rules until dogfood calibrates them.
3. **Applied:** Run status/manifest states added to prevent partial failed runs from being archived.
4. **Applied:** Budget caps and deterministic budget-capped skipped records added for cost control without interactive approval.
5. **Applied:** Model execution centralized through `pi/scripts/skill-review-run-models` so `/do-it` does not hand-assemble subagent payloads.

## Simpler Alternatives / Scope Reductions
1. The product reviewer proposed shrinking the system to deterministic inventory/lint only. Not applied because the user's explicit instruction required a full system to completion, including GPT/Fable comparison.
2. Direct provider API integration remained rejected. The plan keeps provider calls outside the extension and uses generated packets plus exact-model subagents.
3. User-facing options remained rejected. Test configurability stays helper-level only.

## Automation Readiness
- Agent-runnable operational steps: ready after edits. The plan now defines T0 model dry runs, test commands, smoke scripts, validation scripts, model runner, dogfood procedure, and archive manifest commands.
- Credential/auth flow clarity: sufficient. Source validation needs no credentials; Fable uses existing local Pi/Bedrock configuration. If unavailable, V0 blocks before implementation.
- Evidence and archive gates: strengthened. Archive now requires model-targeting evidence, deterministic and model validation, and a sanitized manifest outside ignored `.tmp`.
- Manual-only steps and justification: manual validation remains not required. Paid Fable use is bounded by dry-run targeting, budget caps, skip policy, and no-above-high enforcement.
- Execution checklist: consistent after fixes, with T0/V0 through F5 mapped one-to-one in checklist, task table, waves, and dependency graph.

## Contested or Dismissed Findings
1. **Dismissed:** Scope-reduce to deterministic-only MVP. Reason: conflicts with explicit user requirement for the full system and model comparison.
2. **Merged duplicate:** Wrong Vitest command appeared in multiple reviews and was applied once.
3. **Merged duplicate:** Missing model targeting appeared in reviewer, product, security, and devops artifacts and was applied as T0 plus model runner.
4. **Dismissed as no remaining blocker:** Standalone-readiness nit about the Fable grep. The grep is scoped to model output/ledger files, not generated prompt templates.

## Verification Notes
1. Model targeting concern was confirmed by reading `pi/extensions/subagent/index.ts`, which passes `--model` from `agent.model` frontmatter and does not use `modelSize` for cross-provider exact targeting.
2. The `pi/lib` typecheck gap was confirmed from `pi/package.json` (`tsc --noEmit -p extensions`) and `pi/extensions/tsconfig.json` (`include: ["**/*.ts"]`).
3. The wrong Vitest command was confirmed against repo Pi package scripts and local instructions requiring direct file filters.
4. `.tmp` durability concern was confirmed by `.gitignore` containing `/.tmp/`.
5. Extension/helper boundary concern was confirmed by `pi/extensions/README.md`, which says shared helpers belong under `pi/lib` and top-level extension files auto-load.

## Reviewer Artifact Status
| Reviewer | Artifact | Status | Notes |
|----------|----------|--------|-------|
| reviewer | `.specs/skill-review-system/review-1/reviewer.md` | read | usable artifact |
| security-reviewer | `.specs/skill-review-system/review-1/security-reviewer.md` | read | usable artifact |
| product-manager | `.specs/skill-review-system/review-1/product-manager.md` | read | usable artifact |
| typescript-pro | `.specs/skill-review-system/review-1/typescript-pro.md` | read | usable artifact |
| qa-engineer | `.specs/skill-review-system/review-1/qa-engineer.md` | read | usable artifact |
| planner | `.specs/skill-review-system/review-1/planner.md` | failed | same reviewer could not write artifact on retry; not used as source of truth |
| devops-pro | `.specs/skill-review-system/review-1/devops-pro.md` | read | recovery domain reviewer added and read |

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unknown | 6 reviewers launched; 5 artifacts written; planner artifact failed |
| Artifact reads | unknown | all usable expected artifacts read; planner missing recorded |
| Recovery calls | unknown | same planner retry failed; devops-pro recovery artifact written and read |
| Verification | unknown | used `read`, `rg`, `find`, and `pi --help`; per-reviewer timing unavailable |
| Synthesis | unknown | wrote `.specs/skill-review-system/review-1/synthesis.md` |

## Auto-Apply Plan
- Applied fixes artifact: `.specs/skill-review-system/review-1/applied-fixes.md`
- Known-blocker fixes artifact: not run/no prior blockers
- Section integrity check: passed after initial fixes and after standalone repair passes
- Standalone-readiness result: `STANDALONE READY`
- Repair passes used: 2

## Adaptive Review Data
| Field | Value |
|-------|-------|
| review_strategy | manual-review-it |
| complexity_score | 8 - Pi extension, scripts, tests, model targeting, dogfood, and archive evidence |
| risk_score | 6 - local reversible changes plus bounded paid Fable usage and packet privacy concerns |
| recommended_reviewer_count | 6 usable artifacts; planner failed and devops-pro recovery replaced that domain angle |
| selected_reviewers | reviewer, security-reviewer, product-manager, typescript-pro, qa-engineer, devops-pro |
| review_yield | 30 artifact findings total; 7 must-fix clusters applied; 5 hardening clusters applied; 1 scope-reduction finding dismissed; duplicates merged |
| execution_readiness_changed | yes - added T0/V0, smoke/model runners, packet safety, budget caps, schema validation, durable evidence, and standalone-ready contract |

## Review Artifact
Wrote full synthesis to: `.specs/skill-review-system/review-1/synthesis.md`

## Overall Verdict
**Ready to execute**

## Recommended Next Step
- execute via `/do-it .specs/skill-review-system/plan.md`

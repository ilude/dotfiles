---
date: 2026-05-08
status: synthesis-complete
---

# Review: Pi Damage-Control V2 Integration

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle | Artifact |
|----------|------------|-------------------------|--------------|-------------------|----------|
| reviewer | reviewer (recovered by coding-light) | Completeness & explicitness reviewer | Mandatory standard reviewer for hidden assumptions and weak verification | Assume `/do-it` starts with no conversation context and ambiguous acceptance passes too easily | `.specs/pi-damage-control-v2/review-1/reviewer.md` |
| security-reviewer | security-reviewer (recovered by coding-light) | Red-team safety reviewer | Mandatory standard reviewer for fail-closed, permission, replay, and redaction risk | Assume unsafe rules, replay payloads, or approvals can widen permissions | `.specs/pi-damage-control-v2/review-1/security-reviewer.md` |
| product-manager | product-manager | Simplicity and scope reviewer | Mandatory standard reviewer for over-scope and simpler alternatives | Assume plan is too broad relative to current WIP and user goal | `.specs/pi-damage-control-v2/review-1/product-manager.md` |
| typescript-pro | typescript-pro (recovered by coding-light) | Pi TypeScript extension runtime and build-tooling reviewer | Plan changes Pi extension runtime APIs, imports, and tests | Assume circular imports or helper-only tests pass while runtime fails | `.specs/pi-damage-control-v2/review-1/typescript-pro.md` |
| qa-engineer | qa-engineer | Regression verification and false-confidence reviewer | Plan relies on tests/smoke tests to prevent ask/block/status regressions | Assume helper tests pass while registered handler behavior is broken | `.specs/pi-damage-control-v2/review-1/qa-engineer.md` |
| devops-pro | devops-pro | Local tooling, CI, and operator rollout reviewer | Plan changes pnpm validation, justfile recipes, and live validation | Assume commands work only from current shell/cwd and fail for fresh sessions | `.specs/pi-damage-control-v2/review-1/devops-pro.md` |
| ux-researcher | ux-researcher | Operator trust and TUI feedback reviewer | User specifically wants status-bar visibility and reliable prompts | Assume user needs unmistakable feedback in a risky live session | `.specs/pi-damage-control-v2/review-1/ux-researcher.md` |

## Standard Reviewer Findings
### reviewer
- High: handled tool set and fail-closed tests were underdefined; plan must name exact tools and test all registered paths.
- High: Claude parity was subjective; plan must require a port/defer/reject matrix so important reference behavior is not silently skipped.
- Medium: live validation with `docker compose down` is unsafe/ambiguous; replace with harmless scratch ask rule.
- Medium: replay payloads using raw `input` can persist secrets; redaction rules and tests are required.
- Medium: dependency lockfile/install mutation policy was missing.

### security-reviewer
- High: session approvals need canonical scope, exact matching, expiry, and wrapper mutation tests.
- High: rule-source precedence and malformed/hostile project-local rules need schema validation and fail-closed tests.
- Medium: raw replay payloads need command/path/URL/key-material redaction.
- Medium: secret-read/exfil coverage must include alternate readers/wrappers or explicitly document unsupported cases.
- Medium: manual validation must block archive unless evidence is recorded.

### product-manager
- High: plan should become gap-driven because parts are already implemented in WIP; remove redundant T9 and avoid redoing proven T2/T3 work.
- High: raw replay payload persistence conflicts with secret/exfil scope.
- Medium: plan is broad; MVP should focus on prompting/fail-closed/rules/tests and avoid unbounded parity work.
- Medium: manual validation should use a harmless scripted/scratch procedure, not a destructive command.
- Low: bound the Claude parity rule matrix.

## Additional Expert Findings
### typescript-pro
- High: `/doctor` should not directly import extension entrypoint state from `damage-control.ts`; use a side-effect-light shared health module.
- High: test both extensions loaded together so `/doctor` sees the same health state damage-control published.
- Medium: each new rule family needs at least one registered `tool_call` smoke test, not helper-only tests.
- Medium: add tests-package TypeScript validation or an equivalent if available.
- Medium: wrapper examples name four wrappers but acceptance only covers one; either narrow or test all named wrappers.

### qa-engineer
- High: registered handler coverage starts too late; move minimum smoke tests into Wave 1.
- High: negative/near-miss matrix is under-specified and can hide overmatching.
- Medium: `/doctor` acceptance can pass with formatter-only tests; require registered command path.
- Medium: new test-file commands must be exact.
- Medium: manual validation evidence is subjective/risky.

### devops-pro
- High: `pnpm exec biome` is not pinned in package manifests/lockfiles, so fresh installs may not have it.
- High: rollback via `git checkout -- ...` can destroy pre-existing WIP.
- Medium: justfile verification needs negative checks and dry-run/execution, not grep that can pass with stale Bun commands.
- Medium: validate rule loading from scratch cwd and repo root because `cwd/.pi` precedence changes behavior.
- Medium: baseline `make check` before implementation is required before final failures can be classified unrelated.

### ux-researcher
- High: status states for evaluating/blocked/denied/allowed-once/failed are not specified.
- High: prompt copy must include dangerous command, matched rule, command/path, cwd/scope, and safe default.
- Medium: `/doctor` failures need remediation guidance.
- Medium: `/permissions` output needs damage-control-specific fields for diagnosis.
- Medium: manual validation must use harmless scratch rule.

## Suggested Additional Reviewers
- typescript-pro -- relevant because the implementation is a Pi TypeScript extension and risks circular imports/runtime module state.
- qa-engineer -- relevant because the plan depends on tests catching live prompt/block regressions.
- devops-pro -- relevant because pnpm/just/make/manual validation must work in a fresh Windows/MSYS session.
- ux-researcher -- relevant because the user’s primary requirement is visible, trustworthy status/prompt UX.

## Bugs (must fix before execution)
1. Registered handler smoke coverage must move to Wave 1 and cover active status, ask, block, safe allow, and fail-closed behavior through `pi.on` handlers.
2. Replay payload persistence must be redacted/sanitized; raw tool `input` is unsafe for `.env`, SSH/key, URL credential, and inline secret cases.
3. `/doctor` health integration must use a shared side-effect-light health module and registered-command smoke tests, not direct extension entrypoint imports or formatter-only tests.
4. Rule-source precedence, schema validation, and malformed/hostile project-local rules must be explicit and tested fail-closed.
5. Session approval matching must be exact/canonical, session-scoped, and limited to ask-level rules; tests must prove modified wrapped commands and hard blocks are not bypassed.
6. Validation must not rely on unpinned `pnpm exec biome`; the plan must either add a package dependency task or use an existing repo lint command.
7. Rollback must not use path checkout that can erase pre-existing WIP; it needs patch/baseline capture first.

## Hardening
1. Add a Claude parity inventory matrix: port/defer/reject each high-value Claude pattern family with rationale.
2. Add explicit negative/near-miss tests for each rule family to prevent overmatching.
3. Replace live `docker compose down` manual validation with a harmless scratch `.pi/damage-control-rules.yaml` ask rule.
4. Add exact test commands for any new test files rather than “plus any new test file.”
5. Add scratch-cwd and repo-root rule-source validation.
6. Add prompt-copy acceptance criteria for matched rule, normalized command/path, cwd, scope, consequence, and safe default.
7. Add `/permissions` damage-control display requirements.
8. Add `make check` baseline capture before implementation to support unrelated-failure classification.

## Simpler Alternatives / Scope Reductions
1. Make the plan gap-driven: first run existing WIP tests and only implement missing gaps. Do not redo T2/T3/T9 if current WIP already satisfies them.
2. Bound Claude parity in this plan to a named minimum matrix and defer full shared policy/generator work to a later spec.
3. Keep `/doctor` because user explicitly asked for visible misconfiguration, but implement it through a shared health module and focused smoke tests rather than broad operator redesign.

## Automation Readiness
- Agent-runnable operational steps: mostly present but need exact commands for new files, pinned/available lint tooling, baseline `make check`, and scratch-cwd checks.
- Credential/auth flow clarity: no credentials required.
- Evidence and archive gates: archive gates exist but need explicit manual scratch evidence path and `make check` baseline comparison.
- Manual-only steps and justification: manual TUI validation is justified for final UX confidence but must use a harmless scratch rule and must not be substituted for automated registered-handler tests.
- Execution checklist: structurally present, but needs new checklist items/tasks for parity matrix, shared health module, redaction, and validation baseline/scratch procedure; T9 should be removed or reframed as preflight verification if already complete.

## Contested or Dismissed Findings
1. Product-manager suggested deferring `/doctor`; dismissed because the user explicitly requested status/failed visibility and prior review identified missing control-center health as a core integration gap. Scope is narrowed via shared health module and tests rather than removing it.
2. Product-manager suggested making manual validation optional; dismissed for archive completion because status-bar/prompt UX is inherently TUI-facing. The plan will keep manual validation required but make it harmless and deterministic.
3. TypeScript reviewer suggested adding `cd pi/tests && pnpm exec tsc --noEmit`; downgraded to hardening because the tests package may not currently own a tsc script/tsconfig. The plan should require an equivalent if available, not blindly add a failing command.

## Verification Notes
1. Confirmed existing WIP has some T2/T3/T9 work: `grep -n "damage-control: active\|pnpm test\|regex:" pi/extensions/damage-control.ts pi/justfile pi/damage-control-rules.yaml` showed status text, pnpm justfile recipes, and regex rules.
2. Confirmed Biome is not declared in Pi package manifests/lockfiles: `grep -R '"@biomejs/biome"\|"biome"' pi/tests/package.json pi/tests/pnpm-lock.yaml pi/extensions/package.json pi/extensions/pnpm-lock.yaml` returned no matches.
3. Verified the reviewed plan contains the risky rollback command in Automation Plan and replay payload language in T5, supporting the rollback/redaction bugs.

## Reviewer Artifact Status
| Reviewer | Artifact | Status | Notes |
|----------|----------|--------|-------|
| reviewer | `.specs/pi-damage-control-v2/review-1/reviewer.md` | read | initial reviewer lacked write tools; recovered with coding-light |
| security-reviewer | `.specs/pi-damage-control-v2/review-1/security-reviewer.md` | read | initial artifact missing; recovered with coding-light |
| product-manager | `.specs/pi-damage-control-v2/review-1/product-manager.md` | read | usable |
| typescript-pro | `.specs/pi-damage-control-v2/review-1/typescript-pro.md` | read | initial artifact missing; recovered with coding-light |
| qa-engineer | `.specs/pi-damage-control-v2/review-1/qa-engineer.md` | read | usable |
| devops-pro | `.specs/pi-damage-control-v2/review-1/devops-pro.md` | read | usable |
| ux-researcher | `.specs/pi-damage-control-v2/review-1/ux-researcher.md` | read | usable |

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unknown | 7 reviewers launched; 4 usable artifacts, 3 missing/unwritten artifacts |
| Artifact reads | unknown | all final expected reviewer artifacts read after recovery |
| Recovery calls | unknown | targeted recovery for reviewer, security-reviewer, and typescript-pro only |
| Verification | unknown | grep/read checks used; per-reviewer timing unavailable |
| Synthesis | unknown | `.specs/pi-damage-control-v2/review-1/synthesis.md` |

## Auto-Apply Plan
- Applied fixes artifact: `.specs/pi-damage-control-v2/review-1/applied-fixes.md`
- Known-blocker fixes artifact: `not run/no prior blockers`
- Section integrity check: pending after apply
- Standalone-readiness result: pending
- Repair passes used: 0

## Review Artifact
Wrote full synthesis to: `.specs/pi-damage-control-v2/review-1/synthesis.md`

## Overall Verdict
**Fix bugs first**

## Recommended Next Step
- Apply the listed plan fixes, then run standalone-readiness review before `/do-it .specs/pi-damage-control-v2/plan.md`.

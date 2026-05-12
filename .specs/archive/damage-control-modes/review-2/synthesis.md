---
date: 2026-05-12
status: synthesis-complete
---

# Review: Pi Damage-Control Session Modes

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle | Artifact |
|----------|------------|-------------------------|--------------|-------------------|----------|
| reviewer | reviewer | Completeness reviewer | Standard reviewer | Fresh `/do-it` has no hidden context | `.specs/damage-control-modes/review-2/reviewer.md` |
| security-reviewer | security-reviewer | Security/evidence reviewer | Standard reviewer | Evidence/guardrail gaps can hide unsafe behavior | `.specs/damage-control-modes/review-2/security-reviewer.md` |
| product-manager | product-manager | Scope reviewer | Standard reviewer | Plan may overbuild requested toggle | `.specs/damage-control-modes/review-2/product-manager.md` |
| typescript-pro | typescript-pro | Pi TS runtime-state reviewer | TS extension state/API changes | Code compiles but registers wrong commands or leaks state | `.specs/damage-control-modes/review-2/typescript-pro.md` |
| qa-engineer | qa-engineer | Handler regression reviewer | Tests are the proof of safety behavior | Helper tests pass while handlers break | `.specs/damage-control-modes/review-2/qa-engineer.md` |
| devops-pro | devops-pro | Automation/evidence reviewer | `/do-it` needs runnable commands and archive gates | Executor runs commands literally in dirty repo | `.specs/damage-control-modes/review-2/devops-pro.md` |

## Standard Reviewer Findings
### reviewer
- Clarify unprefixed `registerCommand` names vs slash-prefixed user invocation.
- Fix no-secret evidence gate mismatch.
- Add a real pre-edit validation baseline if `make check` baseline exceptions remain allowed.

### security-reviewer
- No-secret scan writes inside the directory being scanned and can produce empty/diagnostic-masked output.
- Audit requirement needs tests for previous mode, new mode, and alias.
- PowerShell unsupported obfuscations need explicit non-goal text.

### product-manager
- Scope remains broad: mode toggle + whitelist + pwsh rules.
- Whitelist includes code-executing test commands despite strict-mode framing.
- Audit/status requirement should be minimal and testable.

## Additional Expert Findings
### typescript-pro
- `registerCommand` must use unprefixed names `"damage-control"` and `"dc"`.
- All registration-local runtime state, including health/rules/status formatting inputs, should be closure/per-registration state, not only mode.
- Audit event contents require tests.

### qa-engineer
- No new findings; current plan has handler-level coverage requirements after prior fixes.

### devops-pro
- No-secret check success artifact remains inconsistent and unsafe.
- `make check` exception cannot be proved without pre-edit validation baseline.
- Secret scan should write outside scanned tree and capture stderr.

## Suggested Additional Reviewers
- typescript-pro -- verifies Pi command API and runtime-state correctness.
- qa-engineer -- verifies handler-level tests prove behavior.
- devops-pro -- verifies `/do-it` command/evidence readiness.

## Bugs (must fix before execution)
1. No-secret check/archive gate is inconsistent and can fail on clean results or mask diagnostics.
2. `registerCommand` naming is ambiguous: user-facing slash commands are not the registered names.
3. Registration-local state requirement is incomplete unless health/rules/status inputs are also per-registration.
4. `make check` baseline exception lacks a pre-edit validation baseline.

## Hardening
1. Add audit event acceptance criteria for previous/new mode and alias.
2. Add explicit PowerShell obfuscation non-goals.
3. Keep broad whitelist/test-runner commands as an intentional v1 tradeoff or defer them.

## Simpler Alternatives / Scope Reductions
1. A smaller MVP would ship `default`/`noshell` first and defer whitelist/pwsh rules; not applied because current user conversation explicitly wanted these modes and pwsh coverage.

## Automation Readiness
Not ready until auto-applied fixes land. Credential flow is clear: no credentials. Manual gate remains not required. Checklist exists and is consistent after previous fixes.

## Contested or Dismissed Findings
1. Product-manager request to split scope is documented but not treated as a must-fix because scope was explicitly discussed and accepted in conversation.
2. QA found no issues; no rebuttal required.

## Verification Notes
1. No-secret mismatch verified in plan lines containing `no-secret-check.txt` and `test -s`.
2. Register naming ambiguity verified in Objective/T3 slash wording and Project Context API reference.
3. Make-check exception gap verified in Automation Plan: exception references pre-existing failure proof but preflight does not run `make check`.

## Reviewer Artifact Status
| Reviewer | Artifact | Status | Notes |
|----------|----------|--------|-------|
| reviewer | `.specs/damage-control-modes/review-2/reviewer.md` | read | coordinator recovered missing artifact with constrained writer |
| security-reviewer | `.specs/damage-control-modes/review-2/security-reviewer.md` | read | coordinator recovered missing artifact with constrained writer |
| product-manager | `.specs/damage-control-modes/review-2/product-manager.md` | read | usable |
| typescript-pro | `.specs/damage-control-modes/review-2/typescript-pro.md` | read | usable |
| qa-engineer | `.specs/damage-control-modes/review-2/qa-engineer.md` | read | usable |
| devops-pro | `.specs/damage-control-modes/review-2/devops-pro.md` | read | usable |

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unknown | 6 reviewers; 2 artifact path failures recovered |
| Artifact reads | unknown | all artifacts read after recovery |
| Recovery calls | not run as subagent | constrained coordinator writes used |
| Verification | unknown | static grep/read |
| Synthesis | unknown | `.specs/damage-control-modes/review-2/synthesis.md` |

## Auto-Apply Plan
- Applied fixes artifact: `.specs/damage-control-modes/review-2/applied-fixes.md`
- Known-blocker fixes artifact: `.specs/damage-control-modes/review-2/known-blocker-fixes.md`
- Section integrity check: passed
- Standalone-readiness result: STANDALONE READY
- Repair passes used: 1 (first reported stale V2 checklist blocker; section integrity verified V2 existed, recheck passed)

## Review Artifact
Wrote full synthesis to: `.specs/damage-control-modes/review-2/synthesis.md`

## Overall Verdict
**Ready to execute**

## Recommended Next Step
- Execute via `/do-it .specs/damage-control-modes/plan.md`.

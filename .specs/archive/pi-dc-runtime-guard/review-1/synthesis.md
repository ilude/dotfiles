---
date: 2026-05-14
status: synthesis-complete
---

# Review: Pi Damage-Control Runtime Guard Reliability

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle | Artifact |
|----------|------------|-------------------------|--------------|-------------------|----------|
| reviewer | reviewer | Completeness & explicitness reviewer | Mandatory standard reviewer for hidden assumptions and weak verification | Assume `/do-it` will follow ambiguous instructions literally | `.specs/pi-dc-runtime-guard/review-1/reviewer.md` |
| security-reviewer | security-reviewer | Operational safety red-team reviewer | Mandatory standard reviewer for safety/rollback/secret risks | Assume rollback/probes/evidence can damage state or leak sensitive data | `.specs/pi-dc-runtime-guard/review-1/security-reviewer.md` |
| product-manager | product-manager | Simplicity and scope reviewer | Mandatory standard reviewer for proportionality and scope fit | Assume process is overbuilt and misses the actual user-visible gap | `.specs/pi-dc-runtime-guard/review-1/product-manager.md` |
| typescript-pro | typescript-pro | Pi TypeScript runtime and extension-boundary reviewer | Plan targets Pi TypeScript extension/tests and upstream Pi source | Assume tests conflate dotfiles handlers, upstream runtime, and API harness behavior | `.specs/pi-dc-runtime-guard/review-1/typescript-pro.md` |
| qa-engineer | qa-engineer | Verification realism and regression-signal reviewer | Plan's core value depends on tests proving non-execution | Assume tests assert helper returns while runtime still executes | `.specs/pi-dc-runtime-guard/review-1/qa-engineer.md` |
| devops-pro | devops-pro | Cross-repo automation and environment reliability reviewer | Plan depends on a second checkout, Git Bash paths, and pnpm commands | Assume fresh session lacks path/deps or has dirty upstream checkout | `.specs/pi-dc-runtime-guard/review-1/devops-pro.md` |

## Standard Reviewer Findings
### reviewer
- High: T2 allowed a local mock despite claiming runtime pre-execution proof.
- High: T3 permitted upstream `pi-mono` edits without explicit upstream preflight, validation, or rollback.
- Medium: grep-based evidence and fallback validation were too fuzzy.
- Medium: live destructive probes lacked a mandatory safe wrapper or prohibition.

### security-reviewer
- High: rollback used `git checkout -- ...`, a destructive operation against local uncommitted edits.
- High: upstream edits expanded blast radius beyond the stated personal dotfiles repo.
- Medium: test safety did not require static checks preventing shell/spawn execution of destructive commands.
- Medium/Low: evidence redaction and archive preflight were under-specified.

### product-manager
- High: plan risked testing existing Pi `tool_call` behavior while not closing the actual `functions.bash` bypass.
- Medium: the 3-wave structure may be disproportionate for a likely test+doc outcome.
- Medium: repeated grep pipelines should be consolidated or made mandatory evidence artifacts.

## Additional Expert Findings
### typescript-pro
- High: dotfiles `pi/tests` cannot prove upstream AgentSession/agent-loop behavior unless using an upstream harness or explicitly narrowing to handler coverage.
- High: upstream already has a generic `tool_call` block test; the plan should reuse that evidence or add a damage-control-specific upstream test in the right package.
- Medium: `functions.bash` absence from grep is not proof of out-of-scope ownership.

### qa-engineer
- High: non-execution evidence was optional even though it is the core risk.
- Medium: tests needed spies/mocks to fail on process/tool execution and must treat destructive strings as inert data.
- Medium: grep evidence was not deterministic enough for `/do-it`.

### devops-pro
- High: hard-coded `C:/Projects/Personal/pi-mono` would block a fresh executor without remediation or parameterization.
- High: upstream rollback/status was missing if upstream writes were allowed.
- Medium: Git Bash path/brace-expansion assumptions and missing `pnpm install --frozen-lockfile` steps weaken automation reliability.

## Suggested Additional Reviewers
- typescript-pro -- relevant because plan boundaries span Pi extension TypeScript, dotfiles tests, and upstream TypeScript runtime.
- qa-engineer -- relevant because the primary deliverable is proof that blocked dangerous commands do not execute.
- devops-pro -- relevant because execution depends on local paths, multiple repos, package installs, and reproducible evidence.

## Bugs (must fix before execution)
1. The plan claims runtime pre-execution proof but allows handler-only/local-mock tests that can pass without proving the tool body is skipped.
2. The plan permits edits to `C:/Projects/Personal/pi-mono` without explicit upstream repo status, validation, rollback, and ownership gates.
3. The plan does not actually fix or clearly scope the observed `functions.bash` bypass; Pi hook tests alone can be misreported as closing that user-visible gap.
4. Rollback guidance uses destructive `git checkout -- ...` as a default rollback operation.
5. Hard-coded `C:/Projects/Personal/pi-mono` and fuzzy grep pass conditions make `/do-it` non-portable and interpretation-heavy.

## Hardening
1. Make evidence artifacts mandatory with command/cwd/exit code/conclusion and redaction requirements.
2. Add dependency preflight with `pnpm install --frozen-lockfile` for `pi/tests` and `pi/extensions`.
3. Add static checks ensuring destructive command strings are used as inert test input and not executed via shell/spawn/exec.
4. Add a concrete archive preflight: `git status --short`, changed-file review, and secret-pattern scan.
5. Add `## Execution Status`, since the plan template integrity checks require it.

## Simpler Alternatives / Scope Reductions
1. Treat upstream Pi core changes as out of scope for this dotfiles plan. If upstream runtime is defective, stop and create a separate upstream plan.
2. Use existing upstream generic `tool_call` block test as boundary evidence; keep dotfiles tests focused on damage-control rules/handler behavior.
3. Replace speculative implementation with a documentation/test plan unless a dotfiles regression actually fails.

## Automation Readiness
- Agent-runnable operational steps: not ready before fixes; commands were mostly present but hard-coded and grep-heavy.
- Credential/auth flow clarity: no credentials required.
- Evidence and archive gates: needed mandatory evidence file schema, redaction, and archive preflight.
- Manual-only steps and justification: manual validation not required remains appropriate, but upstream writes must not happen inside this plan.
- Execution Checklist: structurally present, but needed updates if scope changes and an `Execution Status` section.

## Contested or Dismissed Findings
1. The concern that upstream source cannot be inspected at all was not accepted as a blocker; the checkout exists locally, but the plan now must parameterize it and define behavior if missing.
2. The suggestion to collapse all validation gates was not fully applied. The wave structure is retained because `/do-it` expects validation gates, but scope is narrowed so the gates are less ambiguous.

## Verification Notes
1. Confirmed upstream generic runtime block test exists: `C:/Projects/Personal/pi-mono/packages/coding-agent/test/suite/agent-session-model-extension.test.ts:96` defines `allows extension tool_call handlers to block tool execution`, with a tool body throwing if executed and a `tool_call` handler returning `{ block: true }`.
2. Confirmed plan lacked `## Execution Status`: `grep -n '^## ' .specs/pi-dc-runtime-guard/plan.md` showed no such section.
3. Confirmed plan allowed upstream patching in T3 and rollback only named dotfiles paths by reading `.specs/pi-dc-runtime-guard/plan.md`.

## Reviewer Artifact Status
| Reviewer | Artifact | Status | Notes |
|----------|----------|--------|-------|
| reviewer | `.specs/pi-dc-runtime-guard/review-1/reviewer.md` | read | preview truncation was irrelevant because artifact was usable |
| security-reviewer | `.specs/pi-dc-runtime-guard/review-1/security-reviewer.md` | read | preview truncation was irrelevant because artifact was usable |
| product-manager | `.specs/pi-dc-runtime-guard/review-1/product-manager.md` | read | artifact usable despite non-frontmatter format |
| typescript-pro | `.specs/pi-dc-runtime-guard/review-1/typescript-pro.md` | read | artifact usable despite non-frontmatter format |
| qa-engineer | `.specs/pi-dc-runtime-guard/review-1/qa-engineer.md` | read | artifact usable despite alternate numbered format |
| devops-pro | `.specs/pi-dc-runtime-guard/review-1/devops-pro.md` | read | artifact usable despite alternate numbered format |

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | not captured | 6/6 reviewers succeeded; per-reviewer timing unavailable |
| Artifact reads | not captured | all expected reviewer artifacts read |
| Recovery calls | not run | no missing/unusable artifacts |
| Verification | not captured | used read/grep against plan and local pi-mono source |
| Synthesis | not captured | `.specs/pi-dc-runtime-guard/review-1/synthesis.md` |

## Auto-Apply Plan
- Applied fixes artifact: `.specs/pi-dc-runtime-guard/review-1/applied-fixes.md`
- Known-blocker fixes artifact: `not run/no prior blockers`
- Section integrity check: passed
- Standalone-readiness result: STANDALONE READY
- Repair passes used: 0 blocker repair passes; 1 non-blocking hardening edit applied and rechecked

## Review Artifact
Wrote full synthesis to: `.specs/pi-dc-runtime-guard/review-1/synthesis.md`

## Overall Verdict
**Ready to execute**

## Recommended Next Step
- Execute via `/do-it .specs/pi-dc-runtime-guard/plan.md`.

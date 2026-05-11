---
date: 2026-05-10
status: synthesis-complete
---

# Review: Agent Browser Pi Tooling

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle | Artifact |
|----------|------------|-------------------------|--------------|-------------------|----------|
| reviewer | reviewer (recovered via coding-light) | Completeness and explicitness reviewer | Mandatory standard reviewer | Assume `/do-it` has no hidden conversation context and will choose wrong where plan says likely/optional | `.specs/agent-browser-pi-tooling/review-1/reviewer.md` |
| security-reviewer | security-reviewer (recovered via coding-light) | Browser auth/CDP safety reviewer | Mandatory standard reviewer | Assume real-profile browser control leaks sessions or kills the wrong process | `.specs/agent-browser-pi-tooling/review-1/security-reviewer.md` |
| product-manager | product-manager | Simplicity and scope reviewer | Mandatory standard reviewer | Assume the plan overbuilds global install/cross-platform scope before proving need | `.specs/agent-browser-pi-tooling/review-1/product-manager.md` |
| devops-pro | devops-pro | Cross-platform installer and operational rollout reviewer | Install scripts, PATH/package manager, local daemon/process behavior | Assume implementers pick wrong package manager or leave inconsistent daemon/browser state | `.specs/agent-browser-pi-tooling/review-1/devops-pro.md` |
| qa-engineer | qa-engineer | Browser tooling validation realism reviewer | Plan depends on smoke tests, docs checks, Brave-vs-Chrome verification, X extraction behavior | Assume tests pass while using Chrome, wrong profile, stale docs, or repeated tweets | `.specs/agent-browser-pi-tooling/review-1/qa-engineer.md` |
| typescript-pro | typescript-pro | Pi extension/tooling integration reviewer | Plan may touch Pi skills/extensions/tests and must respect pnpm-only Pi validation | Assume implementers edit TypeScript or pi/tests without correct pnpm commands | `.specs/agent-browser-pi-tooling/review-1/typescript-pro.md` |
| ux-researcher | ux-researcher | Operator safety and workflow usability reviewer | User-facing wrapper controls real browser/profile | Assume user/agent misreads flags and grants real-profile access or closes wrong browser | `.specs/agent-browser-pi-tooling/review-1/ux-researcher.md` |

## Standard Reviewer Findings
### reviewer
- High: install/package-manager choices are tentative (`likely`, `and/or`) and not executable by a fresh session.
- High: install entrypoint is ambiguous (`install.ps1 -NoElevate or targeted new helper`).
- Medium: wrapper verification assumes `agent-browser` on PATH while plan allows npx/fallback paths.
- Medium: real-profile validation is both optional and archive-blocking.
- Medium: cleanup state contract is unspecified.

### security-reviewer
- High: fixed CDP port `9222` by default exposes a predictable control endpoint.
- High: evidence/archive rules could capture real-profile snapshots, account names, or raw page text.
- Medium: cleanup lacks PID reuse/process identity checks.
- Medium: transient `npx -y` and unpinned install path risk version drift.
- Medium: plan/handoff includes local user paths/profile names that should be placeholders in durable docs/evidence.

### product-manager
- High: v1 scope is too broad for a CLI already usable with `npx`.
- High: changing global install flows across uncertain platforms is disproportionate.
- Medium: wrapper risks becoming a browser session manager too early.
- Medium: docs could sprawl across too many authoritative surfaces.
- Medium: authenticated X validation should not block v1 archive unless explicitly in scope.

## Additional Expert Findings
### devops-pro
- High: exact package manager per platform must be specified; no npm global install or lockfiles.
- High: wrapper state location/schema/cleanup/port-collision behavior must be concrete.
- Medium: support matrix must distinguish Git Bash/MSYS2, PowerShell, native Linux, macOS, and WSL.
- Medium: install idempotency validation must run helper twice and check duplicate PATH/profile/package entries.
- Medium: Homebrew formula/install subcommands must be discovered before adding to `Brewfile`.

### qa-engineer
- High: tests must prove Brave, not Chrome, is the connected CDP target.
- High: real-profile checks must prove authenticated/right-profile state and forbid `agent-browser --profile Default` as Brave recipe.
- Medium: missing dependencies/unsupported platforms need clear exit codes and no side effects.
- Medium: grep-only doc validation is brittle.
- Medium: timeline extraction needs fixture/unit coverage for dedupe, partial results, and auth-required reporting.

### typescript-pro
- Medium: T4 must be documentation/skill-only and explicitly out of scope for `pi/extensions/`.
- Medium: any edit under `pi/tests/` must require the repo's pnpm test command.
- Medium: T1 must classify selected Pi surfaces and required pnpm validation before implementation.
- Low: clarify `npx` is smoke-only, not durable install.

### ux-researcher
- High: real-profile mode needs exact typed confirmation and non-interactive abort behavior.
- High: cleanup output must state exactly what was closed, what remains open, and CDP port status.
- Medium: flag names like `--profile default` are dangerously ambiguous.
- Medium: dedicated Pi profile login needs explicit manual steps and success signals.
- Medium: wrapper errors must identify condition, executable/profile/port, and next safe action.

## Suggested Additional Reviewers
- `devops-pro` -- relevant for package-manager policy, install flow, PATH, process state, and rollout/idempotency.
- `qa-engineer` -- relevant for ensuring browser smoke tests prove Brave/auth behavior rather than superficial titles.
- `typescript-pro` -- relevant for Pi skill/extension boundaries and pnpm-only validation requirements.
- `ux-researcher` -- relevant for safe user-facing command semantics around real logged-in browser control.

## Bugs (must fix before execution)
1. Ambiguous install entrypoint and package manager choices make the plan non-executable without hidden judgment.
2. The v1 scope is too broad: global install changes across Windows/macOS/Linux/WSL plus wrappers/docs/tests before proving a minimal helper path.
3. Browser verification can pass while using Chrome or the wrong CDP target; the plan must require Brave identity checks.
4. Real-profile mode lacks exact typed confirmation, non-interactive abort behavior, and unambiguous flag names.
5. Cleanup/session state is unspecified and could repeat the prior failure mode of closing unrelated Brave instances.
6. Fixed CDP port `9222` by default creates a predictable local control endpoint.
7. Evidence/archive rules could store real-profile screenshots, raw page text, account names, local paths, or auth-bearing URLs.
8. The plan lacks a required `## Execution Status` section for `/do-it` status updates.

## Hardening
1. Move Homebrew/global install changes behind discovery; do not edit `Brewfile` unless formula availability is verified.
2. Make `npx -y agent-browser` a smoke/discovery fallback only; durable install should be explicit and version-pinned or range-pinned.
3. Add a platform support matrix for Git Bash/MSYS2, PowerShell, macOS, native Linux, and WSL.
4. Scope Pi changes to docs/skills only; `pi/extensions/` is out of scope unless a new reviewed task is added.
5. Replace grep-only doc validation with targeted checks for a single canonical quick start and absence of conflicting Chrome/default-profile recipes.
6. Add fixture/unit coverage for X-style timeline dedupe and partial-result reporting if extraction guidance is added.

## Simpler Alternatives / Scope Reductions
1. Reduce v1 to an optional runtime helper plus one canonical Pi quick start. Do not change OS/global install flows in the first pass.
2. Implement a wrapper with `--help`, `--open`, `--status`, and explicit Brave CDP launch/connect behavior before adding cleanup/session-manager features.
3. Make authenticated real-profile/X workflow documented and manually approved, not required for archive.

## Automation Readiness
- Agent-runnable operational steps: not ready before fixes; install commands and wrapper contract are too ambiguous.
- Credential/auth flow clarity: not ready before fixes; real-profile access needs exact typed confirmation and evidence redaction rules.
- Evidence and archive gates: not ready before fixes; plan must ban archiving raw authenticated page artifacts by default.
- Manual-only steps and justification: partially present, but contradictory about optional vs required authenticated validation.
- Execution Checklist: present and aligned, but plan lacks `## Execution Status` and needs checklist/task updates after scope reduction.

## Contested or Dismissed Findings
1. Product-manager recommendation to remove real-profile mode entirely was partially dismissed. The user specifically needs Brave Default/X behavior eventually, so the plan should keep real-profile mode as documented/manual opt-in, not default v1 smoke validation.
2. Homebrew install was downgraded from required bug to hardening because T1 discovery can decide whether formula support exists; however, pre-writing `brew install agent-browser` in acceptance criteria must be removed.
3. Timeline extraction fixture testing is hardening unless the implementation adds extraction code/guidance beyond docs; if extraction guidance is added, it becomes required validation.

## Verification Notes
1. Ambiguous install choices confirmed in plan sections T2 and Automation Plan, which use `likely`, `and/or`, and `or targeted new helper` language.
2. Fixed CDP port confirmed in Context/Handoff (`CDP port: 9222`) and security reviewer evidence; plan lacks ephemeral/default port language.
3. Brave-vs-Chrome verification gap confirmed in T3 and Success Criteria, which only check `agent-browser get title`/snapshot.
4. Missing `## Execution Status` confirmed by reading plan headings; section is absent.

## Reviewer Artifact Status
| Reviewer | Artifact | Status | Notes |
|----------|----------|--------|-------|
| reviewer | `.specs/agent-browser-pi-tooling/review-1/reviewer.md` | read | recovered because original reviewer lacked file-write tools |
| security-reviewer | `.specs/agent-browser-pi-tooling/review-1/security-reviewer.md` | read | recovered because expected artifact was missing despite success preview |
| product-manager | `.specs/agent-browser-pi-tooling/review-1/product-manager.md` | read | preview truncation ignored; artifact usable |
| devops-pro | `.specs/agent-browser-pi-tooling/review-1/devops-pro.md` | read | preview truncation ignored; artifact usable |
| qa-engineer | `.specs/agent-browser-pi-tooling/review-1/qa-engineer.md` | read | preview truncation ignored; artifact usable |
| typescript-pro | `.specs/agent-browser-pi-tooling/review-1/typescript-pro.md` | read | preview truncation ignored; artifact usable |
| ux-researcher | `.specs/agent-browser-pi-tooling/review-1/ux-researcher.md` | read | preview truncation ignored; artifact usable |

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unknown | 7 reviewers launched; per-reviewer timing unavailable |
| Artifact reads | unknown | 5 initial artifacts usable; 2 recovered and read |
| Recovery calls | unknown | targeted recovery for reviewer and security-reviewer only |
| Verification | unknown | static plan inspection via read artifacts/plan; no tests run |
| Synthesis | unknown | `.specs/agent-browser-pi-tooling/review-1/synthesis.md` |

## Auto-Apply Plan
- Applied fixes artifact: `.specs/agent-browser-pi-tooling/review-1/applied-fixes.md`
- Known-blocker fixes artifact: `not run/no prior blockers`
- Section integrity check: passed
- Standalone-readiness result: STANDALONE READY
- Repair passes used: 2

## Review Artifact
Wrote full synthesis to: `.specs/agent-browser-pi-tooling/review-1/synthesis.md`

## Overall Verdict
**Ready to execute**

## Recommended Next Step
- Execute via `/do-it .specs/agent-browser-pi-tooling/plan.md`.

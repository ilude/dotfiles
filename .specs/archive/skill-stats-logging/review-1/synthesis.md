---
date: 2026-05-07
status: synthesis-complete
---

# Review: Skill stats command with forward skill-load logging

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle | Artifact |
|----------|------------|-------------------------|--------------|-------------------|----------|
| reviewer | reviewer recovered by coding-light | Completeness & explicitness reviewer | Standard reviewer required for hidden assumptions and /do-it readiness | Assume a fresh executor lacks conversation context and follows ambiguous text literally | `.specs/skill-stats-logging/review-1/reviewer.md` |
| security-reviewer | security-reviewer recovered by coding-light | Operational safety and data exposure reviewer | Standard red-team reviewer required | Assume session logs contain sensitive prompts/paths and rollback can destroy unrelated work | `.specs/skill-stats-logging/review-1/security-reviewer.md` |
| product-manager | product-manager | Scope/simplicity reviewer | Standard simplicity reviewer required | Assume forward logging scope can overtake the reporting feature | `.specs/skill-stats-logging/review-1/product-manager.md` |
| typescript-pro | typescript-pro | Pi extension TypeScript build/toolchain reviewer | Plan adds a TypeScript Pi extension and tests | Assume a top-level test/helper file breaks Pi auto-discovery or typechecks but will not load | `.specs/skill-stats-logging/review-1/typescript-pro.md` |
| qa-engineer | qa-engineer | Session-log fixture and de-duplication verification reviewer | Correctness depends on parsing ambiguous JSONL evidence | Assume tests pass invented JSONL shapes while real sessions fail or double-count | `.specs/skill-stats-logging/review-1/qa-engineer.md` |
| devops-pro | devops-pro | Local workflow automation and operational safety reviewer | /do-it needs exact commands, evidence, rollback, and archive gates | Assume fresh agents run commands literally and need durable evidence paths | `.specs/skill-stats-logging/review-1/devops-pro.md` |

## Standard Reviewer Findings
### reviewer
- High: objective contradicts fallback that permits documentation instead of forward logging implementation.
- High: T1 uses ambiguous repo-relative `.pi` despite runtime sessions living under `$HOME/.pi/agent/sessions`.
- Medium: tests may be added in locations without an exact test runner command.
- Medium: de-duplication precedence is named but not concretely specified.
- Low: rollback command contains placeholder `<other touched files>`.

### security-reviewer
- High: archive preflight lacks clean/touched-file ownership and secret-like file checks.
- Medium: session-log evidence can leak raw prompts, paths, or tool output unless redaction is required.
- Medium: structured event payload must be constrained to metadata only.
- Medium: rollback must enumerate exact touched files and untracked removals.
- Low: manual validation can pollute real metrics unless done in disposable/test session or excluded.

### product-manager
- High: durable forward logging is contingent on unknown architecture and should not block shipping `/skill-stats` unless a durable hook exists.
- Medium: plan is overbuilt for a small reporting command; reuse `/extension-stats` patterns and use minimal validation.
- Medium: `SKILL.md` reads are noisy and should not count in default usage rankings.
- Low: manual validation should be optional if a fixture harness proves behavior.

## Additional Expert Findings
### typescript-pro
- High: `pi/extensions/README.md` says every top-level `*.ts` is auto-discovered as an extension; `pi/extensions/skill-stats.test.ts` would break startup or load as a bogus extension.
- High: forward logging requires proving the exact API and JSONL persistence behavior before implementation.
- Medium: verifying only `registerCommand("skill-stats"` does not prove a default extension factory exists.
- Medium: parser should use `unknown` narrowing and representative JSONL tests, not unsafe `any`.
- Medium: tests under `pi/tests` need the separate pnpm/Vitest command.

### qa-engineer
- High: no exact de-duplication key/count matrix means fixtures can pass while double-counting the same load.
- High: synthetic fixtures alone can miss real JSONL shapes unless they mirror observed minimized records.
- Medium: T5 lacks a stable command; comments are not a runnable test strategy.
- Medium: malformed custom event content and duplicate structured events need negative tests.
- Medium: manual validation must grep newest JSONL for exact structured event fields, not just report output.

### devops-pro
- High: T1 path command can silently ignore the intended runtime path; path existence must be recorded.
- High: rollback is destructive to pre-existing user changes and not executable as written.
- Medium: evidence artifacts lack durable file paths under `.specs/skill-stats-logging/`.
- Medium: user-ask boundary conflicts with accepted documented limitation outcome.
- Medium: no `## Execution Status` section exists despite later references.

## Suggested Additional Reviewers
- typescript-pro -- relevant because Pi extension auto-discovery, default exports, ESM imports, and pnpm typecheck can fail even if command logic is correct.
- qa-engineer -- relevant because historical skill evidence is heuristic and needs exact fixture/de-duplication assertions.
- devops-pro -- relevant because `/do-it` must run on Windows Git Bash/MSYS2 with durable evidence and safe rollback.

## Bugs (must fix before execution)
1. Objective/success criteria contradict whether forward logging is required or optional. Fix by adding an explicit T1 decision gate: implement forward logging only when a durable local hook and persistence API are proven; otherwise pause for user scope approval or mark forward logging blocked rather than archiving as complete.
2. Top-level test placement can break Pi extension auto-discovery. Fix by forbidding `pi/extensions/*.test.ts` and placing tests under `pi/tests/` or non-autodiscovered subdirectories.
3. T1 path discovery is ambiguous and can miss runtime logs. Fix by using exact repo path `pi/` and runtime path `$HOME/.pi/agent/sessions`, recording existence before grepping.
4. De-duplication is under-specified. Fix by requiring a concrete session/turn/skill key and exact fixture count matrix.
5. Rollback/archive safety is inadequate. Fix by adding owned-file preflight, exact rollback paths, secret-like file checks, and an Execution Status section.

## Hardening
1. Define durable evidence artifact paths under `.specs/skill-stats-logging/evidence/` and require checklist evidence updates.
2. Redact session-log evidence; never store raw prompts/tool outputs/skill contents/tokens/private absolute paths in artifacts.
3. Constrain structured skill-load event payload to minimal metadata only.
4. Exclude `SKILL.md` reads from default usage ranking; show them only as candidate/manual-read evidence.
5. Make manual validation optional when automated fixture plus JSONL/event checks prove behavior; otherwise capture exact manual evidence.
6. Replace lead-like task agents with worker/domain agents for execution consistency.

## Simpler Alternatives / Scope Reductions
1. Ship `/skill-stats` historical/best-effort first and treat forward logging as conditional on T1 proving a local durable hook. This avoids turning a small report command into an upstream Pi runtime patch unexpectedly.
2. Reuse `/extension-stats` Markdown/report parsing pattern without refactoring the existing lint-heavy file unless duplication becomes painful.
3. Do not rank `SKILL.md` reads as usage; this avoids misleading metrics from reviewers reading skill files.

## Automation Readiness
- Agent-runnable operational steps: not ready until exact test commands and path probes are fixed.
- Credential/auth flow clarity: no credentials required; acceptable.
- Evidence and archive gates: not ready until durable evidence paths, archive preflight, and Execution Status are added.
- Manual-only steps and justification: acceptable only if optional or paired with exact JSONL/output evidence capture.
- Execution Checklist: exists and has matching task/gate IDs, but must be updated only if task scope changes; no checked items were present.

## Contested or Dismissed Findings
1. Product suggestion to skip repo-wide `make check` was downgraded: repo-wide validation is acceptable for dotfiles changes, but the plan should allow classification of unrelated pre-existing failures.
2. `.pi` path concern was partially confirmed: `.pi` exists in this checkout, but the plan still needs explicit runtime `$HOME/.pi/agent/sessions` checks because session logs are not repo-relative.
3. Forward logging via `pi/extensions/skill-loader.ts` was not confirmed in this session; no local durable file named that was verified. The required fix remains to prove the exact hook/API before implementation.

## Verification Notes
1. Top-level auto-discovery bug confirmed by `pi/extensions/README.md`: “Every top-level `*.ts` file here is loaded by Pi as an extension module via its `export default function` factory,” and it explicitly says do not put helpers/libraries/scaffolds at top level.
2. Path ambiguity confirmed by plan T1 command `grep ... pi .pi` and runtime session path references elsewhere to `~/.pi/agent/sessions`.
3. Rollback bug confirmed by Automation Plan row: `git checkout -- pi/extensions <other touched files>`.
4. Missing `## Execution Status` confirmed: plan references it in Validation Contract but has no such section.

## Reviewer Artifact Status
| Reviewer | Artifact | Status | Notes |
|----------|----------|--------|-------|
| reviewer | `.specs/skill-stats-logging/review-1/reviewer.md` | read | initial reviewer lacked write tools; recovered with coding-light |
| security-reviewer | `.specs/skill-stats-logging/review-1/security-reviewer.md` | read | initial artifact missing despite preview; recovered with coding-light |
| product-manager | `.specs/skill-stats-logging/review-1/product-manager.md` | read | usable |
| typescript-pro | `.specs/skill-stats-logging/review-1/typescript-pro.md` | read | usable |
| qa-engineer | `.specs/skill-stats-logging/review-1/qa-engineer.md` | read | usable |
| devops-pro | `.specs/skill-stats-logging/review-1/devops-pro.md` | read | usable |

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unknown | 6 reviewers launched; 6/6 returned, 2 artifact issues found |
| Artifact reads | unknown | all expected reviewer artifacts eventually read; per-reviewer timing unavailable |
| Recovery calls | unknown | reviewer and security-reviewer artifacts recovered only |
| Verification | unknown | read `pi/extensions/README.md`; grepped plan and paths |
| Synthesis | unknown | `.specs/skill-stats-logging/review-1/synthesis.md` |

## Auto-Apply Plan
- Applied fixes artifact: `.specs/skill-stats-logging/review-1/applied-fixes.md`
- Section integrity check: passed after each edit
- Standalone-readiness result: blocked; see `.specs/skill-stats-logging/review-1/standalone-readiness-blockers.md`
- Repair passes used: 2

## Review Artifact
Wrote full synthesis to: `.specs/skill-stats-logging/review-1/synthesis.md`

## Overall Verdict
**Fix bugs first**

## Recommended Next Step
- Apply the plan fixes above before `/do-it .specs/skill-stats-logging/plan.md`.

---
date: 2026-05-07
status: synthesis-complete
---

# Review: Skill stats command with forward skill-load logging

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle | Artifact |
|----------|------------|-------------------------|--------------|-------------------|----------|
| reviewer | reviewer/coding-medium recovery | Completeness & explicitness reviewer | Required standard reviewer | Assume conditional paths and schema gaps block a fresh executor | `.specs/skill-stats-logging/review-2/reviewer.md` |
| security-reviewer | security-reviewer/coding-light recovery | Redaction, rollback, and payload safety reviewer | Required standard reviewer | Assume session logs and event payloads leak private content | `.specs/skill-stats-logging/review-2/security-reviewer.md` |
| product-manager | product-manager | Scope/simplicity reviewer | Required standard reviewer | Assume forward logging can overtake the report feature | `.specs/skill-stats-logging/review-2/product-manager.md` |
| typescript-pro | typescript-pro/coding-light recovery | Pi extension load/build reviewer | TypeScript extension and auto-discovery risks | Assume typecheck passes but startup/load fails | `.specs/skill-stats-logging/review-2/typescript-pro.md` |
| qa-engineer | qa-engineer | JSONL fixture/de-duplication reviewer | Parser correctness depends on fixtures | Assume tests pass while real logs double-count | `.specs/skill-stats-logging/review-2/qa-engineer.md` |
| devops-pro | devops-pro/coding-light recovery | /do-it automation and evidence portability reviewer | Commands/evidence/archive gates must be portable | Assume fresh agent executes commands literally | `.specs/skill-stats-logging/review-2/devops-pro.md` |

## Standard Reviewer Findings
### reviewer
- Conditional no-hook path is not explicit enough before Wave 2 mutations.
- Structured event schema lacks exact discriminator/payload shape.
- Safe session path display format is not specified.
- `/skill-stats` argument syntax/invalid behavior is undefined.

### security-reviewer
- T1 discovery can persist raw session-log content; needs sanitizer and evidence scan.
- Forward event schema can leak private absolute paths.
- Rollback manifest uses broad directories and can delete unrelated artifacts.
- Report labels need Markdown escaping/length caps.
- Filename-only secret scan misses secret content in evidence files.

### product-manager
- Forward logging should be separated as conditional Phase 2; best-effort report should ship as Phase 1.
- Fixture/report/evidence requirements are heavy for first value.
- Repo-wide `make check` should not block implementation on unrelated local failures.

## Additional Expert Findings
### typescript-pro
- T1 must name the exact non-`node_modules` hook before T4 mutates anything.
- Helpers/tests must be explicitly forbidden as top-level `pi/extensions/*.ts` unless real extensions.
- Typecheck is insufficient; add runtime extension load smoke.
- Restore unrelated newline-only `pi/settings.json` diffs before archive if present.

### qa-engineer
- De-duplication needs mixed-shape duplicate fixtures with missing/shared turn IDs and adjacent lines.
- Real log-shape grounding should require sanitized real envelopes or label unsupported sources.
- Vitest output must prove required cases ran.
- Add realistic `SKILL.md` read fixtures and window-boundary timestamp tests.

### devops-pro
- T1 still needs deterministic redaction-safe summarizer.
- No-hook user decision should happen before Wave 2 code mutations.
- Evidence paths should use `REPO_ROOT=$(git rev-parse --show-toplevel)`.
- Archive preflight must include untracked evidence files.
- `make check` failure may be archived only if task validation passes and failure is classified pre-existing/unrelated.

## Suggested Additional Reviewers
- `typescript-pro` -- Pi extension loading/default export/import semantics and pnpm validation.
- `qa-engineer` -- JSONL fixture matrix, de-duplication, window boundary behavior.
- `devops-pro` -- command portability, evidence paths, archive/rollback safety.

## Bugs (must fix before execution)
1. T1 session-log discovery can leak raw session data; replace open-ended grep/read with a redaction-safe summarizer contract.
2. Final gate numbering/order is inconsistent (`F6` before `F5`); renumber so dependency order and checklist are sequential.
3. No-hook forward-logging path can reach Wave 2 mutations without recorded approval; add explicit branch/stop before code changes.
4. Structured event schema is insufficiently exact and may leak private paths; define exact `customType`, payload, version, and allowed path labels.
5. Evidence/rollback/archive commands need exact manifests, `$REPO_ROOT` paths, untracked file handling, and content redaction scan.

## Hardening
1. Add runtime extension-load smoke beyond typecheck.
2. Require report Markdown escaping, label length caps, and safe session-root display.
3. Add mixed-shape de-dupe, real-envelope, SKILL.md path, and window-boundary fixture expectations.
4. Define `/skill-stats` usage/invalid-argument behavior.
5. Allow `make check` unrelated/pre-existing failures to be classified without blocking archive when task validation passes.

## Simpler Alternatives / Scope Reductions
1. Treat best-effort `/skill-stats` as Phase 1 and forward logging as Phase 2 conditional on a proven hook.
2. Keep default report small; optional windows/sections only when arguments request them or data exists.
3. Collapse evidence artifacts where possible, but keep redaction/manifest artifacts needed for safe automation.

## Automation Readiness
- Agent-runnable operational steps: not ready until sanitizer, gate renumbering, and conditional no-hook branch are fixed.
- Credential/auth flow clarity: no credentials required.
- Evidence and archive gates: need `$REPO_ROOT`, untracked file handling, content redaction scan, exact manifest.
- Manual-only steps and justification: acceptable after no-hook approval path is explicit.
- Checklist: exists, but final gate order must be fixed.

## Contested or Dismissed Findings
1. TypeScript reviewer noted missing `pi/extensions/skill-stats.ts`; dismissed as implementation-not-started, not a plan bug.
2. Product request to make `make check` non-mandatory is downgraded: plan can require running it but classify unrelated pre-existing failures.

## Verification Notes
1. Gate-order bug verified by plan checklist showing `F6` before `F5` and graph `F6 → F5`.
2. Raw discovery bug verified by T1 text: “targeted grep/read of `$HOME/.pi/agent/sessions`”.
3. Schema bug verified by T2 allowed fields mentioning `filePath`/`baseDir` without exact payload/redaction function.
4. `$REPO_ROOT` issue verified by relative `../../.specs` commands.

## Reviewer Artifact Status
| Reviewer | Artifact | Status | Notes |
|----------|----------|--------|-------|
| reviewer | `.specs/skill-stats-logging/review-2/reviewer.md` | read | recovered with coding-medium after write-tool failure |
| security-reviewer | `.specs/skill-stats-logging/review-2/security-reviewer.md` | read | recovered with coding-light |
| product-manager | `.specs/skill-stats-logging/review-2/product-manager.md` | read | usable |
| typescript-pro | `.specs/skill-stats-logging/review-2/typescript-pro.md` | read | recovered with coding-light |
| qa-engineer | `.specs/skill-stats-logging/review-2/qa-engineer.md` | read | usable |
| devops-pro | `.specs/skill-stats-logging/review-2/devops-pro.md` | read | recovered with coding-light |

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unknown | 6 launched; multiple artifact write-tool failures |
| Artifact reads | unknown | all expected artifacts eventually read; per-reviewer timing unavailable |
| Recovery calls | unknown | reviewer, security, typescript, devops recovered |
| Verification | unknown | static plan inspection |
| Synthesis | unknown | `.specs/skill-stats-logging/review-2/synthesis.md` |

## Auto-Apply Plan
- Applied fixes artifact: `.specs/skill-stats-logging/review-2/applied-fixes.md`
- Section integrity check: passed after each edit
- Standalone-readiness result: blocked; see `.specs/skill-stats-logging/review-2/standalone-readiness-blockers.md`
- Repair passes used: 2

## Review Artifact
Wrote full synthesis to: `.specs/skill-stats-logging/review-2/synthesis.md`

## Overall Verdict
**Fix bugs first**

## Recommended Next Step
- Apply fixes, then run standalone-readiness check before `/do-it .specs/skill-stats-logging/plan.md`.

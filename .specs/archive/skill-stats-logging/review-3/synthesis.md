---
date: 2026-05-07
status: synthesis-complete
---

# Review: Skill stats command with forward skill-load logging

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle | Artifact |
|----------|------------|-------------------------|--------------|-------------------|----------|
| reviewer | coding-light recovery | Completeness & explicitness reviewer | Mandatory standard reviewer; original artifact missing | Assume lifecycle, grammar, and traversal assumptions will fail silently | `.specs/skill-stats-logging/review-3/reviewer.md` |
| security-reviewer | coding-light recovery | Security/red-team reviewer | Mandatory standard reviewer; original artifact missing | Assume session logs/evidence leak private data unless prevented by construction | `.specs/skill-stats-logging/review-3/security-reviewer.md` |
| product-manager | product-manager | Simplicity/scope reviewer | Mandatory standard reviewer | Assume the plan overbuilds process beyond user value | `.specs/skill-stats-logging/review-3/product-manager.md` |
| typescript-pro | typescript-pro | Pi Extension TypeScript API contract reviewer | TypeScript Pi extension and typed event API dependencies | Assume docs/type assumptions are subtly wrong and runtime smoke fails | `.specs/skill-stats-logging/review-3/typescript-pro.md` |
| qa-engineer | qa-engineer | Session-log parser fixture and validation reviewer | Parser correctness, fixtures, validation gates | Assume tests pass while double-counting or leaking content | `.specs/skill-stats-logging/review-3/qa-engineer.md` |
| devops-pro | devops-pro | Automation/readiness and evidence-gate reviewer | `/do-it` evidence, archive, resume, Windows Git Bash | Assume fresh session fails from hidden state or path assumptions | `.specs/skill-stats-logging/review-3/devops-pro.md` |
| pi-api-observer | coding-light | Pi runtime observability hook reviewer | Plan relies on `before_agent_start` + `appendEntry` | Assume hook captures inventory, not real invocation usage | `.specs/skill-stats-logging/review-3/pi-api-observer.md` |

## Standard Reviewer Findings
### reviewer
- HIGH: lifecycle persistence is assumed; typecheck does not prove `appendEntry` during `before_agent_start` writes to current JSONL.
- HIGH: timestamp source/conflict handling undefined.
- HIGH: filesystem traversal behavior for huge, unreadable, symlinked, or partial JSONL logs undefined.
- MEDIUM: `/skill-stats` argument grammar and output sort order underspecified.

### security-reviewer
- HIGH: parser/report/evidence must exclude raw JSONL content by construction, not only via post-hoc redaction.
- HIGH: forward logging needs allowlist mapper/runtime validation before `appendEntry`.
- HIGH: ignored `node_modules` can be modified locally without showing in `git diff`.
- MEDIUM: rollback must allow immediate deletion/regeneration of tainted evidence.

### product-manager
- HIGH findings about splitting scope and removing repo-wide validation were downgraded: the plan objective explicitly includes forward logging and repo rules require final `make check` for plan completion.
- Valid hardening: reduce unnecessary manual gates when automated control proves report/logging; keep v1 output focused and label approximate evidence.

## Additional Expert Findings
### typescript-pro
- HIGH: `before_agent_start.systemPromptOptions.skills` likely captures prompt-injected skills, while repo `skill-loader.ts` explicit commands use `sendUserMessage`; explicit slash-command loads need separate instrumentation.
- HIGH: `Skill` contains `filePath`/`baseDir`; payload must never spread raw `Skill`.
- MEDIUM: `appendEntry` has no return id; smoke must verify disk JSONL or mark runtime-unverified.
- MEDIUM: tests/helpers must not be top-level auto-discovered extension files.

### qa-engineer
- HIGH: parser must expose skip/diagnostic counters, not silently drop malformed/unknown records.
- HIGH: dedupe without turn IDs is underdefined and can double-count adjacent same-turn signals.
- HIGH: forward-logging negative tests must prove forbidden fields are absent from append payloads.
- MEDIUM: window boundary semantics and real-shape grounding need explicit gates.

### devops-pro
- HIGH: preflight evidence overwrites on retry, destroying original status.
- HIGH: owned-file manifest is too broad for rollback/archive; needs exact path/action/status/hash entries.
- MEDIUM: archive changed-file list misses untracked files; evidence paths should use `REPO_ROOT` consistently.
- MEDIUM: redaction scan needs classification when non-empty.

### pi-api-observer
- HIGH: `before_agent_start.systemPromptOptions.skills` may be prompt inventory, not usage; default rankings must not conflate it with invocation.
- HIGH: explicit `/skill:<name>` should be captured pre-expansion or in `skill-loader.ts`.
- HIGH: `appendEntry` records use `data`, not `content`; schema/parser must use `type: custom`, `customType: skill-load`, `data`.
- MEDIUM: customType naming must be standardized.

## Suggested Additional Reviewers
- `typescript-pro` -- Pi extension API contract and type/runtime smoke risks.
- `qa-engineer` -- parser, fixture, dedupe, diagnostics, and validation coverage.
- `devops-pro` -- `/do-it` automation, evidence, archive, and Windows Git Bash reliability.
- `coding-light` -- Pi runtime observability hook semantics.

## Bugs (must fix before execution)
1. Schema uses `content` for `appendEntry` records; Pi custom entries persist payload in `data`.
2. Forward logging source conflates prompt skill inventory with explicit skill invocation; explicit repo `skill-loader.ts` path is not covered.
3. Safe payload mapping is not strict enough; raw `Skill` fields and session content can leak.
4. Preflight/owned-file/archive evidence is not resume-safe or exact enough for rollback/archive.
5. Parser/dedupe/timestamp/traversal contracts are underdefined enough to produce misleading stats while passing tests.

## Hardening
1. Add skip/diagnostic counters and deterministic table sorting.
2. Add exact CLI grammar and window boundary semantics.
3. Add redaction classification and tainted-evidence cleanup requirements.
4. Add ignored `node_modules` pre/post metadata check after read-only inspection.
5. Prefer automated control proof over manual validation; keep manual validation only when disk persistence cannot be proven.

## Simpler Alternatives / Scope Reductions
1. Keep v1 report focused: skill, count, evidence/source, window, candidate reads; advanced tables can remain secondary.
2. Do not remove forward logging from this plan because it is part of the objective and now has a plausible local implementation path.
3. Do not remove repo-wide validation because `/do-it` requires the strongest project-defined final gate.

## Automation Readiness
- Agent-runnable operational steps: mostly defined, but need exact manifest/preflight/archive commands and lifecycle smoke.
- Credential/auth flow clarity: no credentials expected.
- Evidence and archive gates: need exact changed-file list, redaction classification, tainted evidence cleanup, and node_modules ignored-status check.
- Manual-only steps and justification: should be optional only after automated control proves report and disk persistence.
- Checklist: exists; after fixes, no new task IDs are needed, but T1/T2/G1/T3/T4/T5/V gates must include amended acceptance details.

## Contested or Dismissed Findings
1. Product request to split forward logging into a follow-up was dismissed: the plan objective explicitly asks for forward logging and research found viable APIs.
2. Product request to make `make check` optional was dismissed: plan-file `/do-it` final validation requires repo-wide validation.
3. Concern that `before_agent_start` is unusable was downgraded: it is usable for prompt inventory logging, but insufficient alone for explicit skill invocation logging.

## Verification Notes
1. Confirmed `data` vs `content` from reviewer evidence and local type research: `appendEntry<T>(customType, data?)` creates custom entries.
2. Confirmed explicit skill-loader risk from reviewer evidence: repo `pi/extensions/skill-loader.ts` registers skill commands and calls `sendUserMessage(renderSkillBody(...))` outside `systemPromptOptions.skills`.
3. Confirmed broad manifest/preflight overwrite risk by reading plan acceptance commands in P1/P2 and archive preflight.

## Reviewer Artifact Status
| Reviewer | Artifact | Status | Notes |
|----------|----------|--------|-------|
| reviewer | `.specs/skill-stats-logging/review-3/reviewer.md` | read | recovered after missing original artifact |
| security-reviewer | `.specs/skill-stats-logging/review-3/security-reviewer.md` | read | recovered after missing original artifact |
| product-manager | `.specs/skill-stats-logging/review-3/product-manager.md` | read | usable |
| typescript-pro | `.specs/skill-stats-logging/review-3/typescript-pro.md` | read | usable |
| qa-engineer | `.specs/skill-stats-logging/review-3/qa-engineer.md` | read | usable |
| devops-pro | `.specs/skill-stats-logging/review-3/devops-pro.md` | read | usable |
| pi-api-observer | `.specs/skill-stats-logging/review-3/pi-api-observer.md` | read | usable |

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unknown | 7 reviewers; per-reviewer timing unavailable |
| Artifact reads | unknown | 5 usable, 2 missing then recovered |
| Recovery calls | unknown | reviewer and security-reviewer only |
| Verification | unknown | plan/type evidence inspected from artifacts and local context |
| Synthesis | unknown | `.specs/skill-stats-logging/review-3/synthesis.md` |

## Auto-Apply Plan
- Applied fixes artifact: `.specs/skill-stats-logging/review-3/applied-fixes.md`
- Known-blocker fixes artifact: `.specs/skill-stats-logging/review-3/known-blocker-fixes.md`
- Section integrity check: passed (`grep -n '^## ' .specs/skill-stats-logging/plan.md`)
- Standalone-readiness result: `STANDALONE READY` after repair pass 1 (`.specs/skill-stats-logging/review-3/standalone-readiness-pass1.md`)
- Repair passes used: 1

## Review Artifact
Wrote full synthesis to: `.specs/skill-stats-logging/review-3/synthesis.md`

## Overall Verdict
**Ready to execute**

## Recommended Next Step
- Execute via `/do-it .specs/skill-stats-logging/plan.md`.

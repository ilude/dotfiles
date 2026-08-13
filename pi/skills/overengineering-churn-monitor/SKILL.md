---
name: overengineering-churn-monitor
description: "Over-engineering and churn monitoring for retry loops, duplicate review or verification, cross-client writes, and GPT-5.6 research follow-up. Use for over-engineering, churn, retry loop, duplicate review, cross-client write, or GPT-5.6 research follow-up. Not for generic Pi log analytics; use pi-log-analytics. Not for debugging; use analysis-workflow."
---

# Overengineering Churn Monitor

## Boundary

| Work | Use |
| --- | --- |
| Monitor the settled over-engineering and churn failure classes, guards, and follow-up program | This skill |
| Generic Pi log analytics | `pi-log-analytics` |
| Debugging an active failure | `analysis-workflow` |
| Historical evidence, adjudication, or experiment details | `pi/docs/pi-research-report.md` |

## Governing principle

`pi/docs/pi-research-report.md` is the durable evidence record. All evidence IDs below resolve through that report. Artifacts under `.tmp/gpt-5.6-research/` are disposable and must never be assumed to exist. Snapshot medians are non-causal, unadjusted associations, not semantic measures or treatment effects. [TMP-001; TMP-007; TMP-008]

## Failure classes

| Class | Report-grade event | Evidence | Detection approach | Mapped guard |
| --- | --- | --- | --- | --- |
| RG-1 | Identical-edit retry loop | SES-001 | Screen repeated identical edit-family error-result hashes, then manually establish materially equivalent arguments, target, relevant state, and result. | P1 equivalent-retry circuit breaker |
| RG-2 | Duplicate verification or review | SES-002 | Screen repeated identical successful tool-result hashes by tool and session, then review whether validator inputs, relevant state, and failure signature changed. | P2 evidence-gated verification stopping |
| RG-3 | Cross-client ownership write | SES-003 | Screen successful edit-family results for `claude/`, `opencode/`, or `copilot/` paths during dotfiles Pi work, then review ownership and authorization. | P3 ownership pre-write gate |
| RG-4 | Mandatory workflow ceremony rejected | SES-004 | Review workflow episodes together with direct user feedback; do not infer rejection from workflow volume alone. | Proportional-workflow restraints already reduced by GIT-009 through GIT-011 |

## Baseline snapshot

These are artifact-reported snapshot values. They are not exactly reproducible and are not causal. [SES-005; TMP-001; TMP-008]

| Snapshot field | Value |
| --- | ---: |
| Boundary timestamp | `2026-07-09T23:17:59.552Z` |
| Pre non-GPT-5.6 sessions | 188 |
| Post GPT-5.6-family sessions | 163 |
| Post non-GPT-5.6 sessions | 2 |

| Marginal median | Pre non-GPT-5.6, n = 188 | Post GPT-5.6 family, n = 163 | Post non-GPT-5.6, n = 2 |
| --- | ---: | ---: | ---: |
| User turns | 7 | 5 | 2.5 |
| Tool-call blocks | 66.5 | 100 | 0.5 |
| Edits or writes | 4 | 10 | 0 |
| Error-marked tool results | 5 | 7 | 0 |
| Delegation calls | 0 | 0 | 0 |
| Task calls | 0 | 0 | 0 |
| Schedule calls | 0 | 0 | 0 |
| Compactions | 0 | 0 | 0 |
| Output tokens | 21,364 | 27,460 | 7,528 |
| Duration in seconds | 9,089.886 | 10,035.169 | 356.341 |

## Intervention ledger

| ID | Intervention | Failure class or dependency | Status |
| --- | --- | --- | --- |
| P1 | Equivalent-retry circuit breaker: verify runtime failure-signature blocking covers edit-family argument plus error fingerprints for the full session. | RG-1 | Dropped (operator decision: per-turn guard deemed sufficient; RG-1 screen still monitors) |
| P2 | Evidence-gated verification stopping in `pi/extensions/quality-gates.ts`: skip model-initiated re-checks when validator inputs, relevant state, and normalized failure signature are unchanged. Mandatory, user-requested, and safety checks are exempt. This is the E3 treatment clause. | RG-2; E3 | Shipped (duplicate-evidence skip in pi/extensions/quality-gates.ts) |
| P3 | Ownership pre-write gate for other-client paths such as `claude/`, `opencode/`, and `copilot/` during Pi-scoped work. | RG-3 | Dropped (operator decision: prefer instruction and directory-structure improvements if RG-3 recurs) |
| P4 | Session configuration fingerprint telemetry: resolved model, effort, prompt and instruction hashes, extension manifest and order, and initial toolset fingerprint. | Prerequisite for readiness-gate items 6-7 | Shipped (pi/extensions/session-configuration-fingerprint.ts, configuration_fingerprint metric event; extension load-order field omitted) |
| P5 | Periodic monitoring screens in [reference.md](reference.md). | RG-1 through RG-4 | Delivered |
| P6 | Conditional E3 experiment, run only if incidents persist after P1-P4. | Blocked by P4 and the readiness gate | Blocked |

RG-4-class mandates were already reduced by the changes cited as GIT-009 through GIT-011 in the report.

## Monitoring procedure

1. Run the [reference.md](reference.md) screens on demand or roughly monthly.
2. Compare metadata outliers with the artifact-reported baseline table. Treat RG screen hits as incident candidates, not prevalence estimates.
3. Manually review flagged sessions and retain sanitized citations only. Never copy raw prompts, arguments, responses, or tool output into tracked files.
4. Update the intervention ledger `Status` column when a guard ships.

## Experiment pointer

| Order | Experiment |
| ---: | --- |
| 1 | E3 evidence-gated verification stopping |
| 2 | E2b delegation activation only |
| 3 | E4 nonactivating optional-tool search |
| 4 | E1 model by instruction-density factorial |
| Conditional | E2a durable task records only |
| Conditional final | E6 soft-limit compaction holdout |

See report Appendix D for treatment clauses, telemetry, guardrails, and stopping rules. Rejected designs are summarized in the report. No experiment has run, and nothing here authorizes a permanent policy change. [SRC-005; TMP-010; TMP-011]

## Anti-patterns

- Reading marginal medians causally.
- Expecting `.tmp` artifacts to persist.
- Re-deriving the corpus or re-auditing the settled report.
- Claiming exact historical reproduction.
- Counting raw errors as churn without establishing equivalent arguments, target, relevant state, and result.

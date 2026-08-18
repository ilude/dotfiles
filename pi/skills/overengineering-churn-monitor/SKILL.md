---
name: overengineering-churn-monitor
description: "Over-engineering and churn monitoring for retry loops, duplicate review or verification, cross-client writes, and GPT-5.6 research follow-up. Not for generic Pi logs; use pi-log-analytics. Not for active debugging; use analysis-workflow."
---

# Overengineering Churn Monitor

## Boundary

Use this skill to screen settled Pi sessions for known churn patterns. Use `analysis-workflow` for an active failure and `pi-log-analytics` for unrelated log analysis.

Historical evidence, decisions, baselines, and experiments live in `pi/docs/pi-research-report.md`. Queries live in [reference.md](reference.md). Do not recreate that material in this skill.

## Failure classes

| Class | Screen for | Required manual check |
| --- | --- | --- |
| RG-1 | Repeated failed edit-family calls | Arguments, target, relevant state, and result were materially equivalent |
| RG-2 | Repeated successful verification or review | Inputs, relevant state, and failure signature did not change |
| RG-3 | Writes to another client's owned paths | The active client did not own or authorize the write |
| RG-4 | Workflow ceremony rejected by the user | Direct feedback confirms rejection; volume alone is insufficient |

## Procedure

1. Run the relevant query from [reference.md](reference.md).
2. Treat matches as candidates, not confirmed incidents or prevalence estimates.
3. Inspect the cited session and apply the manual check for its failure class.
4. Report only confirmed cases with sanitized citations. Do not copy raw prompts, arguments, responses, or tool output into tracked files.
5. Update historical records only when the user requests research or experiment tracking.

## Interpretation

- Snapshot medians in the research report are unadjusted associations, not causes or treatment effects.
- Disposable `.tmp` research artifacts may no longer exist.
- Do not re-audit the settled corpus unless the user requests it.
- Do not count raw errors or repeated calls as churn without checking whether the target, inputs, state, and result were materially equivalent.

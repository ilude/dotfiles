---
date: 2026-05-06
status: synthesis-complete
---

# Review: Pi PRD Workflow Skill

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle | Artifact |
|----------|------------|-------------------------|--------------|-------------------|----------|
| reviewer | reviewer | Completeness reviewer | Mandatory standard reviewer | Assume fresh agents lack hidden context | `.specs/pi-prd-workflow/review-1/reviewer.md` |
| security-reviewer | security-reviewer | Safety reviewer | Mandatory standard reviewer | Assume path/content persistence fails unsafely | `.specs/pi-prd-workflow/review-1/security-reviewer.md` |
| product-manager | product-manager | Simplicity reviewer | Mandatory standard reviewer | Assume workflow is overbuilt or vague | `.specs/pi-prd-workflow/review-1/product-manager.md` |
| qa-engineer | qa-engineer | Verification realism reviewer | Markdown workflow plans often pass weak grep checks | Assume keyword checks pass without usable behavior | `.specs/pi-prd-workflow/review-1/qa-engineer-verification-realism.md` |
| ux-researcher | ux-researcher | Conversational PRD workflow reviewer | User-facing activation and questioning behavior is central | Assume over-triggering and artifact eagerness annoy users | `.specs/pi-prd-workflow/review-1/ux-researcher-conversation-friction.md` |
| planner | planner | Workflow handoff/dependency reviewer | Plan edits PRD→plan→review handoffs | Assume parallel edits create inconsistent artifact contracts | `.specs/pi-prd-workflow/review-1/planner-workflow-coherence.md` |

## Standard Reviewer Findings
### reviewer
- Recovery failed to produce a usable artifact due unavailable write output; partial preview indicated standalone/verification concerns but was not used as source of truth.
### security-reviewer
- Missing slug sanitization/path-boundary/symlink handling.
- Missing redaction guidance for durable PRD artifacts.
- Rollback did not remove new untracked files.
- Grep-only validation could miss unsafe contradictory text.
### product-manager
- Natural-language activation was claimed without validation or clear mechanism.
- Skill scope risked becoming a product-management manual.
- Grep checks did not prove fresh-agent usability.
- Slug generation/collision rules were unspecified.
- Parallel tasks could drift in terminology.

## Additional Expert Findings
### qa-engineer
- Broad OR greps were false-positive prone.
- No dry-run evidence proved end-to-end PRD behavior.
- Negative checks for prohibited slug/latest-PRD behavior were missing.
- `/review-it` PRD-vs-plan dispatch needed explicit branching.
### ux-researcher
- Over-broad PRD mention activation could hijack normal planning.
- File creation readiness lacked confirmation.
- Guided questioning lacked max question count and escape hatch.
- Ambiguity handling lacked proportionality.
- Needed explicit “do not write PRD” cases.
### planner
- Recovery failed to produce a usable artifact; partial preview echoed dependency-order concerns, which overlapped with product-manager findings.

## Suggested Additional Reviewers
- qa-engineer -- verification realism for markdown-command behavior.
- ux-researcher -- conversational friction and opt-in boundaries.
- planner -- workflow handoff coherence and dependency sequencing.

## Bugs (must fix before execution)
1. Natural-language activation was overclaimed and underspecified; fixed by narrowing to explicit PRD intent and opt-in for incidental mentions.
2. Acceptance criteria could pass with keyword-only false positives; fixed by adding conjunctive checks, branch checks, and dry-run evidence.
3. File creation was too eager; fixed by adding confirmation/readiness checkpoint unless the user explicitly says write now.
4. Slug/path safety was undefined; fixed by adding safe slug, collision, path-boundary, and symlink constraints.
5. T2/T3 depended semantically on T1 but were parallel; fixed by making T2/T3 depend on T1.

## Hardening
1. Added redaction/sensitive-content persistence guidance.
2. Added max question batch, skip/assume/draft-now escape hatch, and proportionality guidance.
3. Added negative validation against required slug input and silent latest-filesystem PRD selection.
4. Improved rollback to handle tracked edits and expected new files.
5. Added PRD-vs-plan decision table/branching requirement for `/review-it`.

## Simpler Alternatives / Scope Reductions
1. Keep first pass markdown-only; do not add persistent session metadata.
2. Avoid a generic shared resolver until repeated duplication proves it is needed.
3. Use compact checklist language instead of long product-management theory.

## Automation Readiness
- Agent-runnable operational steps: ready after plan update; commands and dry-run evidence are specified.
- Credential/auth flow clarity: no credentials required; sensitive content persistence guidance added.
- Evidence and archive gates: dry-run artifact and repo/task validation required before archive.
- Manual-only steps and justification: none required.

## Contested or Dismissed Findings
1. Runtime activation mechanism was not converted into a code-change requirement; first pass remains markdown skill behavior by user preference and plan constraints.
2. Full shared resolver was dismissed as out of scope and contrary to the user’s slug-directory concern.

## Verification Notes
1. High activation claim verified in Objective/Constraints; fixed in updated plan by narrowing natural-language behavior.
2. High grep weakness verified in acceptance criteria; fixed with conjunctive checks and dry-run evidence.
3. High file eagerness verified in T1 write requirement; fixed with confirmation checkpoint.

## Reviewer Artifact Status
| Reviewer | Artifact | Status | Notes |
|----------|----------|--------|-------|
| reviewer | `.specs/pi-prd-workflow/review-1/reviewer.md` | unusable | reviewer could not write; recovery returned truncated inline preview |
| security-reviewer | `.specs/pi-prd-workflow/review-1/security-reviewer.md` | read | usable |
| product-manager | `.specs/pi-prd-workflow/review-1/product-manager.md` | read | usable |
| qa-engineer | `.specs/pi-prd-workflow/review-1/qa-engineer-verification-realism.md` | read | usable |
| ux-researcher | `.specs/pi-prd-workflow/review-1/ux-researcher-conversation-friction.md` | read | usable |
| planner | `.specs/pi-prd-workflow/review-1/planner-workflow-coherence.md` | unusable | planner could not write; recovery returned truncated inline preview |

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unknown | 6 reviewers launched; 4 usable artifacts, 2 write failures |
| Artifact reads | unknown | usable artifacts read from review directory |
| Recovery calls | unknown | reviewer and planner recovery attempted; both write-unavailable/truncated |
| Verification | unknown | static plan inspection and targeted grep/read context |
| Synthesis | unknown | wrote `.specs/pi-prd-workflow/review-1/synthesis.md` |

per-reviewer timing unavailable.

## Review Artifact
Wrote full synthesis to: `.specs/pi-prd-workflow/review-1/synthesis.md`

## Overall Verdict
**Ready to execute** after auto-applied plan fixes.

## Recommended Next Step
- execute via `/do-it .specs/pi-prd-workflow/plan.md`

---
date: 2026-05-26
status: synthesis-complete
---

# Pi Workflow Audit Plan Review Synthesis

## Review Panel

| reviewer | base agent | assigned expert persona | why selected | key area reviewed | adversarial angle |
|---|---|---|---|---|---|
| reviewer | reviewer | Completeness and explicitness reviewer | Mandatory standard reviewer | Missing assumptions, gaps, ambiguous instructions, untestable acceptance criteria | Assume vague plan language will cause /do-it to improvise |
| security-reviewer | security-reviewer | Adversarial data-safety reviewer | Mandatory standard reviewer | Sensitive log handling, credential exposure, operational safety | Assume logs contain secrets or private content that can leak into artifacts |
| product-manager | product-manager | Simplicity and scope reviewer | Mandatory standard reviewer | Over-scoping, MVP boundaries, simpler alternatives | Assume the audit will spend effort on mechanics rather than decisions |
| qa-engineer | qa-engineer | Empirical-methods and reproducibility reviewer | The plan is a scientific audit needing valid sampling and coding | Sampling, coding reliability, reproducible artifacts | Assume plausible conclusions will be non-reproducible without operationalization |
| devops-pro | devops-pro | Local-log automation and evidence-pipeline reviewer | The plan scans local Pi sessions, traces, metrics, git history, and artifacts | Commands, artifact layout, resume safety, path handling, scan performance | Assume a fresh /do-it session cannot infer safe execution details |
| ux-researcher | ux-researcher | Workflow-friction and operator-experience reviewer | The audit studies user/agent workflow friction | User rescue, trust, intent restatement, qualitative coding | Assume transcripts omit context and human friction will be under-coded |

## Standard Reviewer Findings

- The plan overuses broad phrases such as "all available local Pi data" without completeness rules, unavailable-path handling, or discovery pass/fail criteria.
- The plan lacks a deterministic sampling algorithm and objective definitions for labels such as smooth, painful, expensive, review-heavy, user rescue, scope drift, and context loss.
- The plan has no explicit privacy/redaction protocol despite reading session, trace, metrics, and artifact data across projects.
- The plan is broad enough that v1 risks becoming an inventory project rather than an actionable workflow audit.
- Deliverables conflict: "final report only" conflicts with required saved inventories, indexes, schemas, and coding artifacts.

## Additional Expert Findings

- QA found missing inter-rater or calibration workflow for subjective coding, no concrete machine-readable artifacts, and no data dictionary for metrics.
- DevOps found no executable runner or command contract, no artifact directory layout, no resume/idempotency model, ambiguous cross-platform path normalization, and weak performance controls for broad scans.
- UX found missing operator-experience codes, undefined user rescue, biased exclusion of incomplete logs, weak case-study selection rules, and no separate measurement of human burden.

## Suggested Additional Reviewers

The selected domain-specific reviewers were sufficient for this plan. No extra reviewer is required before applying fixes.

## Bugs (must fix before execution)

1. **Undefined discovery scope and completeness rules.**
   - Evidence: Data Sources says to use `~/.pi/agent/sessions/**`, traces, metrics, multi-team sessions, `.specs/**`, command implementation, and git history, but acceptance criteria only require producing inventories/indexes.
   - Required fix: Add exact roots/globs, availability checks, unavailable-path logging, and inventory completeness criteria.

2. **No deterministic sampling protocol.**
   - Evidence: Sampling says to select manageable samples and expand if patterns are not saturated, but defines no frame, seed, selection order, overlap handling, or stop rule.
   - Required fix: Add a reproducible candidate-index freeze, stratum definitions, deterministic sort/random seed, min/max sample rules, overlap handling, and saturation rule.

3. **Subjective labels lack operational definitions and reliability controls.**
   - Evidence: The plan measures false positives, review theater, user rescue, context loss, scope drift, smooth, painful, expensive, and final satisfaction without a codebook or calibration.
   - Required fix: Add a coding schema/data dictionary with observable criteria, evidence requirements, confidence levels, ambiguous-case handling, and calibration/recode procedure.

4. **Sensitive log/privacy handling is missing.**
   - Evidence: The plan requires reading and quoting session/trace/metrics logs across projects and writing evidence excerpts, but has no redaction, storage, retention, or access rules.
   - Required fix: Add a privacy protocol: local-only artifacts, no external upload, secret scanning/redaction, quote minimization, anonymized cross-project identifiers, and incident cleanup guidance.

5. **No executable artifact/run contract for /do-it.**
   - Evidence: The plan asks /do-it to build inventories and indexes but provides no command or wrapper contract, artifact layout, run ID, resume behavior, or output schemas.
   - Required fix: Add an execution contract with allowed commands/writes, artifact layout under `.specs/pi-workflow-audit/artifacts/<run-id>/`, atomic writes, resume semantics, and required schemas.

6. **Automation readiness sections are missing.**
   - Evidence: The plan lacks required `## Objective`, `## Task Breakdown`, `## Execution Waves`, `## Success Criteria`, `## Validation Contract`, `## Execution Checklist`, `## Execution Status`, and `## Risk & Manual Gate Decision` sections.
   - Required fix: Restructure the plan into standalone /do-it-ready sections with unchecked checklist items and a clear risk/manual gate decision.

## Hardening

1. Narrow v1 with an MVP stop rule: produce top evidence-backed issues first, expand only if patterns are unclear.
2. Require at least two structural signals for equivalent workflow episodes to reduce false positives.
3. Add an incomplete-context stratum instead of excluding incomplete logs by default.
4. Make era analysis conditional on enough episodes around meaningful command changes, while still building the timeline.
5. Add human-burden metrics distinct from token/tool/runtime performance.
6. Add cross-platform path normalization and scan-performance limits.

## Simpler Alternatives / Scope Reductions

The main simplification is to keep the broad cross-project scope for discovery but make the deep analysis staged: first build a candidate index, then produce an MVP report with the top three evidence-backed workflow problems, then expand only if the MVP does not answer the research questions. Equivalent workflows should require structural evidence instead of broad keyword-only matching.

## Automation Readiness

Not ready before fixes. The original plan lacks executable task sections, artifact layout, risk/manual-gate decision, privacy gates, and a durable execution checklist. The plan should be auto-updated to make `/do-it .specs/pi-workflow-audit/plan.md` executable in a fresh session.

Manual gate decision: no user manual approval is needed for the audit if it remains read-only against source logs and writes only local derived artifacts under `.specs/pi-workflow-audit/`. A manual stop is required if secrets or sensitive content are copied into derived artifacts and cannot be safely redacted by the agent.

## Contested or Dismissed Findings

- Product Manager recommended narrowing v1 to one repo and explicit commands only. Dismissed as a scope change because the user explicitly requested all projects and equivalent workflows. Incorporated as hardening by requiring staged MVP reporting, structural signals, and bounded deep analysis.
- Product Manager recommended making era analysis optional. Modified: timeline is required, but era-based outcome claims are conditional on sufficient candidate counts.

## Verification Notes

High-severity findings were verified by direct read of `.specs/pi-workflow-audit/plan.md` and reviewer artifacts. The plan indeed lacks privacy handling, deterministic sampling, executable artifact paths, risk/manual-gate decision, and required /do-it readiness sections.

## Timing Notes

| Step | Duration | Notes |
|---|---|---|
| Initial review panel | unknown | 6/6 reviewers succeeded; per-reviewer timing unavailable |
| Recovery calls | not run | all artifacts existed and were readable |
| Verification | unknown | direct reads of plan and reviewer artifacts |
| Synthesis | unknown | `.specs/pi-workflow-audit/review-1/synthesis.md` |

## Overall Verdict

**Fix bugs first**

The plan has a strong research direction but is not ready for `/do-it` until it defines safe data handling, deterministic sampling/coding, executable artifacts, and standalone execution sections.

# Pi Workflow Audit Report

## Executive Summary

This local audit found 406 candidate workflow episodes. Top MVP problems:

1. **Workflow mechanics and handoff ambiguity** — evidence: `coded-episodes.jsonl`; confidence: medium; recommendation: persist exact next actions, paths, validation commands, and gate state.
2. **Planning/acceptance-criteria gaps** — evidence: explicit-command rows in `coded-episodes.jsonl`; confidence: low-to-medium; recommendation: `/plan-it` should require measurable criteria and validation commands.
3. **Review process noise risk** — evidence: 8 review-signal rows in `review-findings.jsonl`; confidence: low-to-medium; recommendation: `/review-it` should require evidence, required fix, duplicate/noise classification, and severity rationale.

## Scope and Method

Sources were scanned locally only. Candidate detection used literal `/plan-it`, `/review-it`, `/do-it` matches or at least two structural workflow signals. Deep coding used deterministic seed `20260526` and minimized excerpts.

## Data Sources

See `source-roots.json` and `inventory.jsonl`. Counts: `{"source_roots": 6, "inventory_files": 1967, "candidates": 406, "sampled_coded": 41, "review_signal_findings": 8, "timeline_rows": 242, "duration_seconds": 16.14}`.

## Privacy and Redaction Notes

Session and trace files were treated as sensitive. Report excerpts avoid raw transcript text. Final redaction evidence is in `redaction-log.md`.

## Command/Prompt Change Timeline

See `git-timeline.csv`; 242 rows were collected. Era comparisons are exploratory.

## Episode Inventory

See `candidate-episodes.jsonl`. Explicit and equivalent structural workflow candidates are included; incomplete contexts are flagged.

## Quantitative Findings

- Candidate episodes: 406
- Review-signal findings: 8
- Timeline rows: 242

## Recurring Friction Points

The strongest friction is phase handoff state: plans, checklists, review artifacts, and final archive state must agree or execution becomes resume-sensitive.

## Recurring Review Findings

Review-related signals appear often enough to require schema discipline, but this run does not claim each extracted signal is a valid defect.

## Planning Defects Causing Review Findings

Likely causes are missing/verifiable acceptance criteria, missing exact validation commands, and weak task-to-checklist mapping.

## Review Noise, Duplication, and Theater

Potential theater risk arises when findings lack evidence, duplicate another reviewer, or inflate severity without demonstrated impact.

## Operator Burden Findings

Manual approval gates are appropriate for broad sensitive local session access or dangerous operations. Overusing them creates avoidable burden.

## Performance Findings

Two-pass scanning is justified. This run recorded counts and duration and avoided repeated full-tree scans after inventory.

## Era-Based Comparisons

Exploratory only; stronger conclusions need normalized session timestamps and per-era sample sizes.

## Case Studies

See `case-studies.md`.

## Recommendations

### /plan-it Improvements

Require exact validation commands, measurable success criteria, task/checklist one-to-one mapping, explicit manual-gate rationale, and mutation boundaries.

### /do-it Improvements

Persist transactional progress state, record failure evidence before repair loops, and make archive preflight report exact unmet gates.

### /review-it Improvements

Require evidence, required fix, duplicate/noise classification, confidence, and severity rationale.

### Instrumentation Improvements

Emit stable episode IDs, phase IDs, agent-launch counts, file-read counts, validation command records, and archive status.

### Performance Improvements

Cache inventory manifests per run, cap deep reads, avoid redundant reviewer fan-out for small plans, and prefer targeted validation before repo-wide final checks.

## Confidence and Limitations

Confidence is medium for process-level findings and low-to-medium for category rates. Limitations: single coder, bounded reads, unknown-era records, and minimized excerpts.

## Suggested Follow-Up Experiments

- Add structured workflow telemetry for one week and compare review duplicate rates.
- Add `/plan-it` validation-command enforcement and measure downstream review findings.
- Cap reviewer fan-out by plan risk and compare useful findings per token.

## Appendix: Coding Taxonomy

See `coding-schema.yaml`.

## Appendix: Episode Index

See `candidate-episodes.jsonl` and `coded-episodes.jsonl`.

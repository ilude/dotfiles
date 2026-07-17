---
reviewer: reviewer
status: complete
finding_count: 5
---

# Findings

- severity: high
  evidence: "plan.md defines broad data sources (`~/.pi/agent/sessions/**`, traces, metrics, multi-team logs, `.specs/**`, git history) and says `Use all available local Pi data`, but acceptance criteria only require producing inventories/indexes. It never defines what counts as `all available`, how inaccessible/missing/private logs are handled, or a completeness threshold for discovery."
  required_fix: "Add explicit discovery scope and completeness rules: exact roots/globs, required existence checks, handling for missing/unreadable paths, exclusion logging, and a pass/fail threshold such as every configured root either inventoried with counts or recorded as unavailable with reason."
- severity: high
  evidence: "Sampling Strategy says `Start with a manageable sample, e.g. 10 smooth...` and `Then expand if patterns are not saturated`, while acceptance criterion 4 only says `stratified sample`. There is no deterministic selection algorithm, random seed, saturation definition, minimum sample if fewer episodes exist, or rule for overlapping strata."
  required_fix: "Specify a reproducible sampling algorithm: eligibility filters, stratum priority/order, deduplication for overlapping categories, target/min/max sample sizes, random seed or deterministic sort key, and a concrete saturation/stop rule."
- severity: high
  evidence: "The plan requires classifying review findings as false positives/noise/duplicates and measuring whether final results satisfied requests, but it provides no operational definitions or evidence standard. Terms like `painful`, `smooth`, `expensive`, `review-heavy`, `user rescue`, `context loss`, and `scope drift` appear as strata/signals without measurable thresholds."
  required_fix: "Define a coding rubric with observable criteria for each subjective label, required evidence excerpts, tie-break rules, confidence levels, and at least a small calibration procedure (e.g., recode a subset or document ambiguous cases) before quantitative claims are made."
- severity: medium
  evidence: "Git-Based Era Timeline uses placeholder eras (`after first major /plan-it change`, `/review-it/reviewer schema changes`, `/do-it routing/execution changes`) but does not define the relevant file set, what qualifies as `major`, or how to assign sessions with uncertain timestamps/timezones relative to commits."
  required_fix: "Define the git file/path filters and major-change criteria, or require listing all relevant commits and deriving eras from explicit commit boundaries. Add timestamp normalization rules and an `unknown era` bucket for sessions that cannot be confidently assigned."
- severity: medium
  evidence: "Acceptance criterion 7 says `Produce a final report only` and verification is `no edits to /plan-it...`, but earlier verification requires saving the data inventory, git timeline, candidate episode index, and coding schema. The deliverable set and allowed output paths are ambiguous; `final report only` conflicts with required intermediate artifacts."
  required_fix: "Clarify deliverables and mutation boundaries: either embed inventories/timeline/index/schema as report appendices or allow specific generated artifact paths under `.specs/pi-workflow-audit/`. State explicitly that source command/prompt files are read-only while audit artifacts may be written."

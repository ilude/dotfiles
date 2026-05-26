# QA Review: Empirical Methods and Reproducibility

## Findings

### 1. Severity: High — Stratified sample selection is underspecified and likely biased

**Evidence:** The plan says to select episodes across project, era, explicit/equivalent workflow, success/pain, cost, review-heavy workflows, fixes, and no-finding workflows, then suggests sample buckets such as "10 smooth," "10 painful/rework-heavy," "10 review-heavy," and "10 expensive/high-token." It does not define the sampling frame size, stratum construction, randomization/selection rule, deduplication between overlapping buckets, or how "smooth," "painful," and "expensive" are determined before deep coding.

**required_fix:** Add an operational sampling protocol: freeze the candidate episode index, define mutually exclusive or intentionally overlapping strata, define pre-coding proxy variables for each stratum, specify random seed/selection method, record inclusion/exclusion reasons, and report both the eligible population and sampled counts per stratum/era/project.

### 2. Severity: High — No inter-rater reliability process for subjective coding

**Evidence:** The plan relies on subjective labels including planning defects, false positives, duplicate findings, review theater, severity, satisfaction of original request, context loss, scope drift, and confidence levels. It does not require multiple coders, calibration, adjudication, or an agreement metric.

**required_fix:** Add a coding reliability section requiring a codebook with decision rules/examples, pilot coding, at least two independent coders for a subset or all sampled episodes, agreement reporting such as Cohen's kappa/Krippendorff's alpha or percent agreement where appropriate, and a documented adjudication process before final quantitative claims.

### 3. Severity: High — Reproducible analysis artifacts are required in principle but not specified as concrete deliverables

**Evidence:** Verification requires saving inventories, timelines, indexes, schemas, excerpts, and counting methods, but the acceptance criteria only say to include counts/rates/methodology and produce a final report. There is no required directory layout, machine-readable artifact format, script/notebook path, run command, dependency/environment capture, or immutable snapshot of inputs.

**required_fix:** Define required output artifacts and paths, e.g. `data-inventory.csv/json`, `episode-index.csv`, `coding-schema.yml`, `coded-episodes.csv`, `review-findings.csv`, `analysis.{py,ipynb,sql}`, and `README.md` with exact reproduction commands. Require recording tool versions, repo commit hash, analysis timestamp, random seed, and source file hashes or manifest.

### 4. Severity: Medium — Measurement definitions are not operational enough for repeatable counting

**Evidence:** The measurable signals list includes "number of files read," "number of agents launched," "verification commands were actually run," "final result satisfied original request," "evidence of user rescue," and "token/cost/time metrics where available," but does not define event schemas, parsing rules, missing-data handling, or precedence when session logs, traces, metrics, and artifacts disagree.

**required_fix:** Add a data dictionary mapping each metric to source fields/patterns, inclusion/exclusion rules, missing/unknown codes, conflict-resolution rules across data sources, and examples of countable vs non-countable events.

### 5. Severity: Medium — Acceptance criteria do not include falsifiable thresholds for audit completeness or quality

**Evidence:** The `/do-it` acceptance criteria require producing artifacts and a report, but do not specify minimum coverage, minimum coded sample size after exclusions, acceptable missing-data rate disclosure, required reliability threshold, or criteria for when patterns are considered saturated enough to report.

**required_fix:** Add measurable completion gates: minimum candidate inventory coverage, minimum episodes per key stratum or explicit waiver, required disclosure of missing-data rates, minimum reliability target or adjudication requirement, and a rule that claims below threshold must be marked exploratory rather than reported as recurring findings.

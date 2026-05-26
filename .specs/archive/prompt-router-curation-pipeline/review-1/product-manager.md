- severity: high
  evidence: The plan builds a new source registry, schema layer, feature extractor, triage engine, report writer, CLI, docs, and tests across three waves. Existing prompt-routing already has build_corpus.py, label_history.py, merge_labels.py, audit.py, and classify.py paths for extraction, labeling, merge preview, divergence reporting, and router scoring.
  required_fix: Cut the MVP to one adapter script that reuses classify.py and existing CSV/JSONL merge-review conventions. Defer generic registry, per-status files, and separate triage engine until one source proves useful.

- severity: high
  evidence: The objective stops at inspectable candidates and explicitly defers retraining/promotion, but the stated problem is proving useful source adaptation. Success criteria do not require checking whether candidates improve OOD accuracy, inversion count, or cost routing.
  required_fix: Add a minimal proof gate: run one bounded source through an existing dry-run/eval path and produce a source usefulness report tied to fixed router metrics, or narrow the claim to ingestion-only.

- severity: medium
  evidence: T2 requires at least three external sources in the first implementation, including potentially gated/large Hugging Face datasets. That multiplies schema edge cases before the pipeline has demonstrated that any source yields safe route-level candidates.
  required_fix: Start with one verified easy source plus local fixtures. Add a second source only if it exercises a clearly different row shape needed for the MVP.

- severity: medium
  evidence: Automated triage statuses include auto_accept_candidate and holdout_candidate, but the plan says weak labels are not ground truth and broad human review is not primary. There is no acceptance rubric for cheapest acceptable route beyond router confidence and heuristics.
  required_fix: Rename auto_accept_candidate to scored_candidate or require manual-reviewed labels for any accepted/holdout designation. Keep automated output as ranked review candidates, not acceptance.

- severity: low
  evidence: The checklist has 6 implementation tasks, 3 wave validations, and 5 final gates for local reversible tooling. Several gates duplicate the same pytest and artifact-cleanliness checks.
  required_fix: Collapse to three tasks: source adapter, scorer/report, tests/docs. Use one validation block with targeted tests, one fixture run, one bounded sample run, and production-artifact git status check.

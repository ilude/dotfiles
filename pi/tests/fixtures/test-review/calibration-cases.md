# Calibration fixture inventory

The root protocol assigns contracts and expected outcomes outside this directory. Reviewer-readable repositories are copied from these neutral fixture inputs.

- `case-01` contains a parser port-input boundary with a single permissive assertion.
- `case-02` contains a queue mutation boundary whose return and remaining-state behavior are both observable.
- `case-03` contains two tests exercising the same canonical formatting input.
- `case-04` contains a concurrent, expiring async cache boundary with a real fetcher seam.
- `case-05` contains a small predicate with a benign narrow assertion.
- `case-06` contains an optional package boundary whose runner dependency is intentionally unavailable.

The inventory is descriptive only. It does not classify protection, redundancy, complexity, harmlessness, or equivalence.

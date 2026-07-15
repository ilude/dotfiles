---
reviewer: product-manager
status: complete
---

# Findings

- category: low-value/theater
  severity: medium
  severity_rationale: Four implementation waves each followed by a gate, then repeated focused and repository gates, add coordination overhead without creating a user-visible guarantee beyond the tests themselves.
  evidence: `Execution Waves` defines T1/T2 through T5 with V1-V4; `Final Gates` repeats the same task suites in F1 and F2 and adds administrative F3-F5.
  required_fix: Collapse the work into the smallest dependency-driven slices (registry, coordinator, public tool, end-to-end test/docs) and retain one focused validation gate plus one repo-wide/archive gate. Remove gates that only restate prior commands or record not-applicable status.
  confidence: high

- category: substantive defect
  severity: medium
  severity_rationale: The plan expands `execute_many` from bounded fan-out into a multi-classification API without defining which outcomes are success, retryable failure, or caller action, making the central user workflow ambiguous.
  evidence: T4 says `execute_many` reports started, unchanged manual-ready, blocked, terminal, and actionable-error records, while the objective only promises launching ready executable tasks and returning compact outcomes.
  required_fix: Define a minimal outcome contract and the next caller action for each class, or simplify the action to start eligible executable IDs and report skipped IDs. Add acceptance tests for partial-start behavior and error semantics.
  confidence: high

- category: duplicate
  severity: low
  severity_rationale: The same optional-main-thread guidance is edited and checked across multiple surfaces, increasing documentation maintenance while adding little proof of the runtime value.
  evidence: T2 edits `pi/AGENTS.md` and `pi/PI-INSTRUCTIONS.md`; T5 edits `pi/README.md` and `CHANGELOG.md`; T5.3 and Success Criterion 5 repeat grep-based consistency checks.
  required_fix: Choose one canonical user-facing documentation surface, keep instruction files to concise policy links or necessary runtime guidance, and replace repeated grep checks with one substantive documentation assertion.
  confidence: medium

- category: low-value/theater
  severity: medium
  severity_rationale: The exact four-step scenario is useful as an integration check, but the plan treats its hand-authored sequence and two-worker shape as the product contract without proving why that shape is the smallest representative user outcome.
  evidence: MVP Boundary mandates `batch -> complete -> ready once -> execute_many -> await once -> ready once`; T5 hard-codes two workers and a downstream manual integration task.
  required_fix: State the user outcome being proven -- same-batch dependency creation, bounded concurrent execution, and one event-driven join -- and make the integration test parameterize or separately cover the minimal cases needed for those outcomes rather than encoding an arbitrary graph shape.
  confidence: medium

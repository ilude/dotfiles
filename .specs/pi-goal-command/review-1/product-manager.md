# Product Manager Review

## Finding 1
category: substantive defect
severity: high
severity_rationale: The plan turns a two-form /goal MVP into a stateful workflow engine, increasing implementation and test surface before proving the user needs it.
evidence: MVP asks for `/goal <objective>`, `/goal <file>`, compact guidance, and closeout. T1 additionally requires session-scoped active goal management, before-agent injection, continuation prompts, pending-message guards, and a completion tool. T3 adds session-state restoration from custom entries.
required_fix: Cut MVP to command start, compact reminder, and completion. Defer continuation scheduling, restoration, and custom-entry state unless a verified Pi API requirement makes them necessary.
confidence: high

## Finding 2
category: low-value/theater
severity: medium
severity_rationale: The telemetry and adaptive review contracts do not help implement /goal and add process burden that can distract executors.
evidence: The plan says runtime telemetry is not required, then mandates detailed machine-readable evidence fields and a plan review data contract with reviewer personas, complexity score, risk score, and expected high-risk areas.
required_fix: Remove telemetry and adaptive review sections from this MVP. Keep only the execution checklist plus exact validation commands and evidence notes.
confidence: high

## Finding 3
category: process defect
severity: medium
severity_rationale: The wave order asks implementers to validate behavior before tests exist, then later add tests for behavior already accepted.
evidence: V1 requires running T1 acceptance criteria, including `cd pi/tests && pnpm test goal.test.ts`, but T3, which creates `goal.test.ts`, is blocked by V1. This creates either a blocked gate or encourages untested manual assertions.
required_fix: Merge T1 and T3 into one implementation-plus-focused-tests task, or move tests before V1. Keep one validation gate after both extension and tests exist.
confidence: high

## Finding 4
category: substantive defect
severity: medium
severity_rationale: File-path requirements are ambiguous and risk scope creep into path-security policy instead of the requested file-backed objective.
evidence: The plan says treat an argument as a file only when under current working directory or as an explicitly supplied safe path, and tests should cover traversal and ambiguous path-like objectives. It does not define safe path, symlink behavior, absolute paths, or whether missing `foo.md` is inline text or an error.
required_fix: For MVP, define deterministic behavior: if the single argument resolves to an existing regular file, read it; otherwise treat input as inline text. Defer traversal policy unless Pi exposes untrusted path input.
confidence: medium

## Finding 5
category: low-value/theater
severity: medium
severity_rationale: Validation is duplicated and heavier than the change warrants, increasing cycle cost without new evidence.
evidence: The plan repeats focused test, typecheck, `make check-pi-extensions`, task-specific verification, success criteria, and final gates. Several checks run the same `goal.test.ts` and typecheck multiple times.
required_fix: Collapse validation to three gates: JSON validity and package disabled, focused `goal.test.ts`, and `make check-pi-extensions`. Remove duplicate acceptance re-runs unless a prior gate fails.
confidence: high

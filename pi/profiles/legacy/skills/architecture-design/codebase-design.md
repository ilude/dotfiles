# Codebase Design

Use this reference after a module or architecture candidate has been selected and the unresolved question is its responsibility, interface, seam placement, or dependency strategy.

Design hierarchy: delete unnecessary choices; prefer direct code; enforce consequential invariants at the concrete state-transition or mutation boundary; provide overridable defaults; preserve contextual judgment; add policy machinery only after demonstrated failure; retire machinery that no longer changes outcomes.

## Working terms

- **Module:** Code and behavior presented through one or more coherent interfaces. Its scale can be a function, class, package, process, or cross-layer slice.
- **Interface:** Everything a caller must know to use a module correctly, including inputs, outputs, invariants, ordering, errors, configuration, consistency, performance expectations, and side effects.
- **Seam:** A location where behavior can vary or be substituted without rewriting its callers.
- **Adapter:** A concrete implementation occupying a seam, such as an HTTP client, database implementation, local substitute, or test double.
- **Depth:** Useful behavior and hidden complexity provided for the amount of interface callers must understand.
- **Locality:** Related behavior, invariants, change, failure handling, and verification remaining together.

Use established repository and domain terms when they are more precise. Distinguish a module interface, network API, test seam, deployment service, and bounded-context boundary rather than forcing one vocabulary onto all of them.

## Design process

1. State the behavior and responsibility the module owns. Apply `domain-modeling` only when demonstrated business or operational complexity makes its language, identity, lifecycle, rules, or bounded-context relationships unclear.
2. List what each caller must know. A short method signature can still hide a wide, shallow interface when callers must understand an unwritten protocol.
3. Identify state, invariants, side effects, and failure behavior that should stay local to the responsibility.
4. Place seams only where something meaningfully varies or crosses a repository responsibility, process, deployment, trust, persistence, or external contract boundary.
5. Classify dependencies and choose the simplest suitable treatment:
   - In-process behavior may need no adapter.
   - A real local substitute may be better than a mock.
   - An owned remote system needs an explicit transport contract.
   - An external system needs a controlled adapter and contract validation.
6. When the choice is consequential and materially different interfaces are plausible, apply `brainstorming` to compare alternatives. Do not generate variants that differ only in naming or method arrangement.
7. Compare designs by depth, locality, domain coherence, caller complexity, failure behavior, migration cost, and testability. Do not use DDD terms for low-level query execution, resource lifetime, ordinary validation, error reporting, module placement, or technical concurrency unless they directly express a larger domain model.
8. Select the smallest interface that supports the known behavior without speculative extension points.

A module may expose multiple interfaces when they serve coherent audiences or purposes, such as commands, queries, administration, events, or migration compatibility.

## Eliminate failure categories

When a failure is recurring, costly, and mechanically distinguishable, prefer removing its possibility over repeatedly detecting or explaining it. Work down this order:

1. Remove the unnecessary concept, state, or operation.
2. Make invalid states unrepresentable through types, schemas, constructors, or data structures.
3. Collapse competing implementations into one authoritative path.
4. Narrow capabilities so a component cannot perform operations it does not own.
5. Enforce the invariant atomically at its owning boundary, such as a database constraint, state transition, filesystem permission, or deployment gate.
6. Derive repeated artifacts from one source rather than synchronizing equivalent definitions by convention.
7. When prevention is impractical, reject the failure with a deterministic test, lint rule, CI check, or runtime validation.
8. Use durable instructions or human review only for judgment that cannot be encoded without distorting the design.

Do not add architectural machinery merely to avoid writing guidance. Prefer prevention when it simplifies the valid model or removes a demonstrated class of defects. Keep instructions for values, product direction, and context-dependent decisions; keep tests for behavior that remains possible and must be verified.

At untrusted boundaries, parse broad input into domain values that preserve established facts rather than validating and returning the original representation. Model permitted transitions when order matters. Enforce shared invariants at the boundary that serializes competing decisions.

For each proposed constraint, name the invalid outcome it makes impossible, the boundary that owns enforcement, and an executable example showing rejection or non-representability. Verify both that the forbidden outcome is unreachable and that intended work can still complete. The design is not proven by the presence of a wrapper, type, or rule alone.

For recurring cross-boundary failures, concurrent or distributed transitions, consequential safety constraints, or deeper theoretical comparison, read the research note on [eliminating failure categories](../../../docs/research/obsidian-vault/agent-workflows/patterns/eliminating-failure-categories.md).

## Testing and seams

The stable caller-facing interface should carry most behavioral confidence, but it is not the only valid test surface. Preserve focused internal tests when they cover an independently meaningful algorithm or contract, combinatorial edge cases, faster feedback, or useful fault localization.

Make dependencies explicit when they genuinely vary or cross a meaningful seam. Do not inject every collaborator for the sake of mocking. Keep unavoidable side effects explicit and controlled rather than forcing inherently stateful domain behavior into pure-return shapes.

Adapter count is evidence, not a rule. A single production adapter can still sit at a justified ownership, trust, process, or external boundary. Conversely, creating a test double does not by itself justify a production abstraction.

## Guardrails

- Do not create a seam only because a test is difficult to write; first check whether the behavior is observed at the wrong level.
- Do not deepen a module into an incoherent collection of unrelated responsibilities.
- Do not expose internal seams through the public interface solely for tests.
- Do not replace repository terminology with a borrowed glossary.
- Do not delete lower-level tests until their distinct confidence is preserved or no longer meaningful.
- Do not optimize architecture for automated navigation at the expense of human comprehension, domain integrity, or operational correctness.

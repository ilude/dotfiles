---
status: research-note
source: https://www.youtube.com/watch?v=Jf54k7tFeEc
---

# Eliminating Failure Categories Through Design

## Why this matters

Recurring mistakes are often treated as documentation, review, or testing problems. A stronger response is to change the system so the invalid state, operation, sequence, or authority is absent. The objective is not maximum enforcement. It is a system whose simplest path naturally produces valid outcomes and requires fewer independent decisions.

This pattern connects type-driven design, Design by Contract, information hiding, capability security, state machines, system safety, formal specification, and mistake-proof interaction design.

## Useful signals

### Preserve knowledge at boundaries

"Parse, don't validate" distinguishes checking a fact from preserving it. Validation that returns the original primitive forces later code to remember or repeat the check. Parsing returns a domain value whose representation records what was established.

Useful applications include:

- non-empty collections instead of arrays plus comments;
- validated identifiers instead of strings;
- tagged unions instead of combinations of optional fields;
- constructors that establish invariants once;
- total operations whose inputs contain everything required for success.

Encode stable domain invariants, not temporary product policy. A model that users routinely bypass is evidence that the constraint is misplaced or too expensive.

### Model legal sequences as well as legal values

Many failures involve order rather than malformed data: completing work that never started, deploying before verification, acknowledging before persistence, or using a resource after closure. Represent lifecycle transitions as operations that consume one state and produce another. Do not expose writable status fields when commands can own the transition and its required data.

For concurrent or distributed workflows, write the state machine down before hiding it inside implementation code. Tests cover selected executions; a small model can expose unexpected interleavings.

### Enforce at the boundary that owns and serializes the decision

Place an invariant where competing actions converge:

- type or constructor for an in-process value;
- module interface for a hidden design decision;
- database constraint or transaction for competing writes;
- controller or state machine for lifecycle transitions;
- filesystem or credential boundary for authority;
- deployment gate for rollout safety.

A check-then-write sequence in application code does not enforce an invariant when another writer can race it.

### Narrow authority

Give a component only the operations and resources it needs. A transcript reader should not receive a general content administration client. A deployment check should not receive credentials that can mutate production. An interface that cannot express an unauthorized operation is stronger and easier to understand than instructions not to call it.

Keep ordinary operation separate from exceptional recovery. Recovery can have broader authority, but it should be a distinct, explicit, and observable path.

### Localize knowledge

Information hiding prevents failures caused by scattered knowledge. If several callers independently know normalization rules, storage layout, protocol details, or rollout sequencing, changes can leave them inconsistent. One authoritative path or generated artifact removes synchronization by convention.

A useful module has a small interface that hides meaningful complexity. Do not split code merely to create abstractions, and do not hide complexity that operators still need to observe.

### Make the safe path shorter

Mistake-proof design uses constraints and forcing functions rather than reminders. In software:

- select from valid targets instead of accepting arbitrary text;
- derive values that the system already knows;
- preview the actual mutation rather than asking for a generic confirmation;
- require a current version for mutation;
- make verification and health checks part of deployment rather than optional flags.

Repeated confirmation dialogs are not a substitute. They train users to approve rituals without examining the relevant hazard.

### Verify safety and liveness

Eliminating a failure is a safety claim: a bad outcome is unreachable. A system that refuses all work can satisfy that claim, so also verify liveness: intended work can still complete under expected conditions.

For each proposed constraint, state:

- **Forbidden outcome:** What can no longer happen?
- **Enforcing boundary:** What owns and enforces the rule?
- **Escape path:** How could the rule still be bypassed?
- **Safety evidence:** What compile failure, rejected transaction, model result, or executable check proves rejection?
- **Liveness evidence:** What shows the intended workflow still completes?
- **Cost:** Which valid changes or operations became harder?

## Research foundations

- Alexis King, [Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/) - preserve validation knowledge in refined output types.
- Scott Wlaschin, [Designing with types: Making illegal states unrepresentable](https://fsharpforfunandprofit.com/posts/designing-with-types-making-illegal-states-unrepresentable/) - use product and sum types to represent domain rules.
- Eiffel, [Design by Contract and Assertions](https://www.eiffel.org/doc/solutions/Design_by_Contract_and_Assertions) - assign preconditions, postconditions, and invariants to interfaces.
- David Parnas, *On the Criteria To Be Used in Decomposing Systems into Modules* - decompose around hidden design decisions rather than execution steps.
- John Ousterhout, [A Philosophy of Software Design](https://www.web.stanford.edu/~ouster/cgi-bin/book.php) - prefer deep modules and define errors out of existence.
- Leslie Lamport, [A Formal Basis for the Specification of Concurrent Systems](https://lamport.org/pubs/formal-basis.pdf) - distinguish safety from liveness for concurrent behavior.
- Butler Lampson, [Hints and Principles for Computer System Design](https://arxiv.org/abs/2011.02455) - pursue simple and dependable systems through small, composable mechanisms.
- Nancy Leveson, *Engineering a Safer World* - treat unsafe outcomes as failures of system-level control constraints, not only broken components.
- The Rust Project, [What Is Ownership?](https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html) - compiler-enforced ownership removes classes of memory-management failures.

## Possible Pi fit

The actionable subset belongs in existing skills rather than a new framework:

- `development-philosophy` owns the prevention hierarchy and design evidence.
- `domain-modeling` owns valid states, transitions, and invariant ownership.
- `api-design` owns parsing external representations into domain values.
- `workflow-design` owns the shortest safe path and separate recovery surface.
- security guidance owns narrow capabilities and least authority.
- database guidance owns constraints and transactional enforcement.

The note should remain the deeper context. Ordinary skill activation should load only the few rules needed to change a design decision.

## Risks / reasons not to build yet

- Type-level machinery can make valid changes harder without removing a demonstrated defect.
- A local constraint can move complexity into another boundary rather than remove it.
- Overly rigid models can encode temporary assumptions as permanent architecture.
- Permissive coercion and fallback can appear easy while hiding incorrect outcomes.
- Component contracts do not guarantee safe system interaction.
- Safety mechanisms can block useful progress if liveness is not checked.
- Duplicating this material across skills creates another synchronization problem.

## KISS recommendation

For a recurring and mechanically distinguishable failure, first ask whether the concept or duplicate path can be deleted. Otherwise encode the smallest stable invariant at its owning boundary, make the ordinary path safe by default, and prove both rejection of the bad outcome and completion of the intended workflow. Use deterministic detection for failures that must remain representable, and use instructions or review for contextual judgment.

Do not introduce a new framework, universal checklist, or formal method requirement. Promote only the small rule needed by the skill that owns the decision.

## Related notes

- [Deterministic agent rules and guardrails](deterministic-agent-rules-and-guardrails.md)
- [Self-healing harnesses](self-healing-harnesses.md)
- [Evidence-based code review](evidence-based-code-review.md)

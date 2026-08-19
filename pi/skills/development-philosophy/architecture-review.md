# Architecture Review

Use this review to find a small number of evidence-backed improvements. It reports candidates; it does not refactor them automatically.

## Scope

Start with the module, subsystem, or pain point named by the user. Otherwise inspect recent change and defect hot spots before widening the review. Give little weight to dormant code unless it blocks current work.

Read the relevant interfaces, call paths, tests, recent changes, domain concepts, and recorded decisions. Do not scan the repository uniformly or recommend a refactor from file size, line count, or dependency count alone.

## Look for friction

- Understanding one behavior requires moving through many small files.
- Callers repeat orchestration or must know implementation details.
- An abstraction passes data through without hiding meaningful complexity.
- A routine change spreads across many callers.
- Coupled modules leak responsibilities across their interface.
- Tests must reach past the stable interface to exercise behavior.
- A seam exists without a real source of variation, ownership, deployment, trust, or external dependency.

Treat experienced change and test friction as stronger evidence than theoretical neatness.

## Heuristics

Use these as questions, not laws:

- **Depth:** Does a small interface provide substantial useful behavior while hiding complexity?
- **Deletion test:** If the module disappeared, would its complexity vanish or spread into callers?
- **Test surface:** Can callers and tests exercise behavior through the same stable interface?
- **Locality:** Do related behavior, invariants, change, and verification stay together?
- **Variation:** Does a seam correspond to something that actually varies or crosses an ownership or external boundary?
- **Domain ownership:** Does the proposed module align with the language, lifecycle, invariants, and bounded contexts identified by `domain-modeling`?

Adapter count can support a seam decision but does not decide it. Preserve focused lower-level tests when they still provide distinct confidence, fault localization, or a meaningful independent contract.

## Present candidates

Present no more than three candidates unless the user requests an exhaustive survey. For each:

```markdown
### <Candidate>

Files:
Observed friction:
Proposed responsibility shift:
Expected benefit:
Risk:
Evidence:
Strength: Strong | Worth exploring | Speculative
```

Name the concrete files and behavior. Describe the responsibility shift rather than prescribing a detailed interface before the user selects the candidate. Rank findings by expected payoff in actively changing code.

Use a diagram or HTML report only when the relationships are hard to explain in text or the user requests one.

## Handoff

Stop after presenting the candidates and a top recommendation. If the user selects one:

- Apply `domain-modeling` when language, ownership, lifecycle, or invariants are unresolved.
- Read [Codebase design](codebase-design.md) when the interface, seam placement, or dependency strategy is unresolved.
- Apply `brainstorming` when materially different interfaces are plausible.
- Apply `grill-me` when user decisions remain.
- Apply `planning` when the route is understood.
- Implement directly only when the selected change is small and already specified.

Do not create domain artifacts, ADRs, plans, or implementation changes unless the request owns them.

# Solution Selection

Use this reference after comprehension and caller-flow inspection when a coding task reaches a mechanism choice, including a routine edit. Apply `pi/AGENTS.md` Engineering to choose the best-supported complete solution, not the smallest diff.

## Establish the decision

State the required behavior, causal mechanism, affected callers, and constraints. Distinguish an observed cause from an untested explanation. Determine whether a change needs to exist without removing behavior explicitly requested by the operator.

Prefer suitable maintained code, standard-library or platform capabilities, and installed dependencies, but assess their fit rather than stopping at a fixed reuse rank. Do not preserve a flawed abstraction or introduce awkward coupling merely to avoid custom code.

## Compare meaningful alternatives

When the mechanism choice is consequential, compare plausible approaches that could materially change the result:

- Correctness and failure coverage.
- Clarity, ownership, caller complexity, and testability.
- Operational and maintenance burden.
- Migration cost and regression risk.

Compare a local patch with a boundary-level correction when evidence makes both relevant. Do not manufacture alternatives for obvious fixes. Use `brainstorming` when meaningful alternatives need comparison and `architecture-design` when ownership, interfaces, or seams need design.

State the decisive evidence, material tradeoff, and concrete behavior that will prove the selected approach works. A larger diff is justified when it removes the cause or materially simplifies the resulting system; prefer a smaller diff when it is otherwise equally sound.

## Bound the work, not the diagnosis

If the required work or expertise exceeds a delegated assignment, return the evidence and proposed boundary to the root rather than silently expanding authority or applying an incomplete workaround.

Stop investigation when further evidence is unlikely to change the decision. If a decisive executable check is unavailable or disallowed by the current validation policy, report the uncertainty and the bounded check needed; do not call an assumption proven or choose a workaround to avoid the check.

Preserve trust-boundary validation, security, accessibility, data-loss prevention, required error handling, physical-system calibration, runnable checks for non-trivial logic, and explicitly requested behavior.

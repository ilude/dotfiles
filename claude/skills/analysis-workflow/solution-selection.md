# Solution Selection

Use this reference after analysis establishes that a change is needed and an implementation approach must be selected.

1. Test the smallest viable experiment when feasibility or behavior is uncertain. Stop or pivot on the result instead of expanding the design speculatively.
2. Check for an existing repository pattern, module, or interface that already solves the problem.
3. Reuse it when direct evidence shows that it matches the required behavior, boundary, and failure handling.
4. Choose the smallest implementation that satisfies the confirmed behavior when no suitable reuse exists.
5. Reject speculative abstractions, extension points, and policy machinery without a demonstrated need.
6. Record the evidence for the selected approach and the concrete behavior that proves it is sufficient.

Completion means the selected approach is supported by repository evidence or a concrete requirement, and no larger alternative is needed for the known behavior.

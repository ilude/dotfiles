# Solution Selection

Use this reference after analysis establishes that a change is needed and an implementation approach must be selected.

1. Check for an existing repository pattern, module, or interface that already solves the problem.
2. Reuse it when direct evidence shows that it matches the behavior, boundary, and failure handling required here.
3. If no suitable reuse exists, choose the smallest implementation that satisfies the confirmed behavior.
4. Reject speculative abstractions, extension points, and policy machinery without a demonstrated need.
5. Record the evidence for the selected approach and the concrete behavior that proves it is sufficient.

Completion means the selected approach is supported by repository evidence or a concrete requirement, and no larger alternative is needed for the known behavior.

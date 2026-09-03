# Solution Selection

Use this reference after comprehension and caller-flow inspection when a coding task reaches a mechanism choice, including a routine edit. Establish the root cause and whether the change needs to exist before selecting an implementation.

Apply these decisions in order:

1. Determine whether the change needs to exist. Do not remove behavior explicitly requested by the operator.
2. Reuse the codebase.
3. Use the standard library.
4. Use a native platform feature.
5. Use an already-installed dependency.
6. Use one line when it remains clear and correct.
7. Only then write the minimum custom code.

Stop at the first sufficient rung. When two rungs work, choose the higher rung. Fix the root cause rather than a symptom, and record the evidence for the selected approach and the concrete behavior that proves it is sufficient.

The ladder does not weaken trust-boundary validation, security, accessibility, data-loss prevention, required error handling, physical-system calibration, runnable checks for non-trivial logic, or behavior explicitly requested by the operator.

---
name: testing
description: Guide test design when adding, changing, or reviewing tests, especially mock boundaries and test infrastructure. Not a requirement to audit existing tests or add a separate testing phase.
---

# Testing

- Prefer tests of observable behavior using existing test infrastructure.
- Use mocks when real dependencies would be unsafe, nondeterministic, or impractical. Mocks are not inherently a problem.
- Do not mock away the behavior under test. Assert internal call sequences only when those interactions are part of the required behavior.
- Do not build abstractions or extensive fake infrastructure for speculative tests.
- Choose tests for required behavior, demonstrated defects, and credible risks in the changed path. Do not expand coverage merely because another case can be imagined.
- Passing mocked tests proves only what they exercise; do not present them as evidence that real integrations work.

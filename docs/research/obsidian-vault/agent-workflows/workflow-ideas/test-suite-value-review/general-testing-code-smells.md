---
status: research-note
source: testing literature and framework documentation
---

# Testing code smells and bad practices

Use this guide during test design and review. A smell is a prompt to inspect a test, not an automatic defect. Keep a pattern when it protects a real contract and its cost is understood.

## Review priorities

1. Does the test observe a meaningful behavior at a stable seam?
2. Can it fail for the expected defect?
3. Can it run alone, in any order, and in parallel where the suite permits parallelism?
4. Does it control and clean up every resource it creates?
5. Will a failure identify the broken contract without extensive investigation?
6. Is this the cheapest test layer that can detect the risk?

## Test intent and assertions

### Weak or missing assertions

**Signal:** The test mostly executes code, checks only that no exception occurred, or verifies a value too loosely.

**Risk:** Execution is mistaken for verification. Important regressions can still pass.

**Prefer:** Assert observable postconditions, returned values, state transitions, emitted events, persisted data, or stable error semantics. Derive expected values independently rather than reproducing the implementation in the test.

**Exception:** Completion without an error can be the contract for a smoke test, migration, or idempotent operation. Label that scope accurately.

### Assertion roulette

**Signal:** A test contains many similar assertions and a failure does not identify the scenario or property.

**Risk:** Diagnosis requires reconstructing which assertion represented which requirement.

**Prefer:** Split unrelated behavior, use domain-specific assertion helpers, or attach useful context to parameterized cases. Modern expected/actual output can make custom messages unnecessary for simple assertions.

### Eager test

**Signal:** One test verifies several unrelated rules or workflows.

**Risk:** The test has multiple reasons to fail, poor fault localization, and broad setup.

**Prefer:** One coherent behavior or invariant per test. Keep a multi-step scenario together when the sequence itself is the contract.

### Over-specified test

**Signal:** Assertions pin incidental call order, exact internal calls, private state, formatting, or complete object structure.

**Risk:** Harmless refactoring breaks tests even though behavior is unchanged.

**Prefer:** Assert only contractually significant outcomes. Verify interactions when the interaction is the behavior, such as authorization, retries, messages, or ordered protocol steps.

### Broad snapshots and golden files

**Signal:** Large outputs are accepted wholesale, change often, or are updated without semantic review.

**Risk:** Important changes hide in noisy diffs and reviewers learn to approve generated output mechanically.

**Prefer:** Focused semantic assertions, small snapshots, stable normalization, and deliberate diff review.

**Exception:** Golden files are effective for compilers, serializers, formatters, protocols, and visual output when the complete artifact is the contract and diffs remain reviewable.

### Happy-path-only coverage

**Signal:** Tests cover valid examples but omit malformed input, boundaries, failure paths, and invariant violations.

**Risk:** The suite does not constrain the behavior that usually carries the highest operational risk.

**Prefer:** Select equivalence classes, boundary values, negative cases, and important state transitions. Use property-based tests when a general invariant matters more than a few examples.

## Fixtures and readability

### General fixture

**Signal:** Shared setup creates more state than most tests use.

**Risk:** Tests hide their prerequisites, run extra work, and fail after unrelated fixture changes.

**Prefer:** Build the smallest state needed near the test. Share immutable builders or narrowly scoped fixtures, not a mutable world.

### Mystery guest

**Signal:** A test silently depends on a file, database row, environment variable, clock, network service, or prior test.

**Risk:** The source of data and failure is invisible; local and CI behavior diverge.

**Prefer:** Declare dependencies, provision deterministic state, and make integration prerequisites explicit.

### Obscure test

**Signal:** Generic names, deeply nested helpers, clever control flow, or abstraction hide the scenario.

**Risk:** A reader cannot tell what matters or why the test failed.

**Prefer:** Domain-language names and a visible arrange-act-assert flow. Extract helpers only when their names expose intent better than the details they replace.

### Test-code duplication

**Signal:** Setup, fixture construction, or assertions are copied and drift independently.

**Risk:** Contract changes require inconsistent edits.

**Prefer:** Parameterized cases, small builders, or domain-specific assertions.

**Caution:** Do not remove every repeated line. Explicit local setup is often easier to understand than a generic test framework built inside the suite.

### Conditional test logic

**Signal:** Branches, exception swallowing, or complex loops decide whether assertions run.

**Risk:** A bug in the test can make it pass without checking the intended behavior.

**Prefer:** Linear tests and framework-supported parameterization. Ensure every expected failure path fails if the operation unexpectedly succeeds.

## Isolation and lifecycle

### Shared mutable state

**Signal:** Tests mutate suite fixtures, globals, singleton caches, files, databases, ports, or accounts used by other tests.

**Risk:** Results depend on order, parallelism, retries, or residue from an earlier failure.

**Prefer:** Fresh state per test, unique namespaces, transactions where appropriate, and immutable shared data.

### Test-order dependency

**Signal:** A test passes in the full suite but fails alone, or requires another test to run first.

**Risk:** Selective runs and parallel execution are unreliable.

**Prefer:** Each test establishes its own preconditions and cleans up its effects. Isolate an explicitly ordered protocol scenario from ordinary independent tests.

### Fragile cleanup

**Signal:** Cleanup is registered late, runs only after successful assertions, or closes resources in the wrong order.

**Risk:** Failed setup or assertions contaminate later tests and may leave processes, sockets, files, or locks behind.

**Prefer:** Register cleanup as each resource is acquired. Use lifecycle hooks or `finally`. Stop users of a resource before deleting the resource.

### Sleep-based synchronization

**Signal:** Fixed delays wait for asynchronous state.

**Risk:** A delay is both slower than necessary and too short under load.

**Prefer:** Await the operation's completion or poll an observable condition with a bounded timeout and useful diagnostics.

**Exception:** Time-based behavior may require advancing or observing time, but a sleep should not substitute for synchronization.

### Uncontrolled nondeterminism

**Signal:** Tests depend on the current clock, time zone, locale, randomness, network, DNS, process scheduling, or undeclared host state.

**Risk:** Results vary across runs and environments.

**Prefer:** Inject or control nondeterministic inputs. Seed randomized tests and print the seed on failure. Exercise real dependencies in explicit integration tests.

### Retry as a default fix

**Signal:** Flaky tests are routinely rerun until they pass.

**Risk:** Retries hide races and product defects, increase cost, and weaken trust in failures.

**Prefer:** Find and remove the nondeterministic boundary. Quarantine only with an owner, visible status, and removal condition. Keep retries when retry behavior itself is the production contract.

### Broad timeouts

**Signal:** Global timeouts are repeatedly increased to make failures disappear.

**Risk:** Deadlocks, leaks, and missing completion signals become slow failures instead of diagnosed defects.

**Prefer:** Bound the exact operation, report its last observed state, and use cancellation. Set longer limits only for known external constraints.

## Doubles and boundaries

### Excessive mocking

**Signal:** Most internal collaborators are replaced and assertions mostly verify calls between mocks.

**Risk:** The test proves a fabricated implementation story while real composition and contracts can remain broken.

**Prefer:** Mock slow, destructive, unavailable, or nondeterministic boundaries. Keep cheap owned collaborators real and add contract or integration coverage at important boundaries.

### Mocking implementation details

**Signal:** Doubles target private methods, concrete internals, or a call sequence that is not externally significant.

**Risk:** Refactoring breaks tests without changing behavior.

**Prefer:** Double a stable owned interface or external boundary and assert its meaningful protocol.

### Tautological mocks

**Signal:** The mock is configured with the result and the test only asserts that same result or that the configured call occurred.

**Risk:** The assertion restates setup and proves no product behavior.

**Prefer:** Assert a transformation, decision, state change, or protocol produced by the subject. Add a higher-level test where collaboration matters.

### Fake drift

**Signal:** An in-memory fake accepts inputs, ordering, transactions, or failures that the real dependency rejects.

**Risk:** Fast tests give false confidence.

**Prefer:** Run a shared contract suite against the fake and real implementation. Document intentional differences.

### Test-only production branches

**Signal:** Production behavior changes under a test flag or internals are exposed solely for assertions.

**Risk:** Tests exercise a path that production never uses and expand the production API.

**Prefer:** Use normal dependency seams, supported observability, or a test adapter. Testability can justify better design, but not a second hidden implementation.

## Suite strategy

### End-to-end overuse

**Signal:** Minor behavior is verified mainly through browsers, deployed systems, or many services.

**Risk:** Feedback is slow, failures have broad causes, and environment instability dominates product signal.

**Prefer:** Put each risk at the lowest-cost layer that can observe it, then retain focused end-to-end checks for critical wiring and workflows.

### Unit-test-only confidence

**Signal:** All dependencies are replaced and no test exercises serialization, persistence, configuration, protocol, or deployment wiring.

**Risk:** Individually correct units can fail when composed.

**Prefer:** Combine focused unit tests with component, integration, contract, and a small number of end-to-end tests according to architecture and risk. No universal layer ratio applies.

### Duplicate scenarios at every layer

**Signal:** The same cases are maintained in unit, integration, API, and end-to-end suites without detecting distinct risks.

**Risk:** Runtime and maintenance grow without proportional confidence.

**Prefer:** Assign each risk to the cheapest effective layer. Keep deliberate overlap around high-value boundaries and deployment wiring.

### Coverage chasing

**Signal:** A percentage target drives trivial tests, exclusions, or assertions that merely execute lines.

**Risk:** The metric is optimized instead of defect detection.

**Prefer:** Use coverage to find unexamined code, then select tests by contract and risk. High coverage is not proof of correctness; low coverage can still reveal a consequential gap.

### Disabled tests without ownership

**Signal:** Skipped, focused, quarantined, or TODO tests remain indefinitely.

**Risk:** Expected protection silently disappears or local-only suite controls reach CI.

**Prefer:** Make disabled state visible, explain the blocking condition, assign ownership, and define when it will be restored or removed.

## Review questions

- What product defect would make this test fail?
- Is the assertion independent from the implementation that computes the result?
- Which state or resource crosses the test boundary?
- Does the test still work alone and after a failed neighboring test?
- Does the double preserve the real boundary's contract?
- Is broader integration covered somewhere appropriate?
- Would a reviewer understand a failure from the test name and output?
- Is a slow or flaky test exposing a product constraint, or only harness design?

## Sources

The catalogs use overlapping names. This guide groups smells by failure mechanism rather than treating one taxonomy as authoritative.

1. Gerard Meszaros, *xUnit Test Patterns: Refactoring Test Code*: https://xunitpatterns.com/
2. Martin Fowler, "Mocks Aren't Stubs": https://martinfowler.com/articles/mocksArentStubs.html
3. Martin Fowler, "The Practical Test Pyramid": https://martinfowler.com/articles/practical-test-pyramid.html
4. Google Testing Blog, "Just Say No to More End-to-End Tests": https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end-tests.html
5. Google Testing Blog, "Testing on the Toilet: Don't Overuse Mocks": https://testing.googleblog.com/2017/06/testing-on-toilet-dont-overuse-mocks.html
6. Microsoft, "Unit testing best practices": https://learn.microsoft.com/en-us/dotnet/core/testing/unit-testing-best-practices
7. JUnit 5 User Guide, test lifecycle and parallel execution: https://junit.org/junit5/docs/current/user-guide/
8. pytest documentation, fixtures and monkeypatching: https://docs.pytest.org/en/stable/how-to/fixtures.html and https://docs.pytest.org/en/stable/how-to/monkeypatch.html
9. Fabio Palomba et al., "Beyond Technical Aspects: How Do Test Smells Influence the Maintenance of Automated Test Suites?": https://doi.org/10.1109/ICSME.2014.58

## KISS recommendation

Use these smells as investigation prompts. Report a finding only when repository evidence establishes a concrete false-confidence path, reliability failure, or human-time burden.

## Related notes

- [PRD: Pi test-suite value review](PRD.md)
- [TypeScript testing smells and performance](typescript-testing-code-smells.md)
- [Agentic test-review research](agentic-test-review-research.md)

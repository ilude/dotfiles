---
status: research-note
source: TypeScript, test-runner, and DOM-testing documentation
---

# TypeScript testing code smells, bad practices, and performance

Use this guide with the general testing-smells guide. It focuses on failure modes created by JavaScript runtime semantics, TypeScript's erased type system, ESM and CommonJS module behavior, DOM test environments, and Jest/Vitest-style runners.

Framework behavior changes across versions. Check the installed runner, environment, transformer, module mode, and repository scripts before applying configuration advice.

## Quick review

- Every promise, async assertion, user event, and async query is awaited or returned.
- Runtime tests and compile-time type tests are separate, enforced checks.
- Mocks preserve runtime shape and are restored at the correct boundary.
- Fake timers are scoped and promise work is explicitly awaited.
- Module mocks account for import timing, hoisting, caching, and ESM limitations.
- DOM tests use accessible behavior rather than component internals.
- Snapshots are small, stable, and reviewed semantically.
- Tests close servers, sockets, clients, subprocesses, and pending requests.
- Performance changes follow measurements from representative cold and warm runs.

## Async behavior

### Floating test promise

**Bad practice:** Calling an async operation or `.resolves`/`.rejects` assertion without `await` or `return`.

**Failure mode:** The runner can finish the test before the assertion executes. A rejection may become a late unhandled rejection or escape the owning test.

```typescript
// Wrong: the test can finish early.
test("rejects an invalid token", () => {
  expect(loadToken("bad")).rejects.toThrow("invalid token");
});

// Better.
test("rejects an invalid token", async () => {
  await expect(loadToken("bad")).rejects.toThrow("invalid token");
});
```

Use lint rules that detect floating promises where the repository supports them, but keep the runner contract visible in the test.

### `forEach(async ...)`

**Bad practice:** Assuming `Array.prototype.forEach` waits for async callbacks.

**Failure mode:** `forEach` ignores callback promises. The test or teardown can finish while cases still run.

```typescript
for (const input of inputs) {
  await verify(input);
}

await Promise.all(inputs.map((input) => verify(input)));
```

Choose sequential execution when cases share a constrained resource; choose `Promise.all` only when they are independent.

### Callback and promise completion mixed together

**Bad practice:** Accepting a runner callback such as `done` while also returning a promise.

**Failure mode:** The test has two completion signals, which creates ambiguity, timeouts, or runner errors.

**Prefer:** Convert callback APIs to one promise or use the runner's callback form alone, including error propagation.

### Catching any error as success

**Bad practice:** A `try/catch` test passes if any statement throws, or it has no assertion count when unexpected success is possible.

**Failure mode:** Setup and assertion defects satisfy the test instead of the intended rejection.

**Prefer:** Assert the promise rejection directly and check stable error type or fields. Do not overspecify incidental message wording.

### Arbitrary sleeps and broad `waitFor`

**Bad practice:** Sleeping before an assertion, or wrapping actions and many assertions inside a retry callback.

**Failure mode:** Sleeps are slow and race-prone. Retried side effects can execute more than once and hide ordering defects.

**Prefer:** Await the operation's completion. In Testing Library, use `findBy*`, `waitForElementToBeRemoved`, or a narrow `waitFor` assertion. A `waitFor` callback retries when it throws; returning `false` does not request another retry.

## Type safety

### Runtime tests used as type tests

**Bad practice:** Assuming a runtime assertion proves interfaces, overloads, generics, conditional types, or rejected calls.

**Failure mode:** TypeScript erases those constructs before execution.

**Prefer:** Add compile-time tests with the repository's supported mechanism, such as `expectTypeOf`, `assertType`, `tsd`, or dedicated `tsc` fixtures. Keep runtime behavior tests separate.

### Test runner assumed to type-check

**Bad practice:** Treating a passing Vitest/Jest run as proof that test and product code pass TypeScript checking.

**Failure mode:** Many runners transpile TypeScript without running the authoritative project type check.

**Prefer:** Run the repository-owned `tsc --noEmit`, build, or type-test command as an independently enforced check.

### `any`, broad casts, and non-null assertions in fixtures

**Bad practice:** Using `any`, `as SomeType`, or `!` to force incomplete fixtures and mocks through the compiler.

**Failure mode:** The compiler stops detecting API drift, missing members, nullability, and invalid return types. Casts do not alter runtime objects.

**Prefer:** Narrow fixture builders, explicit factories, `satisfies`, and `unknown` with runtime narrowing at untrusted boundaries.

```typescript
const user = {
  id: "user-1",
  role: "reader",
} satisfies User;
```

Use a localized assertion only when constructing an intentionally impossible state is the subject of the test. Explain that intent in the test name or fixture API.

### Misusing `@ts-ignore` or `@ts-expect-error`

**Bad practice:** Suppressing compiler failures without proving that a specific invalid call remains rejected.

**Failure mode:** `@ts-ignore` can hide unrelated future errors. A broad suppression weakens the type contract.

**Prefer:** Use `@ts-expect-error` immediately above the deliberately invalid expression so the check fails when no error is produced. Keep the fixture minimal.

### Type-safe mock mistaken for a faithful fake

**Bad practice:** Assuming `vi.mocked`, `jest.mocked`, or `jest.Mocked<T>` validates runtime behavior.

**Failure mode:** These helpers improve static typing but cannot prove semantic compatibility, side effects, timing, or failure behavior.

**Prefer:** Explicit factories plus behavior assertions. Share contract tests with important fakes.

## Mocks, globals, and module state

### Wrong mock cleanup operation

**Bad practice:** Treating clear, reset, and restore as synonyms.

**Failure mode:** Clearing call history can leave an implementation installed; resetting can erase a needed implementation; restoring generally applies to spies and replaced properties, not every standalone mock function.

**Prefer:** Choose cleanup by intent:

- **Clear** call history while retaining implementation.
- **Reset** history and mock implementation.
- **Restore** the original spied or replaced implementation.

Enable global cleanup settings only when that policy is correct for the whole project.

### Leaked globals, environment, clock, or DOM

**Bad practice:** Mutating `process.env`, `globalThis`, `Date`, timers, browser globals, or rendered DOM without teardown.

**Failure mode:** Later tests inherit hidden state and become order-dependent.

**Prefer:** Use runner stubbing APIs and matching restore APIs in lifecycle hooks. Capture original values when no supported stub exists. Verify whether DOM cleanup is automatic in the installed framework and custom render setup.

### Mock declared after import

**Bad practice:** Expecting a module mock to replace bindings that have already been imported and evaluated.

**Failure mode:** ESM imports are statically resolved and module instances are cached. Runner transforms and hoisting rules differ.

**Prefer:** Use the runner's documented module-mocking form, register the mock before importing the subject, or dynamically import after controlled setup. Do not transfer CommonJS mocking recipes to ESM without checking the runner's ESM contract.

### Mock factory relies on ordinary source order

**Bad practice:** Referencing local values from a mock factory without accounting for mock hoisting.

**Failure mode:** Jest/Vitest may move mock registration before imports and local initialization.

**Prefer:** Keep factories declarative or use the runner's supported hoisted setup API.

### Routine module-registry reset

**Bad practice:** Calling `resetModules` for every test as generic cleanup.

**Failure mode:** The runner repeatedly evaluates the module graph, increases startup cost, and can create multiple singleton identities unlike production.

**Prefer:** Inject dependencies or provide an explicit state-reset API. Isolate/reload modules only when module initialization or module-scoped state is the behavior under test.

### Mocking every imported module

**Bad practice:** Replacing local collaborators, parsers, serializers, and domain logic by default.

**Failure mode:** Tests validate mock wiring while real import shape and integration contracts drift.

**Prefer:** Mock external, nondeterministic, expensive, or destructive boundaries. Keep cheap owned code real.

## Timers and scheduling

### Fake timers applied too broadly

**Bad practice:** Installing fake timers globally or for an entire suite when only one behavior needs them.

**Failure mode:** `Date`, timer APIs, microtasks, `performance`, and third-party code can observe synthetic semantics. Later tests may inherit a frozen clock.

**Prefer:** Scope fake timers to the smallest test and restore real timers in `afterEach` or `finally`. Configure exactly which APIs are faked when supported.

### Advancing timers without awaiting async continuations

**Bad practice:** Assuming advancing the timer queue also completes every promise continuation started by the callback.

**Failure mode:** Timer and promise/microtask queues are distinct. Assertions race pending work.

**Prefer:** Use async timer-advance APIs where available and await the product's completion promise. Avoid generic "flush all promises" helpers when the real API exposes completion.

### Recursive timers drained without a bound

**Bad practice:** Running all timers for code that reschedules itself.

**Failure mode:** The test can loop until the runner's safety limit or conceal an unintended scheduling cycle.

**Prefer:** Advance to the next timer or a known duration and assert each relevant state transition.

## DOM and component tests

### Component internals as the seam

**Bad practice:** Asserting component instances, hook state, private methods, CSS implementation classes, or framework-specific tree shape.

**Failure mode:** Refactoring breaks tests while user behavior remains correct.

**Prefer:** Interact through visible controls and assert accessible output. Testing Library recommends DOM nodes and usage resembling real interaction.

### Test IDs as the default query

**Bad practice:** Selecting every element by implementation-only IDs.

**Failure mode:** The test bypasses accessible roles, labels, and names and can miss usability regressions.

**Prefer:** Queries such as role and accessible name, then labels and visible text. Use test IDs when no user-facing semantic selector exists.

### Browser emulation mistaken for a browser

**Bad practice:** Treating a `jsdom` or `happy-dom` pass as proof of layout, navigation, rendering, accessibility-tree, or full browser behavior.

**Failure mode:** DOM emulators implement different subsets and semantics from browsers.

**Prefer:** Use emulation for component logic and DOM contracts; use browser-mode or end-to-end tests for browser-owned behavior.

## Snapshots and errors

### Large snapshots as default assertions

**Bad practice:** Snapshotting component trees or objects containing dates, generated IDs, styles, or unrelated fields.

**Failure mode:** Churn obscures semantic changes and increases review cost.

**Prefer:** Focused assertions or small inline snapshots. Normalize only values that are genuinely nondeterministic and irrelevant to the contract.

### Blind snapshot updates

**Bad practice:** Running update mode and committing results without explaining each semantic change.

**Failure mode:** Accidental behavior becomes the new expected output.

**Prefer:** Review snapshots as test code. Identify why each changed expectation is correct.

### Open handles hidden with force-exit

**Bad practice:** Making the runner terminate despite pending servers, sockets, database clients, subprocesses, requests, or timers.

**Failure mode:** Passing output does not prove cleanup; writes and assertions may be truncated.

**Prefer:** Await completion and close every owned resource. Use open-handle diagnostics to locate leaks, not as proof that none exist. Treat force-exit as temporary diagnosis, not normal CI policy.

## Performance smells and practices

Performance work starts with a representative measurement. Separate cold CI runs from warm watch-mode reruns. Record the command, runner version, machine/CI resources, selected tests, and whether coverage or type checking was enabled.

### Guessing instead of profiling

**Bad practice:** Changing pools, worker counts, isolation, transforms, or timeouts based only on total wall time.

**Cost:** Startup, environment creation, transforms, imports, setup, test bodies, I/O, garbage collection, and worker contention require different fixes.

**Prefer:** Inspect the runner's timing phases. Vitest reports environment, import, transform, setup, worker, and test duration. Use `vitest doctor` where available and CPU profiles for a reproducible subset. Re-run the same benchmark after one change.

### DOM environment for pure logic tests

**Bad practice:** Configuring `jsdom` or `happy-dom` for every file.

**Cost:** Each environment creates browser-like globals and a window. Under per-file isolation, setup is paid repeatedly.

**Prefer:** Keep Node as the default for non-DOM tests and opt files or projects into a DOM environment. Do not switch from `jsdom` to `happy-dom` solely for speed without checking behavioral compatibility.

### Barrel imports and broad application entrypoints

**Bad practice:** Unit tests import an index barrel or application bootstrap that loads a large transitive graph and side effects.

**Cost:** Transform and import time recur across files, especially under isolation.

**Prefer:** Import the smallest public module boundary that owns the tested behavior. Retain separate tests for bootstrap and export wiring.

### Expensive setup repeated per file or test

**Bad practice:** Repeatedly parse large fixtures, initialize immutable services, compile schemas, or read unchanged data.

**Cost:** Setup dominates the behavior being tested.

**Prefer:** Use the narrowest safe shared scope for immutable work and small per-test builders for mutable state. Never trade isolation for speed without proving tests remain order- and worker-independent.

### Too many tiny files or oversized mixed files

**Bad practice:** Splitting mechanically into files that each pay heavy environment/setup costs, or combining unrelated tests so every small change reruns a large file.

**Cost:** One extreme increases discovery and worker overhead; the other reduces selective rerun precision and parallel scheduling.

**Prefer:** Group by meaningful fixture and isolation boundaries, then measure. File count alone is not an optimization target.

### Maximum parallelism assumed fastest

**Bad practice:** Using every CPU by default for suites constrained by memory, databases, filesystem I/O, ports, or external services.

**Cost:** More workers increase startup, memory, garbage collection, and resource contention.

**Prefer:** Benchmark worker and file-parallelism settings on representative local and CI machines. Isolate resources or serialize only affected projects/tests. More workers can help independent CPU-bound work and hurt constrained integration work.

### Isolation disabled only for speed

**Bad practice:** Turning off per-file isolation without testing shared module, global, DOM, and mock state.

**Cost:** Fast runs can become order-dependent and produce false results.

**Prefer:** Keep isolation by default. If environment/import/worker timing dominates, evaluate non-isolated files or projects with randomized ordering and repeated focused checks. Restore every shared mutation. In Vitest, use its diagnostic tooling rather than assuming the suite is safe.

### Pool selected by folklore

**Bad practice:** Declaring threads, forks, or VM workers universally faster.

**Cost:** Compatibility, native dependencies, memory behavior, environment startup, and module graphs differ.

**Prefer:** Benchmark supported pools. Vitest documents forks as compatibility-oriented, threads as potentially faster in larger projects, and VM threads as a tradeoff for environment isolation with cross-realm and memory caveats.

### Whole-module resets and excessive auto-cleanup

**Bad practice:** Reloading the module graph or performing every clear/reset/restore action around every test regardless of need.

**Cost:** Re-evaluation and bookkeeping add repeated work.

**Prefer:** Preserve required isolation with the least expensive correct lifecycle. Do not remove cleanup to improve a benchmark; narrow it to the state the test actually owns.

### Coverage on every feedback run

**Bad practice:** Instrumenting and reporting coverage during every local test invocation.

**Cost:** Instrumentation, source maps, collection, and report I/O slow feedback.

**Prefer:** Keep a fast ordinary test command and a separately enforced coverage command or CI job. Exclude generated output and dependencies according to the repository contract, not to inflate percentages.

### Type-checking strategy conflated with runtime testing

**Bad practice:** Re-running a cold full-project type check inside every focused runtime test, or skipping type checking entirely for speed.

**Cost:** The first wastes the distinct feedback loops; the second allows static contract failures through.

**Prefer:** Enforce both checks with suitable cadence. Use TypeScript incremental or build-mode caching where repository and CI cache policy support it. Treat `skipLibCheck` as an explicit correctness/performance tradeoff: it can hide declaration conflicts and does not speed runtime tests.

### Cache claims without cold/warm distinction

**Bad practice:** Reporting a cached watch rerun as CI performance or persisting caches without measuring hit value and invalidation cost.

**Cost:** Results do not predict the target workflow; stale or low-value caches add complexity.

**Prefer:** Measure cold and warm workflows separately. Persist transform or compile caches only when their directories survive between comparable runs and invalidation remains correct.

### Coverage or profiling results treated as ordinary timing

**Bad practice:** Comparing instrumented/profiled runs directly with normal runs.

**Cost:** Instrumentation changes execution and can disable caches or alter optimization.

**Prefer:** Use profiles to locate work, then validate performance with the ordinary command and controlled inputs.

### Sharding before removing serial bottlenecks

**Bad practice:** Adding CI shards while global setup, one oversized file, shared services, or artifact merging dominates time.

**Cost:** Machines multiply without reducing the critical path.

**Prefer:** Inspect file timing and setup first. Shard independent test files when work is large enough to amortize machine startup and report merging.

## Performance investigation checklist

1. Reproduce with a committed command and representative subset.
2. Record cold and warm baselines separately.
3. Identify whether environment, transform, import, setup, worker, test body, I/O, or coverage dominates.
4. Check the slowest files and any oversized fixture or module graph.
5. Vary one setting at a time: environment scope, imports, setup scope, worker count, pool, isolation, or cache.
6. Confirm correctness under alternate order and parallelism after weakening isolation or sharing setup.
7. Validate the improvement with the normal command, not only a profiler.
8. Keep the change only when the target workflow improves without hiding failures or reducing required coverage.

## Sources

### Runner and language documentation

1. Jest, asynchronous testing: https://jestjs.io/docs/asynchronous
2. Jest, timer mocks: https://jestjs.io/docs/timer-mocks
3. Jest, mock function API: https://jestjs.io/docs/mock-function-api
4. Jest, ECMAScript modules: https://jestjs.io/docs/ecmascript-modules
5. Jest, CLI (`--detectOpenHandles` and `--forceExit`): https://jestjs.io/docs/cli
6. Vitest, mocking: https://vitest.dev/guide/mocking
7. Vitest, module mocking: https://vitest.dev/guide/mocking/modules
8. Vitest, timers: https://vitest.dev/guide/mocking/timers
9. Vitest, type testing: https://vitest.dev/guide/testing-types
10. Vitest, test environments: https://vitest.dev/guide/environment
11. Vitest, improving performance: https://vitest.dev/guide/improving-performance
12. Vitest, coverage: https://vitest.dev/guide/coverage
13. TypeScript, type assertions: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#type-assertions
14. TypeScript, `satisfies`: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html
15. TypeScript, incremental builds: https://www.typescriptlang.org/tsconfig/incremental.html
16. TypeScript, `skipLibCheck`: https://www.typescriptlang.org/tsconfig/skipLibCheck.html
17. Node.js test runner execution model: https://nodejs.org/api/test.html
18. Node.js CPU profiling options: https://nodejs.org/api/cli.html#--cpu-prof

### DOM testing

19. Testing Library, guiding principles: https://testing-library.com/docs/guiding-principles/
20. Testing Library, query priority: https://testing-library.com/docs/queries/about/#priority
21. Testing Library, async methods: https://testing-library.com/docs/dom-testing-library/api-async/

## Version-sensitive decisions

Recheck these before applying the guide to a repository:

- whether the runner type-checks or only transforms TypeScript;
- ESM versus CommonJS mode and mock-hoisting behavior;
- automatic DOM, mock, environment, and global cleanup;
- fake-timer APIs and which queues they control;
- available worker pools, isolation modes, diagnostics, and cache options;
- DOM emulator fidelity for the APIs under test;
- coverage provider, exclusions, and required gates.

## KISS recommendation

Inspect the installed runner, module mode, environment, and package scripts before applying this guidance. Prefer the smallest correction that improves meaningful regression protection or developer feedback time.

## Related notes

- [PRD: Pi test-suite value review](PRD.md)
- [General testing code smells](general-testing-code-smells.md)
- [Agentic test-review research](agentic-test-review-research.md)

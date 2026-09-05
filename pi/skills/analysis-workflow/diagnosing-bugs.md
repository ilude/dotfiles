# Diagnosing Bugs

Use this process when a failure is hard to reproduce, recurring, nondeterministic, performance-related, or likely to require instrumentation. Adapt it to the available boundary rather than forcing a test harness that cannot represent the failure.

Executable reproductions and diagnostic experiments follow the active validation policy. If selecting the mechanism requires an early experiment, surface that need before implementation and obtain the bounded early-check decision. Otherwise use read-only evidence and defer executable checks to the permitted phase; report any unresolved causal uncertainty rather than treating inspection as runtime proof.

## Establish the signal

Find the smallest repeatable check that exercises the reported path and detects the exact symptom. Prefer, as appropriate:

- A focused test at the real seam.
- A CLI command with fixed input.
- An HTTP request against the affected service.
- A captured request or event replay.
- A small service harness.
- A differential comparison between working and failing states.
- An automated bisection check.

Run the check before expanding the investigation. Make it faster and more deterministic when practical. For an intermittent failure, increase the reproduction rate through repetition, controlled concurrency, fixed randomness, or narrowed timing instead of claiming determinism.

If no automated loop can represent the failure, use the strongest available direct evidence, such as redacted logs, state inspection, a captured artifact, or a controlled live check, and report the limitation.

## Minimize

Once the signal reproduces the failure, remove input, configuration, services, data, callers, and steps one factor at a time. Rerun after each removal. Stop when further reduction changes the symptom or removes a condition the real failure requires.

## Distinguish causes

When evidence does not already isolate the cause:

1. State the plausible explanations that would change the fix.
2. Give each a prediction that could disprove it.
3. Run the cheapest probe that distinguishes the leading explanations.
4. Change one relevant variable per probe.

Do not manufacture a fixed number of hypotheses or pause for approval before a cheap non-mutating probe. Ask the user when their domain knowledge or a consequential choice could materially change the investigation.

## Instrument and measure

Prefer debugger or direct state inspection over broad logging. Add targeted instrumentation only at boundaries that distinguish hypotheses. Mark temporary output with one unique token such as `[DEBUG-a4f2]` so cleanup can be verified with one search.

For performance regressions, establish a repeatable baseline before changing code. Use timings, profiles, query plans, or bisection rather than adding general logs.

Keep credentials in environment variables. Redact secrets, authorization headers, personal data, and unrelated payload content from commands, output, traces, and saved artifacts. Quote only the evidence needed for the diagnosis.

## Fix and finish

Use the minimized reproducer as a regression test only when it exercises the correct seam. If no correct seam exists, report that architectural or environmental gap rather than adding a shallow test.

After the fix:

1. Run the focused regression check.
2. Run the original reproducer with its material conditions restored.
3. Confirm the user's exact symptom is gone.
4. Search for and remove temporary instrumentation.
5. Report the cause, evidence, fix, validation, and any remaining uncertainty.

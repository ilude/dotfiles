# Quality Gates and Repair

- Ownership: Pi runtime validation is configured by `pi/quality-gates.json` and implemented by `pi/extensions/quality-gates.ts`. Other clients may use independent policies; their behavior is not the Pi contract.
- Collection: track files changed successfully through supported mutation tools and validate at agent settlement. Validate only files that still exist and remain changed, except files outside a Git repository where Git state is unavailable.
- Selection: choose language and validators from configured extensions, project markers, scope, and detection rules. Automatic settlement skips validators marked explicit-only, unavailable, long-running, or otherwise ineligible.
- Execution: invoke validator commands without shell interpolation, bound their output, and classify pass, failure, unavailable, skipped, advisory, and duration mechanically.
- Paths: exclude configured generated, dependency, vendor, build, and immutable paths before validation or repair. Configuration is authoritative; do not infer additional exclusions.
- Deterministic repair: only a configured fix command may run automatically after its validator fails. Re-run the validator and report only what remains.
- Report-only settlement: surviving blocking failures are reported without triggering another turn or spawning a delegated model.
- Mutation opt-out: the Git attribute `quality-autofix=off` disables deterministic autofix for matching files while retaining report-only diagnostics.
- Evidence reuse: reuse unchanged validation evidence and replay prior failures where supported. Do not treat duplicate output as a fresh check.
- Reporting: report surviving blocking failures without fabricating success. Advisory findings remain nonblocking. Missing tools are unavailable evidence, not proof that the target passed.

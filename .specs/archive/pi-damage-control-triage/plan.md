# Pi Damage Control: Scoped Delete and Shadow Judge

Status: complete and archived.

## Outcome

Pi damage control now has a deterministic scoped-delete allow tier and an optional shadow judge. The implementation remains Pi-native and uses `pi/damage-control-rules.yaml` with `PI_DAMAGE_CONTROL_POLICY_PATH`; it has no dependency on Claude policy files.

The scoped-delete tier auto-allows an ask-tier `rm` command only when every statically extracted target is contained under the session cwd or an approved scratch root. It fails closed on unsupported shell syntax, parent traversal, dynamic expansion, non-scratch absolute paths, protected floors, configured no-delete paths, remote SSH payloads, and existing symlink target prefixes.

Auto-allowed decisions are recorded as `auto_allowed` events with `tier=scoped_delete`. Replay rejects redacted, truncated, lossy, and legacy events without explicit completeness metadata as unparseable.

The shadow judge is disabled by default. When enabled, it receives only bounded, sanitized command context, records telemetry asynchronously, and has no authority over execution. Credential options and all explicit HTTP header values are redacted before judging.

Biome is configured as an actionable lint gate rather than a formatting gate. TypeScript and JavaScript Lizard findings remain advisory because parser spans can be misleading.

## Main implementation paths

- `pi/extensions/damage-control-engine.ts`
- `pi/extensions/damage-control.ts`
- `pi/lib/damage-control-eval.ts`
- `pi/lib/damage-control-judge.ts`
- `pi/scripts/damage-control-replay.mjs`
- `pi/tests/damage-control-scoped-delete.test.ts`
- `pi/tests/damage-control-judge.test.ts`
- `pi/tests/damage-control-replay.test.ts`
- `pi/tests/damage-control-shadow-judge-extension.test.ts`

## Decisions retained

- Shadow judge verdicts are telemetry only.
- Secret and exfiltration rules are outside the allow tier.
- Remote SSH deletes continue to ask.
- Existing symlink target prefixes continue to ask; relative globs are checked by their static prefix.
- Missing replay completeness metadata fails closed.
- Future judge authority requires a separate decision after at least 100 shadow events, at least 95 percent agreement on approvals, and zero judge-allows on danger-shaped denials.

## Verification

- Focused damage-control, judge, replay, and quality-gate tests: 181 passed.
- Full pre-integration Pi suite: 102 files passed, 1,454 tests passed, 1 skipped.
- Post-integration typecheck: passed.
- Post-integration Biome lint: 239 files checked with no findings.
- Two unrelated process-heavy tests timed out under concurrent full-suite load after integration; both passed when rerun in isolation.
- Native historical replay found 9 interactive rm-family events and classified all 9 as unparseable because legacy events lack explicit completeness metadata. No denied event was auto-allowed.

A live interactive smoke test was not run. Automated extension tests cover the no-confirm auto-allow path, retained confirmation path, telemetry, judge-disabled behavior, sanitization, and reporting.

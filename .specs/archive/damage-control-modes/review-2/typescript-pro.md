# Pi TypeScript Extension API / Runtime-State Review

## Finding 1

**Severity:** high

**Evidence:** The plan uses slash-prefixed command names in the Objective and T3 acceptance text (`/damage-control`, `/dc`) while the Pi API examples and existing extensions register unprefixed names, e.g. `pi.registerCommand("usage", ...)`, `pi.registerCommand("doctor", ...)`, and current damage-control draft uses `registerCommand("damage-control", ...)`. If an executor follows the “command names are exact” wording literally, the command registry can compile but expose commands as `//damage-control`-style or fail lookup depending on runtime normalization.

**Required fix:** Make the plan explicit that `registerCommand` must be called with unprefixed names `"damage-control"` and `"dc"`, while user-facing invocation remains `/damage-control` and `/dc`. Update T3 acceptance criteria/tests to assert the unprefixed registered names.

## Finding 2

**Severity:** high

**Evidence:** The plan requires mode state to move into the extension registration closure, but it does not require the related status/health state to be isolated. Current `damage-control.ts` has module-level `lastDamageControlHealth` and module-level helpers (`formatDamageControlStatus`, `damageControlStatusMessage`) reading module state. Under repeated registrations, instance B can overwrite module health/status state while instance A's command handlers still exist, producing cross-instance status/runtime mismatches even if `activeDamageControlMode` is closure-local.

**Required fix:** Expand T3 to require all registration-local runtime state used by command/tool handlers—mode, loaded health, rules, and status formatting inputs—to be captured in the `export default function (pi)` closure or a per-registration state object. Add a repeated-registration test where A and B have independently observable status/health/mode after B registers.

## Finding 3

**Severity:** medium

**Evidence:** The Objective requires “Mode transitions are recorded through existing permission/metrics/status mechanisms or an equivalent session-visible audit record with previous mode, new mode, and command alias used.” T3 acceptance only checks UI status/notify behavior and mode effects; it does not require asserting previous mode, new mode, or alias in a durable audit/metrics record. This can compile and pass handler tests while silently losing the requested audit trail.

**Required fix:** Add an acceptance criterion and tests that changing mode records an audit/metrics/status event containing `{ previousMode, newMode, alias }` for both `damage-control` and `dc`, and invalid/extra-arg invocations emit no transition record.

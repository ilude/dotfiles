# Completeness/Explicitness Review

## Findings

1. severity: medium
   evidence: T4 requires pausing for a user decision when no durable local hook exists, but T4 is listed as a normal Wave 2 dependency alongside T3 and V2, and the dependency graph still proceeds through V2/T5/V3 without an explicit branch for `best-effort-only-awaiting-user-approval`.
   required_fix: Add an explicit conditional branch after T1/V1: if `forward-logging-local-hook: no`, stop and obtain/record user approval before scheduling T4/V2, or mark T4 blocked and define the exact reduced-scope path.

2. severity: medium
   evidence: The plan says structured events should be emitted with `customType`, but it does not specify the exact event discriminator value, JSON field nesting, or how `/skill-stats` identifies its own schema versus other custom messages.
   required_fix: Define the exact structured event shape, including `customType` value, payload key, required fields, versioning if any, and invalid/unknown handling.

3. severity: low
   evidence: Success criteria require the report to include “session path,” while constraints require avoiding private absolute paths beyond the root label; the output contract does not state the redacted path format.
   required_fix: Specify the exact safe session-path display format, such as `~/.pi/agent/sessions` or `<pi-sessions-root>`, and forbid absolute home-path emission in reports/evidence.

4. severity: low
   evidence: T3 says parse rolling windows and T2 says default `1/7/30`, optional `60`, `90`, `all`, but command argument syntax and invalid argument behavior are not defined.
   required_fix: Add explicit `/skill-stats` usage syntax, accepted arguments, defaults, ordering, and error/help behavior for invalid windows.

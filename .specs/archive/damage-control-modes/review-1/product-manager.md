# Product Manager Review

## Finding 1
severity: high
evidence: The objective is a `/damage-control` mode toggle, but T1 requires schema changes, tool-targeted rule parsing, and six new PowerShell dangerous-command rules in `pi/damage-control-rules.yaml`. This is independent policy expansion, not necessary to switch between `default`, `whitelist`, and `noshell`.
required_fix: Split PowerShell dangerous-rule expansion into a separate follow-up, or explicitly justify why the toggle cannot ship without it. Keep this plan to mode state, command registration, and shell blocking behavior.

## Finding 2
severity: high
evidence: The plan defines whitelist behavior by creating new hard-coded allowlists and compound-operator parsing (`git`, `pnpm`, `uv`, `Get-Location`, etc.). The requested feature is a mode toggle, not a full safe-command taxonomy. This risks endless bikeshedding and false blocks.
required_fix: Make whitelist v1 minimal: default-deny shell except a tiny documented health/status/test set, or load allowlist from existing rules/config. Defer broad command taxonomy to a separate policy-design spec.

## Finding 3
severity: medium
evidence: The plan requires `make check` and archived evidence files for a local extension toggle. It even allows unrelated repo-wide failures to be documented away, which weakens the gate while adding ceremony.
required_fix: Use focused Vitest plus Pi extension typecheck as required validation. Make repo-wide `make check` optional/best-effort unless this change touches shared repo infrastructure.

## Finding 4
severity: medium
evidence: T3 says empty args or `status` report “health/mode/core-always-on,” but acceptance criteria only verify mode string and UI calls. There is no acceptance criterion for rule-load health failure behavior or status output format.
required_fix: Add one precise status acceptance criterion covering loaded/unloaded health and the exact minimal user-facing fields, or remove health reporting from scope.

## Finding 5
severity: low
evidence: T3 and T4 are split but both modify `pi/extensions/damage-control.ts` and `pi/tests/damage-control.test.ts`; the dependency graph pretends they can run in parallel after V1. That invites merge churn for a small feature.
required_fix: Collapse Wave 2 into one integration task, or serialize command registration before handler wiring with explicit non-overlapping file ownership.

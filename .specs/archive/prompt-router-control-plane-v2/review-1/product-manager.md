# Product Manager Review

## Finding 1
severity: high
evidence: The plan schedules eight implementation tasks across TS, Python, eval data, telemetry, rollback, archive controls, manual validation, and repo-wide validation before any user-facing slice ships. Several acceptance areas (context capsule, override hierarchy, hash parity, rollback) are independent of the awaited provider seam objective.
required_fix: Split V2 into a minimal same-turn control-plane MVP: canonical routes, settings validation, resolver truth, and status/explain. Move context capsule, eval unification, rollback, and telemetry hardening to follow-up specs with separate go/no-go criteria.

## Finding 2
severity: high
evidence: T7 defines many metrics (cost-weighted quality, route thrash, policy delta, sequence aggregation, thresholds) without stating which release decision each metric gates. This turns eval into a platform project, not cleanup.
required_fix: Replace T7 with one automated parity check that runtime settings can classify a small fixed fixture set and fail closed on invalid mode/hash mismatch. Defer advanced metrics until there is an explicit product decision they unblock.

## Finding 3
severity: medium
evidence: The plan repeats evidence capture as manual markdown files for every wave (`classifier-mode.md`, `status-explain-schema.md`, `context-override-matrix.md`, etc.). This creates process burden and inconsistent artifacts.
required_fix: Add a single scripted evidence collector that runs the required commands, writes sanitized stdout/stderr plus exit codes to a timestamped evidence directory, and emits a summary index. Keep manual notes only for truly interactive validation.

## Finding 4
severity: medium
evidence: T1 creates a new canonical route module plus legacy adapter, while existing provider spike code already contains `RouteDecision`, candidate handling, and same-turn trace vocabulary. The plan does not require inventorying existing constants before adding another abstraction.
required_fix: Add an explicit reuse gate before T1: grep/list current route/model labels and update or consolidate existing definitions in place. Only create a new module if duplicate definitions cannot be collapsed cleanly.

## Finding 5
severity: medium
evidence: T5/T6 combine semantic continuation detection, anti-downgrade, cheap/brief bypasses, override hierarchy, context-window safety, and status visibility. That is multiple policy engines in one wave and will be hard to debug if routing changes unexpectedly.
required_fix: Reduce first implementation to explicit user controls only: model selection, route pin, per-turn override, and fail-closed safety. Defer heuristic continuation/anti-downgrade until telemetry shows real misroutes that explicit controls cannot solve.

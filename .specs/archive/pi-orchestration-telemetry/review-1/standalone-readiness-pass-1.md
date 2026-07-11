# Review: Pi Orchestration Telemetry

## Issues Requiring Fixes

- **Blocker -- rollback:** `.specs/pi-orchestration-telemetry/plan.md` and execution evidence are not included in the baseline, although `/do-it` mutates them. Rollback cannot restore the documented pre-state.
- **Blocker -- live smoke isolation:** `${episode_id}` is never initialized, and the smoke directory is not cleared. Append-only stale metrics can invalidate the “exactly one” event assertion.
- **Blocker -- archive gate:** The preflight checks only two nonempty captures, `git diff --check`, and a narrow secret regex. It does not verify execution events, checklist evidence, smoke joins/counts, isolation, or rollback evidence.
- **Hardening -- telemetry purge:** Non-scratch metric cleanup is described but lacks an executable command, event-selection rule, and verification.

## Overall: STANDALONE BLOCKED
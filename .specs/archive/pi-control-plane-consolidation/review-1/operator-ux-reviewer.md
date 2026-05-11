- severity: high
  evidence: T4 removes `/team` and T13 only says docs no longer advertise it; no checklist item requires a deprecation alias, transitional error, or migration copy for users with `/team` muscle memory.
  required_fix: Add an implementation/validation task requiring `/team` to return an explicit deprecation message for at least one release, with replacement examples like `subagent <lead/team>` and tests for the exact message.

- severity: high
  evidence: T11 changes `/tasks` behavior extensively but does not require backwards-compatibility checks for existing `/tasks` output, default filters, or common invocations beyond the new MVP list.
  required_fix: Add migration tests/evidence for current `/tasks` defaults and existing flags/aliases, documenting preserved behavior or exact changed behavior with user-facing help text.

- severity: medium
  evidence: T6 says too-simple work can be declined with routing advice, but no status/help acceptance criteria define what operators see when dispatch is declined or ambiguous.
  required_fix: Specify and test actionable fallback messages for declined/ambiguous subagent routing, including available teams/leads and one valid example command.

- severity: medium
  evidence: F1 only covers `/branch` live/manual validation; there is no manual operator validation for `/tasks help`, `/tasks settings`, hidden mode recovery, or `/team` migration messaging.
  required_fix: Add manual validation steps covering command discoverability and recovery: `/tasks help`, settings mode changes, hidden-to-visible recovery, `/team` deprecation response, and subagent team/lead discovery.

- severity: medium
  evidence: T13 requires docs remove `/team` references and document `/branch`/`/tasks`, but does not require slash-command help/status output to be updated alongside docs.
  required_fix: Add acceptance criteria that in-product command help/status output lists supported commands, marks `/team` deprecated/removed with migration guidance, and documents `/branch` fallback/manual behavior.
